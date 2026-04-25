/**
 * TalentBuffs — Focus toggle + buff Active Effect manager for Talents.
 *
 * Handles the four self-buff Talents (Absence, Evade, Shield, Transvection)
 * and the focus-state tracking for ALL Talents. Per the Psychic class spec:
 *
 *   flags.vagabond-character-enhancer.psychicTalents = {
 *     focusedIds: [<itemId>...],   // talent IDs currently being focused
 *     maxFocus:   1 | 2 | 3,        // 1 (L1-3), 2 (L4-7), 3 (L8+)
 *   }
 *
 * Talents with `focusBuffAE` set apply that AE to the caster while focused;
 * removed on unfocus. The AE may be a flag-carrier (empty changes) used by
 * downstream patches to inject die-rolls at attack/save time, or it may
 * carry concrete changes (e.g., Transvection adding "fly" to speedTypes).
 */

import { MODULE_ID, log } from "../utils.mjs";
import { TALENT_TYPE } from "./talent-data-model.mjs";

/** Flag key on the actor for the per-Psychic focus state. */
const FLAG = "psychicTalents";

/** AE flag key linking the AE back to its source Talent item id. */
const AE_TALENT_FLAG = "talentId";

export const TalentBuffs = {
  /**
   * Compute max-focus capacity from the actor's Psychic class level.
   * Per RAW: 1 / 1 / 1 / 2 / 2 / 2 / 2 / 3 / 3 / 3 by level (Duality at L4 + L8).
   *
   * @param {Actor} actor
   * @returns {number} 1, 2, or 3
   */
  getMaxFocus(actor) {
    const psychic = actor.items.find(i => i.type === "class" && i.name === "Psychic");
    const level = psychic?.system?.level ?? 1;
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
   * Toggle focus state on a Talent. Applies/removes the focusBuffAE on
   * focus add/remove. Enforces the multi-focus capacity from Duality.
   *
   * @param {Actor} actor
   * @param {Item}  talent  — must be a Talent item owned by actor
   * @returns {Promise<{ added: boolean, removed: boolean, rejected?: string }>}
   */
  async toggleFocus(actor, talent) {
    if (!actor || !talent) return { added: false, removed: false, rejected: "missing actor or talent" };
    if (talent.type !== TALENT_TYPE) return { added: false, removed: false, rejected: "not a Talent" };

    const state = this.getState(actor);
    const isFocused = state.focusedIds.includes(talent.id);

    if (isFocused) {
      // Remove
      state.focusedIds = state.focusedIds.filter(id => id !== talent.id);
      await actor.setFlag(MODULE_ID, FLAG, {
        focusedIds: state.focusedIds,
        maxFocus:   this.getMaxFocus(actor),
      });
      await this._removeBuffAE(actor, talent);
      log("TalentBuffs", `${actor.name}: dropped focus on ${talent.name}`);
      return { added: false, removed: true };
    }

    // Add — capacity check
    const cap = this.getMaxFocus(actor);
    if (state.focusedIds.length >= cap) {
      ui.notifications.warn(
        `Already focusing ${cap} Talent${cap === 1 ? "" : "s"}. Drop one before adding another.`
      );
      return { added: false, removed: false, rejected: "capacity" };
    }

    state.focusedIds.push(talent.id);
    await actor.setFlag(MODULE_ID, FLAG, {
      focusedIds: state.focusedIds,
      maxFocus:   cap,
    });
    await this._applyBuffAE(actor, talent);
    log("TalentBuffs", `${actor.name}: now focusing ${talent.name}`);
    return { added: true, removed: false };
  },

  /**
   * Apply the talent's focusBuffAE to the actor. Tags the AE with the
   * talent id so we can find + remove it later.
   *
   * @param {Actor} actor
   * @param {Item}  talent
   * @private
   */
  async _applyBuffAE(actor, talent) {
    const buff = talent.system.focusBuffAE;
    if (!buff) return; // Talent without a focusBuffAE — focus is purely state

    // Skip if an AE for this talent is already on the actor (defensive)
    const existing = actor.effects.find(e =>
      e.getFlag(MODULE_ID, AE_TALENT_FLAG) === talent.id
    );
    if (existing) return;

    // Statuses are applied via the canonical path (actor.toggleStatusEffect)
    // so the system creates a "real" status AE that the token HUD palette
    // recognizes as active and that Foundry renders the proper status icon
    // for. Custom AEs with `statuses: [...]` arrays alone don't trigger the
    // HUD highlight or render the canonical status icon on the token.
    const statusIds = Array.isArray(buff.statuses) ? buff.statuses : [];
    const appliedStatusIds = [];
    for (const sid of statusIds) {
      // Don't toggle on if it's already there (e.g. user manually applied) —
      // that would flip it OFF. Skip in that case and don't track it for
      // removal, so we don't clobber the user's manual application.
      if (actor.statuses.has(sid)) continue;
      await actor.toggleStatusEffect(sid, { active: true });
      appliedStatusIds.push(sid);
    }

    // Build the buff AE for the `changes` (e.g., system.favorHinder = "favor").
    // We do NOT include `statuses` here — that's the system AE's job above.
    // Track which status IDs we applied so removal knows what to toggle off.
    //
    // Foundry only renders an AE's icon on the token when `isTemporary` is
    // true (has duration.seconds/rounds/turns OR has at least one status).
    // Since we hand off statuses to the canonical path, this AE has none —
    // so we set a long duration to keep it temporary, ensuring the talent's
    // own focus-badge icon renders alongside the system status icon. The
    // duration is purely cosmetic (we manage focus lifecycle ourselves);
    // 1e6 seconds (~12 days) safely outlasts any session.
    const aeData = {
      name:   buff.name   ?? `${talent.name} (Focus)`,
      img:    buff.img    ?? talent.img,
      origin: talent.uuid,
      disabled: false,
      transfer: false,
      duration: { seconds: 1_000_000 },
      changes:  Array.isArray(buff.changes)  ? buff.changes  : [],
      flags: {
        ...(buff.flags ?? {}),
        [MODULE_ID]: {
          [AE_TALENT_FLAG]: talent.id,
          appliedStatusIds, // tracked for clean removal
        },
      },
    };

    await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);
  },

  /**
   * Remove the buff AE matching this talent from the actor.
   * Also toggles off any status effects we applied at focus time.
   *
   * @param {Actor} actor
   * @param {Item}  talent
   * @private
   */
  async _removeBuffAE(actor, talent) {
    const ae = actor.effects.find(e =>
      e.getFlag(MODULE_ID, AE_TALENT_FLAG) === talent.id
    );
    if (!ae) return;

    // Toggle off the same statuses we toggled on (only the ones we applied —
    // skips any pre-existing statuses we deliberately didn't touch).
    const applied = ae.getFlag(MODULE_ID, "appliedStatusIds") ?? [];
    for (const sid of applied) {
      if (actor.statuses.has(sid)) {
        await actor.toggleStatusEffect(sid, { active: false });
      }
    }

    await ae.delete();
  },

  /**
   * Helper: does the actor currently have any AE flagged as a Talent buff
   * for the given statusId or talent flag value? Used by downstream hooks
   * (e.g., Shield's d4 armor patch) to detect "Shield is currently focused".
   *
   * @param {Actor}  actor
   * @param {string} talentName
   * @returns {boolean}
   */
  hasFocusedTalent(actor, talentName) {
    const state = this.getState(actor);
    if (state.focusedIds.length === 0) return false;
    return state.focusedIds.some(id => actor.items.get(id)?.name === talentName);
  },
};
