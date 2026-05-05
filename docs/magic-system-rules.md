# Vagabond Magic System — Rules Reference & Open Questions

**Status:** Draft v0.6 — comprehensive sweep of all magic-related rules (full class casting features for Druid/Luminary/Magus/Revelator/Witch, damage typing philosophy, spell acquisition rates, plus several factual corrections)
**Date:** 2026-05-05
**Sources cited:**
- **Core Rulebook PDF** — page numbers below refer to printed book page numbers (PDF page = book page + 4 due to 4-page front-matter offset). Markdown source mirror at `Core Rulebook/05_Magic/`.
- Vagabond FAQ Doc v1
- "Vagabond // Pulp Fantasy RPG | More FAQ & Design Notes" video
- Class entries for casting-tradition references

This document compiles the rules for the Vagabond magic system as understood from the Core Rulebook, the FAQ, and creator clarifications, then records the decisions made on each rule for VCE module automation. Where the rulebook is unambiguous, the decision matches RAW. Where the text is silent or ambiguous, a decision was made and the reasoning is shown so creator and community can review and override if needed.

Items still requiring creator confirmation are flagged **PENDING** and listed in §9.

If something below misrepresents intent, please correct it — the goal is shared understanding.

---

## 1. Cast-Time Rules

*Magic chapter starts on book p. 90.*

### 1.1 Three choices on every cast
On every cast, the Hero declares:

1. **Intent** — damage only / effect only / both. Just damage (1d6) or just effect alone = 0 Mana. Both = 1 Mana.
2. **Delivery** — how the spell reaches its targets (see §2).
3. **Duration** — instant by default; Focus to sustain; Continual where the spell allows.

### 1.2 Cast Check
Made only when an unwilling Being is among the spell's current targets. No check otherwise.

### 1.3 Damage scaling
Base 1d6. +1d6 per additional Mana spent on damage.

### 1.4 Casting tradition determines the Cast Check stat
*Each class entry in chapter 03 specifies the Cast Skill (book p. 31–88).*

| Tradition | Stat / Skill | Example classes |
|---|---|---|
| Arcane | Reason / Arcana | Wizard, Magus |
| Divine | Presence / Leadership | Revelator |
| Glamour | Presence / Influence | Sorcerer |
| Occult | Awareness / Mysticism | Witch |
| Primal | Awareness / Mysticism | Druid, Luminary |

### 1.5 Mana economy
*Class-specific Mana formulas in each class entry (book p. 31–88). Rests / Mana restoration on book p. 11. Studied dice on book p. 19.*

**Mana progression** (per casting class):

| Class | Max Mana | Per-cast cap |
|---|---|---|
| Wizard, Sorcerer, Druid, Witch, Luminary | 4 × Class Level | Casting Stat + (Level/2, rounded up) |
| Magus, Revelator | 2 × Class Level | Casting Stat + (Level/2, rounded up) |

**Per-cast Mana cap** (Q45) is the maximum Mana spendable on a single cast at cast time. The on-hit Mana for Imbue is paid later and does not count against the cap.

**0-Mana casting** (Q33) — A caster can configure any spell to fit their available Mana. Cannot attempt a cast whose total Mana cost exceeds the caster's current Mana. A caster with 0 Mana can still cast at the floor: 1d6 damage **OR** the spell's effect (only one — both costs 1 Mana), with a 0-Mana delivery (Touch / Remote single-target / Imbue base).

**Mana restoration** (Q32):
- **Rest** (Shift of low activity, fed and rested): Mana restored to maximum. If HP already max, removes 1 Fatigue instead.
- **Wizard — Study** (unique): also restores Mana.
- **Manasteal Relics** (consumable kills): d4 / 2d4 / 3d4 Mana per tier on a kill with the relic weapon.
- **Sorcerer — Tap** (1st lvl): reduce Max HP to gain Mana (2× the reduction). Reduction ends on Rest.

### 1.5b Spell acquisition rate per class

Casting classes gain their starting spells at 1st level and acquire additional spells automatically on level-up.

| Class | Starting | Required | Auto-gain rate | Total at 10th lvl |
|---|---|---|---|---|
| Druid | 4 | Polymorph | +1 every 2 levels | 8 |
| Luminary | 4 | Life, Light | +1 every 2 levels | 8 |
| Sorcerer | 4 | — | +1 every 2 levels | 8 |
| Witch | 4 | — | +1 every 2 levels | 8 |
| Wizard | 4 | — | +1 every 2 levels | 8 |
| Magus | 2 | Ward | +1 every 3 levels | 5 |
| Revelator | 2 | Exalt | +1 every 3 levels | 5 |

Other paths to a known spell:
- **Elf — Naturally Attuned** (Ancestry): 1 spell at character creation, cast with chosen Skill
- **Spell-granting perks** (e.g., book p. 69 perk): 1 chosen spell + chosen Cast Skill; takeable multiple times
- **Wizard — Study activity** (book p. 19): may be used to swap a Class Feature choice, including a known Spell

### 1.6 Targets — what counts as a Target
Per Q37, a "Target" can be:
- **Beings** — Heroes, NPCs, animals, monsters
- **Items / Objects** — Imbue specifically targets a Weapon; damage spells with a typed Damage Base may target objects (a wooden door, a campfire) where it makes physical sense
- **Empty space** — placement origins for Area deliveries (Sphere, Cube, Line, Glyph) can be empty space; the Area exists at that location for its duration regardless of whether anyone is currently in it

### 1.7 Damage type & "Damage Base"
*See Basics, book p. 8: "Rather than specific damage types, the GM decides if an Ability applies to a source of damage."*

Vagabond does not maintain a fixed catalog of damage types. The GM decides whether a target's Immune / Weak / Armor-bypass effect applies to the actual narrative source of the damage. For weapons, damage is described narratively (piercing / slashing / blunt). **Spells are more specific**: their **Damage Base** field hints at the narrative source for GM judgment.

Per Q40, every spell has a Damage Base field:

- **Typed Damage Base** (e.g., Burn = Fire): The spell can deal damage at the standard 1d6 base / +1d6 per Mana scaling. The named source (Fire, Cold, Shock, etc.) is what the GM uses when deciding Immune / Weak applicability (§4.6).
- **Damage Base: -** : The spell is **purely effect-only**. There is no damage component; the caster cannot pay Mana to add damage to such spells.

### 1.8 Trinket / free-hand requirement
*Trinkets section: book p. 92.*

Caster must have at least one hand free or holding a Trinket to cast.

- **Trinket persistence:** Trinkets are 1-Slot, 1H Items used as a magical channel. They are not consumed by casting.
- **Two-handed weapon:** Cannot cast while wielding a 2H weapon unless one hand is freed (or unless the Gish perk lets the weapon serve as a Trinket).
- **Hands occupied with non-Trinkets:** Cannot cast — neither hand qualifies (no free hand, no Trinket grip).
- **Restrained / Grappled:** Does not prevent casting on its own. As long as a hand is free or holding a Trinket, the caster can cast.
- **Polymorph / beast form:** Handled per the polymorph spell text. If the form has no hands, default is no casting unless the spell says otherwise.
- **Gish perk:** Allows a caster to use a Weapon as a Trinket. (See §7.)

---

## 2. Delivery Types

*Delivery rules and the cost table are on book p. 90.*

### 2.1 Cost & scaling table (RAW)

| Delivery | Base Mana | Scaling |
|---|---|---|
| Aura | 2 | +1 per +5' radius |
| Cone | 2 | +2 per +5' length |
| Cube | 1 | +1 per additional 5' cube |
| Imbue | 0 | +2 per additional Target |
| Glyph | 2 | — |
| Line | 2 | +1 per +10' length |
| Remote | 0 | +1 per additional Target |
| Sphere | 2 | +1 per +5' radius |
| Touch | 0 | — |

### 2.2 Targeting model

| Delivery | Default zone | Targeting |
|---|---|---|
| Aura | 10' radius sphere from caster's center, blocked by walls/ground | Caster picks targets in zone (explicit in description) |
| Cone | 15' 3D wedge in front of caster, expanding 1:1 (width = length at the far end) | All in zone (see Q1) |
| Cube | 5' cube placed at center of any visible grid tile; +1 Mana per additional independent 5' cube | All in zone (see Q1) |
| Glyph | 5' square glyph placed within Close on a visible target; when triggered, cast in a 5' cube from the glyph, then the glyph disappears | Single trigger window |
| Imbue | Weapon equipped by a willing Being within Far; +2 Mana per additional weapon (multi-weapon) | Whoever the wielder hits |
| Line | Caster picks any visible starting point and direction; line is 5'×30'×10' base | All in zone (see Q1) |
| Remote | Single Being target chosen at range; +1 Mana per additional independent target | Single target each |
| Sphere | 5' radius sphere centered at any visible empty space | All in zone (see Q1) |
| Touch | Single target within Close (5'), or self | Single target |

### 2.3 Area shapes — physical model

Per Q15–Q19 and Q23, Area deliveries are 3D shapes blocked by walls, floors, and ceilings:

| Delivery | Shape | Placement |
|---|---|---|
| Aura | Sphere of given radius centered on the caster | Always self-anchored, moves with the caster |
| Cone | 3D wedge expanding 1:1 width-to-length from the caster's facing | Caster-emanated |
| Cube | 5' cube anchored at center of a grid tile | Each cube placed independently anywhere visible (multi-cube = multi-spot strikes) |
| Glyph | A 2D mark on a surface; on trigger, casts as a 5' cube from the glyph | Within Close, on visible surface |
| Line | 3D rectangular volume — base 5'×30'×10' (W × L × H) | Caster picks any visible starting point and a direction; line extends from there |
| Sphere | 3D sphere of given radius | Center placed at any visible empty space |

**Universal rules for 3D Area shapes:**
- No Area penetrates walls, floors, or ceilings (Q16). The shape is truncated at solid surfaces.
- The caster cannot place an Area's center inside a solid object.
- **Anchored vs caster-following (Q36):** Aura is the **only** delivery that follows the caster — its 10' sphere moves with them. **All other Areas are anchored once cast.** Cone emanates from the caster at cast time, but the resulting cone-shape is locked to that origin and direction; the cone does not rotate or follow if the caster moves. Cube, Sphere, Line, Glyph all stay where they were placed. A Sphere placed in a doorway stays in the doorway when the caster moves away.
- Vertical extent matters in principle but the game is played in 2D — altitude edge cases are generally ignored at the table.

### 2.4 Range — "in sight" interpretation
*Distance definitions: Adventuring Overview, book p. 9.*

Per Q22, the range terms used in delivery rules:

- **"You can see" / "in sight"** = unlimited range, capped only by the caster's actual line of sight (and environmental constraints). A wizard atop a tower with a clear visual on a goblin half a mile away can target it.
- **"Within Close"** = within 5' of the caster (book p. 9).
- **"Within Near"** = 5 to 30 feet (book p. 9).
- **"Within Far"** = beyond 30 feet, no upper bound (book p. 9). Effectively any distance, consistent with the sight-unlimited interpretation above.

This interpretation means Cube, Sphere, Line, and Remote can target across very long distances when the caster has unobstructed visual.

### 2.5 Line scaling — order of operations

RAW: base 2 Mana. Length scaling: +1 Mana per 10' extra length. Width/height upgrade: doubles the cost (per +5' width or +10' height).

Per Q21, **PEMDAS applies** (per the rulebook's general Order-of-Operations rule):

1. Apply width and height doublings first (multiplication).
2. Then add length scaling on top (addition).

Worked examples:

| Configuration | Cost |
|---|---|
| 5W × 30L × 10H (base) | 2 |
| 5W × 40L × 10H (+10 length) | 2 + 1 = **3** |
| 10W × 30L × 10H (width doubled) | 2 × 2 = **4** |
| 5W × 30L × 20H (height doubled) | 2 × 2 = **4** |
| 10W × 30L × 20H (both doubled) | 2 × 2 × 2 = **8** |
| 15W × 30L × 10H (width doubled twice) | 2 × 2 × 2 = **8** |
| 10W × 40L × 10H (width doubled, +10 length) | (2 × 2) + 1 = **5** |
| 10W × 40L × 20H (both doubled, +10 length) | (2 × 2 × 2) + 1 = **9** |

### 2.6 Cube scaling — independent placement

Per RAW, Cube costs +1 Mana per additional 5' cube. Per Q18 each additional cube is placed **independently** anywhere within sight — they do not need to be contiguous. This makes Cube a multi-spot AOE strike (each cube hits everything in its 5' volume). Compare to Remote (+1 per target single-Being-each).

### 2.7 Imbue scaling — multiple weapons

Per Q13, Imbue's "+2 Mana per additional Target" lets the caster imbue **multiple willing wielders' weapons in a single cast**. Each imbued weapon then independently delivers the spell when its wielder hits. The 1-Mana on-hit cost is paid per weapon-discharge per the standard Imbue rules (see §5).

---

## 3. Duration & Focus

*Duration & Focus section: book p. 90. Multi-focus rule: book p. 10. Status conditions: book p. 13.*

### 3.1 Default duration
- **Damage** is instant.
- **Effects** last until the caster's next Turn.

### 3.2 Focus to sustain
The caster may declare Focus when casting. Focus extends the spell until the caster releases it. The act of holding Focus is not an Action.

### 3.3 Per-round Maintain-Focus check
- Required only when the focused spell currently includes an unwilling Being as a target.
- Cost: 1 Mana + a Cast Check. Pass = focus continues.
- The same trigger lets the caster spend additional Mana to deal extra damage at 1d6 per Mana.

> **Sidebar — Spell-text focus exceptions.** Some spells specify their own focus mana cost that overrides the general "1 Mana only when an unwilling target" rule. Example: **Polymorph** requires 1 Mana per turn to focus *even for willing targets*. When a spell's text gives a focus-cost rule, the spell text wins.

### 3.4 What "maintains" under focus (FAQ Life ruling)
Per the creator FAQ — "Damage and Delivery are initial costs of the casting" (paid once at cast). Anything beyond that — typically a spell's effect when it has its own per-cast cost — counts as an additional cost that must be re-paid each round of focus to recur. The Life spell's healing was the worked example: it does not auto-recur on focus rounds; the effect mana must be spent again.

Practical translation (proposed):

| Effect kind | Auto-recurs under focus? | Re-pay required? |
|---|---|---|
| Damage tick (e.g., a Sphere of Burn) | Yes — applied to those in zone at each focus tick | No |
| Persistent status condition (Burning, Frightened, Restrained) | Once applied, lasts per its own status rules | No |
| Restorative or transformative effect (Life heal, regrow tissue) | No — one-shot at cast | Yes — re-pay effect cost each round to recur |

This split is a community-facing interpretation of the FAQ wording — see Q2 for confirmation.

### 3.5 Continual duration
*"Continual" definition: book p. 90. Cast Crit benefit rule: Basics, book p. 8.*

A spell with **Continual** duration requires no Focus and lasts until ended (no Action to end).

**How a spell becomes Continual:**
1. **Spell-specific Crit benefit.** Some spells list "Duration is continual" as their Crit benefit (per Basics, book p. 8: on a Cast Crit, the caster may forgo 1 Luck to use the spell's listed Crit benefit). Spells with this benefit include: Amplify, Apoplex, Babble, Charm, Color, Confuse, Enflesh, Fear, Freeze, Mute (book p. 93+). **It is not a universal rule for all Cast Crits** — other spells have different Crit benefits (e.g., Burn upgrades its Cd4 to Cd6; Light blinds chosen Beings in the zone).
2. **Class features and perks** (see §7) — e.g., Witch Hex makes a chosen spell continual on a chosen target without Focus.
3. **Spell-baseline duration.** A few spells may have Continual duration intrinsically per their description.

**Generic Cast Crit benefit (when not forgoing Luck for the spell's Crit benefit):** Per Basics (book p. 8), deal damage equal to the casting Stat to the Target(s).

### 3.6 Damage does not break focus (FAQ)
Taking damage does not break focus. This is not 5E concentration.

### 3.7 One focused effect at a time (default)
Per Adventuring Overview (book p. 10): focus ends early if you drop it or if you focus on another effect. The default cap is **one focused effect at a time**. Focusing on a new spell ends the prior focus.

**Class-feature carveouts to the one-focus default:** see §7.

### 3.8 Focus interrupted by Incapacitation
Incapacitated explicitly prevents focusing. Therefore any condition that includes Incapacitated (e.g., Unconscious, Paralyzed) ends focus. Spells that depend on focus to persist (e.g., Glyph) end accordingly.

### 3.9 Focus check failure
On a failed Maintain-Focus Cast Check, the spell ends. The 1 Mana spent on the attempt is lost (paid for the attempt, not the result). Effects already applied to targets persist per their own rules.

### 3.10 Status conditions affecting casting and focus

Per Q14:

| Status | Effect on casting | Effect on focus |
|---|---|---|
| **Berserk** | Cannot cast | Cannot focus |
| **Confused** | Cast Checks are Hindered (–1d6); does not prevent the cast attempt. Saves vs. a Confused caster's spells are Favored. | Same Hinder applies to focus checks |
| **Dazed** | The round Dazed is applied: cast and focus normally. **Subsequent rounds:** must spend the Action to maintain focus, OR do something else (focus drops). If the Action is spent maintaining focus, no other Action that turn (no Cast). | Same as left |
| **Incapacitated** | Cannot cast (Cast is an Action; Incapacitated cannot Act) | Cannot focus |
| **Unconscious** | Includes Incapacitated → cannot cast or focus | Same |
| **Paralyzed** | Includes Incapacitated → cannot cast or focus | Same |

---

## 4. Combat Interactions

### 4.1 Group Turn Initiative
*Turn Order: Adventuring Overview, book p. 14.*

Heroes act as a single group, then monsters act as a single group, then the next round begins. Within a group's turn, members can move and take actions in any order they like.

**Implication for focus:** the per-round Maintain-Focus check fires once per round at the **start of the hero group's turn** (or the monster's, for NPC casters), not on a per-individual-turn basis since there isn't one.

### 4.2 Armor vs spell damage
Armor does **not** reduce spell damage. Spells aren't "attacks" mechanically.

### 4.3 Block / Dodge vs spells
Block and Dodge are attack defenses only. They do not apply to spell damage.

### 4.4 Saves vs spell effects
*Save Difficulties: Hero Creation, book p. 22.*

**Heroes save; NPCs do not.** Saves are a Hero-side mechanic for defending against incoming harm. NPCs are never the saving party — when a Hero casts at an unwilling NPC, the Hero's Cast Check is the only roll; on pass, the spell's effect applies.

**Save Difficulties are fixed per Hero**, based on their stats:
- **Endure Difficulty** = 20 - (Might × 2)
- **Reflex Difficulty** = 20 - (Dex + Awareness)
- **Will Difficulty** = 20 - (Reason + Presence)

The caster's stats / level / spell cost do not affect the save's Difficulty. A goblin's Fear and a dragon's Fear use the same mechanics for the same Hero.

**NPC-cast spells specify the save type in their statblocks** (e.g., `[Cast, Beings who hear it | Will]`). Hero spell descriptions do not list save types — Hero casts at NPCs resolve via the caster's Cast Check, with the NPC simply taking the effect on pass.

**Hero-vs-Hero casts** (friendly fire, PvP, etc.) are GM-arbitrated case-by-case. There's no predetermined save mechanism for one Hero's spell against another Hero target.

### 4.5 Counterspell & Dispel mechanisms

Per Q26, the ways to interrupt or undo another caster's spell:

| Mechanism | Source | How it works |
|---|---|---|
| **Dispel spell** | Magic ch., book p. 94 | Cast targeting an active magic effect; on pass, the effect is suspended for the Dispel's duration (1 round, or until focus drops). On a Cast Crit, the effect is completely dispelled (unless it's a Relic Power). The dispelled effect is treated as an unwilling Target — Dispel always triggers a Cast Check. |
| **Magus — Spell Parry** (2nd lvl) | Class feature, book p. 47 | The Magus can Block Casts that target them, if the cast calls for a Reflex Save or has Touch / Remote delivery. On a Block Crit, the effect is dispelled. |
| **Magus — Spell Surge** (6th, 10th lvl) | Class feature, book p. 47 | When the Magus passes a Spell Parry by 10+ (8+ at 10th level), they can reflect the Cast back at the caster. |
| **Monster abilities** | Bestiary, book p. 113+ | E.g., Flail Snail Reflective Shell (d6: 1 reflects, 2-3 dispels, 4-6 normal); Artificials' Antimagic Vulnerability (Dazed Cd4 if Dispel-targeted); Cryptid Cloak of Darkness dispels magic light. |
| **Status with "unless dispelled"** | Adventuring, book p. 26 | Some environmental effects (Dread Wave, Psychic Stun) apply statuses removed only by Dispel. |

**Note on Dispel duration:** Dispel uses standard spell duration rules — 1 round unless the caster Focuses (then until focus drops) or crits (complete dispel of non-Relic effects).

### 4.6 Damage type — Immune / Weak interactions

Per Q46, spell damage with a typed Damage Base interacts with target Immune / Weak status:

- **Immune to type → no damage taken.** Status effects tied to the spell may also be gated by immunity (e.g., Burn's Burning condition only applies *"if the Target isn't immune to Fire"*).
- **Weak to type → extra damage die.** The "ignores Armor" facet of Weak is moot for spells (since armor doesn't reduce spell damage anyway per §4.2), but the bonus die does apply.
- **Damage Base: -** spells (effect-only, see §1.7) have no damage type and never trigger Immune/Weak interactions.

### 4.7 Hold Action with a Cast

Per Q31, the **Hold** Action ("Use an Action or Move on an Off-Turn") can be used to defer a Cast Action to the off-turn:

1. **A Cast can be Held** — Cast is an Action, so any Action-deferred via Hold can be a Cast.
2. **No declared trigger required.** The caster picks any moment during the off-turn to release the Held Cast. (No "if X happens, I cast Y" reservation.)
3. **Damage / interrupts do not cancel a Held Cast.** A Held Action is just a timing shift — the caster still has their Action to spend; damage taken in the meantime does not undo it. (Becoming Incapacitated would still prevent acting per §3.10.)

### 4.8 Stealth & casting

Per Q30, casting and Stealth are **per-spell**. Whether a cast breaks Stealth depends on the spell's actual effect:

- A 30' Line of fire shooting from your hands obviously reveals you.
- A subtle Touch on yourself in shadow does not.
- The GM rules at the table; module automation should not auto-break Stealth on every cast.

---

## 5. Imbue — Special Rules

*Imbue delivery: book p. 90. FAQ video clarifications cited in §5.3 and §5.4.*

### 5.1 Cast model (FAQ: weapon-as-conduit)
The spell is cast onto a willing Being's weapon within Far. The weapon becomes a conduit until discharged or expired (see Q5). On hit, the imbue may discharge into the target.

### 5.2 Cast Check
The Attack Check made by the wielder doubles as the Cast Check.

### 5.3 Mana on hit (FAQ)
The 1-Mana delivery cost is paid **on hit**, not at cast. Either the caster or the wielder may pay the 1 Mana.

### 5.4 Stacking (FAQ)
Multiple spells can be imbued onto the same weapon. Each imbue is its own cast and its own Action. Stacking is gated by the Action and Mana economy, not by a hard rule.

### 5.5 Damage and effect choices
Per RAW cast rules (§1.1), the damage dice and effect intent are chosen at cast. The 1-Mana delivery cost is the only cost deferred to the on-hit moment.

### 5.6 Multi-weapon Imbue (Q13)
Imbue's "+2 Mana per additional Target" cost lets the caster Imbue **multiple willing wielders' weapons** in a single cast. Each imbued weapon independently delivers the spell when its wielder hits. The caster must still expend Focus to maintain the Imbue past their next turn (per Q6); a single focus slot covers all weapons imbued from the same cast.

### 5.7 Imbue + Attack Crit (Q34)

When the wielder makes a natural-20 Attack Check with an imbued weapon, the same roll is **both** an Attack Crit and a Cast Crit (because the Attack Check IS the Cast Check for Imbue). Two separate Crit rewards apply:

- **Weapon-attack Crit:** Standard attack-crit reward (Stat-bonus damage from the attack), per Basics ch. 01.
- **Spell Crit:** The wielder may forgo 1 Luck for either Stat-bonus damage on the spell **or** the spell's listed Crit benefit. **The wielder decides** which spell-crit reward to take (they made the crit).

Both rewards stack on the same hit.

### 5.8 Stacking (FAQ) — recap
Multiple separate casts can stack imbues onto the same weapon. Each stacked imbue is its own cast and its own Action. Per Q8, on a successful hit all stacked imbues fire simultaneously; each costs its own 1 Mana on hit (paid by either the caster or the wielder). The behavior when an imbue's payer can't afford the on-hit Mana is **PENDING** — see §6 Q8.

---

## 6. Decided Rulings

Each ruling below was decided after walking through the rulebook, FAQ, and creator-clarification video. Items still pending creator confirmation are marked **PENDING**. Items locked by RAW or FAQ evidence are marked **RAW** or **FAQ**.

### Q1 — "Unless you specify otherwise" for Area deliveries — **PENDING**
*Source: book p. 90 (Magic / Delivery).*

**Scenario:** Wizard casts Burn as a Sphere centered on a melee scrum: 3 goblins + 1 fighter ally are in the sphere.

**RAW (book p. 90):** Area deliveries "Target everything in it unconditionally, unless you specify otherwise." Aura's own description carves out caster choice. The other Areas (Cone, Cube, Glyph, Line, Sphere) do not.

The phrase **"unless you specify otherwise"** has two reasonable readings:

- **Reading A — Caster discretion built in.** "You" is the caster: at cast time, the caster may declare which targets in the zone are excluded, the same way Aura's description allows. Effectively, every Area is Aura-style at the caster's option. Friendly fire is opt-in, never forced.
- **Reading B — Per-spell carveout only.** "You specify otherwise" means *the spell description* specifies. Aura specifies. Other Areas don't. Therefore Cone/Cube/Glyph/Line/Sphere hit every Being in the zone with no caster discretion.

**Decision:** Reading A — caster discretion is RAW for all Areas. Defaults to no friendly fire unless the caster opts to include allies (e.g., to hit a Charmed ally).

**Confirmation needed from creator:** Is Reading A the intended interpretation?

This ruling has the largest single impact on module behavior — if Reading A is correct, target-pick UI is uniform across Areas; if Reading B is correct, only Aura gets target-pick and other Areas force-include everyone in the zone.

---

### Q2 — Persistent-state vs per-tick effects — **FAQ**
**Scenario:** A spell with an effect (Burning, Frightened, Life's healing, etc.) is being focused round-over-round.

**RAW + FAQ:** Damage and Delivery are initial costs paid at cast. Any additional costs (a spell's effect with its own cost) must be re-paid each round of focus to recur. The Life spell heal was the explicit example.

**Decision:** Effects split into two buckets:
- **Persistent state / damage tick** — applied once when target is subject to the spell; recurs under focus without re-pay (damage), or persists per status rules (Burning Cd4, Frightened "for the duration", etc.). No per-round re-pay required.
- **Per-tick restorative/transformative** — Life heal and similar one-shot benefits. Caster must re-pay the effect cost each round of focus to make it recur. Without re-pay, focus only maintains damage and any persistent-state conditions already applied.

**Per-spell categorization pass:** to be done as a separate worksheet against `02_Spell List.md` after Q1–Q12 are settled.

---

### Q3 — Adding the Effect mid-focus — **DECIDED (strict RAW)**
**Scenario:** Wizard casts Burn as Sphere for damage only on round 1. On round 2, can they spend an additional 1 Mana on the focus check to also add the Burning effect?

**RAW:** Explicitly allows adding **damage** on the focus check (1d6 per Mana). Silent on adding the **Effect** if it wasn't paid at cast.

**Decision:** Not allowed. The Effect is a cast-time choice. Mid-focus, the caster may add damage but not introduce the Effect retroactively.

---

### Q4 — Zone-membership tracking timing — **DECIDED**
**Scenario:** A goblin walks into a focused Sphere mid-round, after the wizard's Maintain-Focus tick has already resolved.

**RAW:** Silent on intra-round movement.

**Decision:** Live tracking. A creature that walks into a focused Area takes the spell's effects (damage and any applicable status) immediately on entry, the same as targets in the zone at the focus tick. Walking out of the zone does not retroactively un-apply effects already taken.

---

### Q5 — Status persistence for those leaving the zone — **RAW**
*Sources: Burn spell (book p. 93), Fear spell (book p. 95), Status conditions (book p. 13), Duration rule (book p. 90).*

**Scenario:** A Burning goblin runs out of a focused Sphere of Burn. A Frightened goblin runs out of a focused Sphere of Fear.

**RAW evidence:**
- Burn spell text: "This Burning Status does not require Focus." Burning's own Cd4 + dousing rules govern duration.
- Fear spell text: target is Frightened "for the duration, ending early if you Cast this Spell again." Duration here = focus duration.
- General duration rule (book p. 90): effects last until the caster's next Turn unless the caster Focuses to sustain.

**Decision:** Spell-applied statuses persist per the spell's own duration text and the status's own rules. **Zone position does not gate persistence.** Burning is governed by its Cd4 + dousing. Frightened (from Fear) lasts as long as the wizard maintains focus, regardless of where the goblin runs to. Leaving the Area does NOT end an applied status.

---

### Q6 — Imbue duration before discharge — **DECIDED (RAW-derived)**
**Scenario:** Caster imbues a weapon. Combat ends without any attack landing. How long does the imbue persist?

**RAW evidence:** General duration rule (effects until caster's next turn, unless Focused). The Levitate-Imbue perk explicitly says the perk's Imbue persists "without Focus" — a carveout that only makes sense if the default requires Focus.

**Decision:** Imbue requires **Focus** to last beyond the caster's next turn. Without focus, the imbue expires per the general duration rule. With focus, it persists until the caster drops focus, the imbue discharges, or focus is otherwise broken (e.g., Incapacitated). Continual imbue requires a Crit on the Cast Check or a perk/feature carveout.

---

### Q7 — Glyph timing and trigger — **DECIDED (RAW-derived)**
**Scenario:** Caster places a Glyph. Combat shifts. Caster wants to detonate the glyph rounds later.

**RAW evidence:** The Snareroot Trapper perk says "Cast Sprout with a Glyph delivery for no additional Mana and **without Focusing**." That carveout only makes sense if the default Glyph requires Focus.

**Decision:**
- Glyph requires **Focus** to remain armed.
- Triggering the glyph is "when you choose" — caster volition, not an Action.
- If the caster becomes Unconscious / Incapacitated, the Incapacitated rule prevents focusing → focus drops → Glyph disarms.

**Sub-question still open (PENDING):** Can a Glyph be triggered as part of a Held Action's resolution? RAW silent.

---

### Q8 — Multiple imbues on one weapon — **DECIDED**
**Scenario:** Wielder has 3 imbues stacked. Attack lands.

**Decision:** All stacked imbues fire simultaneously on a successful hit. Each imbue costs its own 1 Mana on hit, paid per the FAQ rule (either caster or wielder pays each).

**Sub-questions still open (PENDING):** What happens if a payer cannot afford the 1 Mana for one of the stacked imbues — is that imbue skipped, or does the spell whiff entirely? Is the imbue consumed regardless, or does it stay on the weapon for a future hit?

---

### Q9 — Charmed allies — willing or unwilling? — **DECIDED (RAW-derived)**
**Scenario:** A party member is Charmed by an enemy. Another party member's wizard wants to cast Heal on them.

**RAW:** Charmed only restricts the Charmed creature from willingly attacking the charmer. Does not alter the Charmed creature's willingness toward other casters or other actions.

**Decision:** The Charmed ally remains a **willing** target for friendly spells (heals, buffs). No Cast Check required for the wizard's cast, because the ally is willing toward the wizard. Charmed only prevents the Charmed creature from attacking the charmer; everything else is unaffected.

---

### Q10 — Self as Touch target — **DECIDED (RAW-derived)**
**Scenario:** Caster casts Bless as Touch on themselves.

**RAW:** Touch is defined as "a Close Target, or yourself." Self is explicitly a valid Touch target.

**Decision:** Self is always a willing target. No Cast Check required when the only target is the caster.

---

### Q11 — Multiple simultaneous focuses — **RAW**
*Source: Adventuring Overview, book p. 10.*

**Scenario:** A caster wants to maintain focus on two different spells at once.

**RAW (book p. 10):** Focus ends early if you drop it or focus on another effect.

**Decision:** Default cap is **one focused effect at a time**. Focusing on a new spell ends any prior focus. Class features are the explicit exception:
- **Witch — Hex (4th lvl):** allows half-Witch-level (rounded up) spells to be made continual on chosen targets *without* focus. These do not consume the focus slot.
- **Revelator — Paragon's Aura (4th lvl):** allows simultaneous focus on one Spell-as-Aura and one Spell-as-Imbue.

Anything else that grants extended focus must come from a class feature, perk, or Continual duration.

---

### Q12 — Focus check failure — **DECIDED**
**Scenario:** Caster fails the per-round focus Cast Check.

**Decision:** The spell ends immediately. The 1 Mana spent on the attempt is **lost** — paid for the attempt, not the result. Effects already applied to targets persist per their own rules (see Q5 for status persistence; once applied, they don't un-apply because focus ended).

---

### Q13 — Imbue with multiple targets — **DECIDED**
**RAW:** Imbue scaling cost is +2 Mana per additional Target.

**Decision:** Multiple weapons. Imbue can target multiple willing wielders' weapons in one cast at +2 Mana per additional weapon. Each imbued weapon independently delivers the spell when its wielder hits.

---

### Q14 — Status conditions affecting casting & focus — **DECIDED (RAW + Dazed nuance)**
**Decision:** See §3.10 for the consolidated table. Key points:
- **Berserk / Incapacitated / Unconscious / Paralyzed** all prevent casting and focus.
- **Dazed:** First round normal; subsequent rounds force a tradeoff — spend the Action on focus OR cast OR do something else, can't combine.
- **Confused:** Hinder on Cast Checks; doesn't prevent attempts. Saves vs Confused caster's spells are Favored.

---

### Q15 — Aura shape — **DECIDED**
**Decision:** A 10' radius sphere from the caster's center, blocked by walls and the ground/floor. Effectively a hemisphere on flat ground; full sphere if the caster is suspended.

---

### Q16 — Areas vs walls — **DECIDED**
**Decision:** No Area delivery (Aura, Cone, Cube, Glyph, Line, Sphere) penetrates walls, floors, or ceilings. Areas are truncated by solid surfaces.

---

### Q17 — Cone shape — **DECIDED**
**Decision:** Cone is a 3D wedge expanding 1:1 (width = length at the far end). 15' base = 15' long, 15' wide at the end. Per Q23 scaling, the cone's width grows proportionally with length.

---

### Q18 — Cube placement & multi-cube scaling — **DECIDED**
**Decision:**
- Each 5' cube is anchored at the **center of a grid tile**.
- RAW scaling = +1 Mana per additional 5' cube. Each additional cube is placed **independently** anywhere within sight; cubes do not need to be contiguous.
- Cube becomes a multi-spot AOE: each cube hits everything within its 5' volume.

---

### Q19 — Sphere placement — **DECIDED**
**Decision:** The sphere center is placed at any visible empty space (in air or on a surface). Walls and floors block the sphere — center cannot be inside a solid object.

---

### Q20 — Line origin — **DECIDED**
**Decision:** Caster picks any visible starting point and a direction; the line extends from there. Lines are placeable like a wall, not emanating from the caster.

---

### Q21 — Line scaling math — **DECIDED**
**Decision:** PEMDAS applies. Apply width/height doublings (multiplication) first, then add length scaling (+1 per +10'). See §2.5 for the full cost table.

---

### Q22 — Range / "in sight" — **DECIDED**
**Decision:** "In sight" / "you can see" = unlimited range, capped only by the caster's actual line of sight and environment. Cube, Sphere, Line, and Remote can target across very long distances when the caster has unobstructed visual.

---

### Q23 — Cone scaling shape — **DECIDED**
**Decision:** Proportional. Cone width = cone length at the far end. A 20' cone is 20' wide at the end; a 25' cone is 25' wide; etc. Width grows automatically with length.

---

### Q24 — Remote multi-target placement — **DECIDED**
**Decision:** Each Remote target selected independently; targets do not need to cluster. Targets must each be within sight per Q22.

---

### Q25 — Trinket / hand-state for casting — **DECIDED**
**Decision:** See §1.5. Summary: Trinket is a 1-Slot 1H persistent item, not consumed. Cannot cast with both hands non-Trinket-occupied. Restrained/Grappled does not prevent casting on its own. Polymorph form casting is per the polymorph spell text. Gish perk lets a Weapon serve as a Trinket.

---

### Q26 — Counterspell & Dispel mechanisms — **DECIDED (RAW)**
**Decision:** See §4.5. Vagabond has the Dispel spell (cast against active magic effect — suspends 1 round / focus / crit-permanent), Magus Block-Cast feature, and various monster abilities.

---

### Q27 — Spell precedence — **DECIDED**
**Decision:** No actual conflict between spell text and general rules. Spell text **adds specificity** within its own domain (target effect, duration text, end conditions); the general magic rules govern the meta-mechanics of casting/focus. Both apply simultaneously. The Charm-on-damage example: damage doesn't break the caster's focus, but it does end the Charmed status on the damaged target — these operate on different mechanics, so there's no conflict.

---

### Q28 — Touch range & Cast Check — **DECIDED (RAW)**
**Decision:**
- Touch range = within Close (5'), or self.
- Touch on an unwilling target requires a normal Cast Check; no separate attack roll. (Imbue is the only delivery that substitutes Attack Check for Cast Check.)
- Self-Touch = always willing, no Cast Check (per Q10).

---

### Q29 — Spell knowledge & non-known casts — **DECIDED**
**Decision:** Casters can only cast Spells they **know**. Spells are gained via:
- Class progression (per class entry)
- Ancestry (e.g., Elf "Naturally Attuned")
- Perks (e.g., the perk granting a chosen Spell + chosen Skill)

NPCs are limited to their statblock casts.

**Exceptions** (Relics):
- **Spell Scroll** — anyone reads to cast the imprinted spell (no Mana, scroll vaporizes).
- **Spell Book** — non-creator passes an Arcana Check to cast a spell from it; nat 1 dissolves the book. Creator does not need the book to cast (they already know the spell).
- **Scroll, Protection** — anyone reads to create the protective Aura.

**Sub-question still PENDING:** Is the Spell Book's "creator casts without issue" clause meaningful, or is it just clarification that the book doesn't impose extra constraints on its creator?

---

### Q30 — Stealth & casting — **DECIDED**
**Decision:** Per-spell. The spell's actual effect determines whether casting reveals the caster. Module automation should not universally break Stealth on every cast. See §4.8.

---

### Q31 — Hold Action with a Cast — **DECIDED**
**Decision:**
- Cast is an Action; can be Held.
- No declared trigger — the caster picks any moment during the off-turn to release.
- Damage / interrupts do not cancel a Held Cast (Incapacitated still prevents acting).

See §4.7.

---

### Q32 — Mana restoration — **DECIDED (RAW)**
**Decision:** Mana restored to maximum on a successful Rest (Shift of low activity, fed and rested). Wizards additionally regain Mana on Study. Manasteal Relics restore Mana on kills. Sorcerer's Tap converts HP to Mana. See §1.5.

---

### Q33 — 0-Mana casting — **DECIDED**
**Decision:** Caster can configure any spell to fit current Mana. Cannot attempt a cast whose total Mana cost exceeds available Mana. At 0 Mana, casts are limited to 1d6 damage OR effect-only (one or the other, picking neither costs both at 1 Mana) with a 0-Mana delivery (Touch / Remote single / Imbue base). See §1.5.

---

### Q34 — Imbue + Attack Crit — **DECIDED**
**Decision:** A natural-20 attack with an imbued weapon is both an Attack Crit and a Cast Crit. The wielder decides the spell's Crit benefit. Both crit rewards (weapon attack crit + spell crit) stack on the same hit. See §5.7.

---

### Q35 — Casting in beast form (Polymorph) — **NOT CODIFIED**
**Decision:** GM ruling, case-by-case. Default: no casting if the form has no free hands and no Trinket grip. Specific spell text (e.g., Polymorph) governs. Not codified as a rule.

(Polymorph also has a unique focus-cost rule: 1 Mana per turn even for willing targets. See §3.3 sidebar.)

---

### Q36 — Anchored vs caster-following Areas — **DECIDED**
**Decision:** Aura is the only delivery that follows the caster. Cone emanates at cast time but the cone-shape is anchored to that origin and direction afterward. Cube, Sphere, Line, Glyph are all anchored to their placement spot. See §2.3.

---

### Q37 — Non-Being targets — **DECIDED**
**Decision:** Targets can be Beings, Items/Objects (where physically meaningful), or empty space (for Area placement). See §1.6.

---

### Q38 — NPC-cast Save Difficulty — **DECIDED (RAW)**
**Decision:** Saves are a Hero-side mechanic. Save Difficulty is fixed per Hero based on their stats:
- Endure = 20 - (Might × 2)
- Reflex = 20 - (Dex + Awareness)
- Will = 20 - (Reason + Presence)

Caster's stats / level / spell cost do not influence the save's Difficulty. See §4.4.

---

### Q39 — Hero-vs-Hero saves — **DECIDED**
**Decision:** GM-arbitrated case-by-case. Hero-cast spells don't carry predetermined save mechanisms (Hero spell descriptions don't list save types). See §4.4.

---

### Q40 — Damage Base "-" — **DECIDED**
**Decision:** Effect-only spell. No damage component. Caster cannot pay Mana to add damage to such spells. See §1.7.

---

### Q41 — Range table values — **DECIDED (RAW)**
**Decision:**
- **Close** = within 5 feet
- **Near** = 5 to 30 feet
- **Far** = beyond 30 feet (no upper bound in RAW)

"Within Far" effectively means any distance, consistent with the sight-unlimited interpretation (Q22).

---

### Q42 — Multi-cast per turn — **DECIDED (RAW)**
**Decision:** Default is 1 Cast per turn (Cast = an Action; 1 Action per turn baseline). Class features extend:
- **Sorcerer Quickening (4th):** skip Move to Cast (floor-only, 0 Mana).
- **Sorcerer Spell Twinning (8th):** Favor on the second same-spell cast in a turn.
- **Hold Action** can defer a Cast to the off-turn.
- **Save Crit** grants an Action that may be a Cast.

See §7 for class-feature carveouts.

---

### Q43 — Sorcerer d8 damage die — **DECIDED**
**Decision:** Sorcerer's Spell-Slinger d8 die replaces the d6 for **all** spell damage dice — base and scaling. A Sorcerer's 3d damage cast rolls 3d8.

---

### Q44 — Studied dice — **DECIDED (RAW)**
**Decision:** Studied dice are general-purpose Favor tokens earned from the Study downtime activity. Spend a Studied die for Favor on a d20 roll within the next day. Unspent dice expire after a day. Wizard's Page Master and Extracurricular features are wizard-specific uses (add die to damage/healing roll, or Cast a spell you don't know). See §8 for Wizard's spell-knowledge carveout.

---

### Q45 — Per-cast Mana cap — **DECIDED**
**Decision:** Cap is on cast-time Mana spending only. Imbue's deferred 1 Mana on hit does not count against the cap. See §1.5.

---

### Q46 — Damage typing & Immune/Weak — **DECIDED (RAW + Q14)**
**Decision:**
- Immune to type = no damage; status effects gated by Immune may also not apply (per spell text).
- Weak to type = extra damage die. (Armor-bypass facet is moot for spells.)
- Untyped (Damage Base: -) spells have no damage typing — Immune/Weak don't apply.

See §4.6.

---

### Q47 — Same-status stacking from multiple casters — **DECIDED**
**Decision:**
- Status conditions are binary (Charmed or not), but each spell instance has its own end conditions.
- Multiple casters' Charm on the same target: both spells run independently. If end conditions trigger (e.g., target takes damage), both spells end simultaneously and the status drops.
- Both casters count as "charmers" — target can't willingly attack either.
- Each caster maintains their own focus and pays their own per-round Mana / Cast Check.

---

## 7. Class & Perk Carveouts

The base rules above are modified by specific class features and perks. This section enumerates every carveout that affects the magic system, so they're easy to find when implementing or interpreting an unusual case.

### Focus / Duration carveouts
- **Witch — Hex (1st lvl)** *(book p. 61)*: "Choose for the effects of a Spell you Cast (not the damage) to become continual for one of the Targets until you use this Feature on a different Target. This does not require your Focus." Capped at half Witch level (rounded up) simultaneous Hex'd spells.
- **Revelator — Paragon's Aura (4th lvl)** *(book p. 53)*: Cast as 10' Aura for no Mana, and may focus on one Spell-as-Aura plus one Spell-as-Imbue at the same time.
- **Wizard — Manifold Mind (4th lvl)** *(book p. 63)*: Focus on up to **2 Spells** simultaneously. At 8th level, up to **3 Spells**.

### Cost / Crit / Damage carveouts
- **Wizard — Sculpt Spell (2nd lvl)** *(book p. 63)*: -1 Mana on Spell delivery cost.
- **Wizard — Archwizard (10th lvl)** *(book p. 63)*: -2 Mana on Spell delivery cost (supersedes Sculpt Spell).
- **Sorcerer — Spell-Slinger (2nd lvl)** *(book p. 57)*: Cast Crit on natural 19-20 (vs. baseline 20 only). Spell damage uses d8 instead of d6 (scales for all spell damage dice — base + bonus).
- **Sorcerer — Overpowered (10th lvl)** *(book p. 57)*: Cast Crit on natural 18-20. Caster may take 2 Fatigue to regain Cd6 Mana per turn and bypass the per-cast Mana cap.

### Multi-cast carveouts
- **Sorcerer — Quickening (4th lvl)** *(book p. 57)*: Skip Move to Cast a Spell. No Mana can be spent on this Cast (floor-cast only). Effectively grants a second cast per turn.
- **Sorcerer — Spell Twinning (8th lvl)** *(book p. 57)*: If you Cast the same Spell twice in a turn, the second Cast Check is Favored.

### Mana resource carveouts
- **Sorcerer — Tap (1st lvl)** *(book p. 57)*: Reduce Max HP to gain Mana (2× the reduction) when you Cast. Reduction ends on Rest. Lethal HP reduction resolves the cast before death; body vaporizes.
- **Wizard — Mana regeneration** *(book p. 63)*: Regains Mana on **Rest *or Study*** (Wizards have a unique Study activity that restores Mana).

### Spell knowledge carveouts
- **Wizard — Extracurricular (6th lvl)** *(book p. 63)*: Spend a Studied die to Cast any one Spell — **even a Spell you don't know** — with that casting. Exception to Q29's "known spells only" rule.
- **Wizard — Page Master (1st lvl)** *(book p. 63)*: Includes the Bookworm Perk; on a successful cast, spend a Studied die to add it to the damage or healing roll.

### Trinket carveouts
- **Gish perk** *(book p. 68)*: Allows a caster to use a Weapon as a Trinket. Additionally, when casting a Spell with Imbue delivery on a Weapon they have Equipped, they may make an attack with that Weapon as part of the same Action.

### Imbue carveouts
- **Levitate-Imbue perk** *(book p. 73)*: When you cast Levitate as Imbue on a 2-slot-or-less Item to grant 30' Fly Speed, the Imbue persists without Focus until you Imbue another Item this way.

### Glyph carveouts
- **Snareroot Trapper perk** *(book p. 72)*: Cast Sprout with a Glyph delivery for no additional Mana and without Focusing. One Sprout-Glyph active at a time.

### Druid carveouts *(book p. 37)*
- **Tempest Within (2nd lvl):** Reduce Cold, Fire, and Shock damage taken by (half Druid Level) per damage die.
- **Innervate (4th lvl):** Action to give a Close Being some of your Mana, or to end one of [Charmed, Confused, Frightened, Sickened] on a Close Being (or yourself).
- **Ancient Growth (6th lvl):** While focusing a self-only Polymorph, may focus 1 additional Spell. Beast attacks while polymorphed count as (+1) Relic; bonus increases every 6 Druid levels.
- **Savagery (8th lvl):** +1 Armor while polymorphed.

### Luminary carveouts *(book p. 45)*
- **Radiant Healer (1st lvl):** Includes Assured Healer perk; healing rolls of your Spells can Explode on their highest value.
- **Overheal (2nd lvl):** Excess HP from healing redirects to caster or a visible Being.
- **Ever-Cure (4th lvl):** When you restore HP, may end one of [Charmed, Confused, Dazed, Frightened, Sickened] on the target.
- **Revivify (6th lvl):** Life Spell can revive Beings dead up to 1 hour. If the Luminary dies, they auto-revive once per day.
- **Saving Grace (8th lvl):** Healing rolls also Explode on a 2 (in addition to the highest value).
- **Life-Giver (10th lvl):** Beings revived by the Luminary start at 4 Fatigue (or lower if they had less); Life doesn't add Fatigue when used by this Luminary.

### Magus carveouts *(book p. 47)*
- **Spell Parry (2nd lvl):** Block Casts that include the Magus as a Target if the cast calls for Reflex / Touch / Remote. Crit-Block dispels the effect.
- **Arcane Recall (4th lvl):** Action to swap a Spell Known (not Ward). Once per Rest, or take 1 Fatigue between uses.
- **Spell Surge (6th lvl, 10th lvl):** Pass a Spell Parry by 10+ to reflect the Cast back at the caster. At 10th level, threshold drops to 8+.
- **Aegis Obscura (8th lvl):** Magus and the Target of their Ward Spell have Allsight; both take half damage from magic-based sources.

### Revelator carveouts *(book p. 53)*
- **Lay on Hands (2nd lvl):** Touch a Being to restore (d6 + Level) HP. Action or skip Move. Twice per Rest.
- **Divine Resolve (6th lvl):** Immune to Blinded / Paralyzed / Sickened. Lay on Hands cures these statuses on its target as well.

### Witch carveouts *(book p. 61)*
- **Ritualism (2nd, 10th lvl):** 10-minute Ritual once per Shift; twice per Shift at 10th level.
- **Things Betwixt (4th lvl):** Once per Scene, Action or skip Move to become Invisible until next turn (requires Focus).
- **Coventry (6th lvl):** Can Cast Spells that Near Allies can Cast (borrows ally spell pool). **Major exception to Q29's known-spells-only rule.**
- **Widdershins (8th lvl):** Hex target is Weak to caster's damage (does not ignore Immunity); caster's Spells ignore the Hex target's Status Immunities.

(Class casting rules are still being filled in — feature names and pages confirmed against the rulebook PDF.)

---

## 8. Spell Knowledge & Relic Exceptions

Per Q29, casters can only cast Spells they know. There is no "any spell, any caster" model.

### 8.1 Sources of known spells
- **Class progression:** Each class entry lists which spells the class learns at which levels.
- **Ancestry:** Elf "Naturally Attuned" — knows one Spell, casts it with chosen Skill.
- **Perks:** Some perks grant specific Spells (often with a chosen casting Skill). Perks may be takeable multiple times to learn additional spells.
- **NPC statblocks:** NPC casters are limited to the casts listed in their statblocks.

### 8.2 Each known spell carries a Cast Skill
The casting tradition (Arcane / Divine / Glamour / Occult / Primal — see §1.4) determines the default Skill, but ancestry- and perk-granted spells may use a chosen Skill.

### 8.3 Relic exceptions to "known spells only"

| Relic | How it works |
|---|---|
| **Spell Scroll** (consumable) | Anyone reads it to cast the imprinted spell. Costs no Mana. Scroll vaporizes. |
| **Spell Book** (persistent, functions as a Trinket) | Non-creator makes an Arcana Check to cast a spell from it. Nat 1 on the Arcana Check dissolves the book. Creator does not need the book to cast (they already know the spell). |
| **Scroll, Protection** (consumable) | Anyone reads to create a 10' Aura that moves with them for 1 Hour, granting Favor on Saves vs designated Beings (Hellspawn/Undead, or Divines/Fae, depending on the scroll's name). |

### 8.4 Studied dice (general mechanic)

Per Q44, **Studied dice** are general-purpose downtime tokens, not specific to spells:
- Earned by the **Study** downtime activity.
- Spend a Studied die for **Favor on a d20 roll** within the next day.
- Must spend before the roll resolves.
- Unspent dice expire after a day.
- Studying also lets you change a Class Feature choice (e.g., swap a Spell Known).

**Wizard-specific uses of Studied dice:**
- **Page Master** (1st lvl): on a successful cast, spend a Studied die to add it to the damage or healing roll.
- **Extracurricular** (6th lvl): spend a Studied die to Cast any one Spell — even a Spell you don't know.

### 8.5 Relic Power: Store Spell
A Relic may have the **Store Spell** Power, which lets the caster reduce their Maximum Mana to store a Casting in the Relic (full mechanics in the Relics chapter). This stores a known spell — it does not grant unknown spells.

---

## 9. Implementation Implications

(Brief — for the VCE module specifically. This section is the bridge between rules and code.)

The VCE module's automation should follow the rulings in §6. Highest-impact items for module work:

- **Q1 (Reading A — caster discretion in Areas)** — uniform target-pick UI across all Area deliveries; Aura behavior generalized.
- **Q2 (effect categorization)** — separate per-spell worksheet pass needed against `02_Spell List.md`.
- **Q4 (live zone tracking)** — module must hook token movement and apply spell effects on entry into a focused Area.
- **Q5 (status persistence)** — applied statuses do not auto-remove on leaving the zone; status duration is per spell text + status rules.
- **Q6 (imbue requires focus)** — current `imbue-manager.mjs` already does this; verify against Q6 ruling.
- **Q11 (one-focus default)** — module needs to enforce single-focus baseline and recognize class-feature exceptions (Witch Hex, Revelator dual-focus).

### Items needing creator confirmation (still PENDING)

These rulings, if changed by Taron, would prompt revisions:
- **Q1** — Reading A vs B for "unless you specify otherwise."
- **Q7 sub-question** — Glyph triggering as part of a Held Action's resolution.
- **Q8 sub-questions** — Skipped imbues when payer can't pay; whether unfired imbues stay on the weapon.
- **Q29 sub-question** — Spell Book "creator casts without issue" clause — meaningful or just clarification?

### Confirmed items (not blockers)
- Imbue dual-payer (FAQ).
- Imbue stacking allowed (FAQ).
- Damage doesn't break focus (FAQ).
- Armor doesn't reduce spell damage (video FAQ).
- Block/Dodge don't apply to spells (video FAQ).

### Code audit items surfaced by this doc
- Confirm `calculateFinalDamage` patch skips armor for spell-damage cards.
- Confirm `_rollSave` patches don't offer Block/Dodge against spell-damage cards.
- Confirm focus-drop on Incapacitated is wired (Q7 chain depends on it).
- Confirm one-focus-at-a-time enforcement (Q11) — currently the system tracks `focus.spellIds` as a list; need to verify whether the module enforces the cap or relies on player discipline.

---

## Page Reference Index

Quick lookup for the rulebook citations used in this document. Page numbers are **printed book page numbers** (PDF page = book page + 4 in the Interactive PDF release).

### Core mechanics

| Rule | Book p |
|---|---|
| Crit / Cast Crit benefit ("Stat-bonus damage OR spell's listed Crit benefit") | 8 |
| Distance definitions (Close / Near / Far) | 9 |
| Multi-focus rule ("Focus ends early if you drop it or focus on another effect") | 10 |
| Rests & Mana restoration | 11 |
| Status conditions (Burning, Charmed, Confused, Dazed, Incapacitated, etc.) | 13 |
| Turn Order / Group Turn ("Heroes take the first Turn") | 14 |
| Statuses listed in Adventuring Overview ("unless dispelled" tags) | 26 |
| Save Difficulties (Endure / Reflex / Will formulas) | 22 |
| Studied dice (Study downtime activity) | 19 |

### Magic chapter (book p. 90+)

| Rule | Book p |
|---|---|
| Casting overview, three cast choices, Cast Check rule | 90 |
| Damage scaling (1d6 base, +1d6 per Mana) | 90 |
| Effect, Delivery cost & scaling table, Duration, Focus, Continual | 90 |
| All delivery descriptions (Aura, Cone, Cube, Glyph, Imbue, Line, Remote, Sphere, Touch) | 90 |
| Trinkets section | 92 |

### Spell list (book p. 93+)

| Spell | Book p |
|---|---|
| Burn | 93 |
| Charm | 93 |
| Dispel | 94 |
| Fear | 95 |
| Life | 96 |
| Polymorph | 97 |

### Class features (book p. 31–88)

| Class / Feature | Book p |
|---|---|
| Druid — Tempest Within / Innervate / Ancient Growth / Savagery / Force of Nature | 37 |
| Magus — Spell Parry / Arcane Recall / Spell Surge / Aegis Obscura | 47 |
| Luminary — Radiant Healer / Overheal / Ever-Cure / Revivify / Saving Grace / Life-Giver | 45 |
| Revelator — Lay on Hands / Paragon's Aura / Divine Resolve | 53 |
| Sorcerer (full class — Spell-Slinger, Quickening, Spell Twinning, Tap, Overpowered) | 57 |
| Witch — Hex (1st) / Ritualism / Things Betwixt / Coventry / Widdershins | 61 |
| Wizard — Sculpt Spell / Manifold Mind / Extracurricular / Archwizard / Page Master | 63 |

### Perks (book p. 64+)

| Perk | Book p |
|---|---|
| Gish (Weapons-as-Trinkets) | 68 |
| Bookworm (Studied dice) | 67 |
| Snareroot Trapper (Sprout Glyph w/o Focus) | 72 |
| Levitate-Imbue | 73 |

### Relics & magic items (book p. 99+)

| Item | Book p |
|---|---|
| Relics chapter overview | 99 |
| Spell Scroll (consumable, free cast) | 100+ |
| Spell Book (Trinket + Arcana check to cast) | 100+ |
| Scroll, Protection (10' Aura, anti-Hellspawn/Undead/Divines/Fae) | 100+ |
| Manasteal relic powers | 100+ |

---

## Document Changelog
- **0.6 (2026-05-05):** Comprehensive magic sweep. Added §1.5b Spell acquisition rate per class (full table + secondary sources). Refactored §1.7 with damage-typing philosophy from Basics ch. 01 (RAW: GM-decides; no fixed damage type taxonomy). Major §7 expansion: Druid carveouts (Tempest Within, Innervate, Ancient Growth, Savagery), Luminary carveouts (Radiant Healer, Overheal, Ever-Cure, Revivify, Saving Grace, Life-Giver), Magus carveouts (Spell Parry, Arcane Recall, Spell Surge, Aegis Obscura), Revelator carveouts (Lay on Hands, Divine Resolve), Witch carveouts (Ritualism, Things Betwixt, Coventry, Widdershins). Page Reference Index updated. **Corrections:** Witch's Hex is **1st level**, not 4th. Magus's counterspell feature is named **Spell Parry**, not "Block Cast". Magus also has **Spell Surge** for reflecting cast on Block-by-10+/8+ — added to §4.5.
- **0.5 (2026-05-05):** Added book-page references throughout (Magic, Adventuring Overview, Hero Creation, Class entries, Perks). Added a Page Reference Index at the end of the doc for quick lookup. Renamed "Aura's Boon" to its actual name "Paragon's Aura" in §7. Source mapping clarified: PDF page = book page + 4 (4-page front-matter offset).
- **0.4 (2026-05-05):** Folded in Q30–Q47 decisions across §1 (Mana economy, target types, damage type & "Damage Base"), §2 (anchored vs caster-following Areas, range table integration), §4 (Damage typing / Immune-Weak interactions, Hold Action with Cast, Stealth-by-spell), §5 (Imbue + Attack Crit), §7 (full class-feature carveouts: Wizard Manifold Mind / Extracurricular / Sculpt Spell / Archwizard / Page Master, Sorcerer Spell-Slinger / Quickening / Spell Twinning / Tap / Overpowered, plus Wizard Study-as-Mana-regen), §8 (Studied dice mechanic). Added Q30–Q47 entries to Decided Rulings. Added Polymorph focus-cost sidebar to §3.3. Refined §4.4 Saves with Hero-side-only clarification.
- **0.3 (2026-05-05):** Major expansion. Added §1.5 Trinket detail, §2.3–2.7 (Area shape physical model, range interpretation, Line scaling math, Cube placement, Imbue multi-weapon), §3.10 (status conditions affecting casting/focus), §4.4 (NPC saves clarification), §4.5 (Counterspell & Dispel mechanisms), §5.6–5.7 (multi-weapon Imbue and stacking recap), §8 (Spell Knowledge & Relic Exceptions). Added Q13–Q29 to Decided Rulings. Renumbered Implementation Implications to §9. Renamed Magic Weapon perk to its actual name (Gish) in §7.
- **0.2 (2026-05-04):** Walked through Q1–Q12 with project lead. Locked decisions for all 12 questions. Added §3.7 (default one focused effect), §3.8 (focus & Incapacitation), §3.9 (focus check failure), and §7 (class & perk carveouts). Renumbered Implementation Implications to §8. Items still PENDING creator confirmation: Q1 reading, Q7 Held-Action sub-question, Q8 cannot-pay sub-questions.
- **0.1 (2026-05-04):** Initial draft for circulation. Compiles Core Rulebook ch. 05, FAQ Doc v1, and "More FAQ & Design Notes" video clarifications. Surfaces 12 open questions for ruling.
