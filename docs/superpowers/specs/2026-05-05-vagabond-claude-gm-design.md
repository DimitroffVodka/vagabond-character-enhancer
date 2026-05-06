# Vagabond Claude GM — Design Spec

**Date:** 2026-05-05
**Status:** Approved — ready for implementation planning
**Authors:** dimitroffvodka + Claude (brainstorming session)

> Note: This spec was authored inside the `vagabond-character-enhancer` repo because that's where the brainstorming session ran. The artifact it describes lives in a new sibling repo, `vagabond-claude-gm` (see "Repo Strategy"). When that repo is created, this file is copied to `vagabond-claude-gm/docs/design.md` as the canonical reference.

---

## 1. Goal

Build a Claude-controlled Game Master that runs a long-running **Vagabond Megadungeon campaign** in FoundryVTT v13. The party descends into Zach Moeller's 12-level Megadungeon (pre-walled, pre-lit Foundry Scenes), exploring, fighting, looting, retreating to surface, and going deeper across many sessions. Mythic GME 2nd Edition supplies the emergent layer (Fate Questions, Random Events, NPC Behavior, Chaos Factor); the operator's `random-table` module supplies random encounters / room dressing / NPC seeds; VCE + vagabond-crawler handle combat mechanics; Claude is the persistent intelligence holding it all together via MCP.

Players interact via Foundry chat. Claude wakes on chat events, reads campaign state, calls Mythic and Random Table APIs, drives NPCs and the world, and narrates back. Sessions are 2–4 hours; campaigns span many sessions.

The system supports both **solo play** (1 PC, often the operator's voice) and **group play** (multiple human players, multi-PC) in the same FoundryVTT instance.

## 2. Decisions Log

| # | Question | Decision |
|---|---|---|
| 1 | Deployment shape | Solo + group play in FoundryVTT |
| 2 | Player input | Foundry-chat-driven loop (Claude wakes on new chat messages) |
| 3 | Game system | Vagabond-first, designed so a second system can plug in later |
| 4 | Claude authority | Full GM (places scenery, spawns NPCs, runs combat for NPCs, manages loot/conditions) |
| 5 | Runtime | Claude Code `/loop` now, swap-out path to Claude Agent SDK service later |
| 6 | Persistence | Hybrid — Foundry is source of truth for game state (actors, tokens, scenes); repo files own narrative state (Chaos Factor, Threads, Characters list, factions, scene log, world facts, per-level state) |
| 7 | Mythic engine | Use the existing **Mythic GME Tools** Foundry module (JeansenVaars, v2.11.1, distributed with permission from Tana Pigeon). Claude calls into it via foundry-mcp `evaluate`. Rolls auto-post to Foundry chat. |
| 8 | Player input trigger | Context-aware all-chat — Claude reads everything and decides per-message whether to respond |
| 9 | Combat model | Lean on automation — VCE/crawler/system handles dice and AE; Claude makes tactical decisions and triggers actions via foundry-mcp |
| 10 | Adventure structure | **Megadungeon** — Zach Moeller's `zm-map-collection` Megadungeon Levels 1–XII as the campaign spine. Pre-walled scenes; persistent campaign across many sessions. (One-shot / 5-Room mode reserved for v2.) |
| 11 | Architecture style | Layered — Foundry-side modules (Mythic Tools fork, random-table) provide engine/data via API shims; Claude orchestrates via foundry-mcp `evaluate` + file I/O on `campaign/`. No new MCP servers in v1. |
| 12 | Mythic engine source | Existing `foundryvtt-mythic-gme` (now forked at `DimitroffVodka/foundryvtt-mythic-gme`) — adds an API shim for programmatic returns |
| 13 | API shim — Mythic Tools | Yes — `game.modules.get('mythic-gme-tools').api` returning structured results in addition to chat posting |
| 14 | API shim — Random Table | Yes — `game.modules.get('random-table').api` exposing the existing generators (encounters, NPCs, room dressing, loot, blessings, mutator) as programmatic calls. ~50 LoC, no fork friction (operator owns the module). |
| 15 | Project repo | New repo `vagabond-claude-gm`, separate from the two forks |
| 16 | Campaign data | `campaign/` gitignored; `templates/new-campaign/` skeleton committed |
| 17 | Combat tactics | Vagabond Zone-based positioning (frontline / midline / backline). Target lowest current Luck pool when uncertain. |
| 18 | Map source | `zm-map-collection` (Zach Moeller, ~190+ scenes with integrated walls + lighting). Megadungeon Levels 1–XII as the v1 spine. |
| 19 | Map auto-walling | Out of scope for v1. Dyson Logos + auto-wall workflow deferred until a viable wall-extraction path exists. |
| 20 | Adventure entry hook | Surface start — party begins above Level 1 with a hook to enter the dungeon. Claude generates the hook from Mythic Meaning Tables + Random Table at kickoff. |
| 21 | Random Event on level entry | Yes — Mythic 2E scene-test runs on each new level entry; chaos check fires if applicable. |

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ FoundryVTT v13                                                  │
│  • Vagabond system                                              │
│  • VCE + vagabond-crawler (existing — combat automation)        │
│  • foundry-mcp-bridge (existing — Claude's window into Foundry) │
│  • mythic-gme-tools (forked + API shim — Mythic engine)         │
│  • random-table (operator's, + API shim — encounters / NPCs /   │
│    room dressing / loot / blessings / mutator)                  │
│  • zm-map-collection (190+ pre-walled scenes; Megadungeon       │
│    Levels 1–XII as the v1 spine)                                │
└──────────┬──────────────────────────────────────────────────────┘
           │ MCP
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Claude (Claude Code /loop, Phase 2: Claude Agent SDK service)   │
│  • System prompt (GM persona + Megadungeon + Mythic procedures) │
│  • Reads/writes campaign/ files (repo state)                    │
│  • Polls foundry-mcp for new chat messages                      │
│  • Calls Mythic via foundry-mcp evaluate(api.fateQuestion(...)) │
│  • Calls Random Table via evaluate(game.randomTable.api.*)      │
│  • Activates ZM Megadungeon scenes on level transitions         │
│  • Spawns NPCs, moves enemy tokens, triggers VCE combat actions │
└──────────┬──────────────────────────────────────────────────────┘
           │ file I/O
           ▼
           ┌──────────────────────────────────────────┐
           │  campaign/ (repo files, gitignored)      │
           │  • state.json (chaos, scene #, options)  │
           │  • megadungeon-state.json (level, party  │
           │    position, return-points)              │
           │  • threads.md  • characters.md           │
           │  • factions.md  • world-facts.md         │
           │  • scene-log.md                          │
           │  • levels/level-NN.md (per-level state)  │
           └──────────────────────────────────────────┘
```

### Three layers

- **Rules engine layer** — Mythic engine (existing module + shim) and Random Table generators (existing module + shim). Pure code, deterministic, no LLM.
- **World layer** — FoundryVTT + foundry-mcp + zm-map-collection scenes. Visible game state; players see this.
- **Narrative layer** — Claude + `campaign/` files. The GM brain and its scratchpad.

The harness (how Claude is woken and given turns) is the only thing that changes between Phase 1 (Claude Code `/loop`) and Phase 2 (Agent SDK service). Everything else is portable.

### Per-turn data flow

1. Player posts in Foundry chat.
2. Claude (running in `/loop`) polls foundry-mcp for new messages since `last_seen_message_id`.
3. Claude reads relevant `campaign/` files for current state (state.json, megadungeon-state.json, current level-NN.md, threads.md).
4. Claude classifies messages and decides whether to respond (see §8 Play Loop).
5. If yes: Claude calls Mythic API for any required rolls, calls Random Table API for encounter / dressing / NPC content, calls foundry-mcp to act in the world (post narration, roll dice, activate/move tokens, spawn NPCs, trigger VCE features, transition scenes on level descent).
6. Claude writes any state changes back to `campaign/` files (per-level state, threads, faction movements, scene log).
7. Loop repeats.

## 4. Repo Strategy

Three repos, distinct concerns:

### 4.1 `DimitroffVodka/foundryvtt-mythic-gme` (Foundry module fork)

Light-touch — single new file to keep upstream sync clean.

```
src/api/mgme-api.js       ← NEW (~50 LoC) — programmatic API shim
mythic-gme-tools.js       ← +3 lines: register game.modules.get(...).api
```

**API surface (initial):**

```
api.fateQuestion({odds, chaos})    → {answer, exceptional, randomEvent}
api.fateCheck({modifier, chaos})   → {answer, exceptional, randomEvent}
api.randomEvent()                  → {focus, action: [w,w], description: [w,w]}
api.meaningTable(name)             → {result: 'Word' | ['w','w']}
api.sceneTest({chaos})             → {result: 'expected'|'altered'|'interrupt'}
api.sceneAdjustment()              → {adjustment: '...'}
api.npcBehavior({npc?})            → {action, descriptor}
api.chaos.get()                    → number
api.chaos.set(n) / .increase() / .decrease()
api.lists.threads.add(text) / .remove(id) / .get()
api.lists.characters.add(text) / .remove(id) / .get()
```

The shim wraps existing `MGMECore2e` static methods. Each method returns a structured result *and* posts the visible chat card the module already produces. No behavior changes for human users of the panel.

### 4.2 Operator's `random-table` module (light-touch API shim)

The operator's existing module at `E:/FoundryVTTv13/data/Data/modules/random-table` already exposes 9 generators (Loot, Monster Mutator, NPC Roller, Blessings, Encounters, Room Dressing, Quest Hooks, Lost Locations, Adventure) totaling ~1,136 curated Vagabond entries. We add a small `api` namespace that returns structured results in addition to the existing chat-posting behavior.

```
scripts/random-table-api.mjs   ← NEW (~50 LoC) — programmatic shim
scripts/random-table.mjs       ← +3 lines: register game.modules.get('random-table').api
```

**API surface (initial):**

```
api.encounter({env, tier, theme?})     → {description, creatures: [...], complication?}
api.roomDressing({location, count})    → {items: [...]}
api.questHook({category})              → {hook, complication?, questObject?}
api.lostLocation({type})               → {name, epithet, legend, hook?}
api.npc({gender?})                     → {firstName, surname, motivations, quirk, secret, rumor}
api.loot({type, sentient?})            → {item, effects: [...], personality?}
api.blessing({type})                   → {name, description, effects: [...]}
api.mutator(actorId, mode)             → {mutations, statDiff}
api.adventure({theme, skipMap?})       → {hook, threat, npc, encounters, roomFeatures, complication?, treasure?, mapId?}
```

The shim wraps existing generator classes already exposed on `game.randomTable.*`. No behavior changes for the Foundry UI panel. Operator owns the module — no fork friction; we just add files.

### 4.3 `DimitroffVodka/MythicGME-2e-Obsidian` (Obsidian vault fork)

**Untouched in v1.** Kept as a backup data source / reference. The Foundry module already ships the Meaning Tables as native RollTables, so we don't depend on the vault for engine data.

Future option: repurpose as an out-of-Foundry "reading view" of the campaign, with Obsidian backlinks/search.

### 4.4 `DimitroffVodka/vagabond-claude-gm` (NEW — the project)

No new MCP server in v1. Repo holds prompt modules, theme/level data, runbooks, and campaign state.

```
vagabond-claude-gm/
├── README.md
├── CLAUDE.md                       ← project-level Claude context
├── .gitignore                      ← campaign/ ignored
├── docs/
│   └── design.md                   ← this spec
├── data/
│   └── vagabond/
│       ├── megadungeon-levels.json ← maps level # → ZM scene id, theme hints, depth tier
│       ├── encounter-tiers.json    ← maps level # → random-table encounter tier
│       ├── zone-overrides.json     ← combat tactics per compendium id
│       └── faction-archetypes.json ← starter factions Claude can roll for
├── prompt/
│   ├── system-prompt.md
│   ├── procedures/
│   │   ├── wake-on-chat.md
│   │   ├── megadungeon-kickoff.md      ← surface hook + Level 1 entry
│   │   ├── level-init.md               ← first-visit theme/faction/encounter rolls
│   │   ├── level-transition.md         ← ascend/descend, scene swap, sceneTest
│   │   ├── exploration-flow.md         ← per-room/per-corridor Mythic loop
│   │   ├── combat-handoff.md
│   │   ├── mythic-procedure.md
│   │   ├── retreat-and-resupply.md     ← surface trips between sessions
│   │   └── narration-style.md
│   └── examples/                       ← few-shot examples
├── campaign/                           ← gitignored (private play data)
├── templates/
│   └── new-campaign/                   ← skeleton copied at campaign start
└── runbook/
    ├── setup.md                        ← install modules, configure Foundry, start /loop
    ├── kickoff.md                      ← starting a new megadungeon campaign
    └── operator-cheatsheet.md          ← what the operator says to Claude
```

## 5. Foundry-Side Engine Contracts

In v1 there is **no new MCP server**. Claude orchestrates by calling two Foundry-side APIs through `foundry-mcp.evaluate`. Both modules already exist; both gain a small `api` namespace via the shim pattern (§4.1, §4.2).

### 5.1 Mythic Tools API (impartial GME logic)

```
game.modules.get('mythic-gme-tools').api.fateQuestion({odds, chaos})
game.modules.get('mythic-gme-tools').api.fateCheck({modifier, chaos})
game.modules.get('mythic-gme-tools').api.randomEvent()
game.modules.get('mythic-gme-tools').api.meaningTable(name)
game.modules.get('mythic-gme-tools').api.sceneTest({chaos})
game.modules.get('mythic-gme-tools').api.sceneAdjustment()
game.modules.get('mythic-gme-tools').api.npcBehavior({npc?})
game.modules.get('mythic-gme-tools').api.chaos.{get,set,increase,decrease}
game.modules.get('mythic-gme-tools').api.lists.{threads,characters}.{add,remove,get}
```

### 5.2 Random Table API (Vagabond content)

```
game.randomTable.api.encounter({env, tier})
game.randomTable.api.roomDressing({location, count})
game.randomTable.api.questHook({category})
game.randomTable.api.lostLocation({type})
game.randomTable.api.npc({gender?})
game.randomTable.api.loot({type, sentient?})
game.randomTable.api.blessing({type})
game.randomTable.api.mutator(actorId, mode)
game.randomTable.api.adventure({theme, skipMap})  // skipMap=true; we use ZM scenes
```

### 5.3 Foundry MCP Bridge (existing — world manipulation)

Tools we lean on for the megadungeon flow:

- `evaluate` — invoke the two API surfaces above
- `list_compendiums`, `search_compendium`, `get_compendium_document` — find ZM scenes, vce-beasts actors
- `get_scene`, `capture_scene` — current scene state
- Scene activation via `evaluate(scene.activate())`
- `placeToken` (socket-relay), `move_token`, `update_token`, `delete_tokens` — NPC tokens
- `use_item` — trigger VCE attacks/spells/features
- `roll`, `get_actor`, `list_actors`, `get_token_details` — game state inspection
- `get_console_errors`, `screenshot` — debug + visual confirmation

## 6. Megadungeon Execution Flow

### 6.1 Campaign-level shape

```
campaign start ──→ surface kickoff (§13)
   │
   ▼
party enters Level 1
   │
   ▼ ┌────────────────────── per-level state machine ─────────────────┐
   │ │                                                                │
   │ │  level entry (first time):                                     │
   │ │    1. activate ZM Megadungeon Level-N scene                    │
   │ │    2. roll sceneTest(chaos)                                    │
   │ │    3. if interrupt → roll randomEvent on entry                 │
   │ │    4. level-init: theme, faction(s), encounter table seed,    │
   │ │       3-5 starter threads, 1 major secret                      │
   │ │    5. write levels/level-NN.md + factions.md updates           │
   │ │    6. position party tokens at entrance, narrate arrival       │
   │ │                                                                │
   │ │  exploration loop:                                             │
   │ │    • Mythic Fate Questions decide what's behind doors,         │
   │ │      whether NPCs are present, surprise rolls, etc.            │
   │ │    • per-room: sceneTest if chaos≥6 OR scene boundary          │
   │ │    • combat → handoff (§9) with zone tactics                   │
   │ │    • discovery → meaningTable + roomDressing for narration     │
   │ │    • random encounters → randomTable.api.encounter (using       │
   │ │      level's tier+ecology)                                     │
   │ │    • scene end → chaos.adjust per Mythic rules                 │
   │ │                                                                │
   │ │  level transition (descend/ascend):                            │
   │ │    1. update megadungeon-state.json (current_level,            │
   │ │       deepest_visited, return_points)                          │
   │ │    2. activate next ZM Megadungeon Level-N scene               │
   │ │    3. spawn party tokens at the level's entry point            │
   │ │    4. if first visit → run level entry sequence above          │
   │ │    5. if re-entry → restore from cached level-NN.md state      │
   │ │       (rooms cleared, NPCs encountered, faction territory)     │
   │ │                                                                │
   │ └────────────────────────────────────────────────────────────────┘
   │
   ▼
session end → operator says "pause" or scene timer triggers wrap
   │
   ▼
Claude appends scene-log.md, updates threads.md/factions.md/level-NN.md,
posts a "session summary" to chat, suggests next session's hook.
```

### 6.2 Level theme generation (lazy, on first visit)

When the party enters a level for the first time, Claude pre-rolls and caches:

| Field | Source |
|---|---|
| Level name | Mythic `meaningTable('Locations')` + ZM scene name |
| Adventure tone | Mythic `meaningTable('Adventure Tone')` |
| Primary faction | Random Table NPC (named leader) + Mythic `meaningTable('Characters')` for archetype |
| Secondary faction or rival | 50% chance; Mythic Fate Question to decide |
| Ecology theme | Mythic `meaningTable('Creature Descriptors')` — tells Claude which random encounter tier to use |
| Encounter tier | `data/vagabond/encounter-tiers.json` keyed by level number → Random Table tier ('Easy', 'Moderate', 'Hard', 'Deadly') |
| 3–5 starter threads | Compose from Mythic `meaningTable('Plot Twists')` + faction motivations |
| 1 major secret | Mythic `meaningTable('Plot Twists')` — kept hidden from PCs |

Result is written to `levels/level-NN.md`. Subsequent visits to the same level reuse the cache; mid-campaign drift is allowed (Claude updates the file as factions move, NPCs die, etc.).

### 6.3 Random encounter trigger (during exploration)

Per Mythic GME guidance: roll a Fate Question with `Likely` odds when the party crosses a threshold (entering a new wing, lingering in a room, making noise). On Yes → call `game.randomTable.api.encounter({tier: <level's tier>})`, narrate, drop into combat handoff if hostile.

Combat encounters per session aim for **1–3** per Mythic's pacing (chaos modulates).

### 6.4 Surface trips and resupply

The party can retreat any time. Mechanics:

1. Operator/PC declares retreat. Claude calls `fateQuestion('does the dungeon let them retreat unmolested?')` — Likely odds, Mythic decides.
2. If yes, scene transitions to a surface scene (operator imports a town/wilderness ZM scene OR Claude picks one matching the dungeon's location).
3. Surface play uses Random Table's NPC roller + town room dressing for shops, taverns, rumors. No megadungeon state changes during downtime.
4. On re-entry, party re-uses the saved `return_points[level-NN]` to spawn at the same staircase they exited from. Level state preserved.

Surface play is intentionally lightweight — primary play is in the dungeon. Long arcs above ground are out of scope for v1.

## 7. GM Persona System Prompt

Modular structure — top-level `system-prompt.md` references procedure files. Editable in pieces, easy to A/B test sections.

```
prompt/system-prompt.md
prompt/procedures/wake-on-chat.md
prompt/procedures/megadungeon-kickoff.md
prompt/procedures/level-init.md
prompt/procedures/level-transition.md
prompt/procedures/exploration-flow.md
prompt/procedures/combat-handoff.md
prompt/procedures/mythic-procedure.md
prompt/procedures/retreat-and-resupply.md
prompt/procedures/narration-style.md
```

**`system-prompt.md` core sections:**

- **Identity:** GM running a Vagabond Megadungeon campaign in FoundryVTT. Uses Mythic GME 2E for impartial decisions. The campaign spine is Zach Moeller's Megadungeon Levels 1–XII (`zm-map-collection`).
- **Authority boundaries:** Full GM. NPCs, scenes, loot, combat tactics, faction politics — yours. PC tokens, PC HP, PC choices — players'. Never speak for a PC.
- **Tools:** foundry-mcp (world manipulation), Mythic API via `evaluate(game.modules.get('mythic-gme-tools').api.*)`, Random Table API via `evaluate(game.randomTable.api.*)`, file I/O on `campaign/`.
- **Procedures:** enumerated with brief summaries + references to full files.
- **Hard rules:** never fudge dice; if Mythic says No, the answer is No; Chaos Factor obeyed; campaign state files updated before responding.
- **Style anchors:** succinct, evocative, in-fiction voice; one or two paragraphs per beat; address PCs by name; describe what they perceive.

**`narration-style.md` highlights:**

- Lead with sensory detail, not exposition.
- Surface stakes and choices, not lectures.
- NPC speech: attribute, distinct voice tags.
- Don't railroad; offer hooks and let players act.
- Length: 2–6 sentences for routine responses; longer only at scene boundaries or Random Events.
- Never recap to fill space.

## 8. Play Loop

Per tick (10–30s, or self-paced based on activity):

```
1. read foundry chat: pull messages since last_seen_message_id
2. if no new messages AND no pending scene-trigger event → idle, return
3. classify each new message:
     - dice roll posted by system → log, no action unless triggers Mythic
     - OOC chatter → ignore
     - IC speech / declared action → candidate for response
     - direct GM-aimed line ("ok, what do I see?") → must respond
4. read campaign/state.json + current scene context
5. decide: respond now, or stay quiet?
     heuristics:
       - PC declared a discrete action with non-trivial outcome → respond
       - PC asked a question of the world or an NPC → respond
       - PCs talking among themselves about plans → stay quiet, observe
       - long silence after a scene-shift moment → respond with a nudge
6. if respond:
     a. determine if any Mythic mechanic is needed
        - uncertainty about a fact → fateQuestion
        - discrete random check → fateCheck
        - scene start / level entry → optional sceneTest
        - chaos roll due → randomEvent check
        - exploration threshold crossed → "is there an encounter?" Fate Q
     b. call the relevant Mythic API method via foundry-mcp evaluate()
     c. call random-table API if encounter / room dressing / NPC content needed
     d. compose narration
     e. post to foundry chat (and take in-world actions:
        spawn token, move enemy token, trigger VCE feature, apply AE)
     f. write state changes to campaign/ files
     g. update last_seen_message_id
7. sleep until next tick
```

**Wake-on-event extension** — separate polling check inside the loop:

- Combat starts (Foundry combat tracker activates) → trigger combat handoff.
- A PC drops to 0 HP → respond with consequence narration.
- Scene timer expires (set in `state.json`) → narrate scene shift.

Triggers Claude to act *without* a player message.

## 9. Combat Handoff

When combat begins:

1. **Claude declares opening narration** — describes encounter, enemy intent, environment.
2. **Claude spawns enemy tokens** if not already on the scene — uses `game.randomTable.api.encounter` (or the level's seeded encounter data from `levels/level-NN.md`) to pick actors, resolves them through `foundry-mcp.search_compendium` against `vce-beasts` (or other configured packs), then `foundry-mcp` socket-relay `placeToken` ops to drop them at their starting positions per zone (frontline up close, midline mid-distance, backline at range).
3. **Claude triggers Foundry combat tracker** — adds enemy tokens to combat, rolls initiative, posts order.
4. **Per turn:**
   - **Player turns:** Claude is silent. Players act. VCE/crawler runs mechanics. Claude reads chat results.
   - **Enemy turns:** Claude decides tactics (see §9.1) and triggers via foundry-mcp:
     - Move → `move_token`
     - Attack → `use_item` on enemy weapon (VCE handles attack/damage/AE)
     - Cast spell → `use_item` on spell
     - Special ability → `use_item` on feature
   - Claude narrates *intent + result* in 2–3 sentences. Reads VCE's chat card before narrating outcome so narration matches dice.
5. **End-of-round bookkeeping** — Claude reads NPC HP; Mythic NPC Behavior may fire (rout / surrender / call reinforcements).
6. **Combat ends** — Claude writes outcome to `scene-log.md`, registers new Threads, updates Chaos Factor if appropriate.

**What Claude never does in combat:**
- Roll PC attacks/saves/checks (players do).
- Apply damage to PCs directly (combat workflow does).
- Override player choices.

### 9.1 Vagabond Zone-Based Tactics

Each NPC actor carries a `zone` tag, sourced in priority order:

1. Explicit `flags.vagabond-claude-gm.zone` on the actor (`frontline`|`midline`|`backline`).
2. Lookup in `data/vagabond/zone-overrides.json` (in `vagabond-claude-gm` repo) keyed by compendium id.
3. Claude's inference at combat start, based on traits:
   - Has Ranged weapon equipped → backline.
   - Casts area spells / supportive abilities, no melee → backline.
   - Has melee weapon with Reach / hit-and-run feature / Finesse → midline.
   - Default → frontline.
   - Inference is logged and cached on the actor as an explicit flag.

**Per-turn tactical decision tree** (Claude runs per enemy turn):

```
1. Determine reach state:
     • frontline / midline → Melee reach
     • backline → Ranged optimal distance (per weapon)
2. Identify opposition tokens (PCs + allies).
3. Choose target:
     a. If hostile spell/effect targets this NPC's zone, may prioritize source.
     b. Otherwise scan opposition for valid targets in/near zone.
     c. If multiple valid targets, pick lowest current Luck pool.
        Tiebreaker: lowest current HP. Final: random.
4. Compute movement to satisfy zone:
     • frontline: end turn in melee reach. Not in reach after move → Rush.
     • midline: end turn in reach to attack, then step out of opposition's
       melee reach. Can't both → prefer attack.
     • backline: end turn at ranged optimum. Reposition away from closing
       distance.
5. Action via use_item; let VCE handle dice.
6. Narrate: 2-3 sentences. Intent → action → outcome (read VCE chat card
   before narrating outcome).
```

**Edge cases:**

- **Multi-zone enemies** (archer-mage with melee fallback): primary zone in tags; fallback in trait notes.
- **Mythic NPC Behavior overrides tactics** when triggered (flee / parley / betray ally).
- **Out-of-reach backliners** with low HP: consider retreat per Mythic Behavior call (urgency-driven).
- **Group coordination:** second frontliner targeting same target prefers different lowest-Luck unless boss target HP critical.

## 10. State Model & File Formats

### `campaign/state.json`

```json
{
  "campaign_name": "Wreckers of Auldwick Bay",
  "started_at": "2026-05-05",
  "last_updated_at": "2026-05-05T16:33:00Z",
  "chaos_factor": 5,
  "chaos_flavor": "mid",
  "scene_count": 0,
  "current_scene_id": null,
  "options": {
    "use_keyed_scenes": false,
    "use_thread_progress_tracks": false,
    "use_peril_points": false,
    "fate_dice": "chart"
  },
  "party": {
    "actor_ids": ["actor-id-1", "actor-id-2"],
    "starting_location": "surface",
    "level_average": 3
  },
  "operator": {
    "owner_user_id": "...",
    "narration_target": "all"
  }
}
```

### `campaign/megadungeon-state.json`

```json
{
  "current_level": 1,
  "deepest_visited": 1,
  "party_position": "level-01-entrance",
  "return_points": {
    "level-01": "stairs-down-to-2"
  },
  "level_themes": {
    "01": {
      "name": "Abandoned Barracks",
      "tone": "grim",
      "primary_faction": "kobold-raiders",
      "ecology": "scavengers",
      "encounter_tier": "easy",
      "scene_id": "<foundry-scene-id-of-zm-megadungeon-level-1>"
    }
  }
}
```

### Markdown files

- **`threads.md`** — H2 per active thread with frontmatter (`id`, `urgency`, `source`, `level`, `status`) + free notes.
- **`characters.md`** — H2 per NPC. Frontmatter: `actor_id` (Foundry link), `relationship`, `disposition`, `last_seen_scene`, `level`, `faction`. Free notes.
- **`factions.md`** — H2 per faction. Frontmatter: `level`, `territory_rooms`, `disposition`, `leader_id` (NPC), `goals`, `numbers`. Free notes for politics, rivalries, history.
- **`world-facts.md`** — flat bullet list of canonical truths; mutable.
- **`scene-log.md`** — append-only, H2 per scene with timestamp, attendance, level, result, chaos before/after.
- **`levels/level-NN.md`** (one per visited level) — frontmatter: `ecology`, `factions`, `encounter_tier`, `random_encounter_table_active`, `secrets_remaining_count`. Body: rooms cleared, NPCs encountered, secrets found, hooks seeded.

### Sync rules

- **Foundry-owned** (Claude reads, writes only via foundry-mcp): PC actors, PC HP/inventory, NPC actors after spawn, tokens, scenes, combat tracker, Mythic Tools' Threads/Characters RollTables.
- **Repo-owned** (Claude reads & writes directly): all `campaign/` files.
- **Mirrored:** when Claude registers a thread narratively, it writes to `threads.md` AND adds a row to Mythic Tools' "Threads List" RollTable via `api.lists.threads.add`. Same for characters. Faction movements update `factions.md` only (no Foundry mirror needed).

## 11. Mythic Interplay

| Trigger | Mechanic | Caller |
|---|---|---|
| Player asks something whose outcome isn't obvious | `fateQuestion(odds, chaos)` | Claude |
| Mythic returns `randomEvent: true` | `randomEvent()` | Claude (chained) |
| Scene starts | Optional `sceneTest(chaos)` (recommended at chaos ≥ 6) | Claude |
| Scene returns Altered → adjustment needed | `sceneAdjustment()` | Claude |
| Scene ends | `chaos.increase()` / `chaos.decrease()` per Mythic rules | Claude |
| NPC behavior unclear / operator triggers re-eval | `npcBehavior(npc_id)` | Claude |
| Need flavor (name, mood, item, plot twist) | `meaningTable(name)` | Claude |

**Chaos Factor adjustment** (Mythic 2E):
- **Up by 1** if PCs are losing ground / scene went badly.
- **Down by 1** if PCs in control / gained advantage / scene resolved cleanly in their favor.
- Floor 1, ceiling 9 (mid-flavor); shim clamps.

## 12. Runtime Harness

### Phase 1 — Claude Code `/loop`

Operator launches Claude Code in `vagabond-claude-gm` directory. Invokes:

```
/loop 20s gm-tick
```

…where `gm-tick` is a slash command (or prompt fragment) running the §10 play-loop checklist. Claude Code's `/loop` polls for human interrupts between ticks; operator can break in to override anything (`pause`, `skip`, `re-narrate`, `force-fate-question odds=likely`).

Self-pacing variant: `/loop gm-tick` (no interval) — Claude decides next sleep based on activity (active scene → 10–15s; idle → 60s; combat round → wake on tracker advance).

### Phase 2 — Claude Agent SDK service

Future migration. Same persona prompt, MCP servers, campaign files. The harness becomes a small Node service:

- WebSocket subscribe to Foundry chat events (push, no polling).
- Calls Anthropic API directly, holds prompt-cache for system prompt + procedures.
- Posts back via foundry-mcp.
- Cheaper per turn, lower latency, runs as a daemon next to Foundry.

**Portability guarantee:** persona prompt, MCP tool contracts, `campaign/` schema do not change between phases. Only the wake/dispatch loop differs.

## 13. Megadungeon Kickoff Procedure

First-session bootstrap (campaign creation):

1. **Operator setup.**
   - Runs `vagabond-claude-gm` setup script → creates `campaign/<slug>/` from template.
   - Opens Foundry. Ensures `mythic-gme-tools` (with shim), `random-table` (with shim), `vce`, `vagabond-crawler`, and `zm-map-collection` are all enabled.
   - Imports party PCs.
   - Confirms ZM Megadungeon Level 1 scene exists (creates from compendium if not).

2. **Operator launches Claude Code in the project directory.** Issues a one-line kickoff:

   > "New megadungeon campaign. 2 PCs (level 3). Tone: grim but with dark humor. Default options."

3. **Claude runs `megadungeon-kickoff` procedure:**

   a. **Confirm options.** Reads `state.json` defaults, surfaces them to operator, applies overrides.
   b. **Generate the surface hook.** Party starts above Level 1 — needs a reason to descend.
      - `meaningTable('Plot Twists')` + `meaningTable('Quest Hooks')` for a one-paragraph adventure premise.
      - `randomTable.api.lostLocation({type: 'Underground'})` to give the dungeon a name and legend.
      - `randomTable.api.npc()` for the patron / informant who delivers the hook.
      - Composes hook into `world-facts.md` and `threads.md` (1–3 starter threads).
   c. **Seed Mythic state.** Sets Chaos Factor to 5. Registers the patron and the dungeon-name into Mythic Tools' Characters List (and `characters.md`). Registers initial threads via `api.lists.threads.add`.
   d. **Activate surface scene.** Operator-chosen ZM scene matching the hook (tavern, town square, ruined village). Spawns PC tokens.
   e. **Post opening narration.** 2–4 sentences setting the scene + delivering the hook in-fiction. Ends with a clear handoff: "What do you do?"
   f. **Operator says `/loop gm-tick`.** Play begins. Party negotiates with the patron, asks questions, agrees, prepares, eventually travels to the dungeon entrance.

4. **First descent.** When the party declares "we go to the dungeon entrance" and crosses to Level 1, Claude runs `level-transition` then `level-init`:

   a. `sceneTest(chaos)` — Mythic 2E call. If `interrupt`, immediately call `randomEvent()` — something happens at the threshold.
   b. Activate ZM Megadungeon Level 1 scene. Spawn PC tokens at the entrance.
   c. Run level-init theme generation (§6.2): name, tone, faction, ecology, encounter tier, 3–5 starter threads, 1 major secret.
   d. Write `levels/level-01.md`, update `megadungeon-state.json`.
   e. Narrate the first room of Level 1 — sensory detail, immediate tension, what they perceive. Hand back to players.

5. **Subsequent sessions.** Operator says "resume":
   - Claude reads `state.json`, `megadungeon-state.json`, `scene-log.md` (last entry), current `levels/level-NN.md`.
   - Posts a "previously on..." paragraph.
   - Restates current situation (party position, level, what's known to be threatening).
   - Operator says `/loop gm-tick`; play resumes.

If the party returns to surface mid-campaign, the surface scene is reactivated and Claude switches to lightweight surface-mode (shops, rumors, RP). Re-entering the dungeon uses the saved return-point.

## 14. License & Attribution

- **Mythic GME Tools (Foundry module)** — distributed with permission from Tana Pigeon. Our fork inherits the same terms; non-commercial. Attribution to Tana Pigeon and Word Mill Games in our README and the Mythic API output.
- **MythicGME-2e-Obsidian (vault)** — CC BY-NC 4.0 (Tana Pigeon / Word Mill Games). Not used in v1; if used later, attribution required.
- **`random-table` module** — operator's own (DimitroffVodka). License at operator's discretion.
- **`zm-map-collection` (Zach Moeller maps)** — Patreon-licensed; per-operator install, no redistribution. Operator already owns; project just consumes scene compendia.
- **vagabond-claude-gm** — personal project; license TBD. Recommend MIT or proprietary-personal-use given dependence on non-commercial upstream (Mythic Tools).
- **Vagabond RPG** — system by mordachai; rules referenced for combat zones, mechanics, classes. No rules content reproduced; only the system's existing FoundryVTT data is used.

## 15. Open Questions (non-blocking)

1. **Operator interrupt protocol.** UX for the operator pausing Claude mid-narration without breaking the loop. Probably: any plain text from operator in Claude Code is treated as out-of-band guidance Claude must obey.
2. **PC fate-question delegation.** When a PC says "I lockpick the door" — Mythic Fate Question, or Vagabond Difficulty roll via foundry-mcp `roll`? Default: rules first, oracle second. Tiebreaker rule TBD.
3. **Chat hygiene.** Should Claude's narration use a specific Foundry speaker or whisper mode? Recommend dedicated user `MythicGM` with persistent avatar.
4. **Compendium pollution.** Encounter rolls may surface beasts that don't fit a level's ecology. Filter taxonomy on actors needs work — initial pass: list-narrow by HD/tier; build tags from playtest mismatches.
5. **Dual-system rule conflicts.** Mythic Random Events vs Vagabond Reaction Rolls vs Random Table encounters. Precedence: Mythic only fires on its own triggers; Vagabond rolls only when Vagabond rules call for one; Random Table only on explicit "encounter happens" Fate Question; never two for the same beat.
6. **Shim contribution upstream.** When/whether to PR the API shim back to JeansenVaars (Mythic Tools). Out-of-scope for v1.
7. **Group play multi-PC turn arbitration.** When 3 players are at the table in narrative play (not combat), how does Claude track whose action thread is open? Likely: Claude reads the chat speaker tag; addresses responses to the speaker; tracks per-PC pending threads in a scratch field of `state.json`.
8. **Session pacing.** When does a session end? Options: operator-declared, scene-tracker timer, level-transition boundary, dramatic-pause heuristic. Default v1: operator says "pause"; Claude wraps with summary.
9. **Level-skip prevention.** Should Claude prevent the party from descending past their depth tier? Mythic answer is "let Fate decide" — but a TPK on Level 5 with level-1 PCs is a feel-bad. Soft guard: warning narration if party is venturing far below their tier; hard block off by default.
10. **Encounter scaling within a level.** Some levels have natural sub-tiers (entry rooms easier than the boss arena). Approach: Claude rolls encounter tier per Mythic Fate Q ("is this room dangerous?") modulated by level depth.
11. **Boss placement & climax.** Each ZM Megadungeon Level presumably has a "main encounter" room. Auto-detect from scene metadata, or rely on Claude noticing visual focus? Initial v1: Claude picks a "boss room" by inspection at level-init and seeds it as a key thread.
12. **Map auto-walling deferred.** When viable wall-extraction tooling exists, restore the Adventure Generator + Dyson Logos path as a procedural one-shot mode (orthogonal to megadungeon).

## 16. Out of Scope (v1)

- **Map auto-walling for Dyson Logos** (deferred until viable; primary path is ZM pre-walled scenes).
- **One-shot adventure mode** as primary play (megadungeon is the spine; one-shots reserved for v2).
- **Other RPG systems** (Vagabond-first; data structure stays system-pluggable but no concrete adapters in v1).
- **Voice/audio integration** (TTS for Claude narration).
- **Image generation** for scenes/NPCs.
- **Player-facing UI panel inside Foundry** (Claude posts to chat; operator uses Claude Code).
- **Event Crafter / Plot Unfolding Machine / Scene Unfolding Machine integrations** (available in Mythic Tools module; not used by v1 prompt).
- **Long-arc campaign tooling beyond Threads list** (Thread Progress Tracks deferred).
- **Operator-side desktop UI** (separate project; v1 is Claude Code + Foundry only).
- **Multi-megadungeon support** (one campaign = one megadungeon for v1).

## 17. Success Criteria

- Operator can kick off a new megadungeon campaign in under 10 minutes.
- Claude runs a full session (2–4 hours of play) end-to-end without operator intervention beyond IC play and pause/resume.
- All Mythic rolls visible in Foundry chat.
- Combat with 4 PCs vs 6 enemies completes without Claude making PC-side decisions or dice fudging.
- Level transitions (descent and ascent) restore prior level state correctly on revisit.
- Campaign state persists across Claude Code session restarts; "resume" command picks up cleanly with a coherent recap.
- Migrating from Phase 1 to Phase 2 runtime requires zero changes to prompt, file formats, or Foundry-side modules — only the harness.
