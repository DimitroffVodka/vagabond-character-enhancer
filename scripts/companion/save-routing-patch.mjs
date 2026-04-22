import { MODULE_ID, log } from "../utils.mjs";
import { resolveSaveRoller } from "./save-routing.mjs";

/**
 * Given a target actor from the save loop, return the roller (controller PC
 * if flagged, else the target itself) and the damage recipient (always the
 * target). routingNote is set to a human-readable string when routing kicked
 * in, null otherwise.
 */
function _routeTarget(target) {
  const resolved = resolveSaveRoller(target);
  if (!resolved) return { saveRoller: target, damageTarget: target, routingNote: null };
  const { roller, skillLabel } = resolved;
  return {
    saveRoller: roller,
    damageTarget: target,
    routingNote: `via ${roller.name} (${skillLabel})`
  };
}

/**
 * Replacement for VagabondDamageHelper.handleSaveRoll.
 * Source: systems/vagabond/module/helpers/damage-helper.mjs:1434-1684 (v5.0.0).
 * CHANGES vs original:
 *   1. Permission check accepts ownership of target OR resolved controller.
 *   2. NPC rejection only fires for NPCs without controller flags.
 *   3. _rollSave uses the routed saveRoller.
 *   4. Difficulty and crit threshold read from saveRoller.
 *   5. Chat card subtitle appends routingNote when routed.
 * Everything else — Cleave split, attackerModifier, weakness, armor, autoApply,
 * statusContext, on-hit status processing — uses the original NPC (damageTarget).
 */
export async function patchedHandleSaveRoll(button, event = null) {
  // Resolve the damage helper class at call-time. Set on CONFIG.VAGABOND by the
  // install block in vagabond-character-enhancer.mjs (ready hook); fall back to
  // a fresh import if the install hasn't run.
  const DH = CONFIG.VAGABOND?._damageHelper
    ?? (await import("/systems/vagabond/module/helpers/damage-helper.mjs")).VagabondDamageHelper;

  const saveType = button.dataset.saveType;
  const damageAmount = parseInt(button.dataset.damageAmount);
  const damageType = button.dataset.damageType;
  const rollTermsData = JSON.parse(button.dataset.rollTerms.replace(/&quot;/g, '"'));
  const attackType = button.dataset.attackType;
  const actorId = button.dataset.actorId;
  const itemId = button.dataset.itemId;
  const attackWasCrit = button.dataset.attackWasCrit === 'true';
  const actionIndexRaw = button.dataset.actionIndex;
  const actionIdx = (actionIndexRaw !== '' && actionIndexRaw != null) ? parseInt(actionIndexRaw) : null;

  const storedTargets = DH._getTargetsFromButton(button);
  let actorsToRoll = [];

  if (!game.user.isGM) {
    if (storedTargets.length > 0) {
      const targetTokens = DH._resolveStoredTargets(storedTargets);
      actorsToRoll = targetTokens.map(t => t.actor).filter(a => {
        if (!a) return false;
        if (a.isOwner) return true;
        // (1) Accept if player owns the resolved controller.
        const resolved = resolveSaveRoller(a);
        return !!(resolved?.roller?.isOwner);
      });

      if (actorsToRoll.length === 0) {
        ui.notifications.warn('None of the targeted tokens belong to you.');
        return;
      }
    } else {
      const ownedCharacters = game.actors.filter(a => a.type === 'character' && a.isOwner);
      if (ownedCharacters.length === 1) {
        actorsToRoll = [ownedCharacters[0]];
      } else if (ownedCharacters.length > 1) {
        ui.notifications.warn('You have multiple characters. Please target the token you want to roll for.');
        return;
      } else {
        ui.notifications.warn('You do not own any characters to roll saves for.');
        return;
      }
    }
  } else {
    if (storedTargets.length === 0) {
      ui.notifications.warn('No tokens targeted. Please target at least one token.');
      return;
    }
    const targetTokens = DH._resolveStoredTargets(storedTargets);
    actorsToRoll = targetTokens.map(t => t.actor).filter(a => a);
  }

  const _saveSourceActor = actorId ? game.actors.get(actorId) : null;
  const _saveSourceItem = _saveSourceActor?.items.get(itemId);
  const _hasCleave = _saveSourceItem?.system?.properties?.includes('Cleave') ?? false;
  const _saveTargetCount = actorsToRoll.length;

  for (let _saveIdx = 0; _saveIdx < actorsToRoll.length; _saveIdx++) {
    const targetActor = actorsToRoll[_saveIdx];
    if (!targetActor) continue;

    // (1) Permission: allow if player owns target OR the resolved controller.
    const routedPreview = resolveSaveRoller(targetActor);
    const canPlayerRoll = targetActor.isOwner || !!routedPreview?.roller?.isOwner;
    if (!canPlayerRoll && !game.user.isGM) {
      ui.notifications.warn(`You don't have permission to roll saves for ${targetActor.name}.`);
      continue;
    }

    // (2) NPC rejection only when no controller.
    if (targetActor.type === 'npc' && !routedPreview) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Saves.NPCNoSaves'));
      continue;
    }

    // Route the roller after all gates.
    const { saveRoller, damageTarget, routingNote } = _routeTarget(targetActor);

    let effectiveDamageAmount = damageAmount;
    if (_hasCleave && _saveTargetCount > 1) {
      const base = Math.floor(damageAmount / _saveTargetCount);
      effectiveDamageAmount = base + (_saveIdx < (damageAmount % _saveTargetCount) ? 1 : 0);
    }

    // Hinder/attacker modifier uses the DAMAGE TARGET (the NPC) since armor,
    // conditions, and status resistances live there.
    const isHindered = DH._isSaveHindered(saveType, attackType, damageTarget);
    const sourceActor = actorId ? game.actors.get(actorId) : null;
    let effectiveAttackerModifier = sourceActor?.system?.outgoingSavesModifier || 'none';

    {
      const { StatusHelper } = await import('/systems/vagabond/module/helpers/status-helper.mjs');
      const sourceItem = sourceActor?.items.get(itemId);
      const itemEntries = sourceItem?.system?.causedStatuses ?? [];
      const actionEntries = (!sourceItem && actionIdx !== null && !isNaN(actionIdx))
        ? (sourceActor?.system?.actions?.[actionIdx]?.causedStatuses ?? [])
        : [];
      const passiveEntries = sourceActor
        ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
        : [];
      const allIncomingEntries = [...itemEntries, ...actionEntries, ...passiveEntries];
      const hasResistance = allIncomingEntries.some(e =>
        (e.saveType === saveType || e.saveType === 'any') && StatusHelper.isStatusResisted(damageTarget, e.statusId)
      );
      if (hasResistance) {
        if (effectiveAttackerModifier === 'hinder') effectiveAttackerModifier = 'none';
        else if (effectiveAttackerModifier === 'none') effectiveAttackerModifier = 'favor';
      }
    }

    const shiftKey = event?.shiftKey || false;
    const ctrlKey = event?.ctrlKey || false;

    // (3) Roll the save on the SAVE ROLLER.
    const saveRoll = await DH._rollSave(saveRoller, saveType, isHindered, shiftKey, ctrlKey, effectiveAttackerModifier);

    // (4) Difficulty and crit from SAVE ROLLER.
    const difficulty = saveRoller.system.saves?.[saveType]?.difficulty || 10;
    const isSuccess = saveRoll.total >= difficulty;
    const { VagabondChatCard } = await import('/systems/vagabond/module/helpers/chat-card.mjs');
    const { VagabondRollBuilder } = await import('/systems/vagabond/module/helpers/roll-builder.mjs');
    const critNumber = VagabondRollBuilder.calculateCritThreshold(saveRoller.getRollData(), saveType);
    const isCritical = VagabondChatCard.isRollCritical(saveRoll, critNumber);

    let damageAfterSave = effectiveDamageAmount;
    let saveReduction = 0;
    if (isSuccess) {
      if (_hasCleave && _saveTargetCount > 1 && damageAmount > 0) {
        const fullAfterSave = DH._removeHighestDie(rollTermsData);
        damageAfterSave = Math.floor(effectiveDamageAmount * (fullAfterSave / damageAmount));
      } else {
        damageAfterSave = DH._removeHighestDie(rollTermsData);
      }
      saveReduction = effectiveDamageAmount - damageAfterSave;
    }

    const sourceItem = sourceActor?.items.get(itemId);
    const baseAfterFinal = DH.calculateFinalDamage(damageTarget, damageAfterSave, damageType, sourceItem);
    const armorReduction = damageAfterSave - baseAfterFinal;
    let finalDamage = baseAfterFinal;
    const weaknessPreRolledSave = button.dataset.weaknessPreRolled === 'true';
    if (!weaknessPreRolledSave && DH._isWeakTo(damageTarget, damageType, sourceItem)) {
      const dieSize = DH._getDamageSourceDieSize(sourceItem, actionIdx, sourceActor);
      const weakRoll = new Roll(`1d${dieSize}`);
      await weakRoll.evaluate();
      finalDamage += weakRoll.total;
    }

    const autoApply = game.settings.get('vagabond', 'autoApplySaveDamage') && !isCritical;
    if (autoApply) {
      const currentHP = damageTarget.system.health?.value || 0;
      const newHP = Math.max(0, currentHP - finalDamage);
      await damageTarget.update({ 'system.health.value': newHP });
    }

    const { StatusHelper } = await import('/systems/vagabond/module/helpers/status-helper.mjs');
    const coatingEntries = (sourceItem?.system?.coating?.charges > 0)
      ? (sourceItem.system.coating.causedStatuses ?? [])
      : [];
    const normalEntries = sourceItem?.system?.causedStatuses?.length
      ? sourceItem.system.causedStatuses
      : (actionIdx !== null && !isNaN(actionIdx) && sourceActor?.system?.actions?.[actionIdx]?.causedStatuses?.length)
        ? sourceActor.system.actions[actionIdx].causedStatuses
        : [];
    const critEntries = attackWasCrit
      ? (sourceItem?.system?.critCausedStatuses?.length
          ? sourceItem.system.critCausedStatuses
          : (actionIdx !== null && !isNaN(actionIdx) && sourceActor?.system?.actions?.[actionIdx]?.critCausedStatuses?.length)
            ? sourceActor.system.actions[actionIdx].critCausedStatuses
            : [])
      : [];
    const mergedEntries = attackWasCrit
      ? [...critEntries, ...normalEntries.filter(e => !critEntries.some(c => c.statusId === e.statusId))]
      : normalEntries;
    const passiveEntries = sourceActor
      ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
      : [];
    const allStatusEntries = [...mergedEntries, ...coatingEntries, ...passiveEntries];

    const statusContext = allStatusEntries.length > 0 ? {
      sourceActorId:    actorId,
      sourceItemId:     itemId,
      sourceActionIndex: actionIdx,
      saveType,
      saveSuccess:      isSuccess,
      saveDifficulty:   difficulty,
      saveTotal:        saveRoll.total,
      attackWasCrit,
    } : null;

    // (5) Chat card: attribute to damageTarget (the NPC), append routingNote.
    const saveMessage = await DH._postSaveResult(
      damageTarget,
      saveType,
      saveRoll,
      difficulty,
      isSuccess,
      isCritical,
      isHindered,
      effectiveDamageAmount,
      saveReduction,
      armorReduction,
      finalDamage,
      damageType,
      autoApply,
      autoApply ? null : statusContext
    );
    if (routingNote && saveMessage) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(saveMessage.content || "", "text/html");
        // Find the best injection point: prefer .header-info, fall back to .header-title's parent.
        const anchor = doc.querySelector(".header-info")
          ?? doc.querySelector(".header-title")?.parentElement
          ?? doc.querySelector(".vagabond-chat-card-v2");
        if (anchor) {
          const note = doc.createElement("div");
          note.className = "vce-routing-note";
          note.textContent = routingNote; // textContent auto-escapes
          anchor.appendChild(note);
          const patched = doc.body.innerHTML;
          if (patched && patched !== saveMessage.content) {
            await saveMessage.update({ content: patched });
          }
        }
      } catch (e) {
        log("save-routing: failed to inject routing note", e);
      }
    }

    if (autoApply && allStatusEntries.length > 0) {
      const damageWasBlocked = finalDamage === 0;
      const preRolledSave = {
        saveType, roll: saveRoll, total: saveRoll.total, success: isSuccess, difficulty,
      };
      const sourceActorTokenName1 = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
      const statusResults = await StatusHelper.processCausedStatuses(
        damageTarget, allStatusEntries, damageWasBlocked, sourceItem?.name ?? '', { preRolledSave, sourceActorName: sourceActorTokenName1 }
      );
      if (coatingEntries.length > 0) {
        await sourceItem.update({
          'system.coating.charges': 0,
          'system.coating.sourceName': '',
          'system.coating.causedStatuses': [],
        });
      }
      await VagabondChatCard.statusResults(statusResults, damageTarget, sourceItem?.name ?? '', sourceItem?.img ?? null);
    }
  }
}

/**
 * Replacement for VagabondDamageHelper.handleSaveReminderRoll.
 * Source: systems/vagabond/module/helpers/damage-helper.mjs:1691-1852 (v5.0.0).
 * Same CHANGES as patchedHandleSaveRoll.
 */
export async function patchedHandleSaveReminderRoll(button, event = null) {
  // Resolve the damage helper class at call-time. Set on CONFIG.VAGABOND by the
  // install block in vagabond-character-enhancer.mjs (ready hook); fall back to
  // a fresh import if the install hasn't run.
  const DH = CONFIG.VAGABOND?._damageHelper
    ?? (await import("/systems/vagabond/module/helpers/damage-helper.mjs")).VagabondDamageHelper;

  const saveType = button.dataset.saveType;
  const attackType = button.dataset.attackType;
  const actorId = button.dataset.actorId;
  const itemId = button.dataset.itemId;
  const actionIndexRaw = button.dataset.actionIndex;
  const actionIdx = (actionIndexRaw !== '' && actionIndexRaw != null) ? parseInt(actionIndexRaw) : null;

  const storedTargets = DH._getTargetsFromButton(button);
  let actorsToRoll = [];

  if (!game.user.isGM) {
    if (storedTargets.length > 0) {
      const targetTokens = DH._resolveStoredTargets(storedTargets);
      actorsToRoll = targetTokens.map(t => t.actor).filter(a => {
        if (!a) return false;
        if (a.isOwner) return true;
        const resolved = resolveSaveRoller(a);
        return !!(resolved?.roller?.isOwner);
      });
      if (actorsToRoll.length === 0) {
        ui.notifications.warn('None of the targeted tokens belong to you.');
        return;
      }
    } else {
      const ownedCharacters = game.actors.filter(a => a.type === 'character' && a.isOwner);
      if (ownedCharacters.length === 1) {
        actorsToRoll = [ownedCharacters[0]];
      } else if (ownedCharacters.length > 1) {
        ui.notifications.warn('You have multiple characters. Please target the token you want to roll for.');
        return;
      } else {
        ui.notifications.warn('You do not own any characters to roll saves for.');
        return;
      }
    }
  } else {
    if (storedTargets.length === 0) {
      ui.notifications.warn('No tokens targeted. Please target at least one token.');
      return;
    }
    const targetTokens = DH._resolveStoredTargets(storedTargets);
    actorsToRoll = targetTokens.map(t => t.actor).filter(a => a);
  }

  for (const targetActor of actorsToRoll) {
    if (!targetActor) continue;

    const routedPreview = resolveSaveRoller(targetActor);
    const canPlayerRoll = targetActor.isOwner || !!routedPreview?.roller?.isOwner;
    if (!canPlayerRoll && !game.user.isGM) {
      ui.notifications.warn(`You don't have permission to roll saves for ${targetActor.name}.`);
      continue;
    }
    if (targetActor.type === 'npc' && !routedPreview) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Saves.NPCNoSaves'));
      continue;
    }

    const { saveRoller, damageTarget, routingNote } = _routeTarget(targetActor);

    const isHindered = DH._isSaveHindered(saveType, attackType, damageTarget);
    const sourceActor = actorId ? game.actors.get(actorId) : null;
    let effectiveAttackerModifier2 = sourceActor?.system?.outgoingSavesModifier || 'none';

    {
      const { StatusHelper } = await import('/systems/vagabond/module/helpers/status-helper.mjs');
      const sourceItem = sourceActor?.items.get(itemId);
      const itemEntries = sourceItem?.system?.causedStatuses ?? [];
      const actionEntries = (!sourceItem && actionIdx !== null && !isNaN(actionIdx))
        ? (sourceActor?.system?.actions?.[actionIdx]?.causedStatuses ?? [])
        : [];
      const passiveEntries = sourceActor
        ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
        : [];
      const allIncomingEntries = [...itemEntries, ...actionEntries, ...passiveEntries];
      const hasResistance = allIncomingEntries.some(e =>
        (e.saveType === saveType || e.saveType === 'any') && StatusHelper.isStatusResisted(damageTarget, e.statusId)
      );
      if (hasResistance) {
        if (effectiveAttackerModifier2 === 'hinder') effectiveAttackerModifier2 = 'none';
        else if (effectiveAttackerModifier2 === 'none') effectiveAttackerModifier2 = 'favor';
      }
    }

    const shiftKey = event?.shiftKey || false;
    const ctrlKey = event?.ctrlKey || false;

    const saveRoll = await DH._rollSave(saveRoller, saveType, isHindered, shiftKey, ctrlKey, effectiveAttackerModifier2);

    const difficulty = saveRoller.system.saves?.[saveType]?.difficulty || 10;
    const isSuccess = saveRoll.total >= difficulty;
    const { VagabondChatCard } = await import('/systems/vagabond/module/helpers/chat-card.mjs');
    const { VagabondRollBuilder } = await import('/systems/vagabond/module/helpers/roll-builder.mjs');
    const critNumber = VagabondRollBuilder.calculateCritThreshold(saveRoller.getRollData(), saveType);
    const isCritical = VagabondChatCard.isRollCritical(saveRoll, critNumber);

    const saveMessage = await DH._postSaveReminderResult(
      damageTarget, saveType, saveRoll, difficulty, isSuccess, isCritical, isHindered
    );
    if (routingNote && saveMessage) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(saveMessage.content || "", "text/html");
        // Find the best injection point: prefer .header-info, fall back to .header-title's parent.
        const anchor = doc.querySelector(".header-info")
          ?? doc.querySelector(".header-title")?.parentElement
          ?? doc.querySelector(".vagabond-chat-card-v2");
        if (anchor) {
          const note = doc.createElement("div");
          note.className = "vce-routing-note";
          note.textContent = routingNote; // textContent auto-escapes
          anchor.appendChild(note);
          const patched = doc.body.innerHTML;
          if (patched && patched !== saveMessage.content) {
            await saveMessage.update({ content: patched });
          }
        }
      } catch (e) {
        log("save-routing: failed to inject routing note", e);
      }
    }

    const sourceItem = sourceActor?.items.get(itemId);
    const coatingEntries = (sourceItem?.system?.coating?.charges > 0)
      ? (sourceItem.system.coating.causedStatuses ?? [])
      : [];
    const itemNormalEntries = sourceItem?.system?.causedStatuses ?? [];
    const actionCausedStatuses = (!sourceItem && actionIdx !== null && !isNaN(actionIdx))
      ? (sourceActor?.system?.actions?.[actionIdx]?.causedStatuses ?? [])
      : [];
    const passiveEntries2 = sourceActor
      ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
      : [];
    const allStatusEntries = [...itemNormalEntries, ...coatingEntries, ...actionCausedStatuses, ...passiveEntries2];
    if (allStatusEntries.length > 0) {
      const { StatusHelper } = await import('/systems/vagabond/module/helpers/status-helper.mjs');
      const preRolledSave = { saveType, roll: saveRoll, total: saveRoll.total, success: isSuccess, difficulty };
      const sourceName = sourceItem?.name ?? (actionIdx !== null ? sourceActor?.system?.actions?.[actionIdx]?.name : '') ?? '';
      const sourceActorTokenName2 = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
      const statusResults = await StatusHelper.processCausedStatuses(
        damageTarget, allStatusEntries, false, sourceName, { preRolledSave, sourceActorName: sourceActorTokenName2 }
      );
      if (coatingEntries.length > 0) {
        await sourceItem.update({
          'system.coating.charges': 0,
          'system.coating.sourceName': '',
          'system.coating.causedStatuses': [],
        });
      }
      await VagabondChatCard.statusResults(statusResults, damageTarget, sourceName, sourceItem?.img ?? null);
    }
  }
}
