/**
 * Raise spell adapter — summons undead by raising non-Artificial/Undead corpses.
 *
 * Per Core Rulebook 05_Magic/02 Spell List (Raise):
 *   - Cost: free cast + 1 Mana/Turn focus upkeep
 *   - Duration: as long as you Focus
 *   - Creature pool: non-Artificial/Undead corpses in Area
 *   - HD budget: cumulative, ≤ caster Level
 *   - Becomes Undead: gains Darksight, Poison immunity, Weak to Silvered,
 *     cannot be Sickened (see undead-template.mjs for the AE overlay)
 *   - Termination: drop Focus → raised undead die permanently
 *   - Checks: caster's Cast Skill
 *
 * Implementation follows the Beast adapter pattern: each cast raises one
 * corpse within the remaining HD budget; focus shared across all raised
 * undead; applies the Undead template AE after spawn.
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { CompanionSpawner } from "../companion/companion-spawner.mjs";
import { CreaturePicker } from "../companion/creature-picker.mjs";
import { applyUndeadTemplate } from "../companion/undead-template.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";

const FOCUS_KEY = "spell_raise";
const SOURCE_ID = "spell-raise";

// Zombie, Boomer from the Vagabond system bestiary — used by the Infesting
// Burst perk to override the raised creature with a Boomer stat block.
const BOOMER_UUID = "Compendium.vagabond.bestiary.Actor.hLO69Zjvz7WaJAmO";

export const RaiseSpell = {
  init() {
    Hooks.on("createChatMessage", (msg) => this._onChatMessage(msg));
    // Snapshot old focus.spellIds before update so we can detect add/remove
    Hooks.on("preUpdateActor", (actor, changes, options) => {
      if (actor.type !== "character") return;
      if (foundry.utils.getProperty(changes, "system.focus.spellIds") === undefined) return;
      options._vceRaiseOldFocusIds = [...(actor.system?.focus?.spellIds ?? [])];
    });
    Hooks.on("updateActor", (actor, changes, options) => this._onFocusToggle(actor, changes, options));
    this._registerDismissHandler();
    this._registerManaDrain();
    log("RaiseSpell", "Raise spell adapter registered.");
  },

  /**
   * Unified focus check — either the system focus list has Raise OR the VCE
   * featureFocus slot is held. Matches the Beast pattern.
   */
  _isFocusingRaise(actor) {
    const raiseSpell = actor.items.find(i => i.type === "spell" && i.name.toLowerCase() === "raise");
    if (raiseSpell) {
      const spellIds = actor.system?.focus?.spellIds ?? [];
      if (spellIds.includes(raiseSpell.id)) return true;
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

    const raiseSpell = actor.items.find(i => i.type === "spell" && i.name.toLowerCase() === "raise");
    if (!raiseSpell) return;

    const oldSpellIds = options?._vceRaiseOldFocusIds ?? [];
    const wasActive = oldSpellIds.includes(raiseSpell.id);
    const nowActive = newSpellIds.includes(raiseSpell.id);

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

    if (wasActive && !nowActive) {
      if (this._handlingTrigger?.has(actor.id)) return;
      const active = CompanionSpawner.getCompanionsFor(actor).filter(c => c.sourceId === SOURCE_ID);
      if (!active.length) return;
      for (const c of active) {
        await CompanionSpawner.dismiss(c.actor, { reason: "focus-dropped" });
      }
      try { await FocusManager.releaseFeatureFocus(actor, FOCUS_KEY); }
      catch (e) { log("RaiseSpell", `Could not release focus slot: ${e.message}`); }
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <strong>${actor.name}</strong> drops Focus on <strong>Raise</strong>;
              the raised undead fall permanently.
            </div>
          </section></div>
        </div>`,
      });
    }
  },

  _registerManaDrain() {
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      const casters = game.actors.filter(a => a.type === "character" && this._isFocusingRaise(a));
      for (const actor of casters) {
        const mana = Number(actor.system?.mana?.current ?? 0) || 0;
        if (mana < 1) {
          await this._dropFocusAndDismiss(actor, "out-of-mana");
          continue;
        }
        await actor.update({ "system.mana.current": mana - 1 });
        log("RaiseSpell", `${actor.name}: 1 Mana drained for Raise focus (${mana} → ${mana - 1})`);
      }
    });
  },

  async _dropFocusAndDismiss(actor, reason) {
    (this._handlingTrigger ??= new Set()).add(actor.id);
    try {
      const raiseSpell = actor.items.find(i => i.type === "spell" && i.name.toLowerCase() === "raise");
      const ids = actor.system?.focus?.spellIds ?? [];
      if (raiseSpell && ids.includes(raiseSpell.id)) {
        await actor.update({ "system.focus.spellIds": ids.filter(id => id !== raiseSpell.id) });
      }
      try { await FocusManager.releaseFeatureFocus(actor, FOCUS_KEY); }
      catch (e) { log("RaiseSpell", `Could not release focus slot: ${e.message}`); }
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
                <strong>${actor.name}</strong>'s raised undead fall permanently —
                ${reason === "out-of-mana" ? "insufficient Mana to maintain Focus" : "Focus dropped"}.
              </div>
            </section></div>
          </div>`,
        });
      }
    } finally {
      this._handlingTrigger.delete(actor.id);
    }
  },

  _registerDismissHandler() {
    CompanionSpawner.registerDismissHandler(SOURCE_ID, async (companionActor, { controller, meta }) => {
      if (!controller) return;
      // Release focus + clean up system spell list only when LAST raised dies
      const remaining = CompanionSpawner.getCompanionsFor(controller)
        .filter(c => c.sourceId === SOURCE_ID && c.actor.id !== companionActor.id);
      if (!remaining.length) {
        try { await FocusManager.releaseFeatureFocus(controller, FOCUS_KEY); }
        catch (e) { log("RaiseSpell", `Could not release focus: ${e.message}`); }
        const raiseSpell = controller.items.find(i => i.type === "spell" && i.name.toLowerCase() === "raise");
        if (raiseSpell) {
          const ids = controller.system?.focus?.spellIds ?? [];
          if (ids.includes(raiseSpell.id)) {
            await controller.update({ "system.focus.spellIds": ids.filter(id => id !== raiseSpell.id) });
          }
        }
      }
      // Clean up fresh-imported world actor to avoid orphans
      if (meta?.meta?.freshImport && companionActor?.id) {
        try { await gmRequest("deleteActor", { actorId: companionActor.id }); }
        catch (e) { log("RaiseSpell", `Could not delete imported actor on dismiss: ${e.message}`); }
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
    if (item.name.toLowerCase() !== "raise") return;

    if (!caster.isOwner) return;

    if (message.getFlag(MODULE_ID, "raiseSpellHandled")) return;
    try { await message.setFlag(MODULE_ID, "raiseSpellHandled", true); }
    catch { /* non-fatal */ }

    await this.trigger(caster);
  },

  /**
   * Public entry point — called from the Companions tab action bar as well
   * as from the createChatMessage hook.
   * @param {Actor} caster
   */
  async trigger(caster) {
    await this._raiseUndead(caster);
  },

  async _raiseUndead(caster) {
    const level = Number(caster.system?.attributes?.level?.value ?? 1) || 1;
    const maxHD = level;

    // Subtract HD already committed to active raised undead
    const activeRaised = CompanionSpawner.getCompanionsFor(caster)
      .filter(c => c.sourceId === SOURCE_ID);
    const usedHD = activeRaised.reduce((sum, c) => sum + (c.actor.system?.hd ?? 0), 0);
    const remainingHD = maxHD - usedHD;

    if (remainingHD <= 0) {
      ui.notifications.warn(`Raise HD budget exhausted (${usedHD} / ${maxHD}). Drop Focus to release the current undead before raising more.`);
      return;
    }

    // Infesting Burst perk (Raise-adjacent): offer the Zombie, Boomer as an
    // alternative spawn. Rulebook: "you can choose to raise them up as a
    // Boomer." If the caster chooses Yes, skip the corpse picker entirely and
    // spawn a single Zombie, Boomer consuming HD 3 of the budget. If they
    // pick No, the normal multi-select picker opens.
    //
    // Known limitation: you can't mix a Boomer with regular corpses in one
    // cast today — two casts required. Revisit when/if that comes up.
    const features = getFeatures(caster);
    let picks;
    if (features?.perk_infestingBurst) {
      const boomerHD = 3;
      const useBoomer = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Infesting Burst" },
        content: `<p>Raise a <strong>Zombie Boomer</strong> (HD ${boomerHD})?</p>
                  <p><em>The Boomer explodes for 2d6 in Near aura then dies. No = open the normal corpse picker for regular undead.</em></p>`,
        rejectClose: false,
      });
      if (useBoomer) {
        if (boomerHD > remainingHD) {
          ui.notifications.warn(`Boomer HD (${boomerHD}) exceeds remaining budget (${remainingHD}).`);
          return;
        }
        picks = [{ uuid: BOOMER_UUID, name: "Zombie, Boomer" }];
      }
    }

    if (!picks) {
      // Rich-table multi-select picker, excluding Artificial/Undead/Construct/Object
      // per rulebook ("non-Artificial/Undead corpse"). Multi-pick so L4 caster
      // can raise e.g. 2×HD2 in a single cast within their HD budget.
      picks = await CreaturePicker.pick({
        title: `Raise — ${remainingHD} HD remaining of ${maxHD}`,
        caster,
        favoritesFlag: "raiseSpellCodex",
        multi: true,
        filter: {
          excludeTypes: ["artificial", "undead", "construct", "object"],
          maxHD: remainingHD,
          packs: ["vagabond.bestiary"],
        },
      });
      if (!picks || !picks.length) return;
    }

    // Spawn each pick, apply the Undead template, track successes for summary
    let raised = 0;
    for (const pick of picks) {
      const result = await CompanionSpawner.spawn({
        caster,
        sourceId: SOURCE_ID,
        creatureUuid: pick.uuid,
        meta: { spellCast: true, raised: true },
        allowMultiple: true,
        suppressChat: true,
      });
      if (!result.success) {
        log("RaiseSpell", `Could not raise ${pick.name}: ${result.error}`);
        continue;
      }
      const raisedActor = game.actors.get(result.actorId);
      if (raisedActor) await applyUndeadTemplate(raisedActor, { sourceName: "Raised" });
      raised++;
    }

    if (!raised) {
      ui.notifications.error("Could not raise any undead from the selection.");
      return;
    }

    // Batch chat summary
    const names = picks.map(p => p.name).join(", ");
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<div class="vce-companion-spawned"><strong>${caster.name}</strong> casts <strong>Raise</strong> — the dead rise: <em>${names}</em>.</div>`,
    });

    // Focus acquisition — sync BOTH trackers if not already focusing.
    // If the caster clicked the system's "Focus this spell" button first,
    // we're already here via _onFocusToggle; _isFocusingRaise returns true
    // and we skip the dialog.
    if (!this._isFocusingRaise(caster)) {
      const acquire = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Raise — Focus" },
        content: `<p>Focus on Raise to maintain <strong>${raised} undead</strong>?</p>
                  <p><em>Costs 1 Mana per Turn of upkeep. Cancelling dismisses the raised — dead rise permanently if Focus drops.</em></p>`,
        rejectClose: false,
      });
      if (!acquire) {
        // User declined — dismiss the raised undead
        const active = CompanionSpawner.getCompanionsFor(caster).filter(c => c.sourceId === SOURCE_ID);
        for (const c of active) {
          await CompanionSpawner.dismiss(c.actor, { reason: "focus-declined" });
        }
        return;
      }
      // Sync system focus list
      const raiseSpell = caster.items.find(i => i.type === "spell" && i.name.toLowerCase() === "raise");
      if (raiseSpell) {
        const ids = caster.system?.focus?.spellIds ?? [];
        if (!ids.includes(raiseSpell.id)) {
          (this._handlingTrigger ??= new Set()).add(caster.id);
          try {
            await caster.update({ "system.focus.spellIds": [...ids, raiseSpell.id] });
          } finally {
            this._handlingTrigger.delete(caster.id);
          }
        }
      }
      // Acquire VCE focus slot
      try {
        await FocusManager.acquireFeatureFocus(
          caster, FOCUS_KEY, `Raised Undead`, "icons/svg/skull.svg"
        );
      } catch (e) {
        log("RaiseSpell", `Could not acquire focus: ${e.message}`);
      }
    }
  },
};
