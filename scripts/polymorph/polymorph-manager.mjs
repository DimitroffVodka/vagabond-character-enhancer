/**
 * Polymorph Manager
 * Orchestrates the full beast-form transformation: dialog, token swap,
 * stat overlay, and reversion when focus drops.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";
import { PolymorphDialog } from "./polymorph-dialog.mjs";
import { BeastCache } from "./beast-cache.mjs";

/* -------------------------------------------- */
/*  Size → Token Grid Mapping                   */
/* -------------------------------------------- */

const SIZE_MAP = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  giant: 4,
  gargantuan: 4,
  colossal: 5
};

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

export const PolymorphManager = {

  _log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} | Polymorph |`, ...args);
    }
  },

  /**
   * API for Vagabond Crawler integration.
   * Returns beast action menu data if the actor is currently polymorphed,
   * or null if not polymorphed.
   * @param {Actor} actor
   * @returns {object|null} { beastName, actions: [{label, dmg, type, index}], favorites: [{name, img}] }
   */
  getPolymorphMenuData(actor) {
    if (!actor) return null;
    const polyData = actor.getFlag(MODULE_ID, "polymorphData");

    // Beast actions (only when polymorphed)
    let beastActions = [];
    if (polyData) {
      beastActions = (polyData.actions || [])
        .map((a, i) => ({ ...a, _origIndex: i }))
        .filter(a => !a.isMultiAttackHeader && (a.rollDamage || a.flatDamage))
        .map(a => {
          const dmg = a.rollDamage || a.flatDamage || "";
          return {
            label: `${polyData.beastName}: ${a.name}`,
            dmg: dmg ? `<span class="vcs-menu-dmg">${dmg}</span>` : "",
            type: "beastaction",
            index: a._origIndex,
          };
        });
    }

    // Favorited beasts (for transform dropdown, always available for druids)
    const features = actor.getFlag(MODULE_ID, "features");
    const isDruid = !!(features?.druid_feralShift || features?.druid_primalMystic);
    let favorites = [];
    if (isDruid) {
      const favNames = actor.getFlag(MODULE_ID, "beastFavorites") || [];
      if (favNames.length > 0) {
        // Load from cache if available
        const BeastCacheRef = globalThis._vceBeastCache;
        if (BeastCacheRef?._ready) {
          const level = actor.system.attributes?.level?.value ?? 1;
          const allBeasts = BeastCacheRef.getAvailableBeasts(level);
          favorites = favNames
            .map(name => allBeasts.find(b => b.name === name))
            .filter(Boolean)
            .map(b => ({ name: b.name, img: b.img || "icons/svg/mystery-man.svg" }));
        }
      }
    }

    if (beastActions.length === 0 && favorites.length === 0) return null;

    return {
      isPolymorphed: !!polyData,
      beastName: polyData?.beastName || null,
      actions: beastActions,
      favorites,
      isDruid,
    };
  },

  /* -------------------------------------------- */
  /*  Focus Triggers                              */
  /* -------------------------------------------- */

  /**
   * Called when a druid focuses on Polymorph.
   * Opens the Beast selection dialog.
   */
  async onPolymorphFocus(actor) {
    // Don't re-open if already polymorphed or if the Beast Form tab
    // is already handling the transformation (prevents double-dialog).
    if (actor.getFlag(MODULE_ID, "polymorphData")) {
      this._log(`${actor.name} is already polymorphed — skipping dialog.`);
      return;
    }
    if (this._transformInProgress) {
      this._log(`${actor.name} transform already in progress — skipping dialog.`);
      return;
    }
    this._log(`${actor.name} focused Polymorph — skipping dialog (Beast Form tab handles it).`);
    // The Beast Form tab's _openBeastDialog handles the dialog now.
    // This hook only needs to handle Savagery toggling, which is done
    // in druid.mjs before this method is called.
  },

  /**
   * Called when a druid drops Polymorph focus.
   */
  async onPolymorphUnfocus(actor) {
    if (!actor.getFlag(MODULE_ID, "polymorphData")) return;
    await this.revertBeastForm(actor);
  },

  /* -------------------------------------------- */
  /*  Apply Beast Form                            */
  /* -------------------------------------------- */

  async applyBeastForm(actor, beastActor) {
    this._log(`Applying ${beastActor.name} form to ${actor.name}`);

    // --- Save original token state (preserve through re-transforms) ---
    const token = this._getLinkedToken(actor);
    const existingPolyData = actor.getFlag(MODULE_ID, "polymorphData");
    const originalToken = existingPolyData?.originalToken ?? (token ? {
      texture: token.document.texture.src,
      width: token.document.width,
      height: token.document.height
    } : null);

    // --- Build polymorph data from beast ---
    const beastData = {
      beastName: beastActor.name,
      beastImg: beastActor.img,
      beastId: beastActor.id,
      hd: beastActor.system.hd ?? 1,
      size: beastActor.system.size ?? "medium",
      armor: beastActor.system.armor ?? 0,
      speed: beastActor.system.speed ?? 30,
      speedValues: beastActor.system.speedValues ?? {},
      senses: beastActor.system.senses ?? "",
      immunities: beastActor.system.immunities ?? [],
      weaknesses: beastActor.system.weaknesses ?? [],
      actions: this._enrichActions(beastActor.system.actions ?? []),
      abilities: beastActor.system.abilities ?? [],
      originalToken
    };

    // --- Store polymorph data in flag ---
    await actor.setFlag(MODULE_ID, "polymorphData", beastData);

    // --- Swap placed token ---
    if (token) {
      const beastTokenImg = await this._resolveTokenImage(beastActor);
      const gridSize = SIZE_MAP[beastData.size] ?? 1;
      await token.document.update({
        "texture.src": beastTokenImg,
        width: gridSize,
        height: gridSize
      });
      this._log(`Token swapped to ${beastTokenImg} (${gridSize}x${gridSize})`);
    }

    // --- Apply stat overlay AEs ---
    await this._applyPolymorphEffects(actor, beastData);

    // --- Post chat card ---
    await this._postTransformChat(actor, beastData, true);

    // --- Re-render character sheet if open ---
    actor.sheet?.render(false);
  },

  /**
   * Apply beast form from a BeastCache entry (compendium-sourced).
   * No world actor needed — all data comes from the cache.
   * @param {Actor} actor - The druid actor
   * @param {object} cacheEntry - Beast data from BeastCache
   */
  async applyBeastFormFromCache(actor, cacheEntry) {
    this._log(`Applying ${cacheEntry.name} form to ${actor.name} (from compendium)`);

    // --- Save original token state (preserve through re-transforms) ---
    const token = this._getLinkedToken(actor);
    const existingPolyData = actor.getFlag(MODULE_ID, "polymorphData");
    const originalToken = existingPolyData?.originalToken ?? (token ? {
      texture: token.document.texture.src,
      width: token.document.width,
      height: token.document.height
    } : null);

    // --- Resolve beast image ---
    // Fetch the full document to try resolving a token image.
    // If the prototype token is just the default NPC SVG, fall back to the
    // actor portrait (which art modules like art-for-vagabond may have set).
    const fullBeast = await BeastCache.fetchFullBeast(cacheEntry.name);
    const beastImg = fullBeast?.img || cacheEntry.img || "icons/svg/mystery-man.svg";
    let beastTokenImg = beastImg; // default: use portrait
    if (fullBeast) {
      const resolved = await this._resolveTokenImage(fullBeast);
      // Only use the resolved token if it's not the generic default
      if (resolved && !resolved.includes("default-npc")) {
        beastTokenImg = resolved;
      }
    }

    // --- Build polymorph data from cache entry ---
    const beastData = {
      beastName: cacheEntry.name,
      beastImg: beastImg,
      hd: cacheEntry.hd ?? 1,
      size: cacheEntry.size ?? "medium",
      armor: cacheEntry.armor ?? 0,
      speed: cacheEntry.speed ?? 30,
      speedValues: cacheEntry.speedValues ?? {},
      senses: cacheEntry.senses ?? "",
      immunities: cacheEntry.immunities ?? [],
      weaknesses: cacheEntry.weaknesses ?? [],
      actions: this._enrichActions(cacheEntry.actions ?? []),
      abilities: cacheEntry.abilities ?? [],
      originalToken
    };

    // --- Store polymorph data in flag ---
    await actor.setFlag(MODULE_ID, "polymorphData", beastData);

    // --- Swap placed token ---
    if (token) {
      const gridSize = SIZE_MAP[beastData.size] ?? 1;
      await token.document.update({
        "texture.src": beastTokenImg,
        width: gridSize,
        height: gridSize
      });
      this._log(`Token swapped to ${beastTokenImg} (${gridSize}x${gridSize})`);
    }

    // --- Apply stat overlay AEs ---
    await this._applyPolymorphEffects(actor, beastData);

    // --- Post chat card ---
    await this._postTransformChat(actor, beastData, true);

    // --- Re-render character sheet if open ---
    actor.sheet?.render(false);
  },

  /* -------------------------------------------- */
  /*  Revert Beast Form                           */
  /* -------------------------------------------- */

  async revertBeastForm(actor) {
    const polyData = actor.getFlag(MODULE_ID, "polymorphData");
    if (!polyData) return;

    this._log(`Reverting ${actor.name} from ${polyData.beastName}`);

    // --- Restore token ---
    const token = this._getLinkedToken(actor);
    if (token && polyData.originalToken) {
      await token.document.update({
        "texture.src": polyData.originalToken.texture,
        width: polyData.originalToken.width,
        height: polyData.originalToken.height
      });
    }

    // --- Remove polymorph AEs ---
    const polyAEs = actor.effects.filter(e => e.getFlag(MODULE_ID, "polymorphAE"));
    if (polyAEs.length > 0) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", polyAEs.map(e => e.id));
    }

    // --- Post revert chat ---
    await this._postTransformChat(actor, polyData, false);

    // --- Clear flag ---
    await actor.unsetFlag(MODULE_ID, "polymorphData");

    // --- Remove focusing status if no spells remain focused ---
    const remainingFocus = actor.system.focus?.spellIds ?? [];
    if (remainingFocus.length === 0) {
      await actor.toggleStatusEffect("focusing", { active: false });
    }

    // --- Re-render character sheet ---
    actor.sheet?.render(false);
  },

  /* -------------------------------------------- */
  /*  Action Enrichment                           */
  /* -------------------------------------------- */

  /**
   * Deep-clone and enrich beast actions:
   * - Identify multi-attack headers vs individual attacks
   * - Parse condition riders from extraInfo text into causedStatuses
   */
  _enrichActions(actions) {
    return foundry.utils.deepClone(actions).map(a => {
      // Tag multi-attack headers (note contains "Multi-Attack" or "Multi Attack")
      a.isMultiAttack = /multi[- ]?attack/i.test(a.note || "");

      // If this action has no causedStatuses populated, try to parse from extraInfo
      if ((!a.causedStatuses || a.causedStatuses.length === 0) && a.extraInfo) {
        a.causedStatuses = this._parseConditionsFromText(a.extraInfo);
      }

      return a;
    });
  },

  /**
   * Parse condition keywords from action extra text.
   * Returns an array of causedStatuses entries compatible with StatusHelper.
   *
   * Per user ruling: NPCs never save. If druid's cast check hits, condition applies.
   * So all parsed conditions use saveType: "none".
   */
  _parseConditionsFromText(text) {
    if (!text) return [];
    const statuses = [];
    const lower = text.toLowerCase();

    // Restrained
    if (lower.includes("restrained")) {
      statuses.push({
        statusId: "restrained",
        requiresDamage: false,
        saveType: "none",
        duration: "",
        tickDamageEnabled: false,
        damageOnTick: "",
        damageType: "-"
      });
    }

    // Sickened (with duration normalization: days → rounds)
    if (lower.includes("sickened")) {
      // Try to extract duration like "Cd6" or "Cd4"
      const cdMatch = text.match(/\bCd(\d+)/i);
      const duration = cdMatch ? `Cd${cdMatch[1]}` : "";
      statuses.push({
        statusId: "sickened",
        requiresDamage: false,
        saveType: "none",
        duration,
        tickDamageEnabled: false,
        damageOnTick: "",
        damageType: "-"
      });
    }

    // Paralyzed
    if (lower.includes("paralyzed") && !statuses.some(s => s.statusId === "sickened")) {
      // Paralyzed is often part of Sickened ("Sickened, Paralyzed")
      // Only add standalone if Sickened wasn't already added
      statuses.push({
        statusId: "paralyzed",
        requiresDamage: false,
        saveType: "none",
        duration: "",
        tickDamageEnabled: false,
        damageOnTick: "",
        damageType: "-"
      });
    }

    // Blinded
    if (lower.includes("blinded")) {
      statuses.push({
        statusId: "blinded",
        requiresDamage: false,
        saveType: "none",
        duration: "",
        tickDamageEnabled: false,
        damageOnTick: "",
        damageType: "-"
      });
    }

    // Prone
    if (lower.includes("prone") || lower.includes("knocked prone")) {
      statuses.push({
        statusId: "prone",
        requiresDamage: false,
        saveType: "none",
        duration: "",
        tickDamageEnabled: false,
        damageOnTick: "",
        damageType: "-"
      });
    }

    // Burning
    if (lower.includes("burning")) {
      const cdMatch = text.match(/burning\s*\(?\s*Cd(\d+)/i);
      const duration = cdMatch ? `Cd${cdMatch[1]}` : "";
      statuses.push({
        statusId: "burning",
        requiresDamage: false,
        saveType: "none",
        duration,
        tickDamageEnabled: false,
        damageOnTick: "",
        damageType: "-"
      });
    }

    // Charmed
    if (lower.includes("charmed")) {
      statuses.push({
        statusId: "charmed",
        requiresDamage: false,
        saveType: "none",
        duration: "",
        tickDamageEnabled: false,
        damageOnTick: "",
        damageType: "-"
      });
    }

    // Frightened
    if (lower.includes("frightened")) {
      statuses.push({
        statusId: "frightened",
        requiresDamage: false,
        saveType: "none",
        duration: "",
        tickDamageEnabled: false,
        damageOnTick: "",
        damageType: "-"
      });
    }

    return statuses;
  },

  /* -------------------------------------------- */
  /*  Active Effects                              */
  /* -------------------------------------------- */

  async _applyPolymorphEffects(actor, beastData) {
    const changes = [];

    // Armor: Beast's armor REPLACES the druid's armor (per Polymorph spell).
    // Hero armor = equippedItemArmor + sum(armorBonus[]).
    // We calculate the offset so: equippedItemArmor + offset = beastArmor.
    // Savagery (+1 Armor while polymorphed) is handled by its own AE which
    // also pushes to armorBonus — our ADD stacks with it naturally.
    let equippedItemArmor = 0;
    for (const item of actor.items) {
      const isArmor = (item.type === "armor") ||
                      (item.type === "equipment" && item.system.equipmentType === "armor");
      if (isArmor && item.system.equipped) {
        equippedItemArmor += item.system.finalRating || 0;
      }
    }
    const armorOffset = beastData.armor - equippedItemArmor;
    changes.push({ key: "system.armorBonus", mode: 2, value: String(armorOffset) });

    // Speed: Beast's speed REPLACES the druid's speed (per Polymorph spell).
    // speed.base = derivedFromDex + sum(speed.bonus[]).
    // Derive the raw dex-based speed so we can calculate the exact offset needed.
    // Formula: 25 + floor(max(0, dex - 2) / 2) * 5
    const dex = actor.system.stats?.dexterity?.total ?? actor.system.attributes?.dexterity?.value ?? 5;
    const derivedSpeed = 25 + Math.floor(Math.max(0, dex - 2) / 2) * 5;
    const speedOffset = beastData.speed - derivedSpeed;
    // OVERRIDE mode (5) replaces the entire bonus array so no other
    // speed bonuses stack — the beast's speed is absolute.
    changes.push({ key: "system.speed.bonus", mode: 5, value: String(speedOffset) });

    // Immunities
    for (const imm of beastData.immunities) {
      changes.push({ key: "system.immunities", mode: 2, value: imm });
    }

    // Weaknesses
    for (const weak of beastData.weaknesses) {
      changes.push({ key: "system.weaknesses", mode: 2, value: weak });
    }

    if (changes.length === 0) return;

    const classUuid = actor.getFlag(MODULE_ID, "features")?._classUuid;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `Polymorph: ${beastData.beastName}`,
      icon: beastData.beastImg || "icons/magic/nature/root-vine-thorns-poison-green.webp",
      origin: classUuid || `${MODULE_ID}.polymorph`,
      changes,
      disabled: false,
      transfer: true,
      flags: {
        [MODULE_ID]: {
          managed: true,
          polymorphAE: true,
          featureFlag: "druid_polymorph"
        }
      }
    }]);

    this._log(`Applied polymorph AE with ${changes.length} changes`);
  },

  /* -------------------------------------------- */
  /*  Chat Messages                               */
  /* -------------------------------------------- */

  async _postTransformChat(actor, beastData, isTransform) {
    try {
      const { VagabondChatCard } = await import("/systems/vagabond/module/helpers/chat-card.mjs");

      if (isTransform) {
        // Build description with beast stats, actions, abilities
        const speedParts = [`${beastData.speed}'`];
        const sv = beastData.speedValues || {};
        if (sv.fly) speedParts.push(`Fly ${sv.fly}'`);
        if (sv.swim) speedParts.push(`Swim ${sv.swim}'`);
        if (sv.climb) speedParts.push(`Climb ${sv.climb}'`);
        if (sv.cling) speedParts.push(`Cling ${sv.cling}'`);

        const actionsHTML = (beastData.actions || []).map(a => {
          const dmg = a.rollDamage || a.flatDamage || "—";
          const note = a.note ? ` (${a.note})` : "";
          const extra = a.extraInfo ? `<br><small>${a.extraInfo}</small>` : "";
          return `<li><strong>${a.name}:</strong> ${dmg}${note}${extra}</li>`;
        }).join("");

        const abilitiesHTML = (beastData.abilities || []).map(a =>
          `<li><strong>${a.name}:</strong> ${a.description}</li>`
        ).join("");

        let description = `<div class="vce-polymorph-stats-grid">
          <div><strong>Armor:</strong> ${beastData.armor}</div>
          <div><strong>Speed:</strong> ${speedParts.join(", ")}</div>
          ${beastData.senses ? `<div><strong>Senses:</strong> ${beastData.senses}</div>` : ""}
          ${beastData.immunities?.length ? `<div><strong>Immune:</strong> ${beastData.immunities.join(", ")}</div>` : ""}
          ${beastData.weaknesses?.length ? `<div><strong>Weak:</strong> ${beastData.weaknesses.join(", ")}</div>` : ""}
        </div>`;
        if (actionsHTML) description += `<hr class="action-divider"><strong>Actions:</strong><ul class="vce-polymorph-list">${actionsHTML}</ul>`;
        if (abilitiesHTML) description += `<hr class="action-divider"><strong>Abilities:</strong><ul class="vce-polymorph-list">${abilitiesHTML}</ul>`;

        const tags = [
          { label: `HD ${beastData.hd}`, cssClass: "tag-standard" },
          { label: beastData.size, cssClass: "tag-standard" },
          { label: "Beast", cssClass: "tag-property" }
        ];

        await VagabondChatCard.createActionCard({
          actor,
          title: `Polymorph: ${beastData.beastName}`,
          subtitle: actor.name,
          tags,
          description
        });
      } else {
        await VagabondChatCard.createActionCard({
          actor,
          title: "Polymorph Ends",
          subtitle: actor.name,
          description: `<p>${actor.name} reverts from ${beastData.beastName}.</p>`
        });
      }
    } catch (e) {
      // Fallback if system import fails
      console.warn(`${MODULE_ID} | Polymorph chat card fallback:`, e);
      const content = isTransform
        ? `<strong>Polymorph: ${beastData.beastName}</strong> (HD ${beastData.hd} ${beastData.size})`
        : `<strong>Polymorph Ends:</strong> ${actor.name} reverts from ${beastData.beastName}.`;
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
    }
  },

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Get the linked token on the current scene for this actor.
   */
  _getLinkedToken(actor) {
    if (!canvas.scene) return null;
    return canvas.tokens?.placeables.find(t =>
      t.document.actorId === actor.id && t.document.actorLink
    ) ?? null;
  },

  /**
   * Resolve a Beast actor's token image, handling wildcard paths.
   * Wildcard paths like "modules/foo/Crocodile/*" need to be resolved
   * via getTokenImages() to pick an actual file.
   */
  async _resolveTokenImage(beastActor) {
    const src = beastActor.prototypeToken.texture.src || "";

    // If it's a wildcard path, resolve it
    if (src.includes("*") || beastActor.prototypeToken.randomImg) {
      try {
        const images = await beastActor.getTokenImages();
        if (images.length > 0) {
          return images[Math.floor(Math.random() * images.length)];
        }
      } catch (e) {
        this._log(`Wildcard token resolution failed for ${beastActor.name}:`, e);
      }
    }

    // Non-wildcard or fallback
    return src || beastActor.img;
  }
};
