# Other Automation

Cross-cutting automation that doesn't belong to a specific class, ancestry, perk, or spell. Most of this is "the system describes the rule but doesn't enforce it; VCE does."

---

## Aura Delivery System

Casting any spell or Psychic Talent with `delivery: aura` activates a persistent template that follows the caster. Each combat round, the aura ticks on hostiles in range; entry ticks fire when a hostile walks into the radius mid-round. Containment uses Foundry's per-grid-square rule (matches the purple-square highlighting), so large monsters with a single tile inside are correctly affected.

Works for:
- **Damage spells** (Burn cast as Aura → fire damage tick per round to enemies in radius)
- **Effect spells** (Befuddle Aura → applies status to enemies entering the radius)
- **Buff spells** (Bless, Exalt, Ward → apply to allies in radius)
- **Buff Talents** (Shield, Evade — Psychic talents with aura delivery)
- **One-shot Aura casts without focus** — single-tick at cast time, then expires

Revelator's L4 Paragon's Aura zeroes the base 10' Aura cost, so Bless / Exalt / Ward with a 10' radius are free deliveries.

---

## Weapon Range & Targeting Rules

- **Range Enforcement** — Blocks out-of-range attacks with distance warnings. Auto-hinders Ranged at Close (unless Akimbo Trigger) and Thrown at Far. World setting, on by default.
- **Cleave Damage** — Cleave weapons deal half damage to all targets (ceil to first, floor to rest; minimum 1). Works with both direct damage and save-based damage paths.
- **Target Count Enforcement** — Non-Cleave weapons limited to 1 target. Cleave weapons limited to 2 targets. Spin-to-Win perk removes the Cleave target cap.

---

## Status Rules

Module-level enforcement of status-vs-status interactions the system describes but doesn't enforce.

**Berserk → cannot be Frightened**: any actor with the Berserk status (regardless of class — Barbarian Rage, NPC ability, GM toggle, etc.) blocks Frightened applications via the v5.3.0 `vagabond.preStatusApply` hook, with a debounced chat-card notification listing affected targets.

---

## Cast-Time Rules

**Focus + Effect coupling**: per Vagabond core rules, Focus sustains a spell's Effect; the damage portion is Instant. Casting with Focus engaged but `Include Effect` toggled off is invalid — there's nothing to sustain. The cast is blocked at `SpellHandler.castSpell` (and `CrawlerSpellDialog._cast`) with a notification asking the player to either turn Effect on or unfocus the spell.

---

## Damage Pipeline

- **Silver Weakness Die Fix** — Silver/metal weakness extra die now accounts for weapon skill die size bonuses (e.g., Marksmanship upgrades the weakness die from d6→d8 for Ranged weapons).
- **Manual Rolls** — Apply damage or healing from just standard dice rolls in chat by right-clicking the result.
- **Encumbrance Speed Penalty** — Optional homebrew setting: -5 ft Speed per inventory slot over the character's cap, with an Encumbered status icon. Off by default.

---

## Auto-Detection & Active Effects

- **Class Feature Detection** — Auto-detects classes from compendium items, applies relevant AEs, and registers runtime hooks. Triggers on actor create, item create/delete, level change, and manual rescan.
- **Ancestry Trait Detection** — Same flow for ancestry items.
- **Perk Detection** — Auto-detects perks from character items and applies relevant AEs.

---

## Misc

- **Countdown Dice Overlay** — Visual overlay for tracking countdown dice on effects.
- **NPC Ability Automation** — With Vagabond Crawler module enabled: morale checks, NPC abilities (Magic Ward, Pack Tactics, Nimble, Soft Underbelly, etc.), and combat AI.
- **Brawl Intent System** — Grapple/Shove intent dialog for Brawl attacks. Works from the character sheet AND the vagabond-crawler combat strip.

---

## Vagabond Crawler Integration

If both modules are active, several features compose:

- **Imbue dice + Relic dice** — Imbue's spell dice are appended to the Roll Damage button's `data-damage-formula`. When the player clicks Roll Damage, vagabond-crawler's relic engine injects relic dice (Strike I/II/III, Bane, Vicious crit, typed Strike) on top. Final roll formula is `weapon + imbue + relic`, all in one roll.
- **Bard Virtuoso** — Crawler exposes a Virtuoso button on the combat strip dropdown.
- **Dancer Step Up** — Crawler exposes Step Up on the combat strip dropdown.
- **Merchant Gold Sink** — Favorited shop items appear in the crawler combat strip dropdown for quick purchasing.
- **Alchemy Cookbook** — Favorited formulae appear in the crawler combat strip dropdown for use as weapons.
- **Hireling Routing** — Hirelings created via Crawler use the [Companion System](companions.md) for save and action routing.
