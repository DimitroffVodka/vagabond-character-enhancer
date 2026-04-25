/**
 * CompanionManagerTab — renders the Companions tab on character sheets.
 *
 * Replaces the current Summon tab (vce-summon). Reads flagged companions
 * via CompanionSpawner.getCompanionsFor(pc) and injects inline HTML cards.
 * Source-agnostic: same renderer handles summons, familiars, hirelings.
 *
 * Key implementation notes vs plan skeleton:
 * - NPC companion actions come from actor.system.actions[] (a system-level
 *   array on NPC actors), NOT from items with type "featureAction". The
 *   Vagabond system does not use item types "weapon" or "featureAction" on
 *   NPC actors — their actions are embedded arrays, not items.
 * - Character hireling weapons use i.type === "equipment" &&
 *   i.system.equipmentType === "weapon" && i.system.equipped (not
 *   i.type === "weapon"). This matches how barbarian.mjs and aura-manager.mjs
 *   enumerate equipped weapons on character actors.
 * - Action clicks on NPC cards roll via the controller PC's skill using the
 *   existing summoner/familiar rollAction pattern (system.actions[idx] +
 *   VagabondChatCard.createActionCard called on the controller).
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { CompanionSpawner } from "./companion-spawner.mjs";
import { SummonerFeatures } from "../class-features/summoner.mjs";
import { FamiliarFeatures } from "../perk-features/familiar.mjs";
import { BeastSpell } from "../spell-features/beast-spell.mjs";
import { RaiseSpell } from "../spell-features/raise-spell.mjs";
import { AnimateSpell } from "../spell-features/animate-spell.mjs";
import { AnimalCompanion } from "../perk-features/animal-companion.mjs";
import { ReanimatorPerk } from "../perk-features/reanimator.mjs";
import { ConjurerPerk } from "../perk-features/conjurer.mjs";

/**
 * Registry of spawn-capable sources the tab action bar renders buttons for.
 * Each entry decides whether the PC can use it and exposes an onClick.
 * Source-agnostic: this is the single place to wire new adapters into the UI.
 */
const ACTION_BAR_ENTRIES = [
  // Summoner class core ability — Vagabond names this "Conjurer" as the action
  // (the class itself is "Summoner"). The separate Conjurer perk is entry
  // below with a different icon to distinguish.
  {
    id: "summoner-conjurer",
    label: "Conjurer",
    icon: "fas fa-paw",
    available: (pc, features, spells) => !!features?.summoner_creatureCodex,
    onClick: (pc) => SummonerFeatures.showConjureDialog(pc),
  },
  // Spells — listed by exact spell item name (case-insensitive match)
  {
    id: "beast", label: "Beast", icon: "fas fa-dragon",
    available: (pc, features, spells) => spells.has("beast"),
    onClick: (pc) => BeastSpell.trigger(pc),
  },
  {
    id: "raise", label: "Raise", icon: "fas fa-skull",
    available: (pc, features, spells) => spells.has("raise"),
    onClick: (pc) => RaiseSpell.trigger(pc),
  },
  {
    id: "animate", label: "Animate", icon: "fas fa-hat-wizard",
    available: (pc, features, spells) => spells.has("animate"),
    onClick: (pc) => AnimateSpell.trigger(pc),
  },
  // Perks
  {
    id: "familiar", label: "Familiar", icon: "fas fa-feather",
    available: (pc, features, spells) => !!features?.perk_familiar,
    onClick: (pc) => FamiliarFeatures.showConjureDialog(pc),
  },
  {
    id: "animal-companion", label: "Animal Companion", icon: "fas fa-dog",
    available: (pc, features, spells) => !!features?.perk_animalCompanion,
    onClick: (pc) => AnimalCompanion.trigger(pc),
  },
  {
    id: "conjurer", label: "Conjurer", icon: "fas fa-eye",
    // Hide the perk button if the PC already has the Summoner class's Conjurer
    // ability (class feature supersedes — same core action, slightly different
    // pool). Prevents two "Conjurer" buttons appearing side-by-side.
    available: (pc, features, spells) =>
      !!features?.perk_conjurer && !features?.summoner_creatureCodex,
    onClick: (pc) => ConjurerPerk.trigger(pc),
  },
  {
    id: "reanimator", label: "Reanimator", icon: "fas fa-skull-crossbones",
    available: (pc, features, spells) => !!features?.perk_reanimator,
    onClick: (pc) => ReanimatorPerk.trigger(pc),
  },
];

/** Per-PC async locks so double-clicking a button doesn't open two dialogs. */
const _triggerLocks = new Map(); // key: `${pcId}:${entryId}` → true while open


export const CompanionManagerTab = {
  init() {
    Hooks.on("renderApplicationV2", this._onRenderSheet.bind(this));

    // Re-render on companion state changes
    Hooks.on("updateActor", this._onCompanionStateChange.bind(this));
    Hooks.on("createToken", this._onCompanionStateChange.bind(this));
    Hooks.on("deleteToken", this._onCompanionStateChange.bind(this));
    Hooks.on("updateToken", this._onCompanionStateChange.bind(this));

    // Re-evaluate tab visibility when items change on a character (gaining a
    // Beast spell, losing a perk, etc. should make the tab appear/disappear).
    Hooks.on("createItem", (item) => {
      if (item.parent?.documentName === "Actor") this._onCompanionStateChange(item.parent);
    });
    Hooks.on("deleteItem", (item) => {
      if (item.parent?.documentName === "Actor") this._onCompanionStateChange(item.parent);
    });

    // Catch character sheets that rendered BEFORE this init ran (e.g. a
    // sheet Foundry auto-opens on world load, which triggers
    // renderApplicationV2 in the setup phase — before VCE's ready hook
    // registers the listener above). Without this, the first post-reload
    // open of that sheet shows no Companions tab until the user closes
    // and reopens it.
    for (const app of foundry.applications.instances.values()) {
      if (app.document?.type === "character" && app.element?.isConnected) {
        this._onRenderSheet(app);
      }
    }

    log("CompanionManagerTab", "Tab renderer registered");
  },

  _onRenderSheet(app, html, data) {
    if (app.document?.type !== "character") return;

    const pc = app.document;
    const shouldShow = this._shouldShowTab(pc);

    const existingNavLink = app.element.querySelector('nav.sheet-tabs [data-tab="vce-companions"]');
    const existingPanel = app.element.querySelector('section[data-tab="vce-companions"]');

    if (!shouldShow) {
      // Tear down any orphaned tab + panel from a prior state where the PC
      // qualified (e.g., they just lost the Beast spell or had their controller
      // assignment cleared).
      if (existingNavLink) existingNavLink.remove();
      if (existingPanel) existingPanel.remove();
      return;
    }

    // Guard specifically on the NAV LINK: ApplicationV2 re-renders replace
    // nav.sheet-tabs but can leave orphaned section children in .window-content.
    // A generic [data-tab="vce-companions"] check would match the orphaned
    // section and skip re-injection, leaving the tab invisible in the nav bar.
    if (existingNavLink) return;
    this._inject(app);
  },

  /**
   * Decide whether a character should see the Companions tab.
   *
   * Show it ONLY if the PC has access to summoning content OR has been
   * assigned as the save-controller for at least one NPC. Plain characters
   * with no companion sources don't get the tab — it would just be empty
   * clutter on every sheet.
   *
   * @param {Actor} pc
   * @returns {boolean}
   */
  _shouldShowTab(pc) {
    if (pc.type !== "character") return false;

    // 1) Any spawn-capable source on the PC?
    const features = getFeatures(pc) ?? {};
    const spells = new Set(
      pc.items.filter(i => i.type === "spell").map(i => i.name.toLowerCase())
    );
    for (const entry of ACTION_BAR_ENTRIES) {
      if (entry.available(pc, features, spells)) return true;
    }

    // 2) Is this PC the save-controller for any NPC?
    for (const a of game.actors) {
      if (a.getFlag(MODULE_ID, "controllerActorId") === pc.id) return true;
    }

    return false;
  },

  _onCompanionStateChange(doc) {
    // Re-render any open character sheets that show the Companions tab
    for (const [id, app] of foundry.applications.instances) {
      if (app.document?.type === "character" && app.element?.isConnected) {
        const panel = app.element.querySelector('section[data-tab="vce-companions"]');
        if (panel) this._rebuildPanel(app);
      }
    }
  },

  _inject(app) {
    const pc = app.document;
    const sheetEl = app.element;
    const windowContent = sheetEl.querySelector(".window-content");
    if (!windowContent) return;

    const nav = windowContent.querySelector("nav.sheet-tabs");
    if (!nav) return;

    // Remove any stale panel from a prior render cycle. ApplicationV2 replaces
    // nav.sheet-tabs on re-render but can leave section children behind.
    const stale = windowContent.querySelector('section[data-tab="vce-companions"]');
    if (stale) stale.remove();

    // Inject tab link — prepend so it appears first (before Features)
    const tabLink = document.createElement("a");
    tabLink.setAttribute("data-action", "tab");
    tabLink.setAttribute("data-tab", "vce-companions");
    tabLink.setAttribute("data-group", "primary");
    tabLink.innerHTML = `<span>Companions</span>`;
    nav.insertBefore(tabLink, nav.firstChild);

    // Inject panel section
    const section = document.createElement("section");
    section.className = "tab vce-companions-tab scrollable";
    section.setAttribute("data-tab", "vce-companions");
    section.setAttribute("data-group", "primary");
    section.innerHTML = this._buildPanelHTML(pc);

    // Insert before the first existing tab section (mirrors summoner.mjs pattern)
    const firstTab = windowContent.querySelector("section.tab");
    if (firstTab) {
      windowContent.insertBefore(section, firstTab);
    } else {
      windowContent.appendChild(section);
    }

    // Tab click handler (mirrors summoner.mjs _injectSummonTab pattern)
    tabLink.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      nav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      tabLink.classList.add("active");
      section.classList.add("active");
      app._vceActiveTab = "vce-companions";
      if (app.tabGroups) app.tabGroups.primary = "vce-companions";
    });

    // Restore active tab if user was on Companions tab before re-render
    if (app._vceActiveTab === "vce-companions") {
      nav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      tabLink.classList.add("active");
      section.classList.add("active");
      if (app.tabGroups) app.tabGroups.primary = "vce-companions";
    }

    // Track other tab clicks so _vceActiveTab stays accurate
    nav.querySelectorAll("[data-tab]:not([data-tab='vce-companions'])").forEach(t => {
      t.addEventListener("click", () => { app._vceActiveTab = t.dataset.tab; });
    });

    this._bindEvents(section, pc);
  },

  _rebuildPanel(app) {
    const pc = app.document;
    const panel = app.element.querySelector('section[data-tab="vce-companions"]');
    if (!panel) return;
    panel.innerHTML = this._buildPanelHTML(pc);
    this._bindEvents(panel, pc);
  },

  _buildPanelHTML(pc) {
    const companions = CompanionSpawner.getCompanionsFor(pc);
    const actions = this._buildActionBarHTML(pc);

    if (!companions.length) {
      return `
        ${actions}
        <div class="vce-companions-empty">
          <i class="fas fa-users-slash"></i>
          <p>You have no active companions.</p>
          <p class="vce-companions-empty-hint">Cast a summoning spell, conjure a familiar, or engage a hireling.</p>
        </div>`;
    }
    return actions + companions.map(c => this._buildCardHTML(c)).join("");
  },

  /**
   * Build the top-of-tab action bar. Enumerates ACTION_BAR_ENTRIES and
   * renders a button for every source the PC has access to — class features,
   * spells (detected by item name), perks. Button label is the spell/perk
   * name itself (not "Conjure X").
   * @param {Actor} pc
   * @returns {string} HTML fragment (empty if PC has no spawn-capable sources)
   */
  _buildActionBarHTML(pc) {
    const features = getFeatures(pc) ?? {};
    // Index the PC's spells by lowercased name for O(1) lookup from entries
    const spells = new Set(
      pc.items
        .filter(i => i.type === "spell")
        .map(i => i.name.toLowerCase())
    );

    const buttons = [];
    for (const entry of ACTION_BAR_ENTRIES) {
      if (!entry.available(pc, features, spells)) continue;
      buttons.push(
        `<button type="button" class="vce-companion-conjure-btn" data-action-id="${entry.id}">
          <i class="${entry.icon}"></i> ${entry.label}
        </button>`
      );
    }
    if (!buttons.length) return "";
    return `<div class="vce-companion-actions-bar">${buttons.join("")}</div>`;
  },

  _buildCardHTML(entry) {
    const { actor, sourceId, sourceMeta, hp, maxHP, armor, statuses } = entry;
    const hpPct = maxHP > 0 ? Math.max(0, Math.min(100, (hp / maxHP) * 100)) : 0;
    const hpClass = hpPct > 60 ? "ok" : hpPct > 30 ? "mid" : hpPct > 10 ? "low" : "critical";
    const controllerSkillLabel = this._skillLabel(sourceMeta.skill, actor);

    const statusChips = statuses.length
      ? statuses.map(s => `<span class="vce-companion-status-chip">${s}</span>`).join(" ")
      : "";

    // NPC actors use system.actions[]; character actors use items
    const actionsHTML = actor.type === "character"
      ? this._buildCharacterActionsHTML(actor)
      : this._buildNPCActionsHTML(actor);

    // HD display — NPC actors store HD in system.hd or system.hitDice.value
    const hdVal = actor.system?.hd ?? actor.system?.hitDice?.value ?? "—";
    const sizeVal = actor.system?.size ?? "";

    const dismissLabel = sourceMeta.controllerType === "hireling" ? "Dismiss" : "Banish";

    return `
      <div class="vce-companion-card" data-actor-id="${actor.id}">
        <div class="vce-bf-header">
          <img class="vce-bf-portrait" src="${actor.img}" alt="${actor.name}">
          <div class="vce-bf-info">
            <h2 class="vce-bf-name">${actor.name}</h2>
            <div class="vce-bf-tags">
              <span class="vce-companion-type-badge" style="background:${sourceMeta.badgeColor}">${sourceMeta.label.toUpperCase()}</span>
              <span class="vce-bf-tag">HD ${hdVal}</span>
              ${sizeVal ? `<span class="vce-bf-tag">${sizeVal}</span>` : ""}
            </div>
          </div>
          <button class="vce-bf-end vce-companion-dismiss" data-action="dismiss" title="${dismissLabel}">
            <i class="fas fa-times"></i> ${dismissLabel}
          </button>
        </div>

        <div class="vce-companion-body">
          <div class="vce-companion-hp-row">
            <span class="vce-companion-hp-label">HP</span>
            <span class="vce-companion-hp-text">${hp} / ${maxHP}</span>
            <div class="vce-companion-hp-bar-wrap">
              <div class="vce-companion-hp-bar vce-hp-${hpClass}" style="width:${hpPct}%"></div>
            </div>
            <span class="vce-companion-armor">Armor ${armor}</span>
          </div>

          ${statusChips ? `<div class="vce-companion-statuses">${statusChips}</div>` : ""}

          ${sourceMeta.skill ? `
            <div class="vce-companion-controller">
              <i class="fas fa-people-arrows"></i>
              ${sourceMeta.controllerType === "hireling" ? "Checks &amp; saves" : "Saves"}
              via controller (${controllerSkillLabel})
            </div>` : ""}

          <div class="vce-companion-saves">
            <button class="vce-save-btn" data-action="save" data-save="reflex"><i class="fas fa-dice-d20"></i> Reflex</button>
            <button class="vce-save-btn" data-action="save" data-save="endure"><i class="fas fa-dice-d20"></i> Endure</button>
            <button class="vce-save-btn" data-action="save" data-save="will"><i class="fas fa-dice-d20"></i> Will</button>
            <button class="vce-save-btn-open-sheet" data-action="open-sheet" title="Open sheet">
              <i class="fas fa-external-link-alt"></i>
            </button>
          </div>

          ${actionsHTML}
        </div>
      </div>`;
  },

  /**
   * Build the actions section for NPC-type companions (summons, familiars, beasts).
   * NPC actors in Vagabond store actions in actor.system.actions[] — NOT as items.
   * Item types "weapon"/"featureAction" do not exist on NPC actors in this system.
   */
  _buildNPCActionsHTML(actor) {
    const actions = actor.system?.actions ?? [];
    if (!actions.length) return "";

    const rows = actions.map((a, idx) => {
      const dmgStr = a.rollDamage || a.flatDamage || "";
      const dTypeStr = a.damageType && a.damageType !== "-" ? ` ${a.damageType}` : "";
      const noteStr = a.note ? `<span class="vce-bf-action-note">${a.note}</span>` : "";
      const rechargeStr = a.recharge ? ` <span style="opacity:0.6;">(${a.recharge})</span>` : "";
      return `
        <div class="vce-bf-action vce-companion-action vce-companion-npc-action"
          data-action-idx="${idx}" role="button" tabindex="0"
          title="Click to use (rolls via controller's skill)">
          <div class="vce-bf-action-header">
            <strong class="vce-bf-action-name">${a.name}</strong>${rechargeStr}
            ${noteStr}
          </div>
          ${dmgStr ? `<div class="vce-bf-action-damage">${dmgStr}${dTypeStr}</div>` : ""}
          ${a.extraInfo ? `<div class="vce-bf-action-extra">${a.extraInfo}</div>` : ""}
        </div>`;
    }).join("");

    return `
      <div class="vce-bf-section">
        <h3 class="vce-bf-section-title">Actions</h3>
        ${rows}
      </div>`;
  },

  /**
   * Build the actions section for character-type companions (hirelings).
   * Character actors use type="equipment" with equipmentType="weapon" for weapons
   * (not i.type === "weapon"), and i.system.equipped for the equipped check.
   * Spells use i.type === "spell".
   */
  _buildCharacterActionsHTML(actor) {
    // Equipped weapons: type "equipment" with equipmentType "weapon", equipped flag
    const weapons = actor.items.filter(i =>
      i.type === "equipment" &&
      i.system?.equipmentType === "weapon" &&
      i.system?.equipped
    );
    // All spells (hirelings have no "prepared" state — all spells are available)
    const spells = actor.items.filter(i => i.type === "spell");

    if (!weapons.length && !spells.length) return "";

    const wRows = weapons.map(item => {
      const attackType = item.system?.attackType ?? "Attack";
      const dmgFormula = item.system?.damageFormula ?? item.system?.damage?.formula ?? "";
      return `
        <div class="vce-bf-action vce-companion-action vce-companion-item-action"
          data-item-id="${item.id}" role="button" tabindex="0">
          <div class="vce-bf-action-header">
            <strong class="vce-bf-action-name">${item.name}</strong>
            <span class="vce-bf-action-note">${attackType}</span>
            ${dmgFormula ? `<span class="vce-bf-action-damage">${dmgFormula}</span>` : ""}
          </div>
        </div>`;
    }).join("");

    const sRows = spells.map(item => {
      const manaCost = item.system?.manaCost ?? item.system?.cost?.mana ?? 0;
      return `
        <div class="vce-bf-action vce-companion-action vce-companion-item-action"
          data-item-id="${item.id}" role="button" tabindex="0">
          <div class="vce-bf-action-header">
            <strong class="vce-bf-action-name">${item.name}</strong>
            <span class="vce-bf-action-note">${manaCost} Mana</span>
          </div>
        </div>`;
    }).join("");

    return `
      ${weapons.length ? `
        <div class="vce-bf-section">
          <h3 class="vce-bf-section-title">Equipped Weapons</h3>
          ${wRows}
        </div>` : ""}
      ${spells.length ? `
        <div class="vce-bf-section">
          <h3 class="vce-bf-section-title">Spells</h3>
          ${sRows}
        </div>` : ""}`;
  },

  /**
   * Resolve the display label for a companion's control skill.
   * For "mana" sources: reads the controller PC's configured mana skill label.
   * For "leadership" sources: returns "Leadership".
   */
  _skillLabel(skill, companionActor) {
    if (!skill) return "none";
    if (skill === "leadership") return "Leadership";
    if (skill === "mana") {
      const controllerId = companionActor.getFlag(MODULE_ID, "controllerActorId");
      const controller = controllerId ? game.actors.get(controllerId) : null;
      if (controller) {
        // Try classData.manaSkill first (set by class feature detector), then attributes
        const manaSkillKey =
          controller.system?.classData?.manaSkill ??
          controller.system?.attributes?.manaSkill;
        if (manaSkillKey) {
          const label = controller.system?.skills?.[manaSkillKey]?.label;
          if (label) return label;
        }
      }
      return "Mysticism"; // safe fallback
    }
    return skill;
  },

  _bindEvents(panel, pc) {
    // --- Action bar buttons (every spawn-capable source the PC has access to) ---
    // Per-button async lock via _triggerLocks so double-clicking doesn't open
    // two dialogs. Each adapter's trigger() returns a Promise that resolves
    // when the dialog finishes (close/cancel/pick).
    panel.querySelectorAll(".vce-companion-conjure-btn").forEach(btn => {
      const entryId = btn.dataset.actionId;
      const entry = ACTION_BAR_ENTRIES.find(e => e.id === entryId);
      if (!entry) return;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const key = `${pc.id}:${entryId}`;
        if (_triggerLocks.has(key)) return;
        _triggerLocks.set(key, true);
        btn.disabled = true;
        try {
          await entry.onClick(pc);
        } catch (e) {
          log("CompanionManagerTab", `Action "${entryId}" failed: ${e.message}`);
          ui.notifications.error(`${entry.label}: ${e.message}`);
        } finally {
          _triggerLocks.delete(key);
          btn.disabled = false;
        }
      });
    });

    panel.querySelectorAll(".vce-companion-card").forEach(card => {
      const actorId = card.dataset.actorId;
      const actor = game.actors.get(actorId);
      if (!actor) return;

      // --- Dismiss / Banish ---
      card.querySelector('[data-action="dismiss"]')?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await CompanionSpawner.dismiss(actor, { reason: "manual" });
      });

      // --- Open sheet ---
      card.querySelector('[data-action="open-sheet"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        actor.sheet.render(true);
      });

      // --- Save buttons ---
      // Routes through the patched VagabondDamageHelper.handleSaveReminderRoll,
      // which reads the controller flag and rolls on the controller PC automatically.
      card.querySelectorAll('[data-action="save"]').forEach(btn => {
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const saveType = btn.dataset.save;
          try {
            const DH = await import("/systems/vagabond/module/helpers/damage-helper.mjs")
              .then(m => m.VagabondDamageHelper ?? m.default);
            if (DH?.handleSaveReminderRoll) {
              DH.handleSaveReminderRoll({
                targetActorId: actor.id,
                saveType,
                difficulty: actor.system?.saves?.[saveType]?.difficulty ?? 11,
                attackerId: null,
                causedStatuses: [],
                suppressStatuses: true,
              });
            } else {
              ui.notifications.warn("VCE: Save handler not available.");
            }
          } catch (err) {
            log("CompanionManagerTab", `Save button error: ${err.message}`);
            ui.notifications.warn("VCE: Could not trigger save.");
          }
        });
      });

      // --- NPC action clicks (system.actions[idx] — roll via controller's skill) ---
      card.querySelectorAll(".vce-companion-npc-action").forEach(row => {
        row.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const actionIdx = parseInt(row.dataset.actionIdx);
          await this._rollNPCAction(actor, pc, actionIdx);
        });
        row.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); row.click(); }
        });
      });

      // --- Character item action clicks (weapons + spells on hireling actors) ---
      card.querySelectorAll(".vce-companion-item-action").forEach(row => {
        row.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const itemId = row.dataset.itemId;
          const item = actor.items.get(itemId);
          if (!item) return;
          // Route through item's native roll — save-routing-patch.mjs intercepts
          // these and routes them through the controller PC automatically.
          if (typeof item.rollAttack === "function") {
            await item.rollAttack();
          } else {
            await item.roll?.();
          }
        });
        row.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); row.click(); }
        });
      });
    });
  },

  /**
   * Roll an NPC companion action via the controller PC's skill.
   * Mirrors the pattern in SummonerFeatures.rollSummonAction and
   * FamiliarFeatures.rollFamiliarAction — reads actor.system.actions[idx]
   * and creates a chat card attributed to the controller.
   *
   * @param {Actor} companionActor - the NPC companion actor
   * @param {Actor} controllerPC - the PC controlling this companion
   * @param {number} actionIdx - index into actor.system.actions[]
   */
  async _rollNPCAction(companionActor, controllerPC, actionIdx) {
    const action = companionActor.system?.actions?.[actionIdx];
    if (!action) {
      ui.notifications.warn("VCE: Action not found on companion.");
      return;
    }

    // Determine attack type and whether a check is needed
    const attackType = action.attackType || "melee";
    const needsCheck = !!action.attackType;

    // Resolve controller PC's mana skill
    const manaSkillKey =
      controllerPC.system?.classData?.manaSkill ??
      controllerPC.system?.attributes?.manaSkill ??
      "mysticism";
    const skill = controllerPC.system?.skills?.[manaSkillKey];
    const difficulty = skill?.difficulty ?? 12;

    // Capture targets
    const targets = Array.from(game.user.targets).map(t => ({
      tokenId: t.id, sceneId: t.scene?.id,
      actorId: t.actor?.id, actorName: t.name,
      actorImg: t.document?.texture?.src
    }));

    let roll = null;
    let isSuccess = true;
    let isCritical = false;

    if (needsCheck) {
      try {
        const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
        const rollData = controllerPC.getRollData();
        const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
          controllerPC.system.favorHinder || "none", false, false
        );
        roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);
        isSuccess = roll.total >= difficulty;
        const critNum = VagabondRollBuilder.calculateCritThreshold(rollData, "spell");
        const d20 = roll.terms.find(t => t.constructor?.name === "Die" && t.faces === 20);
        isCritical = (d20?.results?.[0]?.result ?? 0) >= critNum;
      } catch (err) {
        log("CompanionManagerTab", `Roll error: ${err.message}`);
        isSuccess = true; // degrade gracefully — show damage without check
      }
    }

    // Roll damage if success and action has damage
    let damageRoll = null;
    const hasDamage = action.rollDamage || action.flatDamage;
    if (isSuccess && hasDamage) {
      try {
        const formula = action.rollDamage || action.flatDamage || "0";
        damageRoll = new Roll(formula);
        await damageRoll.evaluate();
      } catch (err) {
        log("CompanionManagerTab", `Damage roll error: ${err.message}`);
      }
    }

    // Build tags
    const tags = [];
    tags.push({ label: skill?.label || "Mysticism", cssClass: "tag-skill" });
    if (hasDamage) {
      const dmgLabel = action.rollDamage || action.flatDamage || "";
      const dType = action.damageType;
      if (dType && dType !== "-") {
        const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType] || "fas fa-burst";
        tags.push({ label: dmgLabel, icon, cssClass: "tag-damage" });
      } else {
        tags.push({ label: dmgLabel, cssClass: "tag-damage" });
      }
    }
    if (action.note) tags.push({ label: action.note, cssClass: "tag-standard" });

    // Create the chat card attributed to the controller PC
    try {
      const { VagabondChatCard } = globalThis.vagabond.utils;

      const fakeItem = {
        name: action.name,
        img: companionActor.img || "icons/svg/mystery-man.svg",
        system: { description: action.extraInfo || "" }
      };

      const rollResultData = needsCheck ? {
        roll,
        difficulty,
        isSuccess,
        isCritical,
        isHit: isSuccess,
        weaponSkill: skill,
        weaponSkillKey: manaSkillKey,
        favorHinder: controllerPC.system.favorHinder || "none",
        critStatBonus: isCritical ? (controllerPC.system.stats?.[skill?.stat]?.value || 0) : 0
      } : null;

      await VagabondChatCard.createActionCard({
        actor: controllerPC,
        item: fakeItem,
        title: `${action.name} (${companionActor.name})`,
        rollData: rollResultData,
        tags,
        damageRoll,
        damageFormula: action.rollDamage && action.flatDamage
          ? `${action.rollDamage} + ${action.flatDamage}`
          : (action.rollDamage || action.flatDamage || null),
        damageType: action.damageType || "-",
        description: action.extraInfo || "",
        hasDefenses: true,
        attackType,
        targetsAtRollTime: targets,
        actionIndex: actionIdx
      });
    } catch (err) {
      log("CompanionManagerTab", `Chat card error: ${err.message}`);
      ui.notifications.warn("VCE: Could not create action chat card.");
    }

    log("CompanionManagerTab",
      `${controllerPC.name} used ${companionActor.name}'s ${action.name}: ` +
      `${isSuccess ? "hit" : "miss"}${damageRoll ? ` for ${damageRoll.total}` : ""}`
    );
  },
};
