/**
 * Druid Class Features
 * Registry entries + runtime hooks for all Druid features.
 */

import { MODULE_ID, log, hasFeature } from "../utils.mjs";
import { PolymorphManager } from "../polymorph/polymorph-manager.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

/**
 * All Druid class features.
 * Keys are lowercase feature names matching the class compendium's levelFeatures.
 *
 * Status key:
 *   "system"  — Fully handled by mordachai's base system. Module does nothing.
 *   "module"  — Fully handled by this module (managed AE and/or runtime hook).
 *   "partial" — System handles part, module handles the rest. See notes.
 *   "flavor"  — Roleplay/narrative only. Nothing to automate.
 *   "todo"    — Needs implementation. Not yet working.
 */
export const DRUID_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Primal Mystic
  // ──────────────────────────────────────────────
  // RULES: You can Cast Spells using Mysticism.
  // Spells: You learn 4 Spells, one of which must always be Polymorph. You learn
  // 1 other Spell every 2 Levels in this Class hereafter.
  // Mana: Your Maximum Mana is equal to (4 x your Druid Level), and the highest
  // amount of Mana you can spend is equal to (Awareness + half your Druid Level, round up).
  //
  // STATUS: system — Casting is handled by the base system.
  "primal mystic": {
    class: "druid",
    level: 1,
    flag: "druid_primalMystic",
    status: "system",
    description: "Cast Spells using Mysticism. Learn 4 Spells (must include Polymorph). Max Mana = 4 x Level."
  },

  // ──────────────────────────────────────────────
  // L1: Feral Shift
  // ──────────────────────────────────────────────
  // RULES: You get the Shapechanger Perk and you can take an Action granted by the
  // Beast you turn into as a part of the Cast Action.
  //
  // STATUS: flavor — Grants Shapechanger Perk (added manually) + action economy rule.
  "feral shift": {
    class: "druid",
    level: 1,
    flag: "druid_feralShift",
    status: "flavor",
    description: "Gain Shapechanger Perk. Take a Beast Action as part of the Polymorph Cast Action."
  },

  // ──────────────────────────────────────────────
  // L2: Tempest Within
  // ──────────────────────────────────────────────
  // RULES: You reduce Cold, Fire, and Shock damage you take by (half your Druid
  // Level) per damage die.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - onCalculateFinalDamage handler below (dispatched from vagabond-character-enhancer.mjs).
  //     After armor/rage DR, checks if target has druid_tempestWithin and damage
  //     type is cold, fire, or shock. Reduces by floor(classLevel / 2) * numDice.
  "tempest within": {
    class: "druid",
    level: 2,
    flag: "druid_tempestWithin",
    status: "module",
    description: "Reduce Cold, Fire, and Shock damage by (half Druid Level) per damage die."
  },

  // ──────────────────────────────────────────────
  // L4: Innervate
  // ──────────────────────────────────────────────
  // RULES: You can use your Action to give a Close Being some of your Mana, or to
  // end one Status affecting it from either Charmed, Confused, Frightened, or
  // Sickened. This can be yourself.
  //
  // STATUS: flavor — Manual action (mana transfer / status removal).
  "innervate": {
    class: "druid",
    level: 4,
    flag: "druid_innervate",
    status: "flavor",
    description: "Action to transfer Mana to a Close Being, or end Charmed/Confused/Frightened/Sickened. Can target self."
  },

  // ──────────────────────────────────────────────
  // L6: Ancient Growth
  // ──────────────────────────────────────────────
  // RULES: While you Focus on a Casting of Polymorph that only Targets yourself,
  // you can Focus one additional Spell. Further, your attacks with Beasts you
  // Polymorph into count as (+1) Relics. This bonus increases every 6 Druid
  // Levels hereafter.
  //
  // STATUS: flavor — Focus mechanics and relic bonus too complex to automate.
  "ancient growth": {
    class: "druid",
    level: 6,
    flag: "druid_ancientGrowth",
    status: "flavor",
    description: "Self-Polymorph Focus allows one additional Focus Spell. Beast attacks count as (+1) Relics (increases every 6 levels)."
  },

  // ──────────────────────────────────────────────
  // L8: Savagery
  // ──────────────────────────────────────────────
  // RULES: While you are polymorphed into a Beast, you have a +1 bonus to Armor.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Managed AE: +1 to system.armor (created disabled).
  //   - Runtime hook: Watches actor.system.focus.spellIds for a spell named
  //     "Polymorph". Enables the AE when focusing Polymorph, disables when not.
  "savagery": {
    class: "druid",
    level: 8,
    flag: "druid_savagery",
    status: "module",
    description: "While polymorphed into a Beast, +1 bonus to Armor.",
    effects: [
      {
        label: "Savagery (+1 Armor)",
        icon: "icons/creatures/abilities/bear-roar-bite-brown-green.webp",
        disabled: true,
        changes: [
          { key: "system.armorBonus", mode: 2, value: "1" }
        ]
      }
    ]
  },

  // ──────────────────────────────────────────────
  // L10: Force of Nature
  // ──────────────────────────────────────────────
  // RULES: If you are reduced to 0 HP, roll a d10. If the result is equal to or
  // lower than your Awareness, you are instead at 1 HP.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - preUpdateActor hook: Intercepts HP going to 0, rolls d10 vs Awareness,
  //     and sets HP to 1 if the roll succeeds. Posts result to chat.
  "force of nature": {
    class: "druid",
    level: 10,
    flag: "druid_forceOfNature",
    status: "module",
    description: "At 0 HP, roll d10. If equal to or lower than Awareness, you are at 1 HP instead."
  }
};

/* -------------------------------------------- */
/*  Druid Runtime Hooks                         */
/* -------------------------------------------- */

export const DruidFeatures = {
  registerHooks() {
    this._registerPolymorphHooks();
    this._registerForceOfNatureHooks();
    log("Druid","Druid hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Handler Methods (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * Tempest Within: Reduce cold/fire/shock damage.
   * Called from calculateFinalDamage dispatcher.
   */
  onCalculateFinalDamage(ctx) {
    if (!ctx.features?.druid_tempestWithin) return;
    if (!["cold", "fire", "shock"].includes(ctx.damageType?.toLowerCase())) return;
    const classLevel = ctx.features._classLevel ?? 1;
    const reductionPerDie = Math.floor(classLevel / 2);
    if (reductionPerDie <= 0) return;
    const tempestDR = reductionPerDie * ctx.numDice;
    log("Druid", `Tempest Within: ${reductionPerDie} × ${ctx.numDice} dice = ${tempestDR} reduction (${ctx.damageType})`);
    ctx.result = Math.max(0, ctx.result - tempestDR);
  },


  /**
   * Determine if the current user is the "primary owner" of this actor.
   * Used to ensure hooks run exactly once across multiple connected clients.
   * Priority: GM > first active player owner.
   */
  _isPrimaryOwner(actor) {
    // If GM is active, only GM runs the hook
    const activeGM = game.users.find(u => u.isGM && u.active);
    if (activeGM) return game.user.isGM;
    // No active GM — first active player owner runs it
    return actor.isOwner;
  },

  /* -------------------------------------------- */
  /*  Polymorph Focus (Savagery + Beast Form)     */
  /* -------------------------------------------- */

  /**
   * Unified hook for all Polymorph-related features.
   * Watches focus.spellIds for Polymorph and triggers:
   * - Savagery AE toggle (if L8+)
   * - PolymorphManager beast form apply/revert
   */
  _registerPolymorphHooks() {
    Hooks.on("updateActor", async (actor, changes, options) => {
      if (actor.type !== "character") return;
      // Run for the character's primary owner (GM first, then first owning player)
      // to avoid duplicate execution across multiple clients.
      if (!this._isPrimaryOwner(actor)) return;

      // Only react to focus changes
      const focusChanged = foundry.utils.hasProperty(changes, "system.focus.spellIds");
      if (!focusChanged) return;

      // Must be a druid (check for any druid feature)
      const features = actor.getFlag(MODULE_ID, "features");
      if (!features?.druid_feralShift && !features?.druid_primalMystic) return;

      const isFocusingPolymorph = this._isFocusingPolymorph(actor);

      // --- Savagery: Toggle +1 Armor AE with Polymorph ---
      if (features.druid_savagery) {
        const ae = actor.effects.find(e =>
          e.getFlag(MODULE_ID, "managed") &&
          e.getFlag(MODULE_ID, "featureFlag") === "druid_savagery"
        );
        if (ae && ae.disabled === isFocusingPolymorph) {
          log("Druid",`Savagery: ${isFocusingPolymorph ? "Enabling" : "Disabling"} +1 Armor for ${actor.name}`);
          await ae.update({ disabled: !isFocusingPolymorph });
        }
      }

      // --- Polymorph Manager: Beast form apply/revert ---
      // Skip if this update was triggered by PolymorphManager itself (avoid loops)
      if (options.vcePolymorphRevert) return;

      if (isFocusingPolymorph) {
        await PolymorphManager.onPolymorphFocus(actor);
      } else {
        await PolymorphManager.onPolymorphUnfocus(actor);
      }
    });
  },

  /**
   * Check if the actor is currently focusing on a spell named "Polymorph".
   */
  _isFocusingPolymorph(actor) {
    const focusedIds = actor.system.focus?.spellIds ?? [];
    for (const spellId of focusedIds) {
      const spell = actor.items.get(spellId);
      if (spell?.name?.toLowerCase().includes("polymorph")) return true;
    }
    return false;
  },

  /* -------------------------------------------- */
  /*  Force of Nature (L10)                       */
  /* -------------------------------------------- */

  /**
   * When a druid with Force of Nature is reduced to 0 HP, roll a d10.
   * If the result is equal to or lower than their Awareness, they are at 1 HP instead.
   *
   * Uses preUpdateActor to intercept the HP change before it's applied.
   * A flag prevents recursive triggers (the corrective update would re-fire the hook).
   */
  _registerForceOfNatureHooks() {
    // Capture old HP before the update so we know if HP is dropping to 0
    Hooks.on("preUpdateActor", (actor, changes, options) => {
      if (actor.type !== "character") return;
      const newHP = foundry.utils.getProperty(changes, "system.health.value");
      if (newHP === undefined) return;
      // Store old HP so the updateActor hook can compare
      options.vceOldHP_druid = actor.system.health?.value ?? 0;
    });

    Hooks.on("updateActor", async (actor, changes, options) => {
      if (actor.type !== "character") return;
      if (!this._isPrimaryOwner(actor)) return;
      if (!hasFeature(actor, "druid_forceOfNature")) return;

      const newHP = foundry.utils.getProperty(changes, "system.health.value");
      if (newHP === undefined || newHP > 0) return;

      const oldHP = options.vceOldHP_druid;
      if (oldHP === undefined || oldHP <= 0) return;

      // Prevent recursive trigger from our own corrective update
      if (options.vceForceOfNature) return;

      const awareness = actor.system.stats?.awareness?.value ?? 0;
      const roll = new Roll("1d10");
      await roll.evaluate();
      const success = roll.total <= awareness;

      log("Druid",`Force of Nature: ${actor.name} dropped to 0 HP. Rolled ${roll.total} vs Awareness ${awareness} — ${success ? "SUCCESS" : "FAIL"}`);

      // Post result to chat

      const resultText = success
        ? `<strong>Force of Nature:</strong> Rolled <strong>${roll.total}</strong> ≤ Awareness <strong>${awareness}</strong> — survives at 1 HP!`
        : `<strong>Force of Nature:</strong> Rolled <strong>${roll.total}</strong> > Awareness <strong>${awareness}</strong> — falls unconscious.`;

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="vce-force-of-nature ${success ? "success" : "failure"}">
          <i class="fas fa-leaf vce-fon-icon" aria-hidden="true"></i>
          ${resultText}
        </div>`,
        rolls: [roll]
      });

      // If successful, set HP to 1
      if (success) {
        await actor.update(
          { "system.health.value": 1 },
          { vceForceOfNature: true }
        );
      }
    });
  }
};
