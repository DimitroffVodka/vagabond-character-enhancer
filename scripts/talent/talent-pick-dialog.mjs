/**
 * TalentPickDialog — DialogV2-based picker for selecting Talents.
 *
 * Usage:
 *   const result = await TalentPickDialog.show(actor, 3);
 *   // result: [{id, name}, ...] on confirm, null on cancel/close
 *
 * Pattern mirrors creature-picker.mjs: idempotent finish() helper + a
 * Hooks.once("closeDialogV2", ...) fallback so every exit path resolves the
 * promise exactly once.  Do NOT pass close: as a DialogV2 constructor option —
 * that is DialogV1 API and is silently ignored in v13.
 */

import { MODULE_ID } from "../utils.mjs";
import { TALENT_TYPE } from "./talent-data-model.mjs";

export const TalentPickDialog = {
  /**
   * Open the Talent picker for the given actor.
   *
   * @param {Actor}  actor  — the character picking Talents
   * @param {number} count  — how many Talents the player must select
   * @returns {Promise<Array<{id: string, name: string}> | null>}
   *   Resolves with the selected array on confirm, or null on cancel/close.
   */
  async show(actor, count) {
    // Load all Talents from the pack
    const pack = game.packs.get(`${MODULE_ID}.vce-talents`);
    if (!pack) {
      ui.notifications.error(`VCE: Talent compendium (${MODULE_ID}.vce-talents) not found.`);
      return null;
    }

    const allTalents = await pack.getDocuments();

    // Filter out Talents the actor already knows (match by name)
    const knownNames = new Set(
      actor.items.filter(i => i.type === TALENT_TYPE).map(i => i.name)
    );
    const available = allTalents.filter(t => !knownNames.has(t.name));

    if (available.length === 0) {
      ui.notifications.info("No new Talents available to pick.");
      return null;
    }

    return new Promise((resolve) => {
      // Idempotent finish — every exit path calls this; only the first call wins.
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      // Strip HTML + truncate to a one-line excerpt for the picker.
      const excerpt = (html, len = 120) => {
        const text = (html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        return text.length > len ? text.slice(0, len) + "…" : text;
      };

      // Build table rows. Reuses the .vce-cp-* / .vce-bd-* classes from
      // the creature-picker so we inherit sticky header, hover, image sizing.
      const rows = available.map(t => {
        const deliveryStr = (t.system.delivery ?? []).join(", ") || "—";
        const damageStr = t.system.damage || "—";
        const duration = t.system.duration || "instant";
        const isBuff = !!t.system.focusBuffAE;
        const buffBadge = isBuff ? ' <span class="vce-talent-buff-badge" title="Focus buff — no cast">Buff</span>' : "";
        const desc = excerpt(t.system.description);
        return `
          <tr class="vce-cp-row vce-talent-pick-row" data-talent-id="${t.id}" data-talent-name="${foundry.utils.escapeHTML(t.name)}">
            <td class="vce-bd-cell vce-bd-cell-img">
              <img src="${t.img || "icons/svg/item-bag.svg"}" class="vce-bd-beast-img" alt="" />
            </td>
            <td class="vce-bd-cell">
              <div class="vce-tpd-name-line"><strong>${foundry.utils.escapeHTML(t.name)}</strong>${buffBadge}</div>
              ${desc ? `<div class="vce-tpd-desc">${foundry.utils.escapeHTML(desc)}</div>` : ""}
            </td>
            <td class="vce-bd-cell vce-bd-cell-center">${foundry.utils.escapeHTML(damageStr)}</td>
            <td class="vce-bd-cell">${foundry.utils.escapeHTML(deliveryStr)}</td>
            <td class="vce-bd-cell vce-bd-cell-center">${foundry.utils.escapeHTML(duration)}</td>
            <td class="vce-bd-cell vce-bd-cell-center">
              <input type="checkbox" data-pick-id="${t.id}" data-pick-name="${foundry.utils.escapeHTML(t.name)}" />
            </td>
          </tr>`;
      }).join("");

      const pluralS = count !== 1 ? "s" : "";
      const content = `
        <form class="vce-creature-picker vce-talent-pick-dialog">
          <div class="vce-cp-header">
            <p class="vce-cp-budget">
              Pick <strong>${count}</strong> Talent${pluralS}.
              &nbsp; Selected: <span class="vce-tp-count">0</span>/${count}
            </p>
          </div>
          <div class="vce-bd-scroll vce-cp-scroll">
            <table class="vce-bd-table vce-cp-table">
              <thead>
                <tr class="vce-bd-header-row">
                  <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
                  <th class="vce-bd-th" scope="col">Name</th>
                  <th class="vce-bd-th vce-bd-th-center" scope="col">Damage</th>
                  <th class="vce-bd-th" scope="col">Delivery</th>
                  <th class="vce-bd-th vce-bd-th-center" scope="col">Duration</th>
                  <th class="vce-bd-th vce-bd-th-center" scope="col"></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </form>`;

      const dialog = new foundry.applications.api.DialogV2({
        window: {
          title: `${actor.name} — Pick ${count} Talent${pluralS}`,
          resizable: true,
        },
        position: { width: 700, height: 520 },
        classes: ["vce-creature-picker-app"],
        content,
        buttons: [
          {
            action: "confirm",
            label: "Confirm",
            icon: "fas fa-check",
            default: true,
            callback: () => {
              const picked = [];
              dialog.element
                .querySelectorAll("input[data-pick-id]:checked")
                .forEach(cb => picked.push({ id: cb.dataset.pickId, name: cb.dataset.pickName }));

              if (picked.length !== count) {
                ui.notifications.warn(`Select exactly ${count} Talent${pluralS}.`);
                // Throwing prevents DialogV2 from closing
                throw new Error(`vce-talent-pick: need exactly ${count}, got ${picked.length}`);
              }

              finish(picked);
            },
          },
          {
            action: "cancel",
            label: "Cancel",
            icon: "fas fa-times",
            callback: () => finish(null),
          },
        ],
        // rejectClose: false keeps the promise from rejecting when the dialog
        // is dismissed via the X button or Escape.  Our hook fallback then
        // calls finish(null) to resolve cleanly.
        rejectClose: false,
      });

      // Fallback: X button / Escape / external close all fire closeDialogV2.
      // The idempotent finish guard means this is harmless if confirm/cancel
      // already resolved the promise.
      Hooks.once("closeDialogV2", (app) => {
        if (app === dialog) finish(null);
      });

      // Render and wire the live checkbox counter after the DOM is ready.
      dialog.render({ force: true }).then(() => {
        const root = dialog.element;
        if (!root) return;

        const counter = root.querySelector(".vce-tp-count");
        const checkboxes = root.querySelectorAll("input[data-pick-id]");

        const updateCount = () => {
          const checked = root.querySelectorAll("input[data-pick-id]:checked");
          const n = checked.length;

          // Cap: if user checked beyond the limit, force the newest one off
          if (n > count) {
            // The event just fired on whichever box was toggled last —
            // uncheck the last checked box that pushed us over.
            const allChecked = Array.from(checked);
            const last = allChecked[allChecked.length - 1];
            if (last) last.checked = false;
            if (counter) counter.textContent = String(count);
            ui.notifications.warn(`You may only select ${count} Talent${pluralS}.`);
            return;
          }

          if (counter) counter.textContent = String(n);
        };

        checkboxes.forEach(cb => cb.addEventListener("change", updateCount));
      });
    });
  },

  /**
   * Manage (re-pick) the actor's full Talent loadout.
   *
   * Per RAW: downtime study lets a character retrain any choice. This is the
   * in-game UX for that — the dialog lists ALL 14 Talents with the actor's
   * current loadout pre-checked. Confirming saves a diff: delete the talents
   * that were unchecked, create the ones that were newly checked.
   *
   * @param {Actor}  actor    — the Psychic actor
   * @param {number} expected — total Talents the actor should have at this level
   * @returns {Promise<{changed: boolean, added: string[], removed: string[]} | null>}
   */
  async manage(actor, expected) {
    const pack = game.packs.get(`${MODULE_ID}.vce-talents`);
    if (!pack) {
      ui.notifications.error(`VCE: Talent compendium (${MODULE_ID}.vce-talents) not found.`);
      return null;
    }
    const allTalents = await pack.getDocuments();

    // Map currently-known talents by name (talent items on the actor)
    const ownedByName = new Map(
      actor.items.filter(i => i.type === TALENT_TYPE).map(i => [i.name, i])
    );

    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };

      const rows = allTalents.map(t => {
        const isOwned = ownedByName.has(t.name);
        const deliveryStr = (t.system.delivery ?? []).join(", ") || "—";
        const damageStr   = t.system.damage || "—";
        const duration    = t.system.duration || "instant";
        const isBuff      = !!t.system.focusBuffAE;
        const buffBadge   = isBuff ? ' <span class="vce-talent-buff-badge" title="Focus buff">Buff</span>' : "";
        const desc        = (t.system.description ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const descShort   = desc.length > 100 ? desc.slice(0, 100) + "…" : desc;
        return `
          <tr class="vce-cp-row vce-talent-pick-row" data-talent-id="${t.id}" data-talent-name="${foundry.utils.escapeHTML(t.name)}">
            <td class="vce-bd-cell vce-bd-cell-img">
              <img src="${t.img || "icons/svg/item-bag.svg"}" class="vce-bd-beast-img" alt="" />
            </td>
            <td class="vce-bd-cell">
              <div class="vce-tpd-name-line"><strong>${foundry.utils.escapeHTML(t.name)}</strong>${buffBadge}</div>
              ${descShort ? `<div class="vce-tpd-desc">${foundry.utils.escapeHTML(descShort)}</div>` : ""}
            </td>
            <td class="vce-bd-cell vce-bd-cell-center">${foundry.utils.escapeHTML(damageStr)}</td>
            <td class="vce-bd-cell">${foundry.utils.escapeHTML(deliveryStr)}</td>
            <td class="vce-bd-cell vce-bd-cell-center">${foundry.utils.escapeHTML(duration)}</td>
            <td class="vce-bd-cell vce-bd-cell-center">
              <input type="checkbox"
                     data-pick-id="${t.id}"
                     data-pick-name="${foundry.utils.escapeHTML(t.name)}"
                     ${isOwned ? "checked" : ""} />
            </td>
          </tr>`;
      }).join("");

      const initialCount = ownedByName.size;
      const content = `
        <form class="vce-creature-picker vce-talent-pick-dialog">
          <div class="vce-cp-header">
            <p class="vce-cp-budget">
              Manage your Talents. <strong>${expected}</strong> known at this level.
              &nbsp; Selected: <span class="vce-tp-count">${initialCount}</span>/${expected}
              &nbsp;<em>(Downtime study — RAW)</em>
            </p>
          </div>
          <div class="vce-bd-scroll vce-cp-scroll">
            <table class="vce-bd-table vce-cp-table">
              <thead>
                <tr class="vce-bd-header-row">
                  <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
                  <th class="vce-bd-th" scope="col">Name</th>
                  <th class="vce-bd-th vce-bd-th-center" scope="col">Damage</th>
                  <th class="vce-bd-th" scope="col">Delivery</th>
                  <th class="vce-bd-th vce-bd-th-center" scope="col">Duration</th>
                  <th class="vce-bd-th vce-bd-th-center" scope="col"></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </form>`;

      const dialog = new foundry.applications.api.DialogV2({
        window: {
          title: `${actor.name} — Manage Talents`,
          resizable: true,
        },
        position: { width: 700, height: 560 },
        classes: ["vce-creature-picker-app"],
        content,
        buttons: [
          {
            action: "save",
            label: "Save",
            icon: "fas fa-check",
            default: true,
            callback: async () => {
              // Read current checked state and compute diff against owned
              const root = dialog.element;
              const checked = Array.from(
                root.querySelectorAll("input[data-pick-id]:checked")
              ).map(cb => ({ id: cb.dataset.pickId, name: cb.dataset.pickName }));

              if (checked.length !== expected) {
                ui.notifications.warn(`Select exactly ${expected} Talent${expected !== 1 ? "s" : ""}.`);
                throw new Error(`vce-talent-manage: need exactly ${expected}, got ${checked.length}`);
              }

              const checkedNames = new Set(checked.map(c => c.name));
              const toDelete = [];
              for (const [name, item] of ownedByName) {
                if (!checkedNames.has(name)) toDelete.push(item.id);
              }
              const toAdd = checked.filter(c => !ownedByName.has(c.name));

              if (toDelete.length === 0 && toAdd.length === 0) {
                finish({ changed: false, added: [], removed: [] });
                return;
              }

              if (toDelete.length > 0) {
                await actor.deleteEmbeddedDocuments("Item", toDelete);
              }
              if (toAdd.length > 0) {
                const docs = await Promise.all(toAdd.map(c => pack.getDocument(c.id)));
                const itemData = docs.map(d => d.toObject());
                await actor.createEmbeddedDocuments("Item", itemData);
              }

              ui.notifications.info(
                `Talents updated: removed ${toDelete.length}, added ${toAdd.length}.`
              );
              finish({
                changed: true,
                added:   toAdd.map(c => c.name),
                removed: [...ownedByName.keys()].filter(n => !checkedNames.has(n)),
              });
            },
          },
          {
            action: "cancel",
            label: "Cancel",
            icon: "fas fa-times",
            callback: () => finish(null),
          },
        ],
        rejectClose: false,
      });

      Hooks.once("closeDialogV2", (app) => {
        if (app === dialog) finish(null);
      });

      dialog.render({ force: true }).then(() => {
        const root = dialog.element;
        if (!root) return;

        const counter = root.querySelector(".vce-tp-count");
        const checkboxes = root.querySelectorAll("input[data-pick-id]");

        const updateCount = (e) => {
          const allChecked = Array.from(
            root.querySelectorAll("input[data-pick-id]:checked")
          );
          const n = allChecked.length;
          if (n > expected) {
            // Force off whichever box just exceeded the cap
            if (e?.target) e.target.checked = false;
            if (counter) counter.textContent = String(expected);
            ui.notifications.warn(`You may only have ${expected} Talent${expected !== 1 ? "s" : ""}.`);
            return;
          }
          if (counter) counter.textContent = String(n);
        };

        checkboxes.forEach(cb => cb.addEventListener("change", updateCount));
      });
    });
  },
};
