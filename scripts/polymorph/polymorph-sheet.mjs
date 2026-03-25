/**
 * Polymorph Sheet Injection
 * Monkey-patches VagabondCharacterSheet._onRender to replace the left panel
 * content with a Beast Form statblock when the druid is polymorphed.
 * The right sliding panel (HP, stats, skills, spells, focus) stays untouched.
 */

import { MODULE_ID } from "../vagabond-character-enhancer.mjs";

export const PolymorphSheet = {

  _patched: false,

  /**
   * Register hooks to inject beast form content on character sheet render.
   * Uses Foundry's render hook instead of monkey-patching _onRender,
   * which is more reliable across system updates.
   */
  patchSheet() {
    if (this._patched) return;
    const self = this;

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
      // NOT POLYMORPHED — show a prompt to transform
      beastForm.innerHTML = this._buildBeastPromptHTML(actor);
    }

    const firstTab = windowContent.querySelector("section.tab");
    if (firstTab) {
      windowContent.insertBefore(beastForm, firstTab);
    } else {
      const slidingPanel = windowContent.querySelector("aside.sliding-panel");
      windowContent.insertBefore(beastForm, slidingPanel);
    }

    // Click handler for Beast Form tab
    beastTab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // If not polymorphed, clicking Beast Form tab opens the selection dialog
      if (!actor.getFlag(MODULE_ID, "polymorphData")) {
        this._openBeastDialog(actor);
        return;
      }

      // Polymorphed — switch to beast form tab
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      beastTab.classList.add("active");
      beastForm.classList.add("active");
      actorSheet._vceActiveTab = "vce-beast-form";
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-beast-form";
    });

    // Determine which tab should be active.
    // When polymorphed: default to Beast Form on first render.
    // When not polymorphed: don't force Beast Form active.
    if (polyData) {
      if (!actorSheet._vceActiveTab) {
        actorSheet._vceActiveTab = "vce-beast-form";
      }

      const desiredTab = actorSheet._vceActiveTab;
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));

      if (desiredTab === "vce-beast-form") {
        beastTab.classList.add("active");
        beastForm.classList.add("active");
        if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-beast-form";
      } else {
        const targetTabLink = tabNav.querySelector(`[data-tab="${desiredTab}"]`);
        const targetSection = windowContent.querySelector(`section.tab[data-tab="${desiredTab}"]`);
        if (targetTabLink) targetTabLink.classList.add("active");
        if (targetSection) targetSection.classList.add("active");
        if (actorSheet.tabGroups) actorSheet.tabGroups.primary = desiredTab;
      }
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

    // Bind the "Transform" button in the prompt (when not polymorphed)
    const transformBtn = beastForm.querySelector(".vce-bf-transform-btn");
    if (transformBtn) {
      transformBtn.addEventListener("click", () => this._openBeastDialog(actor));
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
   * Build the "not polymorphed" prompt shown on the Beast Form tab.
   */
  _buildBeastPromptHTML(actor) {
    const level = actor.system.attributes?.level?.value ?? 1;
    return `
      <div class="vce-bf-prompt">
        <i class="fas fa-paw vce-bf-prompt-icon" aria-hidden="true"></i>
        <h2 class="vce-bf-prompt-title">Beast Form</h2>
        <p class="vce-bf-prompt-desc">Choose a Beast to transform into (HD ≤ ${level})</p>
        <button class="vce-bf-transform-btn" type="button"
                aria-label="Open beast selection to transform">
          <i class="fas fa-exchange-alt" aria-hidden="true"></i> Transform
        </button>
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

      await VagabondChatCard.createActionCard({
        actor: druidActor,
        item: polymorphSpell || null,
        title: `${polyData.beastName}: ${action.name}`,
        subtitle: druidActor.name,
        rollData: {
          roll,
          difficulty,
          isHit,
          isCritical,
          critNumber
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
