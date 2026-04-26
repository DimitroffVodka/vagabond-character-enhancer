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
    icon: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
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
  },
  ward: {
    label: "Ward",
    icon: "icons/magic/defensive/shield-barrier-blue.webp",
    templateColor: "#4a90d9",
    templateBorder: "#2e5c8a",
    description: "Reduce damage by d6 on Cast Check pass (crit = negate all)",
    fx: null,
    // Ward's reactive damage reduction is handled by WardManager, not via AE changes
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

    // Token movement: (a) auto-follow templates on caster movement,
    // (b) re-scan buff auras (Revelator path), (c) re-tick generic damage/
    // effect auras so a hostile walking INTO the radius gets hit on entry
    // (not just at start of next round). The tick honors `tickedThisRound`
    // to prevent zig-zag re-hits.
    //
    // CRITICAL: For animated movement (the default for player drags),
    // `tokenDoc.x`/`tokenDoc.y` still report the OLD position when this
    // hook fires — only `changes.x`/`changes.y` carry the new values.
    // We synthesize a `newPos` from `changes` and pass it through to
    // `_tickGenericAurasOnMove` so the containment check uses the
    // post-move coordinates. Without this, the tick reads the old
    // position, which inverts the entry/exit detection (hostiles get
    // hit on the way out instead of on the way in).
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
        AuraManager._tickGenericAurasOnMove(tokenDoc, newPos).catch(e =>
          console.warn(`${MODULE_ID} | AuraManager generic tick on move error:`, e));
      }
    });

    // Rescan when tokens are created or deleted
    Hooks.on("createToken", () => AuraManager._rescanAllAuras().catch(() => {}));
    Hooks.on("deleteToken", () => AuraManager._rescanAllAuras().catch(() => {}));

    // Clean up auras on combat end
    Hooks.on("deleteCombat", () => AuraManager._cleanupAllAuras());

    // Round change: (1) deactivate auras whose source focus has dropped,
    // (2) tick damageTick / effectTick generic auras against hostiles in
    // range. Combined into one hook so the focus check happens BEFORE the
    // tick — no point firing damage on an aura that's about to deactivate.
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      for (const actor of game.actors.filter(a => a.type === "character")) {
        const auraState = actor.getFlag(MODULE_ID, "activeAura");
        if (!auraState) continue;

        // (1a) Spell-focus check (Revelator buffs + spell-cast auras)
        if (auraState.focusSpellId) {
          const focusedIds = actor.system?.focus?.spellIds || [];
          if (!focusedIds.includes(auraState.focusSpellId)) {
            log("AuraManager", `${actor.name}'s aura expired — spell focus dropped`);
            await AuraManager.deactivate(actor);
            continue;
          }
        }

        // (1b) Talent-focus check — Psychic talents track focus in their
        // own flag pool, not system.focus.spellIds.
        if (auraState.focusTalentId) {
          const focusedTalentIds = actor.getFlag(MODULE_ID, "psychicTalents")?.focusedIds ?? [];
          if (!focusedTalentIds.includes(auraState.focusTalentId)) {
            log("AuraManager", `${actor.name}'s aura expired — talent focus dropped`);
            await AuraManager.deactivate(actor);
            continue;
          }
        }

        // (2) Per-round tick for damage/effect generic auras. Reset the
        // per-round "already hit" set BEFORE the tick so every hostile
        // in range gets hit fresh on the new round (and the set
        // re-populates with whoever's still in range).
        if (auraState.generic
            && (auraState.behavior === "damageTick" || auraState.behavior === "effectTick")) {
          await actor.setFlag(MODULE_ID, "activeAura", { ...auraState, tickedThisRound: [] });
          const refreshed = actor.getFlag(MODULE_ID, "activeAura");
          await AuraManager._tickAura(actor, refreshed);
        }

        // (3) Instant generic auras expire on the next round tick — they
        // resolve at activation, persist visually through the round they
        // were cast in, then deactivate when the round changes. Gives the
        // player a beat to see who was hit before the template clears.
        if (auraState.generic && auraState.behavior === "instant") {
          log("AuraManager", `Instant aura on ${actor.name} expiring (round ${changes.round})`);
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

    // Auto-deactivate aura when focus is dropped — covers both spell focus
    // (Revelator + spell-cast generic auras) and Psychic talent focus
    // (talent-cast generic auras with focusTalentId).
    Hooks.on("updateActor", async (actor, changes) => {
      if (!game.user.isGM) return;
      if (changes.system?.focus?.spellIds !== undefined) {
        await AuraManager._checkFocusDrop(actor);
      }
      if (changes.flags?.[MODULE_ID]?.psychicTalents !== undefined) {
        await AuraManager._checkTalentFocusDrop(actor);
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
   *
   * Containment is delegated to `_tokensInsideTemplate` so buff auras
   * (Exalt / Bless / Ward) honor the same "any occupied grid square has
   * its center inside the radius" rule as generic damage/effect auras.
   * Without this, large character tokens (rare for PCs but possible —
   * Druid beast forms, polymorphed states, future races) would be
   * mis-detected because the old path assumed 1x1 footprints.
   *
   * @param {Actor}      casterActor
   * @param {Token}      casterToken
   * @param {string}     spellKey
   * @param {number}     radius - in feet
   * @param {object}     [movedToken] - { tokenId, x, y } override for a
   *   token whose document hasn't yet committed its post-move position.
   */
  async _applyBuffsInRange(casterActor, casterToken, spellKey, radius, movedToken = null) {
    const spellDef = AURA_SPELLS[spellKey];
    if (!spellDef) return;

    // The active aura's template is the source of truth for the radius
    // and current center. If we have it, route containment through
    // `_tokensInsideTemplate`. If for some reason it's missing
    // (legacy state, mid-deactivation), fall back to a synthetic
    // template object so the per-cell rule still applies.
    const auraState = casterActor.getFlag(MODULE_ID, "activeAura");
    const template = auraState?.templateId
      ? canvas.scene?.templates?.get(auraState.templateId)
      : null;

    let templateForCheck;
    let templateCenterOverride = null;
    if (template) {
      templateForCheck = template;
      // If the caster just moved and the auto-follow template.update hasn't
      // committed, derive the post-move template center from the caster's
      // new coords (same fix as the generic-aura path).
      if (movedToken && movedToken.tokenId === casterToken.id) {
        const grid = canvas.grid.size;
        const ctd = casterToken.document ?? casterToken;
        templateCenterOverride = {
          x: movedToken.x + (ctd.width  ?? 1) * grid / 2,
          y: movedToken.y + (ctd.height ?? 1) * grid / 2,
        };
      }
    } else {
      // Fallback: synthesize a template at the caster's current center.
      const grid = canvas.grid.size;
      const ctd = casterToken.document ?? casterToken;
      const baseX = (movedToken && movedToken.tokenId === casterToken.id) ? movedToken.x : ctd.x;
      const baseY = (movedToken && movedToken.tokenId === casterToken.id) ? movedToken.y : ctd.y;
      templateForCheck = {
        x: baseX + (ctd.width  ?? 1) * grid / 2,
        y: baseY + (ctd.height ?? 1) * grid / 2,
        distance: radius,
      };
    }

    const inRangeTokens = AuraManager._tokensInsideTemplate(
      templateForCheck, movedToken, templateCenterOverride
    );
    const alliesInRange = new Set(
      inRangeTokens.filter(t => t.actor?.type === "character").map(t => t.actor.id)
    );
    // Caster is always in range of their own aura, even if their token
    // somehow tests outside the radius (shouldn't happen, but defensive).
    alliesInRange.add(casterActor.id);

    // Apply buffs to allies in range, remove from those out of range
    for (const token of canvas.tokens.placeables) {
      if (!token.actor) continue;
      if (token.actor.type !== "character") continue;

      const actorId = token.actor.id;
      const hasAuraBuff = token.actor.effects.find(e =>
        e.getFlag(MODULE_ID, "auraBuff") === casterActor.id
      );

      if (alliesInRange.has(actorId) && !hasAuraBuff) {
        await AuraManager._applyBuff(token.actor, casterActor, spellDef);
        log("AuraManager", `${token.actor.name} entered ${spellDef.label} aura from ${casterActor.name}`);
      } else if (!alliesInRange.has(actorId) && hasAuraBuff) {
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

    // Ward aura: add wardAE + wardCasterId flags for reactive damage reduction
    if (spellDef.label === "Ward") {
      flags[MODULE_ID].wardAE = true;
      flags[MODULE_ID].wardCasterId = casterActor.id;
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
   * Skips auras whose caster is still focusing on the source spell —
   * focused spells persist past combat per Vagabond rules.
   */
  async _cleanupAllAuras() {
    for (const actor of game.actors) {
      const auraState = actor.getFlag(MODULE_ID, "activeAura");
      if (!auraState) continue;

      // Skip auras whose source focus is still held — focused spells/talents
      // persist past combat per Vagabond rules.
      if (auraState.focusSpellId) {
        const focusedIds = actor.system?.focus?.spellIds || [];
        if (focusedIds.includes(auraState.focusSpellId)) continue;
      }
      if (auraState.focusTalentId) {
        const focusedTalentIds = actor.getFlag(MODULE_ID, "psychicTalents")?.focusedIds ?? [];
        if (focusedTalentIds.includes(auraState.focusTalentId)) continue;
      }

      await AuraManager.deactivate(actor);
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

    // Don't activate if already active
    const existing = actor.getFlag(MODULE_ID, "activeAura");
    if (existing) return;

    // Parse radius from content (e.g., data-delivery-text="Aura 10' radius")
    const radiusMatch = content.match(/data-delivery-text="[^"]*?(\d+)'/);
    const radius = radiusMatch ? parseInt(radiusMatch[1]) : 10;

    // Buff aura branch — Revelator's Exalt / Bless / Ward use the
    // hand-rolled `_applyBuffsInRange` path (token-move buff propagation,
    // status-aware AE construction). Stays on the existing `activate`
    // entry point, gets per-grid-square containment via the recently-
    // refactored `_applyBuffsInRange`.
    const spellKey = spell.name.toLowerCase().trim();
    if (AURA_SPELLS[spellKey]) {
      log("AuraManager", `Auto-detected ${spell.name} cast as ${radius}' Aura (buff) by ${actor.name}`);
      await AuraManager.activate(actor, spellKey, radius);
      const auraState = actor.getFlag(MODULE_ID, "activeAura");
      if (auraState) await actor.setFlag(MODULE_ID, "activeAura.focusSpellId", spellId);
      return;
    }

    // Generic spell aura branch — any spell with damage or effect cast as
    // Aura goes through the same per-round-tick + per-grid-square
    // containment pipeline as Talent auras. Skip if the spell has neither
    // damage nor effect to apply (a no-op aura).
    const hasDamage = spell.system?.damageType && spell.system.damageType !== "-";
    const hasEffect = (spell.system?.causedStatuses?.length ?? 0) > 0
                   || (spell.system?.critCausedStatuses?.length ?? 0) > 0;
    if (!hasDamage && !hasEffect) return;

    // Capture the cast-time state (damageDice, deliveryType, etc.) from
    // the system's localStorage so per-round ticks can re-roll with the
    // same configuration the player chose. Falls back to base spell
    // values if the state isn't cached (e.g., GM-driven cast, or if the
    // SpellHandler hasn't run yet).
    let castDamageDice = 1;
    try {
      const sheetStates = JSON.parse(localStorage.getItem(`vagabond.spell-states.${actor.id}`) ?? "{}");
      if (sheetStates[spell.id]?.damageDice >= 1) {
        castDamageDice = sheetStates[spell.id].damageDice;
      }
    } catch { /* fall back to default */ }

    // Read the system's first-cast targets so we can pre-seed
    // `tickedThisRound` — they already took the initial damage, no need
    // to double-tick them on round 1 if a token-move tick fires.
    const firstCastTargets = (message.flags?.vagabond?.targetsAtRollTime ?? [])
      .map(t => t.actorId)
      .filter(Boolean);

    // Behavior: focus-duration → tick each round; instant → one-shot
    // already resolved by the system, just place the template for the
    // round so the visual stays put.
    const focused = (actor.system?.focus?.spellIds ?? []).includes(spellId);
    let behavior;
    if (focused) {
      behavior = hasDamage ? "damageTick" : "effectTick";
    } else {
      behavior = "instant";
    }

    log("AuraManager", `Auto-detected ${spell.name} cast as ${radius}' Aura (generic, ${behavior}) by ${actor.name}`);

    const result = await AuraManager.activateGeneric(actor, {
      sourceItemId:    spell.id,
      sourceItemType:  "spell",
      itemName:        spell.name,
      itemImg:         spell.img,
      behavior,
      castConfig: {
        damageDice:    castDamageDice,
        includeDamage: hasDamage,
        includeEffect: hasEffect,
        delivery:      "aura",
        isFocused:     focused,
      },
      focusSpellId:    focused ? spellId : null,
      radius,
      // Seed `tickedThisRound` with whoever the system's first cast
      // already damaged. The activation-time first tick honors this set
      // so we don't re-hit those targets immediately. The next round
      // transition clears it and they're fair game again.
      initialTickedActorIds: firstCastTargets,
      // (Note: the system places its own template for the cast and we
      // place ours for the persistent aura. Both visible for round 1,
      // then the system's expires while ours sticks. Polish pass can
      // suppress the system one later.)
    });

    if (!result.success) {
      log("AuraManager", `Generic aura activate refused for ${spell.name}: ${result.error}`);
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

  /**
   * Talent-focus parallel of `_checkFocusDrop`. Triggers when the caster's
   * `psychicTalents.focusedIds` flag changes — if the talent driving an
   * active generic aura is no longer focused, tear the aura down. Lets a
   * Psychic end a Pyrokinesis-as-aura by clicking Drop Focus on the Talents
   * tab card, same UX as ending a buff Talent.
   */
  async _checkTalentFocusDrop(actor) {
    const auraState = actor.getFlag(MODULE_ID, "activeAura");
    if (!auraState?.focusTalentId) return;

    const focusedTalentIds = actor.getFlag(MODULE_ID, "psychicTalents")?.focusedIds ?? [];
    if (focusedTalentIds.includes(auraState.focusTalentId)) return;

    log("AuraManager", `Talent focus dropped — deactivating aura for ${actor.name}`);
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
  },

  /* -------------------------------------------- */
  /*  Generic Aura (talents / arbitrary spells)    */
  /* -------------------------------------------- */
  //
  // The Revelator path above is built around AURA_SPELLS — a hardcoded
  // registry of three buff spells. Talents (and any future spell) need a
  // looser model: each cast carries its own behavior + cast config, and
  // the per-round tick re-resolves against whoever is currently in the
  // template.
  //
  // Three behaviors live here:
  //   - "damageTick"  → re-roll damage at start of each round, cast check
  //                     vs every hostile currently in the template, save
  //                     reduces normally
  //   - "effectTick"  → like damageTick but the talent's status is what's
  //                     applied (with save). Damage may also fire if the
  //                     talent has both.
  //   - "instant"     → place template, fire once, no tick. Mostly visual.
  //
  // Buff Talents (Shield/Evade/Absence/Transvection) cast as Aura should
  // continue to use the existing AURA_SPELLS-based buff path — they apply
  // AEs to allies in range and rescan on token movement, which is exactly
  // what the Revelator buffs do. The talent-cast wrapper handles routing.

  /**
   * Activate a generic talent/spell aura. Distinct entry point from
   * `activate(actor, spellKey)` so the existing Revelator path is unchanged.
   *
   * @param {Actor}  actor — the caster
   * @param {object} spec  — aura specification:
   *   {
   *     sourceItemId:    string,     // talent.id (or spell.id) on the caster
   *     itemName:        string,     // for chat card / template
   *     itemImg:         string,
   *     behavior:        "damageTick" | "effectTick" | "instant",
   *     castConfig:      object,     // result from TalentCastDialog (passed to executeCast)
   *     focusTalentId?:  string,     // if focus-duration talent: caster's talent id (for focus-drop detection)
   *     focusSpellId?:   string,     // if focus-duration spell: caster's spell id (same)
   *     radius?:         number,     // feet, defaults to 10
   *     templateColor?:  string,
   *     templateBorder?: string,
   *   }
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async activateGeneric(actor, spec) {
    if (!actor || !spec) return { success: false, error: "missing actor or spec" };

    // Refuse if caster already has an aura active (Revelator or generic).
    const existing = actor.getFlag(MODULE_ID, "activeAura");
    if (existing) {
      ui.notifications.info(`${actor.name} already has an active aura. Deactivate it first.`);
      return { success: false, error: "aura-active" };
    }

    const token = AuraManager._getCasterToken(actor);
    if (!token) {
      ui.notifications.warn(`${actor.name} has no token on the current scene — can't place aura.`);
      return { success: false, error: "no-token" };
    }

    const radius = spec.radius ?? 10;
    const fillColor   = spec.templateColor  ?? "#9b6bff"; // psychic-purple default
    const borderColor = spec.templateBorder ?? "#5e3a8e";

    // Place the measured-template circle.
    const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
      t: "circle",
      x: token.center.x,
      y: token.center.y,
      distance: radius,
      fillColor, borderColor,
      fillAlpha: 0.15,
      flags: { [MODULE_ID]: {
        aura: true,
        actorId: actor.id,
        tokenId: token.id,
        radius,
        generic: true,
        sourceItemId: spec.sourceItemId,
      } }
    }]);

    // Stash the activeAura state. The behavior + castConfig fields are
    // read by `_tickAura` on each round; focusTalentId/focusSpellId by
    // the focus-drop detection.
    const auraData = {
      generic:        true,
      behavior:       spec.behavior,
      sourceItemId:   spec.sourceItemId,
      // "talent" | "spell" — drives the per-tick dispatcher in `_tickAura`.
      // Defaults to "talent" for back-compat with callers that pre-date
      // the spell-aura support (Control / talent path).
      sourceItemType: spec.sourceItemType ?? "talent",
      itemName:       spec.itemName,
      itemImg:        spec.itemImg,
      castConfig:     spec.castConfig,
      focusTalentId:  spec.focusTalentId ?? null,
      focusSpellId:   spec.focusSpellId  ?? null,
      radius,
      tokenId:        token.id,
      templateId:     template.id,
      // Pre-populated tick set — used when the system already resolved
      // the first cast against some targets (e.g. spell-aura detection
      // catches the system's cast post-hoc). Without this seed, the
      // activation-time first tick would re-hit those targets.
      tickedThisRound: spec.initialTickedActorIds ?? [],
    };
    await actor.setFlag(MODULE_ID, "activeAura", auraData);

    // Post chat notification with end-aura button.
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="aura-activate">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="${spec.itemImg ?? "icons/svg/aura.svg"}" alt="${spec.itemName ?? "Aura"}">
            </div>
            <div class="header-info">
              <h3 class="header-title">${spec.itemName ?? "Aura"}</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-circle"></i><span>${radius}' Radius</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-sun"></i><span>${_describeBehavior(spec.behavior)}</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${actor.name} casts <strong>${spec.itemName ?? "Aura"}</strong> as a ${radius}' Aura.<br>
              <em>${_describeAuraBody(spec.behavior)}</em>
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

    // First tick fires immediately — players expect a round-1 effect on
    // anyone caught in the template at activation, rather than waiting
    // for round 2.
    if (spec.behavior === "damageTick" || spec.behavior === "effectTick") {
      await AuraManager._tickAura(actor, auraData);
    }

    // Instant aura — one-shot resolution against everyone currently in
    // range. Template stays up for the rest of the current combat round
    // so players can see what was hit; deactivation happens on the next
    // round-change tick (see updateCombat hook). Outside combat the
    // template persists until the player clicks End Aura.
    if (spec.behavior === "instant") {
      await AuraManager._tickAura(actor, auraData);
    }

    log("AuraManager", `Activated generic aura "${spec.itemName}" (${spec.behavior}, ${radius}') for ${actor.name}`);
    return { success: true };
  },

  /**
   * Per-round tick for damageTick / effectTick auras. Walks every token
   * currently inside the template, filters to hostiles, and reuses
   * `TalentCast.executeCast` against each one with `explicitTargets` so
   * the existing cast-check + damage roll + chat-card-with-save flow
   * fires exactly the same way as a standalone cast. `skipFocus:true`
   * keeps the per-tick reuse from re-acquiring the caster's focus slot.
   *
   * @param {Actor}  actor      — the caster sustaining the aura
   * @param {object} auraState  — the activeAura flag value
   */
  async _tickAura(actor, auraState, movedTokenOverride = null) {
    if (!actor || !auraState?.generic) return;
    // damageTick / effectTick / instant all run the same per-target cast
    // resolution; the caller decides whether to repeat (per-round) or
    // auto-deactivate (instant). Buff behavior doesn't reach this path.
    if (auraState.behavior === "buff") return;

    const template = canvas.scene?.templates?.get(auraState.templateId);
    if (!template) return;

    const sourceItem = actor.items.get(auraState.sourceItemId);
    if (!sourceItem) {
      log("AuraManager", `Tick: source item ${auraState.sourceItemId} no longer on caster ${actor.name} — deactivating aura`);
      await AuraManager.deactivate(actor);
      return;
    }

    // Compute the template center. When the caster is the just-moved
    // token, the template doc's position may not have committed yet
    // (`_handleTemplateMove` runs an async update in parallel with this
    // tick). Fall back to deriving the center from the caster's known
    // post-move coords so we don't measure distances against the OLD
    // template position — that race produced the "fires on leave instead
    // of enter" inversion when the caster (not the hostile) moved.
    let templateCx = template.x;
    let templateCy = template.y;
    if (movedTokenOverride && movedTokenOverride.tokenId === auraState.tokenId) {
      const casterTokDoc = canvas.scene?.tokens?.get(auraState.tokenId);
      const grid = canvas.grid.size;
      if (casterTokDoc) {
        templateCx = movedTokenOverride.x + (casterTokDoc.width  * grid) / 2;
        templateCy = movedTokenOverride.y + (casterTokDoc.height * grid) / 2;
      }
    }

    // Find tokens whose center is inside the circular template, then
    // filter to hostiles (cast check required per the user's rule call).
    // Skip the caster themselves so a Pyrokinesis aura doesn't roast you.
    const inRange = AuraManager._tokensInsideTemplate(template, movedTokenOverride, { x: templateCx, y: templateCy });
    const hostiles = inRange.filter(tok =>
      tok.actor
      && tok.actor.id !== actor.id
      && tok.document?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE
    );
    if (hostiles.length === 0) return;

    // `tickedThisRound` is the set of actor IDs already hit by this aura
    // on the current round. Cleared on round change (see updateCombat
    // hook); checked on token-movement ticks so a hostile can't be
    // re-hit by walking out and back in. Round-change tick passes a
    // fresh empty list so all hostiles in range get hit again.
    const tickedSet = new Set(auraState.tickedThisRound ?? []);
    const toHit = hostiles.filter(tok => !tickedSet.has(tok.actor.id));
    if (toHit.length === 0) return;

    // Dispatch per-target cast resolution based on what the source is.
    // Talents use the duck-typed talent → TalentCast.executeCast path
    // (with `explicitTargets` + `skipFocus` to reuse the full cast
    // pipeline without re-applying focus). Spells use the system's own
    // pipeline (rollSpellDamage + VagabondChatCard.spellCast) directly.
    const isSpellSource = auraState.sourceItemType === "spell";

    let TalentCast = null;
    if (!isSpellSource) {
      // Lazy-load to avoid the talent-cast → aura-manager import loop.
      ({ TalentCast } = await import("../talent/talent-cast.mjs"));
    }

    for (const tok of toHit) {
      try {
        if (isSpellSource) {
          await AuraManager._fireSpellTickAtTarget(actor, sourceItem, auraState.castConfig, tok);
        } else {
          await TalentCast.executeCast(
            actor,
            sourceItem,
            auraState.castConfig,
            { explicitTargets: [tok], skipFocus: true }
          );
        }
        tickedSet.add(tok.actor.id);
      } catch (err) {
        console.warn(`${MODULE_ID} | Aura tick on ${tok.name} failed:`, err);
      }
    }

    // Persist the updated set so movement-driven ticks honor it.
    await actor.setFlag(MODULE_ID, "activeAura", {
      ...auraState,
      tickedThisRound: [...tickedSet],
    });
  },

  /**
   * Re-tick every active generic aura after a token moved. Lets a hostile
   * walking into the radius (or the caster moving the radius onto a new
   * hostile) take damage immediately, instead of waiting for the next
   * round transition. `_tickAura` honors `tickedThisRound`, so anyone
   * already hit this round is skipped.
   *
   * `movedTokenOverride` carries the post-move coordinates for the token
   * that just moved — when `updateToken` fires for animated movement,
   * the document still reports the OLD position, so we have to override
   * the moved token's coords explicitly during the containment check.
   *
   * @param {TokenDocument} _movedTokenDoc      — kept for symmetry with the move hook
   * @param {{tokenId,x,y}} [movedTokenOverride]  — post-move coords for the moved token
   */
  async _tickGenericAurasOnMove(_movedTokenDoc, movedTokenOverride = null) {
    if (!game.user.isGM) return;
    for (const actor of game.actors) {
      const auraState = actor.getFlag(MODULE_ID, "activeAura");
      if (!auraState?.generic) continue;
      if (auraState.behavior !== "damageTick" && auraState.behavior !== "effectTick") continue;
      await AuraManager._tickAura(actor, auraState, movedTokenOverride);
    }
  },

  /**
   * Per-target cast resolution for a spell-source aura tick. Mirrors
   * the per-target half of `TalentCast.executeCast` but uses the actor's
   * actual Mana Skill (Arcana / Mysticism / Influence / Leadership —
   * whichever the class assigned) instead of the talent-hardcoded
   * Mysticism, and operates on the spell item directly without
   * duck-typing.
   *
   * Each invocation fires one cast roll against one target token,
   * rolls damage if the spell + config support it, and renders a
   * VagabondChatCard.spellCast card single-targeting that token. The
   * card's Apply Direct / Save buttons handle damage application
   * downstream — same UX as the system's normal cast.
   *
   * @param {Actor}  actor       — caster
   * @param {Item}   spell       — system spell item
   * @param {object} castConfig  — { damageDice, includeDamage, includeEffect, delivery, isFocused }
   * @param {Token}  targetToken
   */
  async _fireSpellTickAtTarget(actor, spell, castConfig, targetToken) {
    const { damageDice = 1, includeDamage = true, includeEffect = false, delivery = "aura" } = castConfig ?? {};

    // Resolve the actor's Mana Skill — which stat + skill key drives
    // this caster's spells. Fallback to Arcana/Reason if unset.
    const manaSkillKey = actor.system?.classData?.manaSkill;
    const manaSkill    = manaSkillKey ? actor.system?.skills?.[manaSkillKey] : null;
    const manaStat     = manaSkill?.stat || "reason";
    const trained      = manaSkill?.trained ?? false;
    const statValue    = actor.system?.stats?.[manaStat]?.value ?? 2;
    const difficulty   = 20 - (trained ? statValue * 2 : statValue);

    // Cast check — d20 + favor/hinder + universal bonuses, same builder
    // the system uses for its own spell casts.
    const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
    const fh = actor.system.favorHinder || "none";
    const eff = VagabondRollBuilder.calculateEffectiveFavorHinder(fh, false, false);
    const castRoll = await VagabondRollBuilder.buildAndEvaluateD20(actor, eff);
    const d20Term  = castRoll.terms.find(t => t.constructor.name === "Die" && t.faces === 20);
    const nat      = d20Term?.results?.[0]?.result ?? castRoll.total;
    const isCritical = nat === 20;
    const isSuccess  = isCritical || castRoll.total >= difficulty;

    // Build a single-target descriptor matching the system's
    // _resolveStoredTargets shape (see damage-helper.mjs:150-156).
    const targetsAtRollTime = [{
      tokenId:   targetToken.id,
      sceneId:   targetToken.scene?.id ?? targetToken.document?.parent?.id ?? canvas.scene?.id,
      actorId:   targetToken.actor?.id,
      actorName: targetToken.name ?? targetToken.document?.name ?? targetToken.actor?.name,
      actorImg:  targetToken.document?.texture?.src ?? targetToken.actor?.img,
    }];

    // Damage roll — only if cast succeeded, the spell has damage, and
    // damageDice > 0. Mirrors the gating in SpellHandler.castSpell.
    let damageRoll = null;
    const hasDamage = includeDamage
                   && spell.system?.damageType
                   && spell.system.damageType !== "-"
                   && damageDice > 0;
    if (hasDamage && isSuccess) {
      try {
        const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");
        damageRoll = await VagabondDamageHelper.rollSpellDamage(
          actor, spell,
          { damageDice, deliveryType: delivery },
          isCritical, manaStat, targetsAtRollTime
        );
      } catch (err) {
        console.warn(`${MODULE_ID} | Aura tick (spell ${spell.name}): damage roll failed`, err);
      }
    }

    // Render the chat card. spellCastResult fields match what
    // SpellHandler.castSpell builds — costs default to 0 since aura
    // ticks are part of the focused spell's sustained cost (which
    // Foundry doesn't auto-track for Vagabond either way).
    const spellCastResult = {
      roll:         castRoll,
      difficulty,
      isSuccess,
      isCritical,
      manaSkill:    manaSkill ?? { label: "Mana", stat: manaStat },
      manaSkillKey: manaSkillKey ?? null,
      costs: {
        totalCost: 0, damageCost: 0, fxCost: 0,
        deliveryBaseCost: 0, deliveryIncreaseCost: 0,
      },
      deliveryText: "Aura (Tick)",
      spellState: {
        damageDice:   hasDamage ? damageDice : 0,
        deliveryType: delivery,
      },
    };

    const { VagabondChatCard } = await import("/systems/vagabond/module/helpers/chat-card.mjs");
    await VagabondChatCard.spellCast(actor, spell, spellCastResult, damageRoll, targetsAtRollTime);
  },

  /**
   * Find tokens whose **occupied grid squares** intersect the aura — a
   * token counts as inside if **any of the grid squares it occupies has
   * its center within the radius**. This matches Foundry's own
   * circle-template square highlighting (the purple-tinted squares),
   * which is the visual the player reads as "the aura."
   *
   * For 1x1 tokens, this collapses to the classic center-inside-radius
   * test. For large creatures (2x2, 4x4) it correctly counts a token
   * that has even one foot inside the highlighted area but not one
   * that just clips a corner of the geometric circle outline (which
   * the bounding-box overlap was wrongly treating as inside).
   *
   * `movedTokenOverride` supplies post-move coords for a token whose
   * document still reports the OLD position (animated movement —
   * `updateToken` fires before the doc commits new x/y).
   * `templateCenterOverride` supplies the template's post-move center
   * for the case where the caster just moved and the auto-follow
   * `template.update({x,y})` hasn't committed yet.
   *
   * @param {MeasuredTemplate} template
   * @param {{tokenId,x,y}}    [movedTokenOverride]
   * @param {{x,y}}            [templateCenterOverride]
   */
  _tokensInsideTemplate(template, movedTokenOverride = null, templateCenterOverride = null) {
    if (!canvas.tokens?.placeables?.length) return [];
    const cx = templateCenterOverride?.x ?? template.x;
    const cy = templateCenterOverride?.y ?? template.y;
    const gridSize = canvas.grid.size;
    const gridDistance = canvas.grid.distance || 5;
    const pixelsPerFoot = gridSize / gridDistance;
    const radiusPx = (template.distance ?? 0) * pixelsPerFoot;

    const inside = [];
    for (const tok of canvas.tokens.placeables) {
      const doc = tok.document;
      if (!doc) continue;
      // Use the override coordinates for the token that just moved —
      // doc.x / doc.y may still be stale during the updateToken hook.
      let baseX, baseY;
      if (movedTokenOverride && movedTokenOverride.tokenId === doc.id) {
        baseX = movedTokenOverride.x;
        baseY = movedTokenOverride.y;
      } else {
        baseX = doc.x;
        baseY = doc.y;
      }
      const wCells = doc.width  ?? 1;   // footprint in grid squares
      const hCells = doc.height ?? 1;
      // Walk every grid square the token occupies; if any one's center
      // is inside the radius, the token is inside.
      let any = false;
      for (let cellX = 0; cellX < wCells && !any; cellX++) {
        for (let cellY = 0; cellY < hCells && !any; cellY++) {
          const sqCx = baseX + cellX * gridSize + gridSize / 2;
          const sqCy = baseY + cellY * gridSize + gridSize / 2;
          const dx = sqCx - cx;
          const dy = sqCy - cy;
          if (Math.sqrt(dx * dx + dy * dy) <= radiusPx) any = true;
        }
      }
      if (any) inside.push(tok);
    }
    return inside;
  },
};

/**
 * Header tag (under the title) shown on the aura activation card.
 * @param {string} behavior
 */
function _describeBehavior(behavior) {
  switch (behavior) {
    case "damageTick": return "Re-rolls each round";
    case "effectTick": return "Re-applies each round";
    case "instant":    return "Resolves once";
    default:           return "Persistent";
  }
}

/**
 * Body-text flavor on the aura activation card.
 * @param {string} behavior
 */
function _describeAuraBody(behavior) {
  switch (behavior) {
    case "damageTick":
    case "effectTick":
      return "Hostiles in range are affected each round (cast check applies). Lasts while you Focus.";
    case "instant":
      return "Hostiles in range are affected once at cast (cast check applies). Aura ends on the next round.";
    default:
      return "";
  }
}
