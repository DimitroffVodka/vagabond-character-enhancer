/**
 * Wizard Class Features
 * Registry entries + runtime hooks for all Wizard features.
 */

import { MODULE_ID, log, hasFeature, getFeatures } from "../utils.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const WIZARD_REGISTRY = {
  "spellcaster": {
    class: "wizard", level: 1, flag: "wizard_spellcaster", status: "system",
    description: "Cast Spells using Arcana. Learn 4 Spells. Max Mana = 4 × Level. Regain on Rest or Study."
  },
  "page master": {
    class: "wizard", level: 1, flag: "wizard_pageMaster", status: "module",
    description: "Gain Bookworm Perk. When you successfully Cast, spend a Studied die to add to damage/healing."
  },
  "sculpt spell": {
    class: "wizard", level: 2, flag: "wizard_sculptSpell", status: "system",
    description: "Pay 1 less Mana for Spell delivery. (System AE on class item)"
  },
  "manifold mind": {
    class: "wizard", level: 4, flag: "wizard_manifoldMind", status: "module",
    description: "Focus on up to 2 Spells at the same time.",
    effects: [{
      label: "Manifold Mind",
      icon: "icons/magic/perception/eye-ringed-glow-angry-small-teal.webp",
      changes: [
        { key: "system.focus.maxBonus", mode: 2, value: "1" }
      ]
    }]
  },
  "extracurricular": {
    class: "wizard", level: 6, flag: "wizard_extracurricular", status: "flavor",
    description: "Spend a Studied die to cast any Spell, even one you don't know."
  },
  "manifold mind (3)": {
    class: "wizard", level: 8, flag: "wizard_manifoldMind3", status: "module",
    description: "Focus on up to 3 Spells at the same time.",
    effects: [{
      label: "Manifold Mind (3)",
      icon: "icons/magic/perception/eye-ringed-glow-angry-small-teal.webp",
      changes: [
        { key: "system.focus.maxBonus", mode: 2, value: "1" }
      ]
    }]
  },
  "archwizard": {
    class: "wizard", level: 10, flag: "wizard_archwizard", status: "system",
    description: "Pay 2 less Mana for Spell delivery. (System AE on class item)"
  }
};

/* -------------------------------------------- */
/*  Wizard Runtime Hooks                        */
/* -------------------------------------------- */

export const WizardFeatures = {

  registerHooks() {
    this._registerPageMasterHooks();
    log("Wizard", "Hooks registered.");
  },

  /* ------------------------------------------ */
  /*  Page Master — Button on Spell Damage Cards */
  /* ------------------------------------------ */

  /**
   * Page Master: injects a "Spend Studied Die (+1d6)" button onto spell
   * damage chat cards from wizards. Works from both character sheet and
   * crawler strip since renderChatMessage fires for all cards.
   *
   * On click: rolls 1d6, updates the damage card total + save button
   * amounts, decrements studied dice, posts result notification.
   */
  _registerPageMasterHooks() {
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      this._injectPageMasterButton(message, el);
      this._attachPageMasterHandler(message, el);
    });
  },

  /**
   * Inject a "Spend Studied Die" button into spell damage cards from wizards.
   */
  _injectPageMasterButton(message, el) {
    // Must have a damage section (spell hit with damage)
    if (!el.querySelector(".damage-section")) return;

    // Already has our button?
    if (el.querySelector("[data-action='vce-page-master']")) return;

    // Already resolved?
    if (message.getFlag(MODULE_ID, "pageMasterResolved")) return;

    // Get the casting actor
    const actorId = message.speaker?.actor;
    if (!actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor || actor.type !== "character") return;

    // Must have Page Master
    if (!hasFeature(actor, "wizard_pageMaster")) return;

    // Must have studied dice
    const studiedDice = actor.system?.studiedDice ?? 0;
    if (studiedDice <= 0) return;

    // Must be a spell card (check title contains "Damage" from a spell, not weapon)
    const titleEl = el.querySelector(".header-title");
    const title = titleEl?.textContent?.trim() || "";
    if (!title.includes("Damage")) return;

    // Find footer to inject into
    const footer = el.querySelector(".action-buttons-container") || el.querySelector(".card-actions");
    if (!footer) return;

    const wrapper = document.createElement("div");
    wrapper.classList.add("vce-page-master-action");
    wrapper.style.cssText = "margin-bottom:0.5rem; text-align:center;";
    wrapper.innerHTML = `
      <button class="vagabond-save-button" data-action="vce-page-master"
        data-actor-id="${actorId}"
        data-message-id="${message.id}">
        <i class="fas fa-book-open"></i> Page Master: +1d6 (${studiedDice} Studied ${studiedDice === 1 ? "die" : "dice"})
      </button>`;
    footer.prepend(wrapper);
  },

  /**
   * Attach click handler for Page Master buttons.
   */
  _attachPageMasterHandler(message, el) {
    const btns = el.querySelectorAll("[data-action='vce-page-master']");
    if (!btns.length) return;

    if (message.getFlag(MODULE_ID, "pageMasterResolved")) {
      btns.forEach(b => { b.disabled = true; b.style.opacity = "0.5"; });
      return;
    }

    btns.forEach(btn => {
      if (btn._vceHandled) return;
      btn._vceHandled = true;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const actor = game.actors.get(btn.dataset.actorId);
        if (!game.user.isGM && !actor?.isOwner) return;
        await this._onPageMasterClick(message, actor);
      });
    });
  },

  /**
   * Handle Page Master button click: roll 1d6, update damage card, decrement dice.
   */
  async _onPageMasterClick(message, actor) {
    const studiedDice = actor.system?.studiedDice ?? 0;
    if (studiedDice <= 0) {
      ui.notifications.warn("No Studied dice remaining.");
      return;
    }

    // Mark as resolved
    await message.setFlag(MODULE_ID, "pageMasterResolved", true);

    // Roll 1d6 bonus
    const bonusRoll = new Roll("1d6");
    await bonusRoll.evaluate();
    const bonus = bonusRoll.total;

    // Decrement studied dice
    const remaining = studiedDice - 1;

    // Build updated damage card content
    const content = message.content;
    let contentUpdate = null;
    const totalMatch = content.match(/class="damage-value">(\d+)</);
    if (totalMatch) {
      const oldTotal = parseInt(totalMatch[1]);
      const newTotal = oldTotal + bonus;
      let newContent = content.replace(
        /class="damage-value">(\d+)/,
        `class="damage-value">${newTotal}`
      );
      newContent = newContent.replace(
        /data-damage-amount="(\d+)"/g,
        (match, amt) => `data-damage-amount="${parseInt(amt) + bonus}"`
      );
      contentUpdate = message.update({ content: newContent });
    }

    // Run all DB writes in parallel — they're independent
    await Promise.all([
      actor.update({ "system.studiedDice": remaining }),
      contentUpdate,
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="page-master">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-book-open" style="color:#3498db;"></i>
              <strong>${actor.name}</strong> — <em>Page Master</em><br>
              Spent a Studied die: +<strong>${bonus}</strong> damage (1d6).
              <span style="font-size:0.8em; opacity:0.7;">(${remaining} remaining)</span>
            </div>
          </section></div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
        rolls: [bonusRoll]
      })
    ]);

    log("Wizard", `Page Master: ${actor.name} +${bonus} damage (${remaining} remaining)`);
  }
};
