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
import { TalentPickDialog } from "./talent-pick-dialog.mjs";
import { TalentBuffs } from "./talent-buffs.mjs";
import { TalentTranscendence } from "./talent-transcendence.mjs";

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

    // Focus toggle — adds/removes the talent from psychicTalents.focusedIds
    // and applies/removes the focusBuffAE on the actor. Capacity is enforced
    // by Duality (1 / 2 at L4 / 3 at L8).
    panel.querySelectorAll("[data-action='focus-talent']").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const talentId = e.currentTarget.dataset.talentId;
        const talent = actor.items.get(talentId);
        if (!talent) return;
        await TalentBuffs.toggleFocus(actor, talent);
        // Foundry auto-rerenders the actor sheet on flag/effect change,
        // which redraws the tab with updated focused state + counter.
      });
    });

    // Pick Talents — open a manage dialog where the player can freely
    // check/uncheck which Talents are in their loadout. Per RAW, downtime
    // study allows retraining any character choice; this is the in-game UX
    // for that. Saves a diff (delete the unchecked, add the newly checked).
    panel.querySelector("[data-action='pick-talents']")?.addEventListener("click", async () => {
      const psychic = actor.items.find(i => i.type === "class" && i.name === "Psychic");
      const level = psychic?.system?.level ?? 1;
      // Talent count progression: 3 / 3 / 4 / 4 / 5 / 5 / 6 / 6 / 7 / 7
      const expected = 3 + Math.floor(Math.max(0, level - 1) / 2);
      // Foundry auto-rerenders the actor sheet when items are added/removed,
      // so we don't need to manually trigger a re-render here.
      await TalentPickDialog.manage(actor, expected);
    });

    // Transcendence (L10) — open the Talent swap dialog. Hidden on pre-L10
    // sheets via the same level gate the template uses.
    panel.querySelector("[data-action='transcendence']")?.addEventListener("click", async () => {
      const psychic = actor.items.find(i => i.type === "class" && i.name === "Psychic");
      const level = psychic?.system?.level ?? 1;
      if (level < 10) {
        ui.notifications.warn("Transcendence requires Psychic level 10.");
        return;
      }
      await TalentTranscendence.show(actor);
    });
  }
};
