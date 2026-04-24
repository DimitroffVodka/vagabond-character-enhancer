# Psychic Class Implementation — Design

**Date:** 2026-04-24
**Status:** Approved for plan-writing
**Author(s):** DimitroffVodka + Claude

## Summary

Implement the **Psychic** class as a fully playable Vagabond class. Psychic uses a magic system (Talents) that doesn't map cleanly onto the existing spellcaster pipeline, so we ship a parallel system: a custom `talent` item type, a dedicated character-sheet tab, a separate focus tracker, and our own cast pipeline. The 14 Talents ship as content in a new `vce-talents` compendium pack.

## Why a parallel system (and not a spell-pipeline retrofit)

Psychic deviates from every other Vagabond caster:

- No Mana pool — casts are capped at `floor(level / 2)` *virtual* Mana, not paid out of a pool.
- Free Focus on Talents (no per-round Mana drain).
- Multi-Focus: 1 → 2 (L4) → 3 (L8) simultaneous Talents focused.
- Mid-combat Talent swap (Transcendence, L10).
- 4 of the 14 Talents are pure self-buffs that grant an Active Effect only while Focused.

Bending the system's spell pipeline to handle these would require deep patches across `SpellHandler.castSpell`, the cast dialog, the per-round Mana drain hook, and the focus tracker. A custom item type with its own pipeline isolates Psychic from system updates and keeps the spell flow untouched for every other class.

## Non-goals

- Loadout management UI for swapping known Talents at will. Vagabond's downtime study action covers retraining — players manually drag items off and on. The only Talent-swap UI we build is for Transcendence (L10, in-combat).
- Integration with the system's character creator. The creator doesn't know about Talents; we add them post-creation via a pick dialog.
- Auto-granting the Telepath Perk. Awakening keeps `perkAmount: 1` per the Samurai convention — the rule names Telepath, the player picks it.
- Backwards-compatibility for actors built before this implementation. Players re-pick Talents via the dialog if they had a pre-existing Psychic actor.

## Architecture

### Custom item type

Register at module init:

```js
CONFIG.Item.dataModels.talent = TalentData;
```

`TalentData` extends `foundry.abstract.TypeDataModel`. Fields:

- `description` — HTML string.
- `damage` — dice formula string (e.g., `"1d6"`); empty for non-damage Talents.
- `damageType` — `"fire" | "cold" | "poison" | ...` (vagabond damage type set).
- `effect` — name of the status condition the Talent applies when fully cast (e.g., `"confused"`); empty for non-effect Talents.
- `delivery` — array of strings (`["touch", "remote", "cone", ...]`); the allowed delivery options for this Talent. Filtered against affordability at cast-time.
- `duration` — `"instant" | "focus" | "continual"`.
- `focusBuffAE` — AE definition object, or null. Set on the 4 self-buff Talents (Absence, Evade, Shield, Transvection); applied to the caster while Focused.
- `aliasOf` — optional string referring to a system spell name (e.g., Pyrokinesis aliasOf `"burn"`). Pure flavor; powers the chat card subtitle ("acts as the Burn spell").

### Item sheet

`TalentSheet` (ApplicationV2). Used in the compendium for editing; rarely opened on player sheets. Renders the data model fields as form inputs with appropriate validators. CSS reuses the `vce-creature-picker-app` palette.

### Compendium pack

New pack `vce-talents` of type `Item`, registered in `module.json`. Ships 14 items of type `talent`.

| Talent | Damage | Type | Delivery | Effect | Duration | focusBuffAE |
|---|---|---|---|---|---|---|
| Pyrokinesis | 1d6 | fire | touch, remote, cone, sphere | burning | instant | – |
| Cryokinesis | 1d6 | cold | touch, remote, cone, sphere | restrained | instant | – |
| Befuddle | – | – | touch, remote, sphere | confused | instant | – |
| Control | – | – | touch, remote | (Animate-spell logic) | focus | – |
| Destroy | 1d6 | – | touch, remote | – | instant | – |
| Launch | 1d6 | – | touch, remote, line | (Kinesis) | instant | – |
| Manifest | – | – | touch | (Forge) | continual | – |
| Mediumship | – | – | touch, remote | (Speak) | instant | – |
| Seize | – | – | touch, remote | charmed | focus | – |
| Ascend | – | – | self, touch | (Levitate) | focus | – |
| Absence | – | – | self | – | focus | invisible status |
| Evade | – | – | self | – | focus | +d4 Reflex saves |
| Shield | – | – | self | – | focus | +d4 Armor |
| Transvection | – | – | self | – | focus | Fly speed |

Detail data (exact formulas, scaling rules) sourced from each Talent's system spell counterpart and from rulebook chapter 03 (Heroes / Classes / Psychic) and 05 (Magic).

### Character-sheet integration

Inject a **"Talents" tab** on character sheets when the actor has a Psychic class item. Hidden otherwise. Pattern mirrors Druid's Beast Form panel.

Tab content (`templates/talents-tab.hbs`):

- **Header line**: `Mana Cap: {floor(level/2)}` · `Focus: {focusedIds.length} / {maxFocus}` · "Pick Talents" button (visible if there are unspent picks at this level) · "Transcendence" button (visible at L10).
- **Cards**: one per known Talent. Card shows icon, name, description excerpt, focused indicator, **Cast** button + **Focus** toggle.
- **Focus-only buff Talents** render with a `Buff` badge instead of a Cast button (they're not cast in the usual sense — only Focused).

CSS reuses the existing dark gold-accent palette via the `vce-creature-picker-app` rules where applicable, with new `vce-talent-*` selectors for tab-specific elements.

### Pick dialog

`templates/talent-pick-dialog.hbs` + `scripts/talent/talent-pick-dialog.mjs` (DialogV2).

- **Fires automatically** on Psychic class detection (3 picks) and on level-up to L3 / L5 / L7 / L9 (1 pick each).
- **Triggered** by `feature-detector.mjs` extension, gated by `flags.vagabond-character-enhancer.psychicTalentsPicked` (array of completed level tiers).
- **UI**: list of all 14 Talents (excluding already-known), checkboxes, live counter `Picked X of N`, Confirm + Cancel.
- **On Confirm**: picked Talents are created as items on the actor; level tier appended to `psychicTalentsPicked`.
- **On Cancel**: no items added, level tier *not* added — dialog re-fires next sheet open. Player can also manually retrain via downtime drag-and-drop, in which case `psychicTalentsPicked` is irrelevant (it just gates the auto-fire).

### Cast pipeline

`scripts/talent/talent-cast.mjs`.

When the player clicks **Cast** on a Talent card:

1. Open `TalentCastDialog` (custom DialogV2). UI shape: see "Cast dialog UI" below.
2. Player configures the cast within the cap.
3. On submit, build the cast config: `{damageDice, delivery, hasEffect, isFocused, targets}`.
4. Mysticism Cast Check is rolled against unwilling targets via the existing system check flow if needed.
5. Damage rolled via `VagabondDamageHelper.rollSpellDamage` (called as a static utility with our config — *not* through `SpellHandler`).
6. Chat card rendered via `VagabondChatCard.spellCast` with adapted Talent-shape data, OR via a custom `templates/talent-chat-card.hbs` if shape adaptation gets messy.
7. Save buttons on the chat card route through existing VCE save-routing patches unchanged.

#### Cast dialog UI

**Full RAW configurability.** The dialog mirrors the system's spell cast dialog, but Talent-specific:

- **Damage dice slider** — 0 to (cap). Locked to 0 if the Talent's `damage` field is empty.
- **Delivery dropdown** — filtered to the intersection of (Talent's `delivery` list) AND (deliveries whose base cost ≤ remaining cap after damage spend).
- **Effect toggle** — costs 1 Mana to enable; greyed out if remaining cap < 1 OR if the Talent has no `effect`.
- **Duration radio** — Instant / Focus. Free for Talents (no Mana cost regardless of choice).
- **Live counter** — `Spent: X / Cap`. Updates as the player adjusts.

The player can spend their cap budget freely across damage, delivery, and effect — RAW spell configuration, just bounded by the cap. No Mana is actually deducted from any pool; the cap is purely virtual.

### Focus tracking

Psychic-specific flag on the actor:

```js
flags.vagabond-character-enhancer.psychicTalents = {
  focusedIds: ["talentItemId1", "talentItemId2"],
  maxFocus: 1   // 1 / 2 / 3 by level
}
```

Decoupled from `system.focus.spellIds`. Talents don't pollute the system's spell-focus tracker; the system's existing focus drain hook never sees Talents.

When the player toggles **Focus** on a Talent card:

- **Add**: append id to `focusedIds`. If buff Talent, apply its `focusBuffAE` to the actor with `origin = "Talent.{id}"`. Reject with a notification if `focusedIds.length >= maxFocus`.
- **Remove**: pop id from `focusedIds`. If buff Talent, remove the AE matching that id.

#### Multi-Focus (Duality)

`maxFocus` is set by the Psychic feature handler in `psychic.mjs`. Computed from class level whenever the actor updates:

- L1-3: 1
- L4-7: 2
- L8+: 3

No AE on `system.focus.maxBonus` — that field doesn't apply to our flag. Direct write to `flags.vagabond-character-enhancer.psychicTalents.maxFocus`.

### Class features

| Feature | Level | Implementation |
|---|---|---|
| **Awakening** | 1 | Keep `perkAmount: 1` in the compendium description (Samurai convention). Player picks Telepath manually. Set `flags.vagabond-character-enhancer.psychicMindTrinket: true` for rules flavor — UI hint that the actor's mind counts as a Trinket. |
| **Precognition** | 2 | Save-roll hook: if `psychicTalents.focusedIds.length > 0` AND no `psychicTalents.precognitionUsed` flag this round → prepend Favor die. Combat round-transition hook clears the per-round flag. |
| **Mental Fortress** | 6 | Passive AE in registry — `system.statusImmunities ADD "berserk,charmed,confused,frightened"`. Standard pattern. |
| **Transcendence** | 10 | Button on the Talents tab. Opens `TalentTranscendenceDialog` — DialogV2 with two dropdowns: "Remove" (current Talents) and "Add" (unknown Talents). Confirm deletes/creates. Action-cost is honor-system; toast notification on confirm. |

## Files

### New

- `scripts/talent/talent-data-model.mjs` — `CONFIG.Item.dataModels.talent` registration + data model.
- `scripts/talent/talent-sheet.mjs` — item sheet for compendium editing.
- `scripts/talent/talent-cast.mjs` — cast dialog + roll handler.
- `scripts/talent/talents-tab.mjs` — character-sheet tab injection + render.
- `scripts/talent/talent-pick-dialog.mjs` — initial-pick / level-up picker.
- `scripts/talent/talent-buffs.mjs` — Focus-AE manager for the 4 buff Talents.
- `scripts/class-features/psychic.mjs` — class registry, Precognition handler, Mental Fortress AE, Transcendence dialog wiring.
- `templates/talent-sheet.hbs`
- `templates/talents-tab.hbs`
- `templates/talent-cast-dialog.hbs`
- `templates/talent-pick-dialog.hbs`
- `templates/talent-chat-card.hbs` — only if `VagabondChatCard.spellCast` adaptation gets ugly.
- `packs/vce-talents/` — LevelDB pack with 14 talent items.

### Modified

- `scripts/feature-detector.mjs` — extend to fire pick dialog on Psychic detect / level change.
- `scripts/vagabond-character-enhancer.mjs` — register Psychic features at ready.
- `styles/vagabond-character-enhancer.css` — talent tab + dialog styling.
- `module.json` — register `vce-talents` pack.
- `CLAUDE.md` — document the Talents system in a new "Psychic / Talents" section.

## Phases

Each phase is independently testable, ships its own commit, and leaves the module in a working state.

### Phase 1: Item type + data model + sheet
Registration only. No actor integration. Test: drag-drop into compendium, edit fields.

### Phase 2: Build 14 Talents in `vce-talents`
Content authoring. Test: drag-drop onto a test character; appears as item in their items list.

### Phase 3: Talents tab (render-only)
Tab injection on Psychic actors. Cards render but Cast/Focus buttons are stubs. Test: visual sanity.

### Phase 4: Pick dialog + class detection
Fire on Psychic detect / level change. Talents granted to actor. Test: assign Psychic class, see picker, pick 3, verify items added.

### Phase 5: Cast pipeline
Simplified Mana-spend slider, damage roll, chat card. Test: cast Pyrokinesis at L1 → 1d6 damage card.

### Phase 6: Focus tracking + buff Talents
Toggle button works, AE applied/removed, multi-focus capacity respected. Test: Focus Shield → see Armor +d4. Toggle off → AE gone. Confirm 1/2/3 capacity by level.

### Phase 7: Class features
Mental Fortress AE, Awakening flag, Precognition save hook, Transcendence dialog. Test: each feature triggers correctly; no regressions in non-Psychic classes.

## Open decisions deferred to implementation

1. **Die-bonus AEs (Evade / Shield)**: verify whether the Vagabond system has `saves.X.bonusDie` and `armor.bonusDie` fields, or whether we mirror Bard Virtuoso's "Resolve" mechanism. Locked during Phase 6.
2. **Chat card template**: reuse `VagabondChatCard.spellCast` with adapted data vs ship a dedicated `talent-chat-card.hbs`. Locked during Phase 5 — depends on how clean the adaptation is.

## Risks

- **Spell-card adaptation may not be clean.** `VagabondChatCard.spellCast` expects spell-shape data. If adaptation gets ugly, ship a custom `talent-chat-card.hbs` with the same visual shape but our own logic. Adds ~80 LoC but gains independence.
- **Foundry/Vagabond updates may break the item type registration.** Less risky than spell-pipeline coupling but possible. Mitigation: minimal `CONFIG.Item.dataModels` touch; defensive checks in handlers.
- **Multi-focus race conditions.** Rapid toggling of Focus on multiple Talents could create AE timing issues. Mitigate with a per-actor sequential async lock (similar to companion-tab `_triggerLocks`).

## Success criteria

- A new Psychic character can be created end-to-end: pick class → Talent picker fires → 3 Talents picked → all visible in Talents tab.
- Cast Pyrokinesis at L1 with Touch delivery → 1d6 damage chat card → save button works.
- Focus Shield → +d4 Armor AE applied → toggle off → AE gone.
- Level-up to 4 → Duality kicks in → can hold 2 Talents Focused simultaneously.
- L10 Transcendence button → swap Talents successfully.
- Existing classes (Wizard, Druid, etc.) unaffected — no regression in spell flow.
