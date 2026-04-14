/**
 * Ward Spell Manager
 * Handles the reactive Ward spell:
 *   - On cast: applies a "Warded" AE to the target with caster reference
 *   - On damage: intercepts handleSaveRoll/handleApplyDirect to show Ward dialog
 *   - Ward dialog: Cast Check → d6 per (1 + extra Mana) damage reduction, crit = negate all
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

    // Focus cleanup: remove Ward AEs when caster stops focusing
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

          if (!isFocusingWard) {
            await actor.deleteEmbeddedDocuments("ActiveEffect", [ae.id]);
            log("Ward", `Ward expired on ${actor.name} — caster ${caster.name} not focusing`);
          }
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
  },

  /* -------------------------------------------- */
  /*  Pre/Post-damage Hooks — called from main     */
  /* -------------------------------------------- */

  /** Internal HP snapshot storage */
  _hpBeforeDamage: {},

  /**
   * Called BEFORE damage is applied. Snapshots target HP so Ward can cap
   * the heal-back to the actual damage taken from this hit.
   */
  snapshotHP(button) {
    this._hpBeforeDamage = {};
    try {
      const targets = JSON.parse((button.dataset.targets || "[]").replace(/&quot;/g, '"'));
      for (const t of targets) {
        const actor = game.actors.get(t.actorId);
        if (actor) {
          this._hpBeforeDamage[t.actorId] = actor.system.health?.value ?? 0;
        }
      }
    } catch { /* ignore */ }
  },

  /**
   * Called AFTER handleSaveRoll or handleApplyDirect has already applied damage.
   * Checks if any target has a Ward AE, prompts the caster for Ward reaction,
   * and heals back the Ward reduction amount (capped at damage taken).
   * @param {HTMLElement} button - The damage button with dataset
   */
  async onPostDamage(button) {
    let targets;
    try {
      targets = JSON.parse((button.dataset.targets || "[]").replace(/&quot;/g, '"'));
    } catch { return; }

    for (const target of targets) {
      const targetActor = game.actors.get(target.actorId);
      if (!targetActor) continue;

      const wardAEs = targetActor.effects.filter(e =>
        e.getFlag(MODULE_ID, WARD_AE_FLAG) && !e.disabled
      );
      if (wardAEs.length === 0) continue;

      // Snapshot HP after damage was applied (before Ward heals back)
      const hpAfterDamage = targetActor.system.health?.value ?? 0;

      for (const wardAE of wardAEs) {
        const casterId = wardAE.getFlag(MODULE_ID, "wardCasterId");
        const caster = game.actors.get(casterId);
        if (!caster) continue;

        if (!caster.isOwner && !game.user.isGM) continue;

        // Calculate how much damage was actually dealt by this hit
        // (current HP vs what it was before — we track via hpBefore stored pre-damage)
        const hpBefore = this._hpBeforeDamage?.[target.actorId] ?? hpAfterDamage;
        const damageTaken = Math.max(0, hpBefore - hpAfterDamage);

        if (damageTaken === 0) continue; // No damage taken, skip Ward

        const reduction = await this._promptWardReaction(caster, targetActor);
        if (reduction === null) continue; // Cancelled, skipped, or failed

        // Ward can't heal more than the damage taken from this hit
        let healAmount;
        if (reduction === Infinity) {
          healAmount = damageTaken; // Crit: negate all damage from this hit
        } else {
          healAmount = Math.min(reduction, damageTaken);
        }

        if (healAmount > 0) {
          const currentHP = targetActor.system.health?.value ?? 0;
          const newHP = currentHP + healAmount;
          await targetActor.update({ "system.health.value": newHP });
          log("Ward", `${targetActor.name} healed ${healAmount} HP from Ward (${currentHP} → ${newHP}), damage was ${damageTaken}`);
        }
      }
    }
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
    let resultText = "";

    if (isCrit) {
      resultText = `<strong style="color:#ffd700;">CRIT!</strong> All damage negated!`;
      reductionAmount = Infinity;
    } else if (isSuccess) {
      reductionRoll = new Roll(`${totalDice}d6`);
      await reductionRoll.evaluate();
      reductionAmount = reductionRoll.total;
      resultText = `<strong style="color:#4a90d9;">Pass!</strong> Reduced by ${reductionAmount} (${totalDice}d6: ${reductionRoll.result})`;
    } else {
      resultText = `<strong style="color:#cc4444;">Failed.</strong> Ward fizzles — no reduction.`;
    }

    // Post result to chat
    const skillLabel = skill.label || manaSkillKey;
    const chatContent = `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
      <div class="card-body"><section class="content-body">
        <div class="card-description" style="text-align:center;">
          <i class="fas fa-shield-alt" style="color:#4a90d9;"></i>
          <strong>${caster.name}</strong> casts Ward to protect <strong>${targetActor.name}</strong>
          <br><span style="font-size:0.9em;">${skillLabel} Check: ${rollTotal} vs ${difficulty}</span>
          ${extraMana > 0 ? `<br><span style="font-size:0.85em; opacity:0.7;">+${extraMana} extra Mana spent</span>` : ""}
          <br>${resultText}
        </div>
      </section></div>
    </div>`;

    const rolls = [castRoll];
    if (reductionRoll) rolls.push(reductionRoll);

    await ChatMessage.create({
      content: chatContent,
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      rolls
    });

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
          icon: "icons/magic/defensive/shield-barrier-blue.webp",
          origin: `Actor.${caster.id}`,
          changes: [],
          disabled: false,
          transfer: true,
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
