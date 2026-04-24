/**
 * Beast spell adapter — summons beasts within a cumulative HD budget.
 *
 * Per Core Rulebook 05_Magic/02 Spell List (Beast):
 *   - Cost: 1 Mana/Turn (focus upkeep; no upfront)
 *   - Duration: as long as you Focus
 *   - Creature pool: Beast type only (any)
 *   - HD budget: cumulative, ≤ max(1, floor(Level / 2))
 *   - Termination: drop Focus, or creature reaches 0 HP
 *   - Checks: the caster's Cast Skill
 *
 * Detection: createChatMessage hook listens for a spell cast where the
 * spell item's name lowercases to "beast". Pattern mirrors bless-manager.mjs
 * and ward-manager.mjs.
 *
 * Pattern: cumulative — each cast adds one beast up to the remaining budget.
 * CompanionSpawner.spawn is called with allowMultiple: true so the engine
 * doesn't prompt to replace the existing beasts.
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { CompanionSpawner } from "../companion/companion-spawner.mjs";
import { CreaturePicker } from "../companion/creature-picker.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";

const FOCUS_KEY = "spell_beast";
const SOURCE_ID = "spell-beast";

export const BeastSpell = {
  init() {
    Hooks.on("createChatMessage", (msg) => this._onChatMessage(msg));
    // Snapshot old focus.spellIds BEFORE the update lands, so we can reliably
    // detect whether Beast was just added or removed.
    Hooks.on("preUpdateActor", (actor, changes, options) => {
      if (actor.type !== "character") return;
      const touchesFocus = foundry.utils.getProperty(changes, "system.focus.spellIds") !== undefined;
      if (!touchesFocus) return;
      options._vceBeastOldFocusIds = [...(actor.system?.focus?.spellIds ?? [])];
    });
    Hooks.on("updateActor", (actor, changes, options) => this._onFocusToggle(actor, changes, options));
    this._registerDismissHandler();
    this._registerManaDrain();
    log("BeastSpell", "Beast spell adapter registered.");
  },

  /**
   * Detect focus toggles on the Beast spell.
   *   - Added to system.focus.spellIds → trigger summon flow (open picker)
   *   - Removed from system.focus.spellIds → dismiss all active summons
   * Uses the old focus array snapshotted by preUpdateActor.
   */
  async _onFocusToggle(actor, changes, options) {
    if (actor.type !== "character") return;
    if (!actor.isOwner) return;
    const newSpellIds = foundry.utils.getProperty(changes, "system.focus.spellIds");
    if (!Array.isArray(newSpellIds)) return;

    const beastSpell = actor.items.find(i => i.type === "spell" && i.name.toLowerCase() === "beast");
    if (!beastSpell) return;

    const oldSpellIds = options?._vceBeastOldFocusIds ?? [];
    const wasActive = oldSpellIds.includes(beastSpell.id);
    const nowActive = newSpellIds.includes(beastSpell.id);

    // ADDED — Focus just clicked ON
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

    // REMOVED — Focus just clicked OFF
    if (wasActive && !nowActive) {
      const active = CompanionSpawner.getCompanionsFor(actor).filter(c => c.sourceId === SOURCE_ID);
      if (!active.length) return;
      // Dismiss all active beasts. _dropFocusAndDismiss also unsets spellIds
      // defensively, but here the player already did that via the UI.
      for (const c of active) {
        await CompanionSpawner.dismiss(c.actor, { reason: "focus-dropped" });
      }
      try { await FocusManager.releaseFeatureFocus(actor, FOCUS_KEY); }
      catch (e) { log("BeastSpell", `Could not release focus slot: ${e.message}`); }
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <strong>${actor.name}</strong> drops Focus on <strong>Beast</strong>; all summons depart.
            </div>
          </section></div>
        </div>`,
      });
    }
  },

  /**
   * Check whether a PC is currently focused on the Beast spell.
   * Unified check across BOTH focus trackers:
   *   1. System `system.focus.spellIds` — populated by the "Focus this spell"
   *      button on the spell card
   *   2. VCE `featureFocus` flag array — populated by BeastSpell's own focus
   *      acquisition dialog (after casting via the tab button)
   * Either indicates active Focus for upkeep purposes.
   */
  _isFocusingBeast(actor) {
    // System focus
    const beastSpell = actor.items.find(i => i.type === "spell" && i.name.toLowerCase() === "beast");
    if (beastSpell) {
      const spellIds = actor.system?.focus?.spellIds ?? [];
      if (spellIds.includes(beastSpell.id)) return true;
    }
    // VCE focus
    const ff = actor.getFlag(MODULE_ID, "featureFocus") ?? [];
    if (ff.some(f => f.key === FOCUS_KEY)) return true;
    return false;
  },

  /**
   * Drain 1 mana per combat round from any PC currently focused on Beast.
   * If the PC is out of mana, dismiss all their active Beast summons.
   * GM-only listener (multi-client double-drain guard).
   */
  _registerManaDrain() {
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      // Scan ALL character actors, not just combatants — a caster focused on
      // Beast from outside combat (rare, but legal) shouldn't escape upkeep,
      // and hooks fire on every round tick regardless.
      const casters = game.actors.filter(a => a.type === "character" && this._isFocusingBeast(a));

      for (const actor of casters) {
        const mana = Number(actor.system?.mana?.current ?? 0) || 0;
        if (mana < 1) {
          // Insufficient mana — banish every active Beast summon AND clear
          // any system focus tracking so the spell card reflects drop-focus.
          await this._dropFocusAndDismiss(actor, "out-of-mana");
          continue;
        }
        await actor.update({ "system.mana.current": mana - 1 });
        log("BeastSpell", `${actor.name}: 1 Mana drained for Beast focus (${mana} → ${mana - 1})`);
      }
    });
  },

  /**
   * Drop system focus on Beast (remove from spellIds), release the VCE focus
   * slot, and dismiss all active Beast summons. Called when the caster runs
   * out of mana or the player manually un-focuses.
   */
  async _dropFocusAndDismiss(actor, reason) {
    // Remove Beast from system focus list
    const beastSpell = actor.items.find(i => i.type === "spell" && i.name.toLowerCase() === "beast");
    const ids = actor.system?.focus?.spellIds ?? [];
    if (beastSpell && ids.includes(beastSpell.id)) {
      const next = ids.filter(id => id !== beastSpell.id);
      await actor.update({ "system.focus.spellIds": next });
    }
    // Release VCE focus slot (if held)
    try { await FocusManager.releaseFeatureFocus(actor, FOCUS_KEY); }
    catch (e) { log("BeastSpell", `Could not release focus slot: ${e.message}`); }
    // Dismiss every active beast summon
    const active = CompanionSpawner.getCompanionsFor(actor).filter(c => c.sourceId === SOURCE_ID);
    for (const c of active) {
      await CompanionSpawner.dismiss(c.actor, { reason });
    }
    if (active.length) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <strong>${actor.name}</strong>'s Beast summons depart —
              ${reason === "out-of-mana" ? "insufficient Mana to maintain Focus" : "Focus dropped"}.
            </div>
          </section></div>
        </div>`,
      });
    }
  },

  _registerDismissHandler() {
    CompanionSpawner.registerDismissHandler(SOURCE_ID, async (companionActor, { controller, meta }) => {
      if (!controller) return;

      // Release focus only when the LAST beast is dismissed — other beasts of the
      // same source keep it acquired. getCompanionsFor runs BEFORE the flag clear
      // in generic dismiss, so we exclude the one we're dismissing right now.
      const remaining = CompanionSpawner.getCompanionsFor(controller)
        .filter(c => c.sourceId === SOURCE_ID && c.actor.id !== companionActor.id);
      if (!remaining.length) {
        try { await FocusManager.releaseFeatureFocus(controller, FOCUS_KEY); }
        catch (e) { log("BeastSpell", `Could not release focus: ${e.message}`); }
        // Also remove Beast from the system focus list if present
        const beastSpell = controller.items.find(i => i.type === "spell" && i.name.toLowerCase() === "beast");
        if (beastSpell) {
          const ids = controller.system?.focus?.spellIds ?? [];
          if (ids.includes(beastSpell.id)) {
            await controller.update({ "system.focus.spellIds": ids.filter(id => id !== beastSpell.id) });
          }
        }
      }

      // Clean up the freshly-imported world actor (Beast always fresh-imports
      // due to allowMultiple) so defeated summons don't pile up as orphaned
      // world actors in game.actors.
      if (meta?.meta?.freshImport && companionActor?.id) {
        try { await gmRequest("deleteActor", { actorId: companionActor.id }); }
        catch (e) { log("BeastSpell", `Could not delete imported actor on dismiss: ${e.message}`); }
      }
    });
  },

  async _onChatMessage(message) {
    // Only react to the caster's own cast cards
    const itemId = message.flags?.vagabond?.itemId;
    if (!itemId) return;
    const casterId = message.speaker?.actor;
    const caster = casterId ? game.actors.get(casterId) : null;
    if (!caster || caster.type !== "character") return;

    const item = caster.items.get(itemId);
    if (!item || item.type !== "spell") return;
    if (item.name.toLowerCase() !== "beast") return;

    // Only the owner triggers the spawn flow (avoid GM + player double-spawn)
    if (!caster.isOwner) return;

    // Prevent double-fire: flag the message once we've handled it
    if (message.getFlag(MODULE_ID, "beastSpellHandled")) return;
    try { await message.setFlag(MODULE_ID, "beastSpellHandled", true); }
    catch { /* non-fatal */ }

    await this.trigger(caster);
  },

  /**
   * Public entry point — called from the Companions tab action bar as well
   * as from the createChatMessage hook. Opens the multi-select picker and
   * spawns the chosen beasts.
   * @param {Actor} caster
   */
  async trigger(caster) {
    await this._spawnBeast(caster);
  },

  async _spawnBeast(caster) {
    const level = Number(caster.system?.attributes?.level?.value ?? 1) || 1;
    const maxHD = Math.max(1, Math.floor(level / 2));

    // Subtract HD already committed to active beast summons
    const activeBeasts = CompanionSpawner.getCompanionsFor(caster)
      .filter(c => c.sourceId === SOURCE_ID);
    const usedHD = activeBeasts.reduce((sum, c) => sum + (c.actor.system?.hd ?? 0), 0);
    const remainingHD = maxHD - usedHD;

    if (remainingHD <= 0) {
      ui.notifications.warn(`Beast HD budget exhausted (${usedHD} / ${maxHD}). Drop Focus or wait for a beast to die before summoning more.`);
      return;
    }

    // Multi-select picker: caster picks any combination of beasts whose
    // cumulative HD fits the remaining budget. Loads from world NPCs +
    // vce-beasts + the system bestiary (92 beasts).
    const picks = await CreaturePicker.pick({
      title: `Beast — ${remainingHD} HD remaining of ${maxHD}`,
      caster,
      favoritesFlag: "beastSpellCodex",
      multi: true,
      filter: {
        types: ["beast"],
        maxHD: remainingHD,
        packs: [
          "vagabond-character-enhancer.vce-beasts",
          "vagabond.bestiary",
        ],
      },
    });
    if (!picks || !picks.length) return; // user cancelled

    // Spawn each pick. allowMultiple lets them stack without replace prompts.
    let summoned = 0;
    for (const pick of picks) {
      const result = await CompanionSpawner.spawn({
        caster,
        sourceId: SOURCE_ID,
        creatureUuid: pick.uuid,
        meta: { hd: null, spellCast: true },
        allowMultiple: true,
        suppressChat: true, // batch summary posted below
      });
      if (result.success) summoned++;
      else log("BeastSpell", `Could not summon ${pick.name}: ${result.error}`);
    }

    if (!summoned) {
      ui.notifications.error("Could not summon any beasts from the selection.");
      return;
    }

    // Batch chat summary
    const names = picks.map(p => p.name).join(", ");
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<div class="vce-companion-spawned"><strong>${caster.name}</strong> casts <strong>Beast</strong> and summons: <em>${names}</em>.</div>`,
    });

    // Focus acquisition. Beast requires 1 Mana/Turn upkeep. If the caster
    // ALREADY focused Beast via the system's "Focus this spell" button (our
    // updateActor hook trigger path), their system.focus.spellIds already has
    // Beast — no need to prompt. Only prompt if neither tracker shows focus.
    if (!this._isFocusingBeast(caster)) {
      const acquire = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Beast — Focus" },
        content: `<p>Focus on Beast to maintain <strong>${summoned} beast${summoned === 1 ? "" : "s"}</strong>?</p>
                  <p><em>Costs 1 Mana per Turn of upkeep. Cancelling dismisses the summoned beasts.</em></p>`,
        rejectClose: false,
      });
      if (!acquire) {
        // User declined — banish the beasts we just spawned
        const active = CompanionSpawner.getCompanionsFor(caster)
          .filter(c => c.sourceId === SOURCE_ID);
        for (const c of active) {
          await CompanionSpawner.dismiss(c.actor, { reason: "focus-declined" });
        }
        return;
      }
      // Add Beast to the system's focus list so the spell card shows focused
      // state and the mana drain ticks. Also acquire VCE focus slot so the
      // caster's featureFocus panel is consistent.
      const beastSpell = caster.items.find(i => i.type === "spell" && i.name.toLowerCase() === "beast");
      if (beastSpell) {
        const ids = caster.system?.focus?.spellIds ?? [];
        if (!ids.includes(beastSpell.id)) {
          // Suppress the focus-toggle hook's summon re-trigger (we're in it)
          (this._handlingTrigger ??= new Set()).add(caster.id);
          try {
            await caster.update({ "system.focus.spellIds": [...ids, beastSpell.id] });
          } finally {
            this._handlingTrigger.delete(caster.id);
          }
        }
      }
      try {
        await FocusManager.acquireFeatureFocus(
          caster, FOCUS_KEY, `Beast Summons`, "icons/creatures/abilities/bear-roar-brown.webp"
        );
      } catch (e) {
        log("BeastSpell", `Could not acquire focus: ${e.message}`);
      }
    }
  },
};
