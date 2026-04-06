/**
 * Focus Manager
 * Tracks feature-based focus alongside the system's spell focus.
 * Plays persistent Sequencer FX on tokens while focusing.
 *
 * Feature focus is stored as an array flag:
 *   flags.vagabond-character-enhancer.featureFocus = [
 *     { key: "hunter_huntersMark", label: "Hunter's Mark", icon: "..." }
 *   ]
 *
 * Features and spells share the same focus pool (system.focus.max).
 * Combined count = system.focus.spellIds.length + featureFocus.length.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { getFeatureFxConfig } from "./feature-fx-config.mjs";

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

export const FocusManager = {

  /**
   * Acquire feature focus for an actor.
   * Adds the feature to the featureFocus flag array, checks combined cap,
   * syncs "focusing" status and FX.
   * @param {Actor} actor
   * @param {string} featureKey - Unique key (e.g. "hunter_huntersMark")
   * @param {string} label - Display name (e.g. "Hunter's Mark")
   * @param {string} [icon] - Icon path for sheet display
   * @returns {Promise<boolean>} true if acquired, false if no slots available
   */
  async acquireFeatureFocus(actor, featureKey, label, icon = null) {
    const current = this._getFeatureFocus(actor);

    // Already focusing this feature
    if (current.some(f => f.key === featureKey)) return true;

    // Check combined cap
    const remaining = this.getRemainingFocusSlots(actor);
    if (remaining <= 0) {
      log("FocusManager", `No focus slots available for ${actor.name} — cannot acquire ${featureKey}`);
      return false;
    }

    const entry = { key: featureKey, label, icon: icon || "icons/svg/aura.svg" };
    const next = [...current, entry];
    await actor.setFlag(MODULE_ID, "featureFocus", next);

    // Sync focusing status — the system only manages it for spells
    await this._syncFocusingStatus(actor);
    this._syncFocusFX(actor);

    log("FocusManager", `${actor.name} acquired feature focus: ${label} (${this.getTotalFocusCount(actor)}/${actor.system.focus?.max ?? 1})`);
    return true;
  },

  /**
   * Release feature focus for an actor.
   * @param {Actor} actor
   * @param {string} featureKey
   */
  async releaseFeatureFocus(actor, featureKey) {
    const current = this._getFeatureFocus(actor);
    const next = current.filter(f => f.key !== featureKey);

    if (next.length === current.length) return; // wasn't focused

    if (next.length === 0) {
      await actor.unsetFlag(MODULE_ID, "featureFocus");
    } else {
      await actor.setFlag(MODULE_ID, "featureFocus", next);
    }

    // Sync focusing status
    await this._syncFocusingStatus(actor);
    this._syncFocusFX(actor);

    log("FocusManager", `${actor.name} released feature focus: ${featureKey}`);
  },

  /**
   * Check if an actor has feature focus on a specific key.
   * @param {Actor} actor
   * @param {string} featureKey
   * @returns {boolean}
   */
  hasFeatureFocus(actor, featureKey) {
    return this._getFeatureFocus(actor).some(f => f.key === featureKey);
  },

  /**
   * Total focus count (spells + features).
   * @param {Actor} actor
   * @returns {number}
   */
  getTotalFocusCount(actor) {
    const spellCount = (actor.system.focus?.spellIds || []).length;
    const featureCount = this._getFeatureFocus(actor).length;
    return spellCount + featureCount;
  },

  /**
   * Remaining focus slots.
   * @param {Actor} actor
   * @returns {number}
   */
  getRemainingFocusSlots(actor) {
    const max = actor.system.focus?.max ?? 1;
    return Math.max(0, max - this.getTotalFocusCount(actor));
  },

  /**
   * Get full focus status for debugging/API.
   * @param {Actor} actor
   * @returns {object}
   */
  getFocusStatus(actor) {
    return {
      spells: actor.system.focus?.spellIds || [],
      features: this._getFeatureFocus(actor),
      total: this.getTotalFocusCount(actor),
      max: actor.system.focus?.max ?? 1,
      remaining: this.getRemainingFocusSlots(actor)
    };
  },

  /* -------------------------------------------- */
  /*  Hooks                                       */
  /* -------------------------------------------- */

  registerHooks() {
    // Sync FX + spell effects when spell focus changes (system updates spellIds)
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type !== "character") return;
      if (changes.system?.focus?.spellIds !== undefined) {
        // Defer to let the system's own status toggle complete first
        setTimeout(() => {
          // Only sync focusing status if features hold focus — the system
          // already manages the "focusing" status for spell-only focus.
          // Calling it unconditionally races with the system's toggleStatusEffect.
          if (this._getFeatureFocus(actor).length > 0) {
            this._syncFocusingStatus(actor);
          }
          this._syncFocusFX(actor);
          this._syncLightFocus(actor);
        }, 0);
      }
    });

    // Restore FX + Light on scene load
    Hooks.on("canvasReady", () => {
      this._restoreAllFX();
      // Re-sync Light focus for all characters on the scene
      for (const token of canvas.tokens?.placeables || []) {
        if (token.actor?.type === "character") {
          this._syncLightFocus(token.actor);
        }
      }
    });

    // Play FX when a token is placed for a focusing actor
    Hooks.on("createToken", (tokenDoc) => {
      const actor = tokenDoc.actor;
      if (!actor || actor.type !== "character") return;
      if (this.getTotalFocusCount(actor) > 0) {
        // Small delay to let the token render
        setTimeout(() => this._syncFocusFX(actor), 100);
      }
    });

    // Inject feature focus UI into character sheet
    Hooks.on("renderApplicationV2", (app, html) => {
      if (app.document?.type === "character") {
        this._injectFocusUI(app);
      }
    });

    // Status effect FX — play/stop animations when statuses are toggled
    Hooks.on("applyActiveEffect", (actor, effect) => {
      this._onStatusApplied(actor, effect);
    });
    Hooks.on("removeActiveEffect", (actor, effect) => {
      this._onStatusRemoved(actor, effect);
    });
    // Fallback: also watch createActiveEffect / deleteActiveEffect for status effects
    Hooks.on("createActiveEffect", (effect) => {
      const actor = effect.parent;
      if (actor?.documentName === "Actor") {
        for (const statusId of (effect.statuses ?? [])) {
          this._onStatusToggled(actor, statusId, true);
        }
      }
    });
    Hooks.on("deleteActiveEffect", (effect) => {
      const actor = effect.parent;
      if (actor?.documentName === "Actor") {
        for (const statusId of (effect.statuses ?? [])) {
          this._onStatusToggled(actor, statusId, false);
        }
      }
    });

    // Monster attack FX — match NPC action names to monster FX config
    Hooks.on("createChatMessage", (message) => {
      this._onChatMessage(message);
    });

    log("FocusManager", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  FX Lifecycle                                */
  /* -------------------------------------------- */

  /**
   * Sync FX state for an actor — play generic focus FX if focusing, stop if not.
   */
  _syncFocusFX(actor) {
    const isFocusing = this.getTotalFocusCount(actor) > 0;

    if (isFocusing) {
      this.playFeatureFX(actor, "_focus");
    } else {
      this.stopFeatureFX(actor.id, "_focus");
    }
  },

  /* -------------------------------------------- */
  /*  Generic Feature FX                          */
  /* -------------------------------------------- */

  /**
   * Play FX for a feature using the config.
   * Reads config for the feature key, plays on caster, target, or both.
   * @param {Actor} actor - The caster/source actor
   * @param {string} featureKey - Config key (e.g. "hunter_huntersMark", "_focus")
   * @param {Actor} [targetActor] - Target actor (for target-applied FX)
   */
  playFeatureFX(actor, featureKey, targetActor = null) {
    if (typeof Sequencer === "undefined") return;

    const fxConfig = getFeatureFxConfig(featureKey);
    if (!fxConfig?.enabled || !fxConfig.file) return;

    const applyTo = fxConfig.target || "caster";

    if ((applyTo === "caster" || applyTo === "both") && actor) {
      const token = this._getActiveToken(actor);
      if (token) this._playFX(token, actor.id, featureKey, fxConfig);
    }

    if ((applyTo === "target" || applyTo === "both") && targetActor) {
      const token = this._getActiveToken(targetActor);
      if (token) this._playFX(token, targetActor.id, featureKey, fxConfig);
    }
  },

  /**
   * Stop FX for a feature on an actor.
   * @param {string} actorId
   * @param {string} featureKey
   */
  stopFeatureFX(actorId, featureKey) {
    if (typeof Sequencer === "undefined") return;

    const effectName = `vce-fx-${featureKey}-${actorId}`;
    try {
      Sequencer.EffectManager.endEffects({ name: effectName });
    } catch (e) {
      console.warn(`${MODULE_ID} | FocusManager FX stop error:`, e);
    }
  },

  /**
   * Internal: play a single FX effect on a token using config.
   */
  _playFX(token, actorId, featureKey, fxConfig) {
    const effectName = `vce-fx-${featureKey}-${actorId}`;

    // Check if already playing with same config — skip if identical
    try {
      const existing = Sequencer.EffectManager.getEffects({ name: effectName });
      if (existing?.length > 0) return;
    } catch { /* older Sequencer */ }

    try {
      const seq = new Sequence()
        .effect()
        .file(fxConfig.file)
        .attachTo(token)
        .scale(fxConfig.scale ?? 1)
        .fadeIn(fxConfig.fadeIn || 800)
        .fadeOut(fxConfig.fadeOut || 800)
        .opacity(fxConfig.opacity || 0.7)
        .name(effectName);

      if (fxConfig.persist) {
        seq.persist();
      } else {
        seq.duration(fxConfig.duration || 2000);
      }
      if (fxConfig.belowToken) seq.belowTokens();

      // Add sound to the sequence if configured
      if (fxConfig.sound) {
        seq.sound()
          .file(fxConfig.sound)
          .volume(fxConfig.soundVolume ?? 0.6)
          .fadeInAudio(fxConfig.fadeIn || 800)
          .fadeOutAudio(fxConfig.fadeOut || 800);
      }

      seq.play();

      log("FocusManager", `Playing ${featureKey} FX on ${token.name ?? actorId}`);
    } catch (e) {
      console.warn(`${MODULE_ID} | FocusManager FX error:`, e);
    }
  },

  /**
   * Stop focus FX for an actor (legacy compat — wraps stopFeatureFX).
   */
  _stopFocusFX(actorId) {
    this.stopFeatureFX(actorId, "_focus");
  },

  _playFocusFX(token, actorId) {
    // Legacy compat — now uses config-driven playFeatureFX
    const actor = game.actors.get(actorId);
    if (actor) this.playFeatureFX(actor, "_focus");
  },

  /**
   * Restore FX for all tokens on the current scene whose actors are focusing.
   */
  _restoreAllFX() {
    if (!canvas.tokens?.placeables) return;
    for (const token of canvas.tokens.placeables) {
      const actor = token.actor;
      if (!actor) continue;

      // Restore focus FX
      if (actor.type === "character" && this.getTotalFocusCount(actor) > 0) {
        this._playFocusFX(token, actor.id);
      }

      // Restore status effect FX
      if (actor.statuses) {
        for (const statusId of actor.statuses) {
          const featureKey = `status_${statusId}`;
          const fxConfig = getFeatureFxConfig(featureKey);
          if (fxConfig?.enabled && fxConfig?.file) {
            this._playFX(token, actor.id, featureKey, fxConfig);
          }
        }
      }
    }
  },

  /* -------------------------------------------- */
  /*  Status Effect Sync                          */
  /* -------------------------------------------- */

  /**
   * Ensure the "focusing" status matches combined focus state.
   * The system only manages it for spells — if features hold focus
   * but all spells are unfocused, the system would remove the status.
   * We re-apply it here.
   */
  async _syncFocusingStatus(actor) {
    const totalCount = this.getTotalFocusCount(actor);
    // Check embedded effects directly — the derived `statuses` Set may lag behind
    const hasFocusingEffect = actor.effects.some(e => e.statuses?.has("focusing"));

    // Only ADD focusing status if features hold focus but system removed it.
    // Don't REMOVE it — let the system handle removal to avoid race conditions
    // where both our code and the system try to delete the same AE.
    if (totalCount > 0 && !hasFocusingEffect) {
      try {
        await actor.toggleStatusEffect("focusing", { active: true });
      } catch { /* already being toggled */ }
    }
  },

  /* -------------------------------------------- */
  /*  Light Spell Focus — Token Light Emission    */
  /* -------------------------------------------- */

  /**
   * Sync token light emission when Light spell is focused/unfocused.
   * Light sheds bright light out to 30' (Near) while focused.
   */
  async _syncLightFocus(actor) {
    const focusedIds = actor.system?.focus?.spellIds || [];
    const isFocusingLight = focusedIds.some(id => {
      const spell = actor.items.get(id);
      return spell?.name?.toLowerCase() === "light";
    });

    const token = actor.getActiveTokens()?.[0]?.document;
    if (!token) return;

    const FLAG_LIGHT = "originalLight";

    if (isFocusingLight) {
      // Save original light settings (only if not already saved)
      const saved = actor.getFlag(MODULE_ID, FLAG_LIGHT);
      if (!saved) {
        await actor.setFlag(MODULE_ID, FLAG_LIGHT, {
          bright: token.light.bright,
          dim: token.light.dim,
          color: token.light.color,
          alpha: token.light.alpha,
          animationType: token.light.animation?.type,
          animationSpeed: token.light.animation?.speed,
          animationIntensity: token.light.animation?.intensity
        });
      }
      // Apply Light spell emission: 30' bright, warm golden glow
      await token.update({
        "light.bright": 30,
        "light.dim": 0,
        "light.color": "#ffffaa",
        "light.alpha": 0.4,
        "light.animation.type": "torch",
        "light.animation.speed": 3,
        "light.animation.intensity": 3
      });
      log("Light", `${actor.name}: Light focused — token emitting 30' bright light`);
    } else {
      // Restore original light settings
      const saved = actor.getFlag(MODULE_ID, FLAG_LIGHT);
      if (saved) {
        await token.update({
          "light.bright": saved.bright ?? 0,
          "light.dim": saved.dim ?? 0,
          "light.color": saved.color ?? null,
          "light.alpha": saved.alpha ?? 0.5,
          "light.animation.type": saved.animationType ?? null,
          "light.animation.speed": saved.animationSpeed ?? 5,
          "light.animation.intensity": saved.animationIntensity ?? 5
        });
        await actor.unsetFlag(MODULE_ID, FLAG_LIGHT);
        log("Light", `${actor.name}: Light unfocused — token light restored`);
      }
    }
  },

  /* -------------------------------------------- */
  /*  Status Effect FX                            */
  /* -------------------------------------------- */

  /**
   * Called when a status effect is applied (via applyActiveEffect hook).
   */
  _onStatusApplied(actor, effect) {
    if (!effect.statuses) return;
    for (const statusId of effect.statuses) {
      this._onStatusToggled(actor, statusId, true);
    }
  },

  /**
   * Called when a status effect is removed (via removeActiveEffect hook).
   */
  _onStatusRemoved(actor, effect) {
    if (!effect.statuses) return;
    for (const statusId of effect.statuses) {
      this._onStatusToggled(actor, statusId, false);
    }
  },

  /**
   * Handle status effect toggled on/off — play/stop FX if configured.
   */
  _onStatusToggled(actor, statusId, active) {
    const featureKey = `status_${statusId}`;
    if (active) {
      this.playFeatureFX(actor, featureKey);
    } else {
      this.stopFeatureFX(actor.id, featureKey);
    }
  },

  /* -------------------------------------------- */
  /*  Monster Attack FX                           */
  /* -------------------------------------------- */

  /**
   * Handle chat messages — detect NPC action cards and play matching monster FX.
   * NPC action cards are created by VagabondChatCard.npcAction().
   * We match the action name (Bite, Claw, etc.) to our monster_* config keys.
   */
  _onChatMessage(message) {
    if (typeof Sequencer === "undefined") return;

    // Only process messages from NPC actors
    const speaker = message.speaker;
    if (!speaker?.actor) return;
    const actor = game.actors.get(speaker.actor);
    if (!actor || actor.type !== "npc") return;

    // Extract action name from the chat card HTML
    const content = message.content || "";
    // The system's NPC action card has <h3 class="header-title">Bite</h3>
    const titleMatch = content.match(/<h3[^>]*class="header-title"[^>]*>([^<]+)<\/h3>/i);
    if (!titleMatch) return;

    const actionName = titleMatch[1].trim().toLowerCase();

    // Match to a monster FX config key
    const featureKey = `monster_${actionName.replace(/\s+/g, "")}`;
    const fxConfig = getFeatureFxConfig(featureKey);
    if (!fxConfig?.enabled || !fxConfig.file) return;

    // Determine target tokens
    const applyTo = fxConfig.target || "target";
    const casterToken = this._getActiveToken(actor);

    if (applyTo === "caster" || applyTo === "both") {
      if (casterToken) this._playFX(casterToken, actor.id, featureKey, fxConfig);
    }

    if (applyTo === "target" || applyTo === "both") {
      // Get targeted tokens from the message flags or current targets
      const targets = Array.from(game.user.targets);
      for (const targetToken of targets) {
        if (targetToken.actor) {
          this._playFX(targetToken, targetToken.actor.id, featureKey, fxConfig);
        }
      }
    }

    log("FocusManager", `Monster FX: ${actionName} → ${featureKey}`);
  },

  /* -------------------------------------------- */
  /*  Sheet UI Injection                          */
  /* -------------------------------------------- */

  /**
   * Inject feature focus display into the character sheet's sliding panel.
   * Shows focused features below the spell list with release buttons.
   */
  _injectFocusUI(sheet) {
    const actor = sheet.document;
    const featureFocus = this._getFeatureFocus(actor);
    const el = sheet.element;
    if (!el) return;

    // Remove stale injection
    el.querySelectorAll(".vce-feature-focus-section").forEach(e => e.remove());

    // Only inject if there are focused features
    if (featureFocus.length === 0) return;

    // Find the favorited-spells-list in the sliding panel
    const spellList = el.querySelector(".favorited-spells-list");
    if (!spellList) return;

    // Build the feature focus section
    const section = document.createElement("div");
    section.classList.add("vce-feature-focus-section");

    const header = document.createElement("div");
    header.classList.add("vce-feature-focus-header");
    header.innerHTML = `<i class="fas fa-crosshairs"></i> <span>Feature Focus</span>`;
    section.appendChild(header);

    for (const entry of featureFocus) {
      const row = document.createElement("div");
      row.classList.add("vce-feature-focus-row");
      row.innerHTML = `
        <img src="${entry.icon}" alt="${entry.label}" class="vce-feature-focus-icon" />
        <span class="vce-feature-focus-label">${entry.label}</span>
        <button class="vce-feature-focus-release" data-feature-key="${entry.key}" data-actor-id="${actor.id}" title="Release Focus">
          <i class="fas fa-times"></i>
        </button>
      `;
      section.appendChild(row);
    }

    // Insert after the spell list
    spellList.after(section);

    // Bind release buttons
    section.querySelectorAll(".vce-feature-focus-release").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const key = ev.currentTarget.dataset.featureKey;
        const actorId = ev.currentTarget.dataset.actorId;
        const a = game.actors.get(actorId);
        if (a) await this.releaseFeatureFocus(a, key);
      });
    });

    // Update focus pips to reflect combined count
    this._updateFocusPips(el, actor);
  },

  /**
   * Update the focus pips in the sliding panel to reflect combined focus count.
   */
  _updateFocusPips(el, actor) {
    const pipsContainer = el.querySelector(".focus-pips");
    if (!pipsContainer) return;

    const totalCount = this.getTotalFocusCount(actor);
    const max = actor.system.focus?.max ?? 1;

    // Rebuild pips to show combined count
    pipsContainer.innerHTML = "";
    for (let i = 0; i < max; i++) {
      const pip = document.createElement("i");
      pip.classList.add("fas", "fa-star-christmas", "focus-pip");
      pip.classList.add(i < totalCount ? "filled" : "empty");
      pipsContainer.appendChild(pip);
    }
  },

  /* -------------------------------------------- */
  /*  Internal Helpers                            */
  /* -------------------------------------------- */

  /**
   * Get the feature focus array for an actor.
   * @returns {Array<{key: string, label: string, icon: string}>}
   */
  _getFeatureFocus(actor) {
    return actor.getFlag(MODULE_ID, "featureFocus") || [];
  },

  /**
   * Find the active token on the current scene for an actor.
   * @returns {Token|null}
   */
  _getActiveToken(actor) {
    if (!canvas.tokens?.placeables) return null;
    return canvas.tokens.placeables.find(t => t.actor?.id === actor.id) ?? null;
  }
};
