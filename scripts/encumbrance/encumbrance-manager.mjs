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
 * Effective occupied-slot count matching the Vagabond rulebook + the
 * vagabond-crawler module's slot display.
 *
 * The Vagabond system's `system.inventory.occupiedSlots` does NOT account for:
 *   1. Item quantity — a Battleaxe with `quantity: 2, slots: 2` is counted
 *      as 2 slots, not 4. We recompute as `slots × quantity` per item.
 *   2. Zero-slot pooling — small items with `slots: 0` (rations, scrolls,
 *      coins, etc.) are weightless individually but the rulebook still
 *      wants them to take up some space in bulk. Group by `gearCategory`
 *      (or item name when no category is set) and add `ceil(total / 10)`
 *      slots per group.
 *
 * The vagabond-crawler module post-processes the sheet's `.slot-value`
 * display with the same formula. We mirror it here so the encumbrance
 * speed penalty fires when the displayed slot count crosses the cap,
 * regardless of whether the user has the crawler installed.
 *
 * Items can opt out of the zero-slot pool via the `trueZeroSlot` flag
 * (set on the item, namespaced to vagabond-crawler).
 *
 * Algorithm reference: `modules/vagabond-crawler/scripts/vagabond-crawler.mjs`
 * — `_patchInventory` function.
 *
 * @param {Actor} actor
 * @returns {number}
 */
export function computeQuantityAwareOccupiedSlots(actor) {
  let total = 0;
  const zeroSlotGroups = new Map();

  for (const item of actor?.items ?? []) {
    if (!["equipment", "weapon", "armor", "gear", "container"].includes(item.type)) continue;
    if (item.system?.containerId) continue;

    const itemSlots = item.system?.slots || item.system?.baseSlots || 0;
    const quantity = item.system?.quantity ?? 1;
    if (quantity <= 0) continue;

    if (itemSlots > 0) {
      total += itemSlots * quantity;
    } else {
      // Zero-slot item: pool by gearCategory (or name if no category)
      // unless flagged as trueZeroSlot (opt-out, set by crawler module).
      if (item.getFlag?.("vagabond-crawler", "trueZeroSlot")) continue;
      const group = item.system?.gearCategory || item.name;
      zeroSlotGroups.set(group, (zeroSlotGroups.get(group) ?? 0) + quantity);
    }
  }

  // Each zero-slot group contributes ceil(total / 10) slots.
  for (const groupTotal of zeroSlotGroups.values()) {
    total += Math.ceil(groupTotal / 10);
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
   * Compute the current encumbered state and reconcile actor + sheet:
   *   - GM clients: create/delete the managed encumbered AE so the icon
   *     reflects current slot delta.
   *   - All clients: force a local sheet re-render so the slot-count
   *     header and overload-warning panel catch up to current actor data.
   *
   * The sheet re-render is a workaround for a Vagabond v5.3.0 character-sheet
   * caching bug — the slot field doesn't refresh on every item update, so
   * the displayed `{{system.inventory.occupiedSlots}} / {{maxSlots}}` can
   * lag what the patch is actually reading. Re-rendering on every refresh
   * keeps the visible numbers in sync with reality.
   */
  async refresh(actor) {
    if (actor.type !== "character") return;

    // GM-only: actor-data writes for the encumbered AE
    if (game.user.isGM) {
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
    }

    // Per-client: force a local sheet re-render so the slot-count display
    // catches up. This runs on EVERY connected client (GM and players),
    // each flushing their own open sheet view of this actor.
    if (actor.sheet?.rendered) {
      try { actor.sheet.render(true); } catch (e) { /* non-fatal */ }
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
