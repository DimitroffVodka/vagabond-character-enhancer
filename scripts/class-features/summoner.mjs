/**
 * Summoner Class Features
 * Handles the Summoner's conjuration mechanics: summon selection, token placement,
 * focus/mana tracking, banishment, and Soulbonder armor/immunity copy.
 *
 * FLOW
 * ────
 * 1. Player triggers conjure → NPC selection dialog (filtered by HD/beingType)
 * 2. Select creature → mana spent (= HD), token placed, focus acquired
 * 3. Each summoner turn in combat → 1 mana drained (focus cost)
 * 4. Banishment: 0 HP, new summon, focus dropped, or out of mana
 * 5. Soulbonder (L2): summoner gains summon's armor + immunities while conjured
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const FLAG_CONJURE = "activeConjure";
const SOULBONDER_FLAG = "soulbonderAE";
const FOCUS_KEY = "summoner_conjure";

const SIZE_MAP = {
  tiny: 0.5, small: 1, medium: 1, large: 2,
  huge: 3, giant: 4, gargantuan: 4, colossal: 5
};


/* -------------------------------------------- */
/*  Registry                                     */
/* -------------------------------------------- */

export const SUMMONER_REGISTRY = {
  "arcanum": {
    class: "summoner",
    level: 1,
    flag: "summoner_arcanum",
    status: "flavor",
    description: "Cast Spells using Mysticism. Learn 4 Spells, +1 every 2 Summoner Levels. Max Mana = 4 × Level."
  },
  "creature codex": {
    class: "summoner",
    level: 1,
    flag: "summoner_creatureCodex",
    status: "module",
    description: "Gain Conjurer Perk. Can replace Spells with Summons. Summon HD ≤ Summoner Level."
  },
  "soulbonder": {
    class: "summoner",
    level: 2,
    flag: "summoner_soulbonder",
    status: "module",
    description: "Gain the Armor and Immunities of your Summons while they are conjured."
  },
  "second nature": {
    class: "summoner",
    level: 4,
    flag: "summoner_secondNature",
    status: "todo",
    description: "Rather than Focus on a Summon, you can choose for it to remain for Cd4 Rounds."
  },
  "avatar emergence": {
    class: "summoner",
    level: 6,
    flag: "summoner_avatarEmergence",
    status: "todo",
    description: "Once per Shift, you can conjure a Summon without Mana to conjure it."
  },
  "guardian force": {
    class: "summoner",
    level: 8,
    flag: "summoner_guardianForce",
    status: "todo",
    description: "If you drop to 0 HP with a Summon conjured, it remains for Cd4 Rounds. If not banished before the die shrinks, you are revived at 1 HP and gain 1 Fatigue."
  },
  "ultimate weapon": {
    class: "summoner",
    level: 10,
    flag: "summoner_ultimateWeapon",
    status: "module",
    description: "You can conjure Summons with HD as high as (your Summoner Level + 5)."
  }
};

/* -------------------------------------------- */
/*  SummonerFeatures                             */
/* -------------------------------------------- */

export const SummonerFeatures = {

  /* -------------------------------------------- */
  /*  Hook Registration                            */
  /* -------------------------------------------- */

  /** Cached candidates for synchronous sheet rendering */
  _candidateCache: null,
  _candidateCacheMaxHD: 0,

  registerHooks() {
    // Inject Summon tab on character sheet renders
    Hooks.on("renderApplicationV2", (app) => {
      if (app.document?.type === "character") {
        this._injectSummonTab(app);
      }
    });

    // Combat round: drain 1 mana per round for all summoners with active conjures.
    // Vagabond uses freeform turn order, so we drain when the round advances
    // rather than tracking individual turns.
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      // Only one client should process this — prefer GM, fallback to first owner
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      // Check all characters in combat for active conjures
      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== "character") continue;

        const conjure = actor.getFlag(MODULE_ID, FLAG_CONJURE);
        if (!conjure) continue;

        const featureFocus = actor.getFlag(MODULE_ID, "featureFocus") || [];
        const hasFocus = featureFocus.some(f => f.key === FOCUS_KEY);
        if (!hasFocus) continue;

        await this._drainMana(actor);
      }
    });

    // Watch summon actor HP for 0 HP banishment
    Hooks.on("updateActor", async (actor, changes) => {
      if (actor.type !== "npc") return;
      if (!game.user.isGM) return;

      const newHP = changes.system?.health?.value ?? changes["system.health.value"];
      if (newHP === undefined || newHP > 0) return;

      // Check if any character has this NPC as their active conjure
      for (const char of game.actors.filter(a => a.type === "character")) {
        const conjure = char.getFlag(MODULE_ID, FLAG_CONJURE);
        if (conjure?.summonActorId === actor.id) {
          await this.banishSummon(char, "Defeated (0 HP)");
          break;
        }
      }
    });

    // Watch for focus drop on summoner_conjure
    Hooks.on("updateActor", async (actor, changes) => {
      if (actor.type !== "character") return;
      if (!game.user.isGM) return;
      if (!foundry.utils.hasProperty(changes, "system.focus.spellIds")
        && !changes.flags?.[MODULE_ID]?.featureFocus) return;

      const conjure = actor.getFlag(MODULE_ID, FLAG_CONJURE);
      if (!conjure) return;

      // Check if focus is still held
      const featureFocus = actor.getFlag(MODULE_ID, "featureFocus") || [];
      const hasFocus = featureFocus.some(f => f.key === FOCUS_KEY);
      if (!hasFocus) {
        await this.banishSummon(actor, "Focus dropped");
      }
    });

    log("Summoner", "Summoner hooks registered.");

    // Pre-cache candidates for sheet rendering
    this._refreshCandidateCache(99);
  },

  /* -------------------------------------------- */
  /*  Sheet Tab Injection                          */
  /* -------------------------------------------- */

  /**
   * Inject a "Summon" tab into the Summoner's character sheet.
   * When no summon active: shows creature selection list.
   * When summon active: shows summon stats + Banish button.
   */
  _injectSummonTab(sheet) {
    const actor = sheet.document;
    if (actor?.type !== "character") return;

    const sheetEl = sheet.element;
    if (!sheetEl) return;

    const windowContent = sheetEl.querySelector(".window-content");
    if (!windowContent) return;

    const tabNav = windowContent.querySelector("nav.sheet-tabs");
    if (!tabNav) return;

    // Check if this actor is a summoner
    const features = actor.getFlag(MODULE_ID, "features");
    const isSummoner = !!(features?.summoner_creatureCodex);

    if (!isSummoner) {
      windowContent.querySelector('section.tab[data-tab="vce-summon"]')?.remove();
      tabNav.querySelector('[data-tab="vce-summon"]')?.remove();
      return;
    }

    const conjure = actor.getFlag(MODULE_ID, FLAG_CONJURE);
    const actorSheet = actor.sheet;

    // Remove stale elements
    windowContent.querySelector('section.tab[data-tab="vce-summon"]')?.remove();
    tabNav.querySelector('[data-tab="vce-summon"]')?.remove();

    // Create tab link
    const summonTab = document.createElement("a");
    summonTab.dataset.action = "tab";
    summonTab.dataset.tab = "vce-summon";
    summonTab.dataset.group = "primary";
    summonTab.innerHTML = "<span>Summon</span>";
    tabNav.prepend(summonTab);

    // Create tab section
    const summonSection = document.createElement("section");
    summonSection.className = "tab vce-summon-tab scrollable";
    summonSection.dataset.tab = "vce-summon";
    summonSection.dataset.group = "primary";

    if (conjure) {
      summonSection.innerHTML = this._buildSummonActiveHTML(conjure, actor);
    } else {
      summonSection.innerHTML = this._buildSummonListHTML(actor, features);
    }

    const firstTab = windowContent.querySelector("section.tab");
    if (firstTab) {
      windowContent.insertBefore(summonSection, firstTab);
    } else {
      windowContent.appendChild(summonSection);
    }

    // Tab click handler
    summonTab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      summonTab.classList.add("active");
      summonSection.classList.add("active");
      actorSheet._vceActiveTab = "vce-summon";
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-summon";
    });

    // Restore active tab
    const desiredTab = actorSheet._vceActiveTab;
    if (desiredTab === "vce-summon") {
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      summonTab.classList.add("active");
      summonSection.classList.add("active");
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-summon";
    }

    // Track other tab clicks
    tabNav.querySelectorAll("[data-tab]:not([data-tab='vce-summon'])").forEach(t => {
      t.addEventListener("click", () => { actorSheet._vceActiveTab = t.dataset.tab; });
    });

    // Bind creature row clicks (when no active conjure)
    if (!conjure) {
      this._bindSummonRowClicks(summonSection, actor, features);
    }

    // Bind banish button + action buttons (when conjure active)
    if (conjure) {
      const banishBtn = summonSection.querySelector(".vce-summon-banish");
      if (banishBtn) {
        banishBtn.addEventListener("click", async () => {
          await this.banishSummon(actor, "Dismissed");
        });
      }
      // Action buttons — click to roll using summoner's Mysticism
      summonSection.querySelectorAll(".vce-summon-action").forEach(btn => {
        btn.addEventListener("click", async () => {
          const idx = parseInt(btn.dataset.actionIdx);
          await this.rollSummonAction(actor, conjure, idx);
        });
        btn.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); btn.click(); }
        });
        // Hover effect
        btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#FFD700"; btn.style.background = "rgba(255,215,0,0.1)"; });
        btn.addEventListener("mouseleave", () => { btn.style.borderColor = "#555"; btn.style.background = ""; });
      });
    }
  },

  /**
   * Build HTML for the creature selection list (no active summon).
   */
  _buildSummonListHTML(actor, features) {
    const maxHD = this._getMaxHD(actor, features);
    const currentMana = actor.system?.mana?.current ?? 0;
    const codex = actor.getFlag(MODULE_ID, "summonCodex") || [];

    // Use cached candidates (refreshed async if stale)
    if (!this._candidateCache || this._candidateCacheMaxHD !== maxHD) {
      this._refreshCandidateCache(maxHD);
    }
    const candidates = (this._candidateCache || []).filter(c => c.hd <= maxHD);

    if (candidates.length === 0) {
      return `
        <div class="vce-bf-prompt">
          <i class="fas fa-dragon vce-bf-prompt-icon" aria-hidden="true"></i>
          <h2 class="vce-bf-prompt-title">Creature Codex</h2>
          <p class="vce-bf-prompt-desc">No creatures available (Max HD: ${maxHD})</p>
        </div>
      `;
    }

    // Sort: codex creatures first, then rest by HD + name
    const sorted = [...candidates].sort((a, b) => {
      const aInCodex = codex.includes(a.name);
      const bInCodex = codex.includes(b.name);
      if (aInCodex && !bInCodex) return -1;
      if (!aInCodex && bInCodex) return 1;
      return (a.hd - b.hd) || a.name.localeCompare(b.name);
    });

    const rows = sorted.map((c, idx) => {
      const speedExtras = [];
      const sv = c.speedValues || {};
      if (sv.fly) speedExtras.push(`Fly ${sv.fly}'`);
      if (sv.swim) speedExtras.push(`Swim ${sv.swim}'`);
      if (sv.climb) speedExtras.push(`Climb ${sv.climb}'`);
      const speedStr = `${c.speed || 30}'` + (speedExtras.length ? ` (${speedExtras.join(", ")})` : "");

      const actions = (c.actions ?? []).map(a => {
        const dmg = a.rollDamage || a.flatDamage || "—";
        return `${a.name}: ${dmg}`;
      }).join("; ");

      const inCodex = codex.includes(c.name);
      const canAfford = currentMana >= c.hd;
      // Only codex creatures can be conjured; non-codex are dimmed
      const dimStyle = (!inCodex || !canAfford) ? ' style="opacity:0.35;"' : '';
      const starIcon = inCodex
        ? `<i class="fas fa-book-open vce-bd-fav-star vce-bd-fav-active" style="color:#FFD700;" aria-label="In Codex"></i>`
        : `<i class="far fa-book vce-bd-fav-star" style="opacity:0.4;" aria-label="Not in Codex"></i>`;
      const codexClass = inCodex ? " vce-beast-row-fav" : "";
      const title = inCodex ? "Right-click to remove from Codex" : "Right-click to add to Codex";

      return `
        <tr class="vce-beast-row vce-summon-row${codexClass}" data-summon-idx="${idx}"
            data-creature-name="${c.name}"
            role="button" tabindex="0" title="${title}"${dimStyle}>
          <td class="vce-bd-cell vce-bd-cell-img">
            <img src="${c.img || "icons/svg/mystery-man.svg"}" class="vce-bd-beast-img" alt="" loading="lazy" />
          </td>
          <td class="vce-bd-cell"><strong>${starIcon} ${c.name}</strong></td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.hd}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.beingType || "—"}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.armor || 0}</td>
          <td class="vce-bd-cell">${speedStr}</td>
          <td class="vce-bd-cell vce-bd-cell-actions">${actions || "—"}</td>
        </tr>`;
    }).join("");

    const codexCount = codex.filter(n => sorted.some(c => c.name === n)).length;

    return `
      <div class="vce-bf-beast-list">
        <div style="padding:4px 8px; font-size:0.85em; opacity:0.7;">
          Creature Codex: ${codexCount} creature${codexCount !== 1 ? "s" : ""} |
          Max HD: ${maxHD} | Mana: ${currentMana} | Cost: creature's HD
          <br><em>Right-click to add/remove from Codex. Only Codex creatures can be conjured.</em>
        </div>
        <table class="vce-bd-table" role="grid">
          <thead>
            <tr class="vce-bd-header-row">
              <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
              <th class="vce-bd-th" scope="col">Creature</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">HD</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Type</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Armor</th>
              <th class="vce-bd-th" scope="col">Speed</th>
              <th class="vce-bd-th" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  /**
   * Build HTML for the active summon stats + Banish button.
   */
  _buildSummonActiveHTML(conjure, actor) {
    const speedParts = [];
    const summonActor = game.actors.get(conjure.summonActorId);
    const speed = summonActor?.system?.speed ?? 30;
    speedParts.push(`${speed}'`);
    const sv = summonActor?.system?.speedValues || {};
    if (sv.fly) speedParts.push(`Fly ${sv.fly}'`);
    if (sv.swim) speedParts.push(`Swim ${sv.swim}'`);
    if (sv.climb) speedParts.push(`Climb ${sv.climb}'`);

    const actions = (summonActor?.system?.actions || []).map((a, i) => {
      const dmgText = a.rollDamage
        ? `${a.rollDamage}${a.flatDamage ? ` + ${a.flatDamage}` : ""} ${a.damageType !== "-" ? a.damageType : ""}`
        : "";
      return `
      <div class="vce-summon-action" data-action-idx="${i}"
        style="margin:4px 0; padding:6px 10px; border:1px solid #555; border-radius:4px; cursor:pointer;"
        role="button" tabindex="0"
        title="Click to use (Mysticism check)">
        <strong>${a.name}</strong>
        ${a.note ? `<span style="opacity:0.7; font-size:0.85em;"> — ${a.note}</span>` : ""}
        ${dmgText ? `<br>Damage: ${dmgText}` : ""}
        ${a.extraInfo ? `<br><em style="font-size:0.85em;">${a.extraInfo}</em>` : ""}
      </div>`;
    }).join("");

    const abilities = (summonActor?.system?.abilities || []).map(a => `
      <div style="margin:2px 0;">
        <strong>${a.name}:</strong> <span style="font-size:0.9em;">${a.description}</span>
      </div>
    `).join("");

    const immunities = conjure.summonImmunities?.length
      ? conjure.summonImmunities.join(", ") : "None";

    const hp = summonActor?.system?.health;
    const hpStr = hp ? `${hp.value}/${hp.max}` : "—";

    return `
      <div class="vce-bf-header" style="display:flex; align-items:center; gap:12px; padding:8px;">
        <img src="${conjure.summonImg || "icons/svg/mystery-man.svg"}"
          style="width:64px; height:64px; border:2px solid #888; border-radius:8px;" />
        <div style="flex:1;">
          <h2 style="margin:0;">${conjure.summonName}</h2>
          <div style="font-size:0.9em; opacity:0.8;">
            HD ${conjure.summonHD} | HP: ${hpStr} | Armor: ${conjure.summonArmor}
          </div>
          <div style="font-size:0.85em; opacity:0.7;">
            Speed: ${speedParts.join(", ")} | Immunities: ${immunities}
          </div>
        </div>
        <button class="vce-summon-banish" title="Banish Summon"
          style="padding:6px 12px; background:#8b0000; color:white; border:none; border-radius:4px; cursor:pointer;">
          <i class="fas fa-times"></i> Banish
        </button>
      </div>
      ${actions ? `<div style="padding:0 8px;"><h3 style="margin:8px 0 4px;">Actions</h3>${actions}</div>` : ""}
      ${abilities ? `<div style="padding:0 8px;"><h3 style="margin:8px 0 4px;">Abilities</h3>${abilities}</div>` : ""}
    `;
  },

  /**
   * Bind click handlers on summon selection rows.
   */
  _bindSummonRowClicks(container, actor, features) {
    const maxHD = this._getMaxHD(actor, features);
    const candidates = (this._candidateCache || []).filter(c => c.hd <= maxHD);
    // Sort same as _buildSummonListHTML so indices match
    const codex = actor.getFlag(MODULE_ID, "summonCodex") || [];
    const sorted = [...candidates].sort((a, b) => {
      const aIn = codex.includes(a.name); const bIn = codex.includes(b.name);
      if (aIn && !bIn) return -1; if (!aIn && bIn) return 1;
      return (a.hd - b.hd) || a.name.localeCompare(b.name);
    });

    let selecting = false;

    container.querySelectorAll(".vce-summon-row").forEach(row => {
      // Left-click: conjure (only if in Codex)
      row.addEventListener("click", async () => {
        if (selecting) return;
        const name = row.dataset.creatureName;
        const currentCodex = actor.getFlag(MODULE_ID, "summonCodex") || [];
        if (!currentCodex.includes(name)) {
          ui.notifications.info(`${name} is not in your Creature Codex. Right-click to add it.`);
          return;
        }
        selecting = true;
        const idx = parseInt(row.dataset.summonIdx);
        const selected = sorted[idx];
        if (!selected) { selecting = false; return; }
        if ((actor.system?.mana?.current ?? 0) < selected.hd) {
          ui.notifications.warn(`Not enough mana! Need ${selected.hd}.`);
          selecting = false;
          return;
        }
        row.classList.add("vce-beast-row-selected");
        await this.conjureSummon(actor, selected);
        selecting = false;
      });

      // Right-click: toggle Codex membership
      row.addEventListener("contextmenu", async (ev) => {
        ev.preventDefault();
        const name = row.dataset.creatureName;
        if (!name) return;
        const currentCodex = actor.getFlag(MODULE_ID, "summonCodex") || [];
        if (currentCodex.includes(name)) {
          await actor.setFlag(MODULE_ID, "summonCodex", currentCodex.filter(n => n !== name));
          ui.notifications.info(`Removed ${name} from Creature Codex.`);
        } else {
          await actor.setFlag(MODULE_ID, "summonCodex", [...currentCodex, name]);
          ui.notifications.info(`Added ${name} to Creature Codex.`);
        }
        // Sheet will re-render from the flag update
      });

      row.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); row.click(); }
      });
    });
  },

  /**
   * Refresh the candidate cache asynchronously.
   */
  async _refreshCandidateCache(maxHD) {
    this._candidateCache = await this._gatherCandidates(maxHD);
    this._candidateCache.sort((a, b) => (a.hd - b.hd) || a.name.localeCompare(b.name));
    this._candidateCacheMaxHD = maxHD;
  },

  /* -------------------------------------------- */
  /*  Conjure Dialog                               */
  /* -------------------------------------------- */

  /**
   * Show the NPC selection dialog for conjuring a summon.
   * Sources from world NPCs + system bestiary compendium.
   * @param {Actor} actor - The summoner actor
   */
  async showConjureDialog(actor) {
    const features = getFeatures(actor);
    const maxHD = this._getMaxHD(actor, features);
    const currentMana = actor.system?.mana?.current ?? 0;

    // Gather eligible NPCs
    const candidates = await this._gatherCandidates(maxHD);

    if (candidates.length === 0) {
      ui.notifications.warn("No eligible creatures found for conjuring.");
      return;
    }

    // Sort by HD ascending, then name
    candidates.sort((a, b) => (a.hd - b.hd) || a.name.localeCompare(b.name));

    // Build HTML rows
    const rows = candidates.map((c, idx) => {
      const speedExtras = [];
      const sv = c.speedValues || {};
      if (sv.fly) speedExtras.push(`Fly ${sv.fly}'`);
      if (sv.swim) speedExtras.push(`Swim ${sv.swim}'`);
      if (sv.climb) speedExtras.push(`Climb ${sv.climb}'`);
      const speedStr = `${c.speed || 30}'` + (speedExtras.length ? ` (${speedExtras.join(", ")})` : "");

      const actions = (c.actions ?? []).map(a => {
        const dmg = a.rollDamage || a.flatDamage || "—";
        return `${a.name}: ${dmg}`;
      }).join("; ");

      const canAfford = currentMana >= c.hd;
      const dimClass = canAfford ? "" : ' style="opacity:0.4;"';
      const manaNote = canAfford ? "" : " (not enough mana)";

      return `
        <tr class="vce-summon-row" data-idx="${idx}" role="button" tabindex="0"${dimClass}>
          <td class="vce-bd-cell vce-bd-cell-img">
            <img src="${c.img || "icons/svg/mystery-man.svg"}" class="vce-bd-beast-img" alt="" />
          </td>
          <td class="vce-bd-cell"><strong>${c.name}</strong>${manaNote}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.hd}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.beingType || "—"}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.armor || 0}</td>
          <td class="vce-bd-cell">${speedStr}</td>
          <td class="vce-bd-cell vce-bd-cell-actions">${actions || "—"}</td>
        </tr>`;
    }).join("");

    const content = `
      <div style="margin-bottom:8px;">
        <input type="text" class="vce-summon-search" placeholder="Search creatures..."
          style="width:100%; padding:4px 8px; border:1px solid #999; border-radius:4px;" />
      </div>
      <div class="vce-bd-scroll" style="max-height:400px; overflow-y:auto;">
        <table class="vce-bd-table" role="grid">
          <thead>
            <tr class="vce-bd-header-row">
              <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
              <th class="vce-bd-th" scope="col">Creature</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">HD</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Type</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Armor</th>
              <th class="vce-bd-th" scope="col">Speed</th>
              <th class="vce-bd-th" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:0.85em; opacity:0.7; margin-top:4px;">
        Max HD: ${maxHD} | Mana: ${currentMana} | Conjure cost: creature's HD
      </p>
    `;

    return new Promise((resolve) => {
      const d = new Dialog({
        title: `${actor.name} — Conjure Summon`,
        content,
        buttons: {
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
        },
        default: "cancel",
        render: (html) => {
          // Search filter
          html.find(".vce-summon-search").on("input", (ev) => {
            const query = ev.target.value.toLowerCase();
            html.find(".vce-summon-row").each(function () {
              const name = this.querySelector("strong")?.textContent?.toLowerCase() || "";
              this.style.display = name.includes(query) ? "" : "none";
            });
          });

          // Row click
          html.find(".vce-summon-row").on("click", async (ev) => {
            const idx = parseInt(ev.currentTarget.dataset.idx);
            const selected = candidates[idx];
            if (!selected) return;
            if ((actor.system?.mana?.current ?? 0) < selected.hd) {
              ui.notifications.warn(`Not enough mana! Need ${selected.hd}, have ${actor.system.mana.current}.`);
              return;
            }
            d.close();
            await this.conjureSummon(actor, selected);
            resolve(selected);
          });

          // Keyboard navigation
          html.find(".vce-summon-row").on("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              ev.currentTarget.click();
            }
          });

          // Auto-focus search
          setTimeout(() => html.find(".vce-summon-search").focus(), 50);
        },
        close: () => resolve(null)
      }, { width: 700, height: 500 });
      d.render(true);
    });
  },

  /* -------------------------------------------- */
  /*  Conjure / Banish                             */
  /* -------------------------------------------- */

  /**
   * Conjure a summon: spend mana, place token, acquire focus, apply Soulbonder.
   * @param {Actor} actor - The summoner
   * @param {object} npcData - Creature data { name, hd, img, size, armor, immunities, ... }
   */
  async conjureSummon(actor, npcData) {
    // Banish existing summon if any
    const existing = actor.getFlag(MODULE_ID, FLAG_CONJURE);
    if (existing) {
      await this.banishSummon(actor, "Replaced by new summon");
    }

    // Deduct mana (cost = HD)
    const cost = npcData.hd || 1;
    const currentMana = actor.system?.mana?.current ?? 0;
    if (currentMana < cost) {
      ui.notifications.error(`Not enough mana! Need ${cost}, have ${currentMana}.`);
      return;
    }
    await actor.update({ "system.mana.current": currentMana - cost });

    // Get or import the source actor
    let sourceActorId = npcData.worldActorId;
    let importedFromCompendium = false;

    if (!sourceActorId && npcData.compendiumUuid) {
      // Import from compendium to world
      const doc = await fromUuid(npcData.compendiumUuid);
      if (doc) {
        const [imported] = await Actor.create([doc.toObject()], { renderSheet: false });
        sourceActorId = imported.id;
        importedFromCompendium = true;
      }
    }

    if (!sourceActorId) {
      ui.notifications.error("Could not resolve source actor for summon.");
      return;
    }

    // Place token on canvas
    const summonerToken = actor.getActiveTokens()?.[0];
    if (!summonerToken) {
      ui.notifications.warn("No summoner token on canvas.");
      return;
    }

    const gridSize = canvas.grid?.size ?? 100;
    const sizeMultiplier = SIZE_MAP[npcData.size?.toLowerCase()] ?? 1;

    const [tokenDoc] = await canvas.scene.createEmbeddedDocuments("Token", [{
      name: npcData.name,
      actorId: sourceActorId,
      texture: { src: npcData.img || "icons/svg/mystery-man.svg" },
      x: summonerToken.document.x + gridSize,
      y: summonerToken.document.y,
      width: sizeMultiplier,
      height: sizeMultiplier,
      disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY
    }]);

    if (!tokenDoc) {
      ui.notifications.error("Failed to place summon token. Does your player role have 'Create Token' permission?");
      if (importedFromCompendium) {
        const imp = game.actors.get(sourceActorId);
        if (imp) try { await imp.delete(); } catch { /* permission */ }
      }
      return;
    }

    // Acquire focus
    const acquired = await FocusManager.acquireFeatureFocus(
      actor, FOCUS_KEY, `Summon (${npcData.name})`, npcData.img || "icons/svg/mystery-man.svg"
    );
    if (!acquired) {
      ui.notifications.warn("No focus slots available — summon cannot be maintained.");
      await canvas.scene.deleteEmbeddedDocuments("Token", [tokenDoc.id]);
      if (importedFromCompendium) {
        const imp = game.actors.get(sourceActorId);
        if (imp) try { await imp.delete(); } catch { /* permission */ }
      }
      return;
    }

    // Store conjure state
    await actor.setFlag(MODULE_ID, FLAG_CONJURE, {
      summonActorId: sourceActorId,
      summonTokenId: tokenDoc.id,
      summonName: npcData.name,
      summonImg: npcData.img,
      summonHD: npcData.hd,
      summonArmor: npcData.armor ?? 0,
      summonImmunities: npcData.immunities ?? [],
      importedFromCompendium,
      sceneId: canvas.scene.id
    });

    // Apply Soulbonder if L2+
    const features = getFeatures(actor);
    if (features?.summoner_soulbonder) {
      await this._applySoulbonder(actor, npcData);
    }

    // Chat notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <img src="${npcData.img || "icons/svg/mystery-man.svg"}" width="36" height="36"
              style="border:none; vertical-align:middle; margin-right:8px;">
            <strong>${actor.name}</strong> conjures <strong>${npcData.name}</strong>
            (HD ${npcData.hd}, ${cost} Mana)
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    log("Summoner", `${actor.name} conjured ${npcData.name} (HD ${npcData.hd}, ${cost} Mana)`);
  },

  /**
   * Banish the active summon: remove token, release focus, clean up.
   * @param {Actor} actor - The summoner
   * @param {string} reason - Why the summon was banished
   */
  async banishSummon(actor, reason = "Banished") {
    const conjure = actor.getFlag(MODULE_ID, FLAG_CONJURE);
    if (!conjure) return;

    // Remove token from canvas
    const scene = game.scenes.get(conjure.sceneId) || canvas.scene;
    const tokenDoc = scene?.tokens?.get(conjure.summonTokenId);
    if (tokenDoc) {
      await scene.deleteEmbeddedDocuments("Token", [tokenDoc.id]);
    }

    // Delete imported actor if from compendium (skip if player lacks permission)
    if (conjure.importedFromCompendium && conjure.summonActorId) {
      const importedActor = game.actors.get(conjure.summonActorId);
      if (importedActor) {
        try {
          await importedActor.delete();
        } catch (e) {
          log("Summoner", `Could not delete imported actor ${importedActor.name} (permission issue — GM can clean up)`);
        }
      }
    }

    // Release focus
    await FocusManager.releaseFeatureFocus(actor, FOCUS_KEY);

    // Remove Soulbonder AEs
    await this._removeSoulbonder(actor);

    // Clear flag
    await actor.unsetFlag(MODULE_ID, FLAG_CONJURE);

    // Chat notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>${actor.name}</strong>'s summon <strong>${conjure.summonName}</strong>
            is banished. <em>(${reason})</em>
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    log("Summoner", `${actor.name}'s ${conjure.summonName} banished: ${reason}`);
  },

  /**
   * Get the active conjure state for an actor.
   * @param {Actor} actor
   * @returns {object|null}
   */
  getActiveConjure(actor) {
    return actor?.getFlag(MODULE_ID, FLAG_CONJURE) ?? null;
  },

  /* -------------------------------------------- */
  /*  Summon Action Rolling                        */
  /* -------------------------------------------- */

  /**
   * Roll a summoned creature's action using the summoner's Mysticism check.
   * @param {Actor} summoner - The summoner actor
   * @param {object} conjure - The active conjure flag data
   * @param {number} actionIdx - Index into the summon actor's actions array
   */
  async rollSummonAction(summoner, conjure, actionIdx) {
    const summonActor = game.actors.get(conjure.summonActorId);
    if (!summonActor) {
      ui.notifications.error("Summon actor not found.");
      return;
    }

    const action = summonActor.system?.actions?.[actionIdx];
    if (!action) {
      ui.notifications.error("Action not found.");
      return;
    }

    // Determine attack type and whether a check is needed
    const attackType = action.attackType || "melee";
    const needsCheck = !!action.attackType;

    // Get summoner's mana skill (Mysticism for Summoner)
    const manaSkillKey = summoner.system?.classData?.manaSkill || "mysticism";
    const skill = summoner.system.skills?.[manaSkillKey];
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
      const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
      const rollData = summoner.getRollData();
      const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
        summoner.system.favorHinder || "none", false, false
      );
      roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);
      isSuccess = roll.total >= difficulty;
      const critNum = VagabondRollBuilder.calculateCritThreshold(rollData, "spell");
      const d20 = roll.terms.find(t => t.constructor.name === "Die" && t.faces === 20);
      isCritical = (d20?.results?.[0]?.result ?? 0) >= critNum;
    }

    // Roll damage if success and action has damage
    let damageRoll = null;
    const hasDamage = action.rollDamage || action.flatDamage;
    if (isSuccess && hasDamage) {
      const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");
      const formula = action.rollDamage && action.flatDamage
        ? `${action.rollDamage} + ${action.flatDamage}`
        : (action.rollDamage || action.flatDamage || "0");
      damageRoll = new Roll(formula);
      await damageRoll.evaluate();
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
    if (action.note) {
      tags.push({ label: action.note, cssClass: "tag-standard" });
    }

    // Use the system's createActionCard for proper styling
    const { VagabondChatCard } = globalThis.vagabond.utils;

    // Build a minimal "item" object for the chat card (it expects actor + item)
    const fakeItem = {
      name: `${action.name}`,
      img: conjure.summonImg || "icons/svg/mystery-man.svg",
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
      favorHinder: summoner.system.favorHinder || "none",
      critStatBonus: isCritical ? (summoner.system.stats?.[skill?.stat]?.value || 0) : 0
    } : null;

    await VagabondChatCard.createActionCard({
      actor: summoner,
      item: fakeItem,
      title: `${action.name} (${conjure.summonName})`,
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

    log("Summoner", `${summoner.name} used ${conjure.summonName}'s ${action.name}: ${isSuccess ? "hit" : "miss"}${damageRoll ? ` for ${damageRoll.total}` : ""}`);
  },

  /* -------------------------------------------- */
  /*  Soulbonder (L2)                              */
  /* -------------------------------------------- */

  /**
   * Apply summon's armor and immunities to the summoner as managed AEs.
   */
  async _applySoulbonder(actor, summonData) {
    const aes = [];

    // Armor bonus
    const armor = summonData.armor ?? 0;
    if (armor > 0) {
      aes.push({
        name: `Soulbonder: Armor (${summonData.name})`,
        icon: "icons/magic/defensive/shield-barrier-deflect-gold.webp",
        origin: `${MODULE_ID}.soulbonder`,
        changes: [{ key: "system.bonuses.armor", mode: 2, value: String(armor) }],
        disabled: false,
        transfer: true,
        flags: { [MODULE_ID]: { managed: true, [SOULBONDER_FLAG]: true } }
      });
    }

    // Immunities
    const immunities = summonData.immunities ?? [];
    if (immunities.length > 0) {
      aes.push({
        name: `Soulbonder: Immunities (${summonData.name})`,
        icon: "icons/magic/defensive/shield-barrier-deflect-gold.webp",
        origin: `${MODULE_ID}.soulbonder`,
        changes: [{ key: "system.statusImmunities", mode: 2, value: immunities.join(",") }],
        disabled: false,
        transfer: true,
        flags: { [MODULE_ID]: { managed: true, [SOULBONDER_FLAG]: true } }
      });
    }

    if (aes.length > 0) {
      await actor.createEmbeddedDocuments("ActiveEffect", aes);
      log("Summoner", `Soulbonder: Applied ${aes.length} AEs to ${actor.name} from ${summonData.name}`);
    }
  },

  /**
   * Remove all Soulbonder AEs from the summoner.
   */
  async _removeSoulbonder(actor) {
    const toDelete = actor.effects.filter(e => e.getFlag(MODULE_ID, SOULBONDER_FLAG));
    if (toDelete.length > 0) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete.map(e => e.id));
      log("Summoner", `Soulbonder: Removed ${toDelete.length} AEs from ${actor.name}`);
    }
  },

  /* -------------------------------------------- */
  /*  Internal Helpers                             */
  /* -------------------------------------------- */

  /**
   * Get the maximum HD for summons based on class level + features.
   */
  _getMaxHD(actor, features) {
    const classLevel = features?._classLevel ?? 1;
    const bonus = features?.summoner_ultimateWeapon ? 5 : 0;
    return classLevel + bonus;
  },

  /**
   * Gather eligible NPC candidates from world actors + bestiary compendium.
   * Filters: non-Humanlike, HD ≤ maxHD.
   */
  async _gatherCandidates(maxHD) {
    const candidates = [];
    const seen = new Set();

    // World NPCs
    for (const npc of game.actors.filter(a => a.type === "npc")) {
      const bt = npc.system.beingType || "";
      if (bt === "Humanlike") continue;
      if ((npc.system.hd ?? 1) > maxHD) continue;
      candidates.push({
        name: npc.name,
        hd: npc.system.hd ?? 1,
        beingType: bt,
        size: npc.system.size || "medium",
        armor: npc.system.armor ?? 0,
        speed: npc.system.speed ?? 30,
        speedValues: npc.system.speedValues || {},
        immunities: npc.system.immunities || [],
        weaknesses: npc.system.weaknesses || [],
        actions: npc.system.actions || [],
        img: npc.img,
        worldActorId: npc.id,
        compendiumUuid: null
      });
      seen.add(npc.name);
    }

    // Bestiary compendium
    const bestiary = game.packs.get("vagabond.bestiary");
    if (bestiary) {
      for (const entry of bestiary.index.values()) {
        if (seen.has(entry.name)) continue;
        const bt = entry.system?.beingType || "";
        if (bt === "Humanlike") continue;
        if ((entry.system?.hd ?? 1) > maxHD) continue;
        candidates.push({
          name: entry.name,
          hd: entry.system?.hd ?? 1,
          beingType: bt,
          size: entry.system?.size || "medium",
          armor: entry.system?.armor ?? 0,
          speed: entry.system?.speed ?? 30,
          speedValues: entry.system?.speedValues || {},
          immunities: entry.system?.immunities || [],
          weaknesses: entry.system?.weaknesses || [],
          actions: entry.system?.actions || [],
          img: entry.img,
          worldActorId: null,
          compendiumUuid: entry.uuid
        });
      }
    }

    return candidates;
  },

  /**
   * Drain 1 mana for focus upkeep. Banish if insufficient.
   */
  async _drainMana(actor) {
    const current = actor.system?.mana?.current ?? 0;
    if (current < 1) {
      await this.banishSummon(actor, "Out of Mana");
      return;
    }
    await actor.update({ "system.mana.current": current - 1 });
    log("Summoner", `${actor.name}: 1 Mana drained for summon focus (${current} → ${current - 1})`);
  }
};
