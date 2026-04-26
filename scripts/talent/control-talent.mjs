/**
 * Control Talent adapter — Animate-spell logic, but driven by the Psychic
 * Talent focus pool instead of the system spell focus.
 *
 * Per the Psychic Talent table (Core Rulebook): Control has no damage or
 * status — its "effect" is the Animate-spell logic. Casting Control with
 * Focus turns an item into an obedient animated object the Psychic
 * commands while focusing.
 *
 * Differs from AnimateSpell only in:
 *   - Focus mechanism — listens to `flags.vce.psychicTalents.focusedIds`
 *     instead of `system.focus.spellIds`.
 *   - SOURCE_ID + sourceMeta entry — `talent-control` so HP-to-zero
 *     auto-dismiss, replace-on-recast, and the Companions tab badge all
 *     behave correctly without per-call branches.
 *   - Dismiss handler — drops focus via `TalentBuffs.dropFocus` instead of
 *     mutating `system.focus.spellIds`.
 *
 * Picker, synthetic-actor build, and Object stat derivation are shared with
 * AnimateSpell to avoid drift.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { CompanionSpawner } from "../companion/companion-spawner.mjs";
import { AnimateSpell } from "../spell-features/animate-spell.mjs";
import { TalentBuffs } from "./talent-buffs.mjs";
import { TALENT_TYPE } from "./talent-data-model.mjs";

const SOURCE_ID = "talent-control";

export const ControlTalent = {
  init() {
    // Snapshot the prior focus list so we can diff add vs remove on update.
    // The flag write goes through `actor.update({"flags.<scope>.psychicTalents": {...}})`,
    // so changes show up on `changes.flags.<scope>.psychicTalents`.
    Hooks.on("preUpdateActor", (actor, changes, options) => {
      if (actor.type !== "character") return;
      const newFlag = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.psychicTalents`);
      if (newFlag === undefined) return;
      const old = actor.getFlag(MODULE_ID, "psychicTalents")?.focusedIds ?? [];
      options._vceControlOldFocusIds = [...old];
    });
    Hooks.on("updateActor", (actor, changes, options) => this._onFocusToggle(actor, changes, options));

    // Defensive cleanup: at the start of every combat round, dismiss any
    // controlled object whose caster isn't actually focusing Control.
    // Catches the edge cases where focus state and controlled-object existence
    // diverge — e.g., the caster lost focus through external means (incoming
    // damage breaking concentration, status effects, manual flag edits) and
    // the synchronous _onFocusToggle path didn't see the change.
    Hooks.on("combatRound", () => this._reapOrphans());

    this._registerDismissHandler();
    log("ControlTalent", "Control Talent adapter registered.");
  },

  /**
   * Walk every spawned controlled object; dismiss any whose caster isn't
   * currently focusing Control. GM-only — only the GM has permission to
   * delete tokens en masse without socket relay overhead.
   */
  async _reapOrphans() {
    if (!game.user.isGM) return;
    for (const scene of game.scenes) {
      for (const tokenDoc of scene.tokens) {
        const a = tokenDoc.actor;
        if (!a) continue;
        const meta = a.getFlag(MODULE_ID, "companionMeta");
        if (meta?.sourceId !== SOURCE_ID) continue;
        const casterId = meta?.casterActorId;
        if (!casterId) continue;
        const caster = game.actors.get(casterId);
        if (!caster) continue;
        const control = this._findControlTalent(caster);
        const focusedIds = caster.getFlag(MODULE_ID, "psychicTalents")?.focusedIds ?? [];
        if (!control || !focusedIds.includes(control.id)) {
          log("ControlTalent", `Round-tick reap: ${a.name} — caster ${caster.name} no longer focusing Control`);
          await CompanionSpawner.dismiss(a, { reason: "focus-lapsed" });
        }
      }
    }
  },

  _findControlTalent(actor) {
    return actor.items.find(i => i.type === TALENT_TYPE && i.name === "Control");
  },

  async _onFocusToggle(actor, changes, options) {
    if (actor.type !== "character") return;
    if (!actor.isOwner) return;
    const newFlag = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.psychicTalents`);
    if (!newFlag) return;

    const control = this._findControlTalent(actor);
    if (!control) return;

    const oldIds = options?._vceControlOldFocusIds ?? [];
    const newIds = newFlag.focusedIds ?? [];

    const wasActive = oldIds.includes(control.id);
    const nowActive = newIds.includes(control.id);

    // ADD — Control got focused (cast pipeline applied focus, or right-
    // click toggle on the talent card). Open the inventory picker and
    // spawn the animated object.
    if (!wasActive && nowActive) {
      if (this._handlingTrigger?.has(actor.id)) return;
      (this._handlingTrigger ??= new Set()).add(actor.id);
      try {
        await this.trigger(actor);
      } finally {
        this._handlingTrigger.delete(actor.id);
      }
      return;
    }

    // REMOVE — Control was unfocused. Dismiss any active controlled object.
    if (wasActive && !nowActive) {
      if (this._handlingTrigger?.has(actor.id)) return;
      const active = CompanionSpawner.getCompanionsFor(actor).filter(c => c.sourceId === SOURCE_ID);
      if (!active.length) return;
      for (const c of active) {
        await CompanionSpawner.dismiss(c.actor, { reason: "focus-dropped" });
      }
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <strong>${actor.name}</strong> drops Focus on <strong>Control</strong>;
              the controlled object falls inert.
            </div>
          </section></div>
        </div>`,
      });
    }
  },

  _registerDismissHandler() {
    CompanionSpawner.registerDismissHandler(SOURCE_ID, async (companionActor, { controller, meta }) => {
      if (!controller) return;

      // Drop the Control focus state on the caster (re-entry guarded so the
      // resulting updateActor → _onFocusToggle path doesn't recurse and
      // re-dismiss the same companion).
      const control = this._findControlTalent(controller);
      if (control) {
        const state = TalentBuffs.getState(controller);
        if (state.focusedIds.includes(control.id)) {
          (this._handlingTrigger ??= new Set()).add(controller.id);
          try {
            await TalentBuffs.dropFocus(controller, control);
          } finally {
            this._handlingTrigger.delete(controller.id);
          }
        }
      }

      // Delete the synthetic NPC actor we created for this spawn.
      if (meta?.meta?.synthetic && companionActor?.id) {
        try { await gmRequest("deleteActor", { actorId: companionActor.id }); }
        catch (e) { log("ControlTalent", `Could not delete synthetic actor: ${e.message}`); }
      }
    });
  },

  /**
   * Public entry point — called from the Companions tab action bar as well
   * as from the focus-toggle handler.
   * @param {Actor} caster
   */
  async trigger(caster) {
    await this._controlObject(caster);
  },

  /**
   * Reuses AnimateSpell's picker + Object stat derivation (single source of
   * truth for "what does an animated 1-slot item look like as an NPC").
   */
  async _controlObject(caster) {
    // One controlled object at a time — Control targets "1 Item".
    const existing = CompanionSpawner.getCompanionsFor(caster).filter(c => c.sourceId === SOURCE_ID);
    if (existing.length) {
      ui.notifications.warn(
        `You already have a Controlled Object. Drop Focus to release it before controlling another.`
      );
      return;
    }

    // Capacity pre-check. _controlObject runs from two paths:
    //   1. Cast pipeline — focus is already applied before we get here, so
    //      `alreadyFocused` is true and the cap check is a no-op.
    //   2. Companions-tab Control button — focus has NOT been applied yet,
    //      so we have to verify the focus pool can fit Control before
    //      opening the picker. Otherwise the player picks an item, the
    //      object spawns, but focus silently fails to apply (capacity)
    //      and the object orphans without showing in the focus count.
    const control = this._findControlTalent(caster);
    if (control) {
      const state = TalentBuffs.getState(caster);
      const alreadyFocused = state.focusedIds.includes(control.id);
      if (!alreadyFocused && state.focusedIds.length >= TalentBuffs.getMaxFocus(caster)) {
        ui.notifications.warn(
          `Focus pool full. Drop a focused Talent before controlling another object.`
        );
        return;
      }
    }

    const item = await AnimateSpell._pickInventoryItem(caster);
    if (!item) return; // user cancelled

    // Build a synthetic "Controlled {item.name}" NPC. Same Object rules as
    // Animate (Animate-spell logic per RAW), but tagged with the Control
    // sourceId so HP-to-zero termination + Companions-tab badge route here.
    const hp = 1; // ≤1 Slot items are Small per the rulebook size table
    const armor = AnimateSpell._deriveObjectArmor(item);
    const { formula: rollDamage, type: damageType } = AnimateSpell._getItemDamage(item);
    const isWeapon = item.type === "equipment" && item.system?.equipmentType === "weapon";
    const attackName = isWeapon ? item.name : "Slam";
    const attackType = isWeapon && item.system?.range && item.system.range !== "close"
      ? "ranged"
      : "melee";
    const img = item.img || "icons/svg/mystery-man.svg";

    const npcData = {
      name: `Controlled ${item.name}`,
      type: "npc",
      img,
      system: {
        hd: 1,
        health: { value: hp, max: hp },
        armor,
        speed: 30,
        speedTypes: ["fly"],
        speedValues: { fly: 30, climb: 0, cling: 0, phase: 0, swim: 0 },
        size: "small",
        beingType: "Artificials",
        senses: "",
        locked: true,
        actions: [{
          name: attackName,
          attackType,
          rollDamage,
          damageType,
          note: "Uses caster's Cast Skill (routed via VCE)",
        }],
      },
      prototypeToken: {
        name: `Controlled ${item.name}`,
        texture: { src: img },
        width: 1,
        height: 1,
        disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        actorLink: false,
      },
    };

    // Create the synthetic world actor via GM proxy
    let actorId;
    try {
      const result = await gmRequest("createActor", { actorData: npcData });
      if (result?.error) throw new Error(result.error);
      actorId = result.actorId;
    } catch (e) {
      ui.notifications.error(`Could not create controlled object: ${e.message}`);
      return;
    }
    if (!actorId) {
      ui.notifications.error("Could not create controlled object actor.");
      return;
    }

    // Spawn the synthetic NPC as a companion under our SOURCE_ID
    const creatureUuid = `Actor.${actorId}`;
    const result = await CompanionSpawner.spawn({
      caster,
      sourceId: SOURCE_ID,
      creatureUuid,
      tokenData: {
        name: npcData.name,
        texture: { src: npcData.img },
        width: 1,
        height: 1,
        disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      },
      meta: { synthetic: true, sourceItemId: item.id, sourceItemName: item.name },
      suppressChat: false,
    });

    if (!result.success) {
      // Clean up the synthetic actor on failure
      try { await gmRequest("deleteActor", { actorId }); } catch { /* best effort */ }
      ui.notifications.error(`Could not control object: ${result.error ?? "unknown error"}`);
      // If the cast pipeline applied focus before us, roll it back so the
      // talent card doesn't get stuck "focused" with no spawned object.
      // The button path didn't apply focus yet, so this is a no-op there.
      if (control) {
        try { await TalentBuffs.dropFocus(caster, control); }
        catch (e) { log("ControlTalent", `Rollback dropFocus failed: ${e.message}`); }
      }
      return;
    }

    // Acquire focus state on the caster if it isn't already focusing
    // Control. Both entry paths converge here — but only the cast pipeline
    // applied focus before reaching us. The Companions-tab button bypasses
    // the cast dialog entirely, so focus has to be acquired post-spawn or
    // the object orphans without consuming a focus slot:
    //   - Talents tab wouldn't show a Drop Focus button
    //   - The focus counter wouldn't tick up
    //   - The round-tick reap would auto-dismiss the object next round
    //
    // _handlingTrigger guards against the resulting updateActor →
    // _onFocusToggle re-entering trigger() and spawning a duplicate.
    if (control) {
      const state = TalentBuffs.getState(caster);
      if (!state.focusedIds.includes(control.id)) {
        (this._handlingTrigger ??= new Set()).add(caster.id);
        try {
          await TalentBuffs.applyFocus(caster, control, [caster]);
        } finally {
          this._handlingTrigger.delete(caster.id);
        }
      }
    }

    // No FocusManager.acquireFeatureFocus call — Psychic Talents track focus
    // in their own `psychicTalents.focusedIds` pool, gated by Duality
    // (1/2/3). The cast pipeline already added Control to that pool before
    // we got here.
  },
};
