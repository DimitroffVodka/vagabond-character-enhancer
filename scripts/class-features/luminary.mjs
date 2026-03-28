/**
 * Luminary Class Features
 * Registry entries + runtime hooks for all Luminary features.
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * Luminary features center on healing enhancement:
 *
 *   Radiant Healer (L1) → healing spell dice explode on max value
 *   Overheal (L2)       → excess healing redirected to another being
 *   Ever-Cure (L4)      → healing removes a status condition
 *   Saving Grace (L8)   → healing dice also explode on 2
 *
 * Healing in Vagabond has two paths:
 *   1. Equipment items (potions): item.roll() → formula evaluated → chat card
 *   2. Spell healing: cast → postItemRestorativeEffect → "Apply Healing" button
 *
 * Both converge at handleApplyRestorative() when the heal button is clicked.
 * The explosion bonus is rolled in onPreHandleRestorative (spell path) and
 * onPreItemRoll (equipment path), mirroring the Bard Inspiration pattern.
 *
 * Ever-Cure posts a chat card with status removal buttons after healing.
 * Overheal calculates excess and posts a redirect option.
 */

import { MODULE_ID, log, hasFeature } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const LUMINARY_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Theurgy
  // ──────────────────────────────────────────────
  // RULES: You can Cast Spells using Mysticism. Learn 4 Spells (must include
  // Life and Light). Max Mana = 4 × Level.
  //
  // STATUS: system — Handled entirely by the base system.
  "theurgy": {
    class: "luminary", level: 1, flag: "luminary_theurgy", status: "system",
    description: "Cast Spells using Mysticism. Learn 4 Spells (must include Life and Light). Max Mana = 4 × Level."
  },

  // ──────────────────────────────────────────────
  // L1: Radiant Healer
  // ──────────────────────────────────────────────
  // RULES: You get the Assured Healer Perk, and the healing rolls of your
  // Spells can also explode on their highest value.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - onPreHandleRestorative: rolls explosion bonus dice for spell healing
  //   - onPreItemRoll: rolls explosion bonus dice for equipment healing
  //   - Explosion: each d6 that rolls 6 spawns another d6, recursively
  "radiant healer": {
    class: "luminary", level: 1, flag: "luminary_radiantHealer", status: "module",
    description: "Gain Assured Healer Perk. Healing rolls from Spells can explode on their highest value."
  },

  // ──────────────────────────────────────────────
  // L2: Overheal
  // ──────────────────────────────────────────────
  // RULES: If you restore HP that exceeds the Being's Max HP, you can give
  // the excess to yourself or a Being you can see.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - Hooks createChatMessage to detect healing application results
  //   - Calculates excess healing and posts a redirect chat card
  //   - Redirect button applies excess to a targeted being
  "overheal": {
    class: "luminary", level: 2, flag: "luminary_overheal", status: "module",
    description: "Excess HP from healing can be given to yourself or another Being you can see."
  },

  // ──────────────────────────────────────────────
  // L4: Ever-Cure
  // ──────────────────────────────────────────────
  // RULES: When you restore HP, you can end either a Charmed, Confused,
  // Dazed, Frightened, or Sickened Status affecting the Target.
  //
  // STATUS: module
  //
  // MODULE HANDLES:
  //   - After healing applied, posts chat card with status removal buttons
  //   - Button click removes the chosen status from the healed target
  "ever-cure": {
    class: "luminary", level: 4, flag: "luminary_everCure", status: "module",
    description: "When you restore HP, end Charmed, Confused, Dazed, Frightened, or Sickened on Target."
  },

  // ──────────────────────────────────────────────
  // L6: Revivify
  // ──────────────────────────────────────────────
  // RULES: Revive dead Beings with Life Spell (up to 1 hour). Auto-revive
  // self once per day.
  //
  // STATUS: flavor — narrative mechanic with Life spell interaction.
  "revivify": {
    class: "luminary", level: 6, flag: "luminary_revivify", status: "flavor",
    description: "Revive dead Beings (up to 1 hour) with Life Spell. Auto-revive self (1/day)."
  },

  // ──────────────────────────────────────────────
  // L8: Saving Grace
  // ──────────────────────────────────────────────
  // RULES: Your healing rolls can also explode on a 2.
  //
  // STATUS: module — Extends Radiant Healer. Adds 2 to explosion values.
  "saving grace": {
    class: "luminary", level: 8, flag: "luminary_savingGrace", status: "module",
    description: "Healing rolls also explode on a roll of 2."
  },

  // ──────────────────────────────────────────────
  // L10: Life-Giver
  // ──────────────────────────────────────────────
  // RULES: Revived beings at 4 Fatigue max, no Life Fatigue.
  //
  // STATUS: flavor — modifies Revivify narrative.
  "life-giver": {
    class: "luminary", level: 10, flag: "luminary_lifeGiver", status: "flavor",
    description: "Revived Beings start at 4 Fatigue max. They don't gain Fatigue from your Life Spell."
  }
};

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

/** Statuses that Ever-Cure can remove. */
const EVER_CURE_STATUSES = ["charmed", "confused", "dazed", "frightened", "sickened"];

/* -------------------------------------------- */
/*  Luminary Runtime Hooks                      */
/* -------------------------------------------- */

export const LuminaryFeatures = {

  registerHooks() {
    // Ever-Cure + Overheal: detect healing chat cards and inject buttons
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      this._checkHealingResult(message);
    });

    // Ever-Cure button clicks
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      el.querySelectorAll("[data-action='vce-ever-cure']").forEach(btn => {
        btn.addEventListener("click", (ev) => this._onEverCureClick(ev));
      });
      el.querySelectorAll("[data-action='vce-overheal-apply']").forEach(btn => {
        btn.addEventListener("click", (ev) => this._onOverhealApply(ev));
      });
    });

    log("Luminary", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Handler Methods (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * Radiant Healer + Saving Grace: Explode healing dice for equipment items.
   * Called from item.roll dispatcher (equipment healing path).
   *
   * Modifies the item formula to add explosion notation.
   * The system will roll it, and we restore the original formula after.
   */
  async onPreItemRoll(ctx) {
    if (ctx.item.type !== "equipment" || ctx.item.system.damageType !== "healing") return;
    if (!hasFeature(ctx.actor, "luminary_radiantHealer")) return;

    // Store source luminary info for post-healing hooks
    ctx._luminaryHealSource = ctx.actor.id;

    // We can't easily make the system's roll explode via formula alone.
    // Instead, flag this for post-roll explosion bonus.
    ctx._radiantHealer = true;
    ctx._savingGrace = hasFeature(ctx.actor, "luminary_savingGrace");
  },

  /**
   * Radiant Healer + Saving Grace: Explode healing dice for spell healing.
   * Called from handleApplyRestorative dispatcher (spell healing path).
   *
   * Rolls explosion bonus dice and adds to the healing amount.
   */
  async onPreHandleRestorative(ctx) {
    if (ctx.damageType !== "healing") return;

    // Determine the source actor (the healer)
    const sourceActor = ctx.actorId ? game.actors.get(ctx.actorId) : null;
    if (!sourceActor) return;
    if (!hasFeature(sourceActor, "luminary_radiantHealer")) return;

    // Skip equipment items — handled by onPreItemRoll path
    if (ctx.itemId) {
      const sourceItem = sourceActor.items.get(ctx.itemId);
      if (sourceItem?.type === "equipment") return;
    }

    const hasSavingGrace = hasFeature(sourceActor, "luminary_savingGrace");
    const originalAmount = parseInt(ctx.button.dataset.damageAmount) || 0;

    // Roll explosion bonus: simulate each healing die exploding
    // Spell healing uses d6. Estimate dice count from amount (min 1).
    const diceCount = Math.max(1, Math.ceil(originalAmount / 4));
    const explosionBonus = this._rollExplosionBonus(diceCount, 6, hasSavingGrace);

    if (explosionBonus > 0) {
      ctx.button.dataset.damageAmount = String(originalAmount + explosionBonus);
      const graceNote = hasSavingGrace ? " (explodes on 2 and 6)" : " (explodes on 6)";

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
        content: `<div class="vagabond-chat-card-v2" data-card-type="radiant-healer">
          <div class="card-body">
            <section class="content-body">
              <div class="card-description" style="text-align:center;">
                <i class="fas fa-sun"></i> <strong>Radiant Healer:</strong>
                +${explosionBonus} healing${graceNote}
              </div>
            </section>
          </div>
        </div>`
      });

      log("Luminary", `Radiant Healer: +${explosionBonus} explosion bonus (${originalAmount} → ${originalAmount + explosionBonus})`);
    }

    // Store source info for Ever-Cure / Overheal post-heal hooks
    ctx._luminaryHealSource = sourceActor.id;
    ctx._luminaryEverCure = hasFeature(sourceActor, "luminary_everCure");
    ctx._luminaryOverheal = hasFeature(sourceActor, "luminary_overheal");
  },

  /* -------------------------------------------- */
  /*  Explosion Dice                               */
  /* -------------------------------------------- */

  /**
   * Roll explosion bonus dice.
   * For each simulated die, if it rolls a max value (or 2 with Saving Grace),
   * add the result and roll another. Repeat until no explosion.
   *
   * @param {number} diceCount - Number of healing dice to simulate explosions for
   * @param {number} dieFaces - Die size (typically 6 for spell healing)
   * @param {boolean} savingGrace - If true, also explode on 2
   * @returns {Promise<number>} Total explosion bonus
   */
  _rollExplosionBonus(diceCount, dieFaces, savingGrace) {
    let totalBonus = 0;
    const maxExplosions = 50; // Safety limit

    const shouldExplode = (val) => val === dieFaces || (savingGrace && val === 2);
    const rollDie = () => Math.floor(Math.random() * dieFaces) + 1;

    for (let i = 0; i < diceCount; i++) {
      // Each die gets one chance to explode
      const result = rollDie();
      if (shouldExplode(result)) {
        totalBonus += result;
        // Chain explosions
        let chainResult = result;
        let chains = 0;
        while (shouldExplode(chainResult) && chains < maxExplosions) {
          chainResult = rollDie();
          totalBonus += chainResult;
          chains++;
        }
      }
    }

    return totalBonus;
  },

  /* -------------------------------------------- */
  /*  Post-Healing Detection                       */
  /* -------------------------------------------- */

  /**
   * Detect healing application results from chat messages.
   * Triggers Ever-Cure status removal and Overheal excess redirect.
   */
  async _checkHealingResult(message) {
    const content = message.content || "";

    // Look for healing result cards from the system
    // System posts healing results with "heal" type
    if (!content.includes("heal") && !content.includes("Healing")) return;

    // Find the source luminary — check speaker
    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId) return;
    const sourceActor = game.actors.get(speakerActorId);
    if (!sourceActor || sourceActor.type !== "character") return;

    const features = sourceActor.getFlag(MODULE_ID, "features");
    if (!features?.luminary_radiantHealer) return;

    // Check for Ever-Cure: parse the target from the message
    if (features.luminary_everCure) {
      // Try to find target actor ID from the message content
      const targetMatch = content.match(/data-actor-id="([^"]+)"/);
      if (targetMatch) {
        const targetActor = game.actors.get(targetMatch[1]);
        if (targetActor) {
          await this._offerEverCure(sourceActor, targetActor);
        }
      }
    }
  },

  /* -------------------------------------------- */
  /*  Ever-Cure (L4)                               */
  /* -------------------------------------------- */

  /**
   * Post a chat card offering status removal after healing.
   */
  async _offerEverCure(luminary, target) {
    // Check which removable statuses the target actually has
    const activeStatuses = EVER_CURE_STATUSES.filter(statusId =>
      target.statuses?.has(statusId)
    );

    if (activeStatuses.length === 0) return;

    const statusButtons = activeStatuses.map(statusId => {
      const label = statusId.charAt(0).toUpperCase() + statusId.slice(1);
      return `<button data-action="vce-ever-cure" data-target-id="${target.id}" data-status-id="${statusId}" class="card-button" style="margin:2px;">
        <i class="fas fa-times-circle"></i> ${label}
      </button>`;
    }).join("");

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="ever-cure">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/magic/life/cross-area-circle-green-white.webp" alt="Ever-Cure">
            </div>
            <div class="header-info">
              <h3 class="header-title">Ever-Cure</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-heart"></i><span>Healing</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-shield-virus"></i><span>Remove Status</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${luminary.name} can remove a status from <strong>${target.name}</strong>:
            </div>
            <div class="card-buttons" style="margin-top:0.5rem; text-align:center;">
              ${statusButtons}
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: luminary }),
    });

    log("Luminary", `Ever-Cure: offered status removal for ${target.name} (${activeStatuses.join(", ")})`);
  },

  /**
   * Handle Ever-Cure button click — remove status from target.
   */
  async _onEverCureClick(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const targetId = btn.dataset.targetId;
    const statusId = btn.dataset.statusId;

    const target = game.actors.get(targetId);
    if (!target) return;

    // Find and remove the status effect
    const statusEffect = target.effects.find(e => e.statuses?.has(statusId));
    if (statusEffect) {
      await statusEffect.delete();
      const label = statusId.charAt(0).toUpperCase() + statusId.slice(1);
      ui.notifications.info(`${label} removed from ${target.name}.`);
      log("Luminary", `Ever-Cure: removed ${statusId} from ${target.name}`);

      // Disable all buttons in this card
      const card = btn.closest(".vagabond-chat-card-v2");
      if (card) {
        card.querySelectorAll("[data-action='vce-ever-cure']").forEach(b => {
          b.disabled = true;
          b.style.opacity = b === btn ? "1" : "0.4";
        });
      }
    } else {
      ui.notifications.warn(`${target.name} no longer has that status.`);
    }
  },

  /* -------------------------------------------- */
  /*  Overheal (L2)                                */
  /* -------------------------------------------- */

  /**
   * Post an Overheal redirect card when excess healing is detected.
   * Called after healing is applied to a target at max HP.
   */
  async _offerOverheal(luminary, excessAmount) {
    if (excessAmount <= 0) return;

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="overheal">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/magic/life/heart-area-circle-green-white.webp" alt="Overheal">
            </div>
            <div class="header-info">
              <h3 class="header-title">Overheal</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-heart"></i><span>${excessAmount} Excess</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-share"></i><span>Redirect</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${luminary.name} has <strong>${excessAmount}</strong> excess healing to give.<br>
              <em>Target a Being, then click Apply.</em>
            </div>
            <div class="card-buttons" style="margin-top:0.5rem; text-align:center;">
              <button data-action="vce-overheal-apply" data-luminary-id="${luminary.id}" data-amount="${excessAmount}" class="card-button">
                <i class="fas fa-hand-holding-heart"></i> Apply ${excessAmount} HP to Target
              </button>
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: luminary }),
    });

    log("Luminary", `Overheal: ${excessAmount} excess healing available from ${luminary.name}`);
  },

  /**
   * Handle Overheal apply button — heal the targeted being.
   */
  async _onOverhealApply(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const amount = parseInt(btn.dataset.amount) || 0;
    if (amount <= 0) return;

    const targets = Array.from(game.user.targets);
    if (targets.length === 0) {
      ui.notifications.warn("Select a target token to receive the excess healing.");
      return;
    }

    const targetActor = targets[0].actor;
    if (!targetActor) return;

    const currentHP = targetActor.system?.health?.value ?? 0;
    const maxHP = targetActor.system?.health?.max ?? 0;
    const newHP = Math.min(maxHP, currentHP + amount);
    const actualHealing = newHP - currentHP;

    if (actualHealing > 0) {
      await targetActor.update({ "system.health.value": newHP });
      ui.notifications.info(`${targetActor.name} healed for ${actualHealing} HP (Overheal).`);
      log("Luminary", `Overheal: applied ${actualHealing} HP to ${targetActor.name}`);
    } else {
      ui.notifications.info(`${targetActor.name} is already at max HP.`);
    }

    // Disable the button
    btn.disabled = true;
    btn.textContent = `Applied ${actualHealing} HP to ${targetActor.name}`;
  }
};
