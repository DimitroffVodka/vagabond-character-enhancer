/**
 * Animate spell adapter — brings an Object to life as a companion.
 *
 * Per Core Rulebook 05_Magic/02 Spell List (Animate):
 *   - Cost: free cast + Focus to maintain
 *   - Duration: as long as you Focus
 *   - Target: 1 Item (≤1 inventory Slot)
 *   - Stats: Object rules — Armor 0, HP per Object rules (p.12)
 *   - Termination: drop Focus, or object destroyed (0 HP)
 *   - Special: obeys commands while Focusing; weapon attacks use Cast Skill
 *
 * This adapter differs from Beast/Raise: there's no NPC pool to pick from.
 * Instead, we open an inventory-item picker on the caster. For each pick,
 * we create a synthetic NPC world actor with Object stats and one attack
 * action derived from the item. That world actor is then spawned via
 * CompanionSpawner like any other companion.
 *
 * Cleanup on dismiss deletes the synthetic actor (flagged `synthetic: true`
 * in companionMeta.meta so the dismiss handler knows to delete it).
 */

import { MODULE_ID, log } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { CompanionSpawner } from "../companion/companion-spawner.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";

const FOCUS_KEY = "spell_animate";
const SOURCE_ID = "spell-animate";

export const AnimateSpell = {
  init() {
    Hooks.on("createChatMessage", (msg) => this._onChatMessage(msg));
    // Snapshot old focus.spellIds BEFORE the update lands so we can reliably
    // detect add vs remove. Mirrors the Beast/Raise pattern.
    Hooks.on("preUpdateActor", (actor, changes, options) => {
      if (actor.type !== "character") return;
      if (foundry.utils.getProperty(changes, "system.focus.spellIds") === undefined) return;
      options._vceAnimateOldFocusIds = [...(actor.system?.focus?.spellIds ?? [])];
    });
    Hooks.on("updateActor", (actor, changes, options) => this._onFocusToggle(actor, changes, options));
    this._registerDismissHandler();
    log("AnimateSpell", "Animate spell adapter registered.");
  },

  /**
   * Unified focus check — either the system focus list has Animate OR the
   * VCE featureFocus slot is held. Mirrors Beast/Raise patterns. Animate
   * has no per-round mana drain (rulebook: free cost), so this check is
   * only used for triggering and drop-focus detection.
   */
  _isFocusingAnimate(actor) {
    const animateSpell = actor.items.find(i => i.type === "spell" && i.name.toLowerCase() === "animate");
    if (animateSpell) {
      const spellIds = actor.system?.focus?.spellIds ?? [];
      if (spellIds.includes(animateSpell.id)) return true;
    }
    const ff = actor.getFlag(MODULE_ID, "featureFocus") ?? [];
    if (ff.some(f => f.key === FOCUS_KEY)) return true;
    return false;
  },

  async _onFocusToggle(actor, changes, options) {
    if (actor.type !== "character") return;
    if (!actor.isOwner) return;
    const newSpellIds = foundry.utils.getProperty(changes, "system.focus.spellIds");
    if (!Array.isArray(newSpellIds)) return;

    const animateSpell = actor.items.find(i => i.type === "spell" && i.name.toLowerCase() === "animate");
    if (!animateSpell) return;

    const oldSpellIds = options?._vceAnimateOldFocusIds ?? [];
    const wasActive = oldSpellIds.includes(animateSpell.id);
    const nowActive = newSpellIds.includes(animateSpell.id);

    // ADD — click "Focus this spell" → open picker, animate object
    if (!wasActive && nowActive) {
      if (this._handlingTrigger?.has(actor.id)) return;
      (this._handlingTrigger ??= new Set()).add(actor.id);
      try {
        await this.trigger(actor);
      } finally {
        this._handlingTrigger.delete(actor.id);
      }
      return;
    }

    // REMOVE — player dropped focus on the spell card → dismiss the object
    if (wasActive && !nowActive) {
      if (this._handlingTrigger?.has(actor.id)) return;
      const active = CompanionSpawner.getCompanionsFor(actor).filter(c => c.sourceId === SOURCE_ID);
      if (!active.length) return;
      for (const c of active) {
        await CompanionSpawner.dismiss(c.actor, { reason: "focus-dropped" });
      }
      // Dismiss handler releases the VCE focus slot; nothing else to do
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <strong>${actor.name}</strong> drops Focus on <strong>Animate</strong>;
              the animated object falls inert.
            </div>
          </section></div>
        </div>`,
      });
    }
  },

  _registerDismissHandler() {
    CompanionSpawner.registerDismissHandler(SOURCE_ID, async (companionActor, { controller, meta }) => {
      if (!controller) return;
      // Release the VCE focus slot
      try { await FocusManager.releaseFeatureFocus(controller, FOCUS_KEY); }
      catch (e) { log("AnimateSpell", `Could not release focus: ${e.message}`); }
      // Also remove Animate from the system's focus list so the spell card
      // reflects the drop state. Re-entry guarded so our own drop-focus-
      // detection hook doesn't recurse.
      const animateSpell = controller.items.find(i => i.type === "spell" && i.name.toLowerCase() === "animate");
      if (animateSpell) {
        const ids = controller.system?.focus?.spellIds ?? [];
        if (ids.includes(animateSpell.id)) {
          (this._handlingTrigger ??= new Set()).add(controller.id);
          try {
            await controller.update({ "system.focus.spellIds": ids.filter(id => id !== animateSpell.id) });
          } finally {
            this._handlingTrigger.delete(controller.id);
          }
        }
      }
      // Delete the synthetic NPC actor we created for this spawn
      if (meta?.meta?.synthetic && companionActor?.id) {
        try { await gmRequest("deleteActor", { actorId: companionActor.id }); }
        catch (e) { log("AnimateSpell", `Could not delete synthetic actor: ${e.message}`); }
      }
    });
  },

  async _onChatMessage(message) {
    const itemId = message.flags?.vagabond?.itemId;
    if (!itemId) return;
    const casterId = message.speaker?.actor;
    const caster = casterId ? game.actors.get(casterId) : null;
    if (!caster || caster.type !== "character") return;

    const item = caster.items.get(itemId);
    if (!item || item.type !== "spell") return;
    if (item.name.toLowerCase() !== "animate") return;

    if (!caster.isOwner) return;

    if (message.getFlag(MODULE_ID, "animateSpellHandled")) return;
    try { await message.setFlag(MODULE_ID, "animateSpellHandled", true); }
    catch { /* non-fatal */ }

    await this.trigger(caster);
  },

  /**
   * Public entry point — called from the Companions tab action bar as well
   * as from the createChatMessage hook.
   * @param {Actor} caster
   */
  async trigger(caster) {
    await this._animateObject(caster);
  },

  async _animateObject(caster) {
    // Only one animated object at a time (Animate targets "1 Item")
    const existing = CompanionSpawner.getCompanionsFor(caster).filter(c => c.sourceId === SOURCE_ID);
    if (existing.length) {
      ui.notifications.warn(`You already have an Animated Object. Drop Focus to release it before animating another.`);
      return;
    }

    const item = await this._pickInventoryItem(caster);
    if (!item) return; // user cancelled

    // Build a synthetic "Animated {item.name}" NPC on the world actor list.
    // HP: 3 per HD by Object rules approximation (HD defaults to 1 for ≤1-slot).
    // Armor: 0 per rules (rulebook: "Armor 0").
    // beingType: Vagabond's data model doesn't expose "Object" as a choice
    //   (allowed set is Humanlike/Fae/Cryptid/Artificials/Beasts/Outers/
    //   Primordials/Undead). "Artificials" is the closest mechanical fit
    //   — a constructed, non-living entity — so we map Object→Artificials.
    const hd = 1;
    const hp = hd * 3;
    const { formula: rollDamage, type: damageType } = this._getItemDamage(item);
    const isWeapon = item.type === "equipment" && item.system?.equipmentType === "weapon";
    const attackName = isWeapon ? item.name : "Slam";
    const attackType = isWeapon && item.system?.range && item.system.range !== "close"
      ? "ranged"
      : "melee";
    const img = item.img || "icons/svg/mystery-man.svg";

    const npcData = {
      name: `Animated ${item.name}`,
      type: "npc",
      img,
      system: {
        hd,
        health: { value: hp, max: hp },
        armor: 0,              // NPC schema: plain integer, not {value}
        speed: 30,
        size: "small",
        beingType: "Artificials",
        senses: "",
        actions: [{
          name: attackName,
          attackType,
          rollDamage,
          damageType,
          note: "Uses caster's Cast Skill (routed via VCE)",
        }],
      },
      prototypeToken: {
        name: `Animated ${item.name}`,
        texture: { src: img },
        width: 1,
        height: 1,
        disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        actorLink: false,
      },
    };

    // Create the synthetic world actor via GM proxy
    let actorId;
    try {
      const result = await gmRequest("createActor", { actorData: npcData });
      if (result?.error) throw new Error(result.error);
      actorId = result.actorId;
    } catch (e) {
      ui.notifications.error(`Could not create animated object: ${e.message}`);
      return;
    }
    if (!actorId) {
      ui.notifications.error("Could not create animated object actor.");
      return;
    }

    // Spawn the synthetic NPC as a companion
    const creatureUuid = `Actor.${actorId}`;
    const result = await CompanionSpawner.spawn({
      caster,
      sourceId: SOURCE_ID,
      creatureUuid,
      tokenData: {
        name: npcData.name,
        texture: { src: npcData.img },
        width: 1,
        height: 1,
        disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      },
      meta: { synthetic: true, sourceItemId: item.id, sourceItemName: item.name },
      suppressChat: false,
    });

    if (!result.success) {
      // Clean up the synthetic actor on failure
      try { await gmRequest("deleteActor", { actorId }); } catch { /* best effort */ }
      ui.notifications.error(`Could not animate object: ${result.error ?? "unknown error"}`);
      return;
    }

    // Acquire focus
    try {
      await FocusManager.acquireFeatureFocus(
        caster, FOCUS_KEY, `Animated ${item.name}`, npcData.img
      );
    } catch (e) {
      log("AnimateSpell", `Could not acquire focus: ${e.message}`);
    }
  },

  /**
   * Resolve the damage formula + type for an inventory item.
   *
   * Vagabond item schema:
   *   - Weapons: `equipmentType === "weapon"`, damage lives in
   *     `damageOneHand` / `damageTwoHands` (e.g. "d6", "d8", "1d6+1"),
   *     damage type in `damageTypeOneHand` / `damageTypeTwoHands`.
   *     Which grip is "active" depends on `equipmentState`
   *     ("oneHand" | "twoHands" | "unequipped"); unequipped weapons
   *     default to 1H stats.
   *   - Non-weapon equipment: generic `damageAmount` + `damageType`.
   *   - Formulas may be written as bare "d6" — we normalize to "1d6"
   *     so Foundry's Roll parser accepts them.
   *   - Unarmed/"Slam" default: 1d4 typeless.
   *
   * @param {Item} item
   * @returns {{formula: string, type: string}}
   */
  _getItemDamage(item) {
    const sys = item?.system ?? {};
    const normalize = (f) => {
      if (!f || typeof f !== "string") return null;
      const trimmed = f.trim();
      if (!trimmed) return null;
      return /^d\d+/i.test(trimmed) ? `1${trimmed}` : trimmed;
    };
    const isWeapon = item.type === "equipment" && sys.equipmentType === "weapon";
    if (isWeapon) {
      const preferTwoHands = sys.equipmentState === "twoHands";
      const formula =
        normalize(preferTwoHands ? sys.damageTwoHands : sys.damageOneHand) ||
        normalize(sys.damageOneHand) ||
        normalize(sys.damageTwoHands) ||
        "1d4";
      const type =
        (preferTwoHands ? sys.damageTypeTwoHands : sys.damageTypeOneHand) ||
        sys.damageTypeOneHand ||
        sys.damageType ||
        "-";
      return { formula, type };
    }
    const formula = normalize(sys.damageAmount) || "1d4";
    return { formula, type: sys.damageType || "-" };
  },

  /**
   * Open a picker showing the caster's inventory items that fit in ≤1 slot.
   */
  async _pickInventoryItem(caster) {
    // Collect eligible items — any equipment item with slots ≤ 1 (or undefined slots).
    const items = caster.items.filter(i => {
      if (!["equipment", "weapon", "item"].includes(i.type)) return false;
      const slots = Number(i.system?.slots ?? i.system?.slot ?? 1) || 1;
      return slots <= 1;
    });

    if (!items.length) {
      ui.notifications.warn("No eligible items (need an item of 1 Slot or less).");
      return null;
    }

    return new Promise((resolve) => {
      // Track picked item separately so the `close` callback (which fires
      // synchronously inside d.close()) doesn't race ahead and resolve(null)
      // before we've had a chance to pass the user's pick. Whatever `picked`
      // is at close time wins — undefined/null = cancel, item = selection.
      let picked = null;

      const rows = items.map((it) => {
        const { formula, type } = this._getItemDamage(it);
        const dmgText = formula === "1d4" && (type === "-" || !type)
          ? "—" // no listed damage — picker shows em-dash
          : (type && type !== "-" ? `${formula} ${type}` : formula);
        return `
        <tr class="vce-animate-row" data-item-id="${it.id}" role="button" tabindex="0">
          <td class="vce-bd-cell vce-bd-cell-img">
            <img src="${it.img || "icons/svg/mystery-man.svg"}" class="vce-bd-beast-img" alt="" />
          </td>
          <td class="vce-bd-cell"><strong>${it.name}</strong></td>
          <td class="vce-bd-cell vce-bd-cell-center">${it.system?.slots ?? it.system?.slot ?? 1}</td>
          <td class="vce-bd-cell">${dmgText}</td>
        </tr>`;
      }).join("");

      const content = `
        <p>Pick an item from your inventory to animate. Must fit in ≤1 Slot.
        Non-weapons default to a 1d4 Slam.</p>
        <div class="vce-bd-scroll" style="max-height:400px; overflow-y:auto;">
          <table class="vce-bd-table" role="grid">
            <thead>
              <tr class="vce-bd-header-row">
                <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
                <th class="vce-bd-th" scope="col">Item</th>
                <th class="vce-bd-th vce-bd-th-center" scope="col">Slots</th>
                <th class="vce-bd-th" scope="col">Damage</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      const d = new Dialog({
        title: `${caster.name} — Animate Object`,
        content,
        buttons: {
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => { picked = null; } }
        },
        default: "cancel",
        render: (html) => {
          // Dialog V1 in v13 may pass html as either jQuery or HTMLElement
          // depending on core version. Normalize to a DOM element we can
          // query natively so listeners reliably bind.
          const root = html?.[0] ?? html;
          const bind = (row) => {
            row.addEventListener("click", (ev) => {
              const itemId = ev.currentTarget.dataset.itemId;
              picked = caster.items.get(itemId) || null;
              d.close(); // close callback resolves with whatever `picked` holds
            });
            row.addEventListener("keydown", (ev) => {
              if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.currentTarget.click(); }
            });
          };
          root.querySelectorAll?.(".vce-animate-row").forEach(bind);
        },
        close: () => resolve(picked),
      }, { width: 600, height: 450 });
      d.render(true);
    });
  },
};
