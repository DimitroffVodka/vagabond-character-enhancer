/**
 * Gold Sink Sheet Injection
 * Adds a "Gold Sink" shop tab to Merchant character sheets.
 * Browse compendium items (weapons, armor, gear, alchemical) and buy/sell.
 * Junk flag is shared with vagabond-crawler module.
 */

import { MODULE_ID, log, hasFeature } from "../utils.mjs";
import {
  isOffensiveType, convertToWeapon, prepareForInventory,
  getAlchemicalEffect, getConsumableEffect,
} from "../alchemy/alchemy-helpers.mjs";

const CRAWLER_ID = "vagabond-crawler";
const SELL_SETTING = "goldSinkSellRatio";

const SHOP_PACKS = [
  { id: "vagabond.weapons",          label: "Weapons",    icon: "fa-sword" },
  { id: "vagabond.armor",            label: "Armor",      icon: "fa-shield-halved" },
  { id: "vagabond.gear",             label: "Gear",       icon: "fa-toolbox" },
  { id: "vagabond.alchemical-items", label: "Alchemical", icon: "fa-flask" },
];

// Cached compendium data (loaded once)
let _shopItems = null;
let _gearFolders = null;

/* -------------------------------------------- */
/*  Currency Helpers                             */
/* -------------------------------------------- */

function _toCopper({ gold = 0, silver = 0, copper = 0 }) {
  return (gold * 10000) + (silver * 100) + copper;
}

function _fromCopper(total) {
  total = Math.max(0, Math.round(total));
  const gold = Math.floor(total / 10000);
  total -= gold * 10000;
  const silver = Math.floor(total / 100);
  const copper = total - silver * 100;
  return { gold, silver, copper };
}

function _formatPrice({ gold = 0, silver = 0, copper = 0 }) {
  const parts = [];
  if (gold) parts.push(`${gold}g`);
  if (silver) parts.push(`${silver}s`);
  if (copper) parts.push(`${copper}c`);
  return parts.length ? parts.join(" ") : "Free";
}

function _canAfford(actor, costCopper) {
  const cur = actor.system.currency ?? { gold: 0, silver: 0, copper: 0 };
  return _toCopper(cur) >= costCopper;
}

async function _deductCurrency(actor, costCopper) {
  const cur = actor.system.currency ?? { gold: 0, silver: 0, copper: 0 };
  // Deduct from copper first, then silver, then gold — preserve denominations
  let { gold, silver, copper } = { ...cur };
  let remaining = costCopper;
  // Take from copper
  const fromCopper = Math.min(copper, remaining);
  copper -= fromCopper; remaining -= fromCopper;
  // Take from silver (1s = 100c)
  const silverNeeded = Math.min(silver, Math.ceil(remaining / 100));
  copper += (silverNeeded * 100) - remaining;
  silver -= silverNeeded; remaining = 0;
  if (copper < 0) { // overflow: borrow more silver
    const extra = Math.ceil(-copper / 100);
    silver -= extra; copper += extra * 100;
  }
  if (silver < 0) { // borrow from gold
    const extra = Math.ceil(-silver / 100);
    gold -= extra; silver += extra * 100;
  }
  await actor.update({ "system.currency": { gold: Math.max(0, gold), silver: Math.max(0, silver), copper: Math.max(0, copper) } });
}

async function _addCurrency(actor, amountCopper) {
  const cur = actor.system.currency ?? { gold: 0, silver: 0, copper: 0 };
  // Add as silver (most common denomination), overflow to gold
  let { gold, silver, copper } = { ...cur };
  copper += amountCopper;
  if (copper >= 100) {
    silver += Math.floor(copper / 100);
    copper = copper % 100;
  }
  if (silver >= 100) {
    gold += Math.floor(silver / 100);
    silver = silver % 100;
  }
  await actor.update({ "system.currency": { gold, silver, copper } });
}

function _getSellRatio() {
  try { return game.settings.get(MODULE_ID, SELL_SETTING) / 100; }
  catch { return 1.0; }
}

/* -------------------------------------------- */
/*  Compendium Loading                           */
/* -------------------------------------------- */

async function _loadShopItems() {
  if (_shopItems) return _shopItems;

  const items = [];
  const folders = new Map(); // packId -> [{id, name}]

  for (const pack of SHOP_PACKS) {
    const compendium = game.packs.get(pack.id);
    if (!compendium) continue;

    // Get full documents for cost data
    const docs = await compendium.getDocuments();
    const packFolders = (await compendium.folders).map(f => ({ id: f._id, name: f.name }));
    if (packFolders.length) folders.set(pack.id, packFolders);

    for (const doc of docs) {
      items.push({
        uuid: doc.uuid,
        name: doc.name,
        img: doc.img ?? "icons/svg/item-bag.svg",
        packId: pack.id,
        packLabel: pack.label,
        folderId: doc.folder?._id ?? doc.folder ?? null,
        baseCost: doc.system?.baseCost ?? { gold: 0, silver: 0, copper: 0 },
        costCopper: _toCopper(doc.system?.baseCost ?? {}),
        slots: doc.system?.baseSlots ?? 1,
      });
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  _shopItems = items;
  _gearFolders = folders.get("vagabond.gear") ?? [];
  _gearFolders.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

/* -------------------------------------------- */
/*  HTML Builders                                */
/* -------------------------------------------- */

function _buildTabHTML(actor, items, state) {
  const cur = actor.system.currency ?? { gold: 0, silver: 0, copper: 0 };
  const walletCopper = _toCopper(cur);
  const sellRatio = _getSellRatio();
  const ratioLabel = Math.round(sellRatio * 100);

  // Get favorites set
  const favorites = new Set(actor.getFlag(MODULE_ID, "goldSinkFavorites") ?? []);

  // Filter shop items
  let filtered = items;
  if (state.enabledPacks.size) {
    filtered = filtered.filter(i => state.enabledPacks.has(i.packId));
  }
  if (state.gearFolder) {
    filtered = filtered.filter(i => i.packId !== "vagabond.gear" || i.folderId === state.gearFolder);
  }
  if (state.search) {
    const s = state.search.toLowerCase();
    filtered = filtered.filter(i => i.name.toLowerCase().includes(s));
  }

  // Check for junk items
  const junkItems = actor.items.filter(i =>
    i.type === "equipment" && i.getFlag(CRAWLER_ID, "junk")
  );
  const hasJunk = junkItems.length > 0;
  const junkTotal = junkItems.reduce((sum, i) => {
    const cost = i.system?.baseCost ?? { gold: 0, silver: 0, copper: 0 };
    const qty = i.system?.quantity ?? 1;
    return sum + Math.round(_toCopper(cost) * sellRatio) * qty;
  }, 0);

  // --- Header ---
  let html = `
    <div class="vce-gs-header">
      <div class="vce-gs-wallet">
        <i class="fas fa-coins"></i>
        <span>${_formatPrice(cur)}</span>
      </div>
      ${hasJunk ? `<button class="vce-gs-sell-all-btn"><i class="fas fa-trash"></i> Sell Junk (${junkItems.length}) &mdash; ${_formatPrice(_fromCopper(junkTotal))}</button>` : ""}
    </div>`;

  // --- Search ---
  html += `
    <div class="vce-gs-search">
      <i class="fas fa-search"></i>
      <input type="text" class="vce-gs-search-input" placeholder="Search items..." value="${state.search || ""}">
    </div>`;

  // --- Type Filters ---
  html += `<div class="vce-gs-filters">`;
  for (const pack of SHOP_PACKS) {
    const active = state.enabledPacks.has(pack.id) ? "active" : "";
    html += `<button class="vce-gs-filter-btn ${active}" data-pack="${pack.id}">
      <i class="fas ${pack.icon}"></i> ${pack.label}
    </button>`;
  }
  html += `</div>`;

  // --- Gear subfolder dropdown ---
  const gearActive = state.enabledPacks.has("vagabond.gear");
  if (gearActive && _gearFolders?.length) {
    html += `<div class="vce-gs-subfolder">
      <select class="vce-gs-folder-select">
        <option value="">All Gear</option>
        ${_gearFolders.map(f => `<option value="${f.id}" ${state.gearFolder === f.id ? "selected" : ""}>${f.name}</option>`).join("")}
      </select>
    </div>`;
  }

  // --- Shop Items (favorites first) ---
  filtered.sort((a, b) => {
    const aFav = favorites.has(a.uuid);
    const bFav = favorites.has(b.uuid);
    if (aFav !== bFav) return aFav ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  html += `<div class="vce-gs-shop-list">`;
  if (!filtered.length) {
    html += `<div class="vce-gs-empty">No items match your filters.</div>`;
  }
  for (const item of filtered) {
    const cantAfford = item.costCopper > walletCopper;
    const isFav = favorites.has(item.uuid);
    html += `
      <div class="vce-gs-item ${cantAfford ? "cant-afford" : ""} ${isFav ? "vce-gs-fav" : ""}" data-uuid="${item.uuid}">
        <img class="vce-gs-item-img" src="${item.img}" width="24" height="24">
        ${isFav ? '<i class="fas fa-star vce-gs-fav-icon"></i>' : ""}
        <span class="vce-gs-item-name">${item.name}</span>
        <span class="vce-gs-item-cost">${_formatPrice(item.baseCost)}</span>
        <button class="vce-gs-buy-btn" ${cantAfford ? "disabled" : ""}>Buy</button>
      </div>`;
  }
  html += `</div>`;

  return html;
}

/* -------------------------------------------- */
/*  Event Binding                                */
/* -------------------------------------------- */

function _bindEvents(section, actor, state, rebuildFn) {
  // Search input
  const searchInput = section.querySelector(".vce-gs-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.search = e.target.value;
      rebuildFn();
      // Re-focus and restore cursor
      const newInput = section.querySelector(".vce-gs-search-input");
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(newInput.value.length, newInput.value.length);
      }
    });
  }

  // Type filter toggles
  section.querySelectorAll(".vce-gs-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const packId = btn.dataset.pack;
      if (state.enabledPacks.has(packId)) {
        state.enabledPacks.delete(packId);
      } else {
        state.enabledPacks.add(packId);
      }
      // Reset gear folder if gear is deselected
      if (!state.enabledPacks.has("vagabond.gear")) state.gearFolder = "";
      rebuildFn();
    });
  });

  // Gear subfolder dropdown
  const folderSelect = section.querySelector(".vce-gs-folder-select");
  if (folderSelect) {
    folderSelect.addEventListener("change", () => {
      state.gearFolder = folderSelect.value;
      rebuildFn();
    });
  }

  // Right-click shop items to toggle favorite
  section.querySelectorAll(".vce-gs-item").forEach(row => {
    row.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const uuid = row.dataset.uuid;
      if (!uuid) return;
      const favs = new Set(actor.getFlag(MODULE_ID, "goldSinkFavorites") ?? []);
      if (favs.has(uuid)) {
        favs.delete(uuid);
      } else {
        favs.add(uuid);
      }
      await actor.setFlag(MODULE_ID, "goldSinkFavorites", [...favs]);
    });
  });

  // Buy buttons
  section.querySelectorAll(".vce-gs-buy-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest(".vce-gs-item");
      const uuid = row?.dataset.uuid;
      if (!uuid) return;

      const item = _shopItems?.find(i => i.uuid === uuid);
      if (!item) return;

      if (!_canAfford(actor, item.costCopper)) {
        ui.notifications.warn("Not enough gold!");
        return;
      }

      // Deduct currency and create item on actor
      const doc = await fromUuid(uuid);
      if (!doc) return;

      await _deductCurrency(actor, item.costCopper);

      // Alchemical items use the same prep as Alchemist crafting
      if (item.packId === "vagabond.alchemical-items") {
        const raw = doc.toObject();
        let newItemData;
        if (isOffensiveType(raw)) {
          newItemData = convertToWeapon(raw);
          newItemData.name = `${raw.name} (Weapon)`;
        } else {
          newItemData = prepareForInventory(raw);
          const consEffect = getConsumableEffect(raw.name);
          if (consEffect && newItemData.system?.damageType !== "healing") {
            if (newItemData.system) {
              newItemData.system.damageAmount = "";
              newItemData.system.damageType = "-";
            }
          }
          if (newItemData.system) {
            newItemData.system.equipped = true;
            if (newItemData.system.damageType === "healing") {
              newItemData.system.isConsumable = true;
              newItemData.system.locked = true;
            }
          }
        }
        const [createdItem] = await actor.createEmbeddedDocuments("Item", [newItemData]);
        const effect = getAlchemicalEffect(raw.name);
        if (effect && createdItem) {
          await createdItem.setFlag(MODULE_ID, "alchemicalEffect", effect);
        }
      } else {
        await Item.create(doc.toObject(), { parent: actor });
      }
      log("Merchant", `Gold Sink: Bought ${item.name} for ${_formatPrice(item.baseCost)}`);

      // Chat card for purchase
      await ChatMessage.create({
        speaker: { alias: "Gold Sink" },
        content: `<div class="vagabond-chat-card-v2" data-card-type="generic">
          <div class="card-body">
            <header class="card-header">
              <div class="header-icon">
                <img src="${item.img}" alt="${item.name}">
              </div>
              <div class="header-info">
                <h3 class="header-title">Item Purchased</h3>
                <div class="metadata-tags-row">
                  <div class="meta-tag"><span>${actor.name}</span></div>
                </div>
              </div>
            </header>
            <section class="content-body">
              <div class="card-description" style="padding:4px 0;">
                <p><strong>${actor.name}</strong> bought <strong>${item.name}</strong> for ${_formatPrice(item.baseCost)}.</p>
              </div>
            </section>
          </div>
        </div>`,
      });
    });
  });

  // Sell All Junk button
  const sellAllBtn = section.querySelector(".vce-gs-sell-all-btn");
  if (sellAllBtn) {
    sellAllBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const junkItems = actor.items.filter(i =>
        i.type === "equipment" && i.getFlag(CRAWLER_ID, "junk")
      );
      if (!junkItems.length) return;

      const sellRatio = _getSellRatio();
      const totalCopper = junkItems.reduce((sum, i) => {
        const cost = i.system?.baseCost ?? { gold: 0, silver: 0, copper: 0 };
        const qty = i.system?.quantity ?? 1;
        return sum + Math.round(_toCopper(cost) * sellRatio) * qty;
      }, 0);

      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Sell All Junk" },
        content: `<p>Sell ${junkItems.length} junk item(s) for ${_formatPrice(_fromCopper(totalCopper))}?</p>`,
        yes: { default: true },
      });
      if (!confirmed) return;

      // Capture item details before deletion
      const soldDetails = junkItems.map(i => ({
        name: i.name,
        img: i.img ?? "icons/svg/item-bag.svg",
        qty: i.system?.quantity ?? 1,
        sellCopper: Math.round(_toCopper(i.system?.baseCost ?? {}) * sellRatio) * (i.system?.quantity ?? 1),
      }));

      // Delete all junk items and add currency
      await actor.deleteEmbeddedDocuments("Item", junkItems.map(i => i.id));
      await _addCurrency(actor, totalCopper);
      log("Merchant", `Gold Sink: Sold ${junkItems.length} junk items for ${_formatPrice(_fromCopper(totalCopper))}`);

      // Chat card
      await _postSellChatCard(actor, soldDetails, totalCopper, sellRatio);

      // Loot log (if vagabond-crawler is active)
      await _logToLootTracker(actor, soldDetails, totalCopper);
    });
  }
}

/* -------------------------------------------- */
/*  Public API — Buy a favorited item            */
/* -------------------------------------------- */

/** Expose cached shop items for the crawler API */
export function getShopItems() { return _shopItems; }

export async function buyFavoriteItem(actor, uuid) {
  if (!_shopItems) await _loadShopItems();
  const item = _shopItems?.find(i => i.uuid === uuid);
  if (!item) { ui.notifications.warn("Item not found in shop."); return false; }

  if (!_canAfford(actor, item.costCopper)) {
    ui.notifications.warn("Not enough gold!");
    return false;
  }

  const doc = await fromUuid(uuid);
  if (!doc) return false;

  await _deductCurrency(actor, item.costCopper);

  // Alchemical items use the same prep as Alchemist crafting
  if (item.packId === "vagabond.alchemical-items") {
    const raw = doc.toObject();
    let newItemData;
    if (isOffensiveType(raw)) {
      newItemData = convertToWeapon(raw);
      newItemData.name = `${raw.name} (Weapon)`;
    } else {
      newItemData = prepareForInventory(raw);
      const consEffect = getConsumableEffect(raw.name);
      if (consEffect && newItemData.system?.damageType !== "healing") {
        if (newItemData.system) {
          newItemData.system.damageAmount = "";
          newItemData.system.damageType = "-";
        }
      }
      if (newItemData.system) {
        newItemData.system.equipped = true;
        if (newItemData.system.damageType === "healing") {
          newItemData.system.isConsumable = true;
          newItemData.system.locked = true;
        }
      }
    }
    const [createdItem] = await actor.createEmbeddedDocuments("Item", [newItemData]);
    const effect = getAlchemicalEffect(raw.name);
    if (effect && createdItem) {
      await createdItem.setFlag(MODULE_ID, "alchemicalEffect", effect);
    }
  } else {
    await Item.create(doc.toObject(), { parent: actor });
  }

  log("Merchant", `Gold Sink: Bought ${item.name} for ${_formatPrice(item.baseCost)}`);

  // Chat card
  await ChatMessage.create({
    speaker: { alias: "Gold Sink" },
    content: `<div class="vagabond-chat-card-v2" data-card-type="generic">
      <div class="card-body">
        <header class="card-header">
          <div class="header-icon">
            <img src="${item.img}" alt="${item.name}">
          </div>
          <div class="header-info">
            <h3 class="header-title">Item Purchased</h3>
            <div class="metadata-tags-row">
              <div class="meta-tag"><span>${actor.name}</span></div>
            </div>
          </div>
        </header>
        <section class="content-body">
          <div class="card-description" style="padding:4px 0;">
            <p><strong>${actor.name}</strong> bought <strong>${item.name}</strong> for ${_formatPrice(item.baseCost)}.</p>
          </div>
        </section>
      </div>
    </div>`,
  });

  return true;
}

/* -------------------------------------------- */
/*  Chat Card                                    */
/* -------------------------------------------- */

async function _postSellChatCard(actor, soldDetails, totalCopper, sellRatio) {
  const ratioLabel = Math.round(sellRatio * 100);
  const itemLines = soldDetails.map(d =>
    `<li>${d.qty > 1 ? `${d.qty} x ` : ""}${d.name} — ${_formatPrice(_fromCopper(d.sellCopper))}</li>`
  ).join("");

  await ChatMessage.create({
    speaker: { alias: "Gold Sink" },
    content: `<div class="vagabond-chat-card-v2" data-card-type="generic">
      <div class="card-body">
        <header class="card-header">
          <div class="header-icon">
            <img src="icons/containers/chest-treasure-glowing-gold.webp" alt="Gold Sink">
          </div>
          <div class="header-info">
            <h3 class="header-title">Items Sold</h3>
            <div class="metadata-tags-row">
              <div class="meta-tag"><span>${actor.name}</span></div>
              <div class="meta-tag"><span>${ratioLabel}% value</span></div>
            </div>
          </div>
        </header>
        <section class="content-body">
          <div class="card-description" style="padding:4px 0;">
            <ul style="margin:4px 0;padding-left:18px;">${itemLines}</ul>
            <p style="margin-top:6px;"><strong>Total: ${_formatPrice(_fromCopper(totalCopper))}</strong></p>
          </div>
        </section>
      </div>
    </div>`,
  });
}

/* -------------------------------------------- */
/*  Loot Log (vagabond-crawler integration)      */
/* -------------------------------------------- */

async function _logToLootTracker(actor, soldDetails, totalCopper) {
  if (!game.modules.get(CRAWLER_ID)?.active) return;

  try {
    const existing = game.settings.get(CRAWLER_ID, "lootLog") ?? [];
    const now = Date.now();
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const entries = soldDetails.map(d => ({
      player: actor.name,
      source: "Gold Sink",
      type: "currency",
      detail: `${d.qty > 1 ? d.qty + " x " : ""}${d.name}: ${_formatPrice(_fromCopper(d.sellCopper))}`,
      img: d.img,
      timestamp: now,
      time,
    }));

    await game.settings.set(CRAWLER_ID, "lootLog", [...existing, ...entries]);
    log("Merchant", `Gold Sink: Logged ${entries.length} entries to loot tracker.`);
  } catch (e) {
    log("Merchant", `Gold Sink: Could not log to loot tracker —`, e.message);
  }
}

/* -------------------------------------------- */
/*  Sheet Injection                              */
/* -------------------------------------------- */

export const GoldSinkSheet = {

  _patched: false,

  patchSheet() {
    if (this._patched) return;
    const self = this;

    // Pre-load shop items (already inside the ready hook, so call directly)
    _loadShopItems();

    Hooks.on("renderApplicationV2", (app, html, data) => {
      if (app.document?.type === "character") {
        self._injectGoldSink(app);
      }
    });

    this._patched = true;
    log("Merchant", "Gold Sink sheet hooks registered.");
  },

  _injectGoldSink(sheet) {
    const actor = sheet.document;
    if (actor?.type !== "character") return;

    const sheetEl = sheet.element;
    if (!sheetEl) return;

    const windowContent = sheetEl.querySelector(".window-content");
    if (!windowContent) return;

    const tabNav = windowContent.querySelector("nav.sheet-tabs");
    if (!tabNav) return;

    // Only show for Merchants with Gold Sink feature
    const hasMerchant = hasFeature(actor, "merchant_goldSink");

    if (!hasMerchant) {
      windowContent.querySelector('section.tab[data-tab="vce-gold-sink"]')?.remove();
      tabNav.querySelector('[data-tab="vce-gold-sink"]')?.remove();
      return;
    }

    // Remove stale elements
    windowContent.querySelector('section.tab[data-tab="vce-gold-sink"]')?.remove();
    tabNav.querySelector('[data-tab="vce-gold-sink"]')?.remove();

    // Create tab link
    const gsTab = document.createElement("a");
    gsTab.dataset.action = "tab";
    gsTab.dataset.tab = "vce-gold-sink";
    gsTab.dataset.group = "primary";
    gsTab.innerHTML = "<span>Gold Sink</span>";
    tabNav.prepend(gsTab);

    // Create tab section
    const gsSection = document.createElement("section");
    gsSection.className = "tab vce-gold-sink scrollable";
    gsSection.dataset.tab = "vce-gold-sink";
    gsSection.dataset.group = "primary";

    // Per-sheet filter state (persists across re-renders)
    if (!sheet._vceGoldSinkState) {
      sheet._vceGoldSinkState = {
        search: "",
        enabledPacks: new Set(SHOP_PACKS.map(p => p.id)),
        gearFolder: "",
      };
    }
    const state = sheet._vceGoldSinkState;

    const rebuild = () => {
      if (!_shopItems) return;
      gsSection.innerHTML = _buildTabHTML(actor, _shopItems, state);
      _bindEvents(gsSection, actor, state, rebuild);
    };

    if (_shopItems) {
      rebuild();
    } else {
      gsSection.innerHTML = `<div class="vce-gs-empty"><i class="fas fa-spinner fa-spin"></i> Loading shop...</div>`;
      _loadShopItems().then(() => rebuild());
    }

    // Insert section before first tab or before sliding panel
    const firstTab = windowContent.querySelector("section.tab");
    if (firstTab) {
      windowContent.insertBefore(gsSection, firstTab);
    } else {
      const slidingPanel = windowContent.querySelector("aside.sliding-panel");
      windowContent.insertBefore(gsSection, slidingPanel);
    }

    // Tab click handler
    const actorSheet = actor.sheet;
    gsTab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      gsTab.classList.add("active");
      gsSection.classList.add("active");
      actorSheet._vceActiveTab = "vce-gold-sink";
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-gold-sink";
    });

    // Restore active tab
    const desiredTab = actorSheet._vceActiveTab;
    if (desiredTab === "vce-gold-sink") {
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      gsTab.classList.add("active");
      gsSection.classList.add("active");
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-gold-sink";
    }

    // Track other tab clicks
    tabNav.querySelectorAll("[data-tab]:not([data-tab='vce-gold-sink'])").forEach(t => {
      t.addEventListener("click", () => {
        actorSheet._vceActiveTab = t.dataset.tab;
      });
    });
  },
};
