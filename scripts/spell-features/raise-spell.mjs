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
    this._registerDismissHandler();
    log("RaiseSpell", "Raise spell adapter registered.");
  },

  _registerDismissHandler() {
    CompanionSpawner.registerDismissHandler(SOURCE_ID, async (companionActor, { controller }) => {
      if (!controller) return;
      // Release focus only when the last raised undead is dismissed
      const remaining = CompanionSpawner.getCompanionsFor(controller)
        .filter(c => c.sourceId === SOURCE_ID && c.actor.id !== companionActor.id);
      if (!remaining.length) {
        try { await FocusManager.releaseFeatureFocus(controller, FOCUS_KEY); }
        catch (e) { log("RaiseSpell", `Could not release focus: ${e.message}`); }
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

    // Infesting Burst perk: offer to raise the corpse as a Boomer instead.
    // If the caster accepts, we bypass the corpse picker and spawn the
    // Zombie, Boomer system actor directly (Boomer's own HD 3 is used for
    // the budget check).
    const features = getFeatures(caster);
    let uuid;
    if (features?.perk_infestingBurst) {
      const boomerHD = 3;
      const useBoomer = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Infesting Burst" },
        content: `<p>Raise this one as a <strong>Boomer</strong>? (HD ${boomerHD}, explodes for 2d6 in Near aura and dies.)</p><p><em>Yes = summon Zombie, Boomer. No = pick a specific corpse.</em></p>`,
        rejectClose: false,
      });
      if (useBoomer) {
        if (boomerHD > remainingHD) {
          ui.notifications.warn(`Boomer HD (${boomerHD}) exceeds remaining budget (${remainingHD}).`);
          return;
        }
        uuid = BOOMER_UUID;
      }
    }

    let picks;
    if (uuid) {
      // Infesting Burst shortcut — caller already resolved a specific UUID
      picks = [{ uuid, name: "Boomer" }];
    } else {
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

    // Acquire focus on first raise; shared across all subsequent raises
    const hasFocus = (caster.getFlag(MODULE_ID, "featureFocus") || [])
      .some(f => f.key === FOCUS_KEY);
    if (!hasFocus) {
      try {
        await FocusManager.acquireFeatureFocus(
          caster, FOCUS_KEY, `Raised Undead`, "icons/magic/death/skull-horned-goat-pale.webp"
        );
      } catch (e) {
        log("RaiseSpell", `Could not acquire focus: ${e.message}`);
      }
    }
  },
};
