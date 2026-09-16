/**
 * Monk Class Features
 * Registry entries + runtime hooks for all Monk features.
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * Monk features center on Finesse combat:
 *
 *   Martial Arts (L1)      → Keen/Cleave via target count + damage die escalation
 *   Fleet of Foot (L1)     → Reflex crit bonus (system AE on class item)
 *   Fluid Motion (L2)      → Walk on walls/water (flavor)
 *   Impetus (L4)           → Dodge ignores 2 highest dice (chat reminder)
 *   Flurry of Blows (L6)   → Extra Finesse attack (flavor)
 *   Empowered Strikes (L8) → Finesse d6 (managed AE)
 *   Flurry of Blows (L10)  → Up to 3 extra attacks (flavor)
 *
 * Martial Arts uses the dispatcher pattern:
 *   - onPreRollAttack: 1 target → Keen (temp AE for finesseCritBonus -1)
 *   - rollWeapon patch: 2+ targets on a Close Finesse weapon → borrows the
 *     Cleave property (monkLendsCleave) so the system's Cleave path runs
 *   - onPostRollAttack: Cleanup Keen AE
 *   - onPreRollDamage: Track Finesse attacks per round, escalate die (max d12)
 *
 * Impetus hooks createChatMessage to detect passed Dodge (Reflex) saves
 * and posts a reminder about ignoring 2 highest damage dice.
 */

import { MODULE_ID, log, hasFeature } from "../utils.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

/** Die size step sequence for escalation */
const DIE_STEPS = [4, 6, 8, 10, 12];

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const MONK_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Martial Arts
  // ──────────────────────────────────────────────
  // RULES: You can use a d4 for Finesse Weapons and, once per Round, you
  // can spend half your Speed to make a second Finesse attack rather than
  // skip your Move. When you hit with a Finesse attack, you can either:
  //   - Apply Keen or (if Close) Cleave property.
  //   - Increase the size of subsequent Finesse damage dice this Round (max d12).
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Pre-attack: 1 target → temp AE (finesseCritBonus -1) for Keen.
  //   - 2+ targets on a Close Finesse weapon → the weapon borrows the Cleave
  //     property for the roll (monkLendsCleave), so the system's 5.38 Cleave
  //     applies: die one size smaller per extra Target, full damage to each.
  //   - Post-attack: Remove temp Keen AE.
  //   - Pre-damage: Escalate die size per Finesse attack this round (d4→d6→…→d12).
  "martial arts": {
    class: "monk", level: 1, flag: "monk_martialArts", status: "module",
    description: "1 target → Keen. 2 targets → Cleave. Finesse dice escalate per attack each round."
  },

  // ──────────────────────────────────────────────
  // L1: Fleet of Foot
  // ──────────────────────────────────────────────
  "fleet of foot": {
    class: "monk", level: 1, flag: "monk_fleetOfFoot", status: "system",
    description: "Gain Treads Lightly Perk. Reflex Save crit reduced by ceil(Monk Level / 4)."
  },

  // ──────────────────────────────────────────────
  // L2: Fluid Motion
  // ──────────────────────────────────────────────
  "fluid motion": {
    class: "monk", level: 2, flag: "monk_fluidMotion", status: "flavor",
    description: "Walk on liquids and walls during Move. Sink/fall if ending off solid ground."
  },

  // ──────────────────────────────────────────────
  // L4: Impetus
  // ──────────────────────────────────────────────
  "impetus": {
    class: "monk", level: 4, flag: "monk_impetus", status: "module",
    description: "On a passed Dodge Save, ignore two highest damage dice instead of one."
  },

  // ──────────────────────────────────────────────
  // L6: Flurry of Blows
  // ──────────────────────────────────────────────
  "flurry of blows": {
    class: "monk", level: 6, flag: "monk_flurryOfBlows", status: "flavor",
    description: "Once per Round, extra Finesse attack on Finesse hit or half Speed."
  },

  // ──────────────────────────────────────────────
  // L8: Empowered Strikes
  // ──────────────────────────────────────────────
  "empowered strikes": {
    class: "monk", level: 8, flag: "monk_empoweredStrikes", status: "module",
    description: "Finesse Weapon damage die becomes d6.",
    canonicalIds: ["monk-empowered-strikes"]
  },

  // NOTE: L10 Flurry of Blows shares the same compendium feature name as L6,
  // so both set the same flag. The scaling (1x at L6, 3x at L10) is inherent
  // to the level check — no separate registry entry needed.
};

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * In-memory tracking of Martial Arts die escalation per actor per round.
 * Avoids async flag writes that can't keep up with rapid attack sequences.
 * Map<actorId, { round: number, dieSize: number }>
 */
const _martialArtsState = new Map();

/**
 * Extract the die size from a damage formula string.
 * e.g., "d6" → 6, "2d8" → 8, "1" → 0, "d4 + 1d6[Imbue]" → 4 (first die)
 */
function _extractDieSize(formula) {
  const match = formula?.match(/(\d*)d(\d+)/);
  return match ? parseInt(match[2]) : 0;
}

/**
 * Replace the first die size in a damage formula.
 * e.g., ("d4", 6) → "d6", ("2d8", 10) → "2d10"
 */
function _replaceDieSize(formula, newSize) {
  return formula.replace(/(\d*d)(\d+)/, `$1${newSize}`);
}

/**
 * Step up a die size: d4→d6→d8→d10→d12. Returns the next size, capped at 12.
 */
function _stepUpDie(currentSize) {
  const idx = DIE_STEPS.indexOf(currentSize);
  if (idx === -1) return Math.min(currentSize + 2, 12);
  return DIE_STEPS[Math.min(idx + 1, DIE_STEPS.length - 1)];
}

/**
 * Martial Arts lets a Close Finesse hit apply Cleave. True when this roll
 * should borrow the property: Monk, Finesse, Close, 2+ targets, and the weapon
 * doesn't already have Cleave.
 */
export function monkLendsCleave(actor, item) {
  return !!item && hasFeature(actor, "monk_martialArts")
    && item.system?.weaponSkill === "finesse"
    && (item.system.range ?? "close") === "close"
    && !item.system.properties?.includes("Cleave")
    && game.user.targets.size > 1;
}

/* -------------------------------------------- */
/*  Monk Runtime Hooks                          */
/* -------------------------------------------- */

export const MonkFeatures = {

  registerHooks() {
    // Impetus: detect passed Dodge saves for double dice ignore
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      this._checkImpetus(message);
    });

    log("Monk", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Martial Arts — Pre-Roll Attack (Keen/Cleave) */
  /* -------------------------------------------- */

  /**
   * Called from the rollAttack dispatcher before the d20 roll.
   *
   * 1 target  → Keen: Create temp AE with finesseCritBonus -1
   * 2+ targets → Cleave: lent to the weapon by the rollWeapon patch
   *              (monkLendsCleave) so the system's Cleave path runs.
   */
  async onPreRollAttack(ctx) {
    if (ctx.item.system?.weaponSkill !== "finesse") return;
    if (!hasFeature(ctx.actor, "monk_martialArts")) return;

    const targets = game.user.targets;

    if (targets.size === 1) {
      // Keen: lower finesse crit threshold by 1
      try {
        const [ae] = await ctx.actor.createEmbeddedDocuments("ActiveEffect", [{
          name: "Martial Arts (Keen)",
          icon: "icons/skills/melee/unarmed-punch-fist.webp",
          origin: `${MODULE_ID}.monk_martialArts`,
          flags: { [MODULE_ID]: { tempKeen: true } },
          changes: [
            { key: "system.finesseCritBonus", mode: 2, value: "-1" }
          ],
          transfer: true
        }]);
        ctx.item._monkKeenAEId = ae.id;
        log("Monk", `Martial Arts: Keen applied (finesseCritBonus -1) for ${ctx.actor.name}`);
      } catch (e) {
        console.error(`${MODULE_ID} | Monk Keen AE creation failed:`, e);
      }
    }
  },

  /* -------------------------------------------- */
  /*  Martial Arts — Post-Roll Attack (Cleanup)    */
  /* -------------------------------------------- */

  /**
   * Called from the rollAttack dispatcher after the d20 roll.
   * Removes the temp Keen AE.
   */
  async onPostRollAttack(ctx) {
    // Clean up Keen temp AE
    if (ctx.item._monkKeenAEId) {
      try {
        await ctx.actor.deleteEmbeddedDocuments("ActiveEffect", [ctx.item._monkKeenAEId]);
        log("Monk", `Martial Arts: Keen AE removed for ${ctx.actor.name}`);
      } catch (e) {
        // AE may already be gone — that's fine
        log("Monk", `Martial Arts: Keen AE cleanup skipped (may already be removed)`);
      }
      delete ctx.item._monkKeenAEId;
    }

  },

  /* -------------------------------------------- */
  /*  Martial Arts — Pre-Roll Damage (Escalation)  */
  /* -------------------------------------------- */

  /**
   * Called from the rollDamage dispatcher before the damage roll.
   * Tracks Finesse attacks per combat round and escalates die size.
   *
   * First Finesse attack this round: use weapon's base die as-is.
   * Subsequent attacks same round: step up from previous die (max d12).
   * System's finesseDamageDieSizeBonus stacks on top at roll time.
   */
  async onPreRollDamage(ctx) {
    if (ctx.item.system?.weaponSkill !== "finesse") return;
    if (!hasFeature(ctx.actor, "monk_martialArts")) return;

    const currentRound = game.combat?.round ?? 0;
    const formula = ctx.item.system.currentDamage || "d4";
    const baseDie = _extractDieSize(formula);
    if (baseDie === 0) return; // No die to escalate (flat damage)

    const state = _martialArtsState.get(ctx.actor.id);

    let finalDie = baseDie;

    // Same round as a previous Finesse attack → escalate from stored die
    if (state && currentRound > 0 && currentRound === state.round && state.dieSize > 0) {
      const escalated = _stepUpDie(state.dieSize);
      if (escalated > baseDie) {
        finalDie = escalated;
      }
    }

    // Update in-memory state for next attack
    _martialArtsState.set(ctx.actor.id, { round: currentRound, dieSize: finalDie });

    // Apply die change if escalated
    if (finalDie !== baseDie) {
      ctx.origDamage = ctx.item.system.currentDamage;
      ctx.item.system.currentDamage = _replaceDieSize(formula, finalDie);
      log("Monk", `Martial Arts: ${ctx.actor.name} damage escalated → d${finalDie} (was d${baseDie})`);
    }
  },

  /* -------------------------------------------- */
  /*  Impetus (L4)                                 */
  /* -------------------------------------------- */

  /**
   * Detect passed Dodge (Reflex) saves from monks and post a reminder
   * about ignoring 2 highest damage dice instead of 1.
   * Same pattern as Pugilist Prowess.
   */
  async _checkImpetus(message) {
    const content = message.content || "";

    // Must be a save card with PASS
    if (!content.includes("save-roll") || !content.includes("PASS")) return;

    // Check if it's a Reflex save — header-title contains "Reflex Save"
    const titleMatch = content.match(/header-title[^>]*>([^<]+)/);
    const title = titleMatch?.[1]?.trim()?.toLowerCase();
    if (!title?.includes("reflex")) return;

    // Get the actor
    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId) return;
    const actor = game.actors.get(speakerActorId);
    if (!actor || actor.type !== "character") return;

    if (!hasFeature(actor, "monk_impetus")) return;

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="impetus">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-wind"></i> <strong>Impetus:</strong>
              ${actor.name} ignores <strong>two</strong> highest damage dice (not just one).
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    log("Monk", `Impetus: ${actor.name} passed Dodge — ignore 2 highest dice`);
  }
};
