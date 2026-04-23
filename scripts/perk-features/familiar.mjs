/**
 * Familiar Perk Automation
 * Handles the Familiar perk's ritual conjure mechanics: creature selection dialog,
 * token placement, banishment, and action rolling via caster's Cast Skill.
 *
 * RULES
 * ─────
 * - 10-minute Ritual to conjure a Small Being with HD: 1
 * - Uses caster's Cast Skill for Checks and Saves
 * - Can cast spells through familiar as conduit (originating from familiar)
 * - Banished at 0 HP or when ritual is conducted again
 * - No mana cost, no focus required
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { CONTROLLER_TYPES } from "../companion/save-routing.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const FLAG_FAMILIAR = "activeFamiliar";

const SIZE_MAP = {
  tiny: 0.5, small: 1, medium: 1, large: 2,
  huge: 3, giant: 4, gargantuan: 4, colossal: 5
};

/* -------------------------------------------- */
/*  FamiliarFeatures                             */
/* -------------------------------------------- */

export const FamiliarFeatures = {

  /* -------------------------------------------- */
  /*  Hook Registration                            */
  /* -------------------------------------------- */

  registerHooks() {
    // Watch familiar actor HP for 0 HP banishment.
    //
    // Deferred banish: mirrors the pattern in SummonerFeatures. The system's
    // own updateActor hook runs actor.toggleStatusEffect('dead', { active: true })
    // in parallel with this one. For an unlinked-token familiar, that AE create
    // needs to resolve its parent UUID (Scene.X.Token.Y.ActorDelta...) — but if
    // we delete the token first, Foundry throws
    //   "undefined id [tokenId] does not exist in the EmbeddedCollection"
    // during parent resolution. Deferring the banish 250ms lets the system's
    // async toggleStatusEffect finish before we wipe the token.
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type !== "npc") return;
      if (!game.user.isGM) return;

      const newHP = changes.system?.health?.value ?? changes["system.health.value"];
      if (newHP === undefined || newHP > 0) return;

      for (const char of game.actors.filter(a => a.type === "character")) {
        const familiar = char.getFlag(MODULE_ID, FLAG_FAMILIAR);
        if (familiar?.summonActorId === actor.id) {
          setTimeout(() => this.banishFamiliar(char, "Defeated (0 HP)"), 250);
          break;
        }
      }
    });

    // Inject "Conjure Familiar" / "Banish Familiar" into the right-click context
    // menu for the Familiar perk item on the character sheet.
    this._patchFeatureContextMenu();

    log("Familiar", "Familiar hooks registered.");
  },

  _contextMenuPatched: false,

  _patchFeatureContextMenu() {
    const self = this;

    Hooks.on("renderApplicationV2", (app) => {
      if (self._contextMenuPatched) return;
      const handler = app.inventoryHandler;
      if (!handler) return;

      const proto = Object.getPrototypeOf(handler);
      if (!proto || !proto.showFeatureContextMenu) return;

      const original = proto.showFeatureContextMenu;
      proto.showFeatureContextMenu = async function(event, itemIdOrData, itemType) {
        // For perks, itemIdOrData is the item ID string
        if (typeof itemIdOrData === "string") {
          const actor = this.actor;
          if (actor?.type === "character") {
            const clickedItem = actor.items.get(itemIdOrData);
            if (clickedItem?.type === "perk" && clickedItem.name.toLowerCase() === "familiar") {
              const features = getFeatures(actor);
              if (features?.perk_familiar) {
                // Intercept: build custom menu with familiar options
                event.preventDefault();
                event.stopPropagation();
                this.hideInventoryContextMenu();

                const { ContextMenuHelper } = globalThis.vagabond.utils;
                const { VagabondChatCard } = globalThis.vagabond.utils;

                const menuItems = [
                  {
                    label: "Send to Chat",
                    icon: "fas fa-comment",
                    enabled: true,
                    action: async () => { await VagabondChatCard.itemUse(actor, clickedItem); }
                  }
                ];

                const activeFamiliar = actor.getFlag(MODULE_ID, FLAG_FAMILIAR);
                if (activeFamiliar) {
                  const skillLabel = activeFamiliar.familiarSkill === "arcana" ? "Arcana" : "Mysticism";
                  menuItems.push({
                    label: `${activeFamiliar.summonName} (${skillLabel})`,
                    icon: "fas fa-paw",
                    enabled: false,
                    action: () => {}
                  });
                  menuItems.push({
                    label: "Familiar Check",
                    icon: "fas fa-dice-d20",
                    enabled: true,
                    action: () => self.rollFamiliarCheck(actor, activeFamiliar)
                  });
                  menuItems.push({
                    label: "Familiar Save",
                    icon: "fas fa-shield-alt",
                    enabled: true,
                    action: () => self.rollFamiliarSave(actor, activeFamiliar)
                  });
                  // Add action buttons for each familiar action
                  const famActor = game.actors.get(activeFamiliar.summonActorId);
                  const actions = famActor?.system?.actions || [];
                  for (let i = 0; i < actions.length; i++) {
                    const a = actions[i];
                    menuItems.push({
                      label: `Action: ${a.name}`,
                      icon: "fas fa-fist-raised",
                      enabled: true,
                      action: () => self.rollFamiliarAction(actor, activeFamiliar, i)
                    });
                  }
                  menuItems.push({
                    label: "Banish Familiar",
                    icon: "fas fa-times",
                    enabled: true,
                    action: () => self.banishFamiliar(actor, "Dismissed")
                  });
                  menuItems.push({
                    label: "Conjure New Familiar",
                    icon: "fas fa-sync",
                    enabled: true,
                    action: () => self.showConjureDialog(actor)
                  });
                } else {
                  menuItems.push({
                    label: "Conjure Familiar",
                    icon: "fas fa-paw",
                    enabled: true,
                    action: () => self.showConjureDialog(actor)
                  });
                }

                menuItems.push({
                  label: "Edit",
                  icon: "fas fa-edit",
                  enabled: true,
                  action: () => { clickedItem.sheet.render(true); }
                });

                menuItems.push({
                  label: "Delete",
                  icon: "fas fa-trash",
                  enabled: true,
                  action: async () => {
                    const confirmed = await foundry.applications.api.DialogV2.confirm({
                      window: { title: `Delete ${clickedItem.name}?` },
                      content: `<p>Are you sure you want to delete <strong>${clickedItem.name}</strong>?</p>`,
                      rejectClose: false,
                      modal: true,
                    });
                    if (confirmed) await clickedItem.delete();
                  }
                });

                this._currentContextMenu = ContextMenuHelper.create({
                  position: { x: event.clientX, y: event.clientY },
                  items: menuItems,
                  onClose: () => { this._currentContextMenu = null; },
                  className: "inventory-context-menu"
                });
                return;
              }
            }
          }
        }

        // Not a Familiar perk — fall through to original
        return original.call(this, event, itemIdOrData, itemType);
      };

      self._contextMenuPatched = true;
      log("Familiar", "Feature context menu patched for Familiar perk.");
    });
  },

  /* -------------------------------------------- */
  /*  Conjure Dialog                               */
  /* -------------------------------------------- */

  /**
   * Show the creature selection dialog for conjuring a familiar.
   * Filters: HD 1, Small size, non-Humanlike.
   * @param {Actor} actor - The caster actor
   */
  async showConjureDialog(actor) {
    const features = getFeatures(actor);
    if (!features?.perk_familiar) {
      ui.notifications.warn("This character doesn't have the Familiar perk.");
      return;
    }

    const candidates = await this._gatherCandidates();

    if (candidates.length === 0) {
      ui.notifications.warn("No eligible creatures found (HD 1, Small size).");
      return;
    }

    candidates.sort((a, b) => a.name.localeCompare(b.name));

    const rows = candidates.map((c, idx) => {
      const speedExtras = [];
      const sv = c.speedValues || {};
      if (sv.fly) speedExtras.push(`Fly ${sv.fly}'`);
      if (sv.swim) speedExtras.push(`Swim ${sv.swim}'`);
      if (sv.climb) speedExtras.push(`Climb ${sv.climb}'`);
      const speedStr = `${c.speed || 30}'` + (speedExtras.length ? ` (${speedExtras.join(", ")})` : "");

      const actions = (c.actions ?? []).map(a => {
        const dmg = a.rollDamage || a.flatDamage || "—";
        return `${a.name}: ${dmg}`;
      }).join("; ");

      return `
        <tr class="vce-summon-row" data-idx="${idx}" role="button" tabindex="0">
          <td class="vce-bd-cell vce-bd-cell-img">
            <img src="${c.img || "icons/svg/mystery-man.svg"}" class="vce-bd-beast-img" alt="" />
          </td>
          <td class="vce-bd-cell"><strong>${c.name}</strong></td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.beingType || "—"}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.armor || 0}</td>
          <td class="vce-bd-cell">${speedStr}</td>
          <td class="vce-bd-cell vce-bd-cell-actions">${actions || "—"}</td>
        </tr>`;
    }).join("");

    const content = `
      <div style="margin-bottom:8px;">
        <input type="text" class="vce-summon-search" placeholder="Search creatures..."
          style="width:100%; padding:4px 8px; border:1px solid #999; border-radius:4px;" />
      </div>
      <div class="vce-bd-scroll" style="max-height:400px; overflow-y:auto;">
        <table class="vce-bd-table" role="grid">
          <thead>
            <tr class="vce-bd-header-row">
              <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
              <th class="vce-bd-th" scope="col">Creature</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Type</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Armor</th>
              <th class="vce-bd-th" scope="col">Speed</th>
              <th class="vce-bd-th" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:0.85em; opacity:0.7; margin-top:4px;">
        Familiar: HD 1, Small creatures only | No Mana cost (Ritual)
      </p>
    `;

    return new Promise((resolve) => {
      const d = new Dialog({
        title: `${actor.name} — Conjure Familiar`,
        content,
        buttons: {
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
        },
        default: "cancel",
        render: (html) => {
          html.find(".vce-summon-search").on("input", (ev) => {
            const query = ev.target.value.toLowerCase();
            html.find(".vce-summon-row").each(function () {
              const name = this.querySelector("strong")?.textContent?.toLowerCase() || "";
              this.style.display = name.includes(query) ? "" : "none";
            });
          });

          html.find(".vce-summon-row").on("click", async (ev) => {
            const idx = parseInt(ev.currentTarget.dataset.idx);
            const selected = candidates[idx];
            if (!selected) return;
            d.close();
            await this.conjureFamiliar(actor, selected);
            resolve(selected);
          });

          html.find(".vce-summon-row").on("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              ev.currentTarget.click();
            }
          });

          setTimeout(() => html.find(".vce-summon-search").focus(), 50);
        },
        close: () => resolve(null)
      }, { width: 650, height: 450 });
      d.render(true);
    });
  },

  /* -------------------------------------------- */
  /*  Conjure / Banish                             */
  /* -------------------------------------------- */

  /**
   * Conjure a familiar: place token, store flag.
   * @param {Actor} actor - The caster
   * @param {object} npcData - Creature data
   */
  async conjureFamiliar(actor, npcData) {
    // Banish existing familiar if any
    const existing = actor.getFlag(MODULE_ID, FLAG_FAMILIAR);
    if (existing) {
      await this.banishFamiliar(actor, "Replaced by new familiar");
    }

    // Choose which skill the familiar uses for checks/saves
    const familiarSkill = await new Promise(resolve => {
      new Dialog({
        title: "Familiar — Cast Skill",
        content: `<p>Which skill will <strong>${npcData.name}</strong> use for Checks and Saves?</p>`,
        buttons: {
          arcana: { icon: '<i class="fas fa-hat-wizard"></i>', label: "Arcana", callback: () => resolve("arcana") },
          mysticism: { icon: '<i class="fas fa-moon"></i>', label: "Mysticism", callback: () => resolve("mysticism") }
        },
        default: "arcana",
        close: () => resolve(null)
      }).render(true);
    });
    if (!familiarSkill) return; // Cancelled

    // Get or import the source actor (via GM relay if player)
    let sourceActorId = npcData.worldActorId;
    let importedFromCompendium = false;

    if (!sourceActorId && npcData.compendiumUuid) {
      try {
        const result = await gmRequest("importActor", { uuid: npcData.compendiumUuid });
        sourceActorId = result.actorId;
        importedFromCompendium = true;
      } catch (e) {
        ui.notifications.error(`Failed to import creature: ${e.message}`);
        return;
      }
    }

    if (!sourceActorId) {
      ui.notifications.error("Could not resolve source actor for familiar.");
      return;
    }

    // Place token on canvas (via GM relay if player)
    const casterToken = actor.getActiveTokens()?.[0];
    if (!casterToken) {
      ui.notifications.warn("No caster token on canvas.");
      return;
    }

    const gridSize = canvas.grid?.size ?? 100;
    const sizeMultiplier = SIZE_MAP[npcData.size?.toLowerCase()] ?? 1;

    let tokenId;
    try {
      const result = await gmRequest("placeToken", {
        sceneId: canvas.scene.id,
        tokenData: {
          name: npcData.name,
          actorId: sourceActorId,
          texture: { src: npcData.img || "icons/svg/mystery-man.svg" },
          x: casterToken.document.x + gridSize,
          y: casterToken.document.y,
          width: sizeMultiplier,
          height: sizeMultiplier,
          disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY
        }
      });
      tokenId = result.tokenId;
    } catch (e) {
      ui.notifications.error(`Failed to place familiar token: ${e.message}`);
      if (importedFromCompendium) {
        try { await gmRequest("deleteActor", { actorId: sourceActorId }); } catch { /* best effort */ }
      }
      return;
    }

    // Stamp controller flags so the familiar's saves route through its caster.
    // Atomic via updateActorFlags. Non-fatal — the familiar works without routing,
    // and the player can Set Save Controller manually if the stamp fails.
    try {
      await gmRequest("updateActorFlags", {
        actorId: sourceActorId,
        scope:   MODULE_ID,
        flags: {
          controllerActorId: actor.id,
          controllerType:    CONTROLLER_TYPES.COMPANION
        }
      });
    } catch (e) {
      console.warn(`${MODULE_ID} | Familiar | Failed to stamp controller flags on ${npcData.name}:`, e);
    }

    // Store familiar state
    await actor.setFlag(MODULE_ID, FLAG_FAMILIAR, {
      summonActorId: sourceActorId,
      summonTokenId: tokenId,
      summonName: npcData.name,
      summonImg: npcData.img,
      summonHD: npcData.hd,
      familiarSkill,
      importedFromCompendium,
      sceneId: canvas.scene.id
    });

    // Chat notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <img src="${npcData.img || "icons/svg/mystery-man.svg"}" width="36" height="36"
              style="border:none; vertical-align:middle; margin-right:8px;">
            <strong>${actor.name}</strong> conjures familiar <strong>${npcData.name}</strong>
            (HD ${npcData.hd}, Ritual)
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    log("Familiar", `${actor.name} conjured familiar ${npcData.name}`);
  },

  /**
   * Banish the active familiar: remove token, clean up.
   * @param {Actor} actor - The caster
   * @param {string} reason - Why the familiar was banished
   */
  async banishFamiliar(actor, reason = "Banished") {
    const familiar = actor.getFlag(MODULE_ID, FLAG_FAMILIAR);
    if (!familiar) return;

    // Remove token from canvas (via GM relay if player)
    const sceneId = familiar.sceneId || canvas.scene?.id;
    if (sceneId && familiar.summonTokenId) {
      try { await gmRequest("removeToken", { sceneId, tokenId: familiar.summonTokenId }); }
      catch (e) { log("Familiar", `Could not remove token: ${e.message}`); }
    }

    // Delete imported actor if from compendium (via GM relay if player)
    if (familiar.importedFromCompendium && familiar.summonActorId) {
      try { await gmRequest("deleteActor", { actorId: familiar.summonActorId }); }
      catch (e) { log("Familiar", `Could not delete imported actor: ${e.message}`); }
    }

    // Clear flag
    await actor.unsetFlag(MODULE_ID, FLAG_FAMILIAR);

    // Chat notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>${actor.name}</strong>'s familiar <strong>${familiar.summonName}</strong>
            is banished. <em>(${reason})</em>
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    log("Familiar", `${actor.name}'s familiar ${familiar.summonName} banished: ${reason}`);
  },

  /**
   * Get the active familiar state for an actor.
   * @param {Actor} actor
   * @returns {object|null}
   */
  getActiveFamiliar(actor) {
    return actor?.getFlag(MODULE_ID, FLAG_FAMILIAR) ?? null;
  },

  /* -------------------------------------------- */
  /*  Familiar Action Rolling                      */
  /* -------------------------------------------- */

  /**
   * Roll a familiar's action using the caster's Cast Skill.
   * @param {Actor} caster - The caster actor
   * @param {object} familiar - The active familiar flag data
   * @param {number} actionIdx - Index into the familiar actor's actions array
   */
  async rollFamiliarAction(caster, familiar, actionIdx) {
    const familiarActor = game.actors.get(familiar.summonActorId);
    if (!familiarActor) {
      ui.notifications.error("Familiar actor not found.");
      return;
    }

    const action = familiarActor.system?.actions?.[actionIdx];
    if (!action) {
      ui.notifications.error("Action not found.");
      return;
    }

    const attackType = action.attackType || "melee";
    const needsCheck = !!action.attackType;

    // Use the skill chosen at conjure time (Arcana or Mysticism)
    const skillKey = familiar.familiarSkill || "mysticism";
    const skill = caster.system.skills?.[skillKey];
    const difficulty = skill?.difficulty ?? 12;

    const targets = Array.from(game.user.targets).map(t => ({
      tokenId: t.id, sceneId: t.scene?.id,
      actorId: t.actor?.id, actorName: t.name,
      actorImg: t.document?.texture?.src
    }));

    let roll = null;
    let isSuccess = true;
    let isCritical = false;

    if (needsCheck) {
      const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
      const rollData = caster.getRollData();
      const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
        caster.system.favorHinder || "none", false, false
      );
      roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);
      isSuccess = roll.total >= difficulty;
      const critNum = VagabondRollBuilder.calculateCritThreshold(rollData, "spell");
      const d20 = roll.terms.find(t => t.constructor.name === "Die" && t.faces === 20);
      isCritical = (d20?.results?.[0]?.result ?? 0) >= critNum;
    }

    let damageRoll = null;
    const hasDamage = action.rollDamage || action.flatDamage;
    if (isSuccess && hasDamage) {
      const formula = action.rollDamage || action.flatDamage || "0";
      damageRoll = new Roll(formula);
      await damageRoll.evaluate();
    }

    const tags = [];
    tags.push({ label: skill?.label || "Cast Skill", cssClass: "tag-skill" });
    if (hasDamage) {
      const dmgLabel = action.rollDamage || action.flatDamage || "";
      const dType = action.damageType;
      if (dType && dType !== "-") {
        const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType] || "fas fa-burst";
        tags.push({ label: dmgLabel, icon, cssClass: "tag-damage" });
      } else {
        tags.push({ label: dmgLabel, cssClass: "tag-damage" });
      }
    }
    if (action.note) {
      tags.push({ label: action.note, cssClass: "tag-standard" });
    }

    const { VagabondChatCard } = globalThis.vagabond.utils;

    const fakeItem = {
      name: `${action.name}`,
      img: familiar.summonImg || "icons/svg/mystery-man.svg",
      system: { description: action.extraInfo || "" }
    };

    const rollResultData = needsCheck ? {
      roll,
      difficulty,
      isSuccess,
      isCritical,
      isHit: isSuccess,
      weaponSkill: skill,
      weaponSkillKey: skillKey,
      favorHinder: caster.system.favorHinder || "none",
      critStatBonus: isCritical ? (caster.system.stats?.[skill?.stat]?.value || 0) : 0
    } : null;

    await VagabondChatCard.createActionCard({
      actor: caster,
      item: fakeItem,
      title: `${action.name} (${familiar.summonName})`,
      rollData: rollResultData,
      tags,
      damageRoll,
      damageFormula: action.rollDamage && action.flatDamage
        ? `${action.rollDamage} + ${action.flatDamage}`
        : (action.rollDamage || action.flatDamage || null),
      damageType: action.damageType || "-",
      description: action.extraInfo || "",
      hasDefenses: true,
      attackType,
      targetsAtRollTime: targets,
      actionIndex: actionIdx
    });

    log("Familiar", `${caster.name} used ${familiar.summonName}'s ${action.name}: ${isSuccess ? "hit" : "miss"}${damageRoll ? ` for ${damageRoll.total}` : ""}`);
  },

  /* -------------------------------------------- */
  /*  Familiar Check / Save                        */
  /* -------------------------------------------- */

  /**
   * Roll a generic check for the familiar using the caster's chosen skill.
   * @param {Actor} caster - The caster actor
   * @param {object} familiar - The active familiar flag data
   */
  async rollFamiliarCheck(caster, familiar) {
    const skillKey = familiar.familiarSkill || "mysticism";
    const skill = caster.system.skills?.[skillKey];
    const difficulty = skill?.difficulty ?? 12;

    const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
    const rollData = caster.getRollData();
    const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
      caster.system.favorHinder || "none", false, false
    );
    const roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);
    const isSuccess = roll.total >= difficulty;
    const critNum = VagabondRollBuilder.calculateCritThreshold(rollData, "spell");
    const d20 = roll.terms.find(t => t.constructor.name === "Die" && t.faces === 20);
    const isCritical = (d20?.results?.[0]?.result ?? 0) >= critNum;

    const { VagabondChatCard } = globalThis.vagabond.utils;
    const skillLabel = skill?.label || (skillKey === "arcana" ? "Arcana" : "Mysticism");

    await VagabondChatCard.createActionCard({
      actor: caster,
      item: { name: `${familiar.summonName} — Check`, img: familiar.summonImg || "icons/svg/mystery-man.svg", system: { description: "" } },
      title: `${familiar.summonName} Check (${skillLabel})`,
      rollData: { roll, difficulty, isSuccess, isCritical, isHit: isSuccess, weaponSkill: skill, weaponSkillKey: skillKey, favorHinder: caster.system.favorHinder || "none", critStatBonus: 0 },
      tags: [{ label: skillLabel, cssClass: "tag-skill" }],
      description: `Familiar check using ${skillLabel}`,
      hasDefenses: false
    });

    log("Familiar", `${caster.name}'s familiar ${familiar.summonName} check: ${roll.total} vs ${difficulty} — ${isSuccess ? "pass" : "fail"}${isCritical ? " (CRIT)" : ""}`);
  },

  /**
   * Roll a save for the familiar using the caster's chosen skill.
   * Uses the skill's difficulty as the save target.
   * @param {Actor} caster - The caster actor
   * @param {object} familiar - The active familiar flag data
   */
  async rollFamiliarSave(caster, familiar) {
    const skillKey = familiar.familiarSkill || "mysticism";
    const skill = caster.system.skills?.[skillKey];
    const difficulty = skill?.difficulty ?? 12;

    const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
    const rollData = caster.getRollData();
    const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
      caster.system.favorHinder || "none", false, false
    );
    const roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);
    const isSuccess = roll.total >= difficulty;
    const critNum = VagabondRollBuilder.calculateCritThreshold(rollData, "spell");
    const d20 = roll.terms.find(t => t.constructor.name === "Die" && t.faces === 20);
    const isCritical = (d20?.results?.[0]?.result ?? 0) >= critNum;

    const { VagabondChatCard } = globalThis.vagabond.utils;
    const skillLabel = skill?.label || (skillKey === "arcana" ? "Arcana" : "Mysticism");

    await VagabondChatCard.createActionCard({
      actor: caster,
      item: { name: `${familiar.summonName} — Save`, img: familiar.summonImg || "icons/svg/mystery-man.svg", system: { description: "" } },
      title: `${familiar.summonName} Save (${skillLabel})`,
      rollData: { roll, difficulty, isSuccess, isCritical, isHit: isSuccess, weaponSkill: skill, weaponSkillKey: skillKey, favorHinder: caster.system.favorHinder || "none", critStatBonus: 0 },
      tags: [{ label: skillLabel, cssClass: "tag-skill" }, { label: "Save", cssClass: "tag-standard" }],
      description: `Familiar save using ${skillLabel}`,
      hasDefenses: false
    });

    log("Familiar", `${caster.name}'s familiar ${familiar.summonName} save: ${roll.total} vs ${difficulty} — ${isSuccess ? "pass" : "fail"}${isCritical ? " (CRIT)" : ""}`);
  },

  /* -------------------------------------------- */
  /*  Internal Helpers                             */
  /* -------------------------------------------- */

  /**
   * Gather eligible creature candidates: HD 1, Small size, non-Humanlike.
   * Sources from world NPCs + system bestiary compendium.
   */
  async _gatherCandidates() {
    const candidates = [];
    const seen = new Set();

    // World NPCs
    for (const npc of game.actors.filter(a => a.type === "npc")) {
      const bt = npc.system.beingType || "";
      if (bt === "Humanlike") continue;
      const hd = npc.system.hd ?? 1;
      const size = (npc.system.size || "medium").toLowerCase();
      if (hd !== 1 || size !== "small") continue;
      candidates.push({
        name: npc.name,
        hd,
        beingType: bt,
        size: npc.system.size || "medium",
        armor: npc.system.armor ?? 0,
        speed: npc.system.speed ?? 30,
        speedValues: npc.system.speedValues || {},
        immunities: npc.system.immunities || [],
        weaknesses: npc.system.weaknesses || [],
        actions: npc.system.actions || [],
        img: npc.img,
        worldActorId: npc.id,
        compendiumUuid: null
      });
      seen.add(npc.name);
    }

    // Bestiary compendium — must request system fields explicitly for remote servers
    const bestiary = game.packs.get("vagabond.bestiary");
    if (bestiary) {
      const index = await bestiary.getIndex({ fields: [
        "system.beingType", "system.hd", "system.size", "system.armor",
        "system.speed", "system.speedTypes", "system.speedValues",
        "system.actions", "system.abilities", "system.senses",
        "system.immunities", "system.weaknesses"
      ]});
      for (const entry of index.values()) {
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        const bt = entry.system?.beingType || "";
        if (bt === "Humanlike") continue;
        const hd = entry.system?.hd ?? 1;
        const size = (entry.system?.size || "medium").toLowerCase();
        if (hd !== 1 || size !== "small") continue;
        candidates.push({
          name: entry.name,
          hd,
          beingType: bt,
          size: entry.system?.size || "medium",
          armor: entry.system?.armor ?? 0,
          speed: entry.system?.speed ?? 30,
          speedValues: entry.system?.speedValues || {},
          immunities: entry.system?.immunities || [],
          weaknesses: entry.system?.weaknesses || [],
          actions: entry.system?.actions || [],
          img: entry.img,
          worldActorId: null,
          compendiumUuid: entry.uuid
        });
      }
    }

    return candidates;
  }
};
