/**
 * Polymorph Beast Selection Dialog
 * Shows available Beasts filtered by HD ≤ druid level.
 * Sources beasts from the BeastCache (compendium data, not world actors).
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

export const PolymorphDialog = {

  /**
   * Show the Beast selection dialog.
   * @param {Actor} actor - The druid actor
   * @param {object[]} beasts - Array of beast cache entries (from BeastCache)
   * @param {Function} onSelect - Callback(beastData) when a beast is selected.
   *                              beastData is the cache entry with name, hd, size, etc.
   */
  show(actor, beasts, onSelect) {
    // Sort by HD ascending, then name
    const sorted = [...beasts].sort((a, b) =>
      (a.hd ?? 1) - (b.hd ?? 1) || a.name.localeCompare(b.name)
    );

    // Build HTML rows
    const rows = sorted.map((b, idx) => {
      const hd = b.hd ?? 1;
      const size = b.size ?? "medium";
      const armor = b.armor ?? 0;
      const speed = b.speed ?? 30;
      const speedExtras = [];
      const sv = b.speedValues || {};
      if (sv.fly) speedExtras.push(`Fly ${sv.fly}'`);
      if (sv.swim) speedExtras.push(`Swim ${sv.swim}'`);
      if (sv.climb) speedExtras.push(`Climb ${sv.climb}'`);
      if (sv.cling) speedExtras.push(`Cling ${sv.cling}'`);
      const speedStr = `${speed}'` + (speedExtras.length ? ` (${speedExtras.join(", ")})` : "");

      const actions = (b.actions ?? []).map(a => {
        const dmg = a.rollDamage || a.flatDamage || "—";
        return `${a.name}: ${dmg}`;
      }).join("; ");

      const img = b.img || "icons/svg/mystery-man.svg";
      const ariaLabel = `${b.name}, HD ${hd}, ${size}, Armor ${armor}, Speed ${speedStr}`;

      return `
        <tr class="vce-beast-row" data-beast-name="${b.name}" data-beast-idx="${idx}"
            role="button" tabindex="0" aria-label="${ariaLabel}">
          <td class="vce-bd-cell vce-bd-cell-img">
            <img src="${img}" class="vce-bd-beast-img" alt="" />
          </td>
          <td class="vce-bd-cell"><strong>${b.name}</strong></td>
          <td class="vce-bd-cell vce-bd-cell-center">${hd}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${size}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${armor}</td>
          <td class="vce-bd-cell">${speedStr}</td>
          <td class="vce-bd-cell vce-bd-cell-actions">${actions || "—"}</td>
        </tr>`;
    }).join("");

    const content = `
      <div class="vce-bd-scroll">
        <table class="vce-bd-table" role="grid" aria-label="Available beasts">
          <thead>
            <tr class="vce-bd-header-row">
              <th class="vce-bd-th vce-bd-th-img" scope="col"><span class="sr-only">Image</span></th>
              <th class="vce-bd-th" scope="col">Beast</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">HD</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Size</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Armor</th>
              <th class="vce-bd-th" scope="col">Speed</th>
              <th class="vce-bd-th" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    const dialog = new Dialog({
      title: `Polymorph — ${actor.name} (Level ${actor.system.attributes?.level?.value ?? 1})`,
      content,
      buttons: {
        cancel: {
          icon: '<i class="fas fa-times" aria-hidden="true"></i>',
          label: "Cancel",
          callback: () => {
            // If they cancel, drop focus on Polymorph
            const spellIds = actor.system.focus?.spellIds ?? [];
            const filtered = spellIds.filter(id => {
              const spell = actor.items.get(id);
              return !spell?.name?.toLowerCase().includes("polymorph");
            });
            if (filtered.length !== spellIds.length) {
              actor.update({ "system.focus.spellIds": filtered });
            }
          }
        }
      },
      default: "cancel",
      render: (html) => {
        let selected = false;
        // Normalize html — Foundry V1 passes jQuery, V2 may pass HTMLElement
        const el = html instanceof HTMLElement ? html : html[0];

        const selectBeast = (row) => {
          if (selected) return;
          const beastName = row.dataset.beastName;
          const beast = sorted.find(b => b.name === beastName);
          if (beast) {
            selected = true;
            const domNode = dialog.element?.[0] || dialog.element;
            if (domNode?.remove) domNode.remove();
            try { dialog.close({ force: true }); } catch(e) { /* already removed */ }
            onSelect(beast);
          }
        };

        // Click + keyboard handlers on rows
        el.querySelectorAll(".vce-beast-row").forEach(row => {
          row.addEventListener("click", (e) => selectBeast(e.currentTarget));
          row.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectBeast(e.currentTarget);
            }
            // Arrow key navigation between rows
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = e.currentTarget.nextElementSibling;
              if (next) next.focus();
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              const prev = e.currentTarget.previousElementSibling;
              if (prev) prev.focus();
            }
          });
        });
      }
    }, {
      width: Math.min(700, window.innerWidth - 40),
      height: "auto",
      classes: ["vce-polymorph-dialog"]
    });

    dialog.render(true);
  }
};
