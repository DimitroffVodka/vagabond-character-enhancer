# Friendly NPC Saves — Route to Controller PC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let friendly NPCs (summons, familiars, hirelings) roll Reflex/Endure/Will saves from chat-card buttons by routing the roll onto a controller PC's save formula while keeping damage application on the NPC.

**Architecture:** Two actor flags on each flagged NPC (`controllerActorId` + `controllerType` where type is `companion` or `hireling`). VCE replaces `VagabondDamageHelper.handleSaveRoll` and `handleSaveReminderRoll` with patched copies that split actor references: the save rolls on the controller PC (full stat/favor/hinder/luck stack), but Cleave split, weakness, armor, and HP updates stay on the NPC. Summoner and Familiar auto-stamp flags at token placement. Hirelings get flags via a manual "Set Save Controller…" dialog, reachable from an NPC sheet header button. Chat attribution shows both names ("Drako rolls Reflex for Zombie (Mysticism)"). Unflagged NPCs fall through to the original "NPCs don't roll saves" warning.

**Tech Stack:** FoundryVTT v13 module, ES modules, ApplicationV2 dialogs, system's `VagabondDamageHelper` (static class monkey-patched), existing `gmRequest` socket relay for GM-proxied writes. No test framework — verification is manual in a live Foundry world.

---

## File Structure

**New:**
- `scripts/companion/save-routing.mjs` — flag schema, read/write/resolve helpers
- `scripts/companion/controller-dialog.mjs` — ApplicationV2 dialog for "Set Save Controller…"
- `scripts/companion/save-routing-patch.mjs` — replacement `handleSaveRoll` and `handleSaveReminderRoll` methods

**Modified:**
- `scripts/vagabond-character-enhancer.mjs` — import new module, install patch in `ready` hook, inject NPC sheet header button
- `scripts/class-features/summoner.mjs` — stamp controller flags after `placeToken`
- `scripts/perk-features/familiar.mjs` — stamp controller flags after `placeToken`
- `scripts/socket-relay.mjs` — add `setActorFlag` op (player-triggered, GM-proxied) for stamping flags on GM-owned actor
- `module.json` — bump version
- `CHANGELOG.md` — note the feature

---

## Design Reference

### Flag schema (on the friendly NPC actor)

```
flags.vagabond-character-enhancer.controllerActorId  // string: PC actor id
flags.vagabond-character-enhancer.controllerType     // "companion" | "hireling"
```

`controllerSkill` is derived from `controllerType` at read-time (`companion → "mana"`, `hireling → "leadership"`) — no separate flag needed.

### Routing rules (settled in brainstorm)

| Target | Save rolls on | Skill (label only) | Damage hits |
|---|---|---|---|
| `character` actor | self | n/a | self |
| `npc` with `controllerType: "companion"` | controller PC | controller's Mana Skill | NPC |
| `npc` with `controllerType: "hireling"` | controller PC | controller's Leadership | NPC |
| `npc` with no flags | — (warning) | — | — |

### Deferred (future work, DO NOT implement now)

- Per-round "commanded" state for hirelings
- `floor(Presence / 2)` hireling cap
- Auto-fail chat card for uncommanded hirelings
- Leaderships's Move-skip / Action cost tracking

---

## Task 0: Flag helper module

**Goal:** Centralized read/write/resolve helpers for the controller flags. One source of truth for flag keys, type values, and controller resolution.

**Files:**
- Create: `scripts/companion/save-routing.mjs`

**Acceptance Criteria:**
- [ ] Constants exported for flag keys and type values.
- [ ] `getController(actor)` returns `{ actorId, type }` or `null`.
- [ ] `resolveSaveRoller(npcActor)` returns `{ roller, type, skill, skillLabel }` or `null` when no controller PC is resolvable (e.g., deleted actor, missing flag).
- [ ] `setController(actor, { controllerId, type })` and `clearController(actor)` write/remove both flags atomically.
- [ ] Console-verifiable from Foundry: `import("/modules/vagabond-character-enhancer/scripts/companion/save-routing.mjs")` then call helpers.

**Verify:** In Foundry console on a test world:
```js
const { setController, getController, resolveSaveRoller, clearController } =
  await import("/modules/vagabond-character-enhancer/scripts/companion/save-routing.mjs");
const pc = game.actors.getName("Drako");
const npc = game.actors.getName("Test Zombie");
await setController(npc, { controllerId: pc.id, type: "companion" });
console.log(getController(npc));            // { actorId: pc.id, type: "companion" }
console.log(resolveSaveRoller(npc));        // { roller: pc, type, skill: "mana", skillLabel: "Mysticism" }
await clearController(npc);
console.log(getController(npc));            // null
```
Expected: logs match the comments above.

**Steps:**

- [ ] **Step 1: Create the module file**

Write `scripts/companion/save-routing.mjs`:

```js
import { MODULE_ID } from "../utils.mjs";

export const FLAG_CONTROLLER_ACTOR = "controllerActorId";
export const FLAG_CONTROLLER_TYPE  = "controllerType";

export const CONTROLLER_TYPES = Object.freeze({
  COMPANION: "companion",
  HIRELING: "hireling"
});

const SKILL_BY_TYPE = Object.freeze({
  [CONTROLLER_TYPES.COMPANION]: "mana",
  [CONTROLLER_TYPES.HIRELING]:  "leadership"
});

/**
 * Read controller flags from an actor. Returns null if either flag is missing.
 * @param {Actor} actor
 * @returns {{ actorId: string, type: "companion" | "hireling" } | null}
 */
export function getController(actor) {
  if (!actor) return null;
  const actorId = actor.getFlag(MODULE_ID, FLAG_CONTROLLER_ACTOR);
  const type    = actor.getFlag(MODULE_ID, FLAG_CONTROLLER_TYPE);
  if (!actorId || !type) return null;
  if (type !== CONTROLLER_TYPES.COMPANION && type !== CONTROLLER_TYPES.HIRELING) return null;
  return { actorId, type };
}

/**
 * Resolve controller into a roller with skill metadata. Returns null if the
 * controller actor no longer exists or the NPC isn't flagged.
 * @param {Actor} npcActor
 * @returns {{ roller: Actor, type: string, skill: "mana" | "leadership", skillLabel: string } | null}
 */
export function resolveSaveRoller(npcActor) {
  const ctrl = getController(npcActor);
  if (!ctrl) return null;
  const roller = game.actors.get(ctrl.actorId);
  if (!roller) return null;

  const skill = SKILL_BY_TYPE[ctrl.type];
  let skillLabel = skill === "leadership" ? "Leadership" : "Mysticism";
  if (skill === "mana") {
    // Prefer the PC's configured mana skill for the attribution label.
    const key = roller.system?.attributes?.manaSkill;
    const cfgLabel = key ? CONFIG.VAGABOND?.skills?.[key] : null;
    if (cfgLabel) skillLabel = game.i18n.localize(cfgLabel) || skillLabel;
  }

  return { roller, type: ctrl.type, skill, skillLabel };
}

/**
 * Write both controller flags. The caller is responsible for GM-proxying if
 * the current user lacks OWNER on the target actor (see socket-relay.mjs).
 * @param {Actor} actor
 * @param {{ controllerId: string, type: "companion" | "hireling" }} opts
 */
export async function setController(actor, { controllerId, type }) {
  if (!actor) throw new Error("setController: actor is required");
  if (!controllerId) throw new Error("setController: controllerId is required");
  if (type !== CONTROLLER_TYPES.COMPANION && type !== CONTROLLER_TYPES.HIRELING) {
    throw new Error(`setController: invalid type "${type}"`);
  }
  await actor.setFlag(MODULE_ID, FLAG_CONTROLLER_ACTOR, controllerId);
  await actor.setFlag(MODULE_ID, FLAG_CONTROLLER_TYPE, type);
}

/**
 * Remove both controller flags.
 * @param {Actor} actor
 */
export async function clearController(actor) {
  if (!actor) return;
  await actor.unsetFlag(MODULE_ID, FLAG_CONTROLLER_ACTOR);
  await actor.unsetFlag(MODULE_ID, FLAG_CONTROLLER_TYPE);
}
```

- [ ] **Step 2: Manual console verification**

Load the module file in Foundry (reload the world after writing), open console, paste the `Verify` block above.
Expected: each `console.log` returns the value indicated in its trailing comment.

- [ ] **Step 3: Commit**

```bash
git add scripts/companion/save-routing.mjs
git commit -m "feat(companion): add controller flag helpers for save routing"
```

---

## Task 1: Extend socket-relay with setActorFlag op

**Goal:** Allow player-triggered writes to flags on GM-owned actors (needed for auto-stamping controller flags on summoned NPCs when the player doesn't own the actor). Keeps the existing pattern of GM-proxied operations used by token placement and actor import.

**Files:**
- Modify: `scripts/socket-relay.mjs`

**Acceptance Criteria:**
- [ ] `gmRequest("setActorFlag", { actorId, scope, key, value })` returns a resolved promise when the GM client completes the flag write.
- [ ] Rejects with a clear error when `actorId` doesn't resolve.
- [ ] Works for both linked and unlinked world actors.
- [ ] The handler only accepts writes from the `vagabond-character-enhancer` module scope (don't let players write to arbitrary module flag scopes).

**Verify:** In Foundry console as a PLAYER:
```js
const { gmRequest } = await import("/modules/vagabond-character-enhancer/scripts/socket-relay.mjs");
const npc = game.actors.getName("Test Zombie");  // owned by GM only
await gmRequest("setActorFlag", {
  actorId: npc.id,
  scope: "vagabond-character-enhancer",
  key: "controllerActorId",
  value: "TEST123"
});
console.log(npc.getFlag("vagabond-character-enhancer", "controllerActorId"));
// → "TEST123"
```
Expected: the flag is written even though the player doesn't own the NPC.

**Steps:**

- [ ] **Step 1: Read the existing socket-relay.mjs** to locate the op handler registration pattern (look for `placeToken`, `deleteActor`, `importActor` ops) and identify the dispatcher.

- [ ] **Step 2: Add the handler**

In the op dispatcher on the GM side, add:
```js
case "setActorFlag": {
  const { actorId, scope, key, value } = data;
  if (scope !== "vagabond-character-enhancer") {
    throw new Error(`setActorFlag: refused scope "${scope}"`);
  }
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`setActorFlag: actor "${actorId}" not found`);
  if (value === null || value === undefined) {
    await actor.unsetFlag(scope, key);
  } else {
    await actor.setFlag(scope, key, value);
  }
  return { ok: true };
}
```

- [ ] **Step 3: Manual verification** — run the `Verify` block above as a player client. Confirm the flag lands on the world actor.

- [ ] **Step 4: Commit**

```bash
git add scripts/socket-relay.mjs
git commit -m "feat(socket-relay): add setActorFlag op for GM-proxied flag writes"
```

---

## Task 2: Save-routing patch module (replacement handlers)

**Goal:** Provide drop-in replacements for `VagabondDamageHelper.handleSaveRoll` and `handleSaveReminderRoll` that route flagged NPCs through their controller PC for the save roll while preserving damage application on the NPC.

**Files:**
- Create: `scripts/companion/save-routing-patch.mjs`

**Acceptance Criteria:**
- [ ] Exports `patchedHandleSaveRoll(button, event)` and `patchedHandleSaveReminderRoll(button, event)`.
- [ ] For targets with no controller flags, behavior is identical to the system methods (including the "NPCs don't roll saves" warning).
- [ ] For flagged NPCs, the save roll uses the controller's actor (gets their favor/hinder/luck/stat). Difficulty and crit threshold come from the controller. All damage calculations (Cleave split, weakness, armor, HP) still use the NPC. Chat card attribution shows the NPC as the subject with a "via [Controller name] ([SkillLabel])" suffix.
- [ ] Permission check accepts ownership of EITHER the NPC target OR the resolved controller PC.
- [ ] Status effects triggered by the save (e.g., poison from a weapon) still apply to the NPC, not the controller.

**Verify:** After Task 3 installs the patch in `ready`, run this scenario in Foundry: cast or attack a friendly summon, click Reflex/Endure/Will on the save chat card → expect roll attributed to the PC caster, damage applied to the NPC's HP, chat card subtitle showing both names.

**Steps:**

- [ ] **Step 1: Create the patch file with the replacement handlers**

The two methods are ~250 lines each in the system. Rather than duplicate them verbatim, we refactor around a shared helper `_routeTarget(target)` that returns `{ saveRoller, damageTarget, routingNote }` and adjust only the three points that care about identity (`_rollSave` call, difficulty read, crit threshold read).

Write `scripts/companion/save-routing-patch.mjs`:

```js
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
  const DH = CONFIG.VAGABOND?._damageHelper ?? globalThis.VagabondDamageHelper;
  // ^ resolve the class at call-time (see Task 3 for where it's attached)

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
      // Append the routing note into the card flavor/subtitle by editing the
      // posted message content. Minimally invasive vs full card re-render.
      try {
        const patched = (saveMessage.content || '').replace(
          /(<div class="card-title"[^>]*>[^<]*<\/div>)/,
          `$1<div class="card-subtitle vce-routing-note">${foundry.utils.escapeHTML ? foundry.utils.escapeHTML(routingNote) : routingNote}</div>`
        );
        if (patched !== saveMessage.content) {
          await saveMessage.update({ content: patched });
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
  const DH = CONFIG.VAGABOND?._damageHelper ?? globalThis.VagabondDamageHelper;

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
        const patched = (saveMessage.content || '').replace(
          /(<div class="card-title"[^>]*>[^<]*<\/div>)/,
          `$1<div class="card-subtitle vce-routing-note">${foundry.utils.escapeHTML ? foundry.utils.escapeHTML(routingNote) : routingNote}</div>`
        );
        if (patched !== saveMessage.content) {
          await saveMessage.update({ content: patched });
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
```

**Note on dynamic imports:** the `/systems/vagabond/...` paths above are what ES modules use in Foundry v13 for cross-module imports. If the VCE codebase already imports system helpers via a different path convention, match that convention — grep for an existing `await import(".../helpers/status-helper.mjs")` in VCE and copy its path style.

- [ ] **Step 2: Commit (patch module only — installation comes in Task 3)**

```bash
git add scripts/companion/save-routing-patch.mjs
git commit -m "feat(companion): add patched save handlers that route flagged NPCs to controller"
```

---

## Task 3: Install the patch in the ready hook

**Goal:** Replace the system's `handleSaveRoll` and `handleSaveReminderRoll` with the patched versions at module load.

**Files:**
- Modify: `scripts/vagabond-character-enhancer.mjs` (the `ready` hook — look for the block where other system methods are monkey-patched)

**Acceptance Criteria:**
- [ ] After module load, `VagabondDamageHelper.handleSaveRoll === patchedHandleSaveRoll`.
- [ ] Save buttons on damage chat cards for **character** actors work exactly as before (no regression).
- [ ] Save buttons on cards for flagged NPCs roll on the controller PC and hit the NPC's HP.
- [ ] Save buttons on cards for unflagged NPCs still show "NPCs don't roll saves."

**Verify:** In Foundry, load the module, open console:
```js
VagabondDamageHelper.handleSaveRoll.name
// → "patchedHandleSaveRoll"
```
Then run the smoke test scenario from Task 2's Verify.

**Steps:**

- [ ] **Step 1: Read the existing `ready` hook** in `scripts/vagabond-character-enhancer.mjs` to find where other system methods are patched (search for `VagabondDamageHelper` or `_rollSave`).

- [ ] **Step 2: Add the imports near the top of the file**

```js
import { patchedHandleSaveRoll, patchedHandleSaveReminderRoll } from "./companion/save-routing-patch.mjs";
```

- [ ] **Step 3: Add the install block inside the `ready` hook**, after any existing `VagabondDamageHelper` patching:

```js
// Route friendly NPC saves through their controller PC.
// See scripts/companion/save-routing.mjs for the flag schema.
try {
  const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");
  // Stash a reference for the patch to reach the class from CONFIG.VAGABOND,
  // since the patch runs in a different module scope.
  CONFIG.VAGABOND = CONFIG.VAGABOND || {};
  CONFIG.VAGABOND._damageHelper = VagabondDamageHelper;
  VagabondDamageHelper.handleSaveRoll = patchedHandleSaveRoll;
  VagabondDamageHelper.handleSaveReminderRoll = patchedHandleSaveReminderRoll;
  log("save-routing: patched handleSaveRoll + handleSaveReminderRoll");
} catch (e) {
  console.error("[VCE] save-routing: failed to install save-routing patches", e);
}
```

- [ ] **Step 4: Smoke test in Foundry**

1. Reload the world.
2. Open console, confirm `VagabondDamageHelper.handleSaveRoll.name === "patchedHandleSaveRoll"`.
3. Have a PC attack an unflagged test NPC → click Reflex → should see "NPCs don't roll saves." (regression check)
4. Manually stamp flags via `setController(npcActor, { controllerId: pcActor.id, type: "companion" })`.
5. Attack the flagged NPC → click Reflex → should see the save roll attributed to the PC (chat card subject = NPC, subtitle = "via [PC name] ([skill label])"); NPC's HP takes the damage after save.

- [ ] **Step 5: Commit**

```bash
git add scripts/vagabond-character-enhancer.mjs
git commit -m "feat(companion): install save-routing patches in ready hook"
```

---

## Task 4: "Set Save Controller…" dialog + sheet header button

**Goal:** Manual UX for GMs (and players on their owned NPCs) to stamp controller flags. Needed for hirelings and any NPC that isn't auto-stamped by summoner/familiar.

**Files:**
- Create: `scripts/companion/controller-dialog.mjs`
- Modify: `scripts/vagabond-character-enhancer.mjs` (hook `getHeaderControlsActorSheetV2` to inject the button)

**Acceptance Criteria:**
- [ ] NPC sheet header has a button labeled "Set Save Controller…".
- [ ] Clicking opens an ApplicationV2 dialog with: (a) a PC dropdown showing all `character` actors, (b) a radio group with `Companion` and `Hireling`, (c) Save and Clear buttons.
- [ ] Dialog pre-fills with current flags if set.
- [ ] Save writes both flags via `setController`. If the user lacks OWNER on the NPC, fall back to `gmRequest("setActorFlag", ...)` for each write.
- [ ] Clear removes both flags via `clearController` (same GM fallback).
- [ ] Button is hidden on character actors (only shows for `type === 'npc'`).

**Verify:**
1. Open a non-character NPC actor sheet → see the button.
2. Click → dialog opens.
3. Pick a PC, select Companion, Save → close dialog → reopen → dropdown shows the PC, Companion still selected.
4. Click Clear → close → reopen → no selection.
5. Open a character actor sheet → button NOT present.

**Steps:**

- [ ] **Step 1: Create the dialog**

Write `scripts/companion/controller-dialog.mjs`:

```js
import { MODULE_ID } from "../utils.mjs";
import { getController, setController, clearController, CONTROLLER_TYPES } from "./save-routing.mjs";
import { gmRequest } from "../socket-relay.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ControllerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vce-controller-dialog-{id}",
    tag: "form",
    window: { title: "Set Save Controller", icon: "fas fa-people-arrows", resizable: false },
    position: { width: 360, height: "auto" },
    form: { handler: ControllerDialog.#onSave, closeOnSubmit: true },
    actions: { clear: ControllerDialog.#onClear }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/controller-dialog.hbs` }
  };

  constructor(npcActor, options = {}) {
    super(options);
    this.npcActor = npcActor;
  }

  _prepareContext() {
    const current = getController(this.npcActor) ?? {};
    return {
      npcName: this.npcActor.name,
      current,
      pcChoices: game.actors.filter(a => a.type === 'character').map(a => ({ id: a.id, name: a.name })),
      types: [
        { value: CONTROLLER_TYPES.COMPANION, label: "Companion (Mana Skill)", checked: current.type === CONTROLLER_TYPES.COMPANION },
        { value: CONTROLLER_TYPES.HIRELING,  label: "Hireling (Leadership)", checked: current.type === CONTROLLER_TYPES.HIRELING }
      ]
    };
  }

  static async #onSave(event, form, formData) {
    const data = formData.object;
    const controllerId = data.controllerId;
    const type = data.controllerType;
    if (!controllerId || !type) {
      ui.notifications.warn("Pick a controller PC and a type.");
      return;
    }
    const app = this; // form handler binds to application instance in V2
    if (app.npcActor.isOwner) {
      await setController(app.npcActor, { controllerId, type });
    } else {
      await gmRequest("setActorFlag", { actorId: app.npcActor.id, scope: MODULE_ID, key: "controllerActorId", value: controllerId });
      await gmRequest("setActorFlag", { actorId: app.npcActor.id, scope: MODULE_ID, key: "controllerType",    value: type });
    }
    ui.notifications.info(`Save controller set for ${app.npcActor.name}.`);
  }

  static async #onClear(event, target) {
    const app = this;
    if (app.npcActor.isOwner) {
      await clearController(app.npcActor);
    } else {
      await gmRequest("setActorFlag", { actorId: app.npcActor.id, scope: MODULE_ID, key: "controllerActorId", value: null });
      await gmRequest("setActorFlag", { actorId: app.npcActor.id, scope: MODULE_ID, key: "controllerType",    value: null });
    }
    ui.notifications.info(`Save controller cleared for ${app.npcActor.name}.`);
    await app.close();
  }
}
```

- [ ] **Step 2: Create the template**

Write `templates/controller-dialog.hbs`:

```hbs
<div class="vce-controller-dialog" style="display:flex;flex-direction:column;gap:0.75rem;padding:0.5rem;">
  <p>Configure save routing for <strong>{{npcName}}</strong>.</p>

  <div class="form-group">
    <label for="vce-controller-pc">Controller PC</label>
    <select id="vce-controller-pc" name="controllerId">
      <option value="">— Select —</option>
      {{#each pcChoices}}
        <option value="{{id}}" {{#if (eq id ../current.actorId)}}selected{{/if}}>{{name}}</option>
      {{/each}}
    </select>
  </div>

  <fieldset class="form-group">
    <legend>Type</legend>
    {{#each types}}
      <label><input type="radio" name="controllerType" value="{{value}}" {{#if checked}}checked{{/if}}> {{label}}</label>
    {{/each}}
  </fieldset>

  <footer style="display:flex;justify-content:space-between;gap:0.5rem;">
    <button type="button" data-action="clear"><i class="fas fa-trash"></i> Clear</button>
    <button type="submit"><i class="fas fa-save"></i> Save</button>
  </footer>
</div>
```

- [ ] **Step 3: Inject the NPC sheet header button**

In `scripts/vagabond-character-enhancer.mjs`, inside the `ready` hook or a separate `init` hook as appropriate:

```js
Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  const actor = app.document;
  if (!actor || actor.type !== "npc") return;
  controls.unshift({
    icon: "fas fa-people-arrows",
    action: "vce-set-save-controller",
    label: "Set Save Controller…",
    onClick: async () => {
      const { ControllerDialog } = await import("./companion/controller-dialog.mjs");
      new ControllerDialog(actor).render(true);
    }
  });
});
```

- [ ] **Step 4: Smoke test** per the Verify block.

- [ ] **Step 5: Commit**

```bash
git add scripts/companion/controller-dialog.mjs templates/controller-dialog.hbs scripts/vagabond-character-enhancer.mjs
git commit -m "feat(companion): add Set Save Controller dialog + NPC sheet button"
```

---

## Task 5: Auto-stamp flags from summoner placement

**Goal:** When Summoner's `conjureSummon` places a token, stamp `controllerActorId` + `controllerType: "companion"` on the summon's actor so saves route to the summoner automatically.

**Files:**
- Modify: `scripts/class-features/summoner.mjs` (near line 964, right after `tokenId = result.tokenId;`)

**Acceptance Criteria:**
- [ ] After a successful summon, `tokenDocument.actor.getFlag(MODULE_ID, "controllerActorId") === summonerActor.id`.
- [ ] `controllerType` flag is `"companion"`.
- [ ] Works for both linked and unlinked token setups (unlinked summons use a delta; GM-proxy path handles the write).
- [ ] No regression: if flag stamping fails, the summon still exists (fail soft, warn).

**Verify:** In Foundry, summon a creature via the Summoner codex. Click the summoned token → console:
```js
const t = canvas.tokens.controlled[0];
t.actor.getFlag("vagabond-character-enhancer", "controllerActorId")
// → summoner's actor id
t.actor.getFlag("vagabond-character-enhancer", "controllerType")
// → "companion"
```

**Steps:**

- [ ] **Step 1: Add import** at the top of `summoner.mjs`:

```js
import { CONTROLLER_TYPES } from "../companion/save-routing.mjs";
```

- [ ] **Step 2: Add the stamping block** immediately after `tokenId = result.tokenId;` (around line 964) and before the `} catch` block. The stamping must succeed for both the case where the caster owns the imported world actor and the case where the GM owns it (if it's a pre-existing world actor), so use `gmRequest` regardless — it's cheap and consistent:

```js
// Stamp controller flags on the summoned NPC so its saves route through
// the summoner's actor (see scripts/companion/save-routing.mjs).
try {
  await gmRequest("setActorFlag", {
    actorId: sourceActorId,
    scope: MODULE_ID,
    key: "controllerActorId",
    value: actor.id
  });
  await gmRequest("setActorFlag", {
    actorId: sourceActorId,
    scope: MODULE_ID,
    key: "controllerType",
    value: CONTROLLER_TYPES.COMPANION
  });
} catch (e) {
  console.warn(`[VCE] summoner: failed to stamp controller flags on ${npcData.name}`, e);
  // Non-fatal — summoning continues. User can manually Set Save Controller
  // from the NPC sheet header button.
}
```

- [ ] **Step 3: Smoke test** per Verify block.

- [ ] **Step 4: Commit**

```bash
git add scripts/class-features/summoner.mjs
git commit -m "feat(summoner): auto-stamp controller flags for save routing"
```

---

## Task 6: Auto-stamp flags from familiar placement

**Goal:** Same as Task 5 but for the Familiar perk.

**Files:**
- Modify: `scripts/perk-features/familiar.mjs` (around line 394, right after `tokenId = result.tokenId;`)

**Acceptance Criteria:**
- [ ] Same as Task 5, applied to the familiar.

**Verify:** Conjure a familiar via the ritual. On the familiar's token:
```js
canvas.tokens.controlled[0].actor.getFlag("vagabond-character-enhancer", "controllerActorId")
// → caster PC's actor id
```

**Steps:**

- [ ] **Step 1: Add import** at the top of `familiar.mjs`:

```js
import { CONTROLLER_TYPES } from "../companion/save-routing.mjs";
```

- [ ] **Step 2: Add the stamping block** immediately after `tokenId = result.tokenId;` (around line 394) and before the `} catch` block:

```js
// Stamp controller flags so the familiar's saves route through its caster.
try {
  await gmRequest("setActorFlag", {
    actorId: sourceActorId,
    scope: MODULE_ID,
    key: "controllerActorId",
    value: actor.id
  });
  await gmRequest("setActorFlag", {
    actorId: sourceActorId,
    scope: MODULE_ID,
    key: "controllerType",
    value: CONTROLLER_TYPES.COMPANION
  });
} catch (e) {
  console.warn(`[VCE] familiar: failed to stamp controller flags on ${npcData.name}`, e);
}
```

- [ ] **Step 3: Smoke test** per Verify block.

- [ ] **Step 4: Commit**

```bash
git add scripts/perk-features/familiar.mjs
git commit -m "feat(familiar): auto-stamp controller flags for save routing"
```

---

## Task 7: End-to-end test matrix

**Goal:** Cover the combinations that matter. No automated tests — this is a checklist to run in a live Foundry session before shipping.

**Files:** None modified.

**Acceptance Criteria:**
- [ ] Every row below passes. Note actual observed behavior next to each.

**Verify (checklist):**

| # | Scenario | Expected |
|---|---|---|
| 1 | Regular PC target, attack save | Rolls on PC, card attributed to PC, damage to PC, no routing note |
| 2 | Unflagged NPC target, attack save | "NPCs don't roll saves" warning, no damage applied |
| 3 | Companion-flagged NPC, attack save (non-crit success) | PC rolls, card title = NPC, subtitle = "via [PC] ([Mana skill label])", damage after save applied to NPC's HP |
| 4 | Companion-flagged NPC, attack save (failed) | Damage applied in full to NPC's HP |
| 5 | Companion-flagged NPC, attack save (crit) | Luck/benefit toggle present in chat card; toggle works |
| 6 | Hireling-flagged NPC | Same as #3 but subtitle = "via [PC] (Leadership)" |
| 7 | Flagged NPC, weakness match | Weak die added, armor bypassed (applied to NPC) |
| 8 | Flagged NPC + Cleave-property weapon (1 PC + 1 flagged NPC in target set) | Damage split between both targets; PC rolls for self, PC rolls for NPC |
| 9 | Save reminder (status-only, no damage) on flagged NPC | PC rolls save, reminder card posted with routing note |
| 10 | Status caused by save-failing attack on flagged NPC | Status applied to NPC (not PC) |
| 11 | Player without ownership of NPC, but ownership of controller PC | Save rolls successfully |
| 12 | Player without ownership of either | "You don't have permission" warning |
| 13 | Controller PC was deleted after flags set | `resolveSaveRoller` returns null → "NPCs don't roll saves" warning (graceful fallback) |
| 14 | Unlinked summoned token from Summoner | Saves route correctly, flags visible on synthetic actor |
| 15 | Manual "Set Save Controller…" on a random NPC → Hireling → attack save | Routes to PC with Leadership label |
| 16 | "Set Save Controller…" → Clear → attack save | Returns to "NPCs don't roll saves" |

- [ ] **Step 1: Walk the matrix** in a test world with at least one PC and a test NPC. Fix any failures by iterating on the affected task.

- [ ] **Step 2: If all rows pass, commit the checklist notes** (if any) to the plan's `.tasks.json` completion record.

---

## Task 8: Changelog + version bump

**Goal:** User-visible release notes and a module version increment.

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `module.json` (bump `version` per the existing convention — current HEAD is v0.3.3, so v0.3.4 unless the project convention says otherwise)

**Acceptance Criteria:**
- [ ] `CHANGELOG.md` has a new section for the new version summarizing the feature (keep to the style used in prior entries — see `70fb1df docs: update v0.2.9 changelog`).
- [ ] `module.json` version field is bumped.

**Verify:**
- Load the module in Foundry → splash/update banner shows the new version.
- `git diff HEAD~1 module.json` shows only the version field change.

**Steps:**

- [ ] **Step 1: Read the latest CHANGELOG entry** to match the format.

- [ ] **Step 2: Add a new section** at the top of `CHANGELOG.md`:

```markdown
## v0.3.4

### Added
- **Friendly NPC Saves**: Summons, familiars, and hirelings can now roll Reflex/Endure/Will saves from chat card buttons. The save rolls on the controller PC's stats (so favor/hinder/luck/feats all stack), while damage is applied to the NPC. Controller flags are auto-stamped by Summoner and Familiar; other NPCs can be linked manually via the new "Set Save Controller…" button on the NPC sheet header. Companions use the controller's Mana Skill for attribution; hirelings use Leadership.
```

- [ ] **Step 3: Bump `module.json`** — change `"version": "0.3.3"` to `"version": "0.3.4"`.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md module.json
git commit -m "chore: v0.3.4 — friendly NPC saves"
```

---

## Self-Review Notes

- **Spec coverage**: brief's six files-likely-touched are all addressed (summoner.mjs Task 5, familiar.mjs Task 6, save handlers Tasks 2+3, dialog Task 4, CHANGELOG Task 8).
- **Brief order mapping**: brief steps 1 (grep) and 2 (trace PC save path) were done during brainstorm. Steps 3-6 correspond to Tasks 0-6. Step 6 (chat attribution polish) is done inline in Task 2's post-message HTML edit.
- **Deferred items** (command cost, hireling cap, auto-fail) are explicitly flagged as out-of-scope in the Design Reference and do not appear as tasks.
- **Dual-codepath check** (per CLAUDE.md): `VagabondDamageHelper.handleSaveRoll` is the unified entry point for save buttons on BOTH character-sheet-emitted and crawler-emitted chat cards (chat cards are the shared surface). No crawler-specific patch needed for saves.
- **Unlinked-token concern** (CLAUDE.md): flag writes go via `gmRequest("setActorFlag")` on the `sourceActorId` (the world actor imported into the world). For unlinked tokens, reads go through `token.actor.getFlag` which transparently pulls from the delta if overridden; since we only write to the world actor, reads will land via prototype inheritance. Verified by Test #14 in Task 7.
