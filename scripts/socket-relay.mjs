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
 *   await gmRequest("setActorFlag", { actorId, scope, key, value });  // value:null unsets
 *   await gmRequest("updateActorFlags", { actorId, scope, flags: {key:value, ...} });
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

      // Build the set of users who should receive OWNER on the world actor:
      //   - data.userId: the requester (legacy v0.3.4 behaviour)
      //   - every user who owns the caster (if data.grantOwnershipFrom given):
      //     covers the case where a GM triggers a spawn on behalf of a player
      //     — the player who owns the caster must own the companion too.
      if (tokenData.actorId) {
        const worldActor = game.actors.get(tokenData.actorId);
        if (worldActor) {
          const grantTo = new Set();
          if (data.userId) grantTo.add(data.userId);
          if (data.grantOwnershipFrom) {
            const caster = game.actors.get(data.grantOwnershipFrom);
            if (caster?.ownership) {
              for (const [uid, level] of Object.entries(caster.ownership)) {
                if (uid === "default") continue;
                if (level >= 3) grantTo.add(uid);
              }
            }
          }
          const ownershipUpdate = {};
          for (const uid of grantTo) {
            if ((worldActor.ownership?.[uid] ?? 0) < 3) {
              ownershipUpdate[`ownership.${uid}`] = 3;
            }
          }
          if (Object.keys(ownershipUpdate).length) {
            await worldActor.update(ownershipUpdate);
          }
        }
      }
      const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [tokenData]);
      if (!tokenDoc) return { error: "Failed to create token" };
      // Auto-add to an active combat on this scene so the companion participates
      // in vagabond-crawler flanking checks and turn order. Flanking-checker
      // only scans game.combat.combatants, so a summon that isn't a combatant
      // can't flank or be flanked.
      try {
        const combat = game.combats?.find(c => c.scene?.id === scene.id);
        if (combat && !combat.combatants.some(x => x.tokenId === tokenDoc.id)) {
          await combat.createEmbeddedDocuments("Combatant", [{
            tokenId: tokenDoc.id,
            sceneId: scene.id,
            actorId: tokenDoc.actorId
          }]);
        }
      } catch (e) {
        log("SocketRelay", `Could not add ${tokenDoc.name} to combat: ${e.message}`);
      }
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

    case "setActorFlag": {
      // Scope-gated only — any connected player may write MODULE_ID flags on any
      // actor. Acceptable for the table-trust model; tighten with a key allowlist
      // if we ever store sensitive data under this scope.
      if (data.scope !== MODULE_ID) {
        return { error: `setActorFlag: refused scope "${data.scope}"` };
      }
      const actor = game.actors.get(data.actorId);
      if (!actor) return { error: `setActorFlag: actor "${data.actorId}" not found` };
      if (data.value === null || data.value === undefined) {
        await actor.unsetFlag(data.scope, data.key);
      } else {
        await actor.setFlag(data.scope, data.key, data.value);
      }
      return { ok: true };
    }

    case "updateActorFlags": {
      // Scope-gated (same trust model as setActorFlag).
      if (data.scope !== MODULE_ID) {
        return { error: `updateActorFlags: refused scope "${data.scope}"` };
      }
      const actor = game.actors.get(data.actorId);
      if (!actor) return { error: `updateActorFlags: actor "${data.actorId}" not found` };
      if (!data.flags || typeof data.flags !== "object") {
        return { error: "updateActorFlags: flags object required" };
      }
      // Build the update payload from { key: value } map.
      // value:null means unset — use the -= prefix syntax.
      const payload = {};
      for (const [key, value] of Object.entries(data.flags)) {
        if (value === null || value === undefined) {
          payload[`flags.${data.scope}.-=${key}`] = null;
        } else {
          payload[`flags.${data.scope}.${key}`] = value;
        }
      }
      await actor.update(payload);
      return { ok: true };
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
 * @param {string} action - One of: importActor, placeToken, removeToken, deleteActor, setActorFlag, updateActorFlags, applyImbue, clearImbue, selflessTransfer
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
