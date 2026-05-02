/**
 * Auto-Activate
 * Decrements a combatant's `flags.vagabond.activations.value` when their
 * actor takes an in-combat action (attack / spell cast / item use). The
 * system's "Activate" button on the combat tracker does the same thing
 * manually — this just covers the common case where players forget to
 * click it.
 *
 * Detection signal: a chat message with `message.flags.vagabond.itemId`
 * AND `message.flags.vagabond.actorId` from a weapon, spell, or talent
 * is a "real action" worth spending an activation on. Free-action chat
 * (Send to Chat, descriptions, automation cards) doesn't carry an itemId,
 * so it doesn't trigger.
 *
 * No-ops if:
 *   - No active combat
 *   - The acting actor has no combatant in the active combat
 *   - The combatant's activations.value is already 0
 *   - The chat card isn't an action card (no itemId in vagabond flags)
 *   - The auto-activate world setting is disabled
 *
 * Each decrement posts a small chat note ("X activates.") so the table
 * sees the tracker tick.
 */

import { MODULE_ID, log } from "../utils.mjs";

const HANDLED_FLAG = "autoActivateHandled";

export const AutoActivate = {
  init() {
    // Process is deferred 120ms so any post-create setFlag from companion
    // action paths (which speaker the card to the controller PC but tag it
    // with companionActorId) lands first.
    Hooks.on("createChatMessage", (msg) => {
      setTimeout(() => this._onChatMessage(msg.id), 120);
    });
    log("AutoActivate", "Registered.");
  },

  async _onChatMessage(messageId) {
    // Single-source-of-truth: GM client decrements to avoid duplicate decrements
    // across multiple connected clients.
    if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

    // Setting gate
    let enabled = true;
    try { enabled = !!game.settings.get(MODULE_ID, "autoActivateOnAction"); }
    catch { /* setting not registered yet — treat as enabled */ }
    if (!enabled) return;

    const message = game.messages.get(messageId);
    if (!message) return;

    // Idempotency guard
    if (message.getFlag(MODULE_ID, HANDLED_FLAG)) return;

    // Decide whose combatant to decrement.
    // Companion action cards (speakered to the controller PC for routing) set
    // a companionActorId flag pointing at the actual acting NPC. Use that if
    // present; otherwise the chat card's vagabond.actorId is the actor that
    // took the action.
    const companionActorId = message.getFlag(MODULE_ID, "companionActorId");
    const speakerActorId   = message.flags?.vagabond?.actorId;
    const itemId           = message.flags?.vagabond?.itemId;

    const targetActorId = companionActorId || speakerActorId;
    if (!targetActorId) return;

    const actingActor = game.actors.get(targetActorId);
    if (!actingActor) return;

    // Item-type filter (only for non-companion paths — companion actions don't
    // have a corresponding item on the speaker's PC, so we trust the
    // companionActorId flag's presence as enough signal that a real action
    // happened).
    if (!companionActorId) {
      if (!itemId) return;
      const item = game.actors.get(speakerActorId)?.items?.get(itemId);
      if (!item) return;
      const allowedTypes = new Set(["weapon", "spell", `${MODULE_ID}.talent`]);
      const isAction =
        allowedTypes.has(item.type) ||
        (item.type === "equipment" && item.system?.equipmentType === "weapon");
      if (!isAction) return;
    }

    // Must be in an active combat
    const combat = game.combat;
    if (!combat || !combat.started) return;

    // Find the combatant for the acting actor in this combat
    const combatant = combat.combatants.find(c => c.actorId === actingActor.id);
    if (!combatant) return;

    // Already spent? skip
    const current = combatant.getFlag("vagabond", "activations.value") ?? 0;
    if (current <= 0) return;

    // Mark message handled so a second hook fire won't double-decrement
    try { await message.setFlag(MODULE_ID, HANDLED_FLAG, true); }
    catch { /* non-fatal */ }

    // Decrement and post a small note
    const next = current - 1;
    await combatant.setFlag("vagabond", "activations.value", next);

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actingActor }),
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <i class="fas fa-play" style="color:#4a90d9;"></i>
            <strong>${actingActor.name}</strong> activates.
            ${next === 0 ? `<br><span style="font-size:0.85em; opacity:0.7;">(no activations remaining)</span>` : `<br><span style="font-size:0.85em; opacity:0.7;">(${next} activation${next === 1 ? "" : "s"} left)</span>`}
          </div>
        </section></div>
      </div>`,
    }).catch(() => { /* non-fatal */ });

    log("AutoActivate", `${actingActor.name}: ${current} → ${next} activations${companionActorId ? " (companion)" : ""}`);
  },

  /**
   * Tag a chat message as a companion action so auto-activate decrements the
   * companion's combatant rather than the controller PC's. Call after creating
   * the action card via VagabondChatCard.createActionCard.
   *
   * @param {ChatMessage|null|undefined} message - the message returned by createActionCard
   * @param {string} companionActorId - the companion's world actor id
   */
  async tagCompanionAction(message, companionActorId) {
    if (!message?.id || !companionActorId) return;
    try { await message.setFlag(MODULE_ID, "companionActorId", companionActorId); }
    catch (e) { log("AutoActivate", `Could not tag companion message: ${e.message}`); }
  },
};
