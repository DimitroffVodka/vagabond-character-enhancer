/**
 * Sorcerer Tap — HP-to-Mana conversion (Option C: sheet button + cast-dialog link)
 *
 * RAW (Core Rulebook, Sorcerer L1):
 *   "When you Cast, you can reduce your Max HP to regain Mana equal to
 *    (2 × the reduction). This reduction ends when you Rest. If you die
 *    from this reduction, the Cast resolves before your death, and your
 *    body is vaporized."
 *
 * UX:
 *   - Sheet button "Tap" injected on the Tap feature row (mirrors Revelator
 *     Lay on Hands pattern in revelator.mjs).
 *   - Cast dialog header link "[Tap]" injects into the system's spell card
 *     so the player can sacrifice HP without leaving the cast flow.
 *   - Both entry points open the same Tap dialog (`SorcererTap.openDialog`).
 *
 * MECHANICS:
 *   - Cumulative reduction stored on `flags.<MODULE>.sorcererTapReduction`
 *     (number, ≥ 0). Each Tap adds to it.
 *   - Managed AE applies `-N` to `system.health.bonus[]` (mode 2 ADD on the
 *     sum-array, same pattern as Merchant Deep Pockets on
 *     `system.inventory.bonusSlots`). AE is tagged via flag for cleanup.
 *   - Mana gain = 2 × N, applied to `system.mana.current` directly. RAW
 *     doesn't cap; Overpowered explicitly removes caps; we let the system
 *     data-prep clamp if it does.
 *
 * VAPORIZE EDGE:
 *   - If the requested reduction would drop current HP to ≤ 0, dialog
 *     surfaces a "this will kill you" warning + double-confirm. Player can
 *     still commit (RAW: cast resolves first, then death). After commit,
 *     HP value is clamped to 0 — GM adjudicates the post-cast vaporize.
 *
 * REST RESET:
 *   - Rest is detected via `createChatMessage` content match (same pattern
 *     as Revelator). On rest, the Tap flag and AE are cleared.
 */

import { MODULE_ID, log, hasFeature } from "../utils.mjs";

const FLAG_REDUCTION = "sorcererTapReduction";
const FLAG_AE = "sorcererTapAE";

export const SorcererTap = {

  /* -------------------------------------------- */
  /*  Hook registration                           */
  /* -------------------------------------------- */

  registerHooks() {
    // Sheet button injection on the Tap feature row.
    Hooks.on("renderApplicationV2", (app, html) => this._injectSheetButton(app, html));

    // Cast dialog "[Tap]" link injection.
    Hooks.on("renderApplicationV2", (app, html) => this._injectCastDialogLink(app, html));

    // Rest detection — same content-match pattern as Revelator Lay on Hands.
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      const content = message.content || "";
      if (!/\brest(s|ed|ing)?\b/i.test(content)) return;
      const speakerActorId = message.speaker?.actor;
      if (!speakerActorId) return;
      const actor = game.actors.get(speakerActorId);
      if (!actor || !hasFeature(actor, "sorcerer_tap")) return;
      this._resetOnRest(actor);
    });

    log("SorcererTap", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Open the Tap dialog for an actor. Validates the actor has the Tap
   * feature; otherwise notifies and bails.
   * @param {Actor} actor
   */
  async openDialog(actor) {
    if (!actor) {
      ui.notifications?.warn("Tap: no actor selected.");
      return;
    }
    if (!hasFeature(actor, "sorcerer_tap")) {
      ui.notifications?.warn(`${actor.name} doesn't have the Sorcerer Tap feature.`);
      return;
    }

    const currentReduction = this.getCurrentReduction(actor);
    const currentHP = actor.system?.health?.value ?? 0;
    const currentMana = actor.system?.mana?.current ?? 0;

    // Build dialog content. Show current state so the player can plan.
    const content = `
      <form>
        <p><strong>HP:</strong> ${currentHP} | <strong>Mana:</strong> ${currentMana}
           ${currentReduction > 0 ? `| <em>Tap reduction this Rest: −${currentReduction} Max HP</em>` : ""}</p>
        <div class="form-group">
          <label>Sacrifice Max HP:</label>
          <input type="number" name="hpAmount" value="1" min="1" max="${currentHP}" step="1" autofocus />
        </div>
        <p style="font-size:0.85em;opacity:0.8;">
          Each HP sacrificed grants <strong>2 Mana</strong>. Reduction ends on Rest.
          If your current HP would drop to 0 from this reduction, you'll be warned
          before committing — the cast still resolves first per RAW.
        </p>
      </form>`;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Sorcerer: Tap" },
      content,
      ok: {
        label: "Tap",
        callback: (event, button) => {
          const form = button.form;
          return parseInt(form.elements.hpAmount.value, 10) || 0;
        }
      },
      rejectClose: false
    });

    if (!result || result <= 0) return;

    // Vaporize edge: warn if current HP would drop to ≤ 0.
    if (currentHP - result <= 0) {
      const confirm = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Tap: Vaporize Warning" },
        content: `<p><strong>This will reduce your current HP to 0 or below.</strong></p>
                  <p>RAW: the Cast you're about to make resolves before your death,
                  and your body is vaporized.</p>
                  <p>Confirm Tap for ${result} HP?</p>`,
        rejectClose: false
      });
      if (!confirm) return;
    }

    await this.applyTap(actor, result);
  },

  /**
   * Apply a Tap: cumulative reduction up, managed AE refreshed, mana added.
   * @param {Actor} actor
   * @param {number} hpAmount   Positive integer — Max HP to sacrifice this call.
   */
  async applyTap(actor, hpAmount) {
    if (!actor || !Number.isFinite(hpAmount) || hpAmount <= 0) return;

    const prev = this.getCurrentReduction(actor);
    const total = prev + hpAmount;

    await actor.setFlag(MODULE_ID, FLAG_REDUCTION, total);
    await this._refreshAE(actor, total);

    // Mana gain (uncapped — RAW doesn't say cap; system data-prep clamps).
    const currentMana = actor.system?.mana?.current ?? 0;
    const newMana = currentMana + (hpAmount * 2);
    const updates = { "system.mana.current": newMana };

    // After _refreshAE the AE has already lowered system.health.max by the
    // full cumulative reduction. So just clamp current HP to that post-AE max
    // if it now exceeds — don't re-subtract.
    const newMax = actor.system?.health?.max ?? 0;
    const currentHP = actor.system?.health?.value ?? 0;
    if (currentHP > newMax) {
      updates["system.health.value"] = Math.max(0, newMax);
    }

    await actor.update(updates);

    // Chat note for the table.
    const manaGained = hpAmount * 2;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<strong>Sorcerer: Tap</strong> — sacrificed ${hpAmount} Max HP for ${manaGained} Mana.
                ${total > hpAmount ? `<em>Cumulative reduction this Rest: ${total}.</em>` : ""}`
    });

    log("SorcererTap", `${actor.name}: tapped ${hpAmount} HP → +${manaGained} Mana (cumulative reduction: ${total})`);
  },

  /**
   * Clear the Tap reduction (manual or rest-triggered).
   * @param {Actor} actor
   */
  async clearTap(actor) {
    if (!actor) return;
    const reduction = this.getCurrentReduction(actor);
    if (reduction === 0) return;

    await actor.unsetFlag(MODULE_ID, FLAG_REDUCTION);

    // Remove the managed AE.
    const tapAE = actor.effects.find(e => e.getFlag(MODULE_ID, FLAG_AE));
    if (tapAE) await tapAE.delete();

    log("SorcererTap", `${actor.name}: Tap reduction cleared (was ${reduction}).`);
  },

  /**
   * @returns {number} Current cumulative HP reduction from Tap (≥ 0).
   */
  getCurrentReduction(actor) {
    return actor?.getFlag?.(MODULE_ID, FLAG_REDUCTION) ?? 0;
  },

  /* -------------------------------------------- */
  /*  Internals                                   */
  /* -------------------------------------------- */

  /**
   * Refresh the managed AE to reflect the current cumulative reduction.
   * Deletes any prior Tap AE, creates a fresh one with `-total` on
   * `system.health.bonus`. We recreate (rather than patch in place)
   * because AE change diffing is fragile; the cost is negligible.
   */
  async _refreshAE(actor, total) {
    // Clear existing.
    const existing = actor.effects.find(e => e.getFlag(MODULE_ID, FLAG_AE));
    if (existing) await existing.delete();

    if (total <= 0) return;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `Tap Reduction (−${total} Max HP)`,
      img: "icons/magic/death/skull-energy-blue.webp",
      changes: [
        { key: "system.health.bonus", mode: 2, value: `-${total}` }
      ],
      disabled: false,
      transfer: false,
      flags: {
        [MODULE_ID]: { [FLAG_AE]: true, sorcererTapReduction: total }
      }
    }]);
  },

  /**
   * Sheet button injection on the Tap feature row.
   * Mirrors Revelator Lay on Hands pattern: walk feature headers, find by
   * name "Tap", inject a button into the accordion content area.
   */
  _injectSheetButton(app, html) {
    const actor = app.actor || app.document;
    if (!actor || actor.type !== "character") return;
    if (!hasFeature(actor, "sorcerer_tap")) return;

    const el = html instanceof HTMLElement ? html : html?.[0];
    if (!el) return;

    const featureHeaders = el.querySelectorAll(".feature-header");
    for (const header of featureHeaders) {
      const nameEl = header.querySelector(".feature-name");
      if (!nameEl || nameEl.textContent.trim() !== "Tap") continue;

      const featureLi = header.closest(".feature");
      if (!featureLi) continue;

      // Avoid double-injection.
      if (featureLi.querySelector(`.${MODULE_ID}-tap-btn`)) return;

      const accordion = featureLi.querySelector(".accordion-content, .feature-description, .feature-content");
      const targetParent = accordion || featureLi;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${MODULE_ID}-tap-btn`;
      btn.textContent = "Tap";
      btn.style.marginTop = "0.5em";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.openDialog(actor);
      });

      targetParent.appendChild(btn);
      break;
    }
  },

  /**
   * Inject a "[Tap]" link into the cast dialog header so the player can
   * sacrifice HP inline before resolving the cast.
   *
   * The system's cast dialog is part of the spell-card popout; we look for
   * the `.spell-cast-dialog` / `.spell-cast` container in the rendered
   * application body. If not found, we no-op (the sheet button is the
   * primary entry point regardless).
   */
  _injectCastDialogLink(app, html) {
    const actor = app.actor || app.document;
    if (!actor || actor.type !== "character") return;
    if (!hasFeature(actor, "sorcerer_tap")) return;

    const el = html instanceof HTMLElement ? html : html?.[0];
    if (!el) return;

    // Look for typical cast dialog containers. The system uses ApplicationV2
    // for spell handling; the actual selector is fragile, so we fall back
    // gracefully if not present.
    const castContainers = el.querySelectorAll(".spell-cast-dialog, .cast-dialog, .spell-handler__cast");
    for (const container of castContainers) {
      if (container.querySelector(`.${MODULE_ID}-tap-link`)) continue;

      const link = document.createElement("a");
      link.className = `${MODULE_ID}-tap-link`;
      link.href = "#";
      link.textContent = "[Tap]";
      link.title = "Sacrifice HP for Mana before casting";
      link.style.marginLeft = "0.5em";
      link.style.fontSize = "0.85em";
      link.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.openDialog(actor);
      });

      // Append to the first heading we find inside, else the container itself.
      const heading = container.querySelector("h1, h2, h3, .header, .title");
      (heading || container).appendChild(link);
    }
  },

  /**
   * Reset Tap on rest. The detection lives in the createChatMessage hook
   * registered in registerHooks; this is the actual reset action.
   */
  async _resetOnRest(actor) {
    const reduction = this.getCurrentReduction(actor);
    if (reduction === 0) return;
    await this.clearTap(actor);
    log("SorcererTap", `${actor.name}: rest detected — Tap reduction cleared.`);
  }
};
