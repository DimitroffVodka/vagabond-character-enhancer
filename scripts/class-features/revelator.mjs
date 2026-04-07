/**
 * Revelator Class Features
 * Registry entries + runtime hooks for all Revelator features.
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * The Revelator is a frontline caster with healing and support features:
 *
 *   Righteous (L1)      → Cast using Leadership (system handles)
 *   Selfless (L1)       → Take damage for ally (chat card + redirect)
 *   Lay on Hands (L2)   → d6+Level healing, 2 uses/rest
 *   Paragon's Aura (L4) → Free Aura delivery + dual focus (AE + AuraManager)
 *   Divine Resolve (L6)  → Status immunities (managed AE)
 *   Holy Diver (L8)     → After Selfless, next attack favored + Presence damage
 *   Sacrosanct (L10)    → +2 to all Saves (managed AE)
 *
 * The Aura system is the centerpiece — uses AuraManager to create persistent
 * circle templates on the map that follow the Revelator token, applying
 * Exalt buffs to allies who enter the radius.
 */

import { MODULE_ID, log, hasFeature, combineFavor } from "../utils.mjs";
import { AuraManager } from "../aura/aura-manager.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const REVELATOR_REGISTRY = {
  // ──────────────────────────────────────────────
  // L1: Righteous
  // ──────────────────────────────────────────────
  // RULES: Gish Perk + Cast using Leadership. Learn 2 Spells (must include
  // Exalt). Max Mana = 2 × Level.
  //
  // STATUS: system — Casting handled by base system. Perk is manual.
  "righteous": {
    class: "revelator", level: 1, flag: "revelator_righteous", status: "system",
    description: "Gain Gish Perk. Cast Spells using Leadership. Learn 2 Spells (must include Exalt). Max Mana = 2 × Level."
  },

  // ──────────────────────────────────────────────
  // L1: Selfless
  // ──────────────────────────────────────────────
  // RULES: Once per Turn, when an Ally you can see takes damage, you can
  // choose to take the damage instead. Can't be reduced in any way.
  //
  // STATUS: module — Posts a "Selfless" chat card when an ally takes damage,
  // offering to redirect. Tracks once-per-turn usage.
  "selfless": {
    class: "revelator", level: 1, flag: "revelator_selfless", status: "module",
    description: "Once per Turn, when an Ally takes damage, take the damage instead (can't be reduced)."
  },

  // ──────────────────────────────────────────────
  // L2: Lay on Hands
  // ──────────────────────────────────────────────
  // RULES: Touch a Being to restore (d6 + Level) HP. 2 uses per Rest.
  //
  // STATUS: module — Chat card with "Lay on Hands" button, tracks uses
  // via actor flag. Divine Resolve (L6) also cures statuses.
  "lay on hands": {
    class: "revelator", level: 2, flag: "revelator_layOnHands", status: "module",
    description: "Touch a Being to restore (d6 + Level) HP. 2 uses per Rest."
  },

  // ──────────────────────────────────────────────
  // L4: Paragon's Aura
  // ──────────────────────────────────────────────
  // RULES: It doesn't cost you Mana to Cast a Spell as a 10' Aura, and
  // you can Focus on a Spell as Aura and one as Imbue simultaneously.
  //
  // STATUS: partial — Managed AE for +1 Focus max. AuraManager handles
  // persistent aura template + ally buff application.
  // TODO: Free Aura delivery (0 Mana for 10' Aura) not enforced — system
  // still deducts delivery Mana. Would need to intercept SpellHandler to
  // detect Aura delivery and zero out that cost for Revelators.
  "paragon's aura": {
    class: "revelator", level: 4, flag: "revelator_paragonsAura", status: "partial",
    description: "Free Aura spell delivery (no Mana). Focus on Aura + Imbue simultaneously.",
    effects: [{
      label: "Paragon's Aura",
      icon: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
      changes: [
        { key: "system.focus.maxBonus", mode: 2, value: "1" }
      ]
    }]
  },

  // ──────────────────────────────────────────────
  // L6: Divine Resolve
  // ──────────────────────────────────────────────
  // RULES: You can't be Blinded, Paralyzed, or Sickened. Lay on Hands
  // also cures these on targets.
  //
  // STATUS: module — Managed AE for status immunities.
  "divine resolve": {
    class: "revelator", level: 6, flag: "revelator_divineResolve", status: "module",
    description: "Can't be Blinded, Paralyzed, or Sickened. Lay on Hands cures these on targets.",
    effects: [{
      label: "Divine Resolve",
      icon: "icons/magic/holy/barrier-shield-winged-cross.webp",
      changes: [
        { key: "system.statusImmunities", mode: 2, value: "blinded" },
        { key: "system.statusImmunities", mode: 2, value: "paralyzed" },
        { key: "system.statusImmunities", mode: 2, value: "sickened" }
      ]
    }]
  },

  // ──────────────────────────────────────────────
  // L8: Holy Diver
  // ──────────────────────────────────────────────
  // RULES: After taking damage for an ally with Selfless, your next attack
  // before end of next Turn has Favor and adds Presence to damage.
  //
  // STATUS: todo — Grants a "Holy Diver" buff AE after Selfless triggers.
  // onPreRollAttack consumes the buff for Favor + Presence damage.
  // TODO: Buff currently persists until consumed. Should auto-expire at
  // end of next Turn (needs combat turn tracking). Also depends on
  // Selfless triggering correctly.
  "holy diver": {
    class: "revelator", level: 8, flag: "revelator_holyDiver", status: "todo",
    description: "After Selfless, next attack has Favor and adds Presence to damage."
  },

  // ──────────────────────────────────────────────
  // L10: Sacrosanct
  // ──────────────────────────────────────────────
  // RULES: +2 bonus to all Saves.
  //
  // STATUS: module — Managed AE.
  "sacrosanct": {
    class: "revelator", level: 10, flag: "revelator_sacrosanct", status: "module",
    description: "+2 bonus to all Saves.",
    effects: [{
      label: "Sacrosanct",
      icon: "icons/magic/holy/chalice-glowing-gold.webp",
      changes: [
        { key: "system.saves.reflex.bonus", mode: 2, value: "2" },
        { key: "system.saves.endure.bonus", mode: 2, value: "2" },
        { key: "system.saves.will.bonus", mode: 2, value: "2" }
      ]
    }]
  }
};

/* -------------------------------------------- */
/*  Revelator Runtime Hooks                     */
/* -------------------------------------------- */

export const RevelatorFeatures = {

  /** Track Selfless usage per turn */
  _selflessUsedThisTurn: new Map(),

  registerHooks() {
    // Initialize AuraManager
    AuraManager.registerHooks();

    // Lay on Hands button clicks
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      el.querySelectorAll("[data-action='vce-lay-on-hands']").forEach(btn => {
        btn.addEventListener("click", (ev) => this._onLayOnHandsClick(ev));
      });
      el.querySelectorAll("[data-action='vce-selfless-accept']").forEach(btn => {
        btn.addEventListener("click", (ev) => this._onSelflessAccept(ev));
      });
    });

    // Selfless: detect ally damage via chat messages
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      this._checkSelflessTrigger(message);
    });

    // Reset Selfless per-turn tracking
    Hooks.on("updateCombat", (combat, changes) => {
      if (!game.user.isGM) return;
      if ("turn" in changes || "round" in changes) {
        this._selflessUsedThisTurn.clear();
      }
    });

    // Lay on Hands: reset uses on rest
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      const content = message.content || "";
      if (content.includes("rest") || content.includes("Rest")) {
        this._resetLayOnHandsOnRest(message);
      }
    });

    // Inject "Use" button into Lay on Hands feature on the character sheet
    // Foundry v13 ApplicationV2 fires "renderApplicationV2", not "renderActorSheet".
    Hooks.on("renderApplicationV2", (app, html) => {
      const actor = app.actor || app.document;
      if (!actor || actor.type !== "character") return;
      if (!hasFeature(actor, "revelator_layOnHands")) return;

      const el = html instanceof HTMLElement ? html : html[0];
      // Find all feature entries and look for "Lay on Hands"
      const featureHeaders = el.querySelectorAll(".feature-header");
      for (const header of featureHeaders) {
        const nameEl = header.querySelector(".feature-name");
        if (!nameEl || nameEl.textContent.trim() !== "Lay on Hands") continue;

        // Get the accordion content (description) for this feature
        const featureLi = header.closest(".feature");
        if (!featureLi) continue;
        const descEl = featureLi.querySelector(".feature-description");
        if (!descEl) continue;

        // Don't inject twice
        if (descEl.querySelector(".vce-lay-on-hands-btn")) continue;

        const uses = actor.getFlag(MODULE_ID, "layOnHandsUses") ?? 2;
        const level = actor.system.attributes?.level?.value ?? 1;

        const btnContainer = document.createElement("div");
        btnContainer.style.cssText = "margin-top: 0.5rem; text-align: center;";
        btnContainer.innerHTML = `
          <button class="vce-lay-on-hands-btn" style="
            background: linear-gradient(135deg, #4a3728, #2a1f14);
            border: 1px solid #8b7355;
            color: #f0e6d2;
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85rem;
            width: 100%;
          ">
            <i class="fas fa-hand-holding-heart"></i>
            Heal (d6 + ${level}) — ${uses}/2 uses
          </button>
        `;
        descEl.appendChild(btnContainer);

        btnContainer.querySelector(".vce-lay-on-hands-btn").addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.useLayOnHands(actor);
        });
      }
    });

    log("Revelator", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Handler Methods (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * Holy Diver: Consume buff for attack favor.
   * Called from rollAttack dispatcher.
   */
  onPreRollAttack(ctx) {
    const holyDiverBuff = ctx.actor.effects?.find(e => e.getFlag(MODULE_ID, "holyDiverBuff"));
    if (!holyDiverBuff || ctx.favorHinder === "favor") return;
    ctx.favorHinder = combineFavor(ctx.favorHinder, "favor");
    // Delete the AE (consumed) — fire-and-forget
    holyDiverBuff.delete().catch(e => console.warn(`${MODULE_ID} | Holy Diver cleanup failed:`, e));
    log("Revelator", `Holy Diver: consumed — attack favored for ${ctx.actor.name}`);
  },

  /* -------------------------------------------- */
  /*  Selfless (L1)                                */
  /* -------------------------------------------- */

  /**
   * Detect ally damage and offer Selfless redirect.
   */
  async _checkSelflessTrigger(message) {
    const content = message.content || "";
    // Only trigger on actual damage application results, not attack/action cards.
    // The system posts damage results in two formats:
    //   - "damage applied — HP: 20 → 14" (chat-card.mjs direct damage)
    //   - "damage applied to {name}'s HP" (damage-helper.mjs save path)
    if (!content.includes("damage applied")) return;
    // Skip "no damage applied" cards
    if (content.includes("no damage applied")) return;

    // Parse RAW damage (pre-armor, pre-save) from the card.
    // Selfless takes the full unmitigated damage — "can't be reduced in any way."
    //
    // The system's damage cards have a damage-component with title "Damage" or
    // "Total Damage" showing the raw roll total before armor/reductions.
    // Fallback to damage-final (post-armor) if the raw component isn't found.
    let damageAmount = 0;
    const rawMatch = content.match(/damage-component[^>]*title="(?:Total )?Damage"[^>]*>[\s\S]*?(\d+)/);
    if (rawMatch) {
      damageAmount = parseInt(rawMatch[1]);
    }
    if (!damageAmount) {
      // Fallback: HP change "HP: 20 → 14"
      const hpMatch = content.match(/HP:\s*(\d+)\s*→\s*(\d+)/);
      if (hpMatch) damageAmount = parseInt(hpMatch[1]) - parseInt(hpMatch[2]);
    }
    if (!damageAmount) {
      // Fallback: damage-final (post-armor, but better than nothing)
      const finalMatch = content.match(/damage-final[^>]*>\s*(\d+)/);
      if (finalMatch) damageAmount = parseInt(finalMatch[1]);
    }
    if (!damageAmount || damageAmount <= 0) return;

    // Also parse the final (post-armor) damage that was actually applied to the ally,
    // so we know exactly how much HP to restore.
    let appliedDamage = 0;
    const appliedMatch = content.match(/damage-final[^>]*>\s*(\d+)/);
    if (appliedMatch) appliedDamage = parseInt(appliedMatch[1]);
    if (!appliedDamage) {
      const hpMatch2 = content.match(/HP:\s*(\d+)\s*→\s*(\d+)/);
      if (hpMatch2) appliedDamage = parseInt(hpMatch2[1]) - parseInt(hpMatch2[2]);
    }
    if (!appliedDamage) appliedDamage = damageAmount; // fallback to raw

    // Find revelators with Selfless in active combat
    if (!game.combat) return;
    for (const combatant of game.combat.combatants) {
      const actor = combatant.actor;
      if (!actor || actor.type !== "character") continue;
      if (!hasFeature(actor, "revelator_selfless")) continue;
      if (this._selflessUsedThisTurn.get(actor.id)) continue;

      // Check if the damage target is a different ally
      const speakerActorId = message.speaker?.actor;
      if (!speakerActorId || speakerActorId === actor.id) continue;
      const damagedActor = game.actors.get(speakerActorId);
      if (!damagedActor || damagedActor.type !== "character") continue;

      // Offer Selfless
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="selfless">
          <div class="card-body">
            <header class="card-header">
              <div class="header-icon">
                <img src="icons/magic/holy/barrier-shield-winged-cross.webp" alt="Selfless">
              </div>
              <div class="header-info">
                <h3 class="header-title">Selfless</h3>
                <div class="metadata-tags-row">
                  <div class="meta-tag tag-skill"><i class="fas fa-shield-alt"></i><span>${actor.name}</span></div>
                  <span class="tag-separator">//</span>
                  <div class="meta-tag tag-standard"><i class="fas fa-heart-broken"></i><span>${damageAmount} damage</span></div>
                </div>
              </div>
            </header>
            <section class="content-body">
              <div class="card-description" style="text-align:center;">
                ${actor.name} can take <strong>${damageAmount} damage</strong> instead of ${damagedActor.name}.<br>
                <em>This damage can't be reduced in any way.</em>
              </div>
              <div class="card-buttons" style="margin-top:0.5rem; text-align:center;">
                <button data-action="vce-selfless-accept"
                        data-revelator-id="${actor.id}"
                        data-target-id="${damagedActor.id}"
                        data-damage="${damageAmount}"
                        data-applied-damage="${appliedDamage}"
                        class="card-button">
                  <i class="fas fa-shield-alt"></i> Take the Damage
                </button>
              </div>
            </section>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
      });
    }
  },

  /**
   * Handle Selfless accept — redirect damage to the Revelator.
   */
  async _onSelflessAccept(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const revelatorId = btn.dataset.revelatorId;
    const targetId = btn.dataset.targetId;
    const damage = parseInt(btn.dataset.damage) || 0;           // Raw damage (Revelator takes this)
    const appliedDamage = parseInt(btn.dataset.appliedDamage) || damage; // Post-armor damage (ally lost this)

    const revelator = game.actors.get(revelatorId);
    const target = game.actors.get(targetId);
    if (!revelator || !target || damage <= 0) return;

    // Apply raw damage to revelator (unreducible — bypasses armor/DR/everything)
    const currentHP = revelator.system?.health?.value ?? 0;
    const newHP = Math.max(0, currentHP - damage);
    await revelator.update({ "system.health.value": newHP });

    // Restore the ally's HP (undo only the damage they actually took after armor)
    const targetCurrentHP = target.system?.health?.value ?? 0;
    const targetMaxHP = target.system?.health?.max ?? 0;
    const restoredHP = Math.min(targetMaxHP, targetCurrentHP + appliedDamage);
    await target.update({ "system.health.value": restoredHP });

    // Mark Selfless as used this turn
    this._selflessUsedThisTurn.set(revelatorId, true);

    // Disable button
    btn.disabled = true;
    btn.textContent = `${revelator.name} took ${damage} damage`;

    // Holy Diver (L8): grant buff after Selfless
    if (hasFeature(revelator, "revelator_holyDiver")) {
      await this._grantHolyDiver(revelator);
    }

    ui.notifications.info(`${revelator.name} takes ${damage} damage for ${target.name} (Selfless).`);
    log("Revelator", `Selfless: ${revelator.name} took ${damage} for ${target.name}`);
  },

  /* -------------------------------------------- */
  /*  Lay on Hands (L2)                            */
  /* -------------------------------------------- */

  /**
   * Post a Lay on Hands action card.
   */
  async useLayOnHands(actor) {
    if (!actor) return;
    if (!hasFeature(actor, "revelator_layOnHands")) {
      ui.notifications.warn(`${actor.name} doesn't have Lay on Hands.`);
      return;
    }

    const uses = actor.getFlag(MODULE_ID, "layOnHandsUses") ?? 2;
    if (uses <= 0) {
      ui.notifications.warn(`${actor.name} has no Lay on Hands uses remaining.`);
      return;
    }

    const level = actor.system.attributes?.level?.value ?? 1;
    const healFormula = `1d6 + ${level}`;

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="lay-on-hands">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/magic/holy/prayer-hands-glowing-yellow.webp" alt="Lay on Hands">
            </div>
            <div class="header-info">
              <h3 class="header-title">Lay on Hands</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-hand-holding-heart"></i><span>Touch</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-heart"></i><span>${healFormula} HP (${uses} uses left)</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              Target a Being, then click Heal.
            </div>
            <div class="card-buttons" style="margin-top:0.5rem; text-align:center;">
              <button data-action="vce-lay-on-hands"
                      data-actor-id="${actor.id}"
                      data-formula="${healFormula}"
                      class="card-button">
                <i class="fas fa-hand-holding-heart"></i> Heal (${healFormula})
              </button>
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  },

  /**
   * Handle Lay on Hands button click.
   */
  async _onLayOnHandsClick(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const actorId = btn.dataset.actorId;
    const formula = btn.dataset.formula;

    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) return;

    const uses = actor.getFlag(MODULE_ID, "layOnHandsUses") ?? 2;
    if (uses <= 0) {
      ui.notifications.warn("No uses remaining.");
      return;
    }

    const targets = Array.from(game.user.targets);
    if (targets.length === 0) {
      ui.notifications.warn("Select a target token to heal.");
      return;
    }

    const targetActor = targets[0].actor;
    if (!targetActor) return;

    // Roll healing
    const roll = await new Roll(formula).evaluate();
    const healAmount = roll.total;

    // Apply healing
    const currentHP = targetActor.system?.health?.value ?? 0;
    const maxHP = targetActor.system?.health?.max ?? 0;
    const newHP = Math.min(maxHP, currentHP + healAmount);
    const actualHealing = newHP - currentHP;
    await targetActor.update({ "system.health.value": newHP });

    // Decrement uses
    await actor.setFlag(MODULE_ID, "layOnHandsUses", uses - 1);

    // Divine Resolve (L6): also cure statuses
    let curedStatuses = [];
    if (hasFeature(actor, "revelator_divineResolve")) {
      const curableStatuses = ["blinded", "paralyzed", "sickened"];
      for (const statusId of curableStatuses) {
        const effect = targetActor.effects.find(e => e.statuses?.has(statusId));
        if (effect) {
          await effect.delete();
          curedStatuses.push(statusId.charAt(0).toUpperCase() + statusId.slice(1));
        }
      }
    }

    const cureNote = curedStatuses.length > 0
      ? `<br><strong>Divine Resolve:</strong> Cured ${curedStatuses.join(", ")}.`
      : "";

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="lay-on-hands-result">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-hand-holding-heart"></i>
              <strong>Lay on Hands:</strong> ${targetActor.name} healed for <strong>${actualHealing}</strong> HP
              (${roll.formula} = ${roll.total}).
              <br><em>${uses - 1} uses remaining.</em>
              ${cureNote}
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    // Disable button
    btn.disabled = true;
    btn.textContent = `Healed ${targetActor.name} for ${actualHealing} HP`;

    log("Revelator", `Lay on Hands: ${actor.name} healed ${targetActor.name} for ${actualHealing} (${uses - 1} uses left)`);
  },

  /**
   * Reset Lay on Hands uses on rest.
   */
  async _resetLayOnHandsOnRest(message) {
    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId) return;
    const actor = game.actors.get(speakerActorId);
    if (!actor) return;
    if (!hasFeature(actor, "revelator_layOnHands")) return;

    await actor.setFlag(MODULE_ID, "layOnHandsUses", 2);
    log("Revelator", `Lay on Hands: reset to 2 uses for ${actor.name}`);
  },

  /* -------------------------------------------- */
  /*  Holy Diver (L8)                              */
  /* -------------------------------------------- */

  /**
   * Grant Holy Diver buff after Selfless triggers.
   */
  async _grantHolyDiver(actor) {
    // Check for existing buff (don't stack)
    const existing = actor.effects.find(e => e.getFlag(MODULE_ID, "holyDiverBuff"));
    if (existing) return;

    const presence = actor.system?.stats?.presence?.value ?? 0;

    const aeData = {
      name: "Holy Diver",
      icon: "icons/magic/holy/projectiles-blades-702702-yellow.webp",
      origin: `Actor.${actor.id}`,
      disabled: false,
      flags: {
        [MODULE_ID]: {
          managed: true,
          holyDiverBuff: true
        }
      },
      changes: [
        // Presence added to damage
        { key: "system.universalDamageBonus", mode: 2, value: `${presence}` }
      ]
    };

    await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="holy-diver">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-bolt"></i> <strong>Holy Diver!</strong>
              ${actor.name}'s next attack is Favored and deals +${presence} damage (Presence).
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    log("Revelator", `Holy Diver: granted to ${actor.name} (+${presence} damage, Favored)`);
  }
};
