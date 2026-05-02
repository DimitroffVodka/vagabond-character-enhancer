/**
 * Encumbrance Manager
 *
 * Reactively maintains the "Encumbered" status icon on PCs whose
 * occupied inventory slots exceed max. Setting-gated by
 * `homebrewEncumbranceSpeedPenalty` (world, default off).
 *
 * The mechanical penalty (-5 ft base speed per slot over) lives in the
 * prepareDerivedData patch in vagabond-character-enhancer.mjs. This
 * file owns ONLY the visual icon — applied via a managed AE with
 * statuses: ["encumbered"] so Foundry renders it on the token effect
 * bar and the sheet's status row.
 *
 * Pattern mirrors FeatureDetector: per-actor debounce, GM-only writes,
 * idempotent refresh. Hooks watch inventory items and fatigue updates;
 * a sweep is also exposed for setting-toggle and ready-time bootstrap.
 */

import { MODULE_ID, log } from "../utils.mjs";

const ENCUMBERED_AE_FLAG = "encumberedAE";
const STATUS_ID = "encumbered";

/**
 * Quantity-aware occupied-slot count.
 *
 * The Vagabond system's `system.inventory.occupiedSlots` does NOT multiply by
 * `system.quantity` — a Battleaxe with `quantity: 2, slots: 2` only contributes
 * 2 slots, not 4. The rulebook (and the inventory grid's "×N" stack badge)
 * imply each instance occupies its full slot footprint, so we recompute here
 * by summing `slots × quantity` per item. Mirrors the system's filtering
 * (skip non-inventory types, items inside containers, slot-0 items).
 *
 * @param {Actor} actor
 * @returns {number}
 */
export function computeQuantityAwareOccupiedSlots(actor) {
  let total = 0;
  for (const item of actor?.items ?? []) {
    if (!["equipment", "weapon", "armor", "gear", "container"].includes(item.type)) continue;
    if (item.system?.containerId) continue;
    const itemSlots = item.system?.slots || item.system?.baseSlots || 0;
    if (itemSlots <= 0) continue;
    const quantity = item.system?.quantity ?? 1;
    total += itemSlots * quantity;
  }
  return total;
}

export const EncumbranceManager = {
  _debounceTimers: new Map(),

  init() {
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type !== "character") return;
      // Only react to changes that can flip slot delta:
      // - fatigue (reduces maxSlots)
      // - might (changes baseMaxSlots)
      const fatigueChanged = foundry.utils.hasProperty(changes, "system.fatigue");
      const mightChanged   = foundry.utils.hasProperty(changes, "system.attributes.might");
      if (!fatigueChanged && !mightChanged) return;
      this._debounce(actor);
    });

    Hooks.on("createItem", (item) => {
      if (item.actor?.type === "character") this._debounce(item.actor);
    });
    Hooks.on("updateItem", (item, changes) => {
      if (item.actor?.type !== "character") return;
      // Only debounce if a change could affect slot count
      if (foundry.utils.hasProperty(changes, "system.slots") ||
          foundry.utils.hasProperty(changes, "system.baseSlots") ||
          foundry.utils.hasProperty(changes, "system.quantity") ||
          foundry.utils.hasProperty(changes, "system.equipped")) {
        this._debounce(item.actor);
      }
    });
    Hooks.on("deleteItem", (item) => {
      if (item.actor?.type === "character") this._debounce(item.actor);
    });

    log("EncumbranceManager", "Hooks registered.");
  },

  _debounce(actor) {
    if (this._debounceTimers.has(actor.id)) {
      clearTimeout(this._debounceTimers.get(actor.id));
    }
    this._debounceTimers.set(actor.id, setTimeout(() => {
      this._debounceTimers.delete(actor.id);
      this.refresh(actor).catch(e => log("EncumbranceManager", `Refresh failed for ${actor?.name}: ${e.message}`));
    }, 100));
  },

  /**
   * Compute the current encumbered state and create/delete the managed AE
   * to match. GM-only — non-GM clients no-op (the GM's refresh call writes
   * for everyone via the world database).
   */
  async refresh(actor) {
    if (!game.user.isGM) return;
    if (actor.type !== "character") return;

    const enabled = game.settings.get(MODULE_ID, "homebrewEncumbranceSpeedPenalty");
    const occupied = computeQuantityAwareOccupiedSlots(actor);
    const max = actor.system.inventory?.maxSlots ?? 0;
    const over = enabled ? Math.max(0, occupied - max) : 0;
    const wantStatus = over > 0;

    const existingAE = actor.effects.find(e =>
      e.getFlag(MODULE_ID, ENCUMBERED_AE_FLAG) === true
    );

    if (wantStatus && !existingAE) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: game.i18n.localize("VCE.Status.Encumbered"),
        img: "icons/svg/anchor.svg",
        statuses: [STATUS_ID],
        changes: [],
        disabled: false,
        transfer: false,
        flags: {
          [MODULE_ID]: {
            [ENCUMBERED_AE_FLAG]: true,
          },
        },
      }]);
      log("EncumbranceManager", `${actor.name}: encumbered ON (${over} slots over)`);
    } else if (!wantStatus && existingAE) {
      await existingAE.delete();
      log("EncumbranceManager", `${actor.name}: encumbered OFF`);
    }
  },

  /**
   * Refresh + re-derive every PC. Called on world ready and on setting
   * toggle.
   */
  async sweepAll() {
    if (!game.user.isGM) return;
    for (const actor of game.actors) {
      if (actor.type !== "character") continue;
      try { await this.refresh(actor); }
      catch (e) { log("EncumbranceManager", `Refresh failed for ${actor.name}: ${e.message}`); }
      try { actor.prepareData(); } catch (e) { /* non-fatal */ }
    }
    log("EncumbranceManager", `Sweep complete (${game.actors.filter(a => a.type === "character").length} PCs)`);
  },
};
