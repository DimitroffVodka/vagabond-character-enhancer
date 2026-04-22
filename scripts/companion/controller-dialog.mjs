/**
 * ControllerDialog — ApplicationV2 dialog for manually stamping save-controller
 * flags on NPC actors. Opens from the NPC sheet header button injected via
 * the `getHeaderControlsActorSheetV2` hook in vagabond-character-enhancer.mjs.
 */

import { MODULE_ID } from "../utils.mjs";
import { getController, setController, clearController, CONTROLLER_TYPES } from "./save-routing.mjs";
import { gmRequest } from "../socket-relay.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ControllerDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    tag: "form",
    window: {
      title: "Set Save Controller",
      icon: "fas fa-people-arrows",
      resizable: false
    },
    position: { width: 360, height: "auto" },
    form: {
      handler: ControllerDialog.#onSave,
      closeOnSubmit: true
    },
    actions: {
      clear: ControllerDialog.#onClear
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/controller-dialog.hbs` }
  };

  /**
   * @param {Actor} npcActor  The NPC actor whose controller flags we're editing
   * @param {object} [options]
   */
  constructor(npcActor, options = {}) {
    super({ ...options, id: `vce-controller-dialog-${npcActor.id}` });
    this.npcActor = npcActor;
  }

  async _prepareContext(options) {
    const current = getController(this.npcActor) ?? {};
    const pcChoices = game.actors
      .filter(a => a.type === "character")
      .map(a => ({ id: a.id, name: a.name, selected: a.id === current.actorId }));

    return {
      npcName: this.npcActor.name,
      current,
      pcChoices,
      types: [
        {
          value: CONTROLLER_TYPES.COMPANION,
          label: "Companion (Mana Skill)",
          checked: current.type === CONTROLLER_TYPES.COMPANION
        },
        {
          value: CONTROLLER_TYPES.HIRELING,
          label: "Hireling (Leadership)",
          checked: current.type === CONTROLLER_TYPES.HIRELING
        }
      ]
    };
  }

  /**
   * Form submit handler. Bound to the application instance by ApplicationV2.
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSave(event, form, formData) {
    const app = this; // ApplicationV2 binds the handler to the application instance
    const data = formData.object;
    const controllerId = data.controllerId;
    const type = data.controllerType;

    if (!controllerId || !type) {
      ui.notifications.warn("Pick a controller PC and a type before saving.");
      // Prevent closeOnSubmit by throwing — ApplicationV2 catches this and keeps dialog open
      throw new Error("incomplete");
    }

    if (app.npcActor.isOwner) {
      await setController(app.npcActor, { controllerId, type });
    } else {
      await gmRequest("updateActorFlags", {
        actorId: app.npcActor.id,
        scope:   MODULE_ID,
        flags:   {
          controllerActorId: controllerId,
          controllerType:    type
        }
      });
    }

    ui.notifications.info(`Save controller set for ${app.npcActor.name}.`);
    // closeOnSubmit: true handles closing after this handler returns
  }

  /**
   * Clear button action handler. Bound to the application instance by ApplicationV2.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onClear(event, target) {
    const app = this;

    if (app.npcActor.isOwner) {
      await clearController(app.npcActor);
    } else {
      await gmRequest("updateActorFlags", {
        actorId: app.npcActor.id,
        scope:   MODULE_ID,
        flags:   {
          controllerActorId: null,
          controllerType:    null
        }
      });
    }

    ui.notifications.info(`Save controller cleared for ${app.npcActor.name}.`);
    await app.close();
  }
}
