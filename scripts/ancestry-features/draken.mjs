/**
 * Draken Ancestry Traits
 * Registry entries for all Draken traits.
 * Type: Cryptid | Size: Medium
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Trait Registry                              */
/* -------------------------------------------- */

export const DRAKEN_TRAITS = {
  // Breath Attack
  // You can attack with an Endure or Will Save to make a 15' Cone of draconic
  // breath that deals 2d6!. Afterward, you can't use this Ability until you Rest
  // or take 1 Fatigue to do so again.
  "breath attack": {
    ancestry: "draken",
    flag: "draken_breathAttack",
    description: "Endure or Will Save to make a 15' Cone dealing 2d6! draconic breath. Recharges on Rest or 1 Fatigue."
  },

  // Scale
  // You have a +1 bonus to Armor Rating.
  "scale": {
    ancestry: "draken",
    flag: "draken_scale",
    description: "You have a +1 bonus to Armor Rating."
  },

  // Draconic Resilience
  // You take half damage from a source of your choice from either Acid, Cold,
  // Fire, or Shock.
  "draconic resilience": {
    ancestry: "draken",
    flag: "draken_draconicResilience",
    status: "module",
    description: "You take half damage from a chosen source: Acid, Cold, Fire, or Shock."
  }
};

/* -------------------------------------------- */
/*  Draconic Resilience — Choice + Halving      */
/* -------------------------------------------- */

const RESILIENCE_TYPES = ["acid", "cold", "fire", "shock"];
const FLAG_RESILIENCE_TYPE = "draken_draconicResilienceType";
const AE_FLAG_KEY = "draconicResilienceAE";
const RESILIENCE_ICON = "icons/magic/defensive/shield-barrier-deflect-gold.webp";

export const DrakenFeatures = {

  registerHooks() {
    // On postScan, auto-prompt if Draken has resilience but no choice stored,
    // and sync the display AE to match the current choice.
    Hooks.on(`${MODULE_ID}.postScan`, (actor, features) => {
      if (!features?.draken_draconicResilience) return;
      const choice = actor.getFlag(MODULE_ID, FLAG_RESILIENCE_TYPE);
      if (!choice) {
        this.promptResilienceChoice(actor);
      } else {
        this._syncResilienceAE(actor, choice);
      }
    });
  },

  /**
   * Show a dialog for the player to pick their Draconic Resilience damage type.
   * @param {Actor} actor
   * @returns {Promise<string|null>} The chosen type, or null if cancelled.
   */
  async promptResilienceChoice(actor) {
    const current = actor.getFlag(MODULE_ID, FLAG_RESILIENCE_TYPE);

    const content = `
      <p>Choose the damage type for <strong>Draconic Resilience</strong>:</p>
      <p style="font-size: 0.85em; opacity: 0.8;">You take half damage from this source (applied after saves, before armor).</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px;">
        ${RESILIENCE_TYPES.map(t => {
          const active = t === current ? ' style="border: 2px solid #ff6400; font-weight: bold;"' : '';
          const label = t.charAt(0).toUpperCase() + t.slice(1);
          return `<button type="button" class="vce-resilience-btn" data-type="${t}"${active}>${label}</button>`;
        }).join("")}
      </div>
    `;

    return new Promise((resolve) => {
      const d = new Dialog({
        title: `${actor.name} — Draconic Resilience`,
        content,
        buttons: {
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
        },
        default: "cancel",
        render: (html) => {
          html.find(".vce-resilience-btn").on("click", async (ev) => {
            const type = ev.currentTarget.dataset.type;
            await actor.setFlag(MODULE_ID, FLAG_RESILIENCE_TYPE, type);
            const label = type.charAt(0).toUpperCase() + type.slice(1);
            log("Draken", `${actor.name} chose Draconic Resilience: ${label}`);
            ui.notifications.info(`${actor.name}: Draconic Resilience set to ${label}`);
            await this._syncResilienceAE(actor, type);
            d.close();
            resolve(type);
          });
        },
        close: () => resolve(null)
      }, { width: 320 });
      d.render(true);
    });
  },

  /**
   * Get the stored resilience type for an actor.
   * @param {Actor} actor
   * @returns {string|null}
   */
  getResilienceType(actor) {
    return actor?.getFlag(MODULE_ID, FLAG_RESILIENCE_TYPE) ?? null;
  },

  /**
   * Create or update the display Active Effect showing the chosen resilience type.
   * The AE is informational only (no changes array) — it just shows in the effects
   * panel so players/GMs can see at a glance what damage type is resisted.
   * @param {Actor} actor
   * @param {string} type - The chosen damage type (acid/cold/fire/shock)
   */
  async _syncResilienceAE(actor, type) {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    const aeName = `Draconic Resilience (${label})`;

    // Find existing managed AE
    const existing = actor.effects.find(e => e.getFlag(MODULE_ID, AE_FLAG_KEY));

    if (existing) {
      // Update name if type changed
      if (existing.name !== aeName) {
        await existing.update({ name: aeName });
        log("Draken", `Updated resilience AE on ${actor.name}: ${aeName}`);
      }
    } else {
      // Create new display AE
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: aeName,
        icon: RESILIENCE_ICON,
        origin: `${MODULE_ID}.draken_draconicResilience`,
        changes: [],
        disabled: false,
        transfer: true,
        flags: {
          [MODULE_ID]: {
            managed: true,
            featureFlag: "draken_draconicResilience",
            [AE_FLAG_KEY]: true
          }
        }
      }]);
      log("Draken", `Created resilience AE on ${actor.name}: ${aeName}`);
    }
  }
};
