# Companion System

A unified engine that handles every NPC-companion-style spawn in the game. Whether it's a Summoner's conjured beast, a Witch's familiar, a raised undead, an animated object, an animal companion, a Druid in beast form, or a hireling — they all flow through the same spawn → control → save-routing → dismiss pipeline.

---

## Companions Tab

Every PC sheet has a **Companions** tab. While any companion is active, the tab shows:

- Each companion's portrait and HP
- A **Set Save Controller** button to route their saves through a different controller PC (useful when a player needs to roll their hireling's saves on someone else's turn)
- A **Compress / Release** affordance — gather all companions into a single party-token icon for travel, then release them back to their last positions

When the controller PC's owner clicks an action on a companion's chat card, the action routes through the controller's stats — Mana Skill for casters, Leadership for hirelings.

---

## Spawn Sources

| Source                 | Trigger                         | Notes                                                                                              |
|------------------------|---------------------------------|----------------------------------------------------------------------------------------------------|
| Summoner — Creature Codex | Summon tab on PC sheet         | Personal Codex per Summoner; mana cost; Soulbonder copies summon's Armor + Immunities to summoner |
| Witch — Familiar Perk  | Familiar action on PC sheet    | One familiar at a time; auto-dismisses on caster 0 HP                                              |
| Beast spell            | Cast → creature picker         | Spell-targeted; max HD scales with spell parameters                                                |
| Raise spell            | Cast → corpse picker           | Reanimates defeated tokens or compendium fallback as undead                                        |
| Animate spell          | Cast → inventory item picker   | Synthetic NPC actor created from item stats                                                        |
| Conjurer perk          | Action button                  | Per-perk conjure rules                                                                             |
| Reanimator perk        | Action button                  | Per-perk reanimate rules                                                                           |
| Animal Companion perk  | Action button                  | One companion; persists across rests                                                               |
| Hireling (manual)      | **Set Save Controller…** button on the actor sheet header | Not a spawn — flags an actor you already placed. Checks, saves, and weapon attacks route through the hiring Hero's Leadership |

---

## Hirelings

Hirelings are the one source that is **not** spawned by the module — you place the NPC yourself, then flag it. This is entirely a VCE feature; **Vagabond Crawler is not involved and is not required.**

To hand a player control of a hireling (or any pet/ally NPC):

1. **Grant Foundry ownership.** Right-click the actor in the sidebar → **Configure Ownership** → set the player to **Owner**. This is what actually lets them select and move the token and open its sheet. VCE does not do this step for you — only auto-spawned companions (summons, familiars, Animal Companion perk) get ownership granted automatically.
2. **Flag the controller.** Open the actor sheet and click **Set Save Controller…** (the people-arrows icon in the sheet header) → pick the Hero → choose **Hireling** → Save.

The actor now appears on that Hero's **Companions** tab, and its Checks, Saves, and weapon attacks roll against the Hero's Leadership Skill per RAW (*Core Rulebook — Bestiary*: "Use the Hero's Leadership Skill for any Checks and Saves the Hireling makes that Round").

The button appears on **both** NPC and character actor sheets, since a hireling built as a character-type actor needs the same routing. A hireling that is never placed on a scene still shows on the Companions tab.

> Choose **Companion** instead of **Hireling** in that dialog to route through the Hero's Mana Skill (Mysticism / Arcana) rather than Leadership — useful for an inherited summon or an Animate Object that changed hands.

---

## Save Routing

Companions roll saves using their **controller PC's** stats, not their own. This matches RAW — a hireling rolls Leadership, a summon rolls under the summoner's Mana skill, etc. Routing is automatic via the `controllerActorId` flag on the companion actor.

GM-side, the Set Save Controller dialog lets you change which PC's stats a companion uses. Useful when:
- A player is unavailable and someone else needs to run their hireling
- A summon was inherited mid-encounter
- An Animate Object changes hands

---

## NPC Action Routing

When a companion's chat card has action buttons (e.g., NPC abilities, hireling weapon attacks), clicks route through the controller PC. The controller's Mana Skill is used for spell-attack-style actions; Leadership for hireling weapon attacks. This means a Summoner's beast attacks roll against the summoner's Mysticism, not the beast's hard-coded action stat.

---

## Auto-Dismiss & Termination

Companions auto-dismiss in several scenarios:

- **HP drops to 0** — companion is removed (or persists on a Cd4 countdown if Summoner has Guardian Force at L8)
- **Caster drops focus** — all imbue/familiar/conjured spawns from that focus cascade-clear
- **Manual dismiss button** — on the Companions tab
- **Replace-on-same-source** — casting a new summon of the same source prompts to replace the existing one

Per-source dismiss handlers run before the generic dismiss path; they handle focus release, synthetic-actor cleanup, and caster-side state flags so nothing leaks.

---

## Compress / Release

The party-token feature in the HUD — click to gather all companions into a single token, click again to release them back to their last positions. The release path uses batched token creation through the GM relay, so multi-companion parties flow without hitching.

---

## Adding New Sources

(Developer note.) New companion sources are added to `scripts/companion/companion-sources.mjs` — pure data definitions per source declaring badge color, NPC-action skill routing, termination rules. Per-source dismiss handlers register via `CompanionSpawner.registerDismissHandler(sourceId, fn)`. Spawn flow uses `CompanionSpawner.spawn({ caster, sourceId, actor, tokenData, ... })`.
