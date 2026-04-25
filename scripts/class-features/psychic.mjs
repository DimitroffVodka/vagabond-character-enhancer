/**
 * Psychic Class Features
 *
 * Phase 7 of the Psychic implementation. Handles class features that aren't
 * tied to individual Talents (those live in the talent/ subdirectory):
 *
 *   - Awakening (L1)       — auto-grant Telepath + set psychicMindTrinket flag
 *   - Precognition (L2)    — first save each round gets Favor while Focusing
 *   - Duality (L4 / L8)    — multi-Focus capacity (handled in TalentBuffs.getMaxFocus)
 *   - Mental Fortress (L6) — status immunities AE (managed via registry effects[])
 *   - Transcendence (L10)  — Talent swap dialog (in talent/talent-transcendence.mjs)
 *
 * The Talent system itself (Pick dialog, Cast pipeline, Focus toggling, the
 * 4 buff Talents) lives in scripts/talent/ — this file is just the class-level
 * features that wrap around it.
 */

import { MODULE_ID, log } from "../utils.mjs";

const TELEPATH_UUID = "Compendium.vagabond.perks.Item.jmhv9Tnc6FnwqSY9";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const PSYCHIC_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Awakening
  // ──────────────────────────────────────────────
  // RULES: You gain the Telepath Perk. Your mind counts as a Trinket slot
  // (it can be magicked into).
  //
  // STATUS: module
  //
  // MODULE HANDLES (PsychicFeatures.init):
  //   - createItem hook: when Psychic class lands on an actor, ensure
  //     Telepath perk is also present (system creator's allowedPerks doesn't
  //     reliably auto-pick a single-entry pool).
  //   - Sets `psychicMindTrinket: true` flag on the actor for downstream
  //     Trinket-slot logic.
  //
  // NOTE: The Trinket-slot mechanical effect is honor-system / GM-driven —
  // we just expose the flag for any future system that needs to know.
  "awakening": {
    class: "psychic", level: 1, flag: "psychic_awakening", status: "module",
    description: "Gain the Telepath Perk. Mind counts as a Trinket slot."
  },

  // ──────────────────────────────────────────────
  // L2: Precognition
  // ──────────────────────────────────────────────
  // RULES: While Focusing, the first Save you make each Round has Favor.
  //
  // STATUS: module
  //
  // MODULE HANDLES (PsychicFeatures.onPreRollSave):
  //   - On any save roll: if actor has psychic_precognition, has at least
  //     one focused Talent, and hasn't used Precognition this round, set
  //     ctx.actor.system.favorHinder = "favor" (cancels hinder if present)
  //     and stamp psychicPrecognitionUsedRound = currentRound.
  //   - combatRound hook clears the per-actor stamp at round transition.
  //
  // NOTE: Outside of combat, game.combat.round is undefined — fallback to
  // a simple "once per save burst" behavior (consume on first use, no auto
  // reset). The flag is cleared whenever combat starts/ends, so each new
  // encounter resets it.
  "precognition": {
    class: "psychic", level: 2, flag: "psychic_precognition", status: "module",
    description: "While Focusing, the first Save you make each Round has Favor."
  },

  // ──────────────────────────────────────────────
  // L4: Duality (first tier)
  // ──────────────────────────────────────────────
  // RULES: You may now Focus on two Talents simultaneously.
  //
  // STATUS: flavor — capacity calc lives in TalentBuffs.getMaxFocus.
  "duality": {
    class: "psychic", level: 4, flag: "psychic_duality", status: "flavor",
    description: "Focus on up to 2 Talents simultaneously."
  },

  // ──────────────────────────────────────────────
  // L6: Mental Fortress
  // ──────────────────────────────────────────────
  // RULES: You can't be Berserk, Charmed, Confused, or Frightened against
  // your will (you can still choose to be).
  //
  // STATUS: module — passive status-immunities AE auto-managed by
  // FeatureDetector._syncManagedEffects from the `effects` array below.
  "mental fortress": {
    class: "psychic", level: 6, flag: "psychic_mentalFortress", status: "module",
    description: "Cannot be Berserk, Charmed, Confused, or Frightened against your will.",
    effects: [{
      label: "Mental Fortress",
      icon: "icons/magic/control/control-influence-puppet.webp",
      changes: [
        // statusImmunities ADD mode (4) appends each name. Per the system's
        // Divine Resolve fix in CHANGELOG v0.3.0+, each immunity must be
        // a SEPARATE change entry — the system splits on commas internally
        // but ADD mode of an array field needs distinct values.
        { key: "system.statusImmunities", mode: 4, value: "berserk",    priority: null },
        { key: "system.statusImmunities", mode: 4, value: "charmed",    priority: null },
        { key: "system.statusImmunities", mode: 4, value: "confused",   priority: null },
        { key: "system.statusImmunities", mode: 4, value: "frightened", priority: null }
      ]
    }]
  },

  // ──────────────────────────────────────────────
  // L8: Duality (second tier)
  // ──────────────────────────────────────────────
  // RULES: You may now Focus on three Talents simultaneously.
  //
  // STATUS: flavor — same capacity calc as L4 Duality.
  "transcendent duality": {
    class: "psychic", level: 8, flag: "psychic_transcendentDuality", status: "flavor",
    description: "Focus on up to 3 Talents simultaneously."
  },

  // ──────────────────────────────────────────────
  // L10: Transcendence
  // ──────────────────────────────────────────────
  // RULES: As an Action, you may swap out one of your known Talents for a
  // different Talent.
  //
  // STATUS: module — UI lives in talent/talent-transcendence.mjs and is
  // wired through the Talents tab header button.
  "transcendence": {
    class: "psychic", level: 10, flag: "psychic_transcendence", status: "module",
    description: "As an Action, swap one known Talent for another."
  }
};

/* -------------------------------------------- */
/*  PsychicFeatures runtime                     */
/* -------------------------------------------- */

export const PsychicFeatures = {
  init() {
    // ── Awakening: auto-grant Telepath + set flag on Psychic class detect
    Hooks.on("createItem", async (item) => {
      try {
        if (item.type !== "class" || item.name !== "Psychic") return;
        const actor = item.parent;
        if (!actor) return;
        await this._applyAwakening(actor);
      } catch (e) {
        log("Psychic", `Awakening hook failed: ${e.message}`);
      }
    });

    // Backfill Awakening on any existing Psychic actors (in case the class
    // was added before this module loaded).
    for (const actor of game.actors) {
      const hasPsychic = actor.items.some(i => i.type === "class" && i.name === "Psychic");
      if (hasPsychic) this._applyAwakening(actor).catch(e =>
        log("Psychic", `Awakening backfill for ${actor.name} failed: ${e.message}`)
      );
    }

    // ── Precognition: clear per-round flag on combat round transition
    Hooks.on("combatRound", (combat) => {
      try {
        for (const c of combat.combatants) {
          const a = c.actor;
          if (!a) continue;
          if (a.getFlag(MODULE_ID, "psychicPrecognitionUsedRound") !== undefined) {
            a.unsetFlag(MODULE_ID, "psychicPrecognitionUsedRound").catch(() => {});
          }
        }
      } catch (e) {
        log("Psychic", `Precognition round-reset failed: ${e.message}`);
      }
    });

    // Also clear when combat starts or ends so it never leaks across encounters
    Hooks.on("deleteCombat", (combat) => {
      for (const c of combat.combatants) {
        const a = c.actor;
        if (a?.getFlag(MODULE_ID, "psychicPrecognitionUsedRound") !== undefined) {
          a.unsetFlag(MODULE_ID, "psychicPrecognitionUsedRound").catch(() => {});
        }
      }
    });

    log("Psychic", "PsychicFeatures registered (Awakening + Precognition + Mental Fortress)");
  },

  /**
   * Apply Awakening to an actor that just got the Psychic class:
   *   - Set psychicMindTrinket flag (idempotent)
   *   - Ensure Telepath perk exists on the actor (idempotent)
   *
   * Safe to call repeatedly; both checks short-circuit on existing state.
   *
   * @param {Actor} actor
   * @private
   */
  async _applyAwakening(actor) {
    if (!actor) return;

    // 1. Trinket flag
    if (!actor.getFlag(MODULE_ID, "psychicMindTrinket")) {
      await actor.setFlag(MODULE_ID, "psychicMindTrinket", true);
    }

    // 2. Telepath perk
    if (!actor.items.some(i => i.type === "perk" && i.name === "Telepath")) {
      try {
        const telepath = await fromUuid(TELEPATH_UUID);
        if (telepath) {
          await actor.createEmbeddedDocuments("Item", [telepath.toObject()]);
          log("Psychic", `${actor.name}: granted Telepath perk (Awakening)`);
        } else {
          log("Psychic", `Could not resolve Telepath at ${TELEPATH_UUID}`);
        }
      } catch (e) {
        log("Psychic", `Telepath grant failed for ${actor.name}: ${e.message}`);
      }
    }
  },

  /**
   * Precognition save-roll hook.
   *
   * Dispatched from VagabondDamageHelper._rollSave alongside Bard/Dancer/Hunter.
   * Mirrors Bard Bravado's pattern of mutating ctx.actor.system.favorHinder
   * with restoration in finally (caller handles via ctx.needRestore + ctx.origFH).
   *
   * Conditions for granting Favor:
   *   - Actor has psychic_precognition feature flag (L2+ Psychic)
   *   - Actor has at least one focused Talent (psychicTalents.focusedIds non-empty)
   *   - Has not consumed Precognition this round
   *
   * Favor application (RAW: Favor + Hinder cancel, Favor doesn't stack):
   *   - "hinder" → "none"
   *   - "none"   → "favor"
   *   - "favor"  → no change
   *
   * @param {object} ctx
   */
  onPreRollSave(ctx) {
    const actor = ctx.actor;
    if (!actor) return;
    if (!ctx.features?.psychic_precognition) return;

    const focused = actor.getFlag(MODULE_ID, "psychicTalents")?.focusedIds ?? [];
    if (focused.length === 0) return;

    const currentRound = game.combat?.round ?? -1;
    const used = actor.getFlag(MODULE_ID, "psychicPrecognitionUsedRound");
    // In combat: must be a different round than last use.
    // Out of combat: only fire once between combats (used will be cleared on
    // combat start/end via the deleteCombat hook).
    if (used !== undefined && used === currentRound) return;
    if (used !== undefined && currentRound === -1) return;

    const fh = actor.system.favorHinder;
    if (fh === "favor") {
      // Already favored — Precognition consumed but no mechanical change.
      // Stamp the round so it doesn't try again this turn.
    } else {
      if (!ctx.needRestore) ctx.origFH = fh;
      actor.system.favorHinder = (fh === "hinder") ? "none" : "favor";
      ctx.needRestore = true;
    }

    actor.setFlag(MODULE_ID, "psychicPrecognitionUsedRound", currentRound).catch(() => {});
    log("Psychic", `Precognition: Favor on first save this round for ${actor.name}`);
  }
};
