/**
 * Effect-Only Spell Handler
 *
 * Fixes effect-only spells (damageType = "-", no damage dice) that incorrectly
 * show a "Roll Damage" button due to a system bug in createActionCard.
 *
 * Replaces the erroneous damage button with an "Apply Effects" button that
 * directly applies the spell's causedStatuses to targets via StatusHelper.
 *
 * For statuses with "focusing" duration, tracks them on the target so they
 * can be auto-removed when the caster's turn comes around and they aren't
 * focusing on the spell.
 */

import { MODULE_ID, log } from "../utils.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const FLAG_EFFECT_ONLY = "effectOnlyApplied";

/* -------------------------------------------- */
/*  EffectOnlyHandler                            */
/* -------------------------------------------- */

export const EffectOnlyHandler = {

  /* -------------------------------------------- */
  /*  Hook Registration                            */
  /* -------------------------------------------- */

  registerHooks() {
    // Detect effect-only spell cards and replace damage button with Apply Effects
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      this._processCard(message, el);
      setTimeout(() => {
        const domEl = document.querySelector(`[data-message-id="${message.id}"]`);
        if (domEl) this._processCard(message, domEl);
      }, 50);
    });

    // Auto-remove focusing statuses on round change if caster isn't focusing.
    // Vagabond uses round-based combat (no per-combatant turns), so we only
    // trigger on round changes.
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!game.user.isGM) return;
      if (!("round" in changes)) return;
      await this._cleanupFocusingStatuses(combat);
    });
  },

  /* -------------------------------------------- */
  /*  Chat Card Processing                         */
  /* -------------------------------------------- */

  /**
   * Detect effect-only spell cards and replace the erroneous damage button.
   * @param {ChatMessage} message
   * @param {HTMLElement} el
   */
  _processCard(message, el) {
    // Already processed?
    if (el.querySelector('[data-action="vce-apply-effects"]')) return;

    // Find the erroneous damage button
    const damageBtn = el.querySelector('.vagabond-damage-button');
    if (!damageBtn) return;

    // Look up spell from message flags
    const actorId = message.flags?.vagabond?.actorId;
    const itemId = message.flags?.vagabond?.itemId;
    if (!actorId || !itemId) return;

    const actor = game.actors.get(actorId);
    if (!actor) return;
    const item = actor.items.get(itemId);
    // Accept both vanilla spells and Psychic Talents (custom item type) — the
    // rest of the handler reads item.system.causedStatuses, which talents
    // now carry directly (see talent-data-model.mjs schema + migration).
    if (!item) return;
    if (item.type !== "spell" && item.type !== `${MODULE_ID}.talent`) return;

    // Determine if this is an effect-only cast. Two scenarios:
    //  1. Spell has damageType "-" (always effect-only, e.g., Color)
    //  2. Spell has a damage type but was cast with 0 damage dice (e.g., Zap
    //     cast for effect only). Detected by the absence of a .tag-damage
    //     element in the card's metadata tags — spellCast() only adds that
    //     tag when damageDice > 0.
    const isAlwaysEffectOnly = item.system.damageType === "-";
    const hasDamageTag = !!el.querySelector('.tag-damage');
    const isCastAsEffectOnly = !isAlwaysEffectOnly && !hasDamageTag;

    if (!isAlwaysEffectOnly && !isCastAsEffectOnly) return;

    // Check if the spell has statuses to apply
    const hasStatuses = item.system.causedStatuses?.length > 0;
    const hasCritStatuses = item.system.critCausedStatuses?.length > 0;
    if (!hasStatuses && !hasCritStatuses) {
      // Effect-only cast with no statuses — just remove the erroneous button
      damageBtn.remove();
      return;
    }

    // Detect crit from card HTML
    const isCrit = !!(
      el.querySelector('.crit-text') ||
      el.querySelector('.roll-skill-label')?.textContent?.includes('(Crit)')
    );

    // Get targets from message flags
    const targets = message.flags?.vagabond?.targetsAtRollTime || [];
    const targetsJson = JSON.stringify(targets).replace(/"/g, '&quot;');

    // Build Apply Effects button
    const applyBtn = document.createElement('button');
    applyBtn.className = 'vagabond-damage-button vce-apply-effects-button';
    applyBtn.dataset.action = 'vce-apply-effects';
    applyBtn.dataset.actorId = actorId;
    applyBtn.dataset.itemId = itemId;
    applyBtn.dataset.isCrit = isCrit;
    applyBtn.dataset.targets = JSON.stringify(targets);
    applyBtn.dataset.messageId = message.id;
    applyBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Apply Effects';

    // Replace damage button with Apply Effects
    damageBtn.replaceWith(applyBtn);

    // Wire click handler
    applyBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      this._onApplyEffects(applyBtn);
    });
  },

  /* -------------------------------------------- */
  /*  Apply Effects Handler                        */
  /* -------------------------------------------- */

  /**
   * Apply the spell's causedStatuses to all targets.
   * @param {HTMLElement} button
   */
  async _onApplyEffects(button) {
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;
    const isCrit = button.dataset.isCrit === 'true';
    const targets = JSON.parse(button.dataset.targets);
    const messageId = button.dataset.messageId;

    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications.error("Source actor not found.");
      return;
    }
    const spell = actor.items.get(itemId);
    if (!spell) {
      ui.notifications.error("Spell not found.");
      return;
    }

    // Only GM or owner can apply
    if (!actor.isOwner && !game.user.isGM) {
      ui.notifications.warn("You don't have permission to apply effects for this actor.");
      return;
    }

    if (targets.length === 0) {
      ui.notifications.warn("No targets to apply effects to.");
      return;
    }

    // Disable button immediately
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';

    // Gather statuses — override requiresDamage for effect-only spells.
    // On crit, critCausedStatuses OVERRIDES normal causedStatuses for the same
    // statusId (e.g., Color's Blinded changes from "focusing" to continual).
    const baseStatuses = (spell.system.causedStatuses || []).map(s => ({
      ...s,
      requiresDamage: false,
    }));

    let statuses;
    if (isCrit && spell.system.critCausedStatuses?.length) {
      // Build a map from normal statuses, then let crit entries override
      const statusMap = new Map();
      for (const s of baseStatuses) statusMap.set(s.statusId, s);
      for (const s of spell.system.critCausedStatuses) {
        statusMap.set(s.statusId, { ...s, requiresDamage: false });
      }
      statuses = [...statusMap.values()];
    } else {
      statuses = baseStatuses;
    }

    // Import system helpers
    const { StatusHelper } = await import("/systems/vagabond/module/helpers/status-helper.mjs");
    const { VagabondChatCard } = await import("/systems/vagabond/module/helpers/chat-card.mjs");

    // Resolve the caster's token for focusing tracking
    const casterToken = actor.getActiveTokens(true)[0];
    const casterTokenId = casterToken?.id || null;
    const sceneId = game.scenes?.active?.id || null;

    // Apply to each target
    for (const target of targets) {
      const targetActor = this._resolveTargetActor(target);
      if (!targetActor) {
        log("EffectOnly", `Could not resolve target actor: ${target.actorName}`);
        continue;
      }

      const results = await StatusHelper.processCausedStatuses(
        targetActor,
        statuses,
        false, // damageWasBlocked = false (no damage concept)
        spell.name,
        { sourceActorName: actor.name }
      );

      // Tag applied statuses with focusing metadata for auto-cleanup
      if (casterTokenId && sceneId) {
        for (const result of results) {
          if (result.outcome === 'applied') {
            const origEntry = statuses.find(s => s.statusId === result.statusId);
            if (origEntry?.duration === 'focusing') {
              await this._tagFocusingStatus(targetActor, result.statusId, casterTokenId, actorId, sceneId);
            }
          }
        }
      }

      // Post results to chat
      await VagabondChatCard.statusResults(results, targetActor, spell.name, spell.img);
    }

    // Update button to show completion
    button.innerHTML = '<i class="fas fa-check"></i> Effects Applied';
  },

  /* -------------------------------------------- */
  /*  Target Resolution                            */
  /* -------------------------------------------- */

  /**
   * Resolve a target actor from the targetsAtRollTime entry.
   * Handles both linked and unlinked tokens.
   * @param {Object} target - { tokenId, sceneId, actorId, actorName, actorImg }
   * @returns {Actor|null}
   */
  _resolveTargetActor(target) {
    // Try direct actor lookup first (linked tokens)
    const directActor = game.actors.get(target.actorId);
    if (directActor) return directActor;

    // Try via scene token (unlinked tokens)
    if (target.tokenId && target.sceneId) {
      const scene = game.scenes.get(target.sceneId);
      const tokenDoc = scene?.tokens.get(target.tokenId);
      if (tokenDoc?.actor) return tokenDoc.actor;
    }

    return null;
  },

  /* -------------------------------------------- */
  /*  Focusing Status Tracking                     */
  /* -------------------------------------------- */

  /**
   * Tag a status effect on a target with focusing metadata so it can be
   * auto-removed when the caster's turn starts and they aren't focusing.
   * @param {Actor} targetActor
   * @param {string} statusId
   * @param {string} casterTokenId
   * @param {string} casterActorId
   * @param {string} sceneId
   */
  async _tagFocusingStatus(targetActor, statusId, casterTokenId, casterActorId, sceneId) {
    const effect = targetActor.effects.find(e => !e.disabled && e.statuses?.has(statusId));
    if (!effect) return;

    await effect.setFlag(MODULE_ID, FLAG_EFFECT_ONLY, {
      casterTokenId,
      casterActorId,
      sceneId,
      appliedRound: game.combat?.round ?? null,
      appliedTurn: game.combat?.turn ?? null,
    });
  },

  /**
   * On round change, check for focusing statuses applied by effect-only spells
   * and remove them if the caster isn't focusing.
   *
   * Vagabond uses round-based combat (no per-combatant turns — combat.turn is
   * always null). So we trigger on round changes and check ALL casters at once.
   * @param {Combat} combat
   */
  async _cleanupFocusingStatuses(combat) {
    if (!("round" in (combat ?? {}))) return;

    // Collect all flagged effects from world actors + unlinked scene tokens
    const flaggedEffects = this._collectFlaggedEffects();
    if (flaggedEffects.length === 0) return;

    // Group by caster so we check focusing status once per caster
    const byCaster = new Map();
    for (const entry of flaggedEffects) {
      const key = entry.flagData.casterActorId;
      if (!byCaster.has(key)) byCaster.set(key, []);
      byCaster.get(key).push(entry);
    }

    const removals = [];
    for (const [casterActorId, entries] of byCaster) {
      const casterActor = game.actors.get(casterActorId);
      if (!casterActor) continue;

      // If the caster is focusing, keep all their effects alive
      const isFocusing = casterActor.effects.some(e => !e.disabled && e.statuses?.has("focusing"));
      if (isFocusing) continue;

      for (const entry of entries) {
        // Effect must have survived at least 1 full round
        const appliedRound = entry.flagData.appliedRound;
        if (appliedRound !== null && combat.round <= appliedRound) continue;

        removals.push(entry);
      }
    }

    if (removals.length === 0) return;

    for (const { actor: targetActor, effect, statusId } of removals) {
      log("EffectOnly", `Removing ${statusId} from ${targetActor.name} — caster not focusing`);
      await targetActor.toggleStatusEffect(statusId, { active: false });
    }

    const names = removals.map(r => `${r.statusId} on ${r.actor.name}`).join(", ");
    ui.notifications.info(`Effect expired (not focused): ${names}`);
  },

  /**
   * Gather all active effects with our effectOnlyApplied flag from both
   * world actors and unlinked tokens on the active scene.
   * @returns {Array<{actor, effect, statusId, flagData}>}
   */
  _collectFlaggedEffects() {
    const results = [];
    const seen = new Set();

    const scanActor = (actor) => {
      for (const effect of actor.effects) {
        if (seen.has(effect.uuid)) continue;
        const flagData = effect.getFlag(MODULE_ID, FLAG_EFFECT_ONLY);
        if (!flagData) continue;
        seen.add(effect.uuid);
        results.push({ actor, effect, statusId: [...effect.statuses][0], flagData });
      }
    };

    // World actors (linked tokens)
    for (const actor of game.actors) scanActor(actor);

    // Unlinked token actors on the active scene
    const scene = game.scenes.active;
    if (scene) {
      for (const tokenDoc of scene.tokens) {
        if (!tokenDoc.actor || tokenDoc.actorLink) continue;
        scanActor(tokenDoc.actor);
      }
    }

    return results;
  },
};
