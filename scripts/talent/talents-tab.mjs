/**
 * TalentsTab — renders the Talents tab on Psychic character sheets.
 *
 * Injection pattern mirrors CompanionManagerTab (renderApplicationV2 hook,
 * nav.sheet-tabs link + section insertion). Only shown for actors whose
 * items collection contains a class item named "Psychic".
 *
 * Cast and Focus buttons are stubs in this phase — they log to console only.
 * Later tasks wire them to TalentCast and TalentBuffs respectively.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { TALENT_TYPE } from "./talent-data-model.mjs";
import { TalentCast } from "./talent-cast.mjs";

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
    const psychicItem = actor.items.find(i => i.type === "class" && i.name === "Psychic");
    return psychicItem?.system?.level ?? 1;
  },

  _excerpt(html, len) {
    const text = (html ?? "").replace(/<[^>]+>/g, "");
    return text.length > len ? text.slice(0, len) + "\u2026" : text;
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

    // Build template context
    const level = this._getLevel(actor);
    const cap = Math.floor(level / 2);
    const talents = this._getKnownTalents(actor);

    const psychicFlags = actor.getFlag(MODULE_ID, "psychicTalents") ?? {};
    const focusedIds = psychicFlags.focusedIds ?? [];
    const maxFocus = psychicFlags.maxFocus ?? 1;

    const ctx = {
      cap,
      maxFocus,
      focusedCount: focusedIds.length,
      level,
      talents: talents.map(t => ({
        id: t.id,
        name: t.name,
        img: t.img,
        descExcerpt: this._excerpt(t.system.description, 100),
        isBuff: t.system.focusBuffAE !== null && t.system.focusBuffAE !== undefined,
        isFocused: focusedIds.includes(t.id)
      }))
    };

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

    // Wire Cast / Focus buttons.
    this._bindEvents(section, actor);
    } finally {
      app._vceInjectingTalents = false;
    }
  },

  // ── Rebuild (for future use by data-change hooks) ─────────────────────────

  async _rebuildPanel(app) {
    const panel = app.element?.querySelector('section[data-tab="vce-talents"]');
    if (!panel) return;
    const actor = app.document;
    const level = this._getLevel(actor);
    const cap = Math.floor(level / 2);
    const talents = this._getKnownTalents(actor);
    const psychicFlags = actor.getFlag(MODULE_ID, "psychicTalents") ?? {};
    const focusedIds = psychicFlags.focusedIds ?? [];
    const maxFocus = psychicFlags.maxFocus ?? 1;

    const ctx = {
      cap, maxFocus, focusedCount: focusedIds.length, level,
      talents: talents.map(t => ({
        id: t.id, name: t.name, img: t.img,
        descExcerpt: this._excerpt(t.system.description, 100),
        isBuff: t.system.focusBuffAE !== null && t.system.focusBuffAE !== undefined,
        isFocused: focusedIds.includes(t.id)
      }))
    };

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
        const talentId = e.currentTarget.dataset.talentId;
        const talent = actor.items.get(talentId);
        if (!talent) {
          log("TalentsTab", `Cast: talent ${talentId} not found on actor`);
          return;
        }
        const config = await TalentCast.openDialog(actor, talent);
        if (!config) return;
        await TalentCast.executeCast(actor, talent, config);
      });
    });

    // STUB: Focus toggle — Task 11 (talent-buffs.mjs) wires this.
    panel.querySelectorAll("[data-action='focus-talent']").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const talentId = e.currentTarget.dataset.talentId;
        log("TalentsTab", `[STUB] Focus clicked for talent ${talentId} — Task 11 pending`);
        ui.notifications.info("Focus toggling not yet implemented (Task 11).");
      });
    });

    // STUB: Pick Talents — Task 4 wires this to TalentPickDialog.
    panel.querySelector("[data-action='pick-talents']")?.addEventListener("click", () => {
      log("TalentsTab", "[STUB] Pick Talents clicked — Task 4 pending");
    });

    // STUB: Transcendence — Task 12 wires this to TalentTranscendenceDialog.
    panel.querySelector("[data-action='transcendence']")?.addEventListener("click", () => {
      log("TalentsTab", "[STUB] Transcendence clicked — Task 12 pending");
    });
  }
};
