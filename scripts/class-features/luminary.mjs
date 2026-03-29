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
 * Radiant Healer + Saving Grace use the system's built-in explosion support:
 *   - postScan hook persistently sets canExplode + explodeValues on
 *     healing spell items via spell.update()
 *   - VagabondDamageHelper.rollSpellDamage calls _manuallyExplodeDice natively
 *   - The "Spells" qualifier means only spell healing explodes, not equipment
 *
 * Overheal + Ever-Cure trigger after handleApplyRestorative completes:
 *   - Pre-heal HP snapshot is compared to post-heal state
 *   - Excess healing (amount - actualHealing) triggers Overheal redirect card
 *   - Removable statuses on healed target trigger Ever-Cure card
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
  //   - castSpell patch temporarily sets spell.system.canExplode + explodeValues
  //   - System's rollSpellDamage calls _manuallyExplodeDice with those values
  //   - Only applies to spells with damageType "healing"
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
  //   - onPostHandleRestorative compares pre/post HP to detect excess
  //   - Posts a redirect card with the excess amount
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
  //   - onPostHandleRestorative checks healed targets for removable statuses
  //   - Posts chat card with status removal buttons
  //   - Button click removes the chosen status
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

    // Radiant Healer + Saving Grace: sync explosion settings on healing spells
    Hooks.on(`${MODULE_ID}.postScan`, (actor, features) => {
      this._syncHealingExplosion(actor);
    });

    log("Luminary", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Radiant Healer + Saving Grace: Spell Explosion */
  /* -------------------------------------------- */

  /**
   * Sync explosion settings on all healing spells for a Luminary actor.
   * Called from preSyncEffects during feature detection. Persistently updates
   * canExplode/explodeValues on healing spell items so the system's native
   * _manuallyExplodeDice handles explosion during rollSpellDamage.
   */
  async _syncHealingExplosion(actor) {
    const hasRadiant = hasFeature(actor, "luminary_radiantHealer");
    const hasSavingGrace = hasFeature(actor, "luminary_savingGrace");

    const healingSpells = actor.items.filter(i => i.type === "spell" && i.system.damageType === "healing");
    if (healingSpells.length === 0) return;

    for (const spell of healingSpells) {
      if (hasRadiant) {
        // Assured Healer (granted by Radiant Healer): explode on 1
        // Radiant Healer: "also" explode on highest value (die size)
        // Saving Grace (L8): also explode on 2
        const baseDieSize = spell.system.damageDieSize || 6;
        const dieSize = baseDieSize + (actor.system.spellDamageDieSizeBonus || 0);
        const values = [1, dieSize];
        if (hasSavingGrace) values.push(2);
        const explodeValues = [...new Set(values)].join(",");

        if (!spell.system.canExplode || spell.system.explodeValues !== explodeValues) {
          await spell.update({ "system.canExplode": true, "system.explodeValues": explodeValues });
          log("Luminary", `Radiant Healer: set ${spell.name} to explode on [${explodeValues}]`);
        }
      } else {
        // Not a Luminary with Radiant Healer — remove explosion if we previously set it
        if (spell.system.canExplode) {
          await spell.update({ "system.canExplode": false, "system.explodeValues": "" });
          log("Luminary", `Radiant Healer: cleared explosion on ${spell.name}`);
        }
      }
    }
  },

  /* -------------------------------------------- */
  /*  Handler Methods (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * Post-healing handler for Overheal + Ever-Cure.
   * Called after handleApplyRestorative completes. Compares pre-heal HP
   * snapshots to current state to detect excess healing and offer features.
   *
   * @param {object} ctx - { actorId, damageType, healAmount }
   * @param {Map<string,number>} preHealHP - Map of targetActorId → HP before healing
   * @param {Array} targetActors - Array of target actors that were healed
   */
  async onPostHandleRestorative(ctx, preHealHP, targetActors) {
    if (ctx.damageType !== "healing") return;

    const sourceActor = ctx.actorId ? game.actors.get(ctx.actorId) : null;
    if (!sourceActor) return;

    const hasOverheal = hasFeature(sourceActor, "luminary_overheal");
    const hasEverCure = hasFeature(sourceActor, "luminary_everCure");
    if (!hasOverheal && !hasEverCure) return;

    const healAmount = parseInt(ctx.button.dataset.damageAmount) || 0;

    for (const targetActor of targetActors) {
      if (!targetActor) continue;

      const prevHP = preHealHP.get(targetActor.id) ?? 0;
      const currentHP = targetActor.system.health?.value ?? 0;
      const maxHP = targetActor.system.health?.max ?? 0;
      const actualHealing = currentHP - prevHP;

      // Account for healing modifier (Sickened etc.)
      const healingModifier = targetActor.system.incomingHealingModifier || 0;
      const modifiedAmount = Math.max(0, healAmount + healingModifier);
      const excess = modifiedAmount - actualHealing;

      // Overheal: redirect excess HP
      if (hasOverheal && excess > 0 && actualHealing >= 0) {
        await this._offerOverheal(sourceActor, excess);
      }

      // Ever-Cure: offer status removal if HP was actually restored
      if (hasEverCure && actualHealing > 0) {
        await this._offerEverCure(sourceActor, targetActor);
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
   */
  async _offerOverheal(luminary, excessAmount) {
    if (excessAmount <= 0) return;

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="overheal">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/magic/life/heart-cross-green.webp" alt="Overheal">
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
