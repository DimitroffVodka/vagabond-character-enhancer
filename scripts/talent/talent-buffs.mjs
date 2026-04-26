/**
 * TalentBuffs — Focus state + buff Active Effect distribution for Talents.
 *
 * Per the Psychic class spec:
 *
 *   flags.vagabond-character-enhancer.psychicTalents = {
 *     focusedIds: [<itemId>...],   // talent IDs currently being focused
 *     maxFocus:   1 | 2 | 3,        // 1 (L1-3), 2 (L4-7), 3 (L8+)
 *   }
 *
 * Talents with `focusBuffAE` set apply that AE to one or more target actors
 * while the caster focuses. The AE is tagged with the caster's actor id so
 * dropping focus can find and remove every distributed copy regardless of
 * which world actor it lives on.
 *
 * Per RAW: a focused buff Talent can be cast Self / Touch / Remote (each
 * extra Remote target costs +1 Mana). The caster holds the focus slot;
 * the buff lives on the target(s).
 */

import { MODULE_ID, log } from "../utils.mjs";
import { TALENT_TYPE } from "./talent-data-model.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";
import { gmRequest } from "../socket-relay.mjs";

/** Flag key on the actor for the per-Psychic focus state. */
const FLAG = "psychicTalents";

/** AE flag keys linking each distributed AE back to its source. */
const AE_TALENT_FLAG  = "talentId";
const AE_CASTER_FLAG  = "casterActorId";

/**
 * AE-change keys that only exist on the character actor schema. NPC actors
 * have flatter schemas (e.g. `system.armor` is a NumberField with no
 * sub-fields, `system.saves` doesn't exist). Applying an AE that targets a
 * character-only sub-path to an NPC corrupts the parent NumberField — Foundry
 * deepens it into an object to fit the AE path, which then makes arithmetic
 * like `damage - actor.system.armor` evaluate to NaN.
 *
 * Buff Talent mechanics (Shield d4, Evade d4) drive their effects via runtime
 * patches reading the AE's *existence*, not its `changes` array — so stripping
 * the offending changes for NPC targets is safe. Character targets keep the
 * full change set so the bonus renders on their sheet.
 */
const NPC_INCOMPATIBLE_AE_KEY_PREFIXES = [
  "system.armor.bonusDie",
  "system.saves.",
];

export const TalentBuffs = {
  /**
   * Compute max-focus capacity from the actor's Psychic class level.
   * Per RAW: 1 / 1 / 1 / 2 / 2 / 2 / 2 / 3 / 3 / 3 by level (Duality at L4 + L8).
   *
   * @param {Actor} actor
   * @returns {number} 1, 2, or 3
   */
  getMaxFocus(actor) {
    // Character level lives on the actor (matches feature-detector.mjs:256);
    // the Psychic class item's own `level` field is not the source of truth.
    const level = actor.system?.attributes?.level?.value ?? 1;
    if (level >= 8) return 3;
    if (level >= 4) return 2;
    return 1;
  },

  /**
   * Read the actor's psychicTalents flag, defaulting to empty state.
   * @param {Actor} actor
   * @returns {{ focusedIds: string[], maxFocus: number }}
   */
  getState(actor) {
    const raw = actor.getFlag(MODULE_ID, FLAG) ?? {};
    return {
      focusedIds: Array.isArray(raw.focusedIds) ? [...raw.focusedIds] : [],
      maxFocus:   raw.maxFocus ?? this.getMaxFocus(actor),
    };
  },

  /**
   * Apply focus on a Talent: distribute the focus buff AE to each target,
   * register the talent in the caster's focusedIds, and trigger focus FX.
   *
   * If the caster is already focusing this talent, drops the previous focus
   * first (RAW: one focus = one spell — re-cast replaces previous targets).
   * Capacity-checked against `getMaxFocus`.
   *
   * @param {Actor}   casterActor    — the Psychic doing the focusing
   * @param {Item}    talent         — the Talent item being focused
   * @param {Actor[]} targetActors   — recipients of the buff AE (≥1)
   * @returns {Promise<{applied: boolean, targets?: number, reason?: string}>}
   */
  async applyFocus(casterActor, talent, targetActors) {
    if (!casterActor || !talent) return { applied: false, reason: "missing args" };
    if (talent.type !== TALENT_TYPE) return { applied: false, reason: "not a Talent" };
    const targets = Array.isArray(targetActors) ? targetActors.filter(Boolean) : [];
    if (targets.length === 0) return { applied: false, reason: "no targets" };

    let state = this.getState(casterActor);

    // If already focusing this talent, drop the existing focus first so we
    // replace targets cleanly.
    if (state.focusedIds.includes(talent.id)) {
      await this.dropFocus(casterActor, talent);
      state = this.getState(casterActor);
    }

    const cap = this.getMaxFocus(casterActor);
    if (state.focusedIds.length >= cap) {
      ui.notifications.warn(
        `Already focusing ${cap} Talent${cap === 1 ? "" : "s"}. Drop one before adding another.`
      );
      return { applied: false, reason: "capacity" };
    }

    const newIds = [...state.focusedIds, talent.id];
    await casterActor.setFlag(MODULE_ID, FLAG, {
      focusedIds: newIds,
      maxFocus:   cap,
    });

    if (talent.system.focusBuffAE) {
      for (const t of targets) {
        await this._applyBuffAE(t, talent, casterActor);
      }
    }

    this._syncFocusFX(casterActor, newIds);
    log("TalentBuffs", `${casterActor.name}: focusing ${talent.name} on ${targets.length} target(s)`);
    return { applied: true, targets: targets.length };
  },

  /**
   * Drop focus on a Talent. Removes the buff AE from every target the caster
   * distributed it to (matched by `casterActorId` + `talentId` flags), removes
   * the talent from `focusedIds`, and stops focus FX if nothing else is focused.
   *
   * @param {Actor} casterActor — the Psychic dropping focus
   * @param {Item}  talent      — the Talent item being dropped
   * @returns {Promise<{dropped: boolean, removedFrom?: number}>}
   */
  async dropFocus(casterActor, talent) {
    if (!casterActor || !talent) return { dropped: false };

    let removedFrom = 0;
    if (talent.system.focusBuffAE) {
      for (const a of game.actors) {
        const ae = a.effects.find(e => {
          if (e.getFlag(MODULE_ID, AE_TALENT_FLAG) !== talent.id) return false;
          const aeCaster = e.getFlag(MODULE_ID, AE_CASTER_FLAG);
          // Match new-format AEs by casterActorId. Legacy AEs (pre-v0.4.2)
          // had no casterActorId and were always self-applied — accept them
          // only when the host actor IS the caster (self-buff cleanup).
          if (aeCaster) return aeCaster === casterActor.id;
          return a.id === casterActor.id;
        });
        if (!ae) continue;
        await this._removeBuffAE(a, ae);
        removedFrom++;
      }
    }

    const state = this.getState(casterActor);
    const newIds = state.focusedIds.filter(id => id !== talent.id);
    await casterActor.setFlag(MODULE_ID, FLAG, {
      focusedIds: newIds,
      maxFocus:   this.getMaxFocus(casterActor),
    });

    this._syncFocusFX(casterActor, newIds);
    log("TalentBuffs", `${casterActor.name}: dropped focus on ${talent.name} (cleared ${removedFrom} buff AE)`);
    return { dropped: true, removedFrom };
  },

  /**
   * Legacy helper — toggle focus with the caster as the only target.
   *
   * Used by:
   *   - The Talents tab right-click "unpick" path so dropping a picked Talent
   *     also drops its focus cleanly (one method to call regardless of state).
   *   - Public API consumers that want quick self-cast focus.
   *
   * For all other paths (esp. cast-dialog driven), call `applyFocus` /
   * `dropFocus` directly so target resolution stays explicit.
   *
   * @param {Actor} actor   — the Psychic
   * @param {Item}  talent  — the Talent item
   * @returns {Promise<{added: boolean, removed: boolean, rejected?: string}>}
   */
  async toggleFocus(actor, talent) {
    if (!actor || !talent) return { added: false, removed: false, rejected: "missing args" };
    if (talent.type !== TALENT_TYPE) return { added: false, removed: false, rejected: "not a Talent" };

    const state = this.getState(actor);
    if (state.focusedIds.includes(talent.id)) {
      const r = await this.dropFocus(actor, talent);
      return { added: false, removed: r.dropped };
    }
    const r = await this.applyFocus(actor, talent, [actor]);
    return {
      added:    r.applied,
      removed:  false,
      rejected: r.applied ? undefined : r.reason,
    };
  },

  /**
   * Play / stop the generic `_focus` FX on the caster's token, matching
   * the spell-focus visual. Psychic Talents track focus in their own flag
   * pool (separate from `system.focus.spellIds`), so FocusManager's automatic
   * spell-driven sync doesn't fire — we have to drive it manually here.
   *
   * Stops only when nothing is focused across all three pools (psychic
   * talents, system spells, feature focus) so a Psychic with both a focused
   * Talent and a focused spell doesn't lose the glow on Talent unfocus.
   *
   * @param {Actor}    actor          — the caster
   * @param {string[]} newFocusedIds  — psychicTalents.focusedIds AFTER mutation
   * @private
   */
  _syncFocusFX(actor, newFocusedIds) {
    const psychicFocused = newFocusedIds.length > 0;
    const spellFocused   = (actor.system?.focus?.spellIds ?? []).length > 0;
    const featureFocused = (actor.getFlag(MODULE_ID, "featureFocus") ?? []).length > 0;

    if (psychicFocused || spellFocused || featureFocused) {
      FocusManager.playFeatureFX(actor, "_focus");
    } else {
      FocusManager.stopFeatureFX(actor.id, "_focus");
    }
  },

  /**
   * Apply the talent's focusBuffAE to a target actor. Tags the AE with the
   * caster's id + the talent id so dropFocus can find every distributed copy
   * across the world.
   *
   * Routes through `gmRequest` for non-owned targets so a Psychic player can
   * Shield an ally PC or NPC they don't directly own.
   *
   * @param {Actor} target       — recipient of the buff (caster or anyone)
   * @param {Item}  talent       — the Talent item
   * @param {Actor} casterActor  — the Psychic focusing on this talent
   * @private
   */
  async _applyBuffAE(target, talent, casterActor) {
    const buff = talent.system.focusBuffAE;
    if (!buff) return;

    // Skip if THIS caster already has a buff AE for this talent on the target.
    // A different caster's buff for the same talent should be allowed to
    // coexist (two Psychics each Shielding the same ally).
    const existing = target.effects.find(e =>
      e.getFlag(MODULE_ID, AE_TALENT_FLAG) === talent.id
      && e.getFlag(MODULE_ID, AE_CASTER_FLAG) === casterActor.id
    );
    if (existing) return;

    // Statuses go through the canonical actor.toggleStatusEffect path so the
    // token HUD palette recognizes them as active and Foundry renders the
    // proper status icon. Custom AEs with `statuses: [...]` alone don't
    // trigger that highlight.
    const statusIds = Array.isArray(buff.statuses) ? buff.statuses : [];
    const appliedStatusIds = [];
    for (const sid of statusIds) {
      // Don't toggle on if already present (e.g. user manually applied) —
      // that would flip it OFF. Skip and don't track for removal so we
      // don't clobber the user's manual application.
      if (target.statuses.has(sid)) continue;
      await this._toggleStatus(target, sid, true);
      appliedStatusIds.push(sid);
    }

    // Build the buff AE carrying any `changes` array and the casterActorId
    // flag for cross-world lookup at dropFocus time.
    //
    // Foundry only renders an AE's icon on the token when `isTemporary` is
    // true (duration set OR statuses array). We hand statuses off to the
    // canonical path above, so this AE has none — long duration keeps it
    // temporary so the focus-badge icon still renders. 1e6 seconds (~12 days)
    // safely outlasts any session; we manage lifecycle ourselves.
    //
    // For NPC targets, strip any `changes` whose key targets a character-
    // only sub-field — applying those would corrupt the parent NumberField
    // (e.g. system.armor "deepened" into an object), causing NaN damage
    // arithmetic and validation failures on subsequent HP updates. The
    // mechanic still works because Shield/Evade's d4 reductions are driven
    // by AE-existence checks elsewhere, not by the changes array.
    const baseChanges = Array.isArray(buff.changes) ? buff.changes : [];
    const changes = target.type === "npc"
      ? baseChanges.filter(c => !NPC_INCOMPATIBLE_AE_KEY_PREFIXES.some(p => (c.key ?? "").startsWith(p)))
      : baseChanges;

    const aeData = {
      name:   buff.name   ?? `${talent.name} (Focus)`,
      img:    buff.img    ?? talent.img,
      origin: talent.uuid,
      disabled: false,
      transfer: false,
      duration: { seconds: 1_000_000 },
      changes,
      flags: {
        ...(buff.flags ?? {}),
        [MODULE_ID]: {
          [AE_TALENT_FLAG]:  talent.id,
          [AE_CASTER_FLAG]:  casterActor.id,
          appliedStatusIds,
        },
      },
    };

    if (target.isOwner) {
      await target.createEmbeddedDocuments("ActiveEffect", [aeData]);
    } else {
      await gmRequest("createActorAE", { actorId: target.id, aeData });
    }
  },

  /**
   * Remove a buff AE from its host target. Toggles off any statuses that
   * the application step turned on, then deletes the AE.
   *
   * @param {Actor}        target  — actor holding the AE
   * @param {ActiveEffect} ae      — the AE to remove
   * @private
   */
  async _removeBuffAE(target, ae) {
    const applied = ae.getFlag(MODULE_ID, "appliedStatusIds") ?? [];
    for (const sid of applied) {
      if (target.statuses.has(sid)) {
        await this._toggleStatus(target, sid, false);
      }
    }

    if (target.isOwner) {
      await ae.delete();
    } else {
      await gmRequest("deleteActorAE", { actorId: target.id, aeId: ae.id });
    }
  },

  /**
   * Toggle a status effect on an actor, routing through the GM relay if the
   * caller doesn't own the target. Status toggling is gated by OWNER perm
   * for the canonical icon to render, so non-owners must proxy.
   *
   * @param {Actor}   target
   * @param {string}  statusId
   * @param {boolean} active
   * @private
   */
  async _toggleStatus(target, statusId, active) {
    if (target.isOwner) {
      await target.toggleStatusEffect(statusId, { active });
    } else {
      await gmRequest("toggleActorStatus", {
        actorId: target.id,
        statusId,
        active,
      });
    }
  },

  /**
   * Helper: does the actor currently have any AE flagged as a Talent buff
   * for the given Talent name? Used by downstream hooks (e.g., Shield's d4
   * armor patch) to detect "Shield is currently focused".
   *
   * Matches both legacy self-target buffs and v0.4.2+ distributed buffs by
   * walking the actor's own talent items first, then any AE on the actor
   * tagged with this talent's name (via origin lookup).
   *
   * @param {Actor}  actor
   * @param {string} talentName
   * @returns {boolean}
   */
  hasFocusedTalent(actor, talentName) {
    // Path 1: actor is the caster — focusedIds carries the talent's own id.
    const state = this.getState(actor);
    if (state.focusedIds.some(id => actor.items.get(id)?.name === talentName)) {
      return true;
    }
    // Path 2: actor is a recipient — look for a buff AE tagged with a talent
    // of this name. The AE's `origin` is the talent's uuid, so we resolve
    // via the AE flags + talent name suffix. Cheap fallback check.
    return actor.effects.some(e => {
      const tid = e.getFlag(MODULE_ID, AE_TALENT_FLAG);
      if (!tid) return false;
      // Origin format: ...Item.<id>. Match talent name via the AE's display
      // name, which we set as `${talent.name} (Focus)` in _applyBuffAE.
      const aeName = e.name ?? "";
      return aeName.startsWith(`${talentName} (Focus)`);
    });
  },
};
