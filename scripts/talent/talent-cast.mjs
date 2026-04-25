/**
 * TalentCast — full-RAW cast dialog for Psychic Talents.
 *
 * Usage:
 *   const config = await TalentCast.openDialog(actor, talentItem);
 *   // config: { damageDice, includeDamage, includeEffect, delivery, isFocused, totalMana }
 *   //         on cancel / close: null
 *
 * Cap math (per Psionics rule):
 *   cap = floor(psychicLevel / 2)
 *
 *   Mana cost breakdown:
 *   - 1d6 base damage:        FREE (if cast alone, no effect)
 *   - effect alone:           FREE (if cast alone, no damage)
 *   - damage + effect both:   +1 Mana surcharge
 *   - each extra die beyond 1d6: +1 Mana per die
 *   - delivery base cost:     see DELIVERY_COSTS
 *   - duration:               FREE for Talents
 *
 * Pattern mirrors talent-pick-dialog.mjs:
 *   - idempotent finish() covers all 4 exit paths
 *   - Hooks.once("closeDialogV2", ...) fallback for X/Escape
 *   - classes: ["vce-creature-picker-app"] for dark theme
 *   - rejectClose: false (no unhandled rejection on X)
 */

import { MODULE_ID } from "../utils.mjs";

// Verified RAW delivery base costs (Vagabond Core Rulebook — 05 Magic, Delivery table)
const DELIVERY_COSTS = {
  touch:  0,
  remote: 0,
  self:   0,
  imbue:  0,   // 1-Mana minimum enforced elsewhere; included here for completeness
  cube:   1,
  aura:   2,
  cone:   2,
  glyph:  2,
  line:   2,
  sphere: 2,
};

/**
 * Compute total Mana cost for the current dialog config.
 *
 * @param {object} config
 * @param {number}  config.damageDice    — extra dice beyond the free 1d6 baseline (0+)
 * @param {boolean} config.includeDamage — whether the damage component is included
 * @param {boolean} config.includeEffect — whether the effect component is included
 * @param {string}  config.delivery      — chosen delivery key
 * @param {object}  talent               — Talent item document
 * @returns {number} total Mana cost
 */
function computeTotalMana(config, talent) {
  const hasDamage = !!talent.system.damage;
  const hasEffect = !!talent.system.effect;

  const dmgIncluded = config.includeDamage && hasDamage;
  const fxIncluded  = config.includeEffect  && hasEffect;

  let total = 0;
  total += config.damageDice;                          // extra dice beyond free 1d6
  total += (dmgIncluded && fxIncluded) ? 1 : 0;       // both components = +1 surcharge
  total += DELIVERY_COSTS[config.delivery] ?? 0;       // delivery base cost
  // duration is always free for Talents
  return total;
}

export const TalentCast = {
  /**
   * Derive the virtual Mana cap for this actor's current Psychic level.
   * cap = floor(level / 2). Returns 0 if actor is not Psychic or level < 2.
   */
  getCap(actor) {
    const psy = actor.items.find(i => i.type === "class" && i.name === "Psychic");
    return Math.floor((psy?.system?.level ?? 1) / 2);
  },

  /**
   * Open the cast configuration dialog for the given Talent.
   *
   * @param {Actor}    actor   — the Psychic actor casting
   * @param {Item}     talent  — the Talent item being cast (must be TALENT_TYPE)
   * @returns {Promise<{damageDice: number, includeDamage: boolean, includeEffect: boolean,
   *                     delivery: string, isFocused: boolean, totalMana: number} | null>}
   */
  async openDialog(actor, talent) {
    if (!actor || !talent) return null;

    const cap      = this.getCap(actor);
    const hasDamage = !!talent.system.damage;
    const hasEffect = !!talent.system.effect;

    // Build initial affordable delivery list (at cap=0 budget, only cost-0 deliveries)
    // Re-filtering happens live via _wireListeners.
    const allowedDeliveries = (talent.system.delivery ?? []).filter(d => d in DELIVERY_COSTS);
    const initialDeliveries = allowedDeliveries.filter(d => (DELIVERY_COSTS[d] ?? 99) <= cap);

    if (initialDeliveries.length === 0) {
      // Edge case: even cap=0 should allow touch/remote/self for most Talents.
      // If the talent's delivery list has only expensive options and cap is 0, warn.
      ui.notifications.warn(
        `${talent.name}: no affordable delivery options at current Mana cap (${cap}).`
      );
      return null;
    }

    // Build per-delivery metadata for the template so we avoid relying on
    // a potentially-unregistered Handlebars "includes" helper.
    const initialDeliverySet = new Set(initialDeliveries);
    const deliveryOptions = allowedDeliveries.map(d => ({
      key: d,
      cost: DELIVERY_COSTS[d] ?? 0,
      disabled: !initialDeliverySet.has(d),
    }));

    // Compute initial slider max (first render will have effect unchecked, so no surcharge)
    const initialDelivery = (talent.system.delivery ?? [])[0] ?? "touch";
    const initialDeliveryCost = DELIVERY_COSTS[initialDelivery] ?? 0;
    const initialSliderMax = Math.max(0, cap - initialDeliveryCost);

    const templateData = {
      talent,
      cap,
      hasDamage,
      hasEffect,
      allowedDeliveries,
      deliveryOptions,
      initialDeliveries,
      initialSliderMax,
    };

    let content;
    try {
      content = await foundry.applications.handlebars.renderTemplate(
        `modules/${MODULE_ID}/templates/talent-cast-dialog.hbs`,
        templateData
      );
    } catch (err) {
      console.error(`${MODULE_ID} | TalentCast: failed to render template`, err);
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

      const dialog = new foundry.applications.api.DialogV2({
        window: {
          title: `Cast: ${talent.name}`,
          resizable: true,
        },
        position: { width: 460, height: 420 },
        classes: ["vce-creature-picker-app"],
        content,
        buttons: [
          {
            action: "confirm",
            label: "Cast",
            icon: "fas fa-brain",
            default: true,
            callback: () => {
              const root = dialog.element;
              const damageDice    = hasDamage
                ? parseInt(root.querySelector("input[name='damageDice']")?.value ?? "0", 10)
                : 0;
              const includeDamage = hasDamage
                ? (root.querySelector("input[name='includeDamage']")?.checked ?? true)
                : false;
              const includeEffect = hasEffect
                ? (root.querySelector("input[name='includeEffect']")?.checked ?? false)
                : false;
              const delivery      = root.querySelector("select[name='delivery']")?.value
                ?? initialDeliveries[0];
              const isFocused     = root.querySelector("input[name='duration']:checked")?.value === "focus";

              const cfg = { damageDice, includeDamage, includeEffect, delivery, isFocused };
              const totalMana = computeTotalMana(cfg, talent);

              if (totalMana > cap) {
                ui.notifications.warn(
                  `${talent.name}: Mana cost ${totalMana} exceeds cap ${cap}. Reduce your selection.`
                );
                // Throwing prevents DialogV2 from closing the dialog.
                throw new Error(`vce-talent-cast: over cap (${totalMana}/${cap})`);
              }

              finish({ ...cfg, totalMana });
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

      // Fallback: X button / Escape / external close all fire closeDialogV2.
      Hooks.once("closeDialogV2", (app) => {
        if (app === dialog) finish(null);
      });

      dialog.render({ force: true }).then(() => {
        this._wireListeners(dialog, talent, cap, allowedDeliveries);
      }).catch((err) => {
        console.error(`${MODULE_ID} | TalentCast: dialog render failed`, err);
        finish(null);
      });
    });
  },

  /**
   * Wire live interactivity: counter update + delivery re-filter.
   * Called once after render. All changes flow through _update().
   */
  _wireListeners(dialog, talent, cap, allowedDeliveries) {
    const root = dialog.element;
    if (!root) return;

    const hasDamage = !!talent.system.damage;
    const hasEffect = !!talent.system.effect;

    const counterEl      = root.querySelector(".vce-tc-counter");
    const diceSlider     = root.querySelector("input[name='damageDice']");
    const diceValDisplay = root.querySelector(".vce-tc-dice-val");
    const includeDmgCb   = root.querySelector("input[name='includeDamage']");
    const includeEffCb   = root.querySelector("input[name='includeEffect']");
    const deliverySelect = root.querySelector("select[name='delivery']");

    const update = () => {
      const damageDice    = hasDamage && diceSlider    ? parseInt(diceSlider.value, 10) : 0;
      const includeDamage = hasDamage && includeDmgCb  ? includeDmgCb.checked          : false;
      const includeEffect = hasEffect && includeEffCb  ? includeEffCb.checked          : false;
      const delivery      = deliverySelect             ? deliverySelect.value           : (allowedDeliveries[0] ?? "touch");

      if (diceValDisplay) diceValDisplay.textContent = `+${damageDice}d6`;

      const cfg = { damageDice, includeDamage, includeEffect, delivery };
      const spent = computeTotalMana(cfg, talent);

      if (counterEl) {
        counterEl.textContent = `Spent: ${spent} / ${cap}`;
        counterEl.classList.toggle("vce-tc-over-cap", spent > cap);
      }

      // Re-filter delivery dropdown options: grey out / disable those no longer affordable.
      // Remaining budget for delivery = cap - (non-delivery costs).
      if (deliverySelect) {
        const nonDeliveryCost = spent - (DELIVERY_COSTS[delivery] ?? 0);
        const deliveryBudget  = cap - nonDeliveryCost;
        Array.from(deliverySelect.options).forEach(opt => {
          const cost = DELIVERY_COSTS[opt.value] ?? 99;
          opt.disabled = cost > deliveryBudget;
          // If the currently-selected option became unaffordable, auto-select cheapest
          if (opt.selected && cost > deliveryBudget) {
            const cheapest = allowedDeliveries.find(d => (DELIVERY_COSTS[d] ?? 99) <= deliveryBudget);
            if (cheapest) {
              deliverySelect.value = cheapest;
              // Re-trigger update synchronously with the corrected value
              update();
              return;
            }
          }
        });
      }

      // Fix 1: Clamp dice slider max to the remaining budget after effect and delivery costs.
      // nonDeliveryCost already accounts for surcharge+damageDice; remove damageDice from it
      // to get the cost of everything except extra dice.
      if (diceSlider) {
        const effectSurcharge  = (includeDamage && includeEffect) ? 1 : 0;
        const deliveryCost     = DELIVERY_COSTS[delivery] ?? 0;
        const remainingForDice = Math.max(0, cap - effectSurcharge - deliveryCost);
        diceSlider.max = String(remainingForDice);
        if (parseInt(diceSlider.value, 10) > remainingForDice) {
          diceSlider.value = String(remainingForDice);
        }
      }

      // Fix 2: Disable effect checkbox when budget can't cover the +1 surcharge
      // (surcharge fires only when BOTH damage and effect are included).
      if (includeEffCb) {
        const deliveryCost             = DELIVERY_COSTS[delivery] ?? 0;
        const costWithoutEffSurcharge  = damageDice + deliveryCost; // no surcharge
        const wouldCostExtra           = includeDamage;             // surcharge only when damage is on
        const canAffordSurcharge       = !wouldCostExtra || (cap - costWithoutEffSurcharge >= 1);
        if (!canAffordSurcharge) {
          includeEffCb.checked  = false;
          includeEffCb.disabled = true;
        } else {
          includeEffCb.disabled = false;
        }
      }

      // Disable/grey the damage slider if includeDamage is unchecked
      if (diceSlider) {
        diceSlider.disabled = !includeDamage;
        if (!includeDamage && diceSlider.value !== "0") {
          diceSlider.value = "0";
        }
      }
    };

    // Initial sync
    update();

    // Wire all inputs
    [includeDmgCb, includeEffCb].forEach(el => el?.addEventListener("change", update));
    diceSlider?.addEventListener("input", update);
    deliverySelect?.addEventListener("change", update);
  },
};
