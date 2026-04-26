/**
 * TalentCast — Psychic Talent cast dialog + system chat card integration.
 *
 * Dialog UX mirrors vagabond-crawler's CrawlerSpellDialog:
 *   - Header: img + name + effect subtitle
 *   - Damage Dice: − / Nd6 / + pill buttons + free/+N badge
 *   - Include Effect: On/Off toggle button + badge
 *   - Delivery dropdown
 *   - Mana row: Cost / Cap (red if over)
 *   - Focus Spell toggle
 *   - Footer: Cast + Cancel
 *
 * Chat card: delegates to VagabondChatCard.spellCast via a duck-typed fake-spell
 * object, giving us the full polished system card for free (targets section,
 * big damage numbers, Apply Direct, styled save buttons).
 *
 * Cap math (per Psionics rule):
 *   cap = floor(psychicLevel / 2)
 *
 *   Mana cost breakdown:
 *   - 1d6 base damage:           FREE (if no effect)
 *   - effect alone:              FREE (if no damage)
 *   - damage + effect both:      +1 Mana surcharge
 *   - each extra die beyond 1d6: +1 Mana per die
 *   - delivery base cost:        see DELIVERY_COSTS
 *   - focus/duration:            FREE for Talents
 */

import { MODULE_ID, log } from "../utils.mjs";
import { TalentBuffs } from "./talent-buffs.mjs";

// Verified RAW delivery base costs (Vagabond Core Rulebook — 05 Magic, Delivery table)
const DELIVERY_COSTS = {
  touch:  0,
  remote: 0,
  self:   0,
  imbue:  0,
  cube:   1,
  aura:   2,
  cone:   2,
  glyph:  2,
  line:   2,
  sphere: 2,
};

// Per RAW: Remote scales +1 Mana per additional target. Touch is bounded
// to 1 close target. Self is always 1 (the caster). Area deliveries
// (cone/sphere/cube/aura/glyph/line) hit everything in the area at no
// extra per-target cost — the area itself is the unit of cost.
const EXTRA_TARGET_DELIVERIES = new Set(["remote"]);
const SINGLE_TARGET_DELIVERIES = new Set(["touch"]);
const SELF_DELIVERIES = new Set(["self"]);

/**
 * Capitalize first letter of a string.
 */
function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Compute total Mana cost for the current config.
 *
 * @param {object} config
 * @param {number}  config.damageDice    — TOTAL dice count (1 = free, 2 = +1 Mana, etc.)
 * @param {boolean} config.includeDamage — whether damage component is included
 * @param {boolean} config.includeEffect — whether effect component is included
 * @param {string}  config.delivery      — chosen delivery key
 * @param {object}  talent               — Talent item document
 * @param {number}  [targetCount=1]      — resolved target count (Remote scales)
 * @returns {number} total Mana cost
 */
function computeTotalMana(config, talent, targetCount = 1) {
  const hasDamage = !!talent.system.damage;
  const hasEffect = !!talent.system.effect;

  const dmgIncluded = config.includeDamage && hasDamage;
  const fxIncluded  = config.includeEffect  && hasEffect;

  // Extra dice beyond the free base 1d6
  const extraDice = dmgIncluded ? Math.max(0, (config.damageDice ?? 1) - 1) : 0;

  // Remote +1 per additional target beyond the first.
  const extraTargets = EXTRA_TARGET_DELIVERIES.has(config.delivery)
    ? Math.max(0, (targetCount ?? 1) - 1)
    : 0;

  let total = 0;
  total += extraDice;                                    // each extra die = +1 Mana
  total += (dmgIncluded && fxIncluded) ? 1 : 0;         // both components = +1 surcharge
  total += DELIVERY_COSTS[config.delivery] ?? 0;         // delivery base cost
  total += extraTargets;                                 // each extra target on Remote = +1 Mana
  // focus / duration always free for Talents
  return total;
}

/**
 * Resolve recipients for buff-AE distribution given the chosen delivery.
 *
 * - Self            → [caster]
 * - Touch           → first user.target (close ally)
 * - Remote          → all user.targets
 * - Area deliveries → all user.targets (system handles area templating)
 *
 * Returns null if the delivery has unmet target requirements (Touch with 0
 * or >1, Remote with 0). The cast button's pre-flight validation surfaces a
 * notification before this is called.
 *
 * @param {Actor}  caster
 * @param {string} delivery
 * @returns {Actor[] | null}
 */
function resolveTargetsForBuff(caster, delivery) {
  if (SELF_DELIVERIES.has(delivery)) return [caster];

  const tokenTargets = Array.from(game.user.targets);
  const actorTargets = tokenTargets.map(t => t.actor).filter(Boolean);

  if (SINGLE_TARGET_DELIVERIES.has(delivery)) {
    return actorTargets.length === 1 ? actorTargets : null;
  }
  if (EXTRA_TARGET_DELIVERIES.has(delivery)) {
    return actorTargets.length >= 1 ? actorTargets : null;
  }
  // Area deliveries — anyone caught in the template counts.
  return actorTargets;
}

// ── TalentCastDialog (ApplicationV2) ──────────────────────────────────────────

class TalentCastDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "vce-talent-cast-dialog",
    tag: "div",
    window: { resizable: false },
    position: { width: 360 },
    classes: ["vce-talent-cast-dialog"],
  };

  constructor(actor, talent, cap, resolve) {
    super();
    this.actor    = actor;
    this.talent   = talent;
    this.cap      = cap;
    this._resolve = resolve;
    this._settled = false;

    const hasDamage = !!talent.system.damage;
    const hasEffect = !!talent.system.effect;
    const isBuff    = !!talent.system.focusBuffAE;

    // Show every standard delivery in the dropdown — Talents can be cast
    // with any of them at the player's discretion. Imbue is excluded
    // because RAW Imbue specifically requires Mana to use (it's the
    // weapon-imbuement delivery, distinct from the Talent flow).
    // Unaffordable rows render as disabled options.
    const allowed = Object.keys(DELIVERY_COSTS).filter(d => d !== "imbue");
    const affordable0 = allowed.filter(d => (DELIVERY_COSTS[d] ?? 99) <= cap);
    const initialDelivery = affordable0[0] ?? allowed[0] ?? "touch";

    // State mirrors CrawlerSpellDialog.spellState pattern. Default focus
    // toggle on for:
    //   - Buff Talents (their whole point is the focused buff)
    //   - Focus-duration talents (RAW: focus needed to sustain)
    //   - Aura delivery (RAW Aura is overwhelmingly focus-based — without
    //     focus the player gets a one-shot that auto-deactivates immediately,
    //     which surprises everyone)
    this._state = {
      damageDice:     hasDamage ? 1 : 0,  // total dice count (1 = 1d6 free)
      includeDamage:  hasDamage,
      includeEffect:  !hasDamage && hasEffect,  // default on if effect-only
      deliveryType:   initialDelivery,
      focusAfterCast: isBuff
        || talent.system.duration === "focus"
        || initialDelivery === "aura",
    };

    this._allowedDeliveries = allowed;
    this._hasDamage = hasDamage;
    this._hasEffect = hasEffect;
    this._isBuff    = isBuff;

    // Re-render when the user's target set changes so the Mana row + target
    // count stay live. The hook stays bound for the dialog's lifetime; we
    // unhook in close().
    this._targetHookId = Hooks.on("targetToken", (user, _token, _state) => {
      if (user?.id !== game.user?.id) return;
      if (this._settled) return;
      this.render();
    });
  }

  get title() {
    return `Cast: ${this.talent.name}`;
  }

  _finish(value) {
    if (this._settled) return;
    this._settled = true;
    this._resolve(value);
  }

  async _prepareContext() {
    const s   = this._state;
    const cap = this.cap;

    // Live target count from the player's current selection.
    const targetCount = SELF_DELIVERIES.has(s.deliveryType)
      ? 1
      : Math.max(1, game.user?.targets?.size ?? 0);

    const totalMana    = computeTotalMana({
      damageDice:     s.damageDice,
      includeDamage:  s.includeDamage,
      includeEffect:  s.includeEffect,
      delivery:       s.deliveryType,
    }, this.talent, targetCount);
    const damageCost   = s.includeDamage ? Math.max(0, s.damageDice - 1) : 0;
    const fxCost       = (s.includeDamage && s.includeEffect) ? 1 : 0;
    const deliveryCost = DELIVERY_COSTS[s.deliveryType] ?? 0;
    const extraTargetCost = EXTRA_TARGET_DELIVERIES.has(s.deliveryType)
      ? Math.max(0, targetCount - 1)
      : 0;

    // Render every allowed delivery — disable the unaffordable ones rather
    // than hiding them so the player sees what's possible later. Affordability
    // here means the delivery's BASE cost alone fits the cap; multi-target
    // overhead is reflected in the live Mana row.
    const deliveryOptions = this._allowedDeliveries.map(d => {
      const label    = CONFIG.VAGABOND?.deliveryTypes?.[d] ?? capitalize(d);
      const baseCost = DELIVERY_COSTS[d] ?? 99;
      const costSuffix = baseCost === 0 ? "free" : `+${baseCost}`;
      return {
        value:       d,
        label:       `${label} (${costSuffix})`,
        selected:    d === s.deliveryType,
        unaffordable: baseCost > cap,
      };
    });

    // Target-state for the dialog footer — drives both the Mana row hint
    // and the Cast-button enable/disable.
    const targetState = this._evalTargetState(s.deliveryType, targetCount);

    const canCast = s.deliveryType !== null
      && totalMana <= cap
      && targetState.valid;

    return {
      s, cap, totalMana, damageCost, fxCost, deliveryCost, extraTargetCost,
      deliveryOptions, canCast, targetCount, targetState,
    };
  }

  /**
   * Validate the target-set for the chosen delivery. Used by both the live
   * Mana row hint and the pre-flight check on the Cast button.
   */
  _evalTargetState(delivery, targetCount) {
    if (SELF_DELIVERIES.has(delivery)) {
      return { valid: true, label: "Self", note: "" };
    }
    const userTargets = game.user?.targets?.size ?? 0;
    if (SINGLE_TARGET_DELIVERIES.has(delivery)) {
      if (userTargets === 1) return { valid: true,  label: `1 target`,  note: "" };
      if (userTargets === 0) return { valid: false, label: "no target", note: "Touch needs 1 target" };
      return { valid: false, label: `${userTargets} targets`, note: "Touch allows 1 target" };
    }
    if (EXTRA_TARGET_DELIVERIES.has(delivery)) {
      if (userTargets === 0) return { valid: false, label: "no targets", note: "Remote needs ≥1 target" };
      return { valid: true, label: `${userTargets} target${userTargets === 1 ? "" : "s"}`, note: "" };
    }
    // Area deliveries — anything goes; the system places the template.
    return { valid: true, label: `${userTargets} in area`, note: "" };
  }

  async _renderHTML(context) {
    const { s, cap, totalMana, damageCost, fxCost, extraTargetCost,
            deliveryOptions, canCast, targetState } = context;
    const t = this.talent;

    const deliverySelectOptions =
      `<option value="">-- Select Delivery --</option>` +
      deliveryOptions.map(o =>
        `<option value="${o.value}" ${o.selected ? "selected" : ""} ${o.unaffordable ? "disabled" : ""} class="${o.unaffordable ? "vce-tcd-unaffordable" : ""}">${o.label}${o.unaffordable ? " — over cap" : ""}</option>`
      ).join("");

    // Damage section
    let damageSection = "";
    if (this._hasDamage) {
      const diceHighlight = s.damageDice > 1 ? "vce-tcd-highlight" : "";
      // Allow damageDice = 0 if the talent ALSO has an effect (player wants
      // effect-only mode). For damage-only talents, floor the dice at 1.
      const minDice = this._hasEffect ? 0 : 1;
      damageSection = `
        <div class="vce-tcd-row">
          <label>Damage Dice</label>
          <div class="vce-tcd-controls">
            <button type="button" class="vce-tcd-btn vce-tcd-dmg-down" ${s.damageDice <= minDice ? "disabled" : ""}>−</button>
            <span class="vce-tcd-val ${diceHighlight}">${s.damageDice}d6</span>
            <button type="button" class="vce-tcd-btn vce-tcd-dmg-up">+</button>
          </div>
          <span class="vce-tcd-badge">${damageCost > 0 ? `+${damageCost}` : "free"}</span>
        </div>`;

      if (this._hasEffect) {
        damageSection += `
        <div class="vce-tcd-row">
          <label>Include Effect</label>
          <button type="button" class="vce-tcd-btn vce-tcd-fx-toggle ${s.includeEffect ? "vce-tcd-active" : ""}">
            <i class="fas fa-sparkles"></i> ${s.includeEffect ? "On" : "Off"}
          </button>
          <span class="vce-tcd-badge">${fxCost > 0 ? `+${fxCost}` : "free"}</span>
        </div>`;
      }
    } else if (this._hasEffect) {
      // Effect-only talent — always on, show as info row
      damageSection = `
        <div class="vce-tcd-row vce-tcd-muted">
          <i class="fas fa-sparkles"></i>&nbsp;Effect-only talent: <em>${t.system.effect ?? ""}</em>
        </div>`;
    }

    const manaClass = totalMana > cap ? "vce-tcd-error" : "";

    const html = `
      <div class="vce-tcd-header">
        <img src="${t.img}" width="36" height="36" style="border-radius:4px; border:1px solid rgba(255,255,255,0.15);">
        <div>
          <strong>${t.name}</strong>
          <div class="vce-tcd-muted">${t.system.effect ?? ""}</div>
        </div>
      </div>
      <div class="vce-tcd-section">${damageSection}</div>
      <div class="vce-tcd-section">
        <div class="vce-tcd-row">
          <label>Delivery</label>
          <select class="vce-tcd-delivery-select">${deliverySelectOptions}</select>
        </div>
      </div>
      <div class="vce-tcd-section vce-tcd-mana">
        Cost: <strong class="${manaClass}">${totalMana}</strong> / ${cap}
        ${extraTargetCost > 0 ? `<span class="vce-tcd-muted" style="font-size:10px">&nbsp;(+${extraTargetCost} extra targets)</span>` : ""}
      </div>
      <div class="vce-tcd-section vce-tcd-targets ${targetState.valid ? "" : "vce-tcd-target-error"}">
        <i class="fas fa-bullseye"></i>&nbsp;Targets: <strong>${targetState.label}</strong>
        ${targetState.note ? `<span class="vce-tcd-muted" style="font-size:10px">&nbsp;— ${targetState.note}</span>` : ""}
      </div>
      <div class="vce-tcd-section">
        <div class="vce-tcd-row vce-tcd-focus-row">
          <label><i class="fas fa-eye"></i> Focus Spell</label>
          <button type="button" class="vce-tcd-btn vce-tcd-focus-toggle ${s.focusAfterCast ? "vce-tcd-active" : ""}">
            ${s.focusAfterCast ? "On" : "Off"}
          </button>
          <span class="vce-tcd-muted" style="font-size:10px">sustain after cast</span>
        </div>
      </div>
      <div class="vce-tcd-footer">
        <button type="button" class="vce-tcd-btn vce-tcd-cast-btn ${canCast ? "" : "vce-tcd-disabled"}" ${canCast ? "" : "disabled"}>
          <i class="fas fa-brain"></i> Cast
        </button>
        <button type="button" class="vce-tcd-btn vce-tcd-cancel-btn">Cancel</button>
      </div>`;

    const div = document.createElement("div");
    div.innerHTML = html;
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _attachFrameListeners() {
    super._attachFrameListeners();

    // Delivery dropdown change
    this.element.addEventListener("change", e => {
      if (!e.target.classList.contains("vce-tcd-delivery-select")) return;
      this._state.deliveryType = e.target.value || null;
      // Auto-enable Focus when switching TO aura (focus-tick is the
      // expected behavior; one-shot instant aura is the rare case and
      // can still be opted into by toggling Focus off after).
      if (this._state.deliveryType === "aura" && !this._state.focusAfterCast) {
        this._state.focusAfterCast = true;
      }
      this.render();
    });

    // Button clicks
    this.element.addEventListener("click", async e => {
      const btn = e.target.closest("button");
      if (!btn) return;

      if (btn.classList.contains("vce-tcd-dmg-up")) {
        // Coming up from 0 means damage is being re-enabled. The 1d6 baseline
        // is free; cap-checked below.
        if (this._state.damageDice === 0) {
          this._state.includeDamage = true;
          this._state.damageDice = 1;
          // Effect-only mode being abandoned: if effect was on (free in
          // effect-only mode) it stays on, but now incurs the +1 surcharge.
          // Cap is enforced; if surcharge pushes over cap, _prepareContext's
          // canCast check will disable the Cast button until user adjusts.
        } else {
          const deliveryCost = DELIVERY_COSTS[this._state.deliveryType] ?? 0;
          const fxSurcharge  = this._state.includeEffect ? 1 : 0;
          const maxDice      = Math.max(1, this.cap - deliveryCost - fxSurcharge + 1);
          if (this._state.damageDice < maxDice) this._state.damageDice++;
        }
      }
      else if (btn.classList.contains("vce-tcd-dmg-down")) {
        const minDice = this._hasEffect ? 0 : 1;
        if (this._state.damageDice > minDice) this._state.damageDice--;
        // When dropping to 0, talent has an effect (precondition for minDice=0).
        // Auto-enable the effect so casting now produces effect-only output.
        if (this._state.damageDice === 0) {
          this._state.includeDamage = false;
          if (this._hasEffect) this._state.includeEffect = true;
        }
      }
      else if (btn.classList.contains("vce-tcd-fx-toggle")) {
        this._state.includeEffect = !this._state.includeEffect;
        // Clamp damageDice if now over budget due to +1 surcharge
        if (this._state.includeEffect && this._state.includeDamage) {
          const deliveryCost  = DELIVERY_COSTS[this._state.deliveryType] ?? 0;
          const remainingDice = Math.max(1, this.cap - deliveryCost - 1 + 1);
          if (this._state.damageDice > remainingDice) this._state.damageDice = remainingDice;
        }
      }
      else if (btn.classList.contains("vce-tcd-focus-toggle")) {
        this._state.focusAfterCast = !this._state.focusAfterCast;
      }
      else if (btn.classList.contains("vce-tcd-cast-btn") && !btn.disabled) {
        const s = this._state;
        const targetCount = SELF_DELIVERIES.has(s.deliveryType)
          ? 1
          : Math.max(1, game.user?.targets?.size ?? 0);

        // Defensive re-validation in case targets changed between render
        // and click. The disabled-state on the button handles the common
        // case; this catches the race.
        const targetState = this._evalTargetState(s.deliveryType, targetCount);
        if (!targetState.valid) {
          ui.notifications.warn(`${this.talent.name}: ${targetState.note}.`);
          return;
        }

        const cfg = {
          damageDice:     s.damageDice,
          includeDamage:  s.includeDamage && this._hasDamage,
          includeEffect:  s.includeEffect || (!this._hasDamage && this._hasEffect),
          delivery:       s.deliveryType ?? this._allowedDeliveries[0],
          isFocused:      s.focusAfterCast,
          targetCount,
        };
        cfg.totalMana = computeTotalMana(cfg, this.talent, targetCount);
        if (cfg.totalMana > this.cap) {
          ui.notifications.warn(
            `${this.talent.name}: cost ${cfg.totalMana} exceeds Mana cap ${this.cap}.`
          );
          return;
        }
        this._finish(cfg);
        await this.close();
        return;
      }
      else if (btn.classList.contains("vce-tcd-cancel-btn")) {
        this._finish(null);
        await this.close();
        return;
      }
      else return;

      this.render();
    });
  }

  // When window X is clicked — resolve null so openDialog promise settles.
  async close(options) {
    if (!this._settled) this._finish(null);
    if (this._targetHookId) {
      Hooks.off("targetToken", this._targetHookId);
      this._targetHookId = null;
    }
    return super.close(options);
  }
}

// ── TalentCast object ─────────────────────────────────────────────────────────

export const TalentCast = {
  /**
   * Derive the virtual Mana cap for this actor's current Psychic level.
   * cap = floor(level / 2). Returns 0 if actor is not Psychic or level < 2.
   */
  getCap(actor) {
    // Character level lives on the actor (matches feature-detector.mjs:256);
    // the Psychic class item's own `level` field is not the source of truth.
    const level = actor.system?.attributes?.level?.value ?? 1;
    return Math.floor(level / 2);
  },

  /**
   * Open the crawler-style cast configuration dialog.
   *
   * @param {Actor}  actor   — the Psychic actor casting
   * @param {Item}   talent  — the Talent item being cast
   * @returns {Promise<object|null>} config or null on cancel
   */
  async openDialog(actor, talent) {
    if (!actor || !talent) return null;

    const cap = this.getCap(actor);
    // The dialog itself populates the dropdown with every standard delivery
    // (minus imbue) — see TalentCastDialog constructor. No talent-specific
    // pre-flight needed.

    return new Promise(resolve => {
      const dialog = new TalentCastDialog(actor, talent, cap, resolve);
      dialog.render({ force: true }).catch(err => {
        console.error(`${MODULE_ID} | TalentCast: dialog render failed`, err);
        resolve(null);
      });
    });
  },

  /**
   * Register hooks. Call once on module ready.
   * The system chat card wires its own Apply Direct / save buttons, so we have
   * no renderChatMessage handler to register here anymore.
   */
  registerHooks() {
    // No custom renderChatMessage hook needed — system card handles everything.
  },

  /**
   * Execute a Talent cast using VagabondChatCard.spellCast for the chat card.
   *
   * @param {Actor}   actor   — the Psychic actor casting
   * @param {Item}    talent  — the Talent item being cast
   * @param {object}  config  — result from openDialog:
   *                           { damageDice, includeDamage, includeEffect,
   *                             delivery, isFocused, totalMana }
   * @param {object}  [options]
   * @param {Token[]} [options.explicitTargets]  — override `game.user.targets`
   *   for the cast resolution. Used by `AuraManager._tickAura` so each per-
   *   round tick can run the cast against a specific in-range hostile
   *   without mutating the player's UI selection. Defaults to the player's
   *   current targets, preserving the prior call-shape.
   * @param {boolean} [options.skipFocus=false] — skip the post-cast focus
   *   acquisition step (used by aura ticks: focus is already held by the
   *   caster on the first cast, subsequent ticks shouldn't re-apply).
   */
  async executeCast(actor, talent, config, options = {}) {
    if (!actor || !talent || !config) return;

    const { damageDice, includeDamage, includeEffect, isFocused } = config;
    const { explicitTargets = null, skipFocus = false } = options;
    // Resolve the active target set once, so cast-check + damage-targets +
    // focus-target all see the same list. Overrideable via explicitTargets
    // for aura ticks.
    const userTargets = explicitTargets ?? Array.from(game.user.targets);

    // Aura delivery → hand off to AuraManager for template placement +
    // (when focused) per-round ticks. AuraManager calls back into this
    // method per-target with `explicitTargets + skipFocus` so aura ticks
    // reuse the full cast pipeline (cast check, damage roll, save card,
    // status processing).
    //
    // Behavior selection comes from the cast dialog's Focus toggle, NOT
    // the talent's base duration:
    //   - isFocused + has damage   → "damageTick"   (re-rolls each round)
    //   - isFocused + effect-only  → "effectTick"   (re-applies each round)
    //   - !isFocused               → "instant"      (one-shot, then deactivate)
    //
    // RAW: any Spell/Talent's duration can be upgraded to Focus or Continual
    // by paying extra Mana — the dialog's Focus toggle drives that. So a
    // "instant" Pyrokinesis cast as Aura with Focus on becomes a damageTick
    // aura.
    //
    // Conditions:
    //   - explicitTargets NOT set (initial cast, not an aura tick re-entering)
    //   - delivery === "aura"
    //   - talent has damage or effect (buff Talents cast as Aura aren't
    //     wired through AuraManager yet — known gap, see follow-up)
    if (!explicitTargets
        && config.delivery === "aura"
        && (talent.system.damage || talent.system.effect)
        && !talent.system.focusBuffAE) {
      const { AuraManager } = await import("../aura/aura-manager.mjs");

      let behavior;
      if (isFocused) {
        behavior = talent.system.damage ? "damageTick" : "effectTick";
      } else {
        behavior = "instant";
      }

      // Caster's focus pool tracks the talent first — AuraManager's
      // focus-drop hook reads `focusTalentId` from activeAura and
      // deactivates when this id leaves the focusedIds list.
      if (isFocused) {
        await TalentBuffs.applyFocus(actor, talent, [actor]);
      }

      const result = await AuraManager.activateGeneric(actor, {
        sourceItemId:    talent.id,
        itemName:        talent.name,
        itemImg:         talent.img,
        behavior,
        castConfig:      config,
        focusTalentId:   isFocused ? talent.id : null,
        radius:          10,
        templateColor:   "#9b6bff",
        templateBorder:  "#5e3a8e",
      });

      // If the aura activation failed (e.g. caster already has an aura),
      // roll back the focus state so the talent card doesn't get stuck
      // focused with no actual aura.
      if (!result.success && isFocused) {
        try { await TalentBuffs.dropFocus(actor, talent); }
        catch (e) { log("TalentCast", `Aura rollback dropFocus failed: ${e.message}`); }
      }
      return;
    }

    // ── 1. Build a duck-typed spell from the talent's own data ─────────────
    //
    // Talent items carry the source spell's status fields directly
    // (causedStatuses, critCausedStatuses, damageDieSize) — see
    // talent-data-model.mjs and the content migration that copied data
    // from each source spell.
    //
    // We pass a plain object (not Object.create on a Foundry Document —
    // Document.id is a getter and can't be shadowed). The id field MUST
    // be the talent's id so the system's post-Roll-Damage
    // `actor.items.get(spell.id)` resolves to the talent item that the
    // player actually owns.
    //
    // type: "spell" lets the system branch through spell-specific paths
    // (spell damage bonuses, attackType: 'cast' resolution, etc.).
    //
    // formatDescription is a no-op identity since the talent's description
    // doesn't use the system's description-template tokens.
    // RAW: the Effect layer is a separate Mana purchase. We register the
    // useFx state for this cast so StatusHelper.processCausedStatuses (which
    // VCE patches in vagabond-character-enhancer.mjs) gates the talent's
    // causedStatuses at apply time — same mechanism used for system spells.
    // Crit-only entries (critCausedStatuses) still fire on a crit even with
    // useFx=false, matching the rules expectation.
    game.vagabondCharacterEnhancer?.recordCastUseFx?.(actor.id, talent.id, !!includeEffect);

    const castSpell = {
      id:   talent.id,
      name: talent.name,
      img:  talent.img,
      type: "spell",
      uuid: talent.uuid,
      system: {
        damageType:         talent.system.damageType || "-",
        damageDieSize:      talent.system.damageDieSize ?? null,
        description:        talent.system.description ?? "",
        crit:               null,
        formatDescription:  (html) => html ?? "",
        causedStatuses:     talent.system.causedStatuses ?? [],
        critCausedStatuses: talent.system.critCausedStatuses ?? [],
        currentDamage:      null,
      },
    };

    // ── 2. Cast check (Mysticism / Awareness) — only vs hostile targets ─────
    const unwillingTargets = userTargets.filter(
      t => t.document?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE
    );
    const requiresCastCheck = unwillingTargets.length > 0;

    let castRoll  = null;
    let isSuccess = true;
    let isCritical = false;
    let difficulty = 0;

    if (requiresCastCheck) {
      const awarenessStat = actor.system?.stats?.awareness?.value ?? 2;
      const trained       = actor.system?.skills?.mysticism?.trained ?? false;
      difficulty = 20 - (trained ? awarenessStat * 2 : awarenessStat);

      // Route through VagabondRollBuilder so the actor's system.favorHinder
      // (e.g., Absence "favor" override, Confused "hinder", etc.) and any
      // universalCheckBonus are applied — same pattern the system's
      // SpellHandler uses for cast checks (spell-handler.mjs:510-517).
      const { VagabondRollBuilder } = await import(
        "/systems/vagabond/module/helpers/roll-builder.mjs"
      );
      const systemFavorHinder = actor.system.favorHinder || 'none';
      const effectiveFavorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
        systemFavorHinder, false, false
      );
      castRoll = await VagabondRollBuilder.buildAndEvaluateD20(actor, effectiveFavorHinder);
      // The d20 is always the first Die term; favor/hinder d6 is appended.
      const d20Term = castRoll.terms.find(t => t.constructor.name === "Die" && t.faces === 20);
      const nat = d20Term?.results?.[0]?.result ?? castRoll.total;
      isCritical = nat === 20;
      isSuccess  = isCritical || castRoll.total >= difficulty;
    }

    // ── 3. Roll damage if applicable ────────────────────────────────────────
    let damageRoll = null;
    if (includeDamage && damageDice > 0) {
      try {
        const { VagabondDamageHelper } = await import(
          "/systems/vagabond/module/helpers/damage-helper.mjs"
        );
        const targetsAtRollTime = userTargets.map(t => ({
          // Match the system's _resolveStoredTargets shape EXACTLY (see
          // damage-helper.mjs:150-156). Using `name`/`img` (without the
          // actor- prefix) is wrong; the system reads `actorName`/`actorImg`.
          // Source the values from the TOKEN, not the actor — the chat
          // card's Targets section displays the token portrait + name.
          tokenId:   t.id,
          sceneId:   t.scene?.id ?? t.document?.parent?.id ?? canvas.scene?.id,
          actorId:   t.actor?.id,
          actorName: t.name ?? t.document?.name ?? t.actor?.name,
          actorImg:  t.document?.texture?.src ?? t.actor?.img,
        }));
        damageRoll = await VagabondDamageHelper.rollSpellDamage(
          actor,
          castSpell,
          { damageDice, deliveryType: config.delivery },
          isCritical,
          "awareness",
          targetsAtRollTime
        );
      } catch (err) {
        console.warn(`${MODULE_ID} | TalentCast: VagabondDamageHelper failed, falling back`, err);
        const formula = `${damageDice}d6`;
        damageRoll = await new Roll(formula).evaluate();
      }
    }

    // ── 4. Assemble spellCastResult + call spellCast ─────────────────────────
    // Match the system's _resolveStoredTargets shape EXACTLY — see
    // damage-helper.mjs:150-156. Source from the TOKEN, not the actor.
    // Use userTargets (= explicitTargets || game.user.targets) so aura ticks
    // populate the chat card's data-targets with the actual hostile in
    // range. Without this, Apply Direct fails with "No tokens targeted".
    const targetsAtRollTime = userTargets.map(t => ({
      tokenId:   t.id,
      sceneId:   t.scene?.id ?? t.document?.parent?.id ?? canvas.scene?.id,
      actorId:   t.actor?.id,
      actorName: t.name ?? t.document?.name ?? t.actor?.name,
      actorImg:  t.document?.texture?.src ?? t.actor?.img,
    }));

    const damageCost   = includeDamage ? Math.max(0, damageDice - 1) : 0;
    const fxCost       = (includeDamage && includeEffect) ? 1 : 0;
    const deliveryCost = DELIVERY_COSTS[config.delivery] ?? 0;

    const spellCastResult = {
      roll:         castRoll,
      difficulty,
      isSuccess,
      isCritical,
      manaSkill:    { label: "Mysticism", stat: "awareness" },
      manaSkillKey: "mysticism",
      costs: {
        totalCost:            config.totalMana,
        damageCost,
        fxCost,
        deliveryBaseCost:     deliveryCost,
        deliveryIncreaseCost: 0,
      },
      deliveryText: capitalize(config.delivery),
      spellState: {
        damageDice:   includeDamage ? damageDice : 0,
        deliveryType: config.delivery,
      },
    };

    const { VagabondChatCard } = await import(
      "/systems/vagabond/module/helpers/chat-card.mjs"
    );

    await VagabondChatCard.spellCast(
      actor, castSpell, spellCastResult, damageRoll, targetsAtRollTime
    );

    // ── 5. Apply focus state + distribute focus-buff AE to targets ──────────
    //
    // Per RAW: a focus-duration spell stays active while the caster focuses;
    // dropping focus ends it. For buff Talents (Shield, Evade, Absence,
    // Transvection), the focusBuffAE goes on the *target*, not the caster.
    // The caster holds the focus slot.
    //
    // Target resolution by delivery:
    //   Self            → [caster]
    //   Touch           → 1 close target
    //   Remote          → all selected targets (each extra costs +1 Mana,
    //                     already paid via the cost computation above)
    //   Area deliveries → all caught in the area template (system-handled)
    // Aura ticks reuse executeCast for the per-target damage/effect roll —
    // they pass skipFocus:true so subsequent ticks don't re-acquire the
    // caster's focus slot (focus was already applied on the initial cast,
    // which is what the AuraManager is now sustaining).
    if (skipFocus) return;

    if (isFocused && talent.system.focusBuffAE) {
      const recipients = resolveTargetsForBuff(actor, config.delivery);
      if (recipients && recipients.length > 0) {
        await TalentBuffs.applyFocus(actor, talent, recipients);
      } else {
        ui.notifications.warn(
          `${talent.name}: no valid targets for ${config.delivery} delivery — focus not applied.`
        );
      }
    } else if (isFocused) {
      // Focus-duration Talent without a buff AE (e.g. Control, Seize). Track
      // focus state on the caster so the focus pool gates correctly and the
      // generic _focus FX plays. No AE distribution.
      await TalentBuffs.applyFocus(actor, talent, [actor]);
    }
  },
};
