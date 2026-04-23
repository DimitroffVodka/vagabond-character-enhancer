# Changelog

## v0.4.0 — In Progress

### New Feature — CompanionManager (Phase 1)

Replaces the old per-companion Summon tab with a unified **Companions** tab on every character sheet. One card per active companion (summons, familiars, hirelings), source-agnostic: color-coded badge, HP bar with gradient, armor, active statuses, controller attribution, save buttons (Endure/Reflex/Will), and actions list (NPC system actions for summons/familiars; equipped weapons + spells for hirelings).

#### Engine
- **`CompanionSpawner`** — unified spawn/dismiss/query engine. Consolidates `placeToken` + `updateActorFlags` + combat-add logic previously duplicated between Summoner and Familiar. Replace-on-same-source prompt. GM-proxied via socket relay.
- **`CreaturePicker`** — shared ApplicationV2 dialog with filter config (types, sizes, maxHD, pack, customFilter). Uses compendium `getIndex` for performance. Replaces inline picker code in summoner.mjs and familiar.mjs.
- **Source registry** (`companion-sources.mjs`) — pure-data definitions for each source (`summoner`, `familiar`, `spell-beast`, `spell-animate`, `spell-raise`, `perk-conjurer`, `perk-reanimator`, `perk-animal-companion`, `hireling-manual`, `legacy` fallback). Badge color, skill routing, termination rules per source.
- **Per-source dismiss handler API** — `CompanionSpawner.registerDismissHandler(sourceId, fn)`. Fires before generic dismiss; feature adapters clean up focus slots, Soulbonder AEs, caster-side state flags. Ensures focus is released on every dismiss path (Companions tab Dismiss, zeroHP auto-dismiss, replace-on-spawn).
- **`CompanionTerminationManager`** — GM-side `updateActor` listener. Auto-dismisses flagged companions on HP-to-0 transitions. 250ms deferred dismissal prevents the system `toggleStatusEffect('dead')` race that threw `undefined id [tokenId] does not exist in EmbeddedCollection` errors.

#### Refactors
- **Summoner** uses `CompanionSpawner.spawn({ sourceId: "summoner", ... })`. Keeps `activeConjure` caster flag for backward compat with Second Nature / Guardian Force / mana-drain hooks. Registers a dismiss handler for focus release + Soulbonder cleanup. Legacy 0-HP auto-banish hook guarded so it skips new `companionMeta` companions (no double-fire).
- **Familiar** same treatment. Keeps `activeFamiliar` caster flag. Legacy 0-HP hook already 250ms-deferred (pre-Phase-1 fix) and now additionally guarded against double-dismiss.

#### UX
- **Feature-gated Conjure buttons** — Companions tab shows "Conjure Summon" for actors with `features.summoner_creatureCodex`, "Conjure Familiar" for `features.perk_familiar`. Single source of truth for summoning; the Familiar perk's right-click context-menu Conjure options were removed.
- **Double-click lock** on Conjure buttons — per-PC async lock prevents a second dialog from opening while the first is still resolving.
- **Right-click to favorite** — any creature row in the Conjure Summon / Conjure Familiar dialogs can be right-clicked to toggle its Creature Codex (`summonCodex`) or Familiar Codex (`familiarCodex`) membership. Favorited rows sort to the top on next open and are reordered in-place instantly when toggled.

### NPC Action Routing
- **`VagabondChatCard.npcAction` patched** so any click on a companion's action — whether from the Companions tab card, the NPC's own sheet, the crawler strip, or direct API calls — routes the d20 check through the controller PC's Mana Skill (Mysticism/Arcana). Mirrors the routing pattern in vagabond-crawler's `_fireAction`. Unflagged NPCs roll their own stats (no change).

### Token Configuration at Spawn
- **Vision from senses** — `CompanionSpawner` reads the creature's `system.senses` string and builds `sight` config. `Darksight` → enabled, range: null (infinite), mode: darkvision. No special sense → enabled basic vision.
- **Movement action** — `CompanionSpawner` picks the fastest mode from (walk, fly, swim, climb, burrow) and sets it as the token's default `movementAction`. A Bee, Giant (walk 10 / fly 50) spawns with `movementAction: "fly"`.
- **Ownership** — `placeToken` gains a `grantOwnershipFrom` param. Every user with OWNER on the caster actor receives OWNER on the companion world actor. Handles the GM-testing case where clicks originate from the GM but ownership should flow to the actual player(s) controlling the caster.

### New Feature — Gather Companions
Compress/expand button on every hero's token right-click HUD. Mirrors the Vagabond system's `_gatherParty` pattern but scoped to VCE-flagged companions via `CompanionSpawner.getCompanionsFor(hero)`:
- **Gather** — snapshots each companion token's full document (preserves delta for unlinked tokens: HP, conditions, imbues), animates them to the hero, deletes them, stores snapshots on `hero.flags.vagabond-character-enhancer.gatheredCompanions`.
- **Release** — recreates tokens from snapshots in a spiral around the hero, preserving all state.
- GM-proxied `createTokens` / `deleteTokens` socket-relay ops so players (who can't edit scene embedded docs) can gather and release their own companions.
- Replaces `GatherFriendlies` in the **vagabond-crawler** module (which just teleported). The crawler version is gated behind a VCE-inactive check so standalone crawler installs keep their feature.

### Compatibility
- v0.3.4 `controllerActorId` / `controllerType` flags unchanged. Existing flagged NPCs render in the new tab with a "Companion" fallback badge (or "Hireling" for `controllerType === "hireling"`). Re-cast the originating spell/perk to attach source-specific metadata (`companionMeta`).
- Existing save-routing (v0.3.4) works unchanged.
- Existing summoner/familiar hook code (Second Nature, Guardian Force, mana drain, ritual recast) continues to read the legacy caster-side `activeConjure` / `activeFamiliar` flags.

### Internal
- New files: `scripts/companion/{companion-sources,companion-spawner,companion-termination,companion-manager-tab,creature-picker,gather-companions}.mjs`, `templates/creature-picker.hbs`.
- CSS additions for `.vce-companion-card`, `.vce-companion-type-badge`, `.vce-save-btn`, `.vce-companion-actions-bar`, `.vce-companion-conjure-btn`, HP gradient, empty state.
- Socket relay additions: `createTokens` (batch), `deleteTokens` (batch), `grantOwnershipFrom` on `placeToken`.
- Suppressible chat notification on `CompanionSpawner.spawn({ suppressChat: true })` — used by Summoner and Familiar so their own detailed chat cards aren't duplicated.

### Pre-Phase-1 Fix
- **Familiar banish race** — Familiar's 0-HP banish now deferred 250ms before `removeToken`, mirroring the SummonerFeatures pattern. Eliminates the `undefined id [tokenId] does not exist in EmbeddedCollection` error that fired when the system's `toggleStatusEffect('dead')` tried to resolve the token's parent UUID after we'd deleted it.

### Phase 2 — Feature Adapters

Six new companion-summoning adapters, each built on the Phase 1 `CompanionSpawner` engine. Every adapter registers its own per-source dismiss handler for focus release and synthetic-actor cleanup. All appear in the Companions tab alongside Summoner/Familiar with source-appropriate colour badges.

#### Spells (triggered via `createChatMessage` on spell cast)
- **Beast** — casts detect the "beast" spell; opens a Beast-filtered creature picker with cumulative HD budget of `max(1, floor(level/2))`. `allowMultiple: true` so each cast stacks another beast in the budget instead of replacing. One shared Focus slot across all active beasts; released on last dismissal.
- **Raise** — casts detect the "raise" spell; opens the new `CorpsePicker` (defeated scene tokens + `vce-beasts` fallback pool, excludes Artificial/Undead/Construct/Object types). Cumulative HD ≤ caster level; stacks. Applies the new Undead template AE (Darksight, Poison immunity, Sickened immunity, beingType override) to each raised actor after spawn. Shared Focus; released on last dismissal.
- **Animate** — casts detect the "animate" spell; opens an inventory-item picker (caster's ≤1-Slot items). Creates a synthetic "Animated {item}" NPC on the fly via the new `createActor` socket-relay op (HP 3, Armor 0, beingType "Object", one attack derived from the item). Spawns as a companion with `meta.synthetic = true` so the dismiss handler deletes the ad-hoc actor on release. Single active at a time.

#### Perks (triggered via right-click context menu on the perk item)
- **Animal Companion** — narrative taming flow. Beast-filtered picker, HD ≤ `floor(level/2)`, single companion, no focus/mana cost. Replace-on-new uses `CompanionSpawner`'s default same-source prompt.
- **Reanimator** — 10-minute ritual. Reuses `CorpsePicker` (single-select) and applies the Undead template. HD ≤ caster level. Single undead; re-ritual replaces. *Note:* end-of-Shift auto-banish is deferred — Vagabond has no formal Shift tracker yet, so release is manual.
- **Conjurer** — VCE homebrew. Registers a GM-side `updateActor` watcher that auto-populates every Conjurer PC's defeated-creatures registry (flag `defeatedCreatures`) when any non-Humanlike NPC dies. Context-menu picker shows the registry filtered to HD ≤ caster level. Mana cost = HD (refunded if spawn fails or user cancels replace). Focus acquired on conjure.

### Phase 2 — Shared Infrastructure

- **`undead-template.mjs`** — `applyUndeadTemplate(actor, { sourceName })` installs a tagged AE with the Undead overlay. Used by Raise + Reanimator. GM-proxied via the new `createActorAE` socket-relay op so player-client casts still land.
- **`corpse-picker.mjs`** + **`templates/corpse-picker.hbs`** — ApplicationV2 dialog. Finds defeated tokens on the active scene + defeated combatants across scenes. Supports single- and multi-select modes (though Phase 2 adapters use single). Optional compendium fallback pool.
- **`CompanionSpawner.spawn({ allowMultiple: true })`** — new option skips the same-source replace prompt. Used by Beast and Raise for cumulative-budget stacking.
- **Socket relay ops** — `createActor` (raw-data actor creation for Animate) and `createActorAE` (AE create on non-owned actor, for Undead template).

### Phase 2 — Raise-Adjacent Perks

- **Grim Harvest** (`perk_grimHarvest`) — when a PC's spell-cast damage card is followed within 5 s by an NPC's HP dropping to 0 (and the NPC isn't Artificial/Undead/Construct/Object), the PC is healed by the spell's damage. Posts a dedicated chat card. GM-only tracker to avoid multi-client double-heal.
- **Infesting Burst** (`perk_infestingBurst`) — inline in the Raise spell adapter. When the perk is active and the caster casts Raise, a `DialogV2.confirm` offers to spawn the Zombie, Boomer (`Compendium.vagabond.bestiary.Actor.hLO69Zjvz7WaJAmO`) directly instead of opening the corpse picker. Boomer's HD 3 is checked against the remaining budget.
- **Necromancer** (`perk_necromancer`) — injects a "Necromancer Heal (+N)" button on every raised-undead companion card (where N = ceil(caster level / 2)). Click to heal the undead. Posts a chat card. Button only appears for the perk's owner.

## v0.3.4

### New Feature — Friendly NPC Saves (Controller Routing)

Friendly NPCs (summons, familiars, hirelings) can now roll Reflex/Endure/Will saves from chat-card buttons. The save rolls on a linked **controller PC** using their stat-based save formula (so favor/hinder, luck, feats, and crit threshold all stack naturally), while damage, Cleave split, weakness, armor, and HP updates stay on the NPC. The save chat card attributes the save to the NPC with a *"via [Controller PC] ([Skill Label])"* subtitle so it's clear who rolled for whom.

- **Flag schema** — each flagged NPC stores `flags.vagabond-character-enhancer.controllerActorId` and `controllerType` (`"companion"` or `"hireling"`). Companions use the controller's **Mana Skill** for chat attribution; hirelings use **Leadership**.
- **"Set Save Controller…"** button added to every NPC actor sheet header **and** character actor sheet header (for character-type hirelings). Opens an ApplicationV2 dialog with a PC dropdown and Companion/Hireling radio. Save/Clear buttons write or unset both flags atomically via a single `actor.update()` call.
- **Auto-stamping** — Summoner's `conjureSummon` and Familiar's ritual now stamp the controller flags on the summoned NPC automatically, so saves route immediately with no manual setup.
- **Save-handler patches** — `VagabondDamageHelper.handleSaveRoll` and `handleSaveReminderRoll` are replaced with VCE versions that split the roller from the damage target for flagged NPCs. Unflagged NPCs and character actors behave identically to the system defaults (no regression). Permission checks accept ownership of either the target OR the resolved controller PC.
- **Hireling weapon attacks route through Leadership** — `VagabondItem.prototype.rollAttack` is extended so a flagged hireling's weapon attack rolls on the controller PC's Leadership Skill per RAW. Weapon damage, properties, and Cleave split are unchanged; only the d20 check + difficulty is substituted.
- **Fatigue on failed save rider** — `causedStatuses` entries with `fatigueOnFail > 0` now bump the target's `system.fatigue` (capped at 5) on a failed save. Fires independently of status application (e.g., when the target is immune to the status itself). Companion rider to Crawler's Monster Creator UI for authoring the field.

### Companion Placement Fixes

Unblocks companion UX that was previously GM-only:

- **Player ownership granted at placement** — `gmRequest("placeToken", ...)` now ensures the requesting player has OWNER on the summon's world actor. Covers the case where the summon pulls a pre-existing world actor (not freshly imported), which previously left the player unable to move or control their own summon.
- **Auto-add summons to active combat** — newly placed summon/familiar/hireling tokens are automatically added to the current combat's combatants list, so they participate in vagabond-crawler flanking checks and turn-order grouping out of the box.

### Internal / Plumbing

- New `scripts/companion/` directory as the landing zone for future unified `CompanionManager` work (see `docs/superpowers/plans/2026-04-22-friendly-npc-saves.md`).
- New `updateActorFlags` socket-relay op for atomic multi-flag writes (supersedes pairs of `setActorFlag` calls where both flags must land together).
- `CONFIG.VAGABOND._damageHelper` reference stash for patch-module access at call time.
- `.vce-routing-note` CSS rule scoped under `.vagabond-chat-card-v2` for the routing-note subtitle.

## v0.3.3

### Bug Fixes — Spell Mechanics
- **Spell Effects (Fx) now require their +1 Mana surcharge** — Casting a spell *without* paying for the Effect no longer applies the spell's `causedStatuses` to targets (Dazed, Burned, Stunned, Blinded, etc.). The system was reading the spell's effect entries unconditionally regardless of whether the player paid the Fx cost. Cast tracking now captures `useFx` from both the character sheet (`SpellHandler.castSpell`) and the crawler strip (`CrawlerSpellDialog._cast`), then `StatusHelper.processCausedStatuses` filters out gated entries at apply time. **Crit-only effects** (`critCausedStatuses`) still trigger on a crit even without paying for Fx — so spells with a "if crit, apply..." entry still fire on crits, matching the rules expectation.
- **Cast attacks now bypass NPC armor (per RAW)** — Players casting damage spells at monsters were having the monster's `system.armor` subtracted from damage. Two interlocking fixes: (1) the bypass condition only matched NPC-side `castClose`/`castRanged` types and not the player-spell `cast` type — now matches any `cast`-prefixed attack type; (2) the "Apply Direct" button on spell cards has no `data-attack-type` attribute, so the wrapper falls back to checking the source item — if `item.type === "spell"`, it's treated as a cast. Orichalcum armor still blocks (mirrors the hero-side rule).
- **Auras stop dropping at end of combat when caster is still focusing** — `AuraManager._cleanupAllAuras` now skips active auras whose caster still has the source spell in `focus.spellIds`. Specifically fixes Exalt Aura silently disappearing at the end of every fight even though the player was still focusing.
- **Selfless HP restore now goes through GM relay** — When a non-GM player triggered Revelator's Selfless to take damage for an ally, the ally's HP restore was failing silently because the clicker doesn't own the ally actor. Both updates now route through the existing socket relay so the GM client performs them atomically. Latent `Math.min(0, …)` zeroing bug also fixed (would have wiped the ally's HP entirely if `health.max` were ever undefined).

### New Features
- **Moon spell — token light emission** — Focusing the Moon spell now emits silvery moonlight from the caster's token (15' bright + 30' dim, `#c8d8ff`, gentle pulse animation). Mirrors the Light spell behavior with a cooler color and calmer animation. Both spells share the same saved-original flag, so switching between them never clobbers the actor's true original token light settings.
- **Light spell tuned to 15' bright / 30' dim** — Previously 30' bright / 0' dim, now matches Moon's emission radii for consistency. Color and torch animation unchanged.
- **Area-attack weapons no longer blocked by single-target validator** — `RangeValidator` now recognizes the system's `Breath Attack` weapon (and any custom weapon flagged via the new `markAreaAttack(item)` API) as area-of-effect and skips the single-target / range checks. The Vagabond system has no native AoE weapon property, so this fills the gap for breath/cone/spray-style attacks.

### Documentation
- **CLAUDE.md — "Spell Cast-Time Tracking — Dual-Patch Required" section added** — Documents the dual patch sites (`SpellHandler.castSpell` for the sheet + `CrawlerSpellDialog._cast` for the crawler) for any feature that needs to capture cast-time state. Prevents future single-side patches from silently failing on the crawler strip.

### Summoner

- **Summon tab damage display fixed** — Character sheet's Summon tab was rendering action damage as `1d6 + 3` when the data only supports one OR the other (the roll path uses `rollDamage || flatDamage`, never both). Display now matches the roll: prefer `rollDamage`, fall back to `flatDamage`. Matches the monster-creator fix pattern — no mechanical change, just a visual correction.
- **Banish-on-death no longer races the system's Dead status effect** — When a summon hit 0 HP, VCE's `updateActor` banish hook and the Vagabond system's `updateActor` hook (which calls `actor.toggleStatusEffect('dead')`) fired in parallel. For unlinked-token summons, the system's ActiveEffect create needed to resolve its parent UUID (`Scene.X.Token.Y.ActorDelta…`) — but the banish deleted the token first, so the create threw `undefined id [tokenId] does not exist in the EmbeddedCollection collection`. The banish call is now deferred by 250 ms, comfortably past the local create round-trip, so the Dead effect lands cleanly before the token goes away. Diagnosed via a scripted kill through MCP that captured the race stack (`banishSummon` at `summoner.mjs:1043`).

## v0.3.2

### Imbue — Cost Enforcement & Ally Targeting
- **1 Mana minimum enforced** — Imbue's base cost is 0 Mana (+2 per additional Target) but the delivery now rejects casts below 1 Mana total with a notification. Blocks the free-cast edge case where a 0-dice, single-target imbue would otherwise go through for 0 Mana from either the character sheet or the Crawler strip.
- **Friendly target resolves wielder** — If the caster has a friendly token targeted (disposition FRIENDLY or the caster themselves), that ally's weapon is imbued instead of the caster's. Falls back to the caster when no friendly tokens are targeted. Works cross-owner via the socket relay — players can imbue an ally actor they don't own.
- **Multi-target Imbue** — Paying `+2` Mana per extra Target now actually imbues multiple wielders. Weapon-selection dialog runs once per wielder.
- **Wielder picker when over-targeted** — If the caster has more friendly tokens targeted than the cost paid for, a picker dialog appears with a live "Selected N / M" counter that auto-caps at the paid amount. Pick exactly the allies you want to receive the imbue; the rest roll off.
- **Chat attribution** — The imbue chat card now reads "`CasterName` imbues `AllyName`'s `Weapon` with `Spell`" when the caster and wielder differ.

## v0.3.1

### Bug Fixes — Imbue
- **Spell damage bonuses now apply to imbued attacks** — A trinket/AE granting `universalSpellDamageBonus` (e.g., +1 spell damage) was being silently dropped on imbued weapon attacks because the imbue dice rolled through the weapon damage path, which only reads weapon/legacy universal bonuses. The imbue formula now appends `universalSpellDamageBonus` + `universalSpellDamageDice` alongside the spell dice.
- **Imbue weakness to spell's damage type** — If all targeted enemies are weak to the imbue spell's damage type (and not the weapon's), a bonus weakness die is pre-rolled into the combined damage. Previously only the weapon's damage type was checked for weakness.
- **No more phantom damage on imbue miss** — The force-auto-roll flag was being set in the rollAttack pre-hook, causing weapon damage to auto-roll even on a missed imbued attack. Force is now only set after a confirmed hit.

### UX
- **Imbue damage type visible on attack card** — Imbued weapon attack cards now display an "Imbued: [Spell] (Type)" tag alongside the weapon's own damage tag so both damage types in play are visible at a glance.

## v0.3.0

### New Features — Ward Spell Automation
- **Ward spell automation:** Full reactive Ward spell implementation. Cast Ward on a target to apply a "Warded" Active Effect. When the Warded target takes damage (via save or direct application), the caster is prompted with a dialog to make a Cast Check and optionally spend extra Mana for additional d6 reduction dice.
- **Cast Check on damage:** Ward's Cast Check only triggers reactively when the target takes damage — not on the initial cast. On pass, damage is reduced by d6 (+d6 per extra Mana spent). On crit (natural 20), all damage from the hit is negated.
- **Post-damage healing:** Ward reduction is applied after the full save/armor/weakness pipeline resolves, healing back the Ward amount (capped at the actual damage taken from the hit — Ward can't heal pre-existing damage).
- **Mana spending dialog:** Shows current mana, cast difficulty, and a dropdown to spend 0–N extra Mana for additional d6 reduction dice.
- **Aura delivery support:** Ward is registered in the Aura Spells system. Casting Ward with Aura delivery protects all allies within the aura radius.
- **Focus cleanup:** Warded AE is automatically removed when the caster stops focusing on Ward (round/turn change).
- **No initial Cast Check:** Ward spell items on characters are automatically set to skip the Cast Check on initial cast (the check only applies reactively).

### UI Improvements
- **Tab bar shrinking:** When 5+ tabs are present on a character sheet (e.g., Beast Form + Summon + Features + Magic + Effects), tab text is slightly reduced to prevent crowding and truncation. Sheets with 4 or fewer tabs are unaffected.
- **Cookbook tab position:** Alchemist Cookbook tab now appears on the far left, consistent with other VCE-injected tabs.

### Documentation
- **Spell automation reference:** Fixed duplicate Exalt entry (was listed as both automated and easy-to-automate). Updated counts.

## v0.2.9

### Bug Fixes
- **Alchemy weapons missing Thrown property** — Crafted offensive alchemical items (Alchemist's Fire, Acid Flask, etc.) now correctly receive the Thrown weapon property. Previously these weapons were stuck at 5' melee range despite being set to "Near" range because the Thrown property was never added during weapon conversion.
- **Range hinder not applied to dice** — Thrown weapons at Far range (>30ft) showed a "Hindered" notification but the hinder wasn't actually applied to the d20 roll. The system's `rollAttack` ignores the favorHinder string parameter — it builds favor/hinder internally from Active Effects and keyboard modifiers. Fixed by routing the range hinder through `buildAndEvaluateD20WithRollData`.
- **Materials are now weightless** — Materials items converted to consumables for alchemy crafting now have zero slot cost (`baseSlots: 0` + `trueZeroSlot` flag), preventing inflated inventory slot counts when stacking quantities.
- **Fixed module download URL** — Manifest now uses the `latest` redirect for downloads so Foundry can detect and install updates correctly.

## v0.2.7

### New Features — Merchant Gold Sink
- **Gold Sink tab:** New "Gold Sink" tab on Merchant character sheets. Browse and buy items from the Weapons, Armor, Gear, and Alchemical Items compendiums. Relics are excluded.
- **Search & filters:** Text search, type filter toggles (Weapons/Armor/Gear/Alchemical), and gear subfolder dropdown for the 18 gear categories.
- **Alchemical item prep:** Purchased alchemical items use the same conversion pipeline as Alchemist crafting — offensive items become throwable weapons, healing potions are marked as consumables, and alchemical effect flags are set.
- **Sell Junk:** "Sell Junk" button in the tab header sells all items marked as junk (shared with vagabond-crawler's junk system). Configurable sell ratio via module setting (default 100%).
- **Chat cards:** Buy and sell transactions post chat cards using the system's card format.
- **Loot log integration:** Sold items are logged to vagabond-crawler's loot tracker when the crawler module is active.
- **Favorites system:** Right-click shop items to favorite them (gold star). Favorites sort to the top of the shop list and appear as a "Gold Sink" tab in the vagabond-crawler combat action strip for quick purchasing during play.

### Crawler Integration
- **Gold Sink combat tab:** Merchants with favorited Gold Sink items get a "Gold Sink" tab in the crawler's combat dropdown. Clicking an item buys it instantly (deducts gold, creates item, posts chat card). Price shown in red if unaffordable.

## v0.2.6

### New Features — Generic Polymorph Support
- **Polymorph for any caster:** The Beast Form tab, focus-triggered transform, beast favorites, and beast action rolls now work for any character with the Polymorph spell — not just Druids. A Wizard, Sorcerer, or any caster who learns Polymorph gets full automation. Beast action rolls use the caster's own Cast Skill (Arcana for Wizards, Influence for Sorcerers, etc.).
- **Polymorph Mana Drain:** 1 Mana is automatically deducted per round while focusing Polymorph in combat. Chat notification shows mana spent. If mana reaches 0, the polymorph auto-reverts with a warning. The Shapechanger perk correctly exempts from this cost (no Mana to Focus on self-Polymorph).
- **Feature Detector spell scanning:** The feature detector now scans spell items. Adding/removing a Polymorph spell triggers an automatic rescan and updates the Beast Form tab visibility.
- **Generic Polymorph FX:** Non-Druid casters get a separately configurable `polymorph_shift` animation in the Feature FX settings. Druids keep their existing `druid_feralShift` FX.

### Bug Fixes — Exalt Spell
- **Exalt +2 vs Undead/Hellspawn:** Fixed Exalt not applying the doubled bonus against Undead/Hellspawn targets. The target check now uses stashed attack targets (`_vceAttackTargets`) instead of `game.user.targets`, which could be cleared by the time `rollDamage` fires.
- **Exalt bonus dice count:** Moved Exalt damage calculation to run after silver weakness and imbue dice injection, so bonus dice from those sources are counted toward Exalt's per-die bonus. Previously Exalt only counted base weapon dice.
- **Exalt damage restore order:** Fixed formula restoration order in rollDamage (last applied = first restored) to prevent stale formulas leaking between rolls.

### Bug Fixes — Aura Manager
- **Exalt aura icon 404:** Fixed typo in Exalt aura icon path (`prayer-hands-glowing-yellow-light.webp` → `prayer-hands-glowing-yellow.webp`). Eliminates console 404 errors on every token movement near an Exalt aura.

### Druid-Specific Changes
- **Savagery +1 Armor:** Remains gated to Druid L8+ only — non-Druid casters don't get the armor bonus.
- **Polymorph AE flag:** Changed from `druid_polymorph` to generic `polymorph` for class-agnostic tracking.

## v0.2.5

### Code Cleanup
- **Vanguard size logic:** Replaced inline `SIZE_ORDER` constant and size comparison logic in Guard Shove with shared helpers from brawl-intent.mjs (`getActorSize`, `getEffectiveShoveSize`).
- **Rogue combat hooks:** Removed 2 redundant hooks (`combatTurnChange`, `combatRound`); the single `updateCombat` hook already covers both.
- **Parallel DB writes:** Parallelized sequential `await` calls in Wizard Page Master, Vanguard `_clearGuardFlags`, and Vanguard Protector block rolls using `Promise.all()`.
- **Revelator Selfless regex:** Eliminated duplicate regex executions — `damage-final` and `HP` patterns now parsed once and cached.
- **Main module cleanup:** Removed noisy Page Master comment block and console.log from vagabond-character-enhancer.mjs.

## v0.2.5 (initial)

### New Features — Wizard Class
- **Page Master (L1):** "Spend Studied Die (+1d6)" button injected onto spell damage chat cards. Rolls 1d6, updates the damage total and all save/apply button amounts on the card, decrements studied dice. Works from both character sheet and crawler strip.
- **Sculpt Spell (L2) / Archwizard (L10):** Changed from Module AE to System status — the Vagabond system already handles these via AEs on the class compendium item. Removed duplicate managed AEs that were double-dipping delivery mana cost reduction.
- **Extracurricular (L6):** Changed from Todo to Flavor (player-tracked).

### New Features — Brawl Intent
- **Grapple auto-execute on hit:** Choosing Grapple from the intent dialog and hitting now automatically applies Restrained/Grappling statuses via the system's `handleGrapple`. No extra button click needed.
- **Shove auto-execute on hit:** Choosing Shove and hitting shows the Push 5' / Prone dialog immediately.
- **Orc Beefy favor:** Now correctly grants Favor on Grapple/Shove attack checks from the intent dialog.

### Documentation
- **Spell Damage Path Limitations:** Added comprehensive CLAUDE.md documentation on why static method patches, prototype patches, instance patches, and in-memory actor data modifications all fail for the spell damage path, and why `renderChatMessage` button injection is the only reliable approach.

### Bug Fixes
- **Wizard Sculpt Spell double-dip:** Removed managed AE that duplicated the system's built-in delivery mana cost reduction. Was giving -2 instead of -1 at level 2.

### README Updates
- Updated Wizard, Witch, and Vanguard sections to reflect current implementation status.

## v0.2.4

### New Features — Vanguard Class
- **Stalwart / Protector Perk (L1):** When an ally fails a save, auto-rolls an Endure (Block) save for any Protector within 5ft of the attacker. On pass, heals the ally for the highest damage die (retroactive block). Works for both GM and the Protector's owning player.
- **Guard (L1):** Two triggers — enemy enters Close range or Vanguard passes a Block save. Posts a prompt card with a "Shove" button. On click, rolls a Brawl check (with Orc Beefy and Bully perk Favor) and offers Push 5' / Prone on pass. Once per round, cleared on combat turn change.
- **Wall (L4/L8):** Fixed feature detection — registry keys now match compendium names ("Wall (Large)" / "Wall (Huge)"). Managed AE + shove size override lets Vanguards shove Large/Huge targets via brawl-intent system.
- **Indestructible (L10):** Immune to melee/ranged attack damage while Armor ≥ 1 and not Incapacitated. Spell/cast damage still applies. Posts "Indestructible" chat card when triggered.

### New Features — Brawl Intent Improvements
- **Brawl Intent Dialog moved to rollAttack level:** The Damage/Grapple/Shove intent dialog now works from BOTH the character sheet AND the vagabond-crawler action strip. Previously only triggered from the character sheet.
- **Auto-execute on hit:** Grapple auto-applies Restrained/Grappling statuses on hit. Shove shows Push/Prone dialog immediately on hit. No extra chat card button clicks needed.
- **Orc Beefy Favor:** Orc ancestry Beefy trait now grants Favor on Grapple/Shove attack checks (was previously only tracked for Bully perk).
- **Grapple button click handler:** Module now wires its own click handler for Grapple buttons, fixing hook ordering issues with the system's renderChatMessageHTML.

### New Features — Sorcerer Class
- **Tap, Arcane Anomaly, Spell Twinning:** Changed from Todo to Flavor (player-tracked, no automation needed).

### Bug Fixes
- **measureDistance token size:** Distance calculation now accounts for Large/Huge/Colossal token footprints. Uses grid-square gap instead of corner-to-corner pixels, so a Medium token adjacent to a 3x3 Huge token correctly reads 5ft from any angle.
- **Wall (Large) icon 404:** Replaced missing `wall-shield.webp` with valid `heater-crystal-blue.webp`.
- **Protector icon 404:** Replaced missing `heater-steel-sword-blue.webp` with valid `heater-crystal-blue.webp`.
- **Protector attacker detection:** `_saveSourceActorId` is cleared before createChatMessage fires. Added fallback that parses attacker from the preceding damage card in chat.
- **Protector HP field:** Fixed `system.hp.value` → `system.health.value` (Vagabond uses `health`, not `hp`).

### Architecture
- **Dual Code Path Documentation:** Added CLAUDE.md table documenting which patch levels work from both the character sheet and the crawler strip. Rule: always patch at `VagabondItem.prototype.rollAttack` / `rollDamage` or lower, never rely on `RollHandler`.
- **Exported measureDistance:** `range-validator.mjs` now exports `measureDistance` for use by other modules (Guard, Protector distance checks).

## v0.2.3

### New Features — Rogue Class
- **Sneak Attack (L1):** Favored attacks that hit deal bonus d4 damage and ignore Armor equal to the number of bonus dice. Scales: 1d4 at L1, 2d4 at L4, 3d4 at L7, 4d4 at L10. Bonus dice injected into the damage roll formula. Armor penetration applied in `calculateFinalDamage`. Chat notification on trigger.
- **Evasive (L4):** Ignore Hinder on Reflex Saves while not Incapacitated. Remove two highest Dodge damage dice instead of one on passed saves. Shares infrastructure with Dancer Evasive.
- **Lethal Weapon (L6):** Removes the "first attack only" restriction from Sneak Attack — all favored hits on a turn trigger Sneak Attack.

### Bug Fixes
- **Feature Name Collision:** Feature detector now correctly resolves features that share names across classes (e.g., "Evasive" in both Rogue and Dancer, "Fleet of Foot" in both Monk and Dancer). Previously the last-registered class always won, causing Rogues to get `dancer_evasive` instead of `rogue_evasive`. New multi-map lookup matches by actor's class.
- **Holy Diver Icon:** Replaced missing `projectiles-blades-702702-yellow.webp` with valid `beam-rays-yellow.webp`.

## v0.2.2

### New Features — Revelator Class
- **Selfless (L1):** When an ally takes damage, a prompt offers to redirect the damage to the Revelator. Uses raw pre-armor damage amount (can't be reduced). Once per turn.
- **Lay on Hands (L2):** "Heal" button injected directly into the character sheet Features panel. Clicking posts a chat card with a Heal button — target a token and click to restore d6 + Level HP. 2 uses per Rest (auto-resets). Divine Resolve (L6) also cures Blinded/Paralyzed/Sickened on heal targets.
- **Paragon's Aura (L4):** Status changed to partial — +1 Focus AE and AuraManager template tracking work, but free Aura Mana delivery is not enforced.

### Bug Fixes
- **Divine Resolve AE:** Status immunities were stored as a single comma-separated string (`"blinded,paralyzed,sickened"`) instead of three separate array entries. The system's `Array.includes()` check never matched. Now creates one AE change per status.
- **Sacrosanct AE:** Save bonus keys were missing `system.` prefix and endure used `difficulty` instead of `bonus`. Fixed registry and recreated AEs.
- **Sacrosanct Icon:** Replaced missing `saint-glass-portrait-halo-yellow.webp` with valid `chalice-glowing-gold.webp`.
- **Summoner Soulbonder Immunities:** Same comma-separated string bug as Divine Resolve — `immunities.join(",")` now maps to separate AE changes.
- **Sheet Injection Hook:** Lay on Hands button used `renderActorSheet` which never fires for Foundry v13 ApplicationV2 sheets. Changed to `renderApplicationV2`.

## v0.2.1

### New Features — Weapon Range Enforcement
- **Range Validation:** Blocks attacks on out-of-range targets with a warning showing weapon max range vs target distance. Supports Close (5ft), Near (30ft), Far (unlimited) range bands plus Long (+5ft), Ranged, Thrown, and Near weapon properties. World setting (`enforceWeaponRange`), on by default.
- **Auto-Hinder:** Ranged weapons at Close range (≤5ft) automatically apply Hinder (unless character has Akimbo Trigger perk). Thrown weapons at Far range (>30ft) also auto-Hinder.
- **Target Count Enforcement:** Non-Cleave weapons can only target 1 enemy. Cleave weapons limited to 2. Spin-to-Win perk removes the cap. Monk Martial Arts grants implicit Cleave on Finesse weapons (2 targets).

### New Features — Cleave Damage Fix
- **Half Damage to All Targets:** Cleave now correctly deals half damage to all targets (not full to first, half to rest). Odd damage rounds up for the first target, down for the rest (e.g., 7 → 4 + 3). Minimum 1 damage per target.
- **Both Damage Paths:** Works through both direct damage (`handleApplyDirect`) and save-based damage (`handleSaveRoll`).
- **Monk Martial Arts Cleave:** Also updated to half damage to both targets (primary retroactively adjusted).

### New Features — Spin-to-Win Perk
- **Unlimited Cleave Targets:** Managed AE sets `cleaveMaxTargets` to 100, bypassing the normal 2-target Cleave limit.

### Bug Fixes
- **Managed AE Sync:** `_syncManagedEffects` now runs on every scan, not just when feature flags change. Fixes perk AEs (like Spin-to-Win) not being created on actors that were already scanned before perk AE support was added.
- **Monk Finesse Cleave Blocked:** Range validator no longer blocks 2-target attacks with Finesse weapons when the Monk has Martial Arts.

## v0.2.0

### New Features — Monk Class
- **Martial Arts (L1):** Full automation — 1 target applies Keen (finesseCritBonus -1 via temp AE), 2 targets applies Cleave (half damage to second target). Damage die escalates per Finesse attack each round (d4→d6→d8→d10→d12, capped). Forces auto-roll damage to ensure escalation applies.
- **Fleet of Foot (L1):** System-handled via class item AE (reflexCritBonus scaling). Flag detection only.
- **Fluid Motion (L2):** Flavor (walk on walls/water).
- **Impetus (L4):** Passed Reflex saves now remove the **two** highest damage dice instead of one. Patched `_removeHighestDie` to support removing N dice.
- **Flurry of Blows (L6):** Flavor (player-tracked action economy).
- **Empowered Strikes (L8):** Managed AE — `finesseDamageDieSizeBonus +2` (d4→d6).

### New Features — Treads Lightly Perk
- **Region Movement Cost Bypass:** Characters with the Treads Lightly perk (Monks, Dancers, or anyone who takes it) ignore walk-type `modifyMovementCost` region behaviors. Patches both Foundry's `_getTerrainEffects` and Vagabond Crawler's `_getTerrainDifficulty`.

### New Features — Evasive / Impetus (Two Dice on Dodge)
- **Dancer Evasive (L2):** Now posts a chat reminder AND removes 2 highest dice on passed Reflex saves (was TODO for the dice removal).
- **Monk Impetus (L4):** Same mechanic — removes 2 highest dice on passed Reflex saves.
- **Implementation:** Patched `VagabondDamageHelper._removeHighestDie` to accept a configurable count. `handleSaveRoll` wrapper sets count to 2 when target has `dancer_evasive` or `monk_impetus`.

### Bug Fixes
- **Save Card Parsing:** Fixed Impetus, Prowess, and Evasive chat reminder hooks to parse `header-title` instead of nonexistent `roll-skill-label` in save chat cards. All three were silently failing to detect saves.
- **Pugilist Prowess:** Now correctly triggers on passed Endure (Block) saves.

## v0.1.9

### Bug Fixes
- **Focusing Status Triple-Apply:** Fixed race condition where focusing a spell created 3 "Focusing" Active Effects instead of 1. The module's `_syncFocusingStatus` now checks embedded effects directly (not the laggy derived `statuses` Set) and only runs when feature focus is active — the system handles spell-only focus.
- **Bless Aura Duplicate on Allies:** Fixed `_setBlessAuraMode` being called twice (direct call + createChatMessage hook) causing a race condition that applied duplicate Bless buff AEs to allies. Removed the redundant direct call.
- **Bless Aura Cleanup:** `_removeAllBuffs` now uses `filter()` instead of `find()` to remove all matching buff AEs, not just the first — prevents stale effects lingering after aura deactivation.
- **Bless Player Console Errors:** Added permission check before attempting to inject Bless mode buttons into chat messages, preventing "lacks permission to update ChatMessage" errors on player clients.
- **Aura Radius Always 10ft:** Fixed regex that parsed aura radius from chat cards. The system outputs `"Aura 15' radius"` but the regex expected digits at the start of the attribute value, so it always fell back to 10ft.
- **Imbue Double Armor:** Imbue spell damage is now combined into the weapon's damage formula (same pattern as Exalt/Silver weakness) instead of rolling as a separate chat card. Armor is applied once to the combined total instead of twice. Forces auto-roll when imbued to ensure the patched `rollDamage` path is used.

## v0.1.8

### Major Fixes
- **Silver/Metal Weakness Overhaul:** Completely reworked how silvered weapon bonus damage works across all code paths (character sheet, Crawler, auto-roll, manual button). Fixed system gap where typeless weapons never triggered metal weakness.
  - Extra weakness die now visible in the damage roll (not silently added at apply time)
  - `_weaknessPreRolled` flag prevents double-counting between roll-time and apply-time
  - Armor bypass for silvered weapons on typeless damage in `calculateFinalDamage`
  - Target stashing in `rollAttack` ensures correct target detection regardless of timing
  - Works with both "Roll Damage With Check" ON and OFF settings
- **Bless Aura — GM Confirmation Flow:** Player choices (Allies/Weapons mode) now route through GM confirmation for permission-safe application. Aura mode stored in `activeAura` flag for persistent range tracking.
- **Bless Aura — Self-Buff:** Caster now receives their own aura buff (previously excluded).
- **Bless Aura — Weapon Restoration on Leave:** Silvered weapons properly restored when tokens leave aura range or aura deactivates.
- **Aura Expiry Without Focus:** Unfocused auras now expire after 1 round (checked on combat round change).
- **Focusing Status Race Condition:** No longer tries to remove Focusing status ourselves — let the system handle removal to avoid "does not exist" errors.
- **Sequencer FX Fix:** `endEffects` uses string name instead of regex (Sequencer requires string).
- **Chat Message Permission:** Bless button injection wrapped in try/catch for player permission errors.

### Documentation
- **`docs/silver-weakness-system.md`**: Comprehensive technical documentation of all silver weakness code paths, system gaps, module fixes, and gotchas. Essential reading for future development.

## v0.1.7

### New Features — Witch Class
- **Hex (L1):** Mark targets as Hexed via button on spell chat cards. Tracks hex slots (max = ceil(level/2)), auto-removes oldest when over capacity. "Hexed (WitchName)" AE visible on target.
- **Things Betwixt (L4):** Once per Scene, become invisible until next Turn. Requires Focus. Automatically removed on round change. API: `game.vagabondCharacterEnhancer.betwixt(actor)`.
- **Widdershins (L8):** Hexed targets are Weak to the witch's damage — armor bypassed in calculateFinalDamage. Does not ignore Immunity.

### New Features — Bless Spell
- **Bless Mode Selection:** After casting Bless, chat card shows "Bless Allies (+d4 Saves)" and "Bless Weapons (Silvered)" buttons.
- **Bless Allies — Actual d4 per Save:** Rolls a real 1d4 and adds it to the save roll formula (visible as a die, like Favor's d6). Patches the roll builder temporarily per save.
- **Bless Weapons — Silvered:** Sets equipped weapon metal to "silver" for the duration. Restores original metal when Bless expires.
- **Duration Tracking:** Bless AEs auto-expire on round change unless the caster is Focusing on Bless. Aura Bless managed by AuraManager lifecycle.
- **Silver Weakness Fix:** The system skips metal weakness checks for typeless ("-") damage. Module now handles this: silvered weapons bypass armor on silver-weak targets, and the extra weakness die is added to the visible damage roll formula.

### Bug Fixes
- Fixed aura template duplication (4x templates on cast) — added message ID de-duplication guard.
- Fixed stuck Sequencer aura FX — deactivate now stops effects by both name and token source, plus safety net regex cleanup.
- Fixed `_checkFocusDrop` not awaited, causing incomplete aura cleanup.
- Bless aura AEs now include `blessAE` flag for d4 save detection.

### API
- `game.vagabondCharacterEnhancer.hex(actor, targetId, targetName, targetImg)` — Apply hex
- `game.vagabondCharacterEnhancer.unhex(actor, targetId)` — Remove hex
- `game.vagabondCharacterEnhancer.betwixt(actor)` — Use Things Betwixt

## v0.1.6

### New Features
- **Second Nature (L4):** When conjuring, choose between Focus (1 Mana/round) or Cd4 duration (no focus needed). Countdown die rolled each round — summon expires when it shrinks past d4.
- **Avatar Emergence (L6):** Once per Shift, conjure a Summon without spending Mana. Dialog offers free conjure or pay mana. Resets when mana is restored to max (on Rest).
- **Guardian Force (L8):** If summoner drops to 0 HP with a Summon conjured, the summon persists on a Cd4 countdown. When the countdown expires, the summoner is revived at 1 HP and gains 1 Fatigue.
- **Improved Summon Tab:** Active summon panel now shows full NPC stat block — portrait, HD/Size/Type tags, HP bar, armor overlay, speed group, movement types, senses, immunities, weaknesses, clickable actions, and abilities. Matches the Druid Beast Form panel styling.
- **Custom Compendium Packs:** Module now ships with 3 new compendiums:
  - **VCE: Custom Classes** — Dragoon, Summoner, Samurai, Jester, Psychic, Monk
  - **VCE: Custom Perks** — Summoner (Conjurer) perk
  - **VCE: Custom Ancestries** — Harpy, Fiend, Mimic, Satyr, Varmi, Centaur, Golem, Changeling, Pollywog, Rook, Pixie, Lepus

### Bug Fixes
- Fixed Soulbonder armor bonus using wrong Active Effect key (`system.bonuses.armor` → `system.armorBonus`).

## v0.1.5

### New Features
- **Summoner Class Support:** Core automation for the Summoner class from the "From the Archive" supplement.
  - **Creature Codex:** Right-click creatures in the Summon tab to add/remove from your personal Codex. Only Codex creatures can be conjured.
  - **Conjure Flow:** Click a Codex creature to conjure it — deducts Mana (= creature's HD), places a token on the canvas, and acquires Focus.
  - **Summon Actions:** Click summon actions in the Summon tab to roll them using the summoner's Mysticism check. Uses the system's native chat card styling with proper d20 roll, damage, and Apply Direct/Save buttons.
  - **Banish:** Banish button on the Summon tab, or auto-banish on 0 HP, focus drop, or out of mana. Tokens cleaned up automatically.
  - **Soulbonder (L2):** Summoner gains the summon's Armor and Immunities as managed Active Effects while the summon is conjured.
  - **Combat Mana Drain:** 1 Mana automatically drained per round while maintaining Focus on a summon.
  - **Crawler Integration:** Summon actions appear as a new tab on the Vagabond Crawler strip with the creature's name. Includes Banish option.
  - **Ultimate Weapon (L10):** Summon HD cap increases by +5.
- **Feature Detection:** Summoner class features (Arcanum, Creature Codex, Soulbonder, Second Nature, Avatar Emergence, Guardian Force, Ultimate Weapon) auto-detected from compendium data.

### API
- `game.vagabondCharacterEnhancer.conjure(actor)` — Open conjure dialog
- `game.vagabondCharacterEnhancer.banish(actor)` — Banish active summon
- `game.vagabondCharacterEnhancer.getSummonData(actor)` — Crawler integration data

## v0.1.4

### New Features
- **Draconic Resilience (Draken ancestry):** Choose Acid, Cold, Fire, or Shock — take half damage from that type (applied after saves, before armor). Visible as an Active Effect on the character sheet with chat notifications on trigger. Re-pick via `game.vagabondCharacterEnhancer.setDraconicResilience(actor)`.
- **Imbue Spell Delivery:** Full automation of the Imbue delivery type. Casting a spell with Imbue skips d20/damage rolls, deducts mana, and opens a weapon selection dialog. On the next hit, imbued spell damage is rolled separately with the spell's damage type and its own Apply Direct button. Consumed on hit or miss. Works from both the character sheet and the Vagabond Crawler strip.
- **Exalt Per-Die Damage Bonus:** Exalt now correctly adds +1 per damage die (+2 vs Undead/Hellspawn) to weapon damage rolls. Triggers when focusing on Exalt (any delivery) or when receiving the Exalt aura buff. Will save bonus remains as an Active Effect.
- **Light Focus — Token Light Emission:** When the Light spell is focused, the caster's token emits 30' bright light with a warm golden torch animation. Light settings are saved and restored when focus drops. Persists across scene changes.

### Bug Fixes
- Fixed duplicate "Focusing" status effect when casting with Focus via the Vagabond Crawler.

## v0.1.3
- Brawl intent system (Grapple/Shove) for Brawl and Shield weapons
- Spell Surge cast-only filter fix
- Luminary postScan hook and icon fixes
- Luminary healing feature rewrites (Radiant Healer, Overheal, Ever-Cure)
