/**
 * Pugilist Class Features
 * Registry entries + runtime hooks for all Pugilist features.
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * Pugilist features center on Brawl combat:
 *
 *   Fisticuffs (L1)  → d4 min brawl, second attack, favor grapple (partial)
 *   Prowess (L4)     → Block ignores 2 highest dice (chat reminder)
 *   Haymaker (L6)    → pass Brawl by 10+ → Dazed
 *   Impact (L8)      → brawl d6 (managed AE, already working)
 *   Haymaker+ (L10)  → threshold lowered to 8+
 *
 * Haymaker hooks createChatMessage to detect high-margin Brawl attacks
 * and applies Dazed to the target. Same pattern as Magus Spell Surge.
 *
 * Prowess hooks createChatMessage to detect passed Block saves from
 * pugilists and posts a reminder about ignoring 2 dice.
 */

import { MODULE_ID, log, hasFeature } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const PUGILIST_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Fisticuffs
  // ──────────────────────────────────────────────
  // RULES: While only using Brawl Weapons, you can use a d4 if the damage
  // was previously lower. Once per Round, spend half Speed for second attack.
  // If Favor on Brawl and hit a viable target, can Grapple or Shove.
  //
  // STATUS: flavor — d4 minimum is already the base system Unarmed damage.
  // Second attack and favor grapple are action economy / GM-adjudicated.
  "fisticuffs": {
    class: "pugilist", level: 1, flag: "pugilist_fisticuffs", status: "flavor",
    description: "Brawl Weapons use d4 minimum. Spend half Speed for second attack. Favor → Grapple/Shove."
  },

  // ──────────────────────────────────────────────
  // L1: Rope-a-Dope
  // ──────────────────────────────────────────────
  // RULES: You gain the Check Hook Perk and can make two attacks with it.
  //
  // STATUS: flavor — Perk grant is manual, action count is GM-tracked.
  "rope-a-dope": {
    class: "pugilist", level: 1, flag: "pugilist_ropeADope", status: "flavor",
    description: "Gain Check Hook Perk. Make two attacks with it instead of one."
  },

  // ──────────────────────────────────────────────
  // L2: Beat Rush
  // ──────────────────────────────────────────────
  // RULES: If you take the Rush Action, you can also make one Brawl attack.
  //
  // STATUS: flavor — action economy choice, GM-tracked.
  "beat rush": {
    class: "pugilist", level: 2, flag: "pugilist_beatRush", status: "flavor",
    description: "If you Rush, you can also make one Brawl Weapon attack."
  },

  // ──────────────────────────────────────────────
  // L4: Prowess
  // ──────────────────────────────────────────────
  // RULES: If you pass a Save to Block, you ignore two of the highest
  // rolled damage dice, rather than one.
  //
  // STATUS: module — Posts a chat reminder when pugilist passes a Block
  // save. The extra die removal is applied by the GM/system.
  "prowess": {
    class: "pugilist", level: 4, flag: "pugilist_prowess", status: "module",
    description: "On a passed Block Save, ignore two highest damage dice instead of one."
  },

  // ──────────────────────────────────────────────
  // L6: Haymaker
  // ──────────────────────────────────────────────
  // RULES: If you pass a Brawl Attack Check by 10 or more, the Target
  // is Dazed until your next Turn.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Hooks createChatMessage to detect Brawl attack results
  //   - Parses roll total and difficulty from chat card HTML
  //   - If margin >= 10, applies Dazed to the target
  "haymaker": {
    class: "pugilist", level: 6, flag: "pugilist_haymaker", status: "module",
    description: "Pass a Brawl Attack by 10+ → Target is Dazed until your next Turn."
  },

  // ──────────────────────────────────────────────
  // L8: Impact
  // ──────────────────────────────────────────────
  // RULES: You use a d6 for the damage die of your Brawl Weapons.
  //
  // STATUS: module — Managed AE: brawlDamageDieSizeBonus +2 (d4 → d6).
  "impact": {
    class: "pugilist", level: 8, flag: "pugilist_impact", status: "module",
    description: "Brawl Weapon damage die becomes d6.",
    effects: [{
      label: "Impact",
      icon: "icons/skills/melee/unarmed-punch-fist.webp",
      changes: [
        { key: "system.brawlDamageDieSizeBonus", mode: 2, value: "2" }
      ]
    }]
  },

  // ──────────────────────────────────────────────
  // L10: Haymaker (8+)
  // ──────────────────────────────────────────────
  // RULES: Haymaker triggers at 8+ instead of 10+.
  //
  // STATUS: module — Modifies Haymaker threshold check.
  "haymaker (8+)": {
    class: "pugilist", level: 10, flag: "pugilist_haymakerEnhancement", status: "module",
    description: "Haymaker triggers when passing Brawl by 8+ instead of 10+."
  }
};

/* -------------------------------------------- */
/*  Pugilist Runtime Hooks                      */
/* -------------------------------------------- */

export const PugilistFeatures = {

  registerHooks() {
    // Haymaker: detect high-margin Brawl attacks
    // Prowess: detect passed Block saves
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      this._checkHaymaker(message);
      this._checkProwess(message);
    });

    // Haymaker cleanup: remove Dazed at end of pugilist's next turn
    Hooks.on("updateCombat", (combat, changes) => {
      if (!game.user.isGM) return;
      if (!("turn" in changes) && !("round" in changes)) return;
      this._cleanupHaymakerDazed(combat);
    });

    log("Pugilist", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Haymaker (L6)                                */
  /* -------------------------------------------- */

  /**
   * Check if a chat message is a Brawl attack from a pugilist that passed
   * by enough to trigger Haymaker.
   *
   * Attack cards contain:
   *   - roll-skill-label with "Brawl"
   *   - roll-value (total) and roll-target (difficulty)
   *   - result-hit or result-miss CSS class
   */
  async _checkHaymaker(message) {
    const content = message.content || "";

    // Must be a hit
    if (!content.includes("result-hit")) return;

    // Must be a Brawl attack
    const skillMatch = content.match(/roll-skill-label[^<]*>([^<]+)/);
    if (!skillMatch || skillMatch[1].trim() !== "Brawl") return;

    // Get the actor
    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId) return;
    const actor = game.actors.get(speakerActorId);
    if (!actor || actor.type !== "character") return;

    // Must have Haymaker
    if (!hasFeature(actor, "pugilist_haymaker")) return;

    // Parse margin
    const totalMatch = content.match(/class="roll-value"[^>]*>(\d+)</);
    const diffMatch = content.match(/class="roll-target"[^>]*>(\d+)</);
    if (!totalMatch || !diffMatch) return;

    const rollTotal = parseInt(totalMatch[1]);
    const difficulty = parseInt(diffMatch[1]);
    if (isNaN(rollTotal) || isNaN(difficulty)) return;

    const margin = rollTotal - difficulty;
    const threshold = hasFeature(actor, "pugilist_haymakerEnhancement") ? 8 : 10;

    if (margin < threshold) return;

    // Haymaker triggers — apply Dazed to target
    const targets = Array.from(game.user.targets);
    const targetActor = targets[0]?.actor;

    if (targetActor) {
      // Apply Dazed status
      const dazedEffect = CONFIG.statusEffects?.find(s => s.id === "dazed");
      if (dazedEffect) {
        await targetActor.toggleStatusEffect("dazed", { active: true });
      }
    }

    const thresholdLabel = threshold === 8 ? "8+" : "10+";
    const targetName = targetActor?.name || "the target";

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="haymaker">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/skills/melee/unarmed-punch-fist.webp" alt="Haymaker">
            </div>
            <div class="header-info">
              <h3 class="header-title">Haymaker!</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-fist-raised"></i><span>Brawl</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-dizzy"></i><span>Margin: +${margin} (${thresholdLabel})</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${actor.name} lands a devastating blow by <strong>${margin}</strong> — <strong>${targetName}</strong> is <strong>Dazed</strong> until ${actor.name}'s next Turn!
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    log("Pugilist", `Haymaker: ${actor.name} hit by ${margin} (threshold ${threshold}) — ${targetName} Dazed!`);
  },

  /* -------------------------------------------- */
  /*  Prowess (L4)                                 */
  /* -------------------------------------------- */

  /**
   * Detect passed Block saves from pugilists and post a reminder
   * about ignoring 2 highest damage dice.
   */
  async _checkProwess(message) {
    const content = message.content || "";

    // Must be a save card with PASS
    if (!content.includes("save-roll") || !content.includes("PASS")) return;

    // Get the actor
    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId) return;
    const actor = game.actors.get(speakerActorId);
    if (!actor || actor.type !== "character") return;

    if (!hasFeature(actor, "pugilist_prowess")) return;

    // Check if it's an Endure save (Block)
    // The save type isn't always in the HTML, but Block uses Endure
    // We check for "Endure" in the skill label
    const skillMatch = content.match(/roll-skill-label[^<]*>([^<]+)/);
    const skill = skillMatch?.[1]?.trim()?.toLowerCase();
    if (skill !== "endure") return;

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="prowess">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-shield-alt"></i> <strong>Prowess:</strong>
              ${actor.name} ignores <strong>two</strong> highest damage dice (not just one).
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    log("Pugilist", `Prowess: ${actor.name} passed Block — ignore 2 highest dice`);
  },

  /* -------------------------------------------- */
  /*  Haymaker Cleanup                             */
  /* -------------------------------------------- */

  /**
   * Clean up Haymaker-applied Dazed at end of pugilist's next turn.
   * Note: This is a best-effort cleanup. The Dazed status from Haymaker
   * lasts "until your next Turn" — we track this via a flag on the effect.
   * For simplicity, we rely on the GM to manage Dazed duration manually,
   * since tracking which Dazed came from Haymaker vs other sources is complex.
   */
  async _cleanupHaymakerDazed(combat) {
    // Haymaker Dazed cleanup is left to GM for now.
    // The chat card clearly states the duration.
  }
};
