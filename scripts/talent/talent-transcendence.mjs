/**
 * TalentTranscendence — L10 Psychic feature.
 *
 * "As an Action, you may swap out one of your known Talents for a different
 * Talent." Action cost is honor-system (no automatic action consumption);
 * we just present the swap UI and apply the changes.
 *
 * UX: DialogV2 with two dropdowns:
 *   - "Remove" — currently known Talents
 *   - "Add"    — Talents from the vce-talents compendium NOT currently known
 *
 * Confirm → delete the removed Talent from the actor, embed the new one,
 * post a chat notification. If the removed Talent was Focused, focus is
 * dropped first (TalentBuffs.toggleFocus removes its AE + status).
 */

import { MODULE_ID, log } from "../utils.mjs";
import { TALENT_TYPE } from "./talent-data-model.mjs";
import { TalentBuffs } from "./talent-buffs.mjs";

export const TalentTranscendence = {
  /**
   * Open the swap dialog for the given Psychic actor. Idempotent guard
   * prevents stacking dialogs if the button is double-clicked.
   *
   * @param {Actor} actor
   */
  async show(actor) {
    if (!actor) return;
    if (actor._vceTranscendenceOpen) return;
    actor._vceTranscendenceOpen = true;

    try {
      // Load compendium Talents (the candidate pool to add from)
      const pack = game.packs.get(`${MODULE_ID}.vce-talents`);
      if (!pack) {
        ui.notifications.error("Talents compendium not found.");
        return;
      }
      const allTalents = await pack.getDocuments();

      // Currently known Talents (the candidate pool to remove from)
      const known = actor.items.filter(i => i.type === TALENT_TYPE);
      if (known.length === 0) {
        ui.notifications.warn(`${actor.name}: no known Talents to swap.`);
        return;
      }

      const knownNames = new Set(known.map(t => t.name));
      const candidates = allTalents.filter(t => !knownNames.has(t.name));
      if (candidates.length === 0) {
        ui.notifications.info(`${actor.name}: knows every Talent already — nothing to swap to.`);
        return;
      }

      const removeOpts = known
        .map(t => `<option value="${t.id}">${t.name}</option>`)
        .join("");
      const addOpts = candidates
        .map(t => `<option value="${t.uuid}">${t.name}</option>`)
        .join("");

      const content = `
        <div class="vce-transcendence-dialog" style="display:flex; flex-direction:column; gap:10px; padding:6px 4px;">
          <p style="margin:0; opacity:.8; font-style:italic;">
            <i class="fas fa-brain"></i> Spend an Action to swap one of your known Talents for another.
          </p>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label><strong>Remove</strong></label>
            <select name="removeId">${removeOpts}</select>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label><strong>Add</strong></label>
            <select name="addUuid">${addOpts}</select>
          </div>
        </div>`;

      const result = await foundry.applications.api.DialogV2.wait({
        window: { title: "Transcendence — Swap Talent" },
        content,
        buttons: [
          {
            action: "swap",
            label: "Swap (1 Action)",
            icon: "fa-solid fa-rotate",
            default: true,
            callback: (event, button) => {
              const form = button.form;
              return {
                removeId: form.elements.removeId.value,
                addUuid:  form.elements.addUuid.value,
              };
            }
          },
          { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false,
        classes: ["vce-creature-picker-app"], // share dark theme styles
      });

      if (!result || result === "cancel" || !result.removeId || !result.addUuid) return;

      await this._performSwap(actor, result.removeId, result.addUuid);
    } finally {
      delete actor._vceTranscendenceOpen;
    }
  },

  /**
   * Execute the swap: drop focus on the removed Talent if focused, delete
   * it, embed the added compendium Talent, post a chat notification.
   *
   * @param {Actor}  actor
   * @param {string} removeId — id of the actor's owned Talent to remove
   * @param {string} addUuid  — uuid of the compendium Talent to add
   * @private
   */
  async _performSwap(actor, removeId, addUuid) {
    const removed = actor.items.get(removeId);
    if (!removed) {
      ui.notifications.warn("Selected Talent no longer exists on this character.");
      return;
    }

    // Drop focus on the removed Talent first (cleans up its AE + status)
    const focused = actor.getFlag(MODULE_ID, "psychicTalents")?.focusedIds ?? [];
    if (focused.includes(removed.id)) {
      try { await TalentBuffs.toggleFocus(actor, removed); }
      catch (e) { log("Transcendence", `Focus drop failed for ${removed.name}: ${e.message}`); }
    }

    // Resolve the candidate from compendium
    const addDoc = await fromUuid(addUuid);
    if (!addDoc) {
      ui.notifications.error("Could not resolve selected Talent.");
      return;
    }

    // Apply: delete + create in sequence (Foundry doesn't atomic-swap)
    await removed.delete();
    await actor.createEmbeddedDocuments("Item", [addDoc.toObject()]);

    ui.notifications.info(
      `Transcendence: ${actor.name} swapped ${removed.name} for ${addDoc.name} (1 Action).`
    );
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="vagabond-chat-card-v2" data-card-type="generic">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/magic/light/explosion-star-glow-purple.webp" alt="Transcendence" />
            </div>
            <div class="header-info">
              <h3 class="header-title">Transcendence</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><span>1 Action</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description">
              <p><strong>${actor.name}</strong> swapped <strong>${removed.name}</strong> for <strong>${addDoc.name}</strong>.</p>
            </div>
          </section>
        </div>
      </div>`,
    });

    log("Transcendence", `${actor.name}: ${removed.name} → ${addDoc.name}`);
  }
};
