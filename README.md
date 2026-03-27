# Vagabond Character Enhancer

A Foundry VTT module that automates ancestry traits, class features, and perks for the [Vagabond](https://vagabond.game/) RPG system. Detects class features from compendium data and applies managed Active Effects for gameplay automation.

## Installation

### Method 1: Manifest URL (Recommended)

1. Open Foundry VTT and go to the **Add-on Modules** tab
2. Click **Install Module**
3. Paste the following URL into the **Manifest URL** field at the bottom:

```
https://github.com/DimitroffVodka/vagabond-character-enhancer/releases/latest/download/module.json
```

4. Click **Install**
5. Launch your world and enable the module under **Settings → Manage Modules**

This method will allow Foundry to automatically detect future updates.

### Method 2: Manual Download

1. Go to the [latest release](https://github.com/DimitroffVodka/vagabond-character-enhancer/releases/latest)
2. Download `module.zip`
3. Extract the zip into your Foundry VTT modules folder:
   - **Windows:** `%localappdata%/FoundryVTT/Data/modules/`
   - **macOS:** `~/Library/Application Support/FoundryVTT/Data/modules/`
   - **Linux:** `~/.local/share/FoundryVTT/Data/modules/`
4. Ensure the extracted folder is named `vagabond-character-enhancer`
5. Launch your world and enable the module under **Settings → Manage Modules**

## Compatibility

- **Foundry VTT:** v13+
- **Vagabond System:** v5.0.0+

## Optional Dependencies

- **Vagabond Crawler** — Enables NPC ability automation (Morale, abilities, etc.)

## Status Legend

| Icon | Meaning |
|------|---------|
| ✅ Module | Fully automated with hooks, Active Effects, and/or monkey-patches |
| ✅ System | Handled natively by the Vagabond system — no module code needed |
| ✅ AE | Implemented via managed Active Effects applied to the actor |
| 📝 Flavor | Registered for tracking but requires no automation (player decisions, RP rules) |
| 🔲 Todo | Planned but not yet implemented |

---

## Class Features

### Alchemist

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Alchemy | 1 | ✅ Module | Attack with alchemical items using Craft. Choose 4 formulae, 5s materials + Alchemy Tools to Craft. Learn 1 more every 2 levels. |
| Catalyze | 1 | ✅ Module | Gain the Deft Hands Perk. Can Craft alchemical items with the Use Action. |
| Eureka | 2 | ✅ Module | Gain a Studied die when you Crit on a Craft Check. |
| Potency | 4 | ✅ Module | The damage and healing dice of your alchemical items can explode. |
| Mix | 6 | ✅ Module | Use Action to combine two alchemical items. Both effects occur when Used. Lasts for the Round. |
| Big Bang | 8 | ✅ Module | d6 bonus to alchemical damage/healing. Can explode on their two highest values. |
| Prima Materia | 10 | ✅ Module | Once per Day, Craft an alchemical item worth up to 10g without materials (Action or skip Move). |

**Cookbook** — Full crafting UI window with search, cost calculation, and craft buttons.

---

### Barbarian

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Rage | 1 | ✅ Module | While Berserk + light/no armor: damage dice upsized, can explode, reduce incoming damage by 1 per die. Auto-applies Berserk on attack/damage. Combat end cleanup. |
| Wrath | 1 | 📝 Flavor | Gain the Interceptor Perk. Can make its attack against Enemies that make Ranged Attacks, Cast, or damage you or an Ally. |
| Aggressor | 2 | ✅ Module | +10 Speed during first Round of Combat. 3+ Fatigue doesn't prevent Rush Action. |
| Fearmonger | 4 | ✅ Module | When you kill an Enemy, every Near Enemy with HD lower than your Level becomes Frightened until end of your next Turn. |
| Mindless Rancor | 6 | ✅ Module | Managed AE: immunity to Charmed, Confused, or being compelled to act against your will. |
| Bloodthirsty | 8 | ✅ Module | Attacks against Beings missing any HP are Favored. Sense them within Far as Blindsight. |
| Rip and Tear | 10 | ✅ Module | Upgrades Rage: reduce damage by 2 per die instead of 1, +1 bonus to each damage die. |

---

### Bard

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Virtuoso | 1 | ✅ Module | Performance Check → Valor/Resolve/Inspiration buff buttons on chat card, auto-applies to party via managed AEs. |
| Well-Versed | 1 | 📝 Flavor | Ignore Prerequisites for Perks, and gain a Perk of your choice. |
| Song of Rest | 2 | ✅ Module | Auto-applies healing bonus (Presence + Bard Level) on rest chat cards. |
| Starstruck | 4 | ✅ Module | On Virtuoso, choose a Near Enemy and make Performance Check. Pass applies Berserk, Charmed, Confused, or Frightened for Cd4 Rounds. Chat card integration for status application. |
| Bravado | 6 | ✅ Module | Will Saves can't be Hindered while not Incapacitated. Ignore effects that rely on hearing. |
| Climax | 8 | ✅ Module | Favor and bonus dice you grant can Explode (the d6 favor die explodes on max). |
| Starstruck Enhancement | 10 | ✅ Module | Starstruck can now affect all Near Enemies. |

---

### Dancer

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Fleet of Foot | 1 | ✅ Module | Gain Treads Lightly Perk. Managed AE: reflexCritBonus reduced by ceil(Dancer Level / 4). |
| Step Up | 1 | ✅ Module | Dialog to select allies, grants bonus action via managed AE. Combat end cleanup. |
| Evasive | 2 | ✅ Module | Ignore Hinder on Reflex Saves while not Incapacitated. Ignore two Dodged damage dice instead of one. |
| Don't Stop Me Now | 4 | 🔲 Todo | Speed unaffected by Difficult Terrain. Favor on Saves vs Paralyzed, Restrained, or being moved. |
| Choreographer | 6 | ✅ Module | Extends Step Up: Ally gets Favor on first Check with the granted Action. Both gain +10 Speed for the Round. |
| Flash of Beauty | 8 | ✅ Module | Injects "two Actions this turn" reminder into chat cards when you Crit on a Save. |
| Double Time | 10 | ✅ Module | Step Up can target two Allies instead of one. |

---

### Druid

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Primal Mystic | 1 | ✅ System | Cast Spells using Mysticism. Learn 4 Spells (must include Polymorph). Max Mana = 4 × Level. |
| Feral Shift | 1 | 📝 Flavor | Gain Shapechanger Perk. Take a Beast Action as part of the Polymorph Cast Action. |
| Tempest Within | 2 | ✅ Module | Reduce Cold, Fire, and Shock damage by (half Druid Level) per damage die. Monkey-patch on damage calc. |
| Innervate | 4 | 📝 Flavor | Action to transfer Mana to a Close Being, or end Charmed/Confused/Frightened/Sickened. Can target self. |
| Ancient Growth | 6 | 📝 Flavor | Self-Polymorph Focus allows one additional Focus Spell. Beast attacks count as (+1) Relics. |
| Savagery | 8 | ✅ Module | Managed AE: +1 Armor, toggles active only during polymorph. |
| Force of Nature | 10 | ✅ Module | At 0 HP, auto-rolls Awareness check. If passed, set to 1 HP. Chat card with result. |

**Polymorph System** — Beast Form tab on character sheet with 72 beasts from compendium. Dialog selection, token swap, Mysticism cast checks, Roll Damage button, condition auto-apply, and size scaling.

---

### Fighter

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Fighting Style | 1 | 📝 Flavor | Gain Situational Awareness Perk + another Perk with Melee or Ranged Training Prerequisite. |
| Valor | 1/4/8 | ✅ AE | Managed AE: attackCritBonus + reflexCritBonus + endureCritBonus scaling -1/-2/-3 with level. |
| Momentum | 2 | ✅ Module | Pass a Save against an attack → next attack before end of next Turn is Favored. |
| Muster for Battle | 6 | 🔲 Todo | Two Actions on your first Turn of Combat. |
| Harrying | 10 | 🔲 Todo | Attack twice with the Attack Action instead of once. |

---

### Gunslinger

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Quick Draw | 1 | ✅ Module | Gain Marksmanship Perk. Free Ranged attack before first Turn — auto-applies Hinder on 2H weapons. Flag consumed after one attack. |
| Deadeye | 1 | ✅ Module | Cascading crit threshold: each passed Ranged Check lowers crit by 1 (min 17). Tracks stacks via actor flags. Resets at end of Turn if no hit. |
| Skeet Shooter | 2 | 📝 Flavor | Once per Round, make Off-Turn Ranged attack to reduce incoming projectile damage. |
| Grit | 4 | ✅ Module | When you Crit on a Ranged attack, damage dice can explode. Accounts for Marksmanship die upsizing. |
| Devastator | 6 | ✅ Module | Reduce an Enemy to 0 HP → Deadeye crit immediately set to 17 (max stacks). |
| Bad Medicine | 8 | ✅ Module | Extra die of damage on Ranged Crit. Die size accounts for Marksmanship bonus. |
| High Noon | 10 | ✅ Module | Once per Turn, Crit on Ranged → chat notification for one additional attack. Tracks usage per turn. |

---

### Hunter

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Hunter's Mark | 1 | 🔲 Todo | Mark a Being (requires Focus). Attack rolls against it use 2d20 keep highest. |
| Survivalist | 1 | 📝 Flavor | Gain Padfoot Perk. Favor on tracking/navigation Checks. Forage while Traveling at Normal Pace. |
| Rover | 2 | ✅ Module | Difficult Terrain doesn't impede walking Speed. Gain Climb and Swim. |
| Overwatch | 4 | 🔲 Todo | Hunter's Mark bonus d20 also applies to Saves from the marked Target. |
| Quarry | 6 | 📝 Flavor | Sense Beings within Far by Blindsight if they're missing HP or marked. |
| Lethal Precision | 8 | 🔲 Todo | Roll 3d20 keep highest with Hunter's Mark and Overwatch. |
| Apex Predator | 10 | 🔲 Todo | Damage to Hunter's Mark Target ignores Immune and Armor. |

---

### Luminary

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Theurgy | 1 | ✅ System | Cast Spells using Mysticism. Learn 4 Spells (must include Life and Light). Max Mana = 4 × Level. |
| Radiant Healer | 1 | 🔲 Todo | Gain Assured Healer Perk. Healing rolls from Spells can explode on their highest value. |
| Overheal | 2 | 🔲 Todo | Excess HP from healing can be given to yourself or another Being you can see. |
| Ever-Cure | 4 | 🔲 Todo | When you restore HP, end Charmed, Confused, Dazed, Frightened, or Sickened on Target. |
| Revivify | 6 | 📝 Flavor | Revive dead Beings (up to 1 hour) with Life Spell. Auto-revive self (1/day). |
| Saving Grace | 8 | 🔲 Todo | Healing rolls also explode on a roll of 2. |
| Life-Giver | 10 | 📝 Flavor | Revived Beings start at 4 Fatigue max. They don't gain Fatigue from your Life Spell. |

---

### Wizard

| Feature | Level | Status | What It Does |
|---------|-------|--------|--------------|
| Spellcaster | 1 | ✅ System | Cast Spells using Arcana. Learn 4 Spells. Max Mana = 4 × Level. Regain on Rest or Study. |
| Page Master | 1 | 🔲 Todo | Gain Bookworm Perk. When you successfully Cast, spend a Studied die to add to damage/healing. |
| Sculpt Spell | 2 | ✅ Module | Pay 1 less Mana for Spell delivery. |
| Manifold Mind | 4 | ✅ Module | Focus on up to 2 Spells at the same time. |
| Extracurricular | 6 | 🔲 Todo | Spend a Studied die to cast any Spell, even one you don't know. |
| Manifold Mind (3) | 8 | ✅ Module | Focus on up to 3 Spells at the same time. |
| Archwizard | 10 | ✅ Module | Pay 2 less Mana for Spell delivery. |

---

## Ancestry Traits

Ancestry traits are automatically detected from compendium items on the character sheet and applied as managed Active Effects where applicable.

### Dwarf
| Trait | Status | What It Does |
|-------|--------|--------------|
| Darksight | ✅ AE | Not Blinded by Dark. |
| Sturdy | ✅ AE | Favor on Saves against Frightened, Sickened, or Shoved. |
| Tough | ✅ AE | Bonus to max HP equal to your Level. |

### Draken
| Trait | Status | What It Does |
|-------|--------|--------------|
| Breath Attack | ✅ Module | Endure or Will Save to make a 15' Cone dealing 2d6! draconic breath. Recharges on Rest or 1 Fatigue. |
| Scale | ✅ AE | +1 bonus to Armor Rating. |
| Draconic Resilience | ✅ AE | Half damage from a chosen source: Acid, Cold, Fire, or Shock. |

### Elf
| Trait | Status | What It Does |
|-------|--------|--------------|
| Ascendancy | 📝 Flavor | Trained in a Skill from Arcana, Mysticism, Influence, or Ranged Attacks. |
| Elven Eyes | ✅ AE | Favor on sight-based Detect Checks. |
| Naturally Attuned | 📝 Flavor | Know a Spell and Cast it with a Skill of your choice. |

### Goblin
| Trait | Status | What It Does |
|-------|--------|--------------|
| Darksight | ✅ AE | Not Blinded by Dark. |
| Nimble | ✅ AE | +5 Speed bonus and ignore Hinder on Reflex Saves. |
| Scavenger | ✅ AE | Favor on Endure Saves against being Sickened. |

### Halfling
| Trait | Status | What It Does |
|-------|--------|--------------|
| Nimble | ✅ AE | +5 Speed bonus and ignore Hinder on Reflex Saves. |
| Squat | 📝 Flavor | Move through areas occupied by other Beings. |
| Tricksy | 📝 Flavor | Gain 1 additional Luck when you regain Luck from a Rest. |

### Human
| Trait | Status | What It Does |
|-------|--------|--------------|
| Knack | 📝 Flavor | Gain a Perk and a Training. |
| Strong Potential | 📝 Flavor | Increase one Stat by 1 (max 7). |

### Orc
| Trait | Status | What It Does |
|-------|--------|--------------|
| Darksight | ✅ AE | Not Blinded by Dark. |
| Beefy | ✅ AE | Favor on Saves against Grappled/Shoved, and Favor on Checks to Grapple/Shove. |
| Hulking | ✅ AE | +2 bonus to Item Slots. |

---

## Other Automation

- **Alchemy Cookbook** — Full crafting UI with search, cost calculation, and craft buttons
- **Countdown Dice Overlay** — Visual overlay for tracking countdown dice on effects
- **NPC Ability Automation** — With Vagabond Crawler module: morale checks, NPC abilities, and combat AI
- **Perk Detection** — Auto-detects perks from character items and applies relevant AEs
