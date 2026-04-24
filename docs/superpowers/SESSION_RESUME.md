# Session Resume — v0.4.0 (In Progress)

**Last updated:** 2026-04-23 (end of session)
**Branch:** `main`
**Last commit:** `54f39aa fix(infesting-burst): restore up-front Boomer prompt (Raise multi-pick compat)`
**Pending version bump:** `module.json` still at `0.3.4`; CHANGELOG has `v0.4.0 — In Progress` section being built up.

---

## What's shipped (all landed on main)

### Phase 1 — CompanionManager foundation
Replaced the old single-summon tab with a unified Companions tab driven by a source-agnostic engine.

- **Engine** (`scripts/companion/`): `companion-sources.mjs` (registry), `companion-spawner.mjs` (spawn/dismiss/query + per-source dismiss handler API), `companion-termination.mjs` (zeroHP auto-dismiss, 250ms deferred), `creature-picker.mjs` (rich table, multi-pack, favorites, single/multi-select, include/exclude type filters), `companion-manager-tab.mjs` (tab renderer), `gather-companions.mjs` (Party-Token-style compress/release)
- **Summoner + Familiar** refactored onto `CompanionSpawner.spawn` with dismiss handlers for focus release + Soulbonder + activeConjure/activeFamiliar cleanup
- **Pre-Phase-1 fix:** Familiar banish now 250ms-deferred (commit `1c03fe5`) — same defer pattern the termination manager uses

### Phase 2 — Feature adapters (6 total)
- **Beast spell** — multi-select picker with cumulative HD budget `max(1, floor(level/2))`, fresh-import per spawn (so 2 wolves don't share a world actor), focus trigger via `system.focus.spellIds`, mana drain 1/round while focused, dismiss-all-on-drop-focus
- **Raise spell** — multi-select picker with cumulative HD budget `level`, excludes Artificial/Undead/Construct/Object, Undead template applied post-spawn
- **Animate spell** — item picker on caster's ≤1-Slot inventory, creates synthetic "Animated X" NPC (HD 1, HP 3, Armor 0), deletes on dismiss
- **Animal Companion perk** — single companion (rulebook-compliant), Beast filter, context-menu + tab button
- **Reanimator perk** — 10-min ritual, single undead per Shift, Undead template, context-menu + tab button
- **Conjurer perk** — registry-backed resummon (on-kill watcher populates `flags.defeatedCreatures`), hidden on tab bar if Summoner class is present (dedup)

### Raise-adjacent perks
- **Grim Harvest** — GM-side tracker; spell kills of non-Artificial/Undead within 5s heal caster by spell damage
- **Infesting Burst** — prompts "Raise a Zombie Boomer?" before the picker when the perk is active (up-front choice, limits user to Boomer OR regular raises per cast)
- **Necromancer** — injects a "Necromancer Heal (+N)" button on raised-undead cards in the Companions tab

### UX improvements
- **Tab action bar** — feature-gated buttons showing the actual spell/perk name (Conjurer, Beast, Raise, Animate, Familiar, Animal Companion, Conjurer perk, Reanimator). Single source of truth for spawning; per-button async locks prevent double-dialog
- **Dual entry points** — spells trigger via cast chat card OR tab button OR Focus toggle; perks trigger via context menu OR tab button
- **Right-click favorite** in creature picker; favorites sort to top and reorder instantly
- **Spawn defaults** — tokens get prototypeToken texture (wildcard-resolved via `actor.getTokenDocument`), auto-sense detection (Darksight → Darkvision), fastest-movement default (e.g. Bee Giant defaults to Fly), FRIENDLY disposition, vision enabled
- **Ownership** — `placeToken` grants OWNER to all users who own the caster (not just the requester), so GM-triggered summons go to the player

---

## Where we left off (mid-session)

Beast testing wrapped up — all confirmed working as intended:
- Budget enforced correctly at correct level path (`system.attributes.level.value`)
- Fresh-import per spawn prevents shared-world-actor bugs
- Focus unification: `_isFocusingBeast(actor)` checks both `system.focus.spellIds` AND VCE `featureFocus`
- Mana drain + drop-focus-dismiss-all works
- "Favor on reflex" investigation: NOT a bug — the Archmage had Blinded on its world actor (pre-existing data from some prior action); the system's `damage-helper.mjs:1519` reads `game.actors.get(actorId).system.outgoingSavesModifier` which is correct Vagabond rulebook behavior (Vulnerable attacker → defender saves favored). Fix = delete errant world-actor AE. User chose to ignore for now.

**Paused during Raise testing** — haven't tested the Raise flow yet this session.

---

## Open items for tomorrow

### Immediate — continue Raise testing
1. Cast Raise on a L4+ caster → rich table picker opens (excludes Artificial/Undead/Construct/Object from bestiary)
2. Multi-pick within HD budget → all spawn, batch chat summary, Undead template AE applied to each (`system.beingType=Undead`, Darksight, `statusImmunities: sickened,poisoned`)
3. With **Infesting Burst** → up-front "Raise a Zombie Boomer?" prompt, Yes → HD 3 Boomer only, No → normal picker
4. With **Necromancer** → purple "Necromancer Heal (+N)" button appears on each raised card; click heals the undead by ceil(level/2)
5. With **Grim Harvest** → cast a damaging spell → kill an eligible target → caster heals within 5 seconds
6. Drop focus → all raised undead dismissed + world actor cleanup (freshImport flag on meta)

### Known limitations documented during session
- `raise-perks.mjs` Reanimator/Animal Companion registry still uses `skill: "mana"` not Craft/Survival per rulebook. npcAction routing uses mana skill. Documented in the self-reflection; fix when it surfaces.
- Per-adapter dismiss handlers use different flag names (`importedFromCompendium` for Summoner/Familiar/AC/Reanimator/Conjurer, `freshImport` for Beast, `synthetic` for Animate). All work independently; inconsistency is noted but not harmful.
- `CorpsePicker` module (`scripts/companion/corpse-picker.mjs`) is no longer used (Raise/Reanimator both use `CreaturePicker` with `excludeTypes`). Left in the tree; can delete later.
- End-of-Shift auto-banish for Reanimator not implemented (no formal Shift tracker in Vagabond yet).
- The `foundry-mcp-bridge` noise ("Could not establish connection", "Actor/Token does not exist") during companion death is extension-side, not VCE.

### Potential quick wins (future sessions)
- Run the **foundryvtt-cli** `unpack` on `vce-beasts`/`vce-perks`/`vce-classes`/`vce-ancestries` to get JSON source-of-truth for packs. Then `.gitignore` the LevelDB churn (every `000208.log`/`MANIFEST-*` diff) and a build script runs `pack` before release. Setup paused mid-session because Foundry was running and had a LevelDB lock.
- **Phase 2.1:** End-of-Shift auto-banish for Reanimator, per-round duration ticks for Raise + Beast, custom-creature workflow (bring back world-actor picker opt-in)
- **v0.5.x single-PR-per-feature work**: whatever the user finds missing

### Release checklist (when ready)
- Bump `module.json` version `0.3.4` → `0.4.0`
- Finalize the `## v0.4.0 — In Progress` CHANGELOG section (remove the "In Progress" marker)
- Tag: `git tag v0.4.0 && git push origin v0.4.0`
- Build zip via desktop Foundry client, publish GitHub release with `module.json` + `module.zip` attached

---

## Commits on `main` since v0.3.4 (for quick orientation)

Count: ~50. High-level groupings:

- **Docs + planning (8 commits)** — design system, spec, plan, tasks.json, session resume
- **Phase 1 core (10 commits)** — source registry, picker, spawner, termination, tab renderer, CSS, tab registration, Summoner refactor, Familiar refactor
- **Polish (9 commits)** — tab re-render fix, conjure-dialog lock, favorites, right-click favorite reorder, suppressChat, dismiss handler API, v0.4.0 changelog draft, placeToken ownership grant, GatherCompanions in VCE
- **Phase 2 adapters (5 commits)** — shared infra (undead-template, corpse-picker, createActor/createActorAE relay ops), Beast, Raise, Animate, three perks
- **Raise perks + action bar (4 commits)** — Grim Harvest, Infesting Burst, Necromancer, action bar registry refactor
- **Beast fixes (6 commits)** — token image wildcard, skill routing, focus trigger, mana drain, multi-count picks, level path fix, fresh-import, drop-focus guard
- **Raise refactor (2 commits)** — rich picker + excludeTypes, Infesting Burst up-front prompt

---

## Quick-reference files

| File | Purpose |
|---|---|
| `docs/superpowers/specs/2026-04-23-companion-manager-design.md` | Canonical spec |
| `docs/superpowers/plans/2026-04-23-companion-manager-phase1.md` | Phase 1 implementation plan |
| `docs/superpowers/plans/2026-04-23-companion-manager-phase1.md.tasks.json` | Task status persistence (all 11 tasks completed) |
| `docs/design-system.md` | UI design system for claude.ai/design |
| `CHANGELOG.md` | v0.4.0 section documenting everything |
| `scripts/companion/` | All engine + picker + tab + gather modules |
| `scripts/spell-features/{beast,raise,animate}-spell.mjs` | Phase 2 spell adapters |
| `scripts/perk-features/{animal-companion,reanimator,conjurer,raise-perks}.mjs` | Phase 2 perk adapters |
