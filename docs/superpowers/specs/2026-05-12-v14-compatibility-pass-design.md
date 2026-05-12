# VCE v14 Compatibility Pass — Design

**Date:** 2026-05-12
**Target:** FoundryVTT v14.360, Vagabond system v5.7.0
**Branch:** `v14`
**Working dir:** `E:\FoundryVTTv14\Data\modules\vagabond-character-enhancer\` (deployed copy, now a git working tree tracking `origin/v14`)

## Context

Vagabond Character Enhancer (VCE) is currently shipped at v0.4.15 with `module.json` declaring `compatibility: { minimum: "13", verified: "13.351" }` and the Vagabond system pinned to `verified: "5.3.0"`. The user is now running Foundry v14.360 (portable) with Vagabond system v5.7.0, which itself declares `verified: "14"`.

The deployed dir already contains uncommitted v14-specific fixes in two files (`scripts/aura/aura-manager.mjs`, `scripts/spell-features/effect-only-handler.mjs`) corresponding to a debug session on 2026-05-10 (memory obs 925-930). The `v14` branch on GitHub has not yet diverged from `main` — none of this work is pushed.

VCE is patch-heavy: it monkey-patches `VagabondItem.prototype.rollAttack`, `rollDamage`, `VagabondDamageHelper.calculateFinalDamage`, `_rollSave`, `RollHandler.roll`, `SpellHandler.castSpell`, `CrawlerSpellDialog._cast`, and registers many `Hooks.on("createChatMessage")` / `Hooks.on("renderChatMessage")` listeners. v14 deprecates several of these hook signatures and tightens DOM access patterns, so a blind version bump is unsafe.

## Goal

Ship VCE on the `v14` branch with verified compatibility on Foundry v14.360 + Vagabond v5.7.0, preserving all existing v0.4.15 automation behavior. No new features.

## Non-goals

- No ApplicationV2 migration of V1 dialogs that still work under v14 (deprecation-warning OK).
- No API redesign.
- No new automation, no docs restructure.
- No bumping to `0.5.0` — this is a patch-level compatibility release.

## Phase 0 — Workspace setup

Pure git/workspace plumbing. No source edits.

1. Restore `.gitignore` from `origin/v14` so the LevelDB pack churn (`packs/*/CURRENT`, `LOG.old`, `*.ldb`, `*.log`, `MANIFEST-*`) stops appearing as drift.
2. Verify `git status` after restore shows only the two known modified `.mjs` files.
3. Confirm `git log -1` points at the v0.4.15 commit (HEAD on local `v14` branch tracks `origin/v14`).

**Done when:** `git status` shows two modified files (the WIP v14 fixes) and nothing else.

## Phase 1 — Checkpoint commit + version bump

Lock down existing v14 WIP before touching anything else.

1. Stage and commit the two `.mjs` files as a fix commit summarizing all three changes (template delete-recreate, aura-tick race, effect-only damageDice=0).
2. Update `module.json`:
   - `version`: `0.4.15` → `0.4.16` (incremented per v14 work pass; final pre-release version TBD at Phase 4)
   - `compatibility.verified`: `"13.351"` → `"14.360"`
   - `relationships.systems[0].compatibility.verified`: `"5.3.0"` → `"5.7.0"`
   - Leave `compatibility.minimum: "13"` and system `minimum: "5.0.0"` — no need to force v14-only.
3. Append a `v0.4.16` section to `CHANGELOG.md` with the three checkpointed fixes (terse — full release notes added at Phase 4).
4. Commit module.json + CHANGELOG separately.

**Done when:** Two new commits on local `v14`, working tree clean, Foundry reloads without "incompatible module" warning.

## Phase 2 — v14 audit pass

Codebase-wide grep for known-broken v14 surfaces. Build a triage table before fixing anything.

### Surfaces to grep

| Surface | Status on v14 | Search |
|---|---|---|
| `Hooks.on("renderChatMessage"` | Renamed → `renderChatMessageHTML`. Old hook still fires but with deprecation warning. Passes `HTMLElement`, not jQuery wrapped. | grep |
| `Hooks.on("createChatMessage"` | Still works, but `message.content` parsing may behave differently. | grep |
| `Dialog.prompt`, `Dialog.confirm`, `new Dialog(` | Deprecated. `DialogV2.prompt` / `DialogV2.confirm` / `new DialogV2()`. Old still works. | grep |
| `app.element[0]`, `html[0]` in renderHook callbacks | jQuery wrapper gone in v14 for many hooks. If a callback receives `HTMLElement` directly, `html[0]` throws. | grep |
| `TextEditor.enrichHTML` sync call | Now async-required for some content. | grep |
| `canvas.scene.templates.get(...).update({x,y})` | Read-only post-create on v14 (the bug fixed in `aura-manager.mjs`). Need to find any other call sites. | grep |
| `CONST.CHAT_MESSAGE_TYPES` | Some enums deprecated (e.g., `.OTHER`, `.OOC`). | grep |
| `flags.core.statusId` | Replaced by `statuses` Set on ActiveEffect. | grep |
| `Combat#combatant` vs `Combat#combatants` access | Some API tightening. | grep (probably none used) |
| `game.user.isGM` style checks on socket relay | Unchanged, but worth verifying. | skim |
| `Token#center` vs `Token#getCenterPoint()` | API surface changes around token center. | grep |
| `ChatMessage#getHTML()` | Deprecated → `renderHTML()`. | grep |

### Output

A short triage doc (kept inline in this spec, not a separate file) listing each grep hit with:
- File:line
- Verdict: `MUST FIX` / `DEPRECATION OK` / `FALSE POSITIVE` / `ALREADY FIXED`
- One-line note on the fix approach for MUST FIX items

Triage doc is updated in-place in this spec file as Phase 2 progresses.

**Done when:** All grep surfaces have been audited and triaged.

## Phase 3 — Fix + smoke test

1. Implement MUST FIX items from Phase 2 triage, smallest-blast-radius first.
2. After each fix: reload Foundry via `mcp__foundry-vtt__evaluate { window.location.reload() }`, wait 3-5s, confirm no console errors, exercise the affected code path via `mcp__foundry-vtt__use_item` or direct method call.
3. Each fix is its own atomic commit.
4. After all MUST FIX items land: run the smoke harness if available (the harness scripts may not be deployed locally — restore from origin if needed).
5. Manual exercise of the most-patched features: spell cast (sheet + crawler strip), aura activation + follow + tick, imbue routing, polymorph beast form, companion spawn/dismiss, save reminder routing on a companion.

**Done when:** No console errors during the manual smoke walkthrough, no regressions in the most-patched features.

## Phase 4 — Release prep

1. Final `module.json` version bump if needed (e.g., `0.4.16` → `0.5.0` only if Phase 3 surfaced larger-than-expected breaking-change fixes).
2. Write proper `CHANGELOG.md` entry covering all Phase 1 + Phase 3 commits.
3. `pwsh ./build-zip.ps1` to produce `module.zip` (requires restoring `build-zip.ps1` from `origin/v14`).
4. Push `v14` branch to GitHub. Draft release with `module.json` + `module.zip` as assets.
5. User reviews release before tagging.

**Done when:** Tagged release on GitHub, manifest URL serves the new module.json.

## Risks

- **MeasuredTemplate workaround scope** — the delete+recreate pattern in `_updateTemplatePosition` is correct but may need to ripple to any other call site that mutates an existing template (Phase 2 grep covers this).
- **Crawler module coupling** — the crawler patches `CrawlerSpellDialog._cast`; if v14 changes how crawler's own dialog works, VCE patches there may also need updating. Verify crawler is itself v14-ready or note as blocker.
- **AE status set migration** — if any registry-driven AE uses `flags.core.statusId`, status icons may render twice or not at all on v14. Check before shipping.
- **Smoke harness availability** — the deployed dir lacks `docs/` and likely test scripts. If the harness lives in `scripts/smoke/` or similar, may need to restore from origin.

## Open questions

None — proceed.
