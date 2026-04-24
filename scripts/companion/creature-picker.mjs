/**
 * CreaturePicker — shared rich creature-selection dialog.
 *
 * Loads candidates from:
 *   1. World NPC actors
 *   2. One or more compendium packs (default: `vagabond.bestiary`)
 *      — callers can override via filter.packs[] or filter.pack
 *
 * Rich table format: portrait, name, HD, type, armor, speed (+ fly/swim/climb),
 * actions preview. Supports favorites via `filter.favoritesFlag` — a flag key
 * on the caster holding an array of favorite creature names; right-click a row
 * to toggle favorite, favorited rows sort first and get a gold star.
 *
 * Replaces the earlier minimal CreaturePicker. Used by Beast spell, Animal
 * Companion perk, and (as a fallback source) Raise/Reanimator via CorpsePicker.
 */

import { MODULE_ID, log } from "../utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class CreaturePickerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(opts, resolve) {
    super({
      id: `vce-creature-picker-${foundry.utils.randomID()}`,
      window: { title: opts.title ?? "Select a Creature" },
      position: { width: 720, height: 560 },
      classes: ["vce-creature-picker-app"],
    });
    this._opts = opts;
    this._resolve = resolve;
    this._closedWithoutSelect = true;
    // Multi-select state: each entry is { uuid, name, hd }
    this._picks = [];
  }

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/creature-picker.hbs` },
  };

  async _prepareContext() {
    const creatures = await this._gatherCandidates();
    const favorites = this._getFavorites();
    // Sort: favorites first, then HD asc, then name
    creatures.sort((a, b) => {
      const aFav = favorites.includes(a.name);
      const bFav = favorites.includes(b.name);
      if (aFav !== bFav) return aFav ? -1 : 1;
      return (a.hd - b.hd) || a.name.localeCompare(b.name);
    });
    for (const c of creatures) c.isFavorite = favorites.includes(c.name);

    return {
      creatures,
      hasFavorites: !!this._opts.favoritesFlag,
      multi: !!this._opts.multi,
      maxHDLabel: this._opts.filter?.maxHD != null ? `Max HD: ${this._opts.filter.maxHD}` : "",
      showSearch: creatures.length > 5,
    };
  }

  _getFavorites() {
    const flag = this._opts.favoritesFlag;
    if (!flag || !this._opts.caster) return [];
    return this._opts.caster.getFlag(MODULE_ID, flag) ?? [];
  }

  async _gatherCandidates() {
    const { types = [], sizes = [], maxHD, customFilter } = this._opts.filter ?? {};
    const packs = this._opts.filter?.packs
      ?? (this._opts.filter?.pack ? [this._opts.filter.pack] : ["vagabond.bestiary"]);
    // Default: compendium only. World-actor NPCs often pollute the list
    // (e.g. a GM-created Bat in the world sidebar becomes a shared world
    // actor across all Beast summons, which breaks flag isolation). Callers
    // can opt back in with includeWorldActors: true — we'll revisit this when
    // the "custom creatures" feature is scoped.
    const includeWorldActors = this._opts.filter?.includeWorldActors === true;

    const out = [];
    const seen = new Set();

    // 1) World NPC actors (opt-in only)
    if (includeWorldActors) {
      for (const actor of game.actors.filter(a => a.type === "npc")) {
        if (!this._matchesActor(actor, { types, sizes, maxHD, customFilter })) continue;
        if (seen.has(actor.name)) continue;
        seen.add(actor.name);
        out.push(this._rowFromActor(actor, "World"));
      }
    }

    // 2) Compendium packs
    for (const packId of packs) {
      const pack = game.packs.get(packId);
      if (!pack) continue;
      try {
        const index = await pack.getIndex({ fields: [
          "system.beingType", "system.hd", "system.size", "system.armor",
          "system.speed", "system.speedValues",
          "system.actions", "system.abilities", "system.senses",
          "system.immunities", "system.weaknesses",
        ]});
        for (const entry of index.values()) {
          if (entry.type !== "npc") continue;
          if (seen.has(entry.name)) continue;
          if (!this._matchesEntry(entry, { types, sizes, maxHD })) continue;
          seen.add(entry.name);
          out.push(this._rowFromEntry(entry, pack.metadata.label ?? packId));
        }
      } catch (e) {
        log("CreaturePicker", `Could not load pack ${packId}: ${e.message}`);
      }
    }

    return out;
  }

  _matchesActor(actor, { types, sizes, maxHD, customFilter }) {
    const beingType = (actor.system?.beingType ?? "").toLowerCase();
    if (types.length && !types.some(t => beingType.includes(t.toLowerCase()))) return false;
    if (sizes.length) {
      const sz = (actor.system?.size ?? "").toLowerCase();
      if (!sizes.some(s => s.toLowerCase() === sz)) return false;
    }
    if (typeof maxHD === "number" && (actor.system?.hd ?? 0) > maxHD) return false;
    if (typeof customFilter === "function" && !customFilter(actor)) return false;
    return true;
  }

  _matchesEntry(entry, { types, sizes, maxHD }) {
    const beingType = (entry.system?.beingType ?? "").toLowerCase();
    if (types.length && !types.some(t => beingType.includes(t.toLowerCase()))) return false;
    if (sizes.length) {
      const sz = (entry.system?.size ?? "").toLowerCase();
      if (!sizes.some(s => s.toLowerCase() === sz)) return false;
    }
    if (typeof maxHD === "number" && (entry.system?.hd ?? 0) > maxHD) return false;
    return true;
  }

  _rowFromActor(actor, sourceLabel) {
    return this._buildRow({
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      hd: actor.system?.hd ?? 0,
      beingType: actor.system?.beingType ?? "—",
      size: actor.system?.size ?? "medium",
      armor: actor.system?.armor ?? 0,
      speed: actor.system?.speed ?? 30,
      speedValues: actor.system?.speedValues ?? {},
      actions: actor.system?.actions ?? [],
      sourceLabel,
    });
  }

  _rowFromEntry(entry, sourceLabel) {
    return this._buildRow({
      uuid: entry.uuid,
      name: entry.name,
      img: entry.img,
      hd: entry.system?.hd ?? 0,
      beingType: entry.system?.beingType ?? "—",
      size: entry.system?.size ?? "medium",
      armor: entry.system?.armor ?? 0,
      speed: entry.system?.speed ?? 30,
      speedValues: entry.system?.speedValues ?? {},
      actions: entry.system?.actions ?? [],
      sourceLabel,
    });
  }

  _buildRow(r) {
    // Format actions as a concise preview string
    const actionsStr = (r.actions ?? []).map(a => {
      const dmg = a.rollDamage || a.flatDamage || "—";
      return `${a.name}: ${dmg}`;
    }).join("; ");
    // Format speed with extras
    const sv = r.speedValues ?? {};
    const extras = [];
    if (sv.fly)   extras.push(`Fly ${sv.fly}'`);
    if (sv.swim)  extras.push(`Swim ${sv.swim}'`);
    if (sv.climb) extras.push(`Climb ${sv.climb}'`);
    if (sv.cling) extras.push(`Cling ${sv.cling}'`);
    const speedStr = `${r.speed}'` + (extras.length ? ` (${extras.join(", ")})` : "");
    return {
      ...r,
      img: r.img || "icons/svg/mystery-man.svg",
      actionsStr: actionsStr || "—",
      speedStr,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    // Search filter (live)
    const search = root.querySelector(".vce-cp-search");
    search?.addEventListener("input", (ev) => {
      const q = ev.target.value.toLowerCase();
      root.querySelectorAll(".vce-cp-row").forEach(row => {
        const name = row.dataset.name?.toLowerCase() ?? "";
        const bt = row.dataset.beingtype?.toLowerCase() ?? "";
        row.style.display = (name.includes(q) || bt.includes(q)) ? "" : "none";
      });
    });
    if (search) setTimeout(() => search.focus(), 60);

    // Row click — single or multi select. In multi mode, shift-click
    // decrements the count (removes one copy); plain click adds a copy.
    root.querySelectorAll(".vce-cp-row").forEach(row => {
      row.addEventListener("click", (ev) => {
        if (this._opts.multi) {
          if (ev.shiftKey) this._decrementPick(row);
          else this._togglePick(row);
        } else {
          const uuid = row.dataset.uuid;
          const name = row.dataset.name;
          this._closedWithoutSelect = false;
          this._resolve([{ uuid, name }]);
          this.close();
        }
      });
      // Keyboard activation
      row.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); row.click(); }
      });
      // Right-click — toggle favorite (if caller opted in)
      if (this._opts.favoritesFlag && this._opts.caster) {
        row.addEventListener("contextmenu", async (ev) => {
          ev.preventDefault();
          await this._toggleFavorite(row);
        });
      }
    });

    // Multi-select confirm button
    root.querySelector('[data-action="confirm"]')?.addEventListener("click", () => {
      if (!this._picks.length) {
        ui.notifications.warn("Select at least one creature.");
        return;
      }
      this._closedWithoutSelect = false;
      this._resolve(this._picks.map(p => ({ uuid: p.uuid, name: p.name })));
      this.close();
    });

    // Cancel button
    root.querySelector('[data-action="cancel"]')?.addEventListener("click", () => this.close());
  }

  _togglePick(row) {
    // Each click ADDS another copy (up to HD budget). Use the row's "−" button
    // to decrement. Multiple copies of the same creature are legal per rulebook
    // ("One or more Beasts"); this lets a caster summon 2 wolves in one cast.
    const uuid = row.dataset.uuid;
    const name = row.dataset.name;
    const hd = parseInt(row.dataset.hd) || 0;

    const maxHD = this._opts.filter?.maxHD;
    if (typeof maxHD === "number") {
      const used = this._picks.reduce((s, p) => s + p.hd, 0);
      if (used + hd > maxHD) {
        ui.notifications.warn(`HD budget exceeded (${used + hd} / ${maxHD}).`);
        return;
      }
    }
    this._picks.push({ uuid, name, hd });
    row.classList.add("vce-cp-selected");
    this._updateRowCount(row);
    this._updateBudget();
  }

  _decrementPick(row) {
    const uuid = row.dataset.uuid;
    const idx = this._picks.findIndex(p => p.uuid === uuid);
    if (idx < 0) return;
    this._picks.splice(idx, 1);
    if (!this._picks.some(p => p.uuid === uuid)) {
      row.classList.remove("vce-cp-selected");
    }
    this._updateRowCount(row);
    this._updateBudget();
  }

  _updateRowCount(row) {
    const uuid = row.dataset.uuid;
    const count = this._picks.filter(p => p.uuid === uuid).length;
    let badge = row.querySelector(".vce-cp-count");
    if (count > 1) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "vce-cp-count";
        row.querySelector(".vce-cp-info, td:nth-child(3), td:first-of-type")?.appendChild(badge);
      }
      badge.textContent = `×${count}`;
    } else if (badge) {
      badge.remove();
    }
  }

  _updateBudget() {
    const root = this.element;
    const used = this._picks.reduce((s, p) => s + p.hd, 0);
    const label = root.querySelector(".vce-cp-used-hd");
    if (label) label.textContent = String(used);
    const count = root.querySelector(".vce-cp-selected-count");
    if (count) count.textContent = String(this._picks.length);
  }

  async _toggleFavorite(row) {
    const name = row.dataset.name;
    if (!name) return;
    const flag = this._opts.favoritesFlag;
    const caster = this._opts.caster;
    const current = caster.getFlag(MODULE_ID, flag) ?? [];
    const isFav = current.includes(name);
    const next = isFav ? current.filter(n => n !== name) : [...current, name];
    await caster.setFlag(MODULE_ID, flag, next);

    // Toggle star icon
    const star = row.querySelector(".vce-cp-fav");
    if (star) {
      star.innerHTML = isFav
        ? '<i class="far fa-star" style="opacity:0.35;" title="Right-click to favorite"></i>'
        : '<i class="fas fa-star" style="color:#d4a843;" title="Favorited — right-click to unfavorite"></i>';
    }

    // Reorder row
    const tbody = row.parentElement;
    if (!isFav) {
      tbody.insertBefore(row, tbody.firstElementChild);
    } else {
      // Move to top of non-favorites section
      let target = null;
      for (const sib of tbody.children) {
        if (sib === row) continue;
        const sibName = sib.dataset.name;
        if (sibName && !next.includes(sibName)) { target = sib; break; }
      }
      if (target) tbody.insertBefore(row, target);
      else tbody.appendChild(row);
    }

    ui.notifications.info(`${isFav ? "Removed" : "Added"} ${name} ${isFav ? "from" : "to"} favorites.`);
  }

  async close(options) {
    if (this._closedWithoutSelect) this._resolve(null);
    return super.close(options);
  }
}

/**
 * Public API.
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {Actor} [opts.caster] - required if favoritesFlag is set
 * @param {string} [opts.favoritesFlag] - flag key on caster; array of creature names
 * @param {boolean} [opts.multi] - if true, user selects multiple creatures with
 *   HD budget tracking; returns an array of picks on confirm
 * @param {object} opts.filter - { types, sizes, maxHD, pack, packs[], customFilter }
 * @returns {Promise<Array<{uuid: string, name: string}> | null>} array of picks or null on cancel.
 *   Single-select still returns an array of length 1 for API consistency.
 */
export const CreaturePicker = {
  async pick(opts = {}) {
    return new Promise((resolve) => {
      const dlg = new CreaturePickerDialog(opts, resolve);
      dlg.render(true);
    });
  }
};
