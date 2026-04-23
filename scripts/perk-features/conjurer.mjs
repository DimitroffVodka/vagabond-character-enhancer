/**
 * Conjurer perk adapter (VCE homebrew — not in core rulebook).
 *
 * From perk-features.mjs description:
 *   - Cast Action to conjure a previously-defeated non-Humanlike Being
 *   - Mana cost = creature's HD
 *   - Duration: while focusing (1 Mana/Turn upkeep)
 *   - HD limit: ≤ caster Level (single creature)
 *   - Pool: creatures the caster has previously defeated (registry lookup)
 *   - Termination: 0 HP, new conjure, or drop Focus
 *   - Checks/Saves use caster's Cast Skill
 *
 * Implementation:
 *   1. Maintain a persistent "defeated registry" on the caster's flags:
 *      `flags.vagabond-character-enhancer.defeatedCreatures = Array<{uuid, name, img, hd}>`
 *   2. Hook into NPC-death events (updateActor → HP 0) to auto-populate the
 *      registry when any NPC on the scene dies during combat.
 *   3. Context-menu entry on the Conjurer perk item opens a picker showing
 *      the registry (filtered by HD ≤ Level) and spawns the pick as a
 *      companion. Costs Mana = HD up front + 1 Mana/Turn focus.
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";
import { CompanionSpawner } from "../companion/companion-spawner.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";

const SOURCE_ID = "perk-conjurer";
const FOCUS_KEY = "perk_conjurer";
const FLAG_REGISTRY = "defeatedCreatures";

/** Being types that can't be Conjurer-targets (Humanlikes per perk rules). */
const EXCLUDED_TYPES = ["humanlike", "human"];

export const ConjurerPerk = {
  _contextMenuPatched: false,

  init() {
    this._registerDismissHandler();
    this._registerDefeatedWatcher();
    this._patchFeatureContextMenu();
    log("ConjurerPerk", "Conjurer perk adapter registered.");
  },

  _registerDismissHandler() {
    CompanionSpawner.registerDismissHandler(SOURCE_ID, async (companionActor, { controller, meta }) => {
      if (!controller) return;
      try { await FocusManager.releaseFeatureFocus(controller, FOCUS_KEY); }
      catch (e) { log("ConjurerPerk", `Could not release focus: ${e.message}`); }
      if (meta?.meta?.importedFromCompendium && companionActor?.id) {
        try { await gmRequest("deleteActor", { actorId: companionActor.id }); }
        catch (e) { log("ConjurerPerk", `Could not delete imported actor: ${e.message}`); }
      }
    });
  },

  /**
   * Watch for NPC deaths (HP transitions to 0) and add the creature to every
   * Conjurer PC's defeated registry. GM-only to avoid multi-write races.
   */
  _registerDefeatedWatcher() {
    Hooks.on("updateActor", async (actor, changes) => {
      if (!game.user.isGM) return;
      if (actor.type !== "npc") return;
      const newHP = changes.system?.health?.value ?? changes["system.health.value"];
      if (newHP === undefined || newHP > 0) return;

      // Skip NPCs that are themselves companions (flagged) — we don't want
      // a defeated summon to end up in the conjurer registry.
      if (actor.getFlag(MODULE_ID, "controllerActorId")) return;

      // Skip excluded being types
      const beingType = (actor.system?.beingType ?? "").toLowerCase();
      if (EXCLUDED_TYPES.some(t => beingType.includes(t))) return;

      // Build registry entry — world actor UUID is the key
      const entry = {
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img ?? "icons/svg/mystery-man.svg",
        hd: actor.system?.hd ?? 0,
        beingType: actor.system?.beingType ?? "",
        defeatedAt: Date.now(),
      };

      // Push into every Conjurer PC's registry
      for (const pc of game.actors.filter(a => a.type === "character")) {
        const features = getFeatures(pc);
        if (!features?.perk_conjurer) continue;
        const current = pc.getFlag(MODULE_ID, FLAG_REGISTRY) ?? [];
        // De-dupe by UUID — keep most recent defeatedAt
        const filtered = current.filter(e => e.uuid !== entry.uuid);
        filtered.push(entry);
        try {
          await pc.setFlag(MODULE_ID, FLAG_REGISTRY, filtered);
          log("ConjurerPerk", `Added ${entry.name} to ${pc.name}'s defeated registry.`);
        } catch (e) {
          log("ConjurerPerk", `Could not update registry for ${pc.name}: ${e.message}`);
        }
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
            if (clickedItem?.type === "perk" && clickedItem.name.toLowerCase() === "conjurer") {
              const features = getFeatures(actor);
              if (features?.perk_conjurer) {
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
                    label: `${active.actor.name} (Conjured)`,
                    icon: "fas fa-eye",
                    enabled: false,
                    action: () => {}
                  });
                  menuItems.push({
                    label: "Banish Conjured",
                    icon: "fas fa-times",
                    enabled: true,
                    action: () => CompanionSpawner.dismiss(active.actor, { reason: "banished" })
                  });
                }

                const registry = actor.getFlag(MODULE_ID, FLAG_REGISTRY) ?? [];
                menuItems.push({
                  label: active
                    ? `Conjure Different (${registry.length} known — replaces current)`
                    : `Conjure (${registry.length} known)`,
                  icon: "fas fa-plus-circle",
                  enabled: registry.length > 0,
                  action: () => self.showConjureDialog(actor)
                });

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
   * Show the defeated-creature picker dialog. Player picks one, pays Mana = HD,
   * and we spawn via CompanionSpawner.
   */
  async showConjureDialog(actor) {
    const level = Number(actor.system?.level ?? 1) || 1;
    const maxHD = level;
    const registry = actor.getFlag(MODULE_ID, FLAG_REGISTRY) ?? [];

    if (!registry.length) {
      ui.notifications.warn("You haven't defeated any non-Humanlike creatures yet.");
      return;
    }

    const eligible = registry.filter(e => (e.hd ?? 0) <= maxHD);
    if (!eligible.length) {
      ui.notifications.warn(`No creatures in your registry match your HD limit (≤ ${maxHD}).`);
      return;
    }

    // Sort: HD asc, most-recently-defeated first for ties
    eligible.sort((a, b) => (a.hd - b.hd) || (b.defeatedAt - a.defeatedAt));

    const currentMana = Number(actor.system?.mana?.current ?? 0) || 0;
    const rows = eligible.map((e, idx) => {
      const canAfford = currentMana >= (e.hd ?? 0);
      const dim = canAfford ? "" : ` style="opacity:0.4;"`;
      const note = canAfford ? "" : " (not enough mana)";
      return `
        <tr class="vce-conjurer-row" data-idx="${idx}" role="button" tabindex="0"${dim}>
          <td class="vce-bd-cell vce-bd-cell-img">
            <img src="${e.img || "icons/svg/mystery-man.svg"}" class="vce-bd-beast-img" alt="" />
          </td>
          <td class="vce-bd-cell"><strong>${e.name}</strong>${note}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${e.hd ?? 0}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${e.beingType || "—"}</td>
        </tr>`;
    }).join("");

    const content = `
      <p>Pick a creature to conjure. Mana cost = creature HD. Requires continuous Focus (1 Mana/Turn).</p>
      <p style="font-size:0.85em; opacity:0.7;">Current Mana: ${currentMana} · Level ${level} (max HD ${maxHD})</p>
      <div class="vce-bd-scroll" style="max-height:400px; overflow-y:auto;">
        <table class="vce-bd-table" role="grid">
          <thead>
            <tr class="vce-bd-header-row">
              <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
              <th class="vce-bd-th" scope="col">Creature</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">HD / Mana</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Type</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    await new Promise((resolve) => {
      const d = new Dialog({
        title: `${actor.name} — Conjurer`,
        content,
        buttons: {
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
        },
        default: "cancel",
        render: (html) => {
          html.find(".vce-conjurer-row").on("click", async (ev) => {
            const idx = parseInt(ev.currentTarget.dataset.idx);
            const selected = eligible[idx];
            if (!selected) return;
            const hd = selected.hd ?? 0;
            if (currentMana < hd) {
              ui.notifications.warn(`Not enough mana (need ${hd}).`);
              return;
            }
            d.close();
            await this._performConjure(actor, selected, hd);
            resolve(selected);
          });
          html.find(".vce-conjurer-row").on("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.currentTarget.click(); }
          });
        },
        close: () => resolve(null),
      }, { width: 600, height: 450 });
      d.render(true);
    });
  },

  async _performConjure(actor, entry, manaCost) {
    // Spend mana before spawning
    const currentMana = Number(actor.system?.mana?.current ?? 0) || 0;
    await actor.update({ "system.mana.value": currentMana - manaCost });

    const result = await CompanionSpawner.spawn({
      caster: actor,
      sourceId: SOURCE_ID,
      creatureUuid: entry.uuid,
      meta: {
        hd: entry.hd,
        manaSpent: manaCost,
        fromRegistry: true,
        importedFromCompendium: entry.uuid.startsWith("Compendium."),
      },
      cost: { mana: manaCost },
      // Not allowMultiple — single conjure at a time; re-cast replaces
      suppressChat: false,
    });
    if (!result.success) {
      if (result.error !== "User cancelled replacement") {
        // Refund on failure
        await actor.update({ "system.mana.value": currentMana });
        ui.notifications.error(`Could not conjure: ${result.error ?? "unknown error"}`);
      } else {
        // Refund on user-cancel (they kept the existing conjure)
        await actor.update({ "system.mana.value": currentMana });
      }
      return;
    }

    // Acquire focus
    try {
      await FocusManager.acquireFeatureFocus(
        actor, FOCUS_KEY, `Conjured ${entry.name}`, entry.img
      );
    } catch (e) {
      log("ConjurerPerk", `Could not acquire focus: ${e.message}`);
    }
  },
};
