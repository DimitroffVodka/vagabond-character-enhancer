/**
 * Berserk Status Immunities
 *
 * Per the Vagabond rulebook, the Berserk status grants:
 *   - Can't be Frightened
 *   - (other Berserk-specific immunities, if/when we automate them)
 *
 * The system's config defines this rule but doesn't enforce it
 * mechanically. This module hooks `vagabond.preStatusApply` (added in
 * Vagabond v5.3.0) to block disallowed status applications outright,
 * before the system's status-application path even runs.
 *
 * Lives at the module level (not inside a class-features file) because
 * Berserk is a status condition — any actor with the Berserk status
 * gets these immunities regardless of how it got applied (Barbarian
 * Rage, NPC ability, GM toggle, spell, etc.).
 *
 * Replaces the v0.4.x tracker-AE pattern in `class-features/barbarian.mjs`
 * (`_registerBerserkFrightenImmunity`) which:
 *   - Watched `createActiveEffect` for Berserk landing.
 *   - Created a managed "Berserk (Frighten Immune)" AE that added
 *     `frightened` to `system.statusImmunities` so the system would
 *     block subsequent Frightened applications.
 *   - Watched `deleteActiveEffect` to clean the tracker up when Berserk
 *     went away.
 * The new approach skips the tracker AE entirely and intercepts at
 * the status-application call site, so there is no race window
 * between Berserk landing and the tracker AE being created.
 */

import { MODULE_ID, log } from "../utils.mjs";

const BERSERK = "berserk";

/** Statuses an actor with Berserk cannot have applied. */
const BERSERK_IMMUNE_STATUSES = new Set([
  "frightened",
]);

// Pending block notifications, accumulated and flushed in one card per
// status id so AoE attacks hitting multiple Berserk targets don't spam
// the chat with N separate messages. Reset each flush.
let _pending = null;
let _flushTimer = null;

function _scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    const entries = _pending;
    _pending = null;
    if (!entries) return;

    for (const [statusId, names] of Object.entries(entries)) {
      if (!names.length) continue;
      const list = names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
      const verb = names.length === 1 ? "is" : "are";
      const cap = statusId.charAt(0).toUpperCase() + statusId.slice(1);
      const statusLabel =
        game.i18n.localize(`VAGABOND.StatusConditions.${cap}`) ||
        cap;

      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-shield-alt" style="color:#cc4444;"></i>
              <strong>${list}</strong> ${verb} immune to <strong>${statusLabel}</strong> — Berserk
            </div>
          </section></div>
        </div>`,
      }).catch(() => { /* non-fatal */ });
    }
  }, 100);
}

export const BerserkImmunities = {
  init() {
    Hooks.on("vagabond.preStatusApply", (ctx) => {
      if (!ctx?.actor || !ctx.statusId) return;
      if (!BERSERK_IMMUNE_STATUSES.has(ctx.statusId)) return;
      if (!ctx.actor.statuses?.has?.(BERSERK)) return;

      // Queue a chat-card notification so the table sees why the
      // status didn't land. Debounced + de-duped so AoE attacks don't
      // produce N separate messages.
      _pending = _pending ?? {};
      _pending[ctx.statusId] = _pending[ctx.statusId] ?? [];
      if (!_pending[ctx.statusId].includes(ctx.actor.name)) {
        _pending[ctx.statusId].push(ctx.actor.name);
      }
      _scheduleFlush();

      log("BerserkImmunities", `Blocked ${ctx.statusId} on ${ctx.actor.name} (Berserk immunity)`);
      return false;
    });

    // One-shot cleanup of legacy v0.4.x tracker AEs. The pre-status-apply
    // hook makes the tracker redundant; the legacy AE is harmless if left
    // in place (it adds `frightened` to statusImmunities, which the
    // system also enforces) but cluttering the actor's effects panel
    // serves no purpose. GM-only sweep.
    Hooks.once("ready", async () => {
      if (!game.user.isGM) return;
      let removed = 0;
      for (const actor of game.actors) {
        const orphans = actor.effects.filter(e =>
          e.getFlag(MODULE_ID, "berserkFrightImmune")
        );
        if (orphans.length === 0) continue;
        try {
          await actor.deleteEmbeddedDocuments(
            "ActiveEffect",
            orphans.map(e => e.id)
          );
          removed += orphans.length;
        } catch (e) {
          log("BerserkImmunities", `Cleanup failed for ${actor.name}: ${e.message}`);
        }
      }
      if (removed > 0) {
        log("BerserkImmunities", `Cleaned up ${removed} legacy berserkFrightImmune AE(s) from prior versions`);
      }
    });

    log("BerserkImmunities", "preStatusApply listener registered.");
  },
};
