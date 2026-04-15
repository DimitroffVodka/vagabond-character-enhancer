/**
 * Imbue Manager
 * Handles the Imbue spell delivery type: cast a spell onto a weapon,
 * then the next attack with that weapon deals the spell's damage alongside
 * the weapon's damage in a SINGLE combined roll (armor applied once). The
 * spell's damage type is surfaced on the attack card for visibility.
 *
 * FLOW
 * ────
 * 1. Caster casts a spell with Imbue delivery → "Imbue Weapon" button on chat card
 * 2. Player clicks → weapon selection dialog → imbue stored as flag + display AE
 * 3. Next attack with imbued weapon:
 *    - rollDamage patch appends spell dice + spell damage bonuses to the weapon
 *      formula (and pre-rolls a weakness die if all targets are weak to the
 *      spell's type but not the weapon's)
 *    - onPostRollAttack stashes pending annotation data on the actor
 *    - createChatMessage injects an "Imbued: [Spell] ([Type])" tag into the
 *      weapon attack card so both damage types are visible
 * 4. Imbue consumed after the attack (hit or miss)
 *
 * Mana is spent upfront when casting the spell. No additional cost on attack.
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const FLAG_IMBUE = "imbue";
const FLAG_PENDING = "pendingImbueDamage";
const IMBUE_AE_FLAG = "imbueAE";

/* -------------------------------------------- */
/*  ImbueManager                                 */
/* -------------------------------------------- */

export const ImbueManager = {

  /* -------------------------------------------- */
  /*  Hook Registration                            */
  /* -------------------------------------------- */

  registerHooks() {
    // Inject "Imbue Weapon" button into spell cards with Imbue delivery.
    // Uses createChatMessage (modifies persisted HTML — survives Foundry v13 re-renders).
    Hooks.on("createChatMessage", async (message) => {
      await this._onSpellCardCreate(message);
      // Annotate the weapon attack card with the imbue's damage type so both
      // types are visible on the single combined-damage card.
      await this._annotateWeaponAttackCard(message);
    });

    // Attach click handlers when messages render (handles re-renders + page load)
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      this._attachHandlers(el);
      // Also attach to the real DOM element (v13 uses a different element for insertion)
      setTimeout(() => {
        const domEl = document.querySelector(`[data-message-id="${message.id}"]`);
        if (domEl) this._attachHandlers(domEl);
      }, 50);
    });
  },

  /* -------------------------------------------- */
  /*  Pre-Roll Hooks (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * After any attack with the imbued weapon: on hit, stash annotation data so
   * the createChatMessage hook can surface the imbue's damage type on the
   * weapon attack card. On miss, post a "missed — imbue wasted" notification.
   * Either way, consume the imbue.
   * Called from the rollAttack post-handler.
   * @param {object} ctx - { item, actor, rollResult }
   */
  async onPostRollAttack(ctx) {
    if (!ctx.rollResult) return;
    const imbue = ctx.actor.getFlag(MODULE_ID, FLAG_IMBUE);
    if (!imbue) return;
    if (ctx.item?.id !== imbue.weaponId) return;

    const dieSize = imbue.dieSize || 6;
    const typeLabel = imbue.damageType !== "-"
      ? imbue.damageType.charAt(0).toUpperCase() + imbue.damageType.slice(1) : "";

    if (ctx.rollResult.isHit) {
      // HIT: stash annotation data, leave the imbue flag in place so the
      // rollDamage patch (which runs AFTER this handler) can still read it.
      // Also force-auto-roll so the combined damage appears on the attack card
      // without needing a manual "Roll Damage" click.
      // The annotate hook will consume both flags after the attack card posts.
      await ctx.actor.setFlag(MODULE_ID, FLAG_PENDING, {
        weaponId: imbue.weaponId,
        spellName: imbue.spellName,
        spellImg: imbue.spellImg,
        damageType: imbue.damageType,
        damageDice: imbue.damageDice,
        dieSize
      });
      if (ctx.VagabondDamageHelper) {
        ctx.VagabondDamageHelper._vceForceRollDamage = true;
      }
      log("Imbue", `${ctx.actor.name} hit with imbued ${imbue.weaponName} — annotating card`);
      return;
    }

    // MISS: rollDamage won't run — safe to consume the imbue now.
    const damageText = imbue.damageDice > 0
      ? ` (${imbue.damageDice}d${dieSize} ${typeLabel})` : "";

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>${ctx.actor.name}</strong> misses with <strong>${imbue.weaponName}</strong>
            — <em>${imbue.spellName}</em> imbue wasted${damageText}
            <br><span style="font-size:0.8em; opacity:0.6;">(Imbue consumed on miss)</span>
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: ctx.actor })
    });
    await this.clearImbue(ctx.actor);
    log("Imbue", `Imbue consumed on ${ctx.actor.name}'s ${imbue.weaponName} (miss)`);
  },

  /* -------------------------------------------- */
  /*  Weapon Attack Card — Imbue Annotation        */
  /* -------------------------------------------- */

  /**
   * When the system posts the weapon attack card for an imbued weapon that has
   * pending imbue annotation data, inject an "Imbued: [Spell] ([Type])" tag
   * into the card so both damage types are visible at a glance. The damage
   * itself is a single combined roll (armor applied once).
   */
  async _annotateWeaponAttackCard(message) {
    const actorId = message.flags?.vagabond?.actorId;
    const itemId = message.flags?.vagabond?.itemId;
    if (!actorId || !itemId) return;

    const actor = game.actors.get(actorId);
    if (!actor) return;

    const pending = actor.getFlag(MODULE_ID, FLAG_PENDING);
    if (!pending) return;
    if (pending.weaponId !== itemId) return;

    // Only the client that created the weapon attack card should handle this
    // (prevents double-updates from multiple observers).
    if (message.user?.id !== game.user.id) return;

    // Consume the annotation flag AND the imbue (flag + AE) now that the
    // attack card has been posted and rollDamage has already read the imbue flag.
    await actor.unsetFlag(MODULE_ID, FLAG_PENDING);
    await this.clearImbue(actor);

    const damageType = (pending.damageType || "-").toLowerCase();
    const typeLabel = damageType !== "-"
      ? damageType.charAt(0).toUpperCase() + damageType.slice(1)
      : "Untyped";
    const damageIcon = CONFIG.VAGABOND?.damageTypeIcons?.[damageType] || "fas fa-burst";
    const iconHtml = damageType !== "-" ? `<i class="${damageIcon}"></i> ` : "";
    const diceText = pending.damageDice > 0
      ? `${pending.damageDice}d${pending.dieSize || 6}` : "";

    const tagHtml = `<span class="tag tag-imbue" style="background:rgba(80,40,120,0.25); border:1px solid rgba(150,100,200,0.6); padding:2px 6px; border-radius:3px; display:inline-flex; align-items:center; gap:4px;" title="Imbued with ${pending.spellName}"><i class="fas fa-hand-sparkles"></i> ${iconHtml}${diceText} ${typeLabel}</span>`;

    let content = message.content || "";
    // Inject the tag into the first card-tags row if present, otherwise prepend
    // a small strip at the top of the card body.
    if (content.includes('class="card-tags"') || content.includes("card-tags")) {
      content = content.replace(
        /(<div[^>]*class="[^"]*card-tags[^"]*"[^>]*>)/,
        `$1${tagHtml}`
      );
    } else if (content.includes("content-body")) {
      content = content.replace(
        /(<section[^>]*class="[^"]*content-body[^"]*"[^>]*>)/,
        `$1<div class="imbue-annotation" style="padding:4px 8px;">${tagHtml}</div>`
      );
    } else {
      content = `<div class="imbue-annotation" style="padding:4px 8px; text-align:center;">${tagHtml}</div>` + content;
    }

    await message.update({ content });
    log("Imbue", `${actor.name}: annotated ${pending.spellName} (${typeLabel}) on attack card`);
  },

  /* -------------------------------------------- */
  /*  Spell Card — Imbue Weapon Button             */
  /* -------------------------------------------- */

  /**
   * On spell cast with Imbue delivery, inject "Imbue Weapon" button into message content.
   */
  async _onSpellCardCreate(message) {
    const content = message.content ?? "";
    if (!content.includes('data-delivery-type="imbue"')) return;
    if (content.includes('data-action="vce-imbue-weapon"')) return;

    const actorId = message.flags?.vagabond?.actorId;
    const spellId = message.flags?.vagabond?.itemId;
    if (!actorId || !spellId) return;

    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) return;

    const spell = actor.items.get(spellId);
    if (!spell) return;

    // Parse damage dice from content (e.g., "2d6" in a tag-damage span)
    const diceMatch = content.match(/(\d+)d(\d+)/);
    const damageDice = diceMatch ? parseInt(diceMatch[1]) : 0;
    const dieSize = diceMatch ? parseInt(diceMatch[2]) : 6;

    const imbueData = JSON.stringify({
      spellId: spell.id,
      spellName: spell.name,
      spellImg: spell.img,
      damageType: spell.system.damageType || "-",
      damageDice,
      dieSize,
      hasEffect: true,
      effectDesc: spell.system.description || ""
    }).replace(/"/g, "&quot;");

    const btnHtml = `<div class="vce-imbue-actions" style="margin-top:0.5rem; text-align:center;">
      <div class="save-buttons-row">
        <button class="vagabond-save-button" data-vagabond-button="true"
          data-action="vce-imbue-weapon"
          data-actor-id="${actorId}"
          data-imbue-data="${imbueData}">
          <i class="fas fa-hand-sparkles"></i> Imbue Weapon
        </button>
      </div>
    </div>`;

    let newContent = content;
    if (content.includes("action-buttons-container")) {
      newContent = content.replace(
        /(<div class="action-buttons-container">)/,
        `$1${btnHtml}`
      );
    } else {
      newContent = content + btnHtml;
    }

    await message.update({ content: newContent });
    log("Imbue", `Injected Imbue Weapon button on spell card for ${actor.name}`);
  },

  /* -------------------------------------------- */
  /*  Click Handlers                               */
  /* -------------------------------------------- */

  _attachHandlers(el) {
    el.querySelectorAll('[data-action="vce-imbue-weapon"]').forEach(btn => {
      if (btn._vceHandled) return;
      btn._vceHandled = true;
      btn.addEventListener("click", (ev) => this._onImbueWeaponClick(ev));
    });
  },

  async _onImbueWeaponClick(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const actorId = btn.dataset.actorId;
    const imbueData = JSON.parse(btn.dataset.imbueData.replace(/&quot;/g, '"'));

    const actor = game.actors.get(actorId);
    if (!actor) return;

    await this.showWeaponDialog(actor, imbueData);
  },

  /* -------------------------------------------- */
  /*  Weapon Selection Dialog                      */
  /* -------------------------------------------- */

  /**
   * Show a dialog to select which weapon to imbue.
   */
  async showWeaponDialog(actor, spellData) {
    const weapons = actor.items.filter(i => {
      const isWeapon = i.type === "weapon"
        || (i.type === "equipment" && i.system.equipmentType === "weapon");
      return isWeapon && i.system.equipped;
    });

    if (weapons.length === 0) {
      ui.notifications.warn(`${actor.name} has no equipped weapons to imbue.`);
      return;
    }

    if (weapons.length === 1) {
      await this.applyImbue(actor, weapons[0].id, spellData);
      return;
    }

    const content = `
      <p>Choose a weapon to imbue with <strong>${spellData.spellName}</strong>:</p>
      <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
        ${weapons.map(w => `
          <button type="button" class="vce-imbue-weapon-btn" data-weapon-id="${w.id}"
            style="display:flex; align-items:center; gap:8px; padding:6px 10px;">
            <img src="${w.img}" width="24" height="24" style="border:none;">
            <span>${w.name}</span>
            <span style="opacity:0.6; font-size:0.85em;">(${w.system.currentDamage || "—"})</span>
          </button>
        `).join("")}
      </div>
    `;

    return new Promise((resolve) => {
      const d = new Dialog({
        title: `${actor.name} — Imbue Weapon`,
        content,
        buttons: {
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
        },
        default: "cancel",
        render: (html) => {
          html.find(".vce-imbue-weapon-btn").on("click", async (ev) => {
            const weaponId = ev.currentTarget.dataset.weaponId;
            await this.applyImbue(actor, weaponId, spellData);
            d.close();
            resolve(weaponId);
          });
        },
        close: () => resolve(null)
      }, { width: 360 });
      d.render(true);
    });
  },

  /* -------------------------------------------- */
  /*  Apply / Clear Imbue                          */
  /* -------------------------------------------- */

  /**
   * Store imbue state on actor and create a display AE.
   */
  async applyImbue(actor, weaponId, spellData) {
    const weapon = actor.items.get(weaponId);
    if (!weapon) return;

    // Clear any existing imbue first (including stale pending-damage state from a prior attack)
    await this.clearImbue(actor);
    if (actor.getFlag(MODULE_ID, FLAG_PENDING)) {
      await actor.unsetFlag(MODULE_ID, FLAG_PENDING);
    }

    const imbueState = {
      weaponId,
      weaponName: weapon.name,
      spellId: spellData.spellId,
      spellName: spellData.spellName,
      spellImg: spellData.spellImg,
      damageType: spellData.damageType,
      damageDice: spellData.damageDice,
      dieSize: spellData.dieSize || 6,
      hasEffect: spellData.hasEffect,
      effectDesc: spellData.effectDesc,
      casterId: actor.id
    };
    await actor.setFlag(MODULE_ID, FLAG_IMBUE, imbueState);

    // Create display AE
    const typeLabel = spellData.damageType !== "-"
      ? ` (${spellData.damageType.charAt(0).toUpperCase() + spellData.damageType.slice(1)})`
      : "";
    const aeName = `Imbued: ${spellData.spellName}${typeLabel}`;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: aeName,
      icon: spellData.spellImg || "icons/magic/light/explosion-star-glow-yellow.webp",
      origin: `${MODULE_ID}.imbue`,
      changes: [],
      disabled: false,
      transfer: true,
      flags: {
        [MODULE_ID]: {
          managed: true,
          [IMBUE_AE_FLAG]: true
        }
      }
    }]);

    // Chat notification
    const dieSize = spellData.dieSize || 6;
    const damageText = spellData.damageDice > 0
      ? ` (+${spellData.damageDice}d${dieSize} ${spellData.damageType})`
      : "";
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>${actor.name}</strong> imbues <strong>${weapon.name}</strong> with
            <em>${spellData.spellName}</em>${damageText}
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    log("Imbue", `${actor.name} imbued ${weapon.name} with ${spellData.spellName}`);
  },

  /**
   * Remove active imbue state and display AE from an actor.
   */
  async clearImbue(actor) {
    const existing = actor.getFlag(MODULE_ID, FLAG_IMBUE);
    if (existing) {
      await actor.unsetFlag(MODULE_ID, FLAG_IMBUE);
    }
    const imbueAE = actor.effects.find(e => e.getFlag(MODULE_ID, IMBUE_AE_FLAG));
    if (imbueAE) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", [imbueAE.id]);
    }
  },

  /**
   * Get the current imbue state for an actor.
   */
  getImbueState(actor) {
    return actor?.getFlag(MODULE_ID, FLAG_IMBUE) ?? null;
  },

  /**
   * Handle a spell cast with Imbue delivery — bypass d20/damage rolls, deduct mana,
   * and show weapon selection. Used by both the SpellHandler patch and Vagabond Crawler.
   * @param {Actor} actor
   * @param {Item} spell
   * @param {object} state - Spell state { damageDice, deliveryType, ... }
   * @param {object} costs - Cost breakdown { totalCost }
   * @returns {Promise<boolean>} True if Imbue was handled, false if not Imbue delivery.
   */
  async handleImbueCast(actor, spell, state, costs) {
    if (state.deliveryType !== "imbue") return false;

    // Validate mana
    if (costs.totalCost > (actor.system?.mana?.current ?? 0)) {
      ui.notifications.error(`Not enough mana! Need ${costs.totalCost}, have ${actor.system.mana.current}.`);
      return true; // Handled (blocked)
    }
    if (costs.totalCost > (actor.system?.mana?.castingMax ?? 0)) {
      ui.notifications.error(`Cost exceeds casting max! Max: ${actor.system.mana.castingMax}, Cost: ${costs.totalCost}.`);
      return true;
    }

    // Deduct mana (Imbue always succeeds — no cast check)
    await actor.update({ "system.mana.current": Math.max(0, actor.system.mana.current - costs.totalCost) });

    // Show weapon selection dialog
    const dieSize = spell.system.damageDieSize || actor.system.spellDamageDieSize || 6;
    await this.showWeaponDialog(actor, {
      spellId: spell.id,
      spellName: spell.name,
      spellImg: spell.img,
      damageType: spell.system.damageType || "-",
      damageDice: state.damageDice || 1,
      dieSize,
      hasEffect: true,
      effectDesc: spell.system.description || ""
    });

    return true; // Handled
  }
};
