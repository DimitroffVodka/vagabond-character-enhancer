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

import { MODULE_ID } from "../utils.mjs";

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
 * @returns {number} total Mana cost
 */
function computeTotalMana(config, talent) {
  const hasDamage = !!talent.system.damage;
  const hasEffect = !!talent.system.effect;

  const dmgIncluded = config.includeDamage && hasDamage;
  const fxIncluded  = config.includeEffect  && hasEffect;

  // Extra dice beyond the free base 1d6
  const extraDice = dmgIncluded ? Math.max(0, (config.damageDice ?? 1) - 1) : 0;

  let total = 0;
  total += extraDice;                                    // each extra die = +1 Mana
  total += (dmgIncluded && fxIncluded) ? 1 : 0;         // both components = +1 surcharge
  total += DELIVERY_COSTS[config.delivery] ?? 0;         // delivery base cost
  // focus / duration always free for Talents
  return total;
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

    // Build allowed delivery list (intersect talent's delivery with known costs)
    const allowed = (talent.system.delivery ?? []).filter(d => d in DELIVERY_COSTS);
    const affordable0 = allowed.filter(d => (DELIVERY_COSTS[d] ?? 99) <= cap);
    const initialDelivery = affordable0[0] ?? allowed[0] ?? "touch";

    // State mirrors CrawlerSpellDialog.spellState pattern
    this._state = {
      damageDice:     hasDamage ? 1 : 0,  // total dice count (1 = 1d6 free)
      includeDamage:  hasDamage,
      includeEffect:  !hasDamage && hasEffect,  // default on if effect-only
      deliveryType:   initialDelivery,
      focusAfterCast: false,
    };

    this._allowedDeliveries = allowed;
    this._hasDamage = hasDamage;
    this._hasEffect = hasEffect;
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

    const totalMana    = computeTotalMana({
      damageDice:     s.damageDice,
      includeDamage:  s.includeDamage,
      includeEffect:  s.includeEffect,
      delivery:       s.deliveryType,
    }, this.talent);
    const damageCost   = s.includeDamage ? Math.max(0, s.damageDice - 1) : 0;
    const fxCost       = (s.includeDamage && s.includeEffect) ? 1 : 0;
    const deliveryCost = DELIVERY_COSTS[s.deliveryType] ?? 0;

    const deliveryOptions = this._allowedDeliveries.map(d => {
      const label = CONFIG.VAGABOND?.deliveryTypes?.[d] ?? capitalize(d);
      return { value: d, label: `${label} (${DELIVERY_COSTS[d] === 0 ? "free" : `+${DELIVERY_COSTS[d]}`})`, selected: d === s.deliveryType };
    });

    const canCast = s.deliveryType !== null && totalMana <= cap;

    return { s, cap, totalMana, damageCost, fxCost, deliveryCost, deliveryOptions, canCast };
  }

  async _renderHTML(context) {
    const { s, cap, totalMana, damageCost, fxCost, deliveryOptions, canCast } = context;
    const t = this.talent;

    const deliverySelectOptions =
      `<option value="">-- Select Delivery --</option>` +
      deliveryOptions.map(o =>
        `<option value="${o.value}" ${o.selected ? "selected" : ""}>${o.label}</option>`
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
        const s   = this._state;
        const cfg = {
          damageDice:     s.damageDice,
          includeDamage:  s.includeDamage && this._hasDamage,
          includeEffect:  s.includeEffect || (!this._hasDamage && this._hasEffect),
          delivery:       s.deliveryType ?? this._allowedDeliveries[0],
          isFocused:      s.focusAfterCast,
        };
        cfg.totalMana = computeTotalMana(cfg, this.talent);
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
    const psy = actor.items.find(i => i.type === "class" && i.name === "Psychic");
    return Math.floor((psy?.system?.level ?? 1) / 2);
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
    const allowed = (talent.system.delivery ?? []).filter(d => d in DELIVERY_COSTS);

    if (allowed.length === 0) {
      ui.notifications.warn(`${talent.name}: no valid delivery options configured.`);
      return null;
    }

    const affordable = allowed.filter(d => (DELIVERY_COSTS[d] ?? 99) <= cap);
    if (affordable.length === 0) {
      ui.notifications.warn(
        `${talent.name}: no affordable delivery options at current Mana cap (${cap}).`
      );
      return null;
    }

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
   */
  async executeCast(actor, talent, config) {
    if (!actor || !talent || !config) return;

    const { damageDice, includeDamage, includeEffect, isFocused } = config;

    // ── 1. Look up the REAL source spell and layer talent flavor on top ────
    //
    // Each spell-aliased Talent has talent.system.aliasOf set to the source
    // spell's lowercase name (e.g., "burn" for Pyrokinesis). Using the real
    // spell — instead of a fake duck-typed object — gives us:
    //   - Correct causedStatuses (Burn's countdown burning, etc.)
    //   - Correct attackType resolution (cast attacks bypass armor via
    //     existing VCE patches)
    //   - Correct save handling
    //   - Correct effect application
    //
    // We override only `name` and `img` via Object.create so the chat card
    // displays the talent's flavor (Pyrokinesis, not Burn). All system
    // properties + methods come through the prototype chain.
    const aliasName = (talent.system.aliasOf ?? "").toString().trim().toLowerCase();
    let castSpell;
    if (aliasName) {
      const pack = game.packs.get("vagabond.spells");
      const docs = await pack.getDocuments();
      const sourceSpell = docs.find(s => s.name.toLowerCase() === aliasName);
      if (sourceSpell) {
        // Layer name/img overrides on a prototype-chained object. Methods
        // and fields like `system.causedStatuses` resolve up to the real
        // spell, so the system handles countdown effects, save types, etc.
        // exactly as it would for a normal cast of the source spell.
        castSpell = Object.create(sourceSpell);
        castSpell.name = talent.name;
        castSpell.img  = talent.img;
      } else {
        ui.notifications.warn(
          `Talent ${talent.name}: source spell "${aliasName}" not found in vagabond.spells. Falling back to plain damage roll.`
        );
      }
    }

    // Fallback duck-typed spell for talents without a source (or if lookup
    // failed). This path won't get countdown effects but at least produces
    // a valid chat card for testing.
    if (!castSpell) {
      const effectName = includeEffect && talent.system.effect ? talent.system.effect : null;
      const causedStatuses = effectName
        ? [{
            statusId:          effectName.toLowerCase().replace(/\s+/g, "-"),
            requiresDamage:    includeDamage,
            saveType:          "will",
            duration:          "",
            tickDamageEnabled: false,
            damageOnTick:      "",
            damageType:        talent.system.damageType ?? "-",
          }]
        : [];
      castSpell = {
        id:   talent.id,
        name: talent.name,
        img:  talent.img,
        type: "spell",
        system: {
          damageType:        includeDamage ? (talent.system.damageType || "-") : "-",
          damageDieSize:     null,
          description:       talent.system.description ?? "",
          crit:              null,
          formatDescription: (html) => html ?? "",
          causedStatuses,
          critCausedStatuses: [],
          currentDamage:     null,
        },
      };
    }

    // ── 2. Cast check (Mysticism / Awareness) — only vs hostile targets ─────
    const unwillingTargets = Array.from(game.user.targets).filter(
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

      castRoll   = await new Roll("1d20").evaluate();
      const nat  = castRoll.terms?.[0]?.results?.[0]?.result ?? castRoll.total;
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
        const targetsAtRollTime = Array.from(game.user.targets).map(t => ({
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
    const targetsAtRollTime = Array.from(game.user.targets).map(t => ({
      sceneId: t.scene?.id ?? t.document?.parent?.id ?? canvas.scene?.id,
      tokenId: t.id,
      actorId: t.actor?.id,
      actorName: t.actor?.name,
      name: t.actor?.name,
      img: t.actor?.img,
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

    // ── 5. Focus (Task 11 — not yet implemented) ────────────────────────────
    if (isFocused) {
      console.log(
        `${MODULE_ID} | TalentCast | ${talent.name}: isFocused=true — focus wiring pending Task 11.`
      );
    }
  },
};
