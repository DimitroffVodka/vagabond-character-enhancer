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

import { MODULE_ID, log, onRenderChatMessage } from "../utils.mjs";
import { uuidFor as catalogUuidFor } from "../active-effects-catalog.mjs";

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

    // v14 region-based generic auras fire this hook via their executeScript
    // behavior body. The behavior runs in a sandbox and can't directly
    // call into VCE modules, so it broadcasts an intent here and the real
    // tick resolution happens in module scope.
    Hooks.on("vagabondCharacterEnhancer.regionAuraTick", (ctx) => {
      AuraManager._handleRegionAuraEvent(ctx).catch(err =>
        console.warn(`${MODULE_ID} | regionAuraTick error:`, err));
    });

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
          // Path-update only `tickedThisRound`. A wholesale `{...auraState, ...}`
          // write would race with `_handleTemplateMove`'s concurrent
          // `activeAura.templateId` update on v14 (where templates are
          // delete+recreate per move) and clobber the new templateId.
          await actor.setFlag(MODULE_ID, "activeAura.tickedThisRound", []);
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
    onRenderChatMessage((message, el) => {
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
        // v14 path: use a Region attached to the caster's token with an
        // applyActiveEffect behavior. The region follows the caster
        // natively (no updateToken hook), auto-applies the buff on
        // entry, and auto-removes on exit. Replaces the legacy
        // MeasuredTemplate + manual containment scan + per-round tick.
        // Falls through to legacy path on failure or non-Bless-allies.
        if (await AuraManager._activateBlessAlliesAsRegion(actor, radius)) return;
      }
    }

    // Ward: v14 region path (same architecture as Bless). Ward's damage
    // reduction is handled reactively by WardManager via the wardAE flag,
    // so detection is tag-based — same harmless caster-duplicate as Bless.
    if (spellKey === "ward") {
      if (await AuraManager._activateWardAsRegion(actor, radius)) return;
    }

    // Exalt: v14 region path with shared-template-actor. Exalt has real
    // AE `changes` (+1 Will saves) — putting the source on the caster
    // would stack it twice (source + clone-on-self), so we keep the
    // template on a dedicated hidden actor and let the region apply
    // exactly one clone per in-range token (including caster).
    if (spellKey === "exalt") {
      if (await AuraManager._activateExaltAsRegion(actor, radius)) return;
    }

    // Create an Aura Effects-compatible AE on the caster
    // The auraeffects module handles propagation to nearby tokens automatically
    const aeData = {
      name: aeName,
      img: spellDef.icon,
      origin: `Actor.${actor.id}`,
      disabled: false,
      statuses: ["aura-source"],
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

    // v14 region-based aura cleanup. If `regionId` is set the aura was
    // activated via the new path; delete the region (which auto-removes
    // all cloned AEs on in-range tokens) and the source AE on the caster.
    if (auraState.regionId) {
      await AuraManager._deactivateRegion(actor, auraState);
      // Post the standard "ends aura" chat card and we're done — none of
      // the legacy template/FX/buff cleanup applies in the region path.
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
      log("AuraManager", `Deactivated region-based aura for ${actor.name}`);
      return;
    }

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
   * v14 region-based aura activation for Bless (allies mode).
   *
   * The historical AuraManager path uses a MeasuredTemplate + manual
   * updateToken-driven follow + per-round containment scan to apply the
   * blessAE flag AE to in-range allies. v14 supports Regions with
   * `attachment.token` (region follows the token natively) and an
   * `applyActiveEffect` behavior that auto-applies a cloned AE to every
   * entering token and removes it on exit — replacing all of that custom
   * plumbing with declarative region data.
   *
   * The source AE lives on the caster as a hidden template. The region's
   * applyActiveEffect behavior clones it onto every in-range token. The
   * caster ends up with two copies (the source + their own clone, since
   * they're inside their own region) — harmless for Bless's tag-based
   * detection (BlessManager.onPreRollSave checks for the flag's presence,
   * not its count). Both source and all clones are removed when the
   * region is deleted.
   *
   * @param {Actor} actor - The caster
   * @param {number} radius - Aura radius in feet
   * @returns {Promise<boolean>} true if region path succeeded, false to fall through
   */
  async _activateBlessAlliesAsRegion(actor, radius) {
    const spellDef = AURA_SPELLS.bless;
    const token = AuraManager._getCasterToken(actor);
    if (!token) return false;

    // Catalog-backed template — single source-of-truth AE on the hidden
    // catalog actor. Clones onto every in-range token (including caster)
    // exactly once. Replaces the prior per-caster source-on-caster
    // pattern which left the caster with two copies (harmless duplicate
    // for tag-based detection, but ugly).
    const templateUuid = await catalogUuidFor("bless-aura");
    if (!templateUuid) return false;

    try {
      const scene = canvas.scene;
      const distance = scene.grid?.distance || 5;
      const radiusPx = radius * scene.grid.size / distance;
      const center = token.getCenterPoint?.() ?? {
        x: (token.document?.x ?? 0) + ((token.document?.width ?? 1) * scene.grid.size) / 2,
        y: (token.document?.y ?? 0) + ((token.document?.height ?? 1) * scene.grid.size) / 2,
      };

      const [region] = await scene.createEmbeddedDocuments("Region", [{
        name: `Bless Aura — ${actor.name}`,
        visibility: 2,
        color: spellDef.templateColor || "#87CEEB",
        attachment: { token: token.id },
        shapes: [{ type: "circle", x: center.x, y: center.y, radius: radiusPx, hole: false, gridBased: false }],
        behaviors: [{
          type: "applyActiveEffect",
          name: "Bless Buff",
          system: { effects: [templateUuid] },
        }],
        flags: { [MODULE_ID]: { auraOwner: actor.id, spellKey: "bless" } },
      }]);

      await actor.setFlag(MODULE_ID, "activeAura", {
        spellKey: "bless",
        blessMode: "allies",
        radius,
        tokenId: token.id,
        regionId: region.id,
        // No sourceAeId — template lives in the shared catalog.
      });

      AuraManager._playAuraFX(token, spellDef, radius);

      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="aura-activate">
          <div class="card-body">
            <header class="card-header">
              <div class="header-icon"><img src="${spellDef.icon}" alt="${spellDef.label}"></div>
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

      log("AuraManager", `Activated Bless aura (region path, ${radius}') for ${actor.name}`);
      return true;
    } catch (err) {
      log("AuraManager", `Region path failed for Bless on ${actor.name}; falling back to legacy. ${err.message}`);
      return false;
    }
  },

  /**
   * v14 region-based aura activation for Ward.
   *
   * Same shape as Bless: source AE on caster (tag: wardAE + wardCasterId)
   * cloned to every in-range token by an applyActiveEffect behavior on a
   * Region attached to the caster's token. WardManager's reactive damage
   * reduction checks the wardAE flag presence, so the harmless caster-
   * duplicate is fine here too.
   *
   * @param {Actor} actor - The caster
   * @param {number} radius - Aura radius in feet
   * @returns {Promise<boolean>} true if region path succeeded, false to fall through
   */
  async _activateWardAsRegion(actor, radius) {
    const spellDef = AURA_SPELLS.ward;
    const token = AuraManager._getCasterToken(actor);
    if (!token) return false;

    try {
      const [sourceAE] = await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: `Ward (Aura: ${actor.name})`,
        img: spellDef.icon,
        origin: `Actor.${actor.id}`,
        description: spellDef.description || "",
        disabled: false,
        statuses: ["warded"],
        flags: {
          [MODULE_ID]: {
            managed: true,
            auraTemplate: true,
            auraSpell: "Ward",
            auraBuff: actor.id,
            wardAE: true,
            wardCasterId: actor.id,
          },
        },
        changes: [],
      }]);

      const scene = canvas.scene;
      const distance = scene.grid?.distance || 5;
      const radiusPx = radius * scene.grid.size / distance;
      const center = token.getCenterPoint?.() ?? {
        x: (token.document?.x ?? 0) + ((token.document?.width ?? 1) * scene.grid.size) / 2,
        y: (token.document?.y ?? 0) + ((token.document?.height ?? 1) * scene.grid.size) / 2,
      };

      const [region] = await scene.createEmbeddedDocuments("Region", [{
        name: `Ward Aura — ${actor.name}`,
        visibility: 2,
        color: spellDef.templateColor || "#4a90d9",
        attachment: { token: token.id },
        shapes: [{ type: "circle", x: center.x, y: center.y, radius: radiusPx, hole: false, gridBased: false }],
        behaviors: [{
          type: "applyActiveEffect",
          name: "Ward Buff",
          system: { effects: [sourceAE.uuid] },
        }],
        flags: { [MODULE_ID]: { auraOwner: actor.id, spellKey: "ward" } },
      }]);

      await actor.setFlag(MODULE_ID, "activeAura", {
        spellKey: "ward",
        radius,
        tokenId: token.id,
        regionId: region.id,
        sourceAeId: sourceAE.id,
      });

      AuraManager._playAuraFX(token, spellDef, radius);

      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="aura-activate">
          <div class="card-body">
            <header class="card-header">
              <div class="header-icon"><img src="${spellDef.icon}" alt="${spellDef.label}"></div>
              <div class="header-info">
                <h3 class="header-title">${spellDef.label} Aura</h3>
                <div class="metadata-tags-row">
                  <div class="meta-tag tag-skill"><i class="fas fa-circle"></i><span>${radius}' Radius</span></div>
                  <span class="tag-separator">//</span>
                  <div class="meta-tag tag-standard"><i class="fas fa-shield-alt"></i><span>${spellDef.description}</span></div>
                </div>
              </div>
            </header>
            <section class="content-body">
              <div class="card-description" style="text-align:center;">
                ${actor.name} activates <strong>${spellDef.label}</strong> as a ${radius}' Aura.<br>
                <em>Allies within range receive damage reduction. Requires Focus.</em>
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

      log("AuraManager", `Activated Ward aura (region path, ${radius}') for ${actor.name}`);
      return true;
    } catch (err) {
      log("AuraManager", `Region path failed for Ward on ${actor.name}; falling back to legacy. ${err.message}`);
      return false;
    }
  },

  /**
   * Tear down a region-based aura. Deletes the Region (which auto-removes
   * all cloned AEs from in-range tokens) and the source template AE on
   * the caster (if the path stored one there). Auras using a shared
   * template-actor (Exalt) don't have a per-caster source AE to delete.
   * Caller is responsible for clearing the `activeAura` flag.
   */
  async _deactivateRegion(actor, auraState) {
    AuraManager._stopAuraFX(actor);

    if (auraState.regionId) {
      const region = canvas.scene?.regions?.get(auraState.regionId);
      if (region) {
        try { await region.delete(); } catch { /* permission / already gone */ }
      }
    }

    if (auraState.sourceAeId) {
      const ae = actor.effects.get(auraState.sourceAeId);
      if (ae) {
        try { await ae.delete(); } catch { /* ignore */ }
      }
    }

    await actor.unsetFlag(MODULE_ID, "activeAura");
  },

  /**
   * v14 region-based aura activation for Exalt.
   *
   * Unlike Bless / Ward (tag-based detection where caster-duplicate would
   * be harmless), Exalt has real AE `changes` that would stack if the
   * source AE lived on the caster. The region's applyActiveEffect
   * behavior references a shared template AE in the VCE Active Effects
   * Catalog and clones it onto every in-range token (caster included)
   * exactly once. Catalog backing is currently a hidden world actor
   * (`_VCE Active Effects Catalog`); see active-effects-catalog.mjs.
   *
   * @param {Actor} actor - The caster
   * @param {number} radius - Aura radius in feet
   * @returns {Promise<boolean>} true if region path succeeded, false to fall through
   */
  async _activateExaltAsRegion(actor, radius) {
    const spellDef = AURA_SPELLS.exalt;
    const token = AuraManager._getCasterToken(actor);
    if (!token) return false;

    const templateUuid = await catalogUuidFor("exalt-aura");
    if (!templateUuid) return false;

    try {
      const scene = canvas.scene;
      const distance = scene.grid?.distance || 5;
      const radiusPx = radius * scene.grid.size / distance;
      const center = token.getCenterPoint?.() ?? {
        x: (token.document?.x ?? 0) + ((token.document?.width ?? 1) * scene.grid.size) / 2,
        y: (token.document?.y ?? 0) + ((token.document?.height ?? 1) * scene.grid.size) / 2,
      };

      const [region] = await scene.createEmbeddedDocuments("Region", [{
        name: `Exalt Aura — ${actor.name}`,
        visibility: 2,
        color: spellDef.templateColor || "#FFD700",
        attachment: { token: token.id },
        shapes: [{ type: "circle", x: center.x, y: center.y, radius: radiusPx, hole: false, gridBased: false }],
        behaviors: [{
          type: "applyActiveEffect",
          name: "Exalt Buff",
          system: { effects: [templateUuid] },
        }],
        flags: { [MODULE_ID]: { auraOwner: actor.id, spellKey: "exalt" } },
      }]);

      await actor.setFlag(MODULE_ID, "activeAura", {
        spellKey: "exalt",
        radius,
        tokenId: token.id,
        regionId: region.id,
        // Intentionally no sourceAeId — template AE is shared and owned by
        // the template-actor; never deleted at deactivate.
      });

      AuraManager._playAuraFX(token, spellDef, radius);

      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="aura-activate">
          <div class="card-body">
            <header class="card-header">
              <div class="header-icon"><img src="${spellDef.icon}" alt="${spellDef.label}"></div>
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

      log("AuraManager", `Activated Exalt aura (region path, ${radius}') for ${actor.name}`);
      return true;
    } catch (err) {
      log("AuraManager", `Region path failed for Exalt on ${actor.name}; falling back to legacy. ${err.message}`);
      return false;
    }
  },

  /**
   * v14 region-based generic aura activation (Burn-style damage/effect
   * ticks, Talent auras like Pyrokinesis). Replaces the legacy
   * MeasuredTemplate + manual `_tickAura` containment scan + token-move
   * re-tick plumbing with a Region whose `executeScript` behavior fires
   * a custom hook on token entry / move-in / round start. The hook is
   * caught by `_handleRegionAuraEvent` which dispatches to the existing
   * cast resolution pipeline.
   *
   * Same activeAura flag shape as the legacy `activateGeneric`, with
   * `regionId` (the Region) replacing `templateId` (the template) and
   * `isRegionAura: true` as the path marker.
   *
   * @param {Actor} actor
   * @param {object} spec - same shape as `activateGeneric`
   * @returns {Promise<boolean>} true on success
   */
  async _activateGenericAsRegion(actor, spec) {
    const token = AuraManager._getCasterToken(actor);
    if (!token) return false;

    try {
      const scene = canvas.scene;
      const radius = spec.radius ?? 10;
      const distance = scene.grid?.distance || 5;
      const radiusPx = radius * scene.grid.size / distance;
      const center = token.getCenterPoint?.() ?? {
        x: (token.document?.x ?? 0) + ((token.document?.width ?? 1) * scene.grid.size) / 2,
        y: (token.document?.y ?? 0) + ((token.document?.height ?? 1) * scene.grid.size) / 2,
      };

      // executeScript body — runs in a sandboxed context where `this`
      // is the window global (NOT the behavior). The reliable accessors
      // are off the event payload: `event.region` is the region doc,
      // `event.data.token` is the affected token, `event.name` is the
      // event name. We forward to a module-scope hook that owns the
      // real tick resolution.
      const tickScript = `Hooks.callAll("vagabondCharacterEnhancer.regionAuraTick", { regionId: event.region.id, event });`;

      const [region] = await scene.createEmbeddedDocuments("Region", [{
        name: `${spec.itemName} Aura — ${actor.name}`,
        visibility: 2,
        color: spec.templateColor ?? "#9b6bff",
        attachment: { token: token.id },
        shapes: [{ type: "circle", x: center.x, y: center.y, radius: radiusPx, hole: false, gridBased: false }],
        behaviors: [{
          type: "executeScript",
          name: "VCE Generic Aura Tick",
          system: {
            // `tokenMoveIn` covers tokens walking into the radius — the
            // common case for hostiles wandering into a Burn aura.
            // `tokenRoundStart` fires per-token at combat round start
            // while they're inside the region (per-round tick).
            // We intentionally do NOT subscribe to `tokenEnter` even
            // though it sounds like the canonical "entry" event:
            // tokenEnter + tokenMoveIn both fire for the same movement,
            // and async handler races mean both dispatch concurrently
            // — double-ticking the same target. Initial in-range tokens
            // at region-create time are caught by the activation-time
            // first tick instead.
            events: ["tokenMoveIn", "tokenRoundStart"],
            source: tickScript,
          },
        }],
        flags: {
          [MODULE_ID]: {
            auraOwner: actor.id,
            sourceItemId: spec.sourceItemId,
            sourceItemType: spec.sourceItemType ?? "talent",
            generic: true,
          },
        },
      }]);

      const auraData = {
        generic: true,
        isRegionAura: true,
        behavior: spec.behavior,
        sourceItemId: spec.sourceItemId,
        sourceItemType: spec.sourceItemType ?? "talent",
        itemName: spec.itemName,
        itemImg: spec.itemImg,
        castConfig: spec.castConfig,
        focusTalentId: spec.focusTalentId ?? null,
        focusSpellId: spec.focusSpellId ?? null,
        radius,
        tokenId: token.id,
        regionId: region.id,
        tickedThisRound: spec.initialTickedActorIds ?? [],
      };
      await actor.setFlag(MODULE_ID, "activeAura", auraData);

      // Post chat notification (same shape as activateGeneric).
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
                </div>
              </div>
            </header>
            <section class="content-body">
              <div class="card-description" style="text-align:center;">
                ${actor.name} casts <strong>${spec.itemName ?? "Aura"}</strong> as a ${radius}' Aura.
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

      // Activation-time first tick — the region's tokenEnter event only
      // fires on subsequent entries, not for tokens already standing in
      // the area when the region is created. Reuse `_tickAura` to hit
      // anyone already in range.
      if (spec.behavior === "damageTick" || spec.behavior === "effectTick" || spec.behavior === "instant") {
        // Synthesize a template-like object so the legacy tick reads
        // its position from the region shape.
        const fakeTemplate = { t: "circle", x: center.x, y: center.y, distance: radius };
        await AuraManager._tickAura(actor, { ...auraData, _regionFakeTemplate: fakeTemplate });
      }

      log("AuraManager", `Activated generic aura "${spec.itemName}" (region path, ${spec.behavior}, ${radius}') for ${actor.name}`);
      return true;
    } catch (err) {
      log("AuraManager", `Region path failed for generic aura on ${actor.name}; falling back to legacy. ${err.message}`);
      return false;
    }
  },

  /**
   * Handle a region-aura tick event fired from a Region's executeScript
   * behavior. Looks up the caster + validates the aura is still active,
   * then dispatches a single-target tick against the entering token.
   *
   * We DON'T go through `_tickAura`'s containment scan — when a region
   * fires `tokenEnter` / `tokenMoveIn` the token's new position hasn't
   * always propagated to the canvas placeable yet (animation timing),
   * so a position-based containment check can falsely report the token
   * as out-of-range. The region itself has already decided the token
   * is in the region (that's why the event fired); we trust that and
   * dispatch directly to the cast resolution.
   */
  async _handleRegionAuraEvent(ctx) {
    if (!game.user.isGM) return;
    const { regionId, event } = ctx ?? {};
    if (!regionId || !event) return;

    const region = canvas.scene?.regions?.get(regionId);
    if (!region) return;

    const ownerActorId = region.getFlag(MODULE_ID, "auraOwner");
    const actor = ownerActorId && game.actors.get(ownerActorId);
    if (!actor) return;

    const auraState = actor.getFlag(MODULE_ID, "activeAura");
    if (!auraState?.isRegionAura) return;

    const eventToken = event.data?.token ?? event.token;
    if (!eventToken) return;

    // Resolve the target actor — works for both Token placeables and
    // TokenDocuments (event payload is typically a TokenDocument).
    const targetActor = eventToken.actor ?? eventToken.document?.actor ?? null;
    if (!targetActor) return;

    // Skip self-application — the caster shouldn't damage themselves
    // with their own Burn aura.
    if (targetActor.id === actor.id) return;

    // Only hit hostile dispositions, mirroring the legacy `_tickAura`
    // semantics. The region itself doesn't filter by disposition.
    const tokenDoc = eventToken.document ?? eventToken;
    if (tokenDoc.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return;

    // Dedup: tokenEnter and tokenMoveIn often both fire for the same
    // entry; tokenRoundStart can race too. Coalesce via tickedThisRound.
    const tickedSet = new Set(auraState.tickedThisRound ?? []);
    if (tickedSet.has(targetActor.id)) return;

    const sourceItem = actor.items.get(auraState.sourceItemId);
    if (!sourceItem) return;

    // Dispatch directly to the per-target cast resolution. We need a
    // Token *placeable* for the legacy code paths that read .actor /
    // .document — resolve via the scene's placeables, falling back to
    // synthesizing a minimal stand-in if the placeable isn't ready.
    const placeable = canvas.tokens?.placeables?.find(p => p.id === tokenDoc.id)
                   ?? tokenDoc.object
                   ?? { actor: targetActor, document: tokenDoc, name: tokenDoc.name, id: tokenDoc.id };

    try {
      if (auraState.sourceItemType === "spell") {
        await AuraManager._fireSpellTickAtTarget(actor, sourceItem, auraState.castConfig, placeable);
      } else {
        const { TalentCast } = await import("../talent/talent-cast.mjs");
        await TalentCast.executeCast(actor, sourceItem, auraState.castConfig, { explicitTargets: [placeable], skipFocus: true });
      }
      // Update tickedThisRound so concurrent tokenEnter / tokenMoveIn /
      // tokenRoundStart events for the same target don't double-tick.
      tickedSet.add(targetActor.id);
      await actor.setFlag(MODULE_ID, "activeAura.tickedThisRound", [...tickedSet]);
    } catch (err) {
      console.warn(`${MODULE_ID} | Region aura tick on ${tokenDoc.name} failed:`, err);
    }
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
   *
   * v14: MeasuredTemplate documents are read-only post-create — `template.update({x,y})`
   * silently no-ops with no error or warning (the doc was "merged into Region functionality"
   * for v16 removal). Workaround: delete and recreate the template at the new position,
   * preserving all original fields, then update auraState.templateId to the new ID.
   */
  async _updateTemplatePosition(actor, tokenDoc, auraState, changes = {}) {
    const oldTemplate = canvas.scene.templates.get(auraState.templateId);
    if (!oldTemplate) return;

    const gridSize = canvas.grid.size;
    const newX = (changes.x ?? tokenDoc.x) + gridSize / 2;
    const newY = (changes.y ?? tokenDoc.y) + gridSize / 2;

    if (oldTemplate.x === newX && oldTemplate.y === newY) return;

    const newData = oldTemplate.toObject();
    delete newData._id;
    newData.x = newX;
    newData.y = newY;

    await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [oldTemplate.id]);
    const [newTemplate] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [newData]);
    if (newTemplate) {
      await actor.setFlag(MODULE_ID, "activeAura.templateId", newTemplate.id);
    }
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
    // Friendly disposition is the right gate, not actor type — summoned
    // allies (Animal Companion, Familiar, conjured creatures, hirelings,
    // a Wizard's animated object) are NPC actors but functional allies
    // and should be eligible for the buff. Hostiles and neutrals stay
    // excluded.
    const isFriendlyToken = t => t?.document?.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
    const alliesInRange = new Set(
      inRangeTokens.filter(isFriendlyToken).map(t => t.actor.id)
    );
    // Caster is always in range of their own aura, even if their token
    // somehow tests outside the radius (shouldn't happen, but defensive).
    alliesInRange.add(casterActor.id);

    // Apply buffs to allies in range, remove from those out of range
    for (const token of canvas.tokens.placeables) {
      if (!token.actor) continue;
      if (!isFriendlyToken(token) && token.actor.id !== casterActor.id) continue;

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
            img: "icons/commodities/metal/ingot-silver.webp",
            origin: `Actor.${casterActor.id}`,
            description: "Weapons count as Silvered",
            disabled: false,
            statuses: ["silvered"],
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

    // Derive a status id from the spell label so the AE renders as a token
    // icon. The exact string doesn't matter for display — the AE's `img` is
    // what the player sees — but Foundry only renders icons for AEs with a
    // `statuses` entry or a duration set. Map known buffs to their direct-
    // cast status ids so aura and direct-cast versions share the same icon
    // tag (e.g. aura Ward and direct Ward both register as "warded").
    const labelLc = String(spellDef.label || "spell").toLowerCase();
    const statusMap = { ward: "warded", bless: "blessed" };
    const statusId = statusMap[labelLc] ?? labelLc.replace(/[^a-z0-9-]+/g, "-");

    const aeData = {
      name: `${spellDef.label} (Aura: ${casterActor.name})`,
      img: spellDef.icon,
      origin: `Actor.${casterActor.id}`,
      description: spellDef.description || "",
      disabled: false,
      statuses: [statusId],
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
      const cached = sheetStates[spell.id]?.damageDice;
      // Honor an explicit 0 — the player's "effect only" choice. The old
      // `>= 1` guard silently coerced 0 back to the default of 1, so an
      // effect-only Burn aura was still rolling damage on every tick.
      if (typeof cached === "number" && cached >= 0) {
        castDamageDice = cached;
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
    // `hasDamage` is the spell-level "has any damage definition" flag;
    // `castDamageDice > 0` is the player's runtime choice. An effect-only
    // cast (damageDice = 0) on a damage-capable spell is effectTick, not
    // damageTick — the tick path won't roll damage, so the label should
    // match what's actually happening.
    const focused = (actor.system?.focus?.spellIds ?? []).includes(spellId);
    const willRollDamage = hasDamage && castDamageDice > 0;
    let behavior;
    if (focused) {
      behavior = willRollDamage ? "damageTick" : "effectTick";
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

    // v14 region path. Replaces the legacy MeasuredTemplate + per-tick
    // containment scan with a Region whose executeScript behavior fires
    // tokenEnter / tokenMoveIn / tokenRoundStart events into the
    // `vagabondCharacterEnhancer.regionAuraTick` hook. Falls through to
    // the legacy path on any failure (incompatible scene config, region
    // permissions, etc.).
    if (await AuraManager._activateGenericAsRegion(actor, spec)) {
      return { success: true };
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

    // Source of position truth: legacy path reads from a MeasuredTemplate
    // doc on the scene; v14 region path passes a synthetic
    // `_regionFakeTemplate` (with x/y/distance) because the region has no
    // template — its shape lives inside the region document. Either way
    // we end up with the same shape contract for `_tokensInsideTemplate`.
    const template = auraState._regionFakeTemplate
      ?? canvas.scene?.templates?.get(auraState.templateId);
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
    let hostiles = inRange.filter(tok =>
      tok.actor
      && tok.actor.id !== actor.id
      && tok.document?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE
    );
    // Region path: single-token event (tokenEnter / tokenMoveIn / token
    // RoundStart) restricts the tick to one specific actor.
    if (auraState._onlyActorId) {
      hostiles = hostiles.filter(tok => tok.actor.id === auraState._onlyActorId);
    }
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
    // Path-update only `tickedThisRound` — a wholesale `{...auraState, ...}`
    // write races with `_handleTemplateMove`'s concurrent `templateId`
    // update on v14 (templates are delete+recreate per move). The race
    // detached the aura template from the caster after the activation
    // tick: tick reads auraState (templateId=T1), move handler swaps in
    // T2, tick writes back its T1 snapshot, T2 is orphaned.
    await actor.setFlag(MODULE_ID, "activeAura.tickedThisRound", [...tickedSet]);
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
