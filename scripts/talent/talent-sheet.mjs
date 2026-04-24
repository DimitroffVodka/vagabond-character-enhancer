/**
 * TalentSheet — ApplicationV2 item sheet for editing Talent items.
 *
 * Used primarily in the vce-talents compendium; rarely opened on player sheets.
 * Delivery and focusBuffAE are formatted as plain strings in _prepareContext to
 * avoid relying on Handlebars helpers (join/json) that may not be registered.
 */

import { MODULE_ID } from "../utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class TalentSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vagabond", "sheet", "item", "vce-talent-sheet"],
    position: { width: 520, height: 620 },
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/talent-sheet.hbs` }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;

    return {
      ...context,
      item: this.item,
      system,
      // Delivery stored as Array in the model; render as comma-separated string for
      // the plain text input. _onSubmit will split it back before saving.
      deliveryString: Array.isArray(system.delivery) ? system.delivery.join(", ") : "",
      // focusBuffAE stored as Object|null; render as pretty-printed JSON for the textarea.
      focusBuffAEJson: system.focusBuffAE ? JSON.stringify(system.focusBuffAE, null, 2) : "",
      durationOptions: ["instant", "focus", "continual"]
    };
  }

  /** @override */
  async _processFormData(event, form, formData) {
    // Convert the comma-separated delivery string back to an Array before the
    // standard data-model update so Foundry sees the correct shape.
    const raw = formData.object;

    if (typeof raw["system.delivery"] === "string") {
      raw["system.delivery"] = raw["system.delivery"]
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    }

    if (typeof raw["system.focusBuffAE"] === "string") {
      const txt = raw["system.focusBuffAE"].trim();
      try {
        raw["system.focusBuffAE"] = txt ? JSON.parse(txt) : null;
      } catch {
        ui.notifications.warn("VCE | TalentSheet: focusBuffAE contains invalid JSON — reverting to null.");
        raw["system.focusBuffAE"] = null;
      }
    }

    return super._processFormData(event, form, formData);
  }
}
