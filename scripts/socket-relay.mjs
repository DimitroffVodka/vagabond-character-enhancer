/**
 * Socket Relay — GM-Proxied Operations
 * Allows player clients to request privileged operations (token creation,
 * actor import/delete) through the GM client via socket messages.
 *
 * Usage:
 *   import { gmRequest } from "./socket-relay.mjs";
 *   const { actorId } = await gmRequest("importActor", { uuid: "Compendium.vagabond.bestiary.Actor.abc123" });
 *   const { tokenId } = await gmRequest("placeToken", { sceneId, tokenData: { ... } });
 *   await gmRequest("removeToken", { sceneId, tokenId });
 *   await gmRequest("deleteActor", { actorId });
 */

import { MODULE_ID, log } from "./utils.mjs";

const SOCKET_KEY = `module.${MODULE_ID}`;

/** Pending request promises keyed by requestId */
const _pending = new Map();

/* -------------------------------------------- */
/*  GM Request Handler                           */
/* -------------------------------------------- */

/**
 * Process a GM-proxied request. Runs on the GM client (or inline for GM callers).
 * @param {object} data - The request data
 * @returns {object} Result payload
 */
async function _handleRequest(data) {
  switch (data.action) {
    case "importActor": {
      const doc = await fromUuid(data.uuid);
      if (!doc) return { error: "Could not resolve compendium UUID" };
      const actorData = doc.toObject();
      // Grant ownership to the requesting player so they can control the token
      if (data.userId) {
        actorData.ownership = { ...(actorData.ownership || {}), [data.userId]: 3 };
      }
      const [imported] = await Actor.create([actorData], { renderSheet: false });
      return { actorId: imported.id };
    }

    case "placeToken": {
      const scene = game.scenes.get(data.sceneId);
      if (!scene) return { error: "Scene not found" };
      const tokenData = { ...data.tokenData };
      // Ensure the token is actorLink: false so HP is per-token
      tokenData.actorLink = false;
      const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [tokenData]);
      if (!tokenDoc) return { error: "Failed to create token" };
      return { tokenId: tokenDoc.id };
    }

    case "removeToken": {
      const scene = game.scenes.get(data.sceneId);
      if (!scene) return { error: "Scene not found" };
      const tokenDoc = scene.tokens.get(data.tokenId);
      if (tokenDoc) {
        await scene.deleteEmbeddedDocuments("Token", [data.tokenId]);
      }
      return { ok: true };
    }

    case "deleteActor": {
      const actor = game.actors.get(data.actorId);
      if (actor) {
        try { await actor.delete(); } catch (e) {
          log("SocketRelay", `Could not delete actor ${data.actorId}: ${e.message}`);
        }
      }
      return { ok: true };
    }

    case "applyImbue": {
      const actor = game.actors.get(data.wielderId);
      if (!actor) return { error: "Wielder not found" };
      if (actor.getFlag(MODULE_ID, "pendingImbueDamage")) {
        await actor.unsetFlag(MODULE_ID, "pendingImbueDamage");
      }
      await actor.setFlag(MODULE_ID, "imbue", data.imbueState);
      const [ae] = await actor.createEmbeddedDocuments("ActiveEffect", [data.aeData]);
      return { ok: true, aeId: ae?.id };
    }

    case "clearImbue": {
      const actor = game.actors.get(data.wielderId);
      if (!actor) return { error: "Wielder not found" };
      if (actor.getFlag(MODULE_ID, "imbue")) {
        await actor.unsetFlag(MODULE_ID, "imbue");
      }
      const imbueAE = actor.effects.find(e => e.getFlag(MODULE_ID, "imbueAE"));
      if (imbueAE) await actor.deleteEmbeddedDocuments("ActiveEffect", [imbueAE.id]);
      return { ok: true };
    }

    case "selflessTransfer": {
      // Revelator's Selfless: revelator takes raw damage, ally's HP restored
      // by the post-armor amount they actually lost. Routed through GM because
      // the clicker only owns the revelator, not the ally.
      const revelator = game.actors.get(data.revelatorId);
      const target = game.actors.get(data.targetId);
      if (!revelator || !target) return { error: "Actor(s) not found" };

      const revHP = revelator.system?.health?.value ?? 0;
      const newRevHP = Math.max(0, revHP - data.damage);
      await revelator.update({ "system.health.value": newRevHP });

      const tgtHP = target.system?.health?.value ?? 0;
      const tgtMax = target.system?.health?.max ?? Infinity;
      const newTgtHP = Math.min(tgtMax, tgtHP + data.appliedDamage);
      await target.update({ "system.health.value": newTgtHP });

      return { ok: true, newRevHP, newTgtHP };
    }

    default:
      return { error: `Unknown action: ${data.action}` };
  }
}

/* -------------------------------------------- */
/*  Public API                                   */
/* -------------------------------------------- */

/**
 * Request a GM-privileged operation. If the caller IS the GM, executes directly.
 * Otherwise, sends a socket request and awaits the GM's response.
 * @param {string} action - One of: importActor, placeToken, removeToken, deleteActor
 * @param {object} payload - Action-specific data
 * @returns {Promise<object>} Result from the GM
 */
export async function gmRequest(action, payload = {}) {
  // Include requesting user's ID for ownership grants
  const userId = game.user.id;

  if (game.user.isGM) {
    return _handleRequest({ action, userId, ...payload });
  }

  // Check if a GM is online
  const gmOnline = game.users.find(u => u.isGM && u.active);
  if (!gmOnline) {
    throw new Error("No GM connected — cannot perform this action.");
  }

  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    _pending.set(requestId, { resolve, reject });
    game.socket.emit(SOCKET_KEY, { action, requestId, userId, ...payload });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (_pending.has(requestId)) {
        _pending.delete(requestId);
        reject(new Error("GM relay timeout — no response received."));
      }
    }, 10000);
  });
}

/**
 * Register the socket listener. Call once in the main module's ready hook.
 */
export function registerSocketRelay() {
  game.socket.on(SOCKET_KEY, async (data) => {
    // GM handles incoming requests from players
    if (game.user.isGM && data.requestId && !data._response) {
      log("SocketRelay", `GM handling ${data.action} (request ${data.requestId})`);
      const result = await _handleRequest(data);
      game.socket.emit(SOCKET_KEY, {
        _response: true,
        requestId: data.requestId,
        ...result
      });
    }

    // Player handles incoming responses from GM
    if (data._response && data.requestId) {
      const pending = _pending.get(data.requestId);
      if (pending) {
        _pending.delete(data.requestId);
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve(data);
        }
      }
    }
  });

  log("SocketRelay", "Socket relay registered.");
}
