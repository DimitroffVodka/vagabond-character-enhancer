# AuraManager — Crawler Port Briefing

**Audience:** A vagabond-crawler session about to integrate / extend AuraManager.
**VCE source of truth:** `scripts/aura/aura-manager.mjs`
**Date written:** End of the VCE session that finished generalizing aura support across talents, spells, and Revelator's Paragon's Aura.

---

## Primary deliverables for this session

Two outcomes the crawler session needs to land:

### (A) Aura must work end-to-end when a player casts from the crawler spell-cast dialog

VCE's existing `_detectAuraCast` listens to `createChatMessage` and auto-activates AuraManager when a spell is cast with `delivery=aura`. **It currently works for sheet-side casts because the system's `SpellHandler.castSpell` posts a chat message via `VagabondChatCard.spellCast` with the right markers.** The question for the crawler:

> When the player casts a spell *from the crawler strip's CrawlerSpellDialog*, does the resulting chat message contain `data-delivery-type="aura"` AND `message.flags.vagabond.actorId` / `itemId` / `targetsAtRollTime`?

If **yes** — `_detectAuraCast` will fire automatically and AuraManager will set up the persistent template + per-round tick + entry detection. No further work needed beyond verifying.

If **no** — the crawler's cast post-message path needs to either:
1. Match the system's chat-message shape (preferred — keeps `_detectAuraCast` source-agnostic), OR
2. Call `AuraManager.activateGeneric` directly inline after the cast resolves, with a populated spec (see API below).

**Verification step (test with foundry-mcp-bridge):**

```js
// 1. Cast via the crawler strip — the player picks a spell + Aura delivery + targets,
//    fires the cast normally.
// 2. Read the resulting chat message:
const last = game.messages.contents.at(-1);
const card = document.createElement("div");
card.innerHTML = last.content;
console.log({
  hasAuraMarker: last.content.includes('data-delivery-type="aura"'),
  flagsActorId: last.flags?.vagabond?.actorId,
  flagsItemId: last.flags?.vagabond?.itemId,
  flagsTargets: last.flags?.vagabond?.targetsAtRollTime?.length,
});
// 3. Check the caster's activeAura flag — should be populated:
const aura = game.actors.get(casterId).getFlag("vagabond-character-enhancer", "activeAura");
console.log({ behavior: aura?.behavior, sourceItemType: aura?.sourceItemType });
```

If `hasAuraMarker` is true but `aura` is null after a few hundred ms, `_detectAuraCast` ran but bailed somewhere — check the early-exit conditions in that function.

**Also for crawler casts:** apply the same `_calculateSpellCost` patch logic that VCE just added in `scripts/class-features/revelator.mjs:_patchParagonAuraCost`. The crawler's own cost calc is independent of `SpellHandler.prototype._calculateSpellCost` (per CLAUDE.md "Cast Time Tracking — Dual-Patch Required"), so the Revelator's free-Aura discount won't apply on the crawler side until the crawler's cost path mirrors the patch:

```js
// In the crawler's cost calc, before deducting Mana from the caster:
const features = actor.getFlag("vagabond-character-enhancer", "features") ?? {};
if (features.revelator_paragonsAura
    && state.deliveryType === "aura"
    && (state.deliveryIncrease ?? 0) === 0) {
  const auraBaseCost = CONFIG.VAGABOND.deliveryDefaults.aura.cost;  // = 2
  totalCost = Math.max(0, totalCost - auraBaseCost);
  // (only the BASE cost is freed — enlarged auras still pay the increase)
}
```

### (B) Add NPC aura support using the existing AuraManager pipeline

NPCs with aura abilities (e.g., a paladin's allied buff aura, a fire elemental's burning aura, a banshee's wail) need to plug into AuraManager so they get the same persistent template + per-round tick + per-grid-square containment + on-entry detection that PC casts do.

**Recommended pattern.** When an NPC's turn starts (or when their aura ability triggers), call:

```js
import { AuraManager } from "/modules/vagabond-character-enhancer/scripts/aura/aura-manager.mjs";

await AuraManager.activateGeneric(npcActor, {
  sourceItemId:    actionId,        // index or stable id into npcActor.system.actions
  sourceItemType:  "npc-action",    // NEW value — see "Tick handler dispatch" below
  itemName:        action.name,
  itemImg:         npcActor.img,
  behavior:        "damageTick",    // or "effectTick" / "buff" / "instant"
  castConfig: {
    // Free shape — passed as-is to your NPC tick handler. Whatever your
    // NPC ability needs to re-resolve damage/effect each round goes here:
    damageFormula: action.rollDamage,    // e.g. "1d6"
    damageType:    action.damageType,
    causedStatuses: action.causedStatuses ?? [],
    // ... any other ability-specific config
  },
  radius:          10,
  templateColor:   "#cc4a1f",
  templateBorder:  "#8a3014",
});
```

**To make `sourceItemType: "npc-action"` actually tick**, extend `AuraManager._tickAura`'s dispatcher. Currently it has two branches:

```js
// scripts/aura/aura-manager.mjs:_tickAura, around the per-target loop
if (isSpellSource) {
  await AuraManager._fireSpellTickAtTarget(actor, sourceItem, auraState.castConfig, tok);
} else {
  await TalentCast.executeCast(actor, sourceItem, auraState.castConfig, ...);
}
```

Add a third branch for NPC actions:

```js
const isNpcSource = auraState.sourceItemType === "npc-action";
// ... 
if (isNpcSource) {
  await AuraManager._fireNpcActionTickAtTarget(actor, auraState.castConfig, tok);
} else if (isSpellSource) {
  // ...
} else {
  // ...
}
```

`_fireNpcActionTickAtTarget` should mirror `_fireSpellTickAtTarget`'s shape but use the crawler's NPC-action cast pipeline (cast-check via NPC's Mana Skill, damage roll, render chat card via `VagabondChatCard.npcAction` or whatever the crawler uses).

**Auto-detection from NPC turn-start.** If you want the aura to auto-activate when an NPC with an aura ability starts its turn, hook `Hooks.on("combatTurn", ...)` in the crawler:

```js
Hooks.on("combatTurn", async (combat, change, options) => {
  if (!game.user.isGM) return;
  const tokenDoc = combat.combatants.get(combat.current.combatantId)?.token;
  const actor = tokenDoc?.actor;
  if (actor?.type !== "npc") return;
  
  const existing = actor.getFlag("vagabond-character-enhancer", "activeAura");
  if (existing) return;  // already active
  
  // Find aura abilities in NPC actions (up to crawler convention how to flag them —
  // could be a string match in description, a custom flag, or a dedicated field)
  const auraAction = actor.system.actions?.find(a => isAuraAction(a));
  if (!auraAction) return;
  
  await AuraManager.activateGeneric(actor, {
    sourceItemId:    auraAction.id ?? actor.system.actions.indexOf(auraAction),
    sourceItemType:  "npc-action",
    // ... rest of spec
  });
});
```

**Termination.** NPC auras typically end when the NPC dies (HP to 0). The existing `CompanionTerminationManager` handles this for companions; extending it for arbitrary aura-casting NPCs is straightforward — listen to actor HP-to-0 and call `AuraManager.deactivate(actor)`. Or hook `deleteToken` for the NPC's token.

---

## What AuraManager is now

AuraManager is a **delivery-mechanism subsystem**, not a class feature. It's registered at module-level (`AuraManager.registerHooks()` in the VCE ready hook), so any actor casting an Aura-delivery spell or talent gets the same persistent template, per-round tick, on-entry tick, and per-grid-square containment behavior.

It handles three behavior types:

- **`buff`** — apply an AE to allies (or anyone, depending on registry entry) while they remain inside the radius. Refreshes on token movement. Used by Revelator's Exalt/Bless/Ward via the `AURA_SPELLS` registry. Each entry there is a spell with custom VCE-implemented buff mechanics that the system doesn't natively express (e.g., Bless's mode toggle, Ward's reactive damage reduction).
- **`damageTick`** — re-roll the source spell/talent's damage at the start of each combat round and on any hostile entering the radius mid-round. Cast check fires per target. Save reduces. Used for Talent damage spells (Pyrokinesis, Destroy, Launch) and any system spell with `damageType !== "-"` cast as Aura with focus.
- **`effectTick`** — like `damageTick` but for talents/spells whose primary purpose is a status effect (Befuddle, Mediumship). Same per-round + on-entry resolution.
- **`instant`** — one-shot resolution at activation, template stays for the rest of the current combat round, deactivates on the next round transition. Used when a damage/effect aura is cast without focus.

The behavior is determined by the cast at activation time, not the source class.

## Public API entry points

```js
// Buff aura (registry-driven — Revelator's spells)
await AuraManager.activate(actor, spellKey, radius);

// Generic aura (talents, system spells, NPC abilities you'll add)
await AuraManager.activateGeneric(actor, {
  sourceItemId,           // item id on the caster (talent or spell)
  sourceItemType,         // "talent" | "spell" — drives the per-tick dispatcher
  itemName, itemImg,
  behavior,               // "damageTick" | "effectTick" | "buff" | "instant"
  castConfig: {
    damageDice, includeDamage, includeEffect,
    delivery, isFocused,  // delivery is always "aura" here
  },
  focusTalentId,          // for VCE talents (psychicTalents.focusedIds)
  focusSpellId,           // for system spells (system.focus.spellIds)
  radius,                 // feet, default 10
  templateColor, templateBorder,
  initialTickedActorIds,  // pre-seed tickedThisRound (e.g., system already
                          // hit these targets on the first cast)
});

// Tear down
await AuraManager.deactivate(actor);

// Per-target tick re-roll (used by `_tickAura`; you call directly for one-off sims)
await AuraManager._fireSpellTickAtTarget(actor, spellItem, castConfig, targetToken);
```

## Containment rule

`AuraManager._tokensInsideTemplate(template, movedTokenOverride, templateCenterOverride)` is the canonical "is this token in the aura" check. Two important properties:

1. **Per-grid-square center**, not bounding-box overlap. A token is "in" the radius if any of its occupied grid squares has its center inside the circle. This matches Foundry's own purple-square highlighting on circle templates. A 2x2 monster with a corner clipping the geometric circle but no cell-center inside is **not** considered in range. Players read the purple squares as "the aura," and the math now matches.

2. **Stale-coordinate overrides for `updateToken` timing.** In Foundry v13, `updateToken` fires for animated movement *before* the document commits the new x/y — `tokenDoc.x` still reports the old position; only `changes.x`/`changes.y` carry the new value. Without overrides, this inverts entry/exit detection (hostiles "leaving" the aura still test as inside, "entering" tests as outside). The two override params handle this:

   - `movedTokenOverride: { tokenId, x, y }` — supplied by the `updateToken` hook, used to override the moved token's position during the containment check.
   - `templateCenterOverride: { x, y }` — supplied when the *caster* is the moved token, since the auto-following `template.update({x, y})` is async and may not have committed before `_tickAura` runs.

**This is the single most important thing to preserve in the crawler port.** Skipping the overrides and reading `doc.x` directly will silently break entry detection on player drag in v13.

## Hook surface

AuraManager registers (search `AuraManager.registerHooks` in `aura-manager.mjs:80-200` for current canonical):

- `updateToken` — auto-follow template on caster movement; rescan buff auras for allies entering/leaving range; tick generic damage/effect auras on any token movement (entry detection).
- `createToken` / `deleteToken` — rescan buff auras.
- `updateCombat` — round-tick reset (`tickedThisRound = []`) + run `_tickAura` for all active damage/effect auras; deactivate `instant` auras (1-round persistence); deactivate any aura whose source focus has dropped.
- `deleteCombat` — `_cleanupAllAuras` (skips auras whose source focus is still held).
- `canvasReady` — `_restoreAuras` (re-create templates, re-apply buffs).
- `renderChatMessage` — wire activate/deactivate buttons on aura chat cards.
- `createChatMessage` — `_detectAuraCast` auto-activates an aura when a spell is cast with `delivery=aura`.
- `updateActor` — focus-drop detection (both `system.focus.spellIds` for spells and `flags.vagabond-character-enhancer.psychicTalents.focusedIds` for talents).

All hook handlers are GM-gated where they make state changes; non-GM clients no-op.

## Data shape on the actor

`flags.vagabond-character-enhancer.activeAura` is the canonical state. Generic-aura shape:

```js
{
  generic: true,                  // distinguishes from old buff-only state
  behavior: "damageTick",         // | "effectTick" | "buff" | "instant"
  sourceItemId,
  sourceItemType: "talent",       // | "spell"
  itemName, itemImg,
  castConfig: { damageDice, includeDamage, includeEffect, delivery, isFocused },
  focusTalentId,                  // null for spell-driven auras
  focusSpellId,                   // null for talent-driven auras
  radius,
  tokenId,                        // caster's token id on the scene
  templateId,                     // MeasuredTemplate id (the visual circle)
  tickedThisRound: [actorId, ...] // actor IDs hit so far this round
}
```

`tickedThisRound` is the zigzag guard — populated as `_tickAura` hits hostiles, cleared on round-change before the next round's tick.

## What the crawler needs to do

### 1. NPC aura abilities (deferred from VCE)

Some NPCs have aura abilities (passive auras, breath-weapon-like aura attacks, paladin-style allied buffs). These need to plug into AuraManager via `activateGeneric` with an NPC-source spec. The shape:

```js
await AuraManager.activateGeneric(npcActor, {
  sourceItemId:    actionId,       // index or stable id into actor.system.actions
  sourceItemType:  "npc-action",   // NEW value — see "Tick handler dispatch" below
  itemName:        action.name,
  itemImg:         actor.img,
  behavior,                        // chosen by the NPC ability's data
  castConfig:      {},             // free shape — whatever your NPC tick handler needs
  radius,
  templateColor, templateBorder,
});
```

You'll need to add a third branch to `_tickAura`'s dispatcher — currently it handles `talent` (TalentCast.executeCast path) and `spell` (`_fireSpellTickAtTarget`). NPC actions resolve through a different cast pipeline (see CLAUDE.md NPC action routing — `VagabondChatCard.npcAction`). The crawler is the natural owner of that pipeline.

### 2. CrawlerSpellDialog dual-patch for Paragon's Aura discount

VCE just patched `SpellHandler.prototype._calculateSpellCost` so a Revelator with `revelator_paragonsAura` feature flag pays 0 Mana for base 10' Aura delivery. **The crawler's `CrawlerSpellDialog` has its own cost calc that bypasses this method** (per CLAUDE.md "Cast Time Tracking — Dual-Patch Required"), so the discount currently doesn't apply when casting from the crawler strip.

Reference patch (apply to whatever the crawler's cost calc is named):

```js
// Before subtracting Mana from the player's pool, check for Paragon's Aura
const features = actor.getFlag("vagabond-character-enhancer", "features") ?? {};
if (features.revelator_paragonsAura
    && spellState.deliveryType === "aura"
    && (spellState.deliveryIncrease ?? 0) === 0) {
  const auraBaseCost = CONFIG.VAGABOND.deliveryDefaults.aura.cost;  // = 2
  totalCost = Math.max(0, totalCost - auraBaseCost);
  // (only the BASE cost is freed — enlarged auras still pay the increase)
}
```

The VCE-side patch lives in `scripts/class-features/revelator.mjs:_patchParagonAuraCost`. Mirror its structure in the crawler.

### 3. Surface the aura cast to AuraManager when the crawler bypasses SpellHandler

VCE's `_detectAuraCast` (in `aura-manager.mjs`) listens to `createChatMessage` and routes any spell cast with `delivery=aura` through AuraManager. **Confirm that the crawler's spell cast also creates a chat message with the same `data-delivery-type="aura"` marker and the `flags.vagabond.actorId` / `flags.vagabond.itemId` fields.** If the crawler renders a different shape, `_detectAuraCast` won't fire and the player gets the system's first-cast hit but no per-round tick, no entry detection.

The detection looks at `message.content.includes('data-delivery-type="aura"')` and reads `message.flags.vagabond.{actorId, itemId, targetsAtRollTime}`. As long as `VagabondChatCard.spellCast` is what posts the message, this should work — but the crawler bypasses the system's SpellHandler so verify the chat-card path matches.

## Migration path notes (for any pre-v0.4.x state in the wild)

The old buff-aura activeAura shape didn't have `generic` / `behavior` / `sourceItemType` fields. AuraManager's helpers gracefully handle their absence (treat as buff path). If the crawler ever queries `activeAura` directly, default `behavior` to `"buff"` when missing.

## Testing approach (proven this session)

The fastest way to verify a containment / movement bug is to drive the live game via the foundry-mcp-bridge:

1. Reload via `evaluate({ window.location.reload() })` (5-second wait).
2. Place caster + a hostile NPC near each other.
3. Activate the aura (cast normally or call `AuraManager.activateGeneric` directly).
4. Move tokens via `tokenDoc.update({ x, y })` (animated default — that's the v13 bug-trigger path) and inspect `flags.vagabond-character-enhancer.activeAura.tickedThisRound` + recent chat messages.
5. Repeat with the caster moving (template should auto-follow), the hostile moving (entry tick should fire), and round transitions (`combat.update({ round: round+1 })` → ticked clears, hostiles in range get re-hit).

CLAUDE.md (in the VCE root) has a "Testing via the foundry-mcp-bridge" section with the standard test loop.

## Pitfalls / gotchas

- **`tokenDoc.x` is stale during `updateToken` for animated movement** in v13. Always prefer `changes.x ?? tokenDoc.x` and pass the resolved position through as a `movedTokenOverride`.
- **`template.update({x, y})` is async**. When the caster moves and the template auto-follows, the template doc may not have committed by the time the tick runs. Use `templateCenterOverride` derived from the caster's known new position.
- **Per-grid-square containment is the rule**, not bounding-box overlap. A 4x4 monster with a corner clipping the geometric circle but no cell-center inside is *not* in the aura.
- **`tickedThisRound` must be reset BEFORE the round-tick fires**, not after. Otherwise the same hostiles get skipped forever.
- **`game.user.targets` is the player's UI selection — don't rely on it inside aura ticks.** Resolve targets from the template's containment check instead.
- **Friendly tokens are skipped from damage/effect ticks** (we filter to `disposition === HOSTILE`). Aura buffs apply to friendlies (in the existing `_applyBuffsInRange` path); damage auras affect hostiles only.
- **Caster is always skipped** from their own aura's damage/effect tick.

## File / line references (current as of this session)

- `scripts/aura/aura-manager.mjs` — the whole subsystem.
- `scripts/aura/aura-manager.mjs:_tokensInsideTemplate` — containment helper. **Port this verbatim.**
- `scripts/aura/aura-manager.mjs:_tickAura` — per-round + per-movement tick dispatcher.
- `scripts/aura/aura-manager.mjs:_fireSpellTickAtTarget` — spell-source per-target cast resolution. Mirror its shape for NPC ticks.
- `scripts/aura/aura-manager.mjs:_detectAuraCast` — chat-message → activateGeneric router.
- `scripts/aura/aura-manager.mjs:activateGeneric` — entry point for non-buff sources. Pre-seeds `tickedThisRound` from `spec.initialTickedActorIds`.
- `scripts/class-features/revelator.mjs:_patchParagonAuraCost` — reference for the crawler dual-patch.
- `scripts/talent/talent-cast.mjs:executeCast` (around the `delivery === "aura"` branch) — reference for routing a cast through AuraManager from a talent / item-cast pipeline.

## Out of scope for the crawler port (do not touch)

- Bless/Ward mode toggles and Silvered Weapons mechanic — those are AURA_SPELLS-specific and live in VCE.
- Talent-side cast pipeline (`TalentCast.executeCast`) — VCE owns this.
- The Psychic talents tab UI / focus pool plumbing — VCE owns this.

## Open question for the crawler session

When NPCs have aura abilities, what's the correct cast-check / save-pipeline equivalent? `_fireSpellTickAtTarget` uses the actor's `system.classData.manaSkill` to pick the cast skill. NPCs don't have classData. The crawler probably has its own NPC-action skill resolution (we use it in VCE's npcAction routing patch — see `scripts/vagabond-character-enhancer.mjs:1817-1830`). Decide whether to share that resolution or duplicate it.
