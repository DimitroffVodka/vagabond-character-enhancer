/**
 * Aura Manager
 * Handles persistent spell aura templates that follow tokens and apply
 * buffs to allies within range.
 *
 * Used by Revelator's Paragon's Aura (Exalt as 10' Aura), but designed
 * to work with any spell cast as Aura delivery.
 *
 * ARCHITECTURE
 * ────────────
 * When an aura is activated:
 *   1. Creates a MeasuredTemplate (circle) centered on the caster token
 *   2. Tracks the template ID in actor flags
 *   3. Scans for ally tokens within radius, applies buff AEs
 *   4. Hooks updateToken to move template + rescan on any token movement
 *   5. When deactivated, removes template + all buff AEs
 *
 * Foundry v13 doesn't support token-attached templates, so we manually
 * update position on every token move via the updateToken hook.
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Aura Spell Definitions                      */
/* -------------------------------------------- */

/**
 * Registry of spells that can be cast as auras, with their buff definitions.
 * Each entry defines what AE changes to apply to targets within the aura.
 */
const AURA_SPELLS = {
  exalt: {
    label: "Exalt",
    icon: "icons/magic/holy/prayer-hands-glowing-yellow-light.webp",
    templateColor: "#FFD700",
    templateBorder: "#DAA520",
    description: "+1 per damage die (+2 vs Undead/Hellspawn), +1 Will Saves vs Frightened",
    fx: "jb2a.bless",
    // Per-die damage bonus is handled by calculateFinalDamage hook, not AE
    changes: [
      { key: "system.saves.will.bonus", mode: 2, value: "1" }
    ]
  },
  bless: {
    label: "Bless",
    icon: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
    templateColor: "#87CEEB",
    templateBorder: "#4682B4",
    description: "+d4 bonus to Saves (rolled per save)",
    fx: null, // jb2a.bless asset doesn't exist in standard JB2A
    // d4 save bonus is handled by BlessManager.onPreRollSave, not via AE changes
    changes: []
  }
};

/* -------------------------------------------- */
/*  Aura Manager                                */
/* -------------------------------------------- */

export const AuraManager = {

  /** Track active aura token hooks to avoid duplicate listeners */
  _hooksRegistered: false,

  /** Pending aura rescan timer (debounce rapid token movements) */
  _rescanTimer: null,

  /**
   * Register global hooks for aura tracking.
   * Called once from the main module entry point.
   */
  registerHooks() {
    if (AuraManager._hooksRegistered) return;

    // Move aura templates when tokens move
    // Move aura templates when tokens move + rescan buffs
    Hooks.on("updateToken", (tokenDoc, changes, options, userId) => {
      if (changes.x !== undefined || changes.y !== undefined) {
        const newPos = {
          tokenId: tokenDoc.id,
          x: changes.x ?? tokenDoc.x,
          y: changes.y ?? tokenDoc.y
        };
        AuraManager._handleTemplateMove(tokenDoc, changes);
        AuraManager._rescanAllAuras(newPos).catch(e =>
          console.warn(`${MODULE_ID} | AuraManager rescan error:`, e));
      }
    });

    // Rescan when tokens are created or deleted
    Hooks.on("createToken", () => AuraManager._rescanAllAuras().catch(() => {}));
    Hooks.on("deleteToken", () => AuraManager._rescanAllAuras().catch(() => {}));

    // Clean up auras on combat end
    Hooks.on("deleteCombat", () => AuraManager._cleanupAllAuras());

    // Round change: deactivate unfocused auras (spell effects expire after 1 turn without focus)
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      for (const actor of game.actors.filter(a => a.type === "character")) {
        const auraState = actor.getFlag(MODULE_ID, "activeAura");
        if (!auraState?.focusSpellId) continue;

        // Check if the caster is focusing on the aura spell
        const focusedIds = actor.system?.focus?.spellIds || [];
        if (!focusedIds.includes(auraState.focusSpellId)) {
          log("AuraManager", `${actor.name}'s aura expired — not focusing on spell`);
          await AuraManager.deactivate(actor);
        }
      }
    });

    // Clean up aura templates when scene changes
    Hooks.on("canvasReady", () => AuraManager._restoreAuras());

    // Chat button handlers
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      el.querySelectorAll("[data-action='vce-aura-activate']").forEach(btn => {
        btn.addEventListener("click", (ev) => AuraManager._onActivateClick(ev));
      });
      el.querySelectorAll("[data-action='vce-aura-deactivate']").forEach(btn => {
        btn.addEventListener("click", (ev) => AuraManager._onDeactivateClick(ev));
      });
    });

    // Auto-detect aura spell casts via createChatMessage (reliable in Foundry v13)
    Hooks.on("createChatMessage", async (message) => {
      await AuraManager._detectAuraCast(message);
    });

    // Auto-deactivate aura when focus is dropped
    Hooks.on("updateActor", async (actor, changes) => {
      if (!game.user.isGM) return;
      if (changes.system?.focus?.spellIds !== undefined) {
        await AuraManager._checkFocusDrop(actor);
      }
    });

    AuraManager._hooksRegistered = true;
    log("AuraManager", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Public API                                   */
  /* -------------------------------------------- */

  /**
   * Activate an aura around a caster token.
   * @param {Actor} actor - The caster actor
   * @param {string} spellKey - Key from AURA_SPELLS (e.g., "exalt")
   * @param {number} [radius=10] - Aura radius in feet
   */
  async activate(actor, spellKey, radius = 10) {
    if (!actor) return;
    const spellDef = AURA_SPELLS[spellKey];
    if (!spellDef) {
      ui.notifications.warn(`Unknown aura spell: ${spellKey}`);
      return;
    }

    // Check if already active
    const existing = actor.getFlag(MODULE_ID, "activeAura");
    if (existing) {
      ui.notifications.info(`${actor.name} already has an active aura. Deactivate it first.`);
      return;
    }

    // Determine the AE changes based on spell + mode (for Bless)
    let aeChanges = [...(spellDef.changes || [])];
    let aeName = `${spellDef.label} Aura`;
    const aeFlags = {
      [MODULE_ID]: {
        managed: true,
        auraSpell: spellDef.label,
        auraBuff: actor.id
      }
    };

    // Bless: apply mode-specific changes
    if (spellKey === "bless") {
      const mode = AuraManager._blessAuraMode || "allies";
      if (mode === "weapons") {
        aeName = "Bless: Silvered Aura";
        aeFlags[MODULE_ID].blessSilverAE = true;
        // Note: Silver metal change on weapons can't be done via AE changes.
        // We flag it and handle weapon silvering when the aura effect is applied.
      } else {
        aeFlags[MODULE_ID].blessAE = true;
      }
    }

    // Create an Aura Effects-compatible AE on the caster
    // The auraeffects module handles propagation to nearby tokens automatically
    const aeData = {
      name: aeName,
      icon: spellDef.icon,
      origin: `Actor.${actor.id}`,
      disabled: false,
      flags: aeFlags,
      changes: aeChanges
    };

    const [createdAE] = await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);

    // Find the caster's token on the current scene
    const token = AuraManager._getCasterToken(actor);

    // Store aura state on the actor (for focus tracking + deactivate)
    const auraData = {
      spellKey,
      aeId: createdAE?.id,
      radius,
      tokenId: token?.id
    };
    // Store Bless mode so _applyBuff can read it on subsequent rescans
    if (spellKey === "bless") {
      auraData.blessMode = AuraManager._blessAuraMode || "allies";
    }
    await actor.setFlag(MODULE_ID, "activeAura", auraData);

    if (token) {
      // Create template + apply buffs to allies in range
      const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
        t: "circle",
        x: token.center.x, y: token.center.y,
        distance: radius,
        fillColor: spellDef.templateColor,
        borderColor: spellDef.templateBorder,
        fillAlpha: 0.15,
        flags: { [MODULE_ID]: { aura: true, actorId: actor.id, tokenId: token.id, spellKey, radius } }
      }]);
      await actor.setFlag(MODULE_ID, "activeAura.templateId", template?.id);
      AuraManager._playAuraFX(token, spellDef, radius);
      await AuraManager._applyBuffsInRange(actor, token, spellKey, radius);
    }

    // Post chat notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="aura-activate">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="${spellDef.icon}" alt="${spellDef.label}">
            </div>
            <div class="header-info">
              <h3 class="header-title">${spellDef.label} Aura</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-circle"></i><span>${radius}' Radius</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-sun"></i><span>${spellDef.description}</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${actor.name} activates <strong>${spellDef.label}</strong> as a ${radius}' Aura.<br>
              <em>Allies within range receive the buff. Requires Focus.</em>
            </div>
            <div class="card-buttons" style="margin-top:0.5rem; text-align:center;">
              <button data-action="vce-aura-deactivate" data-actor-id="${actor.id}" class="card-button">
                <i class="fas fa-times"></i> End Aura
              </button>
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    log("AuraManager", `Activated ${spellDef.label} aura (${radius}') for ${actor.name}`);
  },

  /**
   * Deactivate a caster's aura.
   * @param {Actor} actor - The caster actor
   */
  async deactivate(actor) {
    if (!actor) return;
    const auraState = actor.getFlag(MODULE_ID, "activeAura");
    if (!auraState) return;

    const spellDef = AURA_SPELLS[auraState.spellKey];

    // Remove the aura AE from the caster (Aura Effects module handles propagation cleanup)
    if (auraState.aeId) {
      const ae = actor.effects.get(auraState.aeId);
      if (ae) {
        try { await ae.delete(); } catch { /* permission */ }
      }
    }

    // Legacy cleanup: stop FX, delete template, remove manual buffs
    AuraManager._stopAuraFX(actor);
    if (typeof Sequencer !== "undefined" && auraState.tokenId) {
      try {
        const tokenUuid = `Scene.${canvas.scene?.id}.Token.${auraState.tokenId}`;
        Sequencer.EffectManager.endEffects({ source: tokenUuid });
      } catch { /* ignore */ }
    }
    if (auraState.templateId) {
      const template = canvas.scene?.templates?.get(auraState.templateId);
      if (template) {
        try { await template.delete(); } catch { /* ignore */ }
      }
    }
    await AuraManager._removeAllBuffs(actor);

    // Clear the flag
    await actor.unsetFlag(MODULE_ID, "activeAura");

    // Post notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="aura-deactivate">
        <div class="card-body">
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-circle" style="opacity:0.4"></i>
              ${actor.name} ends their <strong>${spellDef?.label || "Aura"}</strong>.
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });

    log("AuraManager", `Deactivated aura for ${actor.name}`);
  },

  /**
   * Post an "Activate Aura" action card with spell options.
   * @param {Actor} actor - The caster actor
   */
  async showAuraMenu(actor) {
    if (!actor) return;

    const existing = actor.getFlag(MODULE_ID, "activeAura");
    if (existing) {
      const spellDef = AURA_SPELLS[existing.spellKey];
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="aura-menu">
          <div class="card-body">
            <section class="content-body">
              <div class="card-description" style="text-align:center;">
                <strong>${spellDef?.label || "Aura"}</strong> is active (${existing.radius}' radius).<br>
              </div>
              <div class="card-buttons" style="margin-top:0.5rem; text-align:center;">
                <button data-action="vce-aura-deactivate" data-actor-id="${actor.id}" class="card-button">
                  <i class="fas fa-times"></i> End Aura
                </button>
              </div>
            </section>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
      });
      return;
    }

    const spellButtons = Object.entries(AURA_SPELLS).map(([key, def]) => {
      return `<button data-action="vce-aura-activate" data-actor-id="${actor.id}" data-spell-key="${key}" class="card-button" style="margin:2px;">
        <img src="${def.icon}" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;" alt="">
        ${def.label}
      </button>`;
    }).join("");

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="aura-menu">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/magic/holy/prayer-hands-glowing-yellow.webp" alt="Aura">
            </div>
            <div class="header-info">
              <h3 class="header-title">Cast as Aura</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-circle"></i><span>10' Radius</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-hand-sparkles"></i><span>Focus Required</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              Select a spell to cast as a 10' Aura:
            </div>
            <div class="card-buttons" style="margin-top:0.5rem; text-align:center;">
              ${spellButtons}
            </div>
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  },

  /* -------------------------------------------- */
  /*  Token Movement Tracking                      */
  /* -------------------------------------------- */

  /**
   * Handle template position update when caster token moves.
   * Sync-safe — only updates the template, no buff scanning.
   */
  _handleTemplateMove(tokenDoc, changes) {
    if (!game.user.isGM) return;
    for (const actor of game.actors) {
      const auraState = actor.getFlag(MODULE_ID, "activeAura");
      if (!auraState || auraState.tokenId !== tokenDoc.id) continue;
      AuraManager._updateTemplatePosition(actor, tokenDoc, auraState, changes);
    }
  },

  /**
   * Update the aura template position to follow the caster token.
   * Uses changes from updateToken hook (committed values).
   */
  async _updateTemplatePosition(actor, tokenDoc, auraState, changes = {}) {
    const template = canvas.scene.templates.get(auraState.templateId);
    if (!template) return;

    const gridSize = canvas.grid.size;
    const newX = (changes.x ?? tokenDoc.x) + gridSize / 2;
    const newY = (changes.y ?? tokenDoc.y) + gridSize / 2;

    await template.update({ x: newX, y: newY });
  },

  /* -------------------------------------------- */
  /*  Buff Application                             */
  /* -------------------------------------------- */

  /**
   * Scan for ally tokens within aura radius and apply/remove buffs.
   * @param {Actor} casterActor
   * @param {Token} casterToken
   * @param {string} spellKey
   * @param {number} radius - in feet
   * @param {object} [movedToken] - Override position for a just-moved token
   *   whose document hasn't committed yet. { tokenId, x, y }
   */
  async _applyBuffsInRange(casterActor, casterToken, spellKey, radius, movedToken = null) {
    const spellDef = AURA_SPELLS[spellKey];
    if (!spellDef) return;

    const gridSize = canvas.grid.size;
    const gridDistance = canvas.grid.distance || 5;
    const pixelsPerFoot = gridSize / gridDistance;
    const radiusPx = radius * pixelsPerFoot;

    // Caster position — use override if the caster just moved
    let casterCenterX, casterCenterY;
    if (movedToken && movedToken.tokenId === casterToken.id) {
      casterCenterX = movedToken.x + gridSize / 2;
      casterCenterY = movedToken.y + gridSize / 2;
    } else {
      const casterDoc = casterToken.document ?? casterToken;
      casterCenterX = casterDoc.x + gridSize / 2;
      casterCenterY = casterDoc.y + gridSize / 2;
    }

    // Find all tokens on the scene
    const allTokens = canvas.tokens.placeables;
    const alliesInRange = new Set();

    for (const token of allTokens) {
      if (token.actor?.type !== "character") continue;

      // Use override position if this token just moved
      let tokenCenterX, tokenCenterY;
      if (movedToken && movedToken.tokenId === token.id) {
        tokenCenterX = movedToken.x + gridSize / 2;
        tokenCenterY = movedToken.y + gridSize / 2;
      } else {
        const tokenDoc = token.document;
        tokenCenterX = tokenDoc.x + gridSize / 2;
        tokenCenterY = tokenDoc.y + gridSize / 2;
      }

      const dx = tokenCenterX - casterCenterX;
      const dy = tokenCenterY - casterCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radiusPx) {
        alliesInRange.add(token.actor.id);
      }
    }

    // Apply buffs to allies in range (including caster), remove from those out of range
    // Caster is always in range of their own aura
    alliesInRange.add(casterActor.id);
    for (const token of allTokens) {
      if (!token.actor) continue;
      if (token.actor.type !== "character") continue;

      const actorId = token.actor.id;
      const hasAuraBuff = token.actor.effects.find(e =>
        e.getFlag(MODULE_ID, "auraBuff") === casterActor.id
      );

      if (alliesInRange.has(actorId) && !hasAuraBuff) {
        // Enter aura — apply buff
        await AuraManager._applyBuff(token.actor, casterActor, spellDef);
        log("AuraManager", `${token.actor.name} entered ${spellDef.label} aura from ${casterActor.name}`);
      } else if (!alliesInRange.has(actorId) && hasAuraBuff) {
        // Left aura — remove buff + restore silvered weapons if Bless Weapons
        if (hasAuraBuff.getFlag(MODULE_ID, "blessSilverAE")) {
          await AuraManager._restoreSilveredWeapons(token.actor);
        }
        try { await hasAuraBuff.delete(); } catch { /* already deleted */ }
        log("AuraManager", `${token.actor.name} left ${spellDef.label} aura from ${casterActor.name}`);
      }
    }
  },

  /**
   * Apply an aura buff AE to a target actor.
   */
  async _applyBuff(targetActor, casterActor, spellDef) {
    const flags = {
      [MODULE_ID]: {
        managed: true,
        auraBuff: casterActor.id,
        auraSpell: spellDef.label
      }
    };
    // Bless aura: apply based on chosen mode stored in caster's activeAura flag
    if (spellDef.label === "Bless") {
      const auraState = casterActor.getFlag(MODULE_ID, "activeAura");
      const mode = auraState?.blessMode || AuraManager._blessAuraMode || "allies";
      if (mode === "weapons") {
        // Silver the target's equipped weapons
        flags[MODULE_ID].blessSilverAE = true;
        try {
          const weapons = targetActor.items.filter(i => {
            const isWeapon = i.type === "weapon" || (i.type === "equipment" && i.system.equipmentType === "weapon");
            return isWeapon && i.system.equipped;
          });
          for (const weapon of weapons) {
            const origMetal = weapon.system.metal || "";
            if (origMetal !== "silver") {
              await weapon.update({
                "system.metal": "silver",
                [`flags.${MODULE_ID}.blessOrigMetal`]: origMetal
              });
            }
          }
          const aeData = {
            name: `Bless: Silvered (Aura: ${casterActor.name})`,
            icon: "icons/commodities/metal/ingot-silver.webp",
            origin: `Actor.${casterActor.id}`,
            description: "Weapons count as Silvered",
            disabled: false,
            flags,
            changes: []
          };
          await targetActor.createEmbeddedDocuments("ActiveEffect", [aeData]);
        } catch (e) {
          log("AuraManager", `Could not silver ${targetActor.name}'s weapons (permission): ${e.message}`);
        }
        return;
      }
      // Allies mode: add blessAE flag for d4 save detection
      flags[MODULE_ID].blessAE = true;
    }

    const aeData = {
      name: `${spellDef.label} (Aura: ${casterActor.name})`,
      icon: spellDef.icon,
      origin: `Actor.${casterActor.id}`,
      description: spellDef.description || "",
      disabled: false,
      flags,
      changes: spellDef.changes
    };

    await targetActor.createEmbeddedDocuments("ActiveEffect", [aeData]);
  },

  /**
   * Remove all aura buff AEs from all actors that came from this caster.
   * Checks both canvas token actors (for unlinked tokens) and game.actors.
   */
  async _removeAllBuffs(casterActor) {
    const allActors = new Set();

    // Collect actors from canvas tokens + game.actors
    if (canvas.tokens?.placeables) {
      for (const token of canvas.tokens.placeables) {
        if (token.actor) allActors.add(token.actor);
      }
    }
    for (const actor of game.actors) allActors.add(actor);

    for (const actor of allActors) {
      const auraBuffs = actor.effects.filter(e =>
        e.getFlag(MODULE_ID, "auraBuff") === casterActor.id
      );
      if (auraBuffs.length === 0) continue;

      // Restore silvered weapons before deleting the buff AEs
      if (auraBuffs.some(e => e.getFlag(MODULE_ID, "blessSilverAE"))) {
        await AuraManager._restoreSilveredWeapons(actor);
      }

      const ids = auraBuffs.map(e => e.id);
      try { await actor.deleteEmbeddedDocuments("ActiveEffect", ids); } catch { /* already deleted */ }
      log("AuraManager", `Removed ${casterActor.name}'s aura buff(s) from ${actor.name}`);
    }
  },

  /**
   * Restore silvered weapons to their original metal on an actor.
   */
  async _restoreSilveredWeapons(actor) {
    try {
      for (const weapon of actor.items) {
        const origMetal = weapon.getFlag(MODULE_ID, "blessOrigMetal");
        if (origMetal === undefined) continue;
        await weapon.update({
          "system.metal": origMetal || "",
          [`flags.${MODULE_ID}.-=blessOrigMetal`]: null
        });
        log("AuraManager", `Restored ${weapon.name} metal to "${origMetal}" on ${actor.name}`);
      }
    } catch (e) {
      log("AuraManager", `Could not restore weapons on ${actor.name}: ${e.message}`);
    }
  },

  /* -------------------------------------------- */
  /*  Cleanup & Restoration                        */
  /* -------------------------------------------- */

  /**
   * Clean up all auras (on combat end, etc.)
   */
  async _cleanupAllAuras() {
    for (const actor of game.actors) {
      const auraState = actor.getFlag(MODULE_ID, "activeAura");
      if (auraState) {
        await AuraManager.deactivate(actor);
      }
    }
    // Safety net: kill any lingering aura Sequencer effects
    if (typeof Sequencer !== "undefined") {
      try { Sequencer.EffectManager.endEffects({ name: "vce-aura" }); } catch { /* ignore */ }
    }
  },

  /**
   * Rescan all active auras (on token create/delete/move).
   * @param {object} [movedToken] - Override position for a token that just moved
   *   (document may not have committed yet). { tokenId, x, y }
   */
  async _rescanAllAuras(movedToken = null) {
    if (!game.user.isGM) return;
    for (const actor of game.actors) {
      const auraState = actor.getFlag(MODULE_ID, "activeAura");
      if (!auraState) continue;
      const token = AuraManager._getCasterToken(actor);
      if (token) {
        await AuraManager._applyBuffsInRange(actor, token, auraState.spellKey, auraState.radius, movedToken);
      }
    }
  },

  /**
   * Restore aura templates after scene change / canvas ready.
   */
  async _restoreAuras() {
    if (!game.user.isGM) return;

    for (const actor of game.actors) {
      const auraState = actor.getFlag(MODULE_ID, "activeAura");
      if (!auraState) continue;

      // Check if the template still exists on this scene
      const template = canvas.scene.templates.get(auraState.templateId);
      const token = AuraManager._getCasterToken(actor);

      if (!token) {
        // Token not on this scene — deactivate
        await actor.unsetFlag(MODULE_ID, "activeAura");
        await AuraManager._removeAllBuffs(actor);
        continue;
      }

      if (!template) {
        // Template missing — recreate it
        const spellDef = AURA_SPELLS[auraState.spellKey];
        if (!spellDef) continue;

        const [newTemplate] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
          t: "circle",
          x: token.center.x,
          y: token.center.y,
          distance: auraState.radius,
          fillColor: spellDef.templateColor,
          borderColor: spellDef.templateBorder,
          fillAlpha: 0.15,
          flags: {
            [MODULE_ID]: {
              aura: true,
              actorId: actor.id,
              tokenId: token.id,
              spellKey: auraState.spellKey,
              radius: auraState.radius
            }
          }
        }]);

        await actor.setFlag(MODULE_ID, "activeAura.templateId", newTemplate.id);
      }

      // Rescan allies
      await AuraManager._applyBuffsInRange(actor, token, auraState.spellKey, auraState.radius);
    }
  },

  /* -------------------------------------------- */
  /*  Chat Button Handlers                         */
  /* -------------------------------------------- */

  async _onActivateClick(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const actorId = btn.dataset.actorId;
    const spellKey = btn.dataset.spellKey;
    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) return;

    await AuraManager.activate(actor, spellKey);
  },

  async _onDeactivateClick(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const actorId = btn.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) return;

    await AuraManager.deactivate(actor);
  },

  /* -------------------------------------------- */
  /*  Spell Cast Auto-Detection                    */
  /* -------------------------------------------- */

  /**
   * Detect when a spell is cast with Aura delivery and auto-activate.
   * Called from renderChatMessage hook.
   *
   * The system embeds delivery type in the chat card DOM:
   *   data-delivery-type="aura" data-delivery-text="10' Aura"
   */
  /** Track processed aura cast message IDs to prevent duplicate activation */
  _processedAuraCasts: new Set(),

  async _detectAuraCast(message) {
    if (!game.user.isGM) return;

    // De-duplicate
    if (this._processedAuraCasts.has(message.id)) return;
    this._processedAuraCasts.add(message.id);

    // Check if this message has aura delivery (from message content string)
    const content = message.content ?? "";
    if (!content.includes('data-delivery-type="aura"')) return;

    // Get the caster from message flags
    const actorId = message.flags?.vagabond?.actorId;
    const spellId = message.flags?.vagabond?.itemId;
    if (!actorId || !spellId) return;

    const actor = game.actors.get(actorId);
    if (!actor) return;

    const spell = actor.items.get(spellId);
    if (!spell) return;

    // Match spell name to our aura spell registry
    const spellKey = spell.name.toLowerCase().trim();
    if (!AURA_SPELLS[spellKey]) return;

    // Don't activate if already active
    const existing = actor.getFlag(MODULE_ID, "activeAura");
    if (existing) return;

    // Parse radius from content (e.g., data-delivery-text="Aura 10' radius")
    const radiusMatch = content.match(/data-delivery-text="[^"]*?(\d+)'/);
    const radius = radiusMatch ? parseInt(radiusMatch[1]) : 10;

    // Store the spell ID so we can track focus
    log("AuraManager", `Auto-detected ${spell.name} cast as ${radius}' Aura by ${actor.name}`);

    // Activate the aura (for Bless, mode defaults to "allies" — player can change via chat card)
    await AuraManager.activate(actor, spellKey, radius);

    // Store the focused spell ID for focus tracking
    const auraState = actor.getFlag(MODULE_ID, "activeAura");
    if (auraState) {
      await actor.setFlag(MODULE_ID, "activeAura.focusSpellId", spellId);
    }
  },

  /**
   * Check if a focus drop should deactivate an active aura.
   * Called from updateActor hook when focus.spellIds changes.
   */
  async _checkFocusDrop(actor) {
    const auraState = actor.getFlag(MODULE_ID, "activeAura");
    if (!auraState) return;

    const focusSpellId = auraState.focusSpellId;
    if (!focusSpellId) return;

    // Check if the aura spell is still in the focus list
    const currentFocus = actor.system.focus?.spellIds || [];
    if (currentFocus.includes(focusSpellId)) return;

    // Focus was dropped — deactivate the aura
    log("AuraManager", `Focus dropped on aura spell — deactivating for ${actor.name}`);
    await AuraManager.deactivate(actor);
  },

  /* -------------------------------------------- */
  /*  Sequencer FX                                 */
  /* -------------------------------------------- */

  /**
   * Play a persistent Sequencer effect for the aura.
   * Attaches to the caster token so it follows movement.
   * Scales to match the aura radius (diameter in pixels).
   */
  _playAuraFX(token, spellDef, radius) {
    if (typeof Sequencer === "undefined" || !spellDef.fx) return;

    const gridSize = canvas.grid.size;
    const pxPerFt = gridSize / (canvas.grid.distance || 5);
    // Aura radius → diameter in pixels for the visual
    const diameterPx = radius * 2 * pxPerFt;
    const effectName = `vce-aura-${token.actor?.id}`;

    try {
      new Sequence()
        .effect()
        .file(spellDef.fx)
        .attachTo(token)
        .size(diameterPx)
        .persist()
        .fadeIn(800)
        .fadeOut(800)
        .opacity(0.7)
        .belowTokens()
        .name(effectName)
        .play();

      log("AuraManager", `Playing FX: ${spellDef.fx} (${diameterPx}px diameter, ${radius}' radius)`);
    } catch (e) {
      console.warn(`${MODULE_ID} | AuraManager FX error:`, e);
    }
  },

  /**
   * Stop the Sequencer effect for an actor's aura.
   */
  _stopAuraFX(actor) {
    if (typeof Sequencer === "undefined") return;
    const effectName = `vce-aura-${actor.id}`;
    try {
      Sequencer.EffectManager.endEffects({ name: effectName });
    } catch (e) {
      console.warn(`${MODULE_ID} | AuraManager FX stop error:`, e);
    }
  },

  /* -------------------------------------------- */
  /*  Helpers                                      */
  /* -------------------------------------------- */

  /**
   * Get the active token for an actor on the current scene.
   */
  _getCasterToken(actor) {
    return canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id) || null;
  }
};
