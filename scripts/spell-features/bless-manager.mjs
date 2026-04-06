/**
 * Bless Spell Manager
 * Handles the dual-mode Bless spell:
 *   - Allies mode: +1d4 bonus to Saves (rolled per save)
 *   - Weapons mode: Weapons count as Silvered for the duration
 *
 * Bless is detected via createChatMessage hook on spell cast.
 * A dialog asks the caster to choose mode, then applies the appropriate effect.
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const BLESS_AE_FLAG = "blessAE";
const BLESS_SILVER_FLAG = "blessSilverAE";

/* -------------------------------------------- */
/*  Module-level state for d4 save bonus         */
/* -------------------------------------------- */

/**
 * Tracks the Bless d4 bonus to inject into the next save roll.
 * Set during onPreRollSave, consumed by the roll, cleared after.
 */
let _blessD4Bonus = 0;

/* -------------------------------------------- */
/*  BlessManager                                 */
/* -------------------------------------------- */

export const BlessManager = {

  registerHooks() {
    // Detect Bless spell casts and show mode selection dialog
    Hooks.on("createChatMessage", async (message) => {
      await this._onBlessCast(message);
    });

    // Attach click handlers on render
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      this._attachHandlers(el);
      setTimeout(() => {
        const domEl = document.querySelector(`[data-message-id="${message.id}"]`);
        if (domEl) this._attachHandlers(domEl);
      }, 50);
    });

    // GM: handle Bless requests from players via chat message flags
    Hooks.on("createChatMessage", async (message) => {
      if (!game.user.isGM) return;
      const flags = message.flags?.[MODULE_ID];
      if (!flags) return;

      // Aura mode selection: player chose allies/weapons for their Bless aura
      if (flags.blessAuraMode) {
        const caster = game.actors.get(flags.casterId);
        if (caster) await this._setBlessAuraMode(caster, flags.blessMode);
        return;
      }

      // Non-aura Bless request: player wants to apply Bless directly
      if (flags.blessRequest) {
        const caster = game.actors.get(flags.casterId);
        if (!caster) return;
        const mode = flags.blessMode;
        const targets = flags.targets || [];
        const targetNames = targets.map(t => t.actorName).join(", ");
        const modeLabel = mode === "allies" ? "+d4 Saves" : "Silvered Weapons";

        const confirmed = await Dialog.confirm({
          title: "Bless Request",
          content: `<p><strong>${caster.name}</strong> wants to cast Bless (${modeLabel}) on:</p>
            <p><strong>${targetNames}</strong></p>
            <p>Apply the effect?</p>`,
          yes: () => true,
          no: () => false,
          defaultYes: true
        });

        if (confirmed) {
          if (mode === "allies") await this._applyBlessAllies(caster, targets);
          else if (mode === "weapons") await this._applyBlessWeapons(caster, targets);
        }
      }
    });

    // Watch for Bless Silver AE deletion — restore weapon metals
    Hooks.on("deleteActiveEffect", async (effect) => {
      if (!effect.getFlag(MODULE_ID, BLESS_SILVER_FLAG)) return;
      const actor = effect.parent;
      if (!actor || actor.documentName !== "Actor") return;
      if (!actor.isOwner && !game.user.isGM) return; // Only owner/GM can restore
      try {
        for (const weapon of actor.items) {
          const origMetal = weapon.getFlag(MODULE_ID, "blessOrigMetal");
          if (origMetal === undefined) continue;
          await weapon.update({
            "system.metal": origMetal || "",
            [`flags.${MODULE_ID}.-=blessOrigMetal`]: null
          });
          log("Bless", `Restored ${weapon.name} metal to "${origMetal}" on ${actor.name}`);
        }
      } catch (e) {
        log("Bless", `Could not restore weapons on ${actor.name}: ${e.message}`);
      }
    });

    // Also watch for Bless AE deletion from Aura Effects module (fromAura flag)
    Hooks.on("deleteActiveEffect", async (effect) => {
      if (!effect.flags?.auraeffects?.fromAura) return;
      if (!effect.name?.includes("Silvered")) return;
      const actor = effect.parent;
      if (!actor || actor.documentName !== "Actor") return;
      if (!actor.isOwner && !game.user.isGM) return;
      try {
        for (const weapon of actor.items) {
          const origMetal = weapon.getFlag(MODULE_ID, "blessOrigMetal");
          if (origMetal === undefined) continue;
          await weapon.update({
            "system.metal": origMetal || "",
            [`flags.${MODULE_ID}.-=blessOrigMetal`]: null
          });
          log("Bless", `Restored ${weapon.name} metal to "${origMetal}" on ${actor.name} (aura effect removed)`);
        }
      } catch (e) {
        log("Bless", `Could not restore weapons on ${actor.name}: ${e.message}`);
      }
    });

    // Round change: remove Bless AEs if caster is NOT focusing on Bless
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      // Find all Bless AEs on all characters
      for (const actor of game.actors.filter(a => a.type === "character")) {
        const blessAEs = actor.effects.filter(e =>
          e.getFlag(MODULE_ID, BLESS_AE_FLAG) || e.getFlag(MODULE_ID, BLESS_SILVER_FLAG)
        );
        for (const ae of blessAEs) {
          const casterId = ae.getFlag(MODULE_ID, "blessCasterId") || ae.getFlag(MODULE_ID, "auraBuff");
          if (!casterId) continue;
          const caster = game.actors.get(casterId);
          if (!caster) continue;

          // Check if caster is focusing on Bless
          const focusedIds = caster.system?.focus?.spellIds || [];
          const isFocusingBless = focusedIds.some(id => {
            const spell = caster.items.get(id);
            return spell?.name?.toLowerCase() === "bless";
          });

          // Aura Bless stays as long as the aura is active (aura requires focus inherently)
          const isAuraBless = !!ae.getFlag(MODULE_ID, "auraBuff");
          if (isAuraBless) continue; // Aura manager handles its own cleanup

          if (!isFocusingBless) {
            await actor.deleteEmbeddedDocuments("ActiveEffect", [ae.id]);
            log("Bless", `Bless expired on ${actor.name} — caster ${caster.name} not focusing`);

            // Restore silvered weapons if this was a weapon bless
            if (ae.getFlag(MODULE_ID, BLESS_SILVER_FLAG)) {
              for (const weapon of actor.items.filter(i => i.getFlag(MODULE_ID, "blessOrigMetal") !== undefined)) {
                const origMetal = weapon.getFlag(MODULE_ID, "blessOrigMetal");
                await weapon.update({
                  "system.metal": origMetal || "",
                  [`flags.${MODULE_ID}.-=blessOrigMetal`]: null
                });
              }
            }
          }
        }
      }
    });
  },

  /* -------------------------------------------- */
  /*  Save Roll Hook — d4 Bonus                    */
  /* -------------------------------------------- */

  /**
   * Called BEFORE handleSaveRoll to inject +1d4 into the save roll formula.
   * Temporarily patches buildD20Formula to append the blessed die.
   * @param {object} ctx - { actor, saveType }
   */
  async onPreRollSave(ctx) {
    // Check for Bless buff from: direct cast, our aura, or Aura Effects module propagation
    const blessAE = ctx.actor.effects.find(e =>
      e.getFlag(MODULE_ID, BLESS_AE_FLAG)
      || e.getFlag(MODULE_ID, "auraSpell") === "Bless"
      || (e.flags?.auraeffects?.fromAura && e.name?.includes("Bless") && !e.name?.includes("Silver"))
    );
    if (!blessAE || blessAE.disabled) return;

    // Temporarily patch buildD20Formula to add +1d4[blessed] to the formula
    const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
    ctx._blessOrigBuildFormula = VagabondRollBuilder.buildD20Formula;
    VagabondRollBuilder.buildD20Formula = function (actor, favorHinder, baseFormula) {
      let formula = ctx._blessOrigBuildFormula.call(this, actor, favorHinder, baseFormula);
      // Only add d4 if this actor has the Bless buff
      const hasBless = actor.effects?.find(e =>
        e.getFlag(MODULE_ID, BLESS_AE_FLAG) || e.getFlag(MODULE_ID, "auraSpell") === "Bless"
      );
      if (hasBless && !hasBless.disabled) {
        formula += ` + 1d4[blessed]`;
      }
      return formula;
    };
    ctx._blessApplied = true;
    log("Bless", `${ctx.actor.name}: +1d4[blessed] injected for ${ctx.saveType} save`);
  },

  /**
   * Called AFTER handleSaveRoll to restore the original buildD20Formula.
   * @param {object} ctx
   */
  async onPostRollSave(ctx) {
    if (ctx._blessApplied && ctx._blessOrigBuildFormula) {
      const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
      VagabondRollBuilder.buildD20Formula = ctx._blessOrigBuildFormula;
    }
  },

  /* -------------------------------------------- */
  /*  Spell Cast Detection                         */
  /* -------------------------------------------- */

  /**
   * Detect Bless spell cast and inject mode selection buttons.
   */
  async _onBlessCast(message) {
    const content = message.content ?? "";
    if (!content.includes("vagabond-chat-card-v2")) return;
    if (content.includes('data-action="vce-bless-mode"')) return;

    const actorId = message.flags?.vagabond?.actorId;
    const itemId = message.flags?.vagabond?.itemId;
    if (!actorId || !itemId) return;

    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) return;

    const item = actor.items.get(itemId);
    if (!item || item.type !== "spell") return;
    if (item.name.toLowerCase() !== "bless") return;

    const targets = message.flags?.vagabond?.targetsAtRollTime || [];
    const targetsJson = JSON.stringify(targets).replace(/"/g, "&quot;");
    const isAura = content.includes('data-delivery-type="aura"');

    const btnHtml = `<div class="vce-bless-actions" style="margin-top:0.5rem; text-align:center;">
      <div class="save-buttons-row">
        <button class="vce-bless-btn" data-vagabond-button="true"
          data-action="vce-bless-mode" data-mode="allies"
          data-actor-id="${actorId}" data-targets="${targetsJson}" data-is-aura="${isAura}"
          style="padding:4px 12px; margin:2px; border-radius:4px; cursor:pointer;">
          <i class="fas fa-shield-alt" style="color:#87CEEB;"></i> Bless Allies (+d4 Saves)
        </button>
        <button class="vce-bless-btn" data-vagabond-button="true"
          data-action="vce-bless-mode" data-mode="weapons"
          data-actor-id="${actorId}" data-targets="${targetsJson}" data-is-aura="${isAura}"
          style="padding:4px 12px; margin:2px; border-radius:4px; cursor:pointer;">
          <i class="fas fa-hammer" style="color:#C0C0C0;"></i> Bless Weapons (Silvered)
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

    // Only the message author or GM can update chat messages
    if (!message.isAuthor && !game.user.isGM) return;
    try {
      await message.update({ content: newContent });
      log("Bless", `Injected Bless mode buttons for ${actor.name}`);
    } catch {
      // Permission issue — buttons will be added via renderChatMessage handler instead
    }
  },

  /* -------------------------------------------- */
  /*  Click Handlers                               */
  /* -------------------------------------------- */

  _attachHandlers(el) {
    el.querySelectorAll('.vce-bless-btn[data-action="vce-bless-mode"]').forEach(btn => {
      if (btn._vceHandled) return;
      btn._vceHandled = true;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const mode = btn.dataset.mode;
        const actorId = btn.dataset.actorId;
        const isAura = btn.dataset.isAura === "true";
        const targets = JSON.parse(btn.dataset.targets?.replace(/&quot;/g, '"') || "[]");
        const actor = game.actors.get(actorId);
        if (!actor) return;

        if (isAura) {
          // AURA: set mode on activeAura flag → aura system handles range-based application
          // Send request to GM who has permission to update the flag and rescan
          const modeLabel = mode === "allies" ? "+d4 Saves" : "Silvered Weapons";
          await ChatMessage.create({
            content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
              <div class="card-body"><section class="content-body">
                <div class="card-description" style="text-align:center;">
                  <strong>${actor.name}</strong> chooses Bless Aura: <strong>${modeLabel}</strong>
                  <br><span style="font-size:0.8em; opacity:0.7;">${game.user.isGM ? "Applied." : "Waiting for GM…"}</span>
                </div>
              </section></div>
            </div>`,
            speaker: ChatMessage.getSpeaker({ actor }),
            flags: {
              [MODULE_ID]: {
                blessAuraMode: true,
                blessMode: mode,
                casterId: actorId
              }
            }
          });
          // GM: the createChatMessage hook (line 53) handles _setBlessAuraMode
          // for the flagged message above — no need to call it directly here,
          // which would cause a duplicate race condition.
        } else {
          // NON-AURA (Touch/Remote): apply directly or request GM
          if (game.user.isGM) {
            if (mode === "allies") await this._applyBlessAllies(actor, targets);
            else if (mode === "weapons") await this._applyBlessWeapons(actor, targets);
          } else {
            const targetNames = targets.map(t => t.actorName).join(", ");
            const modeLabel = mode === "allies" ? "+d4 Saves" : "Silvered Weapons";
            await ChatMessage.create({
              content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
                <div class="card-body"><section class="content-body">
                  <div class="card-description" style="text-align:center;">
                    <strong>${actor.name}</strong> requests Bless (${modeLabel}) on: <strong>${targetNames}</strong>
                    <br><span style="font-size:0.8em; opacity:0.7;">Waiting for GM…</span>
                  </div>
                </section></div>
              </div>`,
              speaker: ChatMessage.getSpeaker({ actor }),
              flags: {
                [MODULE_ID]: {
                  blessRequest: true,
                  blessMode: mode,
                  casterId: actorId,
                  targets
                }
              }
            });
            ui.notifications.info("Bless request sent to GM.");
          }
        }

        // Disable both buttons
        const parent = btn.closest(".vce-bless-actions");
        if (parent) {
          parent.querySelectorAll("button").forEach(b => {
            b.disabled = true;
            b.style.opacity = "0.5";
          });
          btn.innerHTML = `<i class="fas fa-check"></i> ${mode === "allies" ? "Allies Blessed" : "Weapons Blessed"}`;
        }
      });
    });
  },

  /* -------------------------------------------- */
  /*  Aura Mode Setting                             */
  /* -------------------------------------------- */

  /**
   * Set the Bless aura mode on the caster's activeAura flag.
   * Removes existing aura buffs and triggers a rescan so the aura system
   * applies the correct buff type based on range.
   */
  async _setBlessAuraMode(caster, mode) {
    const { AuraManager } = await import("../aura/aura-manager.mjs");

    // Update the mode in the activeAura flag
    await caster.setFlag(MODULE_ID, "activeAura.blessMode", mode);

    // Remove all existing aura buffs (will be re-applied with new mode on rescan)
    await AuraManager._removeAllBuffs(caster);

    // Trigger a rescan so buffs are re-applied with the new mode
    const auraState = caster.getFlag(MODULE_ID, "activeAura");
    const token = AuraManager._getCasterToken(caster);
    if (token && auraState) {
      await AuraManager._applyBuffsInRange(caster, token, auraState.spellKey, auraState.radius);
    }

    const modeLabel = mode === "allies" ? "+d4 Saves" : "Silvered Weapons";
    log("Bless", `Bless aura mode set to ${modeLabel} for ${caster.name}`);
  },

  /* -------------------------------------------- */
  /*  Apply Bless Modes                            */
  /* -------------------------------------------- */

  /**
   * Bless Allies: apply a managed AE that flags the actor for d4 save bonus.
   * The actual d4 is rolled in onPreRollSave.
   */
  async _applyBlessAllies(caster, targets) {
    const affected = [];

    // Apply to targeted actors only
    const targetActors = targets.length > 0
      ? targets.map(t => game.actors.get(t.actorId)).filter(Boolean)
      : [];

    for (const target of targetActors) {
      // Skip actors we don't have permission to modify
      if (!target.isOwner && !game.user.isGM) continue;
      // Skip if already blessed
      if (target.effects.find(e => e.getFlag(MODULE_ID, BLESS_AE_FLAG))) continue;

      try {
        await target.createEmbeddedDocuments("ActiveEffect", [{
          name: `Bless (${caster.name})`,
          icon: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
          origin: `Actor.${caster.id}`,
          changes: [],
          disabled: false,
          transfer: true,
          flags: {
            [MODULE_ID]: {
              managed: true,
              [BLESS_AE_FLAG]: true,
              blessCasterId: caster.id
            }
          }
        }]);
        affected.push(target.name);
      } catch (e) {
        log("Bless", `Could not bless ${target.name} (permission): ${e.message}`);
      }
    }

    if (affected.length > 0) {
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-shield-alt" style="color:#87CEEB;"></i>
              <strong>${caster.name}</strong> blesses <strong>${affected.join(", ")}</strong>
              <br><span style="font-size:0.85em; opacity:0.7;">+d4 to Saves (rolled per save)</span>
            </div>
          </section></div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: caster })
      });
      log("Bless", `${caster.name} blessed allies: ${affected.join(", ")}`);
    }
  },

  /**
   * Bless Weapons: apply a managed AE that flags equipped weapons as Silvered.
   * The system checks attackingWeapon.system.metal for "silver" weakness bypass.
   */
  async _applyBlessWeapons(caster, targets) {
    const affected = [];

    // Apply to targeted actors only
    const targetActors = targets.length > 0
      ? targets.map(t => game.actors.get(t.actorId)).filter(Boolean)
      : [];

    for (const target of targetActors) {
      // Skip actors we don't have permission to modify
      if (!target.isOwner && !game.user.isGM) {
        log("Bless", `Skipping ${target.name} — no permission (not owner)`);
        continue;
      }

      // Find equipped weapons
      const weapons = target.items.filter(i => {
        const isWeapon = i.type === "weapon" || (i.type === "equipment" && i.system.equipmentType === "weapon");
        return isWeapon && i.system.equipped;
      });

      try {
      for (const weapon of weapons) {
        // Skip if already blessed
        if (weapon.effects?.find(e => e.getFlag(MODULE_ID, BLESS_SILVER_FLAG))) continue;

        // Store original metal and set to silver
        const origMetal = weapon.system.metal || "";
        if (origMetal !== "silver") {
          await weapon.update({
            "system.metal": "silver",
            [`flags.${MODULE_ID}.blessOrigMetal`]: origMetal
          });
        }
        affected.push(`${target.name}'s ${weapon.name}`);
      }

      // Create a display AE on the actor
      if (weapons.length > 0 && !target.effects.find(e => e.getFlag(MODULE_ID, BLESS_SILVER_FLAG))) {
        await target.createEmbeddedDocuments("ActiveEffect", [{
          name: `Bless: Silvered (${caster.name})`,
          icon: "icons/commodities/metal/ingot-silver.webp",
          origin: `Actor.${caster.id}`,
          changes: [],
          disabled: false,
          transfer: true,
          flags: {
            [MODULE_ID]: {
              managed: true,
              [BLESS_SILVER_FLAG]: true,
              blessCasterId: caster.id
            }
          }
        }]);
      }
      } catch (e) {
        log("Bless", `Could not silver ${target.name}'s weapons (permission): ${e.message}`);
      }
    }

    if (affected.length > 0) {
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-sword" style="color:#C0C0C0;"></i>
              <strong>${caster.name}</strong> blesses weapons: <strong>${affected.join(", ")}</strong>
              <br><span style="font-size:0.85em; opacity:0.7;">Weapons count as Silvered</span>
            </div>
          </section></div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: caster })
      });
      log("Bless", `${caster.name} blessed weapons: ${affected.join(", ")}`);
    }
  }
};
