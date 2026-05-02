/**
 * Ward Spell Manager
 * Handles the reactive Ward spell:
 *   - On cast: applies a "Warded" AE to the target with caster reference
 *   - On damage: subscribes to Vagabond v5.3.0's `vagabond.preDamageApply`
 *     hook — when a Warded target is about to take >0 damage, cancel the
 *     system's damage path (return false) and asynchronously open the
 *     Cast Check dialog BEFORE damage lands. The handler then applies
 *     the post-reduction damage, fires postDamageApply, and renders the
 *     standard damage chat card so the visible amount matches reality.
 *   - Ward dialog: Cast Check → d6 per (1 + extra Mana) damage reduction,
 *     crit = negate all
 *   - Focus cleanup: removes Warded AE when caster stops focusing
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const WARD_AE_FLAG = "wardAE";

/* -------------------------------------------- */
/*  WardManager                                  */
/* -------------------------------------------- */

export const WardManager = {

  registerHooks() {
    // Ensure Ward spells skip the initial Cast Check immediately
    this._ensureWardNoRoll();
    Hooks.on("createItem", (item) => {
      if (item.type === "spell" && item.name.toLowerCase() === "ward" && item.parent?.type === "character") {
        this._setNoRoll(item);
      }
    });

    // Detect Ward spell casts and apply Warded AE
    Hooks.on("createChatMessage", async (message) => {
      await this._onWardCast(message);
    });

    // GM: handle Ward requests from players
    Hooks.on("createChatMessage", async (message) => {
      if (!game.user.isGM) return;
      const flags = message.flags?.[MODULE_ID];
      if (!flags?.wardRequest) return;

      const caster = game.actors.get(flags.casterId);
      if (!caster) return;
      const targets = flags.targets || [];
      await this._applyWardAE(caster, targets);
    });

    // Focus cleanup: remove Ward AEs when caster stops focusing.
    // EXCEPTION — Witch Hex: if the caster is a Witch and the warded target
    // is their current Hex target, the Ward effect is "continual" per Hex's
    // rules ("until you use this Feature on a different Target") and should
    // NOT be removed even if focus is dropped. Hex transfer / removal is
    // what ends it.
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes) && !("turn" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      for (const actor of game.actors.filter(a => a.type === "character" || a.type === "npc")) {
        const wardAEs = actor.effects.filter(e =>
          e.getFlag(MODULE_ID, WARD_AE_FLAG) && !e.getFlag(MODULE_ID, "auraBuff")
        );
        for (const ae of wardAEs) {
          const casterId = ae.getFlag(MODULE_ID, "wardCasterId");
          if (!casterId) continue;
          const caster = game.actors.get(casterId);
          if (!caster) continue;

          const focusedIds = caster.system?.focus?.spellIds || [];
          const isFocusingWard = focusedIds.some(id => {
            const spell = caster.items.get(id);
            return spell?.name?.toLowerCase() === "ward";
          });

          if (isFocusingWard) continue;

          // Hex continuality: any module-managed spell effect on a witch's
          // hex target is continual per Hex's rules. Defer to the shared
          // WitchFeatures.isHexContinual helper.
          const { WitchFeatures } = await import("../class-features/witch.mjs");
          if (WitchFeatures.isHexContinual(actor, caster)) {
            log("Ward", `Ward on ${actor.name} preserved — continual via ${caster.name}'s Hex`);
            continue;
          }

          await actor.deleteEmbeddedDocuments("ActiveEffect", [ae.id]);
          log("Ward", `Ward expired on ${actor.name} — caster ${caster.name} not focusing`);
        }
      }
    });

    // Watch for Ward AE deletion
    Hooks.on("deleteActiveEffect", (effect) => {
      if (!effect.getFlag(MODULE_ID, WARD_AE_FLAG)) return;
      const actor = effect.parent;
      if (!actor || actor.documentName !== "Actor") return;
      log("Ward", `Warded AE removed from ${actor.name}`);
    });

    // Pre-damage interception: when a Warded target is about to take >0
    // damage, cancel the system's damage application (return false) and
    // hand off to an async handler that opens the Cast Check dialog
    // BEFORE damage lands. The handler then applies whatever damage
    // remains after Ward reduction, fires postDamageApply, and renders
    // the chat result card itself.
    //
    // Requires Vagabond v5.3.0+ for `vagabond.preDamageApply`. Pre-Vagabond-
    // 5.3 environments fall through silently — the hook never fires.
    Hooks.on("vagabond.preDamageApply", (ctx) => {
      if (!ctx?.actor) return;
      const incoming = ctx.amount ?? 0;
      if (incoming <= 0) return;

      const wardAE = ctx.actor.effects.find(e =>
        e.getFlag(MODULE_ID, WARD_AE_FLAG) && !e.disabled
      );
      if (!wardAE) return;

      const casterId = wardAE.getFlag(MODULE_ID, "wardCasterId");
      const caster = casterId ? game.actors.get(casterId) : null;
      // Need a reachable caster who can roll the Cast Check on the local
      // client. Without one we fall through and let the system apply
      // damage normally (no Ward this hit).
      if (!caster) return;
      if (!caster.isOwner && !game.user.isGM) return;

      // Fire-and-forget: the dialog runs async, system has already been
      // told (via return false) not to apply damage on its own.
      this._handleWardedDamage(ctx, wardAE, caster).catch((e) =>
        log("Ward", `_handleWardedDamage failed: ${e.message}`)
      );
      return false;
    });
  },

  /* -------------------------------------------- */
  /*  Pre-Damage Ward Reaction                     */
  /* -------------------------------------------- */

  /**
   * Async pre-damage handler. The preDamageApply listener already cancelled
   * the system's damage path. This handler:
   *   1. Opens the Ward dialog (Cast Check + mana spend)
   *   2. Computes final damage = max(0, ctx.amount - reduction)
   *   3. Applies the reduced damage to the target's HP
   *   4. Fires `vagabond.postDamageApply` (so on-damage triggers still fire)
   *   5. Renders the system damage chat card via VagabondChatCard.applyResult
   *
   * If the dialog is cancelled / Ward fails / no Cast Check, the original
   * un-reduced damage is applied so behavior matches the no-Ward path.
   */
  async _handleWardedDamage(ctx, wardAE, caster) {
    const { actor, damageType, sourceItem } = ctx;
    const incoming = ctx.amount ?? 0;
    const previousValue = actor.system.health?.value ?? 0;

    let reduction = null;
    try {
      reduction = await this._promptWardReaction(caster, actor);
    } catch (e) {
      log("Ward", `_promptWardReaction threw: ${e.message}`);
      reduction = null;
    }

    let finalAmount;
    if (reduction === Infinity) {
      finalAmount = 0;
    } else if (typeof reduction === "number" && reduction > 0) {
      finalAmount = Math.max(0, incoming - reduction);
    } else {
      finalAmount = incoming;
    }

    const newValue = Math.max(0, previousValue - finalAmount);

    // Apply the HP change. Owner / GM writes directly; other clients relay
    // through the system's socket helper (added in v5.3.0).
    if (actor.isOwner || game.user.isGM) {
      try { await actor.update({ "system.health.value": newValue }); }
      catch (e) { log("Ward", `actor.update failed: ${e.message}`); return; }
    } else {
      try {
        game.vagabond?.socket?.emit?.("applyDamage", {
          actorUuid: actor.uuid,
          newHp: newValue,
        });
      } catch (e) {
        log("Ward", `socket emit applyDamage failed: ${e.message}`);
        return;
      }
    }

    // Fire postDamageApply so on-damage triggers (Briar Healer, retributive
    // effects, etc.) still see the reduced damage.
    try {
      Hooks.callAll("vagabond.postDamageApply", {
        actor,
        amount: finalAmount,
        damageType,
        sourceItem,
        oldHp: previousValue,
        newHp: newValue,
      });
    } catch (e) {
      log("Ward", `postDamageApply hook failed: ${e.message}`);
    }

    // Render the system's standard damage chat card so chat reflects the
    // reduced amount.
    try {
      const VCC = game.vagabond?.api?.VagabondChatCard;
      if (VCC?.applyResult) {
        await VCC.applyResult(actor, {
          type: "damage",
          rawAmount: incoming,
          armorReduction: 0, // already accounted for upstream by the system
          finalAmount,
          damageType: damageType || "-",
          previousValue,
          newValue,
        });
      }
    } catch (e) {
      log("Ward", `applyResult chat card failed: ${e.message}`);
    }

    log(
      "Ward",
      `${actor.name}: incoming ${incoming} → ${finalAmount} (Ward ${
        reduction === Infinity ? "CRIT (negate)" :
        reduction != null ? `reduced ${reduction}` : "no reduction"
      })`
    );
  },

  /* -------------------------------------------- */
  /*  Ward Reaction Dialog                         */
  /* -------------------------------------------- */

  /**
   * Prompts the Ward caster for mana spending, rolls Cast Check, returns reduction amount.
   * @returns {number|null} Reduction amount (Infinity for crit), or null if cancelled/failed
   */
  async _promptWardReaction(caster, targetActor) {
    const manaSkillKey = caster.system.attributes?.manaSkill;
    if (!manaSkillKey) return null;

    const skill = caster.system.skills?.[manaSkillKey];
    if (!skill) return null;

    const currentMana = caster.system.mana?.current ?? 0;
    const difficulty = skill.difficulty;

    // Build mana spending options
    const maxExtra = Math.max(0, currentMana);
    const options = [];
    for (let i = 0; i <= maxExtra; i++) {
      const totalDice = 1 + i;
      const label = i === 0
        ? `No extra Mana (1d6 reduction)`
        : `${i} extra Mana (${totalDice}d6 reduction)`;
      options.push(`<option value="${i}">${label}</option>`);
    }

    // Show mana dialog
    const extraMana = await new Promise((resolve) => {
      new Dialog({
        title: `Ward — ${caster.name} protects ${targetActor.name}`,
        content: `
          <form>
            <div class="form-group">
              <label>Cast Check Difficulty: ${difficulty}</label>
            </div>
            <div class="form-group">
              <label>Current Mana: ${currentMana}</label>
            </div>
            <div class="form-group">
              <label for="vce-ward-mana">Extra Mana to Spend:</label>
              <select id="vce-ward-mana" name="extraMana">
                ${options.join("")}
              </select>
            </div>
          </form>`,
        buttons: {
          cast: {
            icon: '<i class="fas fa-shield-alt"></i>',
            label: "Cast Check",
            callback: (html) => {
              const el = html instanceof jQuery ? html[0] : html;
              const val = parseInt(el.querySelector('[name="extraMana"]').value);
              resolve(val);
            }
          },
          skip: {
            icon: '<i class="fas fa-forward"></i>',
            label: "Skip Ward",
            callback: () => resolve(null)
          }
        },
        default: "cast",
        close: () => resolve(null)
      }).render(true);
    });

    if (extraMana === null) return null;

    // Deduct extra mana from caster
    if (extraMana > 0) {
      const newMana = Math.max(0, currentMana - extraMana);
      await caster.update({ "system.mana.current": newMana });
      log("Ward", `${caster.name} spent ${extraMana} extra Mana (${currentMana} → ${newMana})`);
    }

    // Roll Cast Check
    const castRoll = new Roll("1d20");
    await castRoll.evaluate();
    const rollTotal = castRoll.total;
    const isCrit = castRoll.dice[0]?.results[0]?.result === 20;
    const isSuccess = isCrit || rollTotal >= difficulty;

    const totalDice = 1 + extraMana;
    let reductionAmount = 0;
    let reductionRoll = null;

    if (isCrit) {
      reductionAmount = Infinity;
    } else if (isSuccess) {
      reductionRoll = new Roll(`${totalDice}d6`);
      await reductionRoll.evaluate();
      reductionAmount = reductionRoll.total;
    }

    // Render the Cast Check as a spell-style chat card so the header reads
    // "WARD" with the spell's subtitle and icon (matching how a normal
    // Ward cast appears), with the Mysticism check as the roll badge and
    // the d6 reduction roll rendered as damage-style green dice (so the
    // actual rolled values are visible AND Dice So Nice animates them).
    //
    // We build the card manually via the system's `new VagabondChatCard()`
    // builder rather than `createActionCard` because the latter auto-adds
    // save/apply buttons whenever a damage roll is present — those don't
    // make sense for a reduction roll. Manual construction lets us keep
    // the dice rendering and skip the buttons.
    const wardSpell = caster.items.find(i =>
      i.type === "spell" && i.name?.toLowerCase?.() === "ward"
    );

    const tags = [
      { label: `Protecting ${targetActor.name}`, cssClass: "" },
    ];
    if (extraMana > 0) tags.push({ label: `+${extraMana} extra Mana`, cssClass: "" });
    if (isCrit) {
      tags.push({ label: "CRIT — All damage negated", cssClass: "" });
    } else if (isSuccess) {
      tags.push({ label: `Reduced by ${reductionAmount}`, cssClass: "" });
    } else {
      tags.push({ label: "Ward fizzles — no reduction", cssClass: "" });
    }

    const VCC = game.vagabond?.api?.VagabondChatCard;
    if (VCC) {
      try {
        const card = new VCC();
        // setItem before setActor → spell icon + spell title (matches
        // how a normal Ward cast looks on the sheet).
        if (wardSpell) card.setItem(wardSpell);
        card.setActor(caster);
        card.setTitle(wardSpell?.name ?? "Ward");
        card.addRoll(castRoll, difficulty);
        card.setOutcome(isSuccess ? "PASS" : "FAIL", isCrit);
        card.data.standardTags = tags;
        card.data.propertyTags = [];
        card.setMetadataTags(tags);
        // Add the d6 reduction roll as a damage block so it renders with
        // the system's green-pentagon dice icons. send() puts both rolls
        // into msgData.rolls so Dice So Nice animates them.
        if (reductionRoll) {
          card.addDamage(reductionRoll, "Reduction", isCrit, "physical");
        }
        await card.send();
      } catch (e) {
        log("Ward", `Ward card construction failed: ${e.message}`);
      }
    } else {
      // Fallback for environments without the v5.3.0 chat-card API
      await ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2"><strong>${caster.name}</strong> Ward Cast Check ${rollTotal} vs ${difficulty}</div>`,
        speaker: ChatMessage.getSpeaker({ actor: caster }),
        rolls: reductionRoll ? [castRoll, reductionRoll] : [castRoll],
      });
    }

    log("Ward", `${caster.name} Ward check: ${rollTotal} vs ${difficulty} — ${isSuccess ? (isCrit ? "CRIT" : `pass, -${reductionAmount}`) : "fail"}`);

    return isSuccess ? reductionAmount : null;
  },

  /* -------------------------------------------- */
  /*  Spell Cast Detection                         */
  /* -------------------------------------------- */

  async _onWardCast(message) {
    const content = message.content ?? "";
    if (!content.includes("vagabond-chat-card-v2")) return;

    const actorId = message.flags?.vagabond?.actorId;
    const itemId = message.flags?.vagabond?.itemId;
    if (!actorId || !itemId) return;

    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) return;

    const item = actor.items.get(itemId);
    if (!item || item.type !== "spell") return;
    if (item.name.toLowerCase() !== "ward") return;

    const targets = message.flags?.vagabond?.targetsAtRollTime || [];
    if (targets.length === 0) {
      log("Ward", "Ward cast but no targets selected");
      return;
    }

    if (game.user.isGM) {
      await this._applyWardAE(actor, targets);
    } else {
      await ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-shield-alt" style="color:#4a90d9;"></i>
              <strong>${actor.name}</strong> casts Ward on: <strong>${targets.map(t => t.actorName).join(", ")}</strong>
              <br><span style="font-size:0.8em; opacity:0.7;">Waiting for GM…</span>
            </div>
          </section></div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
        flags: {
          [MODULE_ID]: { wardRequest: true, casterId: actorId, targets }
        }
      });
      ui.notifications.info("Ward request sent to GM.");
    }
  },

  /* -------------------------------------------- */
  /*  Apply Ward AE                                */
  /* -------------------------------------------- */

  async _applyWardAE(caster, targets) {
    const affected = [];

    for (const target of targets) {
      const targetActor = game.actors.get(target.actorId);
      if (!targetActor) continue;
      if (!targetActor.isOwner && !game.user.isGM) continue;

      // Remove existing Ward from this caster (refresh)
      const existing = targetActor.effects.filter(e =>
        e.getFlag(MODULE_ID, WARD_AE_FLAG) && e.getFlag(MODULE_ID, "wardCasterId") === caster.id
      );
      if (existing.length > 0) {
        await targetActor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
      }

      try {
        await targetActor.createEmbeddedDocuments("ActiveEffect", [{
          name: `Warded (${caster.name})`,
          img: "icons/magic/defensive/shield-barrier-blue.webp",
          origin: `Actor.${caster.id}`,
          changes: [],
          disabled: false,
          transfer: true,
          statuses: ["warded"],
          flags: {
            [MODULE_ID]: {
              [WARD_AE_FLAG]: true,
              wardCasterId: caster.id
            }
          }
        }]);
        affected.push(targetActor.name);
      } catch (e) {
        log("Ward", `Could not apply Ward to ${targetActor.name}: ${e.message}`);
      }
    }

    if (affected.length > 0) {
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-shield-alt" style="color:#4a90d9;"></i>
              <strong>${caster.name}</strong> wards <strong>${affected.join(", ")}</strong>
              <br><span style="font-size:0.85em; opacity:0.7;">Damage reduced by d6 on Cast Check pass</span>
            </div>
          </section></div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: caster })
      });
      log("Ward", `${caster.name} warded: ${affected.join(", ")}`);
    }
  },

  /* -------------------------------------------- */
  /*  Auto-skip Cast Check on Initial Cast         */
  /* -------------------------------------------- */

  _ensureWardNoRoll() {
    for (const actor of game.actors.filter(a => a.type === "character")) {
      for (const item of actor.items.filter(i => i.type === "spell" && i.name.toLowerCase() === "ward")) {
        this._setNoRoll(item);
      }
    }
  },

  async _setNoRoll(item) {
    if (item.system.noRollRequired) return;
    try {
      await item.update({ "system.noRollRequired": true });
      log("Ward", `Set noRollRequired on ${item.parent?.name}'s Ward spell`);
    } catch (e) {
      log("Ward", `Could not set noRollRequired on Ward: ${e.message}`);
    }
  }
};
