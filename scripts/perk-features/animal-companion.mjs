/**
 * Animal Companion perk adapter.
 *
 * Per Core Rulebook 03_Heroes/04_Perks (Animal Companion):
 *   - Tame a non-hostile Beast with HD ≤ half your Level (1 Shift downtime)
 *   - Companion is permanent (no focus, no mana)
 *   - Single companion at a time; new taming replaces previous
 *   - Companion acts independently vs enemies; use Actions or skip Move to command
 *   - Checks/Saves use caster's Survival Skill
 *
 * Entry point: right-click the Animal Companion perk item on the character
 * sheet → "Tame New Companion" / "Dismiss Companion" / action rolls. Mirrors
 * the familiar-perk context-menu pattern.
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { CompanionSpawner } from "../companion/companion-spawner.mjs";
import { CreaturePicker } from "../companion/creature-picker.mjs";

const SOURCE_ID = "perk-animal-companion";

export const AnimalCompanion = {
  _contextMenuPatched: false,

  init() {
    this._registerDismissHandler();
    this._patchFeatureContextMenu();
    log("AnimalCompanion", "Animal Companion perk adapter registered.");
  },

  _registerDismissHandler() {
    CompanionSpawner.registerDismissHandler(SOURCE_ID, async (companionActor, { controller, meta }) => {
      if (!controller) return;
      // No focus to release, no caster-side state flag (perk is narrative).
      // Delete imported compendium actor if applicable.
      if (meta?.meta?.importedFromCompendium && companionActor?.id) {
        try { await gmRequest("deleteActor", { actorId: companionActor.id }); }
        catch (e) { log("AnimalCompanion", `Could not delete imported actor: ${e.message}`); }
      }
    });
  },

  _patchFeatureContextMenu() {
    const self = this;
    Hooks.on("renderApplicationV2", (app) => {
      if (self._contextMenuPatched) return;
      const handler = app.inventoryHandler;
      if (!handler) return;
      const proto = Object.getPrototypeOf(handler);
      if (!proto || !proto.showFeatureContextMenu) return;

      const original = proto.showFeatureContextMenu;
      proto.showFeatureContextMenu = async function(event, itemIdOrData, itemType) {
        if (typeof itemIdOrData === "string") {
          const actor = this.actor;
          if (actor?.type === "character") {
            const clickedItem = actor.items.get(itemIdOrData);
            if (clickedItem?.type === "perk" && clickedItem.name.toLowerCase() === "animal companion") {
              const features = getFeatures(actor);
              if (features?.perk_animalCompanion) {
                event.preventDefault();
                event.stopPropagation();
                this.hideInventoryContextMenu();

                const { ContextMenuHelper } = globalThis.vagabond.utils;
                const { VagabondChatCard } = globalThis.vagabond.utils;

                const menuItems = [{
                  label: "Send to Chat",
                  icon: "fas fa-comment",
                  enabled: true,
                  action: async () => { await VagabondChatCard.itemUse(actor, clickedItem); }
                }];

                const active = CompanionSpawner.getCompanionsFor(actor)
                  .find(c => c.sourceId === SOURCE_ID);
                if (active) {
                  menuItems.push({
                    label: `${active.actor.name} (Companion)`,
                    icon: "fas fa-paw",
                    enabled: false,
                    action: () => {}
                  });
                  menuItems.push({
                    label: "Dismiss Companion",
                    icon: "fas fa-times",
                    enabled: true,
                    action: () => CompanionSpawner.dismiss(active.actor, { reason: "dismissed" })
                  });
                  menuItems.push({
                    label: "Tame New Companion (replaces current)",
                    icon: "fas fa-sync",
                    enabled: true,
                    action: () => self.tameCompanion(actor)
                  });
                } else {
                  menuItems.push({
                    label: "Tame Companion",
                    icon: "fas fa-paw",
                    enabled: true,
                    action: () => self.tameCompanion(actor)
                  });
                }

                menuItems.push({
                  label: "Edit",
                  icon: "fas fa-edit",
                  enabled: true,
                  action: () => { clickedItem.sheet.render(true); }
                });

                ContextMenuHelper.show(event, menuItems);
                return;
              }
            }
          }
        }
        return original.call(this, event, itemIdOrData, itemType);
      };
      self._contextMenuPatched = true;
    });
  },

  /**
   * Public entry point — called from the Companions tab action bar.
   */
  async trigger(actor) {
    return this.tameCompanion(actor);
  },

  /**
   * Open the creature picker to tame a new beast. Replaces any existing
   * companion (rulebook: "taming another beast" replaces previous).
   */
  async tameCompanion(actor) {
    const level = Number(actor.system?.attributes?.level?.value ?? 1) || 1;
    const maxHD = Math.max(1, Math.floor(level / 2));

    const picks = await CreaturePicker.pick({
      title: `${actor.name} — Tame Animal Companion (HD ≤ ${maxHD})`,
      caster: actor,
      favoritesFlag: "animalCompanionCodex",
      // Single-select: Animal Companion allows only one companion at a time
      filter: {
        types: ["beast"],
        maxHD,
        packs: [
          "vagabond-character-enhancer.vce-beasts",
          "vagabond.bestiary",
        ],
      },
    });
    if (!picks || !picks.length) return;
    const picked = picks[0];

    const result = await CompanionSpawner.spawn({
      caster: actor,
      sourceId: SOURCE_ID,
      creatureUuid: picked.uuid,
      meta: {
        ritual: true,
        tamed: true,
        importedFromCompendium: picked.uuid.startsWith("Compendium."),
      },
      // Not allowMultiple — replace prompt fires if one already active
      suppressChat: false,
    });
    if (!result.success && result.error !== "User cancelled replacement") {
      ui.notifications.error(`Could not tame companion: ${result.error ?? "unknown error"}`);
    }
  },
};
