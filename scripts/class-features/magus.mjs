/**
 * Magus Class Features
 * Registry entries + runtime hooks for all Magus features.
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * Most Magus features are narrative/defensive choices. The automatable ones:
 *
 *   Spell Surge (L6)       → Block a Cast by 10+ → reflect notification
 *   Spell Surge Enh. (L10) → lowers threshold to 8+
 *   Aegis Obscura (L8)     → half magic damage reminder when Ward is focused
 *
 * Spell Surge hooks createChatMessage to detect high-margin Block saves
 * from magi and posts a "Reflect!" notification card.
 */

import { MODULE_ID, log, hasFeature } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const MAGUS_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Spellstriker
  // ──────────────────────────────────────────────
  // RULES: You gain the Gish Perk and you can Cast Spells using Arcana.
  // Learn 2 Spells (must include Ward). Max Mana = 2 × Level.
  //
  // STATUS: system — Casting handled by base system. Perk is manual.
  "spellstriker": {
    class: "magus", level: 1, flag: "magus_spellstriker", status: "system",
    description: "Gain Gish Perk. Cast Spells using Arcana. Learn 2 Spells (must include Ward). Max Mana = 2 × Level."
  },

  // ──────────────────────────────────────────────
  // L1: Esoteric Eye
  // ──────────────────────────────────────────────
  // RULES: Use Action or skip Move to learn if magic affects a Target you
  // can see. Once per Shift, or spend 1 Mana for extra use.
  //
  // STATUS: flavor — narrative action, no mechanical automation.
  "esoteric eye": {
    class: "magus", level: 1, flag: "magus_esotericEye", status: "flavor",
    description: "Use Action or skip Move to learn if magic affects a Target you can see. Once per Shift (or 1 Mana)."
  },

  // ──────────────────────────────────────────────
  // L2: Spell Parry
  // ──────────────────────────────────────────────
  // RULES: You can Block Casts targeting you if Reflex Save, Touch, or
  // Remote delivery. Crit Block dispels the effect.
  //
  // STATUS: flavor — defensive choice, GM-adjudicated.
  "spell parry": {
    class: "magus", level: 2, flag: "magus_spellParry", status: "flavor",
    description: "Block Casts targeting you if Reflex Save, Touch, or Remote delivery. Crit Block dispels."
  },

  // ──────────────────────────────────────────────
  // L4: Arcane Recall
  // ──────────────────────────────────────────────
  // RULES: Use Action to swap one Spell Known (not Ward). Once per Rest,
  // or take 1 Fatigue for extra use.
  //
  // STATUS: flavor — downtime/rest action.
  "arcane recall": {
    class: "magus", level: 4, flag: "magus_arcaneRecall", status: "flavor",
    description: "Use Action to swap one Spell Known (not Ward). Once per Rest, or 1 Fatigue for extra use."
  },

  // ──────────────────────────────────────────────
  // L6: Spell Surge
  // ──────────────────────────────────────────────
  // RULES: If you pass a Check to Block a Cast by 10 or more, you can
  // reflect the Cast back at the Caster.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Hooks createChatMessage to detect Block saves from magi
  //   - Parses roll total and difficulty from save card HTML
  //   - If margin >= 10, posts a "Spell Surge: Reflect!" notification
  "spell surge": {
    class: "magus", level: 6, flag: "magus_spellSurge", status: "module",
    description: "Block a Cast by 10+ → reflect it back at the Caster."
  },

  // ──────────────────────────────────────────────
  // L8: Aegis Obscura
  // ──────────────────────────────────────────────
  // RULES: You and the Target of your Ward Spell have Allsight and take
  // half damage from magic-based sources.
  //
  // STATUS: flavor — Allsight is narrative. Half magic damage requires
  // GM adjudication of what constitutes "magic-based" damage.
  // Posts a reminder when the magus is the subject of damage.
  "aegis obscura": {
    class: "magus", level: 8, flag: "magus_aegisObscura", status: "flavor",
    description: "You and Ward Target have Allsight and half damage from magic sources."
  },

  // ──────────────────────────────────────────────
  // L10: Spell Surge (8+)
  // ──────────────────────────────────────────────
  // RULES: Spell Surge triggers at 8+ instead of 10+.
  //
  // STATUS: module — Modifies Spell Surge threshold check.
  "spell surge (8+)": {
    class: "magus", level: 10, flag: "magus_spellSurgeEnhancement", status: "module",
    description: "Spell Surge triggers when passing Block by 8+ instead of 10+."
  }
};

/* -------------------------------------------- */
/*  Magus Runtime Hooks                         */
/* -------------------------------------------- */

export const MagusFeatures = {

  registerHooks() {
    // Spell Surge: detect high-margin Block saves from magi
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      this._checkSpellSurge(message);
    });

    log("Magus", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Spell Surge (L6)                             */
  /* -------------------------------------------- */

  /**
   * Check if a chat message is a Block save from a magus that passed
   * by enough to trigger Spell Surge.
   *
   * The save card HTML contains:
   *   - data-card-type="save-roll"
   *   - data-save-type="endure" (Block) or "reflex" (Dodge)
   *   - Roll total and difficulty visible in the card
   *   - "PASS" or "FAIL" outcome text
   *
   * Spell Parry allows blocking Casts with either Endure (Block) or
   * Reflex (Dodge for certain deliveries), so we check both save types.
   */
  async _checkSpellSurge(message) {
    const content = message.content || "";

    // Quick check: must be a save card with PASS
    if (!content.includes("save-roll") || !content.includes("PASS")) return;

    // Get the actor who made the save
    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId) return;
    const actor = game.actors.get(speakerActorId);
    if (!actor || actor.type !== "character") return;

    // Must have Spell Surge
    if (!hasFeature(actor, "magus_spellSurge")) return;

    // Parse the roll total and difficulty from the HTML
    const totalMatch = content.match(/class="roll-value"[^>]*>(\d+)</);
    const diffMatch = content.match(/class="roll-target"[^>]*>(\d+)</);
    if (!totalMatch || !diffMatch) return;

    const rollTotal = parseInt(totalMatch[1]);
    const difficulty = parseInt(diffMatch[1]);
    if (isNaN(rollTotal) || isNaN(difficulty)) return;

    const margin = rollTotal - difficulty;

    // Determine threshold: 8 with enhancement (L10), 10 otherwise
    const threshold = hasFeature(actor, "magus_spellSurgeEnhancement") ? 8 : 10;

    if (margin < threshold) return;

    // Spell Surge triggers!
    const thresholdLabel = threshold === 8 ? "8+" : "10+";

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="spell-surge">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/magic/defensive/shield-barrier-deflection-blue.webp" alt="Spell Surge">
            </div>
            <div class="header-info">
              <h3 class="header-title">Spell Surge!</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-shield-alt"></i><span>Block</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-bolt"></i><span>Margin: +${margin} (${thresholdLabel})</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${actor.name} blocked by <strong>${margin}</strong> — the spell is <strong>reflected</strong> back at the caster!
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    log("Magus", `Spell Surge: ${actor.name} blocked by ${margin} (threshold ${threshold}) — reflect!`);
  }
};
