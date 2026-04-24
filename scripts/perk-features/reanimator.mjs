/**
 * Reanimator perk adapter.
 *
 * Per Core Rulebook 03_Heroes/04_Perks (Reanimator) and VCE homebrew:
 *   - 10-minute Ritual on a non-Artificial/Undead corpse
 *   - Duration: one Shift (≈8 hours), then the corpse dies permanently
 *   - Creature pool: defeated non-Artificial/Undead, HD ≤ caster Level
 *   - Termination: end of Shift, or perform ritual again (replaces previous)
 *   - Checks use the caster's Craft Skill
 *   - Commands during Turn without using an Action
 *   - Undead template applied (Darksight, poison/sickened immunity, silver weak)
 *
 * Entry point: right-click the Reanimator perk item on the character sheet →
 * "Perform Ritual" / "Banish Undead". Mirrors the Familiar context-menu pattern.
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { CompanionSpawner } from "../companion/companion-spawner.mjs";
import { CorpsePicker } from "../companion/corpse-picker.mjs";
import { applyUndeadTemplate } from "../companion/undead-template.mjs";

const SOURCE_ID = "perk-reanimator";

export const ReanimatorPerk = {
  _contextMenuPatched: false,

  init() {
    this._registerDismissHandler();
    this._patchFeatureContextMenu();
    log("ReanimatorPerk", "Reanimator perk adapter registered.");
  },

  _registerDismissHandler() {
    CompanionSpawner.registerDismissHandler(SOURCE_ID, async (companionActor, { controller, meta }) => {
      if (!controller) return;
      if (meta?.meta?.importedFromCompendium && companionActor?.id) {
        try { await gmRequest("deleteActor", { actorId: companionActor.id }); }
        catch (e) { log("ReanimatorPerk", `Could not delete imported actor: ${e.message}`); }
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
            if (clickedItem?.type === "perk" && clickedItem.name.toLowerCase() === "reanimator") {
              const features = getFeatures(actor);
              if (features?.perk_reanimator) {
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
                    label: `${active.actor.name} (Reanimated)`,
                    icon: "fas fa-skull",
                    enabled: false,
                    action: () => {}
                  });
                  menuItems.push({
                    label: "Banish Undead",
                    icon: "fas fa-times",
                    enabled: true,
                    action: () => CompanionSpawner.dismiss(active.actor, { reason: "banished" })
                  });
                  menuItems.push({
                    label: "Perform Ritual Again (replaces current)",
                    icon: "fas fa-sync",
                    enabled: true,
                    action: () => self.performRitual(actor)
                  });
                } else {
                  menuItems.push({
                    label: "Perform Ritual (10 min)",
                    icon: "fas fa-skull",
                    enabled: true,
                    action: () => self.performRitual(actor)
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
    return this.performRitual(actor);
  },

  async performRitual(actor) {
    const level = Number(actor.system?.attributes?.level?.value ?? 1) || 1;
    const maxHD = level;

    const picked = await CorpsePicker.pick({
      title: `${actor.name} — Reanimate (HD ≤ ${maxHD})`,
      maxHD,
      multi: false,
      fallbackPacks: [
        "vagabond-character-enhancer.vce-beasts",
        "vagabond.bestiary",
      ],
    });
    if (!picked || !picked.length) return;

    const { uuid } = picked[0];

    const result = await CompanionSpawner.spawn({
      caster: actor,
      sourceId: SOURCE_ID,
      creatureUuid: uuid,
      meta: {
        ritual: true,
        reanimated: true,
        importedFromCompendium: uuid.startsWith("Compendium."),
      },
      // Not allowMultiple — replace prompt fires if one already active
      suppressChat: false,
    });
    if (!result.success) {
      if (result.error !== "User cancelled replacement") {
        ui.notifications.error(`Could not reanimate: ${result.error ?? "unknown error"}`);
      }
      return;
    }

    const raisedActor = game.actors.get(result.actorId);
    if (raisedActor) {
      await applyUndeadTemplate(raisedActor, { sourceName: "Reanimated" });
    }

    // TODO Phase 2.1: schedule auto-banish at end of Shift (≈8 hours of game time).
    // For now, companion persists until manually banished via the context menu
    // or the Companions tab Dismiss button. Rulebook specifies end-of-Shift
    // termination but Vagabond has no formal Shift tracker yet.
    ui.notifications.info(`${raisedActor?.name ?? "The undead"} rises at your command. It will die permanently at the end of this Shift.`);
  },
};
