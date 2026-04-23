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
import { CompanionSpawner } from "../companion/companion-spawner.mjs";
import { CreaturePicker } from "../companion/creature-picker.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";

const FOCUS_KEY = "spell_beast";
const SOURCE_ID = "spell-beast";

export const BeastSpell = {
  init() {
    Hooks.on("createChatMessage", (msg) => this._onChatMessage(msg));
    this._registerDismissHandler();
    log("BeastSpell", "Beast spell adapter registered.");
  },

  _registerDismissHandler() {
    CompanionSpawner.registerDismissHandler(SOURCE_ID, async (companionActor, { controller }) => {
      if (!controller) return;
      // Release focus only when the LAST beast is dismissed — other beasts of the
      // same source keep it acquired. getCompanionsFor runs BEFORE the flag clear
      // happens in generic dismiss, so we check "2 or fewer means this is the last."
      const remaining = CompanionSpawner.getCompanionsFor(controller)
        .filter(c => c.sourceId === SOURCE_ID && c.actor.id !== companionActor.id);
      if (!remaining.length) {
        try { await FocusManager.releaseFeatureFocus(controller, FOCUS_KEY); }
        catch (e) { log("BeastSpell", `Could not release focus: ${e.message}`); }
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

    await this._spawnBeast(caster);
  },

  async _spawnBeast(caster) {
    const level = Number(caster.system?.level ?? 1) || 1;
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

    // Open creature picker filtered to Beast type + remaining budget.
    // Loads from world NPCs + vce-beasts + the system bestiary (92 beasts).
    const picked = await CreaturePicker.pick({
      title: `Beast — ${remainingHD} HD remaining of ${maxHD}`,
      caster,
      favoritesFlag: "beastSpellCodex",
      filter: {
        types: ["beast"],
        maxHD: remainingHD,
        packs: [
          "vagabond-character-enhancer.vce-beasts",
          "vagabond.bestiary",
        ],
      },
    });
    if (!picked) return; // user cancelled

    const result = await CompanionSpawner.spawn({
      caster,
      sourceId: SOURCE_ID,
      creatureUuid: picked.uuid,
      meta: { hd: null, spellCast: true },
      allowMultiple: true, // cumulative budget — don't prompt to replace
      suppressChat: false,
    });
    if (!result.success) {
      ui.notifications.error(`Could not summon beast: ${result.error ?? "unknown error"}`);
      return;
    }

    // Acquire focus on first beast; subsequent casts inherit the same focus slot
    const hasFocus = (caster.getFlag(MODULE_ID, "featureFocus") || [])
      .some(f => f.key === FOCUS_KEY);
    if (!hasFocus) {
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
