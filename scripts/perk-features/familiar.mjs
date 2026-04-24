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
import { CompanionSpawner } from "../companion/companion-spawner.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const FLAG_FAMILIAR = "activeFamiliar";

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

      // v0.4.0: CompanionTerminationManager owns dismissal for companions with
      // companionMeta. This hook only handles legacy v0.3.4 familiars where the
      // flag shape is only controllerActorId + activeFamiliar on the caster.
      if (actor.getFlag(MODULE_ID, "companionMeta")) return;

      for (const char of game.actors.filter(a => a.type === "character")) {
        const familiar = char.getFlag(MODULE_ID, FLAG_FAMILIAR);
        if (familiar?.summonActorId === actor.id) {
          setTimeout(() => this.banishFamiliar(char, "Defeated (0 HP)"), 250);
          break;
        }
      }
    });

    // Register source-specific dismiss cleanup — fires whenever a familiar-sourced
    // companion is dismissed via CompanionSpawner.dismiss (zeroHP auto-dismiss,
    // ritual-recast replace, Companions tab Dismiss button). Clears the caster-side
    // activeFamiliar flag and deletes the imported compendium actor if applicable.
    CompanionSpawner.registerDismissHandler("familiar", async (companionActor, { reason, meta, controller }) => {
      if (!controller) return;
      try {
        if (controller.getFlag(MODULE_ID, FLAG_FAMILIAR)) {
          await controller.unsetFlag(MODULE_ID, FLAG_FAMILIAR);
        }
        // Delete imported compendium actor if applicable
        if (meta?.meta?.importedFromCompendium && companionActor?.id) {
          try { await gmRequest("deleteActor", { actorId: companionActor.id }); }
          catch (e) { log("Familiar", `Could not delete imported actor on dismiss: ${e.message}`); }
        }
      } catch (e) {
        log("Familiar", `Familiar dismiss handler error: ${e.message}`);
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
                  // v0.4.0: "Conjure / Re-conjure Familiar" options moved to
                  // the Companions tab's action bar — single source of truth
                  // for all companion summoning.
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
   * Show the creature picker for conjuring a familiar.
   *
   * Uses the shared CreaturePicker for UI consistency with Beast/Raise/
   * Conjurer (sticky header, sortable columns, rich hover tooltip,
   * favorites). Favorites are stored on the caster via the
   * "familiarCodex" flag — right-click any row to toggle.
   *
   * Filter: HD 1, Small size, non-Humanlike.
   * @param {Actor} actor
   */
  async showConjureDialog(actor) {
    const features = getFeatures(actor);
    if (!features?.perk_familiar) {
      ui.notifications.warn("This character doesn't have the Familiar perk.");
      return;
    }

    const { CreaturePicker } = await import("../companion/creature-picker.mjs");
    const picks = await CreaturePicker.pick({
      title: `${actor.name} — Conjure Familiar (HD 1, Small)`,
      caster: actor,
      favoritesFlag: "familiarCodex",
      filter: {
        excludeTypes: ["humanlike"],
        sizes: ["small"],
        maxHD: 1,
        packs: ["vagabond.bestiary"],
      },
    });
    if (!picks || !picks.length) return;
    const { uuid, name } = picks[0];

    const doc = await fromUuid(uuid);
    if (!doc) {
      ui.notifications.error(`Could not resolve ${name}.`);
      return;
    }
    const fromCompendium = !!doc.pack;
    const npcData = {
      name,
      hd: 1,
      img: doc.img,
      size: doc.system?.size ?? "small",
      armor: doc.system?.armor ?? 0,
      beingType: doc.system?.beingType ?? "",
      worldActorId: fromCompendium ? null : doc.id,
      compendiumUuid: fromCompendium ? doc.uuid : null,
    };

    return await this.conjureFamiliar(actor, npcData);
  },

  /** Legacy helper retained for reference. */
  async _legacyShowConjureDialog(actor) {
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

    // Sort: favorites (Familiar Codex) first, then by name
    const codex = actor.getFlag(MODULE_ID, "familiarCodex") || [];
    candidates.sort((a, b) => {
      const aFav = codex.includes(a.name);
      const bFav = codex.includes(b.name);
      if (aFav !== bFav) return aFav ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

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

      const isFav = codex.includes(c.name);
      const starIcon = isFav
        ? '<i class="fas fa-star" style="color:#d4a843;" title="Favorited — right-click to unfavorite"></i>'
        : '<i class="far fa-star" style="opacity:0.35;" title="Right-click to favorite"></i>';

      return `
        <tr class="vce-summon-row" data-idx="${idx}" data-creature-name="${c.name}" role="button" tabindex="0">
          <td class="vce-bd-cell vce-bd-cell-center vce-summon-fav">${starIcon}</td>
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
              <th class="vce-bd-th vce-bd-th-center" scope="col" style="width:24px;"></th>
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
        Familiar: HD 1, Small creatures only | No Mana cost (Ritual)<br>
        <em>Right-click any row to favorite it — favorites appear at the top next time.</em>
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

          // Right-click: toggle Familiar Codex membership (favorite)
          html.find(".vce-summon-row").on("contextmenu", async (ev) => {
            ev.preventDefault();
            const row = ev.currentTarget;
            const name = row.dataset.creatureName;
            if (!name) return;
            const current = actor.getFlag(MODULE_ID, "familiarCodex") || [];
            const isFav = current.includes(name);
            const next = isFav ? current.filter(n => n !== name) : [...current, name];
            await actor.setFlag(MODULE_ID, "familiarCodex", next);

            // Toggle star icon
            const starCell = row.querySelector(".vce-summon-fav");
            if (starCell) {
              starCell.innerHTML = isFav
                ? '<i class="far fa-star" style="opacity:0.35;" title="Right-click to favorite"></i>'
                : '<i class="fas fa-star" style="color:#d4a843;" title="Favorited — right-click to unfavorite"></i>';
            }

            // Reorder tbody to reflect new favorite state
            const tbody = row.parentElement;
            if (!isFav) {
              // Just favorited — move to top
              tbody.insertBefore(row, tbody.firstElementChild);
            } else {
              // Just unfavorited — move to top of non-favorites section
              let target = null;
              for (const sib of tbody.children) {
                if (sib === row) continue;
                const sibName = sib.dataset.creatureName;
                if (sibName && !next.includes(sibName)) { target = sib; break; }
              }
              if (target) tbody.insertBefore(row, target);
              else tbody.appendChild(row);
            }

            ui.notifications.info(`${isFav ? "Removed" : "Added"} ${name} ${isFav ? "from" : "to"} Familiar Codex.`);
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

    // Validate caster has a token on canvas
    const casterToken = actor.getActiveTokens()?.[0];
    if (!casterToken) {
      ui.notifications.warn("No caster token on canvas.");
      return;
    }

    const gridSize = canvas.grid?.size ?? 100;

    // Resolve creature UUID (world actor OR compendium)
    const creatureUuid = npcData.worldActorId
      ? `Actor.${npcData.worldActorId}`
      : npcData.compendiumUuid;
    if (!creatureUuid) {
      ui.notifications.error("Could not resolve creature for familiar.");
      return;
    }

    // Delegate spawn to CompanionSpawner: handles import, placeToken,
    // flag stamping (controllerActorId + controllerType + companionMeta),
    // combat-add, ownership grant, and chat notification.
    const spawnResult = await CompanionSpawner.spawn({
      caster: actor,
      sourceId: "familiar",
      creatureUuid,
      tokenData: {
        name: npcData.name,
        texture: { src: npcData.img || "icons/svg/mystery-man.svg" },
        x: casterToken.document.x + gridSize,
        y: casterToken.document.y,
        width: 1,
        height: 1,
        disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      },
      meta: {
        hd: npcData.hd ?? 1,
        ritual: true,
        familiarSkill,
        importedFromCompendium: !npcData.worldActorId && !!npcData.compendiumUuid,
      },
      // Familiar posts its own detailed ritual chat card with HD/skill details.
      // Suppress the engine's generic "{caster} conjures {creature} (Familiar)"
      // to avoid double chat messages.
      suppressChat: true,
    });
    if (!spawnResult.success) {
      ui.notifications.error(`Failed to conjure familiar: ${spawnResult.error ?? "unknown error"}`);
      return;
    }

    const sourceActorId = spawnResult.actorId;
    const tokenId = spawnResult.tokenId;
    const importedFromCompendium = !npcData.worldActorId && !!npcData.compendiumUuid;

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
