/**
 * CompanionSpawner — unified spawn / dismiss / query engine.
 *
 * Consolidates the placeToken + updateActorFlags + combat-add pattern
 * duplicated between summoner.mjs and familiar.mjs. Feature adapters
 * (summoner, familiar, spell-beast, etc.) call spawn(config) and get
 * a placed, flagged, combat-ready companion back.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { COMPANION_SOURCES, getSourceMeta } from "./companion-sources.mjs";

/**
 * Per-source dismiss handlers for feature-specific cleanup.
 * Feature adapters (Summoner, Familiar, etc.) register a handler via
 * CompanionSpawner.registerDismissHandler(sourceId, fn) so that dismissal
 * from any entry point (Companions tab Dismiss button, zeroHP auto-dismiss,
 * replace-on-spawn) correctly releases focus, removes Soulbonder AEs, clears
 * caster-side state flags, etc.
 *
 * Handler signature: async (companionActor, { reason, meta, controller }) => void
 * Fired BEFORE the generic dismiss logic (token removal + flag clear + chat).
 */
const _dismissHandlers = new Map();

export const CompanionSpawner = {
  /**
   * Spawn a companion.
   *
   * @param {object} opts
   * @param {Actor} opts.caster - The PC
   * @param {string} opts.sourceId - key into COMPANION_SOURCES
   * @param {string} opts.creatureUuid - world actor or compendium UUID
   * @param {object} [opts.tokenData] - optional token data overrides (name, texture, width, height, disposition, etc.)
   * @param {object} [opts.cost] - { mana?, ritual?, duration? }
   * @param {object} [opts.duration] - { rounds } for timed companions
   * @param {object} [opts.meta] - source-specific extras
   * @param {boolean} [opts.suppressChat=false] - if true, skip the generic "conjures X" chat message
   *   (use when the feature adapter posts its own detailed chat card — e.g. Summoner's HD + Mana
   *   breakdown, Familiar's ritual card). Dismiss notifications are NOT affected by this flag.
   * @returns {Promise<{tokenId, actorId, success, error?}>}
   */
  async spawn({ caster, sourceId, creatureUuid, tokenData = {}, cost = {}, duration = null, meta = {}, suppressChat = false }) {
    const sourceMeta = getSourceMeta(sourceId);
    if (sourceMeta === COMPANION_SOURCES.legacy) {
      return { success: false, error: `Unknown sourceId: ${sourceId}` };
    }

    // Multi-companion check: same source already active?
    const existing = this.getCompanionsFor(caster).filter(c => c.sourceId === sourceId);
    if (existing.length) {
      const replace = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Replace active companion?" },
        content: `<p>You already have an active ${sourceMeta.label}. Replace it?</p>`,
      });
      if (!replace) return { success: false, error: "User cancelled replacement" };
      for (const e of existing) await this.dismiss(e.actor, { reason: "replaced" });
    }

    // Resolve creature
    const doc = await fromUuid(creatureUuid);
    if (!doc) return { success: false, error: `Could not resolve ${creatureUuid}` };

    // Import into world if from compendium
    let actorId;
    if (doc.pack) {
      const imported = await gmRequest("importActor", { uuid: creatureUuid });
      if (imported.error) return { success: false, error: imported.error };
      actorId = imported.actorId;
    } else {
      actorId = doc.id;
    }

    // Place token on caster's scene
    const scene = game.scenes.active;
    if (!scene) return { success: false, error: "No active scene" };

    // Find the caster's token on the active scene; fall back to scene center if not placed.
    const casterToken = scene.tokens.find(t => t.actorId === caster.id);
    const casterPos = casterToken
      ? { x: casterToken.x, y: casterToken.y }
      : { x: scene.width / 2, y: scene.height / 2 };

    // Default: place adjacent to caster, 1 grid offset right.
    // Callers can override any property (including x/y) via tokenData.
    const gridSize = scene.grid.size;
    const defaultTokenData = {
      actorId,
      x: casterPos.x + gridSize,
      y: casterPos.y,
      ...tokenData,
    };

    const placeResult = await gmRequest("placeToken", {
      sceneId: scene.id,
      tokenData: defaultTokenData,
    });
    if (placeResult.error) return { success: false, error: placeResult.error };

    const tokenId = placeResult.tokenId;

    // Stamp flags atomically — writes controllerActorId, controllerType, and
    // the full companionMeta in a single actor.update() call.
    const companionMeta = {
      sourceId,
      skill: sourceMeta.skill,
      spawnedAt: Date.now(),
      sceneId: scene.id,
      tokenId,
      terminateOn: [...sourceMeta.terminateOn],
      cost: { ...cost },
      duration,
      meta: { ...meta },
    };

    const flagResult = await gmRequest("updateActorFlags", {
      actorId,
      scope: MODULE_ID,
      flags: {
        controllerActorId: caster.id,
        controllerType: sourceMeta.controllerType,
        companionMeta,
      },
    });
    if (flagResult.error) {
      // Non-fatal: token is placed but flags couldn't be written.
      // Return partial success so the caller can show a warning.
      log("CompanionSpawner", `Flag write failed but token placed: ${flagResult.error}`);
      return { tokenId, actorId, success: false, error: flagResult.error };
    }

    // Chat notification — suppressible for features with their own detailed cards
    const worldActor = game.actors.get(actorId);
    if (!suppressChat) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: caster }),
        content: `<div class="vce-companion-spawned"><strong>${caster.name}</strong> ${sourceMeta.label === "Hireling" ? "engages" : "conjures"} <strong>${worldActor?.name ?? "a companion"}</strong> <em>(${sourceMeta.label})</em>.</div>`,
      });
    }

    log("CompanionSpawner", `Spawned ${sourceId} ${worldActor?.name ?? actorId} for ${caster.name}`);
    return { tokenId, actorId, success: true };
  },

  /**
   * Dismiss a companion — remove its token, clear flags, post notification.
   *
   * @param {Actor} actor - the companion's world actor
   * @param {object} [opts]
   * @param {string} [opts.reason] - "defeated" | "replaced" | "manual" | etc.
   */
  async dismiss(actor, { reason = "manual" } = {}) {
    if (!actor) return;
    const meta = actor.getFlag(MODULE_ID, "companionMeta");
    const controllerId = actor.getFlag(MODULE_ID, "controllerActorId");
    const controller = controllerId ? game.actors.get(controllerId) : null;

    // Source-specific cleanup BEFORE generic dismissal.
    // Handlers release focus, remove source-specific AEs, clear caster-side
    // state flags (e.g. summoner's activeConjure, familiar's activeFamiliar).
    const sourceId = meta?.sourceId;
    if (sourceId) {
      const handler = _dismissHandlers.get(sourceId);
      if (handler) {
        try {
          await handler(actor, { reason, meta, controller });
        } catch (e) {
          log("CompanionSpawner", `Dismiss handler for "${sourceId}" failed: ${e.message}`);
        }
      }
    }

    // Remove token from scene
    if (meta?.sceneId && meta?.tokenId) {
      try {
        await gmRequest("removeToken", { sceneId: meta.sceneId, tokenId: meta.tokenId });
      } catch (e) {
        log("CompanionSpawner", `Could not remove token: ${e.message}`);
      }
    }

    // Clear flags atomically — value:null triggers the -= prefix unset in socket-relay
    try {
      await gmRequest("updateActorFlags", {
        actorId: actor.id,
        scope: MODULE_ID,
        flags: {
          controllerActorId: null,
          controllerType: null,
          companionMeta: null,
        },
      });
    } catch (e) {
      log("CompanionSpawner", `Flag clear failed: ${e.message}`);
    }

    // Chat notification
    const label = meta?.sourceId ? getSourceMeta(meta.sourceId).label : "companion";
    const verbMap = {
      defeated: "falls in battle",
      replaced: "is replaced",
      manual: "is dismissed",
      test: "is dismissed",
    };
    const verb = verbMap[reason] ?? "is dismissed";
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: controller ?? actor }),
      content: `<div class="vce-companion-dismissed"><strong>${actor.name}</strong> <em>(${label})</em> ${verb}.</div>`,
    });
  },

  /**
   * Get all companions flagged to a PC.
   * Scans all scene tokens and world actors for matching controllerActorId.
   *
   * Smart fallback for v0.3.4 hirelings set via the Set Save Controller dialog
   * (no companionMeta written — only controllerActorId + controllerType):
   *   - companionMeta?.sourceId present → use that
   *   - controllerType === "hireling" → treat as "hireling-manual"
   *   - otherwise → treat as "legacy"
   *
   * @param {Actor} pcActor
   * @returns {Array<{actor, tokenId?, sourceId, sourceMeta, hp, maxHP, armor, statuses}>}
   */
  getCompanionsFor(pcActor) {
    if (!pcActor) return [];
    const out = [];
    const seen = new Set();

    const collect = (actor, tokenId) => {
      if (!actor || seen.has(actor.id)) return;
      if (actor.getFlag(MODULE_ID, "controllerActorId") !== pcActor.id) return;
      seen.add(actor.id);

      const meta = actor.getFlag(MODULE_ID, "companionMeta");
      const controllerType = actor.getFlag(MODULE_ID, "controllerType");

      // Smart fallback: if no companionMeta, map controllerType → hireling-manual or legacy.
      // Handles hirelings set via the Save Controller dialog (v0.3.4 path) that never
      // wrote a companionMeta — the dialog writes only controllerActorId + controllerType.
      const sourceId = meta?.sourceId
        ?? (controllerType === "hireling" ? "hireling-manual" : "legacy");
      const sourceMeta = getSourceMeta(sourceId);

      out.push({
        actor,
        tokenId: tokenId ?? meta?.tokenId,
        sourceId,
        sourceMeta,
        hp: actor.system?.health?.value ?? 0,
        maxHP: actor.system?.health?.max ?? 0,
        armor: actor.system?.armor?.value ?? 0,
        statuses: Array.from(actor.statuses ?? []),
      });
    };

    // Scene tokens (linked + unlinked) — covers companions actively on canvas
    for (const scene of game.scenes) {
      for (const tok of scene.tokens) {
        collect(tok.actor, tok.id);
      }
    }
    // World actors not tied to any scene token (e.g. hirelings not placed)
    for (const actor of game.actors) {
      collect(actor, null);
    }

    return out;
  },

  /**
   * Register a source-specific dismiss handler.
   *
   * The handler runs BEFORE the generic dismiss logic (token removal + flag
   * clear + chat notification). Use for source-specific cleanup: releasing
   * focus, removing source-specific AEs, clearing caster-side state flags.
   *
   * Idempotent — registering the same sourceId replaces the prior handler.
   *
   * @param {string} sourceId - Must match a key in COMPANION_SOURCES
   * @param {(actor: Actor, ctx: {reason: string, meta: object, controller: Actor|null}) => Promise<void>} handler
   */
  registerDismissHandler(sourceId, handler) {
    if (typeof handler !== "function") {
      throw new Error(`registerDismissHandler: handler for "${sourceId}" must be a function`);
    }
    _dismissHandlers.set(sourceId, handler);
    log("CompanionSpawner", `Registered dismiss handler for source: ${sourceId}`);
  },
};
