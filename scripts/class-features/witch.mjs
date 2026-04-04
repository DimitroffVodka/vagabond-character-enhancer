/**
 * Witch Class Features
 * Hex: mark targets for continual spell effects without Focus.
 * Things Betwixt: once-per-scene invisibility with Focus.
 * Widdershins: hex target is Weak to witch's damage (bypasses armor, not immunity).
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const FLAG_HEX_TARGETS = "witch_hexTargets";
const FLAG_BETWIXT_SCENE = "betwixtSceneId";
const HEX_AE_FLAG = "witchHexAE";
const FOCUS_KEY_BETWIXT = "witch_thingsBetwixt";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const WITCH_REGISTRY = {
  "occultist": {
    class: "witch", level: 1, flag: "witch_occultist", status: "system",
    description: "Gain a Mysticism Perk. Cast Spells using Mysticism. Learn 4 Spells. Max Mana = 4 × Level."
  },
  "hex": {
    class: "witch", level: 1, flag: "witch_hex", status: "module",
    description: "Spell effects become continual on one Target without Focus. Max simultaneous = ceil(level/2)."
  },
  "ritualism": {
    class: "witch", level: 2, flag: "witch_ritualism", status: "flavor",
    description: "Once per Shift, conduct a 10-minute Ritual as an Action."
  },
  "things betwixt": {
    class: "witch", level: 4, flag: "witch_thingsBetwixt", status: "module",
    description: "Once per Scene, become invisible until next Turn (requires Focus)."
  },
  "coventry": {
    class: "witch", level: 6, flag: "witch_coventry", status: "flavor",
    description: "Cast Spells that Near Allies can Cast."
  },
  "widdershins": {
    class: "witch", level: 8, flag: "witch_widdershins", status: "module",
    description: "Hex Target is Weak to damage you deal (doesn't ignore Immunity). Your Spells ignore their Status Immunities."
  },
  "ritualism (2 uses)": {
    class: "witch", level: 10, flag: "witch_ritualism2", status: "flavor",
    description: "Conduct Rituals twice per Shift instead of once."
  }
};

/* -------------------------------------------- */
/*  Witch Runtime Hooks                         */
/* -------------------------------------------- */

export const WitchFeatures = {

  registerHooks() {
    // Inject "Hex" button on spell cast chat cards from witches
    Hooks.on("createChatMessage", async (message) => {
      await this._onSpellCardCreate(message);
    });

    // Attach hex button click handlers on render
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      this._attachHandlers(el);
      setTimeout(() => {
        const domEl = document.querySelector(`[data-message-id="${message.id}"]`);
        if (domEl) this._attachHandlers(domEl);
      }, 50);
    });

    // Things Betwixt cleanup: remove invisible on round change
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== "character") continue;

        const features = getFeatures(actor);
        if (!features?.witch_thingsBetwixt) continue;

        // Check if actor has invisible from Things Betwixt (has the focus key)
        const featureFocus = actor.getFlag(MODULE_ID, "featureFocus") || [];
        const hasBetwixtFocus = featureFocus.some(f => f.key === FOCUS_KEY_BETWIXT);
        if (hasBetwixtFocus) {
          await actor.toggleStatusEffect("invisible", { active: false });
          await FocusManager.releaseFeatureFocus(actor, FOCUS_KEY_BETWIXT);
          log("Witch", `${actor.name}: Things Betwixt expired — invisible removed`);
          ChatMessage.create({
            content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
              <div class="card-body"><section class="content-body">
                <div class="card-description" style="text-align:center;">
                  <strong>${actor.name}</strong> — Things Betwixt fades. No longer invisible.
                </div>
              </section></div>
            </div>`,
            speaker: ChatMessage.getSpeaker({ actor })
          });
        }
      }
    });

    log("Witch", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Hex — Target Tracking                        */
  /* -------------------------------------------- */

  /**
   * Apply Hex to a target. Manages max slot count, removes oldest if over cap.
   * @param {Actor} witch - The witch actor
   * @param {string} targetId - Target actor ID
   * @param {string} targetName - Target display name
   * @param {string} targetImg - Target image
   */
  async applyHex(witch, targetId, targetName, targetImg) {
    const features = getFeatures(witch);
    if (!features?.witch_hex) return;

    const classLevel = features._classLevel ?? 1;
    const maxHexes = Math.ceil(classLevel / 2);
    let hexTargets = witch.getFlag(MODULE_ID, FLAG_HEX_TARGETS) || [];

    // Already hexed?
    if (hexTargets.some(h => h.targetId === targetId)) {
      ui.notifications.info(`${targetName} is already hexed.`);
      return;
    }

    // Over capacity — remove oldest
    while (hexTargets.length >= maxHexes) {
      const removed = hexTargets.shift();
      await this._removeHexAE(removed.targetId, witch);
      log("Witch", `Hex removed from ${removed.targetName} (over capacity)`);
    }

    // Add new hex
    hexTargets.push({ targetId, targetName, targetImg: targetImg || "icons/svg/mystery-man.svg" });
    await witch.setFlag(MODULE_ID, FLAG_HEX_TARGETS, hexTargets);

    // Create display AE on target
    const targetActor = game.actors.get(targetId);
    if (targetActor) {
      await targetActor.createEmbeddedDocuments("ActiveEffect", [{
        name: `Hexed (${witch.name})`,
        icon: "icons/magic/unholy/strike-body-explode-disintegrate.webp",
        origin: `Actor.${witch.id}`,
        changes: [],
        disabled: false,
        transfer: true,
        flags: {
          [MODULE_ID]: {
            managed: true,
            [HEX_AE_FLAG]: true,
            hexWitchId: witch.id
          }
        }
      }]);
    }

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <i class="fas fa-eye" style="color:#9b59b6;"></i>
            <strong>${witch.name}</strong> hexes <strong>${targetName}</strong>
            <br><span style="font-size:0.8em; opacity:0.7;">(${hexTargets.length}/${maxHexes} hex slots)</span>
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: witch })
    });

    log("Witch", `${witch.name} hexed ${targetName} (${hexTargets.length}/${maxHexes})`);
  },

  /**
   * Remove Hex from a target.
   */
  async removeHex(witch, targetId) {
    let hexTargets = witch.getFlag(MODULE_ID, FLAG_HEX_TARGETS) || [];
    const removed = hexTargets.find(h => h.targetId === targetId);
    if (!removed) return;

    hexTargets = hexTargets.filter(h => h.targetId !== targetId);
    if (hexTargets.length > 0) {
      await witch.setFlag(MODULE_ID, FLAG_HEX_TARGETS, hexTargets);
    } else {
      await witch.unsetFlag(MODULE_ID, FLAG_HEX_TARGETS);
    }

    await this._removeHexAE(targetId, witch);

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>${witch.name}</strong> removes hex from <strong>${removed.targetName}</strong>
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: witch })
    });

    log("Witch", `${witch.name} removed hex from ${removed.targetName}`);
  },

  /**
   * Get the witch's current hex targets.
   */
  getHexTargets(witch) {
    return witch?.getFlag(MODULE_ID, FLAG_HEX_TARGETS) || [];
  },

  /**
   * Check if a target actor is hexed by a specific witch.
   */
  isHexedBy(targetActor, witchActor) {
    const hexTargets = witchActor?.getFlag(MODULE_ID, FLAG_HEX_TARGETS) || [];
    return hexTargets.some(h => h.targetId === targetActor.id);
  },

  /**
   * Remove the Hex AE from a target actor.
   */
  async _removeHexAE(targetId, witch) {
    const targetActor = game.actors.get(targetId);
    if (!targetActor) return;
    const hexAE = targetActor.effects.find(e =>
      e.getFlag(MODULE_ID, HEX_AE_FLAG) && e.getFlag(MODULE_ID, "hexWitchId") === witch.id
    );
    if (hexAE) {
      await targetActor.deleteEmbeddedDocuments("ActiveEffect", [hexAE.id]);
    }
  },

  /* -------------------------------------------- */
  /*  Things Betwixt (L4)                          */
  /* -------------------------------------------- */

  /**
   * Use Things Betwixt: become invisible until next Turn (requires Focus).
   * Once per Scene.
   */
  async useBetwixt(actor) {
    const features = getFeatures(actor);
    if (!features?.witch_thingsBetwixt) {
      ui.notifications.warn("You don't have Things Betwixt.");
      return;
    }

    // Once per scene check
    const currentSceneId = canvas.scene?.id;
    const lastUsedScene = actor.getFlag(MODULE_ID, FLAG_BETWIXT_SCENE);
    if (lastUsedScene === currentSceneId) {
      ui.notifications.warn("Already used Things Betwixt this scene.");
      return;
    }

    // Acquire focus
    const acquired = await FocusManager.acquireFeatureFocus(
      actor, FOCUS_KEY_BETWIXT, "Things Betwixt", "icons/svg/invisible.svg"
    );
    if (!acquired) {
      ui.notifications.warn("No focus slots available.");
      return;
    }

    // Apply invisible
    await actor.toggleStatusEffect("invisible", { active: true });
    await actor.setFlag(MODULE_ID, FLAG_BETWIXT_SCENE, currentSceneId);

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <i class="fas fa-ghost" style="color:#8e44ad;"></i>
            <strong>${actor.name}</strong> fades from sight — <em>Things Betwixt</em>
            <br><span style="font-size:0.8em; opacity:0.7;">(Invisible until next Turn, requires Focus)</span>
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    log("Witch", `${actor.name} used Things Betwixt — invisible`);
  },

  /* -------------------------------------------- */
  /*  Widdershins (L8) — Damage Hook               */
  /* -------------------------------------------- */

  /**
   * Widdershins: hex target is Weak to witch's damage.
   * Bypasses armor but NOT immunity.
   * Called from calculateFinalDamage dispatcher.
   * @param {object} ctx - { actor (target), result, damage, damageType, damageSourceActorId }
   */
  onCalculateFinalDamage(ctx) {
    if (!ctx.damageSourceActorId) return;

    const attacker = game.actors.get(ctx.damageSourceActorId);
    if (!attacker) return;

    const features = getFeatures(attacker);
    if (!features?.witch_widdershins) return;

    // Check if target is hexed by this witch
    if (!this.isHexedBy(ctx.actor, attacker)) return;

    // Check immunity — Widdershins does NOT ignore immunity
    const normalizedType = ctx.damageType?.toLowerCase() || "";
    let immunities = ctx.actor.system?.immunities || [];
    if (ctx.actor.type === "character") {
      const equippedArmor = ctx.actor.items?.find(i => {
        const isArmor = (i.type === "armor") || (i.type === "equipment" && i.system.equipmentType === "armor");
        return isArmor && i.system.equipped;
      });
      if (equippedArmor?.system?.immunities) {
        immunities = [...immunities, ...equippedArmor.system.immunities];
      }
    }
    if (immunities.includes(normalizedType)) return; // Immune — Widdershins doesn't bypass

    // Bypass armor: add back the armor that was subtracted by origCalcFinal
    const armorRating = ctx.actor.system?.armor || 0;
    if (armorRating > 0) {
      ctx.result = Math.min(ctx.result + armorRating, ctx.damage);
      log("Witch", `Widdershins: ${attacker.name} → ${ctx.actor.name} — armor bypassed (+${armorRating})`);
    }
  },

  /* -------------------------------------------- */
  /*  Chat Card — Hex Button Injection             */
  /* -------------------------------------------- */

  /**
   * Inject "Hex Target" button on spell cast chat cards from witches.
   */
  async _onSpellCardCreate(message) {
    const content = message.content ?? "";
    // Must be a spell cast card with a roll result or spell content
    if (!content.includes("vagabond-chat-card-v2")) return;
    if (content.includes('data-action="vce-hex-target"')) return;

    const actorId = message.flags?.vagabond?.actorId;
    if (!actorId) return;

    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) return;

    const features = getFeatures(actor);
    if (!features?.witch_hex) return;

    // Must be a spell (check if item is a spell)
    const itemId = message.flags?.vagabond?.itemId;
    if (!itemId) return;
    const item = actor.items.get(itemId);
    if (!item || item.type !== "spell") return;

    // Get targets from message
    const targets = message.flags?.vagabond?.targetsAtRollTime || [];
    if (targets.length === 0) return;

    const classLevel = features._classLevel ?? 1;
    const maxHexes = Math.ceil(classLevel / 2);
    const currentHexes = (actor.getFlag(MODULE_ID, FLAG_HEX_TARGETS) || []).length;

    // Build hex buttons for each target
    const targetBtns = targets.map(t => {
      const dataStr = JSON.stringify({ targetId: t.actorId, targetName: t.actorName, targetImg: t.actorImg }).replace(/"/g, "&quot;");
      return `<button class="vagabond-save-button" data-vagabond-button="true"
        data-action="vce-hex-target"
        data-actor-id="${actorId}"
        data-hex-data="${dataStr}">
        <i class="fas fa-eye" style="color:#9b59b6;"></i> Hex ${t.actorName}
      </button>`;
    }).join("");

    const btnHtml = `<div class="vce-hex-actions" style="margin-top:0.5rem; text-align:center;">
      <div class="save-buttons-row">${targetBtns}</div>
      <div style="font-size:0.75em; opacity:0.6;">Hex slots: ${currentHexes}/${maxHexes}</div>
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
  },

  /**
   * Attach click handlers for hex buttons.
   */
  _attachHandlers(el) {
    el.querySelectorAll('[data-action="vce-hex-target"]').forEach(btn => {
      if (btn._vceHandled) return;
      btn._vceHandled = true;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const actorId = btn.dataset.actorId;
        const hexData = JSON.parse(btn.dataset.hexData.replace(/&quot;/g, '"'));
        const witch = game.actors.get(actorId);
        if (!witch) return;
        await this.applyHex(witch, hexData.targetId, hexData.targetName, hexData.targetImg);
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.innerHTML = '<i class="fas fa-check"></i> Hexed';
      });
    });
  }
};
