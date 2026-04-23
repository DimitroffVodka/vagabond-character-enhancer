/**
 * CreaturePicker — shared creature-selection dialog.
 *
 * Replaces inline picker code duplicated in summoner.mjs + familiar.mjs.
 * Takes a filter config, returns { uuid, name } promise.
 *
 * Data path notes (verified against existing summoner.mjs + familiar.mjs):
 *   - Being/type field: actor.system.beingType   (NOT actor.system.type or category)
 *   - HD field:         actor.system.hd           (NOT actor.system.hitDice.value)
 *   - Size field:       actor.system.size
 * The plan skeleton had `actor.system?.hitDice?.value ?? actor.system?.hd` for HD —
 * reversed here to prefer actor.system.hd since that is what the Vagabond system uses.
 */

import { MODULE_ID, log } from "../utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class CreaturePickerDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {object} filter - Combined filter + title options
   * @param {Function} resolve - Promise resolver
   */
  constructor(filter, resolve) {
    super({
      id: `vce-creature-picker-${foundry.utils.randomID()}`,
      window: { title: filter.title ?? "Select a Creature" },
      position: { width: 420, height: 540 },
      classes: ["vce-creature-picker-app"],
    });
    this._filter = filter;
    this._resolve = resolve;
    this._closedWithoutSelect = true;
  }

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/creature-picker.hbs` },
  };

  async _prepareContext() {
    const creatures = await this._gatherCandidates();
    return { creatures };
  }

  /**
   * Gather and filter creature candidates from world NPCs and/or a compendium pack.
   * @returns {Promise<object[]>} Sorted list of row data objects
   */
  async _gatherCandidates() {
    const { types = [], sizes = [], maxHD, pack, customFilter } = this._filter;
    const out = [];
    const seen = new Set();

    // World NPC actors
    for (const actor of game.actors.filter(a => a.type === "npc")) {
      if (!this._matches(actor, { types, sizes, maxHD, customFilter })) continue;
      out.push(this._toRow(actor, "World"));
      seen.add(actor.name);
    }

    // Compendium pack (if specified)
    if (pack) {
      const compendium = game.packs.get(pack);
      if (compendium) {
        // Use getIndex with explicit fields for performance (avoids full document load)
        const index = await compendium.getIndex({ fields: [
          "system.beingType", "system.hd", "system.size"
        ]});
        for (const entry of index.values()) {
          if (seen.has(entry.name)) continue; // world actors take precedence
          if (entry.type !== "npc") continue;
          if (!this._matchesEntry(entry, { types, sizes, maxHD, customFilter })) continue;
          out.push({
            uuid: entry.uuid,
            name: entry.name,
            img: entry.img ?? "icons/svg/mystery-man.svg",
            hd: entry.system?.hd ?? 1,
            size: entry.system?.size ?? "medium",
            sourceLabel: compendium.metadata.label ?? pack,
          });
        }
      }
    }

    // Sort: HD ascending, then name
    out.sort((a, b) => (a.hd - b.hd) || a.name.localeCompare(b.name));
    log("CreaturePicker", `Gathered ${out.length} candidates.`);
    return out;
  }

  /**
   * Test a full Actor document against the filter.
   * Uses actor.system.hd (the Vagabond system field — NOT hitDice.value).
   * @param {Actor} actor
   * @param {object} filter
   * @returns {boolean}
   */
  _matches(actor, { types, sizes, maxHD, customFilter }) {
    if (types.length) {
      const beingType = (actor.system?.beingType ?? "").toLowerCase();
      if (!types.some(t => beingType.includes(t.toLowerCase()))) return false;
    }
    if (sizes.length) {
      const size = (actor.system?.size ?? "").toLowerCase();
      if (!sizes.some(s => s.toLowerCase() === size)) return false;
    }
    if (typeof maxHD === "number") {
      // actor.system.hd is the Vagabond system field (confirmed in summoner.mjs + familiar.mjs)
      const hd = actor.system?.hd ?? 0;
      if (hd > maxHD) return false;
    }
    if (typeof customFilter === "function" && !customFilter(actor)) return false;
    return true;
  }

  /**
   * Test a compendium index entry against the filter.
   * Index entries are plain objects (not Actor instances), so customFilter is skipped.
   * @param {object} entry - Compendium index entry
   * @param {object} filter
   * @returns {boolean}
   */
  _matchesEntry(entry, { types, sizes, maxHD }) {
    if (types.length) {
      const beingType = (entry.system?.beingType ?? "").toLowerCase();
      if (!types.some(t => beingType.includes(t.toLowerCase()))) return false;
    }
    if (sizes.length) {
      const size = (entry.system?.size ?? "").toLowerCase();
      if (!sizes.some(s => s.toLowerCase() === size)) return false;
    }
    if (typeof maxHD === "number") {
      const hd = entry.system?.hd ?? 0;
      if (hd > maxHD) return false;
    }
    return true;
  }

  /**
   * Convert a full Actor document into a template row object.
   * @param {Actor} actor
   * @param {string} sourceLabel - e.g. "World" or compendium label
   * @returns {object}
   */
  _toRow(actor, sourceLabel) {
    return {
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img ?? "icons/svg/mystery-man.svg",
      hd: actor.system?.hd ?? 0,
      size: actor.system?.size ?? "medium",
      sourceLabel,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    // Row click → resolve and close
    root.querySelectorAll(".vce-cp-row").forEach(row => {
      row.addEventListener("click", () => {
        const uuid = row.dataset.uuid;
        const name = row.querySelector(".vce-cp-name")?.textContent ?? "Unknown";
        this._closedWithoutSelect = false;
        this._resolve({ uuid, name });
        this.close();
      });

      // Keyboard: Enter / Space activates the row
      row.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          row.click();
        }
      });
    });

    // Live search filter
    const search = root.querySelector(".vce-cp-search");
    if (search) {
      search.addEventListener("input", (ev) => {
        const q = ev.target.value.toLowerCase();
        root.querySelectorAll(".vce-cp-row").forEach(row => {
          const name = row.querySelector(".vce-cp-name")?.textContent.toLowerCase() ?? "";
          row.style.display = name.includes(q) ? "" : "none";
        });
      });
      // Auto-focus search input
      setTimeout(() => search.focus(), 50);
    }

    // Cancel button
    root.querySelector('[data-action="cancel"]')?.addEventListener("click", () => this.close());
  }

  /**
   * Override close to resolve null if user closed without selecting.
   */
  async close(options) {
    if (this._closedWithoutSelect) this._resolve(null);
    return super.close(options);
  }
}

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

/**
 * Shared creature-selection dialog.
 *
 * @example
 * const result = await CreaturePicker.pick({
 *   title: "Select a Beast",
 *   filter: { types: ["beast"], maxHD: 2 }
 * });
 * // result → { uuid, name } | null
 */
export const CreaturePicker = {
  /**
   * Open the picker dialog.
   * @param {object} opts
   * @param {string} [opts.title]      - Window title
   * @param {object} opts.filter       - Filter config
   * @param {string[]} [opts.filter.types]       - beingType substrings to include (empty = all)
   * @param {string[]} [opts.filter.sizes]       - Exact size strings to include (empty = all)
   * @param {number}   [opts.filter.maxHD]       - Maximum HD (inclusive)
   * @param {string}   [opts.filter.pack]        - Compendium pack id to search (e.g. "vagabond.bestiary")
   * @param {Function} [opts.filter.customFilter] - (actor) => boolean predicate for world actors
   * @returns {Promise<{uuid: string, name: string} | null>}
   */
  async pick(opts = {}) {
    return new Promise((resolve) => {
      const dialog = new CreaturePickerDialog(
        { ...opts.filter, title: opts.title },
        resolve
      );
      dialog.render(true);
    });
  }
};
