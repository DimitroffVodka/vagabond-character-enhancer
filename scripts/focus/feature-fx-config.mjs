/**
 * Feature FX Config
 * ApplicationV2 dialog for configuring per-class-feature Sequencer animations.
 * Registered as a settings menu button (GM-only).
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Default FX Configurations                   */
/* -------------------------------------------- */

/**
 * Default FX configs for features that benefit from visual effects.
 * Users can override via the config UI; these serve as starting values.
 */
export const DEFAULT_FEATURE_FX = {
  // --- Focus (generic) ---
  _focus: {
    label: "Focus (Generic)",
    class: "_global",
    enabled: true,
    target: "caster",
    file: "modules/JB2A_DnD5e/Library/1st_Level/Bless/Bless_01_Regular_Yellow_Loop_400x400.webm",
    scale: 1,
    opacity: 0.7,
    persist: true,
    fadeIn: 800,
    fadeOut: 800,
    belowToken: true,
    sound: "",
    soundVolume: 0.6
  },

  // --- Hunter ---
  hunter_huntersMark: {
    label: "Hunter's Mark",
    class: "hunter",
    enabled: true,
    target: "target",
    file: "modules/JB2A_DnD5e/Library/Generic/Marker/MarkerChainStandard01_01_Regular_Red_Loop_400x400.webm",
    scale: 1,
    opacity: 0.8,
    persist: true,
    fadeIn: 500,
    fadeOut: 500,
    belowToken: false,
    sound: "",
    soundVolume: 0.6
  },

  // --- Bard ---
  bard_virtuoso: {
    label: "Virtuoso",
    class: "bard",
    enabled: false,
    target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Music_Notation/TrebleClef_01_Regular_Blue_200x200.webm",
    scale: 1,
    opacity: 0.6,
    persist: true,
    fadeIn: 800,
    fadeOut: 800,
    belowToken: true,
    sound: "",
    soundVolume: 0.6
  },

  // --- Dancer ---
  dancer_stepUp: {
    label: "Step Up",
    class: "dancer",
    enabled: false,
    target: "caster",
    file: "modules/JB2A_DnD5e/Library/1st_Level/Bless/Bless_01_Regular_Yellow_Loop_400x400.webm",
    scale: 1,
    opacity: 0.5,
    persist: false,
    fadeIn: 400,
    fadeOut: 400,
    belowToken: true,
    sound: "",
    soundVolume: 0.6
  },

  // --- Druid ---
  druid_feralShift: {
    label: "Beast Form",
    class: "druid",
    enabled: false,
    target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Nature/PlantGrowthRoundLoop03_01_Regular_GreenYellow_500x500.webm",
    scale: 1.2,
    opacity: 0.6,
    persist: false,
    fadeIn: 500,
    fadeOut: 500,
    belowToken: true,
    sound: "",
    soundVolume: 0.6
  },

  // --- Revelator ---
  revelator_paragonsAura: {
    label: "Paragon's Aura",
    class: "revelator",
    enabled: true,
    target: "caster",
    file: "modules/JB2A_DnD5e/Library/1st_Level/Bless/Bless_01_Regular_Yellow_Loop_400x400.webm",
    scale: 1.2,
    opacity: 0.5,
    persist: true,
    fadeIn: 800,
    fadeOut: 800,
    belowToken: true,
    sound: "",
    soundVolume: 0.6
  },

  // ──────────────────────────────────────────────
  // Monster Attacks
  // ──────────────────────────────────────────────

  monster_bite: {
    label: "Bite", class: "_monster", enabled: false, target: "target",
    file: "modules/JB2A_DnD5e/Library/Generic/Creature/Bite_01_Regular_Red_400x400.webm",
    scale: 1, opacity: 0.8, persist: false, fadeIn: 100, fadeOut: 200, belowToken: false,
    sound: "", soundVolume: 0.6
  },
  monster_claw: {
    label: "Claw", class: "_monster", enabled: false, target: "target",
    file: "modules/JB2A_DnD5e/Library/Generic/Creature/Claw/CreatureAttackClaw_001_001_Red_800x600.webm",
    scale: 1.2, opacity: 0.8, persist: false, fadeIn: 100, fadeOut: 200, belowToken: false,
    sound: "", soundVolume: 0.6
  },
  monster_claws: {
    label: "Claws", class: "_monster", enabled: false, target: "target",
    file: "modules/JB2A_DnD5e/Library/Generic/Creature/Claws_01_Regular_Red_400x400.webm",
    scale: 1, opacity: 0.8, persist: false, fadeIn: 100, fadeOut: 200, belowToken: false,
    sound: "", soundVolume: 0.6
  },
  monster_beak: {
    label: "Beak", class: "_monster", enabled: false, target: "target",
    file: "modules/JB2A_DnD5e/Library/Generic/Creature/Bite_01_Regular_Red_400x400.webm",
    scale: 1, opacity: 0.8, persist: false, fadeIn: 100, fadeOut: 200, belowToken: false,
    sound: "", soundVolume: 0.6
  },
  monster_slam: {
    label: "Slam", class: "_monster", enabled: false, target: "target",
    file: "modules/JB2A_DnD5e/Library/Generic/Impact/GroundCrackImpact_01_Regular_Orange_600x600.webm",
    scale: 1.2, opacity: 0.8, persist: false, fadeIn: 100, fadeOut: 200, belowToken: false,
    sound: "", soundVolume: 0.6
  },
  monster_tentacle: {
    label: "Tentacle", class: "_monster", enabled: false, target: "target",
    file: "modules/JB2A_DnD5e/Library/Generic/Creature/Claws_01_Regular_Red_400x400.webm",
    scale: 1, opacity: 0.8, persist: false, fadeIn: 100, fadeOut: 200, belowToken: false,
    sound: "", soundVolume: 0.6
  },
  monster_pseudopod: {
    label: "Pseudopod", class: "_monster", enabled: false, target: "target",
    file: "modules/JB2A_DnD5e/Library/Generic/Impact/Impact013/Impact013_001_OrangeYellow_400x400.webm",
    scale: 1, opacity: 0.8, persist: false, fadeIn: 100, fadeOut: 200, belowToken: false,
    sound: "", soundVolume: 0.6
  },

  // ──────────────────────────────────────────────
  // Status Effects
  // ──────────────────────────────────────────────

  status_berserk: {
    label: "Berserk", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Fire/Flame/Flames04_01_Regular_Orange_Loop_400x600.webm",
    scale: 1.2, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_burning: {
    label: "Burning", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Fire/Flame/Flames04_01_Regular_Orange_Loop_400x600.webm",
    scale: 1, opacity: 0.6, persist: true, fadeIn: 400, fadeOut: 400, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_charmed: {
    label: "Charmed", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Magic_Signs/Runes/EnchantmentRuneLoop_01_Regular_Pink_400x400.webm",
    scale: 1, opacity: 0.5, persist: true, fadeIn: 800, fadeOut: 800, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_confused: {
    label: "Confused", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Magic_Signs/Runes/IllusionRuneLoop_01_Regular_Purple_400x400.webm",
    scale: 1, opacity: 0.5, persist: true, fadeIn: 800, fadeOut: 800, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_dazed: {
    label: "Dazed", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Marker/MarkerBubbleLoop_02_01_Regular_Blue_400x400.webm",
    scale: 1, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_frightened: {
    label: "Frightened", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Magic_Signs/Runes/NecromancyRuneLoop_01_Regular_Green_400x400.webm",
    scale: 1, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_blinded: {
    label: "Blinded", class: "_status", enabled: false, target: "caster",
    file: "", size: 200, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_invisible: {
    label: "Invisible", class: "_status", enabled: false, target: "caster",
    file: "", size: 200, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_incapacitated: {
    label: "Incapacitated", class: "_status", enabled: false, target: "caster",
    file: "", size: 200, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_paralyzed: {
    label: "Paralyzed", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Energy/EnergyWall01_01_Regular_Orange_05x05ft_Loop_400x400.webm",
    scale: 1, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_prone: {
    label: "Prone", class: "_status", enabled: false, target: "caster",
    file: "", size: 200, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_restrained: {
    label: "Restrained", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Marker/MarkerChainStandard01_02_Regular_Red_Loop_400x400.webm",
    scale: 1, opacity: 0.6, persist: true, fadeIn: 500, fadeOut: 500, belowToken: false,
    sound: "", soundVolume: 0.6
  },
  status_sickened: {
    label: "Sickened", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/Generic/Liquid/Bubble/BubbleLoop001_001_Blue_2x2_400x400.webm",
    scale: 1, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_unconscious: {
    label: "Unconscious", class: "_status", enabled: false, target: "caster",
    file: "", size: 200, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_vulnerable: {
    label: "Vulnerable", class: "_status", enabled: false, target: "caster",
    file: "", size: 200, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_suffocating: {
    label: "Suffocating", class: "_status", enabled: false, target: "caster",
    file: "", size: 200, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_focusing: {
    label: "Focusing", class: "_status", enabled: false, target: "caster",
    file: "modules/JB2A_DnD5e/Library/1st_Level/Bless/Bless_01_Regular_Yellow_Loop_400x400.webm",
    scale: 1, opacity: 0.5, persist: true, fadeIn: 800, fadeOut: 800, belowToken: true,
    sound: "", soundVolume: 0.6
  },
  status_dead: {
    label: "Dead", class: "_status", enabled: false, target: "caster",
    file: "", size: 200, opacity: 0.5, persist: true, fadeIn: 600, fadeOut: 600, belowToken: true,
    sound: "", soundVolume: 0.6
  }
};

/* -------------------------------------------- */
/*  Config Helpers                              */
/* -------------------------------------------- */

/**
 * Get the merged FX config (defaults + stored overrides).
 * @param {string} [featureKey] - If provided, return config for that feature only.
 * @returns {object}
 */
export function getFeatureFxConfig(featureKey = null) {
  const stored = game.settings.get(MODULE_ID, "featureFxConfig") ?? {};
  const expanded = foundry.utils.expandObject(stored);
  const merged = foundry.utils.mergeObject(
    foundry.utils.deepClone(DEFAULT_FEATURE_FX),
    expanded,
    { inplace: false }
  );
  if (featureKey) return merged[featureKey] ?? null;
  return merged;
}

/**
 * Check if Sequencer + JB2A are available.
 */
function isSequencerAvailable() {
  return typeof Sequencer !== "undefined" && typeof Sequence !== "undefined";
}

function isJB2AAvailable() {
  return !!(game.modules.get("JB2A_DnD5e")?.active || game.modules.get("jb2a_patreon")?.active);
}

/* -------------------------------------------- */
/*  ApplicationV2 Config Dialog                 */
/* -------------------------------------------- */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FeatureFxConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "vce-feature-fx-config",
    tag: "form",
    window: {
      title: "VCE: Feature FX Config",
      icon: "fas fa-wand-magic-sparkles",
      resizable: true
    },
    position: { width: 720, height: 560 },
    classes: ["vce-feature-fx-config"],
    actions: {
      switchClass:  FeatureFxConfig.#onSwitchClass,
      browseVideo:  FeatureFxConfig.#onBrowseVideo,
      browseAudio:  FeatureFxConfig.#onBrowseAudio,
      previewFx:    FeatureFxConfig.#onPreviewFx,
      previewSound: FeatureFxConfig.#onPreviewSound,
      saveAndClose: FeatureFxConfig.#onSaveAndClose,
      close:        function () { this.close(); }
    },
    form: {
      handler: FeatureFxConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/feature-fx-config.hbs`,
      scrollable: [".vce-fx-panel-scroll"]
    }
  };

  _onRender(context, options) {
    super._onRender(context, options);
    // Live-update slider value labels
    this.element.querySelectorAll(".vce-fx-slider").forEach(slider => {
      slider.addEventListener("input", (ev) => {
        const label = ev.target.closest(".vce-fx-field-scale")?.querySelector(".vce-fx-scale-value");
        if (label) label.textContent = ev.target.value;
      });
    });
  }

  /** Currently active class tab */
  #activeClass = "_global";

  async _prepareContext(options) {
    const config = getFeatureFxConfig();

    // Group features by class
    const classGroups = new Map();
    for (const [key, fx] of Object.entries(config)) {
      const cls = fx.class || "_global";
      if (!classGroups.has(cls)) {
        classGroups.set(cls, { key: cls, label: this.#classLabel(cls), features: [], active: cls === this.#activeClass });
      }
      classGroups.get(cls).features.push({ key, ...fx });
    }

    // Sort classes alphabetically, but _global first
    const classes = Array.from(classGroups.values()).sort((a, b) => {
      if (a.key === "_global") return -1;
      if (b.key === "_global") return 1;
      return a.label.localeCompare(b.label);
    });

    return {
      classes,
      sequencerAvailable: isSequencerAvailable(),
      jb2aAvailable: isJB2AAvailable()
    };
  }

  #classLabel(cls) {
    if (cls === "_global") return "Global";
    if (cls === "_status") return "Status Effects";
    if (cls === "_monster") return "Monster Attacks";
    return cls.charAt(0).toUpperCase() + cls.slice(1);
  }

  /* ---- Actions ---- */

  static #onSwitchClass(event, target) {
    this.#activeClass = target.dataset.classKey;
    this.render();
  }

  static #onBrowseVideo(event, target) {
    const fieldName = target.dataset.field;
    const input = this.element.querySelector(`input[name="${fieldName}"]`);
    const FP = foundry.applications.apps?.FilePicker?.implementation
            ?? foundry.applications.apps?.FilePicker
            ?? FilePicker;
    new FP({
      type: "video",
      current: input?.value || "",
      callback: path => { if (input) input.value = path; }
    }).browse();
  }

  static #onBrowseAudio(event, target) {
    const fieldName = target.dataset.field;
    const input = this.element.querySelector(`input[name="${fieldName}"]`);
    const FP = foundry.applications.apps?.FilePicker?.implementation
            ?? foundry.applications.apps?.FilePicker
            ?? FilePicker;
    new FP({
      type: "audio",
      current: input?.value || "",
      callback: path => { if (input) input.value = path; }
    }).browse();
  }

  static #onPreviewFx(event, target) {
    if (!isSequencerAvailable()) {
      ui.notifications.warn("Sequencer module is not active.");
      return;
    }
    const token = canvas.tokens?.controlled?.[0];
    if (!token) {
      ui.notifications.warn("Select a token first to preview the animation.");
      return;
    }

    const featureKey = target.dataset.featureKey;
    const file = this.element.querySelector(`input[name="${featureKey}.file"]`)?.value;
    const scale = parseFloat(this.element.querySelector(`input[name="${featureKey}.scale"]`)?.value) || 1;
    const opacity = parseFloat(this.element.querySelector(`input[name="${featureKey}.opacity"]`)?.value) || 0.7;

    if (!file) {
      ui.notifications.warn("No animation file set.");
      return;
    }

    try {
      new Sequence()
        .effect()
        .file(file)
        .attachTo(token)
        .scale(scale)
        .opacity(opacity)
        .duration(3000)
        .fadeIn(500)
        .fadeOut(500)
        .belowTokens()
        .play();
    } catch (err) {
      ui.notifications.error(`Preview failed: ${err.message}`);
    }
  }

  static #onPreviewSound(event, target) {
    const featureKey = target.dataset.featureKey;
    const file = this.element.querySelector(`input[name="${featureKey}.sound"]`)?.value;
    const volume = parseFloat(this.element.querySelector(`input[name="${featureKey}.soundVolume"]`)?.value) ?? 0.6;

    if (!file) {
      ui.notifications.warn("No sound file set.");
      return;
    }

    try {
      new Sequence()
        .sound()
        .file(file)
        .volume(volume)
        .play();
    } catch (err) {
      ui.notifications.error(`Sound preview failed: ${err.message}`);
    }
  }

  static async #onSubmit(event, form, formData) {
    await FeatureFxConfig.#performSave.call(this, formData);
    ui.notifications.info("Feature FX config saved.");
    this.render();
  }

  static async #onSaveAndClose() {
    await FeatureFxConfig.#performSave.call(this);
    ui.notifications.info("Feature FX config saved.");
    this.close({ force: true });
  }

  static async #performSave(formData) {
    const raw = formData
      ? formData.object
      : new foundry.applications.ux.FormDataExtended(this.element).object;
    const data = foundry.utils.expandObject(raw);

    // Ensure boolean fields are properly typed
    for (const [key, fx] of Object.entries(data)) {
      if (typeof fx !== "object") continue;
      if ("enabled" in fx) fx.enabled = !!fx.enabled;
      if ("persist" in fx) fx.persist = !!fx.persist;
      if ("belowToken" in fx) fx.belowToken = !!fx.belowToken;
      if ("scale" in fx) fx.scale = parseFloat(fx.scale) || 1;
      if ("opacity" in fx) fx.opacity = parseFloat(fx.opacity) || 0.7;
      if ("fadeIn" in fx) fx.fadeIn = parseInt(fx.fadeIn) || 800;
      if ("fadeOut" in fx) fx.fadeOut = parseInt(fx.fadeOut) || 800;
      if ("soundVolume" in fx) fx.soundVolume = parseFloat(fx.soundVolume) || 0.6;
    }

    await game.settings.set(MODULE_ID, "featureFxConfig", data);

    // Re-apply all active FX with updated config
    if (typeof Sequencer !== "undefined" && canvas.tokens?.placeables) {
      // Stop all VCE effects, then let the restore logic replay with new config
      try {
        Sequencer.EffectManager.endEffects({ name: "vce-fx-*" });
      } catch { /* wildcard may not be supported */ }
      // Fallback: stop each known effect explicitly
      for (const token of canvas.tokens.placeables) {
        if (!token.actor) continue;
        for (const key of Object.keys(data)) {
          try {
            Sequencer.EffectManager.endEffects({ name: `vce-fx-${key}-${token.actor.id}` });
          } catch { /* ignore */ }
        }
      }
      // Trigger restore
      const { FocusManager } = await import("./focus-manager.mjs");
      FocusManager._restoreAllFX();
    }
  }
}
