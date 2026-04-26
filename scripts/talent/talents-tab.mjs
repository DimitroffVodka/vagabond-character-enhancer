/**
 * TalentsTab — renders the Talents tab on Psychic character sheets.
 *
 * Lists all 14 Talents from the compendium in a single scrollable view.
 * Right-click a row to pick/unpick (the favorite pattern from creature-picker
 * and beast browser). Picked Talents get Cast/Focus action buttons; unpicked
 * rows are dimmed and inert. The "X / Y picked" header shows whether the
 * player is at the level-appropriate count.
 *
 * Injection mirrors CompanionManagerTab (renderApplicationV2 hook,
 * nav.sheet-tabs link + section insertion). Only shown on actors whose
 * items collection contains a class item named "Psychic".
 */

import { MODULE_ID, log } from "../utils.mjs";
import { TALENT_TYPE } from "./talent-data-model.mjs";
import { TalentCast } from "./talent-cast.mjs";
import { TalentBuffs } from "./talent-buffs.mjs";
import { TalentTranscendence } from "./talent-transcendence.mjs";

/** Module-level cache of all 14 Talent compendium docs (immutable at runtime). */
let _allTalentsCache = null;

export const TalentsTab = {
  init() {
    Hooks.on("renderApplicationV2", this._onRenderSheet.bind(this));

    // Catch sheets that rendered before this init ran (e.g. auto-opened on
    // world load, same issue CompanionManagerTab guards against).
    for (const app of foundry.applications.instances.values()) {
      if (app.document?.type === "character" && app.element?.isConnected) {
        this._onRenderSheet(app);
      }
    }

    log("TalentsTab", "Tab renderer registered");
  },

  // ── Guards ──────────────────────────────────────────────────────────────

  _isPsychic(actor) {
    return actor.items.some(i => i.type === "class" && i.name === "Psychic");
  },

  _getKnownTalents(actor) {
    return actor.items.filter(i => i.type === TALENT_TYPE);
  },

  _getLevel(actor) {
    // Vagabond stores character level on the actor itself; the class item's
    // own `level` field is not the source of truth (FeatureDetector reads
    // it the same way at scripts/feature-detector.mjs:256).
    return actor.system?.attributes?.level?.value ?? 1;
  },

  /**
   * Per-RAW Psychic Talent count progression: 3 / 3 / 4 / 4 / 5 / 5 / 6 / 6 / 7 / 7
   * = 3 + floor((level - 1) / 2). Level 1 starts with 3; levels 3/5/7/9 each grant +1.
   */
  _expectedPicks(level) {
    return 3 + Math.floor(Math.max(0, level - 1) / 2);
  },

  _excerpt(html, len) {
    const text = (html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    return text.length > len ? text.slice(0, len) + "…" : text;
  },

  /** Load all 14 Talent docs from the compendium, sorted alphabetically. Cached. */
  async _loadAllTalents() {
    if (_allTalentsCache) return _allTalentsCache;
    const pack = game.packs.get(`${MODULE_ID}.vce-talents`);
    if (!pack) {
      log("TalentsTab", `Talent pack ${MODULE_ID}.vce-talents not found`);
      return [];
    }
    const docs = await pack.getDocuments();
    _allTalentsCache = [...docs].sort((a, b) => a.name.localeCompare(b.name));
    return _allTalentsCache;
  },

  // ── Hook handler ─────────────────────────────────────────────────────────

  _onRenderSheet(app) {
    if (app.document?.type !== "character") return;
    if (!this._isPsychic(app.document)) return;

    // Guard on NAV LINK (same as CompanionManagerTab) — ApplicationV2
    // re-renders replace nav.sheet-tabs but can leave orphaned sections.
    // Checking the nav link (not just any element) prevents false positives.
    if (app.element.querySelector('nav.sheet-tabs [data-tab="vce-talents"]')) return;

    // _inject is async (renderTemplate), fire-and-forget is fine here.
    this._inject(app).catch(err =>
      log("TalentsTab", `Inject error: ${err.message}`)
    );
  },

  // ── DOM injection ────────────────────────────────────────────────────────

  async _inject(app) {
    if (app._vceInjectingTalents) return;
    app._vceInjectingTalents = true;
    try {
      const actor = app.document;
      const sheetEl = app.element;
      const windowContent = sheetEl.querySelector(".window-content");
      if (!windowContent) return;

      const nav = windowContent.querySelector("nav.sheet-tabs");
      if (!nav) return;

      // Remove any stale panel from a prior render cycle.
      const stale = windowContent.querySelector('section[data-tab="vce-talents"]');
      if (stale) stale.remove();

      const ctx = await this._buildContext(actor);

      const tabContent = await foundry.applications.handlebars.renderTemplate(
        `modules/${MODULE_ID}/templates/talents-tab.hbs`,
        ctx
      );

      // Inject tab nav link — place immediately to the LEFT of the Features tab
      // so the bar reads (Companions if present) → Talents → Features → ...
      const tabLink = document.createElement("a");
      tabLink.setAttribute("data-action", "tab");
      tabLink.setAttribute("data-tab", "vce-talents");
      tabLink.setAttribute("data-group", "primary");
      tabLink.innerHTML = `<span>Talents</span>`;
      const featuresLink = nav.querySelector('[data-tab="features"]');
      if (featuresLink) {
        nav.insertBefore(tabLink, featuresLink);
      } else {
        nav.appendChild(tabLink);
      }

      // Inject panel section before the first existing tab section.
      const section = document.createElement("section");
      section.className = "tab vce-talents-tab scrollable";
      section.setAttribute("data-tab", "vce-talents");
      section.setAttribute("data-group", "primary");
      section.innerHTML = tabContent;

      const firstTab = windowContent.querySelector("section.tab");
      if (firstTab) {
        windowContent.insertBefore(section, firstTab);
      } else {
        windowContent.appendChild(section);
      }

      // Tab click handler (mirrors CompanionManagerTab pattern).
      tabLink.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        nav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
        windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
        tabLink.classList.add("active");
        section.classList.add("active");
        app._vceActiveTab = "vce-talents";
        if (app.tabGroups) app.tabGroups.primary = "vce-talents";
      });

      // Restore active tab if user was on Talents tab before a re-render.
      if (app._vceActiveTab === "vce-talents") {
        nav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
        windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
        tabLink.classList.add("active");
        section.classList.add("active");
        if (app.tabGroups) app.tabGroups.primary = "vce-talents";
      }

      // Track other tab clicks so _vceActiveTab stays accurate.
      nav.querySelectorAll("[data-tab]:not([data-tab='vce-talents'])").forEach(t => {
        t.addEventListener("click", () => { app._vceActiveTab = t.dataset.tab; });
      });

      // Wire Cast / Focus / right-click pick handlers.
      this._bindEvents(section, actor);
    } finally {
      app._vceInjectingTalents = false;
    }
  },

  // ── Template context ─────────────────────────────────────────────────────

  /**
   * Build the Handlebars context: header stats + 14 talent rows merging the
   * compendium with the actor's owned set. Picked rows on top (alpha asc),
   * unpicked below (alpha asc).
   */
  async _buildContext(actor) {
    const level = this._getLevel(actor);
    const cap = Math.floor(level / 2);
    const expectedPicks = this._expectedPicks(level);

    const allTalents = await this._loadAllTalents();
    const owned = this._getKnownTalents(actor);
    const ownedByName = new Map(owned.map(t => [t.name, t]));

    const psychicFlags = actor.getFlag(MODULE_ID, "psychicTalents") ?? {};
    const focusedIds = psychicFlags.focusedIds ?? [];
    const maxFocus = psychicFlags.maxFocus ?? TalentBuffs.getMaxFocus(actor);

    const rows = allTalents.map(t => {
      const ownedItem = ownedByName.get(t.name);
      const isPicked = !!ownedItem;
      const isFocused = isPicked && focusedIds.includes(ownedItem.id);
      const isBuff = t.system.focusBuffAE !== null && t.system.focusBuffAE !== undefined;
      const damageType = (t.system.damageType ?? "").trim();
      const damageTypeLabel = damageType && damageType !== "-" ? damageType : "";
      return {
        name: t.name,
        img: t.img,
        descExcerpt: this._excerpt(t.system.description, 140),
        isBuff,
        isPicked,
        isFocused,
        damageType,
        damageTypeLabel,
        rowTitle: isPicked ? "Right-click to unpick" : "Right-click to pick",
      };
    });

    // Sort: picked first (alpha), then unpicked (alpha). allTalents is already alpha.
    rows.sort((a, b) => {
      if (a.isPicked !== b.isPicked) return a.isPicked ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const pickedCount = owned.length;
    return {
      cap,
      maxFocus,
      focusedCount: focusedIds.length,
      level,
      pickedCount,
      expectedPicks,
      isOverPicked: pickedCount > expectedPicks,
      isUnderPicked: pickedCount < expectedPicks,
      talents: rows,
    };
  },

  // ── Rebuild (used by data-change hooks if needed) ────────────────────────

  async _rebuildPanel(app) {
    const panel = app.element?.querySelector('section[data-tab="vce-talents"]');
    if (!panel) return;
    const actor = app.document;
    const ctx = await this._buildContext(actor);
    const html = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/talents-tab.hbs`, ctx
    );
    panel.innerHTML = html;
    this._bindEvents(panel, actor);
  },

  // ── Event binding ─────────────────────────────────────────────────────────

  _bindEvents(panel, actor) {
    // Cast button — opens the cast dialog then resolves the cast.
    panel.querySelectorAll("[data-action='cast-talent']").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const card = e.currentTarget.closest("[data-talent-name]");
        const name = card?.dataset.talentName;
        if (!name) return;
        const talent = actor.items.find(i => i.type === TALENT_TYPE && i.name === name);
        if (!talent) {
          log("TalentsTab", `Cast: talent "${name}" not found on actor`);
          return;
        }
        const config = await TalentCast.openDialog(actor, talent);
        if (!config) return;
        await TalentCast.executeCast(actor, talent, config);
      });
    });

    // Drop Focus button — only shown on currently-focused Talents. Clears
    // the focus state and removes any distributed buff AE from every target.
    // Re-targeting requires Drop → Cast (RAW: one focused spell at a time).
    panel.querySelectorAll("[data-action='drop-focus']").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const card = e.currentTarget.closest("[data-talent-name]");
        const name = card?.dataset.talentName;
        if (!name) return;
        const talent = actor.items.find(i => i.type === TALENT_TYPE && i.name === name);
        if (!talent) return;
        await TalentBuffs.dropFocus(actor, talent);
        // Foundry auto-rerenders the actor sheet on flag/effect change,
        // which redraws the tab with updated focused state + counter.
      });
    });

    // Right-click any row — toggle picked. Mirrors the favorite pattern in
    // polymorph-sheet (right-click a beast row to favorite). Capacity enforced
    // against the level's expected pick count: blocks adds beyond the cap,
    // always allows removes.
    panel.querySelectorAll(".vce-talent-card").forEach(card => {
      card.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = card.dataset.talentName;
        if (!name) return;
        await this._togglePick(actor, name);
      });
    });

    // Transcendence (L10) — open the Talent swap dialog. Hidden on pre-L10
    // sheets via the same level gate the template uses.
    panel.querySelector("[data-action='transcendence']")?.addEventListener("click", async () => {
      const level = this._getLevel(actor);
      if (level < 10) {
        ui.notifications.warn("Transcendence requires Psychic level 10.");
        return;
      }
      await TalentTranscendence.show(actor);
    });
  },

  /**
   * Toggle picked state for a Talent. Adds the compendium doc to the actor
   * (capacity-checked) or removes the actor's owned copy. If the talent is
   * currently focused, drops focus first to clean up the buff AE.
   */
  async _togglePick(actor, talentName) {
    const owned = actor.items.find(i => i.type === TALENT_TYPE && i.name === talentName);

    if (owned) {
      // Drop focus first so the buff AE is cleaned up properly.
      const state = TalentBuffs.getState(actor);
      if (state.focusedIds.includes(owned.id)) {
        await TalentBuffs.toggleFocus(actor, owned);
      }
      await actor.deleteEmbeddedDocuments("Item", [owned.id]);
      return;
    }

    // Add — capacity check against expected count for level.
    const level = this._getLevel(actor);
    const expected = this._expectedPicks(level);
    const currentCount = this._getKnownTalents(actor).length;
    if (currentCount >= expected) {
      ui.notifications.warn(
        `You already have ${expected} Talent${expected !== 1 ? "s" : ""} for level ${level}. ` +
        `Right-click an existing Talent to drop it before picking another.`
      );
      return;
    }

    const all = await this._loadAllTalents();
    const src = all.find(t => t.name === talentName);
    if (!src) {
      ui.notifications.error(`Talent "${talentName}" not found in compendium.`);
      return;
    }
    await actor.createEmbeddedDocuments("Item", [src.toObject()]);
  },
};
