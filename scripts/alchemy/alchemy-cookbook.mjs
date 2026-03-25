/**
 * Alchemy Cookbook
 *
 * Full crafting window for Alchemist characters.
 * Opened via right-click on Alchemy Tools in the character sheet inventory.
 *
 * Single list view with all alchemical items.
 * Formulae (starred) sort to the top and craft for 5s.
 * Right-click any item row to add/remove it as a formula.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";
import {
  getAlchemistData, fetchCompendiumItems, itemValueInSilver,
  getCraftCost, formatCost, craftItem, getAlchemicalEffect,
} from "./alchemy-helpers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// ── Cookbook Application ──────────────────────────────────────────────────────

class AlchemyCookbookApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id:     "vagabond-crawler-cookbook",
    tag:    "div",
    window: { title: "Alchemist\u2019s Cookbook", resizable: true },
    position: { width: 520, height: 600 },
    classes: ["vagabond-crawler-cookbook"],
  };

  static PARTS = {
    cookbook: { template: "modules/vagabond-character-enhancer/templates/alchemy-cookbook.hbs" },
  };

  constructor(actor) {
    super();
    this._actor      = actor;
    this._searchText  = "";
  }

  // ── Context ──────────────────────────────────────────────────────────────

  async _prepareContext() {
    const actor   = this._actor;
    const alcData = getAlchemistData(actor);
    if (!alcData) return { items: [], totalSilver: 0,
      level: 0, formulaeCount: 0, maxFormulaeCount: 0,
      maxFormulaeValue: 0, maxFormulaeValueLabel: "0s",
      searchText: "" };

    const compendiumItems = await fetchCompendiumItems();
    const formulaeSet = new Set(alcData.formulae.map(f => f.toLowerCase()));
    const search = this._searchText.toLowerCase();

    // Build display list — all items, always
    let displayItems = compendiumItems.map(itemData => {
      const silver   = itemValueInSilver(itemData);
      const isFormula = formulaeSet.has(itemData.name.toLowerCase());
      const cost      = getCraftCost(itemData, isFormula);
      const aType     = itemData.system?.alchemicalType ?? "unknown";

      return {
        name:           itemData.name,
        img:            itemData.img ?? "icons/svg/item-bag.svg",
        alchemicalType: aType.charAt(0).toUpperCase() + aType.slice(1),
        silver,
        valueLabel:     formatCost(silver),
        cost,
        costLabel:      formatCost(cost),
        isFormula,
        cantAfford:     cost > alcData.totalSilver,
        eligibleAsFormula: silver <= alcData.maxFormulaeValue,
      };
    });

    // Filter by search
    if (search) {
      displayItems = displayItems.filter(d =>
        d.name.toLowerCase().includes(search)
        || d.alchemicalType.toLowerCase().includes(search)
      );
    }

    // Sort: formulae first, then by silver value
    displayItems.sort((a, b) => {
      if (a.isFormula !== b.isFormula) return a.isFormula ? -1 : 1;
      return a.silver - b.silver;
    });

    return {
      items:               displayItems,
      totalSilver:         alcData.totalSilver,
      level:               alcData.level,
      formulaeCount:       alcData.formulae.length,
      maxFormulaeCount:    alcData.maxFormulaeCount,
      maxFormulaeValue:    alcData.maxFormulaeValue,
      maxFormulaeValueLabel: formatCost(alcData.maxFormulaeValue),
      searchText:          this._searchText,
    };
  }

  // ── Events ───────────────────────────────────────────────────────────────

  _onRender(context, options) {
    const el = this.element;

    // Search
    const searchInput = el.querySelector(".vcb-cook-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        this._searchText = searchInput.value;
        this.render();
      });
      // Re-focus after render
      requestAnimationFrame(() => {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      });
    }

    // Craft buttons (left-click)
    el.querySelectorAll(".vcb-cook-craft-btn").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const itemName  = btn.dataset.itemName;
        const isFormula = btn.dataset.isFormula === "true";
        btn.disabled = true;
        await craftItem(this._actor, itemName, isFormula);
        this.render();
      });
    });

    // Right-click on item row — toggle formula
    el.querySelectorAll(".vcb-cook-item").forEach(row => {
      row.addEventListener("contextmenu", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const itemName = row.dataset.itemName;
        await this._toggleFormula(itemName);
      });
    });
  }

  // ── Formula Management ───────────────────────────────────────────────────

  async _toggleFormula(itemName) {
    const alcData = getAlchemistData(this._actor);
    if (!alcData?.tools) return;

    const isKnown = alcData.formulae.some(f => f.toLowerCase() === itemName.toLowerCase());

    if (isKnown) {
      // Remove formula
      const newFormulae = alcData.formulae.filter(
        f => f.toLowerCase() !== itemName.toLowerCase()
      );
      await alcData.tools.setFlag(MODULE_ID, "knownFormulae", newFormulae);
      ui.notifications.info(`Removed ${itemName} from formulae.`);
      this.render();
      return;
    }

    // Adding a new formula — check slot availability
    if (alcData.formulae.length >= alcData.maxFormulaeCount) {
      ui.notifications.warn(`All ${alcData.maxFormulaeCount} formula slots are full!`);
      return;
    }

    // Check value eligibility
    const compendiumItems = await fetchCompendiumItems();
    const itemData = compendiumItems.find(
      d => d.name.toLowerCase() === itemName.toLowerCase()
    );
    if (!itemData) return;
    const silver = itemValueInSilver(itemData);
    if (silver > alcData.maxFormulaeValue) {
      ui.notifications.warn(`${itemName} (${formatCost(silver)}) exceeds your formula value cap of ${formatCost(alcData.maxFormulaeValue)}.`);
      return;
    }

    // Add to formulae
    const newFormulae = [...alcData.formulae, itemData.name];
    await alcData.tools.setFlag(MODULE_ID, "knownFormulae", newFormulae);
    ui.notifications.info(`Added ${itemName} as a known formula.`);
    this.render();
  }
}

// ── Singleton Launcher ───────────────────────────────────────────────────────

let _cookbookInstance = null;

function openCookbook(actor) {
  // Re-use if same actor and still has a live element
  if (_cookbookInstance && _cookbookInstance._actor?.id === actor.id && _cookbookInstance.element) {
    _cookbookInstance.bringToFront();
    _cookbookInstance.render(true);
    return;
  }
  // Close stale instance if any
  try { _cookbookInstance?.close(); } catch { /* already gone */ }
  _cookbookInstance = new AlchemyCookbookApp(actor);
  _cookbookInstance.render(true);
}

// ── Right-Click Integration ──────────────────────────────────────────────────
// Patch the Vagabond system's InventoryHandler to inject "Open Cookbook"
// into the existing right-click context menu for Alchemy Tools.

let _patched = false;

function _patchInventoryHandler() {
  if (_patched) return;

  // Foundry v13 ApplicationV2 fires "render{ClassName}" hooks, not "renderActorSheet".
  // Use renderApplicationV2 to catch all v2 sheets on first render.
  Hooks.on("renderApplicationV2", (app) => {
    if (_patched) return;
    if (!game.settings.get(MODULE_ID, "alchemistCookbook")) return;

    // The inventory handler is stored on the sheet instance
    const handler = app.inventoryHandler;
    if (!handler) return;

    const proto = Object.getPrototypeOf(handler);
    if (!proto || !proto.showInventoryContextMenu) return;

    const original = proto.showInventoryContextMenu;
    proto.showInventoryContextMenu = async function(event, itemId) {
      // Call original to build and show the menu
      await original.call(this, event, itemId);

      if (!game.settings.get(MODULE_ID, "alchemistCookbook")) return;
      const actor = this.actor;
      if (!actor || actor.type !== "character") return;

      const clickedItem = actor.items.get(itemId);
      if (!clickedItem) return;

      const menu = this._currentContextMenu;
      if (!menu) return;

      const self = this;
      const _closeMenu = () => {
        const { ContextMenuHelper } = globalThis.vagabond?.utils ?? {};
        if (ContextMenuHelper) {
          ContextMenuHelper.close(menu, () => { self._currentContextMenu = null; });
        } else {
          menu.remove();
          self._currentContextMenu = null;
        }
      };
      const _addMenuItem = (icon, label, callback) => {
        const el = document.createElement("div");
        el.classList.add("context-menu-item");
        el.innerHTML = `<i class="${icon}"></i><span>${label}</span>`;
        el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); _closeMenu(); callback(); });
        el.addEventListener("mouseenter", () => el.classList.add("hover"));
        el.addEventListener("mouseleave", () => el.classList.remove("hover"));
        menu.appendChild(el);
      };
      const _addDivider = () => {
        const hr = document.createElement("hr");
        hr.classList.add("context-menu-divider");
        menu.appendChild(hr);
      };

      // ── Alchemy Tools → Open Cookbook ──
      const alcData = getAlchemistData(actor);
      if (alcData && clickedItem.name.toLowerCase().includes("alchemy tools")) {
        _addDivider();
        _addMenuItem("fas fa-book-open", "Open Cookbook", () => openCookbook(actor));
      }

      // ── Oil items → Coat Weapon ──
      const isOil = clickedItem.type === "equipment"
        && clickedItem.system?.alchemicalType === "oil"
        && !clickedItem.flags?.[MODULE_ID]?.oilAppliedTo;
      if (isOil) {
        const meleeWeapons = actor.items.filter(i =>
          i.type === "equipment"
          && i.system?.equipmentType === "weapon"
          && i.system?.equipmentState !== "unequipped"
          && !i.flags?.[MODULE_ID]?.oilCoating  // not already coated
        );
        if (meleeWeapons.length) {
          _addDivider();
          for (const w of meleeWeapons) {
            _addMenuItem("fas fa-flask", `Coat: ${w.name}`, async () => {
              // Look up oil effect data
              const oilEffect = getAlchemicalEffect(clickedItem.name);
              // Flag the weapon as coated with full oil metadata
              await w.setFlag(MODULE_ID, "oilCoating", {
                oilName: clickedItem.name,
                oilItemId: clickedItem.id,
                silvered: oilEffect?.silvered ?? false,
                coatingDie: oilEffect?.coatingDie ?? "d6",
                coatingDamage: oilEffect?.coatingDamage ?? "1d6",
                coatingLight: oilEffect?.coatingLight ?? { dim: 5, bright: 0 },
                burnsTarget: oilEffect?.burnsTarget ?? false,
                burnsTargetDie: oilEffect?.burnsTargetDie ?? null,
              });
              // Consume the oil
              await clickedItem.handleConsumption?.();
              ui.notifications.info(`${clickedItem.name} applied to ${w.name}`);
              console.log(`${MODULE_ID} | Coated ${w.name} with ${clickedItem.name}`);
            });
          }
        }
      }

      // ── Coated weapon → Ignite / Remove Coating ──
      const coating = clickedItem.flags?.[MODULE_ID]?.oilCoating;
      if (coating && !clickedItem.flags?.[MODULE_ID]?.oilIgnited) {
        _addDivider();
        _addMenuItem("fas fa-fire", "Ignite", async () => {
          try {
            // Create countdown die using oil's die size
            const { CountdownDice } = globalThis.vagabond.documents;
            const dieName = `Burning Oil - ${clickedItem.name}`;
            const cdJournal = await CountdownDice.create({
              name: dieName,
              diceType: coating.coatingDie ?? "d6",
              size: "S",
            });

            // Flag weapon as ignited with coating metadata
            const isSilvered = coating.silvered ?? false;
            await clickedItem.setFlag(MODULE_ID, "oilIgnited", {
              countdownId: cdJournal?.id ?? null,
              damageFormula: coating.coatingDamage ?? "1d6",
              damageType: "fire",
              silvered: isSilvered,
              burnsTarget: coating.burnsTarget ?? false,
              burnsTargetDie: coating.burnsTargetDie ?? null,
            });

            // Set weapon metal to silver for the system's weakness check
            // Also handled as backup in registerOilBonusDamageHook() armor compensation
            if (isSilvered) {
              const origMetal = clickedItem.system?.metal ?? "none";
              await clickedItem.setFlag(MODULE_ID, "oilOriginalMetal", origMetal);
              await clickedItem.update({ "system.metal": "silver" });
              console.log(`${MODULE_ID} | Set weapon metal to silver (was: ${origMetal}). Verify: ${clickedItem.system.metal}`);
            }

            // Add dim light to the actor's token (burning weapon glow)
            const token = actor.getActiveTokens(true)[0];
            if (token?.document) {
              // Save original light so we can restore on douse
              const origLight = {
                dim: token.document.light?.dim ?? 0,
                bright: token.document.light?.bright ?? 0,
                color: token.document.light?.color ?? null,
                animation: token.document.light?.animation?.type ?? null,
              };
              await clickedItem.setFlag(MODULE_ID, "oilOriginalLight", origLight);
              const lightCfg = coating.coatingLight ?? { dim: 5, bright: 0 };
              await token.document.update({
                "light.dim": Math.max(token.document.light?.dim ?? 0, lightCfg.dim ?? 5),
                "light.bright": Math.max(token.document.light?.bright ?? 0, lightCfg.bright ?? 0),
                "light.color": "#ff6600",
                "light.alpha": 0.3,
                "light.animation.type": "torch",
                "light.animation.speed": 3,
                "light.animation.intensity": 3,
              });
            }

            // Store weapon reference on the countdown die for cleanup
            if (cdJournal) {
              await cdJournal.setFlag(MODULE_ID, "countdownDamage", {
                oilWeaponId: clickedItem.id,
                oilActorId: actor.id,
              });
            }

            ui.notifications.info(`${clickedItem.name} is now burning!`);
            console.log(`${MODULE_ID} | Ignited ${clickedItem.name}, countdown: ${cdJournal?.id}`);
          } catch (err) {
            console.error(`${MODULE_ID} | Failed to ignite weapon:`, err);
          }
        });
        _addMenuItem("fas fa-times", "Remove Coating", async () => {
          await clickedItem.unsetFlag(MODULE_ID, "oilCoating");
          ui.notifications.info(`Coating removed from ${clickedItem.name}`);
        });
      }

      // ── Ignited weapon → Douse ──
      if (clickedItem.flags?.[MODULE_ID]?.oilIgnited) {
        _addDivider();
        _addMenuItem("fas fa-tint", "Douse Flame", async () => {
          const ignited = clickedItem.flags[MODULE_ID].oilIgnited;
          // Remove the countdown die
          if (ignited.countdownId) {
            try {
              const journal = game.journal.get(ignited.countdownId);
              if (journal) await journal.delete();
            } catch { /* already gone */ }
          }
          // Restore original token light
          const origLight = clickedItem.flags?.[MODULE_ID]?.oilOriginalLight;
          const token = actor.getActiveTokens(true)[0];
          if (token?.document && origLight) {
            await token.document.update({
              "light.dim": origLight.dim ?? 0,
              "light.bright": origLight.bright ?? 0,
              "light.color": origLight.color ?? null,
              "light.alpha": 0.5,
              "light.animation.type": origLight.animation ?? null,
              "light.animation.speed": 5,
              "light.animation.intensity": 5,
            });
          }
          // Restore original damage type if silvered (Anointing Oil)
          // Legacy cleanup: restore metal/damageType if changed by older versions
          if (clickedItem.flags?.[MODULE_ID]?.oilOriginalDamageType !== undefined) {
            await clickedItem.update({ "system.damageType": clickedItem.flags[MODULE_ID].oilOriginalDamageType });
            await clickedItem.unsetFlag(MODULE_ID, "oilOriginalDamageType");
          }
          if (clickedItem.flags?.[MODULE_ID]?.oilOriginalMetal !== undefined) {
            await clickedItem.update({ "system.metal": clickedItem.flags[MODULE_ID].oilOriginalMetal });
            await clickedItem.unsetFlag(MODULE_ID, "oilOriginalMetal");
          }
          // Clear weapon flags
          await clickedItem.unsetFlag(MODULE_ID, "oilOriginalLight");
          await clickedItem.unsetFlag(MODULE_ID, "oilIgnited");
          await clickedItem.unsetFlag(MODULE_ID, "oilCoating");
          ui.notifications.info(`${clickedItem.name} flame doused, coating removed.`);
        });
      }
    };

    _patched = true;
    console.log(`${MODULE_ID} | Patched InventoryHandler with Cookbook context menu.`);
  });
}

// ── Inline Sheet Tab ─────────────────────────────────────────────────────────
// Injects a "Cookbook" tab on alchemist character sheets (same pattern as Beast Form).

let _sheetPatched = false;

function _patchCookbookSheet() {
  if (_sheetPatched) return;

  Hooks.on("renderApplicationV2", (app) => {
    if (app.document?.type === "character") {
      _injectCookbookTab(app);
    }
  });

  _sheetPatched = true;
  console.log(`${MODULE_ID} | AlchemyCookbook | Registered render hook for inline Cookbook tab.`);
}

async function _injectCookbookTab(sheet) {
  const actor = sheet.document;
  if (actor?.type !== "character") return;

  const sheetEl = sheet.element;
  if (!sheetEl) return;

  const windowContent = sheetEl.querySelector(".window-content");
  if (!windowContent) return;

  const tabNav = windowContent.querySelector("nav.sheet-tabs");
  if (!tabNav) return;

  // Check if this actor is an alchemist
  const features = actor.getFlag(MODULE_ID, "features");
  const isAlchemist = !!features?.alchemist_alchemy;

  if (!isAlchemist) {
    // Not an alchemist — clean up stale elements
    windowContent.querySelector('section.tab[data-tab="vce-cookbook"]')?.remove();
    tabNav.querySelector('[data-tab="vce-cookbook"]')?.remove();
    return;
  }

  // Remove stale elements to avoid duplicates on re-render
  windowContent.querySelector('section.tab[data-tab="vce-cookbook"]')?.remove();
  tabNav.querySelector('[data-tab="vce-cookbook"]')?.remove();

  // Create tab link
  const cookbookTab = document.createElement("a");
  cookbookTab.dataset.action = "tab";
  cookbookTab.dataset.tab = "vce-cookbook";
  cookbookTab.dataset.group = "primary";
  cookbookTab.innerHTML = "<span>Cookbook</span>";
  // Insert after the last existing tab
  tabNav.appendChild(cookbookTab);

  // Create tab section
  const cookbookSection = document.createElement("section");
  cookbookSection.className = "tab vce-cookbook-tab scrollable";
  cookbookSection.dataset.tab = "vce-cookbook";
  cookbookSection.dataset.group = "primary";

  // Build the cookbook HTML
  cookbookSection.innerHTML = await _buildInlineCookbookHTML(actor);

  // Insert before the sliding panel
  const slidingPanel = windowContent.querySelector("aside.sliding-panel");
  if (slidingPanel) {
    windowContent.insertBefore(cookbookSection, slidingPanel);
  } else {
    windowContent.appendChild(cookbookSection);
  }

  const actorSheet = actor.sheet;

  // Click handler for Cookbook tab
  cookbookTab.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
    windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
    cookbookTab.classList.add("active");
    cookbookSection.classList.add("active");
    actorSheet._vceActiveTab = "vce-cookbook";
    if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-cookbook";
  });

  // Maintain tab state across re-renders
  const desiredTab = actorSheet._vceActiveTab;
  if (desiredTab === "vce-cookbook") {
    tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
    windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
    cookbookTab.classList.add("active");
    cookbookSection.classList.add("active");
    if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-cookbook";
  }

  // Track when user clicks other tabs
  tabNav.querySelectorAll("[data-tab]:not([data-tab='vce-cookbook'])").forEach(t => {
    t.addEventListener("click", () => {
      actorSheet._vceActiveTab = t.dataset.tab;
    });
  });

  // Bind cookbook events
  _bindCookbookEvents(cookbookSection, actor, actorSheet);
}

async function _buildInlineCookbookHTML(actor) {
  const alcData = getAlchemistData(actor);
  if (!alcData) {
    return `<div class="vce-bf-prompt">
      <i class="fas fa-flask vce-bf-prompt-icon" aria-hidden="true"></i>
      <h2 class="vce-bf-prompt-title">Cookbook</h2>
      <p class="vce-bf-prompt-desc">No Alchemy Tools found</p>
    </div>`;
  }

  const compendiumItems = await fetchCompendiumItems();
  const formulaeSet = new Set(alcData.formulae.map(f => f.toLowerCase()));

  let displayItems = compendiumItems.map(itemData => {
    const silver = itemValueInSilver(itemData);
    const isFormula = formulaeSet.has(itemData.name.toLowerCase());
    const cost = getCraftCost(itemData, isFormula);
    const aType = itemData.system?.alchemicalType ?? "unknown";

    return {
      name: itemData.name,
      img: itemData.img ?? "icons/svg/item-bag.svg",
      alchemicalType: aType.charAt(0).toUpperCase() + aType.slice(1),
      silver,
      valueLabel: formatCost(silver),
      cost,
      costLabel: formatCost(cost),
      isFormula,
      cantAfford: cost > alcData.totalSilver,
      eligibleAsFormula: silver <= alcData.maxFormulaeValue,
    };
  });

  // Sort: formulae first, then by silver value
  displayItems.sort((a, b) => {
    if (a.isFormula !== b.isFormula) return a.isFormula ? -1 : 1;
    return a.silver - b.silver;
  });

  // Header
  let html = `<div class="vcb-cookbook">
    <div class="vcb-cook-header">
      <div class="vcb-cook-stat">
        <i class="fas fa-gem"></i>
        <span>Materials: <strong>${alcData.totalSilver}s</strong> remaining</span>
      </div>
      <div class="vcb-cook-stat">
        <i class="fas fa-star" style="color:#facc15"></i>
        <span>Formulae: <strong>${alcData.formulae.length}/${alcData.maxFormulaeCount}</strong>
          (Lv${alcData.level}, max ${formatCost(alcData.maxFormulaeValue)})</span>
      </div>
    </div>
    <div class="vcb-cook-search">
      <i class="fas fa-search"></i>
      <input type="text" class="vcb-cook-search-input" placeholder="Search items..." value="" />
    </div>
    <div class="vcb-cook-list">`;

  for (const item of displayItems) {
    const disabledClass = item.cantAfford ? "vcb-cook-disabled" : "";
    const formulaClass = item.isFormula ? "vcb-cook-formula" : "";
    const costClass = item.isFormula ? "vcb-cook-cost-formula" : "";
    const starHtml = item.isFormula ? `<i class="fas fa-star vcb-cook-star"></i>` : "";
    const tooltip = item.isFormula ? "Right-click to remove formula" : "Right-click to add as formula";

    html += `
      <div class="vcb-cook-item ${disabledClass} ${formulaClass}"
           data-item-name="${item.name}" data-eligible="${item.eligibleAsFormula}"
           title="${tooltip}">
        <img class="vcb-cook-item-img" src="${item.img}" width="28" height="28" />
        <div class="vcb-cook-item-info">
          <span class="vcb-cook-item-name">${starHtml} ${item.name}</span>
          <span class="vcb-cook-item-type">${item.alchemicalType}</span>
        </div>
        <span class="vcb-cook-item-value">${item.valueLabel}</span>
        <span class="vcb-cook-item-cost ${costClass}">${item.costLabel}</span>
        <button class="vcb-cook-craft-btn" data-item-name="${item.name}"
                data-is-formula="${item.isFormula}"
                ${item.cantAfford ? "disabled" : ""}>
          <i class="fas fa-hammer"></i> Craft
        </button>
      </div>`;
  }

  html += `</div></div>`;
  return html;
}

function _bindCookbookEvents(container, actor, actorSheet) {
  // Search
  const searchInput = container.querySelector(".vcb-cook-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const search = searchInput.value.toLowerCase();
      container.querySelectorAll(".vcb-cook-item").forEach(row => {
        const name = row.dataset.itemName?.toLowerCase() || "";
        const type = row.querySelector(".vcb-cook-item-type")?.textContent?.toLowerCase() || "";
        const match = !search || name.includes(search) || type.includes(search);
        row.style.display = match ? "" : "none";
      });
    });
  }

  // Craft buttons
  container.querySelectorAll(".vcb-cook-craft-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const itemName = btn.dataset.itemName;
      const isFormula = btn.dataset.isFormula === "true";
      btn.disabled = true;
      await craftItem(actor, itemName, isFormula);
      // Re-render the sheet to update materials/formulae counts
      actor.sheet?.render(false);
    });
  });

  // Right-click on item row — toggle formula
  container.querySelectorAll(".vcb-cook-item").forEach(row => {
    row.addEventListener("contextmenu", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemName = row.dataset.itemName;

      const alcData = getAlchemistData(actor);
      if (!alcData?.tools) return;

      const isKnown = alcData.formulae.some(f => f.toLowerCase() === itemName.toLowerCase());

      if (isKnown) {
        const newFormulae = alcData.formulae.filter(
          f => f.toLowerCase() !== itemName.toLowerCase()
        );
        await alcData.tools.setFlag(MODULE_ID, "knownFormulae", newFormulae);
        ui.notifications.info(`Removed ${itemName} from formulae.`);
      } else {
        if (alcData.formulae.length >= alcData.maxFormulaeCount) {
          ui.notifications.warn(`You already know ${alcData.maxFormulaeCount} formulae (max for your level).`);
          return;
        }
        const itemSilver = itemValueInSilver(
          (await fetchCompendiumItems()).find(i => i.name.toLowerCase() === itemName.toLowerCase())
        );
        if (itemSilver > alcData.maxFormulaeValue) {
          ui.notifications.warn(`${itemName} (${formatCost(itemSilver)}) exceeds your max formula value (${formatCost(alcData.maxFormulaeValue)}).`);
          return;
        }
        await alcData.tools.setFlag(MODULE_ID, "knownFormulae", [...alcData.formulae, itemName]);
        ui.notifications.info(`Added ${itemName} as a known formula.`);
      }
      // Re-render to update the list
      actor.sheet?.render(false);
    });
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export const AlchemyCookbook = {

  /**
   * Initialize: patch InventoryHandler to add "Open Cookbook"
   * to the Alchemy Tools right-click context menu,
   * and inject the Cookbook tab on alchemist character sheets.
   */
  init() {
    if (!game.settings.get(MODULE_ID, "alchemistCookbook")) return;
    _patchInventoryHandler();
    _patchCookbookSheet();
  },

  /** Open the cookbook for a given actor (callable from console/macros). */
  open: openCookbook,
};
