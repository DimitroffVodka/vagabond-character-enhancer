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

      // Build table rows (HTML string — inline, no separate .hbs file)
      const rows = available.map(t => {
        const deliveryStr = (t.system.delivery ?? []).join(", ") || "—";
        const damageStr = t.system.damage || "—";
        const duration = t.system.duration || "instant";
        const isBuff = !!t.system.focusBuffAE;
        const buffBadge = isBuff ? ' <span class="vce-talent-buff-badge" title="Focus buff — no cast">Buff</span>' : "";
        return `
          <tr class="vce-talent-pick-row" data-talent-id="${t.id}" data-talent-name="${foundry.utils.escapeHTML(t.name)}">
            <td class="vce-tpd-icon"><img src="${t.img || "icons/svg/item-bag.svg"}" alt="" /></td>
            <td class="vce-tpd-name"><strong>${foundry.utils.escapeHTML(t.name)}</strong>${buffBadge}</td>
            <td class="vce-tpd-damage">${foundry.utils.escapeHTML(damageStr)}</td>
            <td class="vce-tpd-delivery">${foundry.utils.escapeHTML(deliveryStr)}</td>
            <td class="vce-tpd-duration">${foundry.utils.escapeHTML(duration)}</td>
            <td class="vce-tpd-check"><input type="checkbox" data-pick-id="${t.id}" data-pick-name="${foundry.utils.escapeHTML(t.name)}" /></td>
          </tr>`;
      }).join("");

      const pluralS = count !== 1 ? "s" : "";
      const content = `
        <form class="vce-creature-picker vce-talent-pick-dialog">
          <div class="vce-tpd-header">
            <p class="vce-tpd-instruction">
              Pick <strong>${count}</strong> Talent${pluralS}.
              &nbsp; Selected: <span class="vce-tp-count">0</span>/${count}
            </p>
          </div>
          <div class="vce-tpd-scroll">
            <table class="vce-tpd-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Damage</th>
                  <th>Delivery</th>
                  <th>Duration</th>
                  <th></th>
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
};
