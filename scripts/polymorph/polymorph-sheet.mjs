/**
 * Polymorph Sheet Injection
 * Monkey-patches VagabondCharacterSheet._onRender to replace the left panel
 * content with a Beast Form statblock when the druid is polymorphed.
 * The right sliding panel (HP, stats, skills, spells, focus) stays untouched.
 */

import { MODULE_ID } from "../utils.mjs";

export const PolymorphSheet = {

  _patched: false,
  _cachedImports: null,

  /**
   * Register hooks to inject beast form content on character sheet render.
   * Uses Foundry's render hook instead of monkey-patching _onRender,
   * which is more reliable across system updates.
   */
  patchSheet() {
    if (this._patched) return;
    const self = this;

    // Eagerly load and cache imports so _buildBeastListHTML can use them synchronously
    import("./beast-cache.mjs").then(({ BeastCache }) => {
      import("./polymorph-manager.mjs").then(({ PolymorphManager }) => {
        self._cachedImports = { BeastCache, PolymorphManager };
        if (!BeastCache._ready) BeastCache.initialize();
      });
    });

    // 1. Use render hook to inject beast form on every character sheet render.
    //    Foundry V2 ApplicationV2 fires "renderApplicationV2" and "renderActorSheetV2".
    Hooks.on("renderApplicationV2", (app, html, data) => {
      if (app.document?.type === "character") {
        self._injectBeastForm(app);
      }
    });

    // 2. Register custom actions via Foundry's V2 action delegation system.
    const sheetClass = CONFIG.Actor.sheetClasses?.character?.["vagabond.VagabondCharacterSheet"]?.cls;
    const actions = sheetClass?.DEFAULT_OPTIONS?.actions;
    if (actions) {
      actions.vceBeastAction = async function (event, target) {
        event.preventDefault();
        event.stopPropagation();
        const actor = this.document;
        const polyData = actor?.getFlag(MODULE_ID, "polymorphData");
        if (!polyData) return;
        const idx = parseInt(target.closest("[data-action-index]")?.dataset?.actionIndex ?? target.dataset?.actionIndex);
        if (isNaN(idx)) return;
        await self._rollBeastAction(actor, idx, polyData);
      };
      actions.vceEndPolymorph = async function (event, target) {
        event.preventDefault();
        event.stopPropagation();
        const actor = this.document;
        const spellIds = actor.system.focus?.spellIds ?? [];
        const filtered = spellIds.filter(id => {
          const spell = actor.items.get(id);
          return !spell?.name?.toLowerCase().includes("polymorph");
        });
        await actor.update({ "system.focus.spellIds": filtered });
      };
    }

    this._patched = true;
    console.log(`${MODULE_ID} | PolymorphSheet | Registered render hooks for beast form injection.`);
  },


  /**
   * Inject Beast Form tab on druid character sheets.
   * Always visible for druids — when not polymorphed, clicking it opens the dialog.
   * When polymorphed, shows the beast form panel.
   */
  _injectBeastForm(sheet) {
    const actor = sheet.document;
    if (actor?.type !== "character") return;

    const sheetEl = sheet.element;
    if (!sheetEl) return;

    const windowContent = sheetEl.querySelector(".window-content");
    if (!windowContent) return;

    const tabNav = windowContent.querySelector("nav.sheet-tabs");
    if (!tabNav) return;

    // Check if this actor is a druid
    const features = actor.getFlag(MODULE_ID, "features");
    const isDruid = !!(features?.druid_feralShift || features?.druid_primalMystic);

    if (!isDruid) {
      // Not a druid — clean up any stale beast form elements
      windowContent.querySelector('section.tab[data-tab="vce-beast-form"]')?.remove();
      tabNav.querySelector('[data-tab="vce-beast-form"]')?.remove();
      return;
    }

    const polyData = actor.getFlag(MODULE_ID, "polymorphData");
    const actorSheet = actor.sheet;

    // --- DRUID: Always show Beast Form tab ---

    // Remove stale elements to avoid duplicates on re-render
    windowContent.querySelector('section.tab[data-tab="vce-beast-form"]')?.remove();
    tabNav.querySelector('[data-tab="vce-beast-form"]')?.remove();

    // Create tab link
    const beastTab = document.createElement("a");
    beastTab.dataset.action = "tab";
    beastTab.dataset.tab = "vce-beast-form";
    beastTab.dataset.group = "primary";
    beastTab.innerHTML = "<span>Beast Form</span>";
    tabNav.prepend(beastTab);

    // Create tab section
    const beastForm = document.createElement("section");
    beastForm.className = "tab vce-beast-form scrollable";
    beastForm.dataset.tab = "vce-beast-form";
    beastForm.dataset.group = "primary";

    if (polyData) {
      // POLYMORPHED — show beast form panel
      beastForm.innerHTML = this._buildBeastFormHTML(polyData);
    } else {
      // NOT POLYMORPHED — show inline beast selection list
      beastForm.innerHTML = this._buildBeastListHTML(actor);
    }

    const firstTab = windowContent.querySelector("section.tab");
    if (firstTab) {
      windowContent.insertBefore(beastForm, firstTab);
    } else {
      const slidingPanel = windowContent.querySelector("aside.sliding-panel");
      windowContent.insertBefore(beastForm, slidingPanel);
    }

    // Click handler for Beast Form tab — always just switches to the tab
    beastTab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      beastTab.classList.add("active");
      beastForm.classList.add("active");
      actorSheet._vceActiveTab = "vce-beast-form";
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-beast-form";
    });

    // Determine which tab should be active.
    // When polymorphed: default to Beast Form on first render.
    // When not polymorphed but was on Beast Form: stay on it (shows beast list).
    if (polyData && !actorSheet._vceActiveTab) {
      actorSheet._vceActiveTab = "vce-beast-form";
    }

    const desiredTab = actorSheet._vceActiveTab;
    if (desiredTab === "vce-beast-form") {
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      beastTab.classList.add("active");
      beastForm.classList.add("active");
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-beast-form";
    } else if (polyData && desiredTab) {
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      const targetTabLink = tabNav.querySelector(`[data-tab="${desiredTab}"]`);
      const targetSection = windowContent.querySelector(`section.tab[data-tab="${desiredTab}"]`);
      if (targetTabLink) targetTabLink.classList.add("active");
      if (targetSection) targetSection.classList.add("active");
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = desiredTab;
    }

    // Track when user clicks other tabs
    tabNav.querySelectorAll("[data-tab]:not([data-tab='vce-beast-form'])").forEach(t => {
      t.addEventListener("click", () => {
        actorSheet._vceActiveTab = t.dataset.tab;
      });
    });

    // Bind action clicks and end button (only when polymorphed)
    if (polyData) {
      this._bindActions(beastForm, actor, polyData);
    }

    // Bind inline beast row clicks (when not polymorphed)
    if (!polyData) {
      this._bindBeastRowClicks(beastForm, actor);
    }
  },

  /**
   * Open the beast selection dialog and handle the full polymorph flow.
   */
  async _openBeastDialog(actor) {
    const { BeastCache } = await import("./beast-cache.mjs");
    const { PolymorphDialog } = await import("./polymorph-dialog.mjs");
    const { PolymorphManager } = await import("./polymorph-manager.mjs");

    if (!BeastCache._ready) await BeastCache.initialize();

    const level = actor.system.attributes?.level?.value ?? 1;
    const beasts = BeastCache.getAvailableBeasts(level);

    if (beasts.length === 0) {
      ui.notifications.warn("No Beasts found with HD ≤ your level.");
      return;
    }

    PolymorphDialog.show(actor, beasts, async (selectedBeast) => {
      // Flag to prevent the updateActor hook from opening a second dialog
      PolymorphManager._transformInProgress = true;

      try {
        // Auto-set Polymorph focus (triggers Savagery toggle via updateActor hook)
        const polymorphSpell = actor.items.find(i =>
          i.name?.toLowerCase().includes("polymorph") && i.type === "spell"
        );
        if (polymorphSpell) {
          const currentFocus = actor.system.focus?.spellIds ?? [];
          if (!currentFocus.includes(polymorphSpell.id)) {
            await actor.update({
              "system.focus.spellIds": [...currentFocus, polymorphSpell.id]
            });
          }
        }

        // Apply beast form
        await PolymorphManager.applyBeastFormFromCache(actor, selectedBeast);
      } finally {
        PolymorphManager._transformInProgress = false;
      }
    });
  },

  /**
   * Bind click/keyboard handlers on inline beast selection rows.
   */
  _bindBeastRowClicks(container, actor) {
    const { BeastCache, PolymorphManager } = this._cachedImports || {};
    if (!BeastCache || !PolymorphManager) return;

    const level = actor.system.attributes?.level?.value ?? 1;
    const beasts = BeastCache.getAvailableBeasts(level);
    const sorted = [...beasts].sort((a, b) =>
      (a.hd ?? 1) - (b.hd ?? 1) || a.name.localeCompare(b.name)
    );

    let selecting = false;

    const selectBeast = async (row) => {
      if (selecting) return;
      selecting = true;

      const beastName = row.dataset.beastName;
      const beast = sorted.find(b => b.name === beastName);
      if (!beast) { selecting = false; return; }

      // Visual feedback — highlight the row
      row.classList.add("vce-beast-row-selected");

      // Flag to prevent the updateActor hook from opening a second dialog
      PolymorphManager._transformInProgress = true;

      try {
        // Auto-set Polymorph focus
        const polymorphSpell = actor.items.find(i =>
          i.name?.toLowerCase().includes("polymorph") && i.type === "spell"
        );
        if (polymorphSpell) {
          const currentFocus = actor.system.focus?.spellIds ?? [];
          if (!currentFocus.includes(polymorphSpell.id)) {
            await actor.update({
              "system.focus.spellIds": [...currentFocus, polymorphSpell.id]
            });
          }
        }

        // Apply beast form — this triggers a sheet re-render which swaps to the beast panel
        await PolymorphManager.applyBeastFormFromCache(actor, beast);
      } finally {
        PolymorphManager._transformInProgress = false;
        selecting = false;
      }
    };

    container.querySelectorAll(".vce-beast-row").forEach(row => {
      // Left-click to select
      row.addEventListener("click", (e) => selectBeast(e.currentTarget));

      // Right-click to toggle favorite
      row.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        const beastName = row.dataset.beastName;
        const currentFavs = actor.getFlag(MODULE_ID, "beastFavorites") || [];
        let newFavs;
        if (currentFavs.includes(beastName)) {
          newFavs = currentFavs.filter(n => n !== beastName);
        } else {
          newFavs = [...currentFavs, beastName];
        }
        await actor.setFlag(MODULE_ID, "beastFavorites", newFavs);
        // Sheet will re-render via updateActor hook, which rebuilds the list
      });

      // Keyboard navigation
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectBeast(e.currentTarget);
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.currentTarget.nextElementSibling?.focus();
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.currentTarget.previousElementSibling?.focus();
        }
      });
    });
  },

  /**
   * Build the inline beast selection list shown on the Beast Form tab when not polymorphed.
   * Uses BeastCache data — must be initialized before calling.
   */
  _buildBeastListHTML(actor) {
    const { BeastCache } = this._cachedImports || {};
    const level = actor.system.attributes?.level?.value ?? 1;

    // If cache not ready, show a loading message with a button fallback
    if (!BeastCache || !BeastCache._ready) {
      return `
        <div class="vce-bf-prompt">
          <i class="fas fa-paw vce-bf-prompt-icon" aria-hidden="true"></i>
          <h2 class="vce-bf-prompt-title">Beast Form</h2>
          <p class="vce-bf-prompt-desc">Loading beasts…</p>
        </div>
      `;
    }

    const beasts = BeastCache.getAvailableBeasts(level);
    if (beasts.length === 0) {
      return `
        <div class="vce-bf-prompt">
          <i class="fas fa-paw vce-bf-prompt-icon" aria-hidden="true"></i>
          <h2 class="vce-bf-prompt-title">Beast Form</h2>
          <p class="vce-bf-prompt-desc">No Beasts available at Level ${level}</p>
        </div>
      `;
    }

    // Get favorites from actor flag
    const favorites = actor.getFlag(MODULE_ID, "beastFavorites") || [];

    // Sort: favorites first (by name), then rest by HD ascending + name
    const sorted = [...beasts].sort((a, b) => {
      const aFav = favorites.includes(a.name);
      const bFav = favorites.includes(b.name);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return (a.hd ?? 1) - (b.hd ?? 1) || a.name.localeCompare(b.name);
    });

    const rows = sorted.map((b) => {
      const hd = b.hd ?? 1;
      const size = b.size ?? "medium";
      const armor = b.armor ?? 0;
      const speed = b.speed ?? 30;
      const speedExtras = [];
      const sv = b.speedValues || {};
      if (sv.fly) speedExtras.push(`Fly ${sv.fly}'`);
      if (sv.swim) speedExtras.push(`Swim ${sv.swim}'`);
      if (sv.climb) speedExtras.push(`Climb ${sv.climb}'`);
      if (sv.cling) speedExtras.push(`Cling ${sv.cling}'`);
      const speedStr = `${speed}'` + (speedExtras.length ? ` (${speedExtras.join(", ")})` : "");

      const actions = (b.actions ?? []).map(a => {
        const dmg = a.rollDamage || a.flatDamage || "—";
        return `${a.name}: ${dmg}`;
      }).join("; ");

      const img = b.img || "icons/svg/mystery-man.svg";
      const isFav = favorites.includes(b.name);
      const starIcon = isFav
        ? `<i class="fas fa-star vce-bd-fav-star vce-bd-fav-active" aria-label="Favorited"></i>`
        : `<i class="far fa-star vce-bd-fav-star" aria-label="Not favorited"></i>`;
      const favClass = isFav ? " vce-beast-row-fav" : "";

      return `
        <tr class="vce-beast-row${favClass}" data-beast-name="${b.name}"
            role="button" tabindex="0" aria-label="${b.name}, HD ${hd}, ${size}"
            title="${isFav ? "Right-click to unfavorite" : "Right-click to favorite"}">
          <td class="vce-bd-cell vce-bd-cell-img">
            <img src="${img}" class="vce-bd-beast-img" alt="" loading="lazy" />
          </td>
          <td class="vce-bd-cell"><strong>${starIcon} ${b.name}</strong></td>
          <td class="vce-bd-cell vce-bd-cell-center">${hd}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${size}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${armor}</td>
          <td class="vce-bd-cell">${speedStr}</td>
          <td class="vce-bd-cell vce-bd-cell-actions">${actions || "—"}</td>
        </tr>`;
    }).join("");

    return `
      <div class="vce-bf-beast-list">
        <table class="vce-bd-table" role="grid" aria-label="Available beasts">
          <thead>
            <tr class="vce-bd-header-row">
              <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
              <th class="vce-bd-th" scope="col">Beast</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">HD</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Size</th>
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
   * Build full Beast Form HTML (replaces the entire left panel).
   */
  _buildBeastFormHTML(polyData) {
    const speedParts = [`${polyData.speed}'`];
    const sv = polyData.speedValues || {};
    if (sv.fly) speedParts.push(`Fly ${sv.fly}'`);
    if (sv.swim) speedParts.push(`Swim ${sv.swim}'`);
    if (sv.climb) speedParts.push(`Climb ${sv.climb}'`);
    if (sv.cling) speedParts.push(`Cling ${sv.cling}'`);

    // --- Header ---
    let html = `
      <div class="vce-bf-header">
        <img src="${polyData.beastImg}" class="vce-bf-portrait" alt="${polyData.beastName} portrait" />
        <div class="vce-bf-info">
          <h2 class="vce-bf-name">${polyData.beastName}</h2>
          <div class="vce-bf-tags">
            <span class="vce-bf-tag">HD ${polyData.hd}</span>
            <span class="vce-bf-tag">${polyData.size}</span>
            <span class="vce-bf-tag">Beast</span>
          </div>
        </div>
        <button class="vce-bf-end" data-action="vceEndPolymorph"
                title="End Polymorph (drop focus)" aria-label="End beast form and revert to normal">
          <i class="fas fa-times" aria-hidden="true"></i> End Form
        </button>
      </div>
    `;

    // --- Armor overlay (mirrors system armor-overlay) ---
    html += `
      <div class="vce-bf-stats-row">
        <div class="armor-overlay vce-bf-armor-overlay">
          <div class="armor-name">Armor</div>
          <div class="armor-value">${polyData.armor}</div>
        </div>

        <div class="speed-stats-row">
          <div class="speed-group">
            <label class="speed-group-label">Crawl</label>
            <div class="speed-group-cell"><span class="speed-group-input">${polyData.speed * 3}</span><span class="speed-group-unit">'</span></div>
            <div class="speed-group-cell"><span class="speed-group-input speed-group-input-main">${polyData.speed}</span><span class="speed-group-unit">'</span></div>
            <label class="speed-group-label">Travel</label>
            <div class="speed-group-cell"><span class="speed-group-input">${Math.floor(polyData.speed / 5)}</span><span class="speed-group-unit">mi</span></div>
            <label class="speed-group-speed-label">Speed</label>
          </div>
        </div>
      </div>
    `;

    // Extra speeds (fly, swim, climb) and senses shown as text below
    const extraSpeeds = [];
    if (sv.fly) extraSpeeds.push(`Fly ${sv.fly}'`);
    if (sv.swim) extraSpeeds.push(`Swim ${sv.swim}'`);
    if (sv.climb) extraSpeeds.push(`Climb ${sv.climb}'`);
    if (sv.cling) extraSpeeds.push(`Cling ${sv.cling}'`);
    if (extraSpeeds.length || polyData.senses) {
      html += `<div class="vce-bf-extras">`;
      if (extraSpeeds.length) {
        html += `<span><strong>Movement:</strong> ${extraSpeeds.join(", ")}</span>`;
      }
      if (polyData.senses) {
        html += `<span><strong>Senses:</strong> ${polyData.senses}</span>`;
      }
      html += `</div>`;
    }

    // --- Immunities / Weaknesses ---
    if (polyData.immunities?.length || polyData.weaknesses?.length) {
      html += `<div class="vce-bf-resists">`;
      if (polyData.immunities?.length) {
        html += `<div class="vce-bf-resist"><strong>Immune:</strong> ${polyData.immunities.join(", ")}</div>`;
      }
      if (polyData.weaknesses?.length) {
        html += `<div class="vce-bf-resist"><strong>Weak:</strong> ${polyData.weaknesses.join(", ")}</div>`;
      }
      html += `</div>`;
    }

    // --- Actions ---
    const actions = polyData.actions || [];
    if (actions.length > 0) {
      html += `<div class="vce-bf-section">
        <h3 class="vce-bf-section-title">Actions</h3>`;

      for (let i = 0; i < actions.length; i++) {
        const a = actions[i];

        // Multi-attack headers are descriptive labels, not clickable
        if (a.isMultiAttack) {
          // Build descriptive text from the extraInfo or name + note content
          const desc = a.extraInfo || a.name;
          html += `
            <div class="vce-bf-multi-attack-label" role="note" aria-label="${a.name}: ${desc}">
              <i class="fas fa-layer-group vce-bf-multi-icon" aria-hidden="true"></i>
              <span class="vce-bf-multi-text">${a.name}: ${desc}</span>
            </div>`;
          continue;
        }

        // Individual attack — clickable button
        const dmgParts = [];
        if (a.flatDamage) dmgParts.push(a.flatDamage);
        if (a.rollDamage) dmgParts.push(`(${a.rollDamage})`);
        const dmgStr = dmgParts.join(" / ") || "";
        const typeStr = a.damageType && a.damageType !== "-" ? ` ${a.damageType}` : "";
        const note = a.note ? ` <span class="vce-bf-action-note">[${a.note}]</span>` : "";
        const recharge = a.recharge ? ` <span class="vce-bf-recharge">(Recharge ${a.recharge})</span>` : "";
        const extra = a.extraInfo ? `<div class="vce-bf-action-extra">${a.extraInfo}</div>` : "";

        // Show condition badges if causedStatuses were parsed
        let condBadges = "";
        if (a.causedStatuses?.length) {
          const badges = a.causedStatuses.map(cs => {
            const duration = cs.duration ? ` (${cs.duration})` : "";
            const tooltip = `Applies ${cs.statusId}${duration} on hit`;
            return `<span class="vce-bf-condition-badge" title="${tooltip}">${cs.statusId}</span>`;
          }).join("");
          condBadges = `<div class="vce-bf-condition-badges">${badges}</div>`;
        }

        const ariaLabel = `Roll ${a.name}${dmgStr ? `, ${dmgStr} damage` : ""}`;
        html += `
          <div class="vce-bf-action" data-action="vceBeastAction" data-action-index="${i}"
               role="button" tabindex="0" aria-label="${ariaLabel}">
            <div class="vce-bf-action-header">
              <i class="fas fa-dice-d20 vce-bf-roll-icon" aria-hidden="true"></i>
              <span class="vce-bf-action-name">${a.name}</span>${note}${recharge}
              ${dmgStr ? `<span class="vce-bf-action-damage">${dmgStr}${typeStr}</span>` : ""}
            </div>
            ${condBadges}
            ${extra}
          </div>`;
      }
      html += `</div>`;
    }

    // --- Abilities ---
    const abilities = polyData.abilities || [];
    if (abilities.length > 0) {
      html += `<div class="vce-bf-section">
        <h3 class="vce-bf-section-title">Abilities</h3>`;

      for (let i = 0; i < abilities.length; i++) {
        const ab = abilities[i];
        html += `
          <div class="vce-bf-ability">
            <strong>${ab.name}:</strong> ${ab.description}
          </div>`;
      }
      html += `</div>`;
    }

    return html;
  },

  /**
   * Bind any non-action click handlers.
   * Beast action clicks and End Form button use Foundry's V2 data-action
   * delegation (registered in patchSheet), so no addEventListener needed.
   */
  _bindActions(container, actor, polyData) {
    // All click handlers now use data-action="vceBeastAction" and
    // data-action="vceEndPolymorph" via Foundry's V2 action system.
    // No manual addEventListener needed.
  },

  /**
   * Roll a Beast action as the druid using a Mysticism (Cast skill) check.
   *
   * Flow: Mysticism check → Hit/Miss → If hit, roll Beast damage → Save buttons
   *
   * Per the Shapechanger perk: "you use your Cast Skill for its Actions".
   * So the druid rolls Mysticism vs difficulty, and on a hit the Beast's
   * damage formula is rolled and posted with the full system card.
   */
  async _rollBeastAction(druidActor, actionIndex, polyData) {
    // Use the enriched action from polyData (has parsed causedStatuses + isMultiAttack flag)
    const action = polyData.actions?.[actionIndex];
    if (!action) {
      ui.notifications.warn(`Action index ${actionIndex} not found on ${polyData.beastName}.`);
      return;
    }

    // Skip multi-attack labels (shouldn't be clickable, but guard anyway)
    if (action.isMultiAttack) return;

    try {
      const { VagabondChatCard } = await import("/systems/vagabond/module/helpers/chat-card.mjs");
      const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
      const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");

      // --- 1. Roll Mysticism check (druid's Cast skill) ---
      const castSkillKey = druidActor.system.attributes?.manaSkill || "mysticism";
      const rollData = druidActor.getRollData();
      const castSkill = rollData.skills?.[castSkillKey];
      const difficulty = castSkill?.difficulty || 10;

      // Check favor/hinder from druid's current state
      const favorHinder = druidActor.system.favorHinder || "none";
      const roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);

      const isHit = roll.total >= difficulty;

      // Crit check on the d20 result
      const critNumber = VagabondRollBuilder.calculateCritThreshold(rollData, castSkillKey);
      const d20Term = roll.terms.find(t => t.constructor?.name === "Die" && t.faces === 20);
      const d20Result = d20Term?.results?.[0]?.result || 0;
      const isCritical = d20Result >= critNumber;

      // Crit stat bonus — the stat associated with the cast skill (e.g., Awareness for Mysticism)
      let critStatBonus = 0;
      if (isCritical && castSkill?.stat) {
        critStatBonus = rollData.stats?.[castSkill.stat]?.value || 0;
      }

      // --- 2. Prepare damage info ---
      const damageFormula = action.rollDamage || action.flatDamage || null;
      const hasDamage = !!damageFormula;
      const rawDamageType = action.damageType || "physical";

      // --- 3. Build tags ---
      const tags = [
        { label: castSkill?.label || castSkillKey, cssClass: "tag-skill" }
      ];

      if (action.note) {
        tags.push({ label: action.note, cssClass: "tag-standard" });
      }
      if (action.recharge) {
        tags.push({ label: `Recharge ${action.recharge}`, icon: "fas fa-rotate", cssClass: "tag-standard" });
      }

      // Damage tag (shows formula in the tag strip, e.g., "1d6")
      if (damageFormula) {
        if (rawDamageType !== "-") {
          const icon = CONFIG.VAGABOND?.damageTypeIcons?.[rawDamageType.toLowerCase()] || "fas fa-burst";
          tags.push({ label: damageFormula, icon, cssClass: "tag-damage" });
        } else {
          tags.push({ label: damageFormula, cssClass: "tag-damage" });
        }
      }

      // --- 4. Description with extra info + condition notes ---
      let description = "";
      if (action.extraInfo) {
        description = action.extraInfo;
      }

      // --- 5. Capture targets ---
      const targetsAtRollTime = Array.from(game.user.targets).map(token => ({
        tokenId: token.id,
        sceneId: token.scene.id,
        actorId: token.actor?.id,
        actorName: token.name,
        actorImg: token.document.texture.src
      }));

      // --- 6. Determine attack type ---
      let attackType = action.attackType || "melee";
      if (attackType === "castClose") attackType = "melee";
      else if (attackType === "castRanged") attackType = "ranged";

      // --- 7. Roll damage if "roll damage with check" setting is ON ---
      let damageRoll = null;
      if (isHit && hasDamage && VagabondDamageHelper.shouldRollDamage(isHit)) {
        if (action.rollDamage && /d\d+/i.test(action.rollDamage)) {
          damageRoll = new Roll(action.rollDamage, druidActor.getRollData());
          await damageRoll.evaluate();
        } else if (action.flatDamage) {
          damageRoll = new Roll(`${action.flatDamage}`);
          await damageRoll.evaluate();
        }
      }

      // --- 8. Post a single card with check + damage/button ---
      // The system's createActionCard needs an `item` to show the "Roll Damage"
      // button. Use the Polymorph spell as the item reference.
      const polymorphSpell = druidActor.items.find(i =>
        i.name?.toLowerCase().includes("polymorph") && i.type === "spell"
      );

      const result = await VagabondChatCard.createActionCard({
        actor: druidActor,
        item: polymorphSpell || null,
        title: `${polyData.beastName}: ${action.name}`,
        subtitle: druidActor.name,
        rollData: {
          roll,
          difficulty,
          isHit,
          isCritical,
          critNumber,
          critStatBonus,
          weaponSkill: castSkill
        },
        tags,
        description,
        damageRoll,
        damageFormula: hasDamage ? damageFormula : null,
        damageType: rawDamageType,
        hasDefenses: true,
        attackType,
        targetsAtRollTime,
        actionIndex
      });

      // Grant luck on crit (same as weapon attacks)
      if (isCritical && critStatBonus) {
        await VagabondChatCard._grantLuckOnCrit?.(druidActor, result, "Critical Hit");
      }

      // --- 9. Auto-apply conditions to targets on hit ---
      if (isHit && action.causedStatuses?.length > 0 && targetsAtRollTime.length > 0) {
        await this._applyConditionsToTargets(druidActor, action, targetsAtRollTime, polyData);
      }

    } catch (e) {
      console.error(`${MODULE_ID} | PolymorphSheet | Failed to roll beast action:`, e);
      ui.notifications.error("Failed to roll beast action. Check console.");
    }
  },

  /**
   * Auto-apply conditions from a beast action to all targeted tokens.
   * Per user ruling: no save required — if the cast check hits, conditions apply.
   */
  async _applyConditionsToTargets(druidActor, action, targetsAtRollTime, polyData) {
    try {
      const { StatusHelper } = await import("/systems/vagabond/module/helpers/status-helper.mjs");

      for (const targetInfo of targetsAtRollTime) {
        const targetActor = game.actors.get(targetInfo.actorId);
        if (!targetActor) continue;

        const sourceName = `${polyData.beastName}: ${action.name}`;

        for (const statusEntry of action.causedStatuses) {
          // Check if target is immune
          if (StatusHelper.isStatusImmune?.(targetActor, statusEntry.statusId)) {
            ui.notifications.info(`${targetInfo.actorName} is immune to ${statusEntry.statusId}.`);
            continue;
          }

          // Check if already active
          if (StatusHelper.actorHasStatus?.(targetActor, statusEntry.statusId)) {
            continue;
          }

          // Apply the status directly (no save — per ruling)
          await targetActor.toggleStatusEffect(statusEntry.statusId, { active: true });

          // Post a notification chat message
          const statusLabel = statusEntry.statusId.charAt(0).toUpperCase() + statusEntry.statusId.slice(1);
          ChatMessage.create({
            content: `<div class="vce-condition-applied">
              <i class="fas fa-exclamation-triangle"></i>
              <strong>${statusLabel}</strong> applied to <strong>${targetInfo.actorName}</strong>
              <span class="vce-condition-source">from ${sourceName}</span>
            </div>`,
            speaker: ChatMessage.getSpeaker({ actor: druidActor })
          });
        }
      }
    } catch (e) {
      console.error(`${MODULE_ID} | PolymorphSheet | Failed to apply conditions:`, e);
    }
  }
};
