/**
 * CompanionTerminationManager — auto-dismiss on trigger conditions.
 *
 * Phase 1 wired: zeroHP, ritualRecast (handled in spawner's replace flow).
 * Phase 1 stubbed: duration, manaLapse, shift (future work).
 */

import { MODULE_ID, log } from "../utils.mjs";
import { CompanionSpawner } from "./companion-spawner.mjs";

export const CompanionTerminationManager = {
  init() {
    if (!game.user.isGM) return;  // only GM runs termination
    Hooks.on("updateActor", this._onUpdateActor.bind(this));
    log("CompanionTerminationManager", "Termination hooks registered (GM)");
  },

  async _onUpdateActor(actor, changes) {
    const meta = actor.getFlag(MODULE_ID, "companionMeta");
    // Bails cleanly on already-dismissed companions because dismiss() clears the flag,
    // so subsequent HP-to-0 updates won't pass this guard — no double-fire.
    if (!meta?.terminateOn?.length) return;

    // zeroHP trigger — fires when this update changes HP to 0.
    //
    // DEFERRED 250ms: mirrors the pattern in SummonerFeatures / FamiliarFeatures.
    // The Vagabond system's own updateActor hook runs toggleStatusEffect('dead')
    // in parallel with this one. For unlinked-token companions, that AE create
    // resolves its parent UUID via Scene.X.Token.Y.ActorDelta... — which fails
    // if we've already deleted the token. Throws:
    //   "undefined id [tokenId] does not exist in the EmbeddedCollection"
    // Deferring 250ms lets the system's async work finish before we wipe the token.
    if (meta.terminateOn.includes("zeroHP")) {
      const newHP = foundry.utils.getProperty(changes, "system.health.value");
      if (newHP === 0) {
        log("CompanionTerminationManager", `${actor.name} reached 0 HP — auto-dismissing (deferred 250ms)`);
        setTimeout(() => CompanionSpawner.dismiss(actor, { reason: "defeated" }), 250);
        return;
      }
    }

    // duration / manaLapse / shift — stubs (Phase 2)
    if (meta.terminateOn.includes("duration")) {
      // TODO Phase 2: check duration.rounds against combat round counter
    }
    if (meta.terminateOn.includes("manaLapse")) {
      // TODO Phase 2: check caster's mana vs cost.mana upkeep
    }
    if (meta.terminateOn.includes("shift")) {
      // TODO Phase 2: hook on rest/long-rest and dismiss
    }
  },
};
