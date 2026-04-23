/**
 * CorpsePicker — pick a defeated non-Undead, non-Artificial creature to raise.
 *
 * Used by the Raise spell and Reanimator perk. Finds candidates in two ways:
 *   1. Tokens marked "dead" on the active scene (defeated combatants,
 *      HP <= 0 NPCs, or tokens with the dead status effect)
 *   2. Fallback: pick any eligible creature from a compendium pool
 *      (caster hasn't actually seen a specific corpse — GM adjudication)
 *
 * Filters:
 *   - Excludes Artificial and Undead being types (per rulebook)
 *   - Enforces maxHD (spell level / perk level cap)
 *   - Player picks one or more (single-select for Reanimator, multi for Raise)
 */

import { MODULE_ID, log } from "../utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const EXCLUDED_TYPES = ["artificial", "undead", "construct", "object"];

class CorpsePickerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(opts, resolve) {
    super({
      id: `vce-corpse-picker-${foundry.utils.randomID()}`,
      window: { title: opts.title ?? "Select a Corpse" },
      position: { width: 520, height: 600 },
      classes: ["vce-corpse-picker-app"],
    });
    this._opts = opts;
    this._resolve = resolve;
    this._selected = new Set(); // uuids
    this._closedWithoutSelect = true;
  }

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/corpse-picker.hbs` },
  };

  async _prepareContext() {
    const corpses = await this._gatherCorpses();
    return {
      corpses,
      budgetLabel: this._opts.maxHD ? `Budget: HD ≤ ${this._opts.maxHD}` : "",
      multi: !!this._opts.multi,
      hintText: this._opts.multi
        ? "Click to toggle selection. HD budget is cumulative."
        : "Click a corpse to raise it.",
    };
  }

  /**
   * Collect corpse candidates: dead tokens on the active scene + recently-
   * defeated combatants across all scenes. De-dupe by world actor id.
   */
  async _gatherCorpses() {
    const out = [];
    const seen = new Set();
    const scene = game.scenes.active;

    const addFromActor = (actor, sourceLabel, tokenId = null) => {
      if (!actor) return;
      if (seen.has(actor.id)) return;
      if (actor.type !== "npc") return;
      if (!this._matches(actor)) return;
      seen.add(actor.id);
      out.push({
        uuid: actor.uuid,
        actorId: actor.id,
        tokenId,
        name: actor.name,
        img: actor.img ?? "icons/svg/mystery-man.svg",
        hd: actor.system?.hd ?? 0,
        size: actor.system?.size ?? "medium",
        beingType: actor.system?.beingType ?? "—",
        sourceLabel,
      });
    };

    // Scene tokens — defeated in combat, HP <= 0, or with "dead" status
    if (scene) {
      for (const tok of scene.tokens) {
        const actor = tok.actor;
        if (!actor) continue;
        const hp = actor.system?.health?.value ?? 1;
        const isDead = hp <= 0
          || actor.statuses?.has?.("dead")
          || tok.getFlag("core", "defeated");
        if (!isDead) continue;
        addFromActor(actor, "On Scene (Defeated)", tok.id);
      }
    }

    // Defeated combatants (if combat active) — catches tokens on other scenes
    if (game.combat) {
      for (const combatant of game.combat.combatants) {
        if (!combatant.defeated) continue;
        addFromActor(combatant.actor, "Defeated Combatant");
      }
    }

    // Fallback pool: if caller specified a compendium pack and gave permission,
    // include eligible creatures so the picker isn't empty in a fresh session.
    if (this._opts.fallbackPack) {
      const pack = game.packs.get(this._opts.fallbackPack);
      if (pack) {
        const idx = await pack.getIndex({ fields: ["system.beingType", "system.hd", "system.size"] });
        for (const entry of idx.values()) {
          if (entry.type !== "npc") continue;
          if (seen.has(entry._id)) continue;
          if (!this._matchesEntry(entry)) continue;
          seen.add(entry._id);
          out.push({
            uuid: entry.uuid,
            actorId: null,
            tokenId: null,
            name: entry.name,
            img: entry.img ?? "icons/svg/mystery-man.svg",
            hd: entry.system?.hd ?? 0,
            size: entry.system?.size ?? "medium",
            beingType: entry.system?.beingType ?? "—",
            sourceLabel: pack.metadata.label ?? "Compendium",
          });
        }
      }
    }

    out.sort((a, b) => (a.hd - b.hd) || a.name.localeCompare(b.name));
    return out;
  }

  _matches(actor) {
    const beingType = (actor.system?.beingType ?? "").toLowerCase();
    if (EXCLUDED_TYPES.some(t => beingType.includes(t))) return false;
    if (typeof this._opts.maxHD === "number") {
      const hd = actor.system?.hd ?? 0;
      if (hd > this._opts.maxHD) return false;
    }
    return true;
  }

  _matchesEntry(entry) {
    const beingType = (entry.system?.beingType ?? "").toLowerCase();
    if (EXCLUDED_TYPES.some(t => beingType.includes(t))) return false;
    if (typeof this._opts.maxHD === "number") {
      const hd = entry.system?.hd ?? 0;
      if (hd > this._opts.maxHD) return false;
    }
    return true;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    // Row click
    root.querySelectorAll(".vce-cp-row").forEach(row => {
      row.addEventListener("click", () => {
        const uuid = row.dataset.uuid;
        if (this._opts.multi) {
          if (this._selected.has(uuid)) {
            this._selected.delete(uuid);
            row.classList.remove("selected");
          } else {
            const hd = parseInt(row.dataset.hd) || 0;
            const used = this._cumulativeHD() + hd;
            if (typeof this._opts.maxHD === "number" && used > this._opts.maxHD) {
              ui.notifications.warn(`HD budget exceeded (${used} / ${this._opts.maxHD}).`);
              return;
            }
            this._selected.add(uuid);
            row.classList.add("selected");
          }
          this._updateBudget();
        } else {
          const name = row.querySelector(".vce-cp-name")?.textContent ?? "Unknown";
          this._closedWithoutSelect = false;
          this._resolve([{ uuid, name }]);
          this.close();
        }
      });
    });

    // Confirm button (multi-select mode only)
    root.querySelector('[data-action="confirm"]')?.addEventListener("click", () => {
      if (!this._selected.size) {
        ui.notifications.warn("Select at least one corpse.");
        return;
      }
      const picks = [...this._selected].map(uuid => {
        const row = root.querySelector(`.vce-cp-row[data-uuid="${uuid}"]`);
        return { uuid, name: row?.querySelector(".vce-cp-name")?.textContent ?? "Unknown" };
      });
      this._closedWithoutSelect = false;
      this._resolve(picks);
      this.close();
    });

    // Cancel button
    root.querySelector('[data-action="cancel"]')?.addEventListener("click", () => this.close());
  }

  _cumulativeHD() {
    const root = this.element;
    let sum = 0;
    for (const uuid of this._selected) {
      const row = root.querySelector(`.vce-cp-row[data-uuid="${uuid}"]`);
      sum += parseInt(row?.dataset.hd) || 0;
    }
    return sum;
  }

  _updateBudget() {
    const root = this.element;
    const label = root.querySelector(".vce-cp-budget-used");
    if (label) label.textContent = String(this._cumulativeHD());
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
 * @param {number} [opts.maxHD] - cumulative HD budget
 * @param {boolean} [opts.multi] - allow multi-select (Raise) vs single (Reanimator)
 * @param {string} [opts.fallbackPack] - compendium id to include as fallback
 * @returns {Promise<Array<{uuid, name}> | null>}
 */
export const CorpsePicker = {
  async pick(opts = {}) {
    return new Promise((resolve) => {
      const dlg = new CorpsePickerDialog(opts, resolve);
      dlg.render(true);
    });
  }
};
