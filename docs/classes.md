# Class Automation

VCE auto-detects classes from the character's compendium items and applies the relevant automation — Active Effects, hook-driven features, sheet UI, and chat-card integration. All 20 Vagabond classes have varying levels of automation; this page lists every class feature and what's implemented.

See the [README's status legend](../README.md#status-legend) for icon meanings.

---

## Alchemist

| Feature       | Level | Status    | What It Does                                                         |
|---------------|-------|-----------|----------------------------------------------------------------------|
| Alchemy       | 1     | ✅ Module | Full crafting UI window with search, cost calculation, craft buttons |
| Catalyze      | 1     | ✅ System | Built into character creator                                         |
| Eureka        | 2     | ✅ Module | Study die on Craft Crit in combat                                    |
| Potency       | 4     | ✅ Module | Baked into the items when crafted to explode                         |
| Mix           | 6     | 📝 Flavor | Might add later                                                      |
| Big Bang      | 8     | ✅ Module | Baked into the items when crafted to explode                         |
| Prima Materia | 10    | 📝 Flavor | Not worth adding                                                     |

### Alchemy Cookbook

The character sheet adds a Cookbook tab listing all Alchemical Items. Right-click items to favorite them as your formulae. Materials are auto-deducted from your inventory at craft time. With Vagabond Crawler enabled, your favorite formulae appear in the combat strip dropdown for one-click use as weapons.

---

## Barbarian

| Feature         | Level | Status    | What It Does                                                                                                             |
|-----------------|-------|-----------|--------------------------------------------------------------------------------------------------------------------------|
| Rage            | 1     | ✅ Module  | DR per die, die upsizing, exploding dice, auto-berserk on attack/damage, combat end cleanup                              |
| Wrath           | 1     | 📝 Flavor | Gain the Interceptor Perk. Can make its attack against Enemies that make Ranged Attacks, Cast, or damage you or an Ally. |
| Aggressor       | 2     | ✅ Module  | +10 Speed during first Round of Combat. 3+ Fatigue doesn't prevent Rush Action.                                          |
| Fearmonger      | 4     | ✅ Module  | When you kill an Enemy, every Near Enemy with HD lower than your Level becomes Frightened until end of your next Turn.   |
| Mindless Rancor | 6     | ✅ Module  | Managed AE for extra rage bonuses                                                                                        |
| Bloodthirsty    | 8     | ✅ Module  | Attacks against Beings missing any HP are Favored. Sense them within Far as Blindsight.                                  |
| Rip and Tear    | 10    | ✅ Module  | +1 universal damage bonus during rage                                                                                    |

---

## Bard

| Feature                | Level | Status    | What It Does                                                                                   |
|------------------------|-------|-----------|------------------------------------------------------------------------------------------------|
| Virtuoso               | 1     | ✅ Module  | Performance check → Valor/Resolve/Inspiration buff buttons on chat card, auto-applies to party |
| Well-Versed            | 1     | 📝 Flavor | Ignore Prerequisites for Perks, and gain a Perk of your choice.                                |
| Song of Rest           | 2     | ✅ Module  | Auto-applies healing bonus on rest chat cards (Presence + Bard Level)                          |
| Starstruck             | 4     | ✅ Module  | Chat card integration for status application (Berserk, Charmed, Confused, or Frightened)       |
| Bravado                | 6     | 🔲 Partial | Will Saves can't be Hindered while not Incapacitated.                                          |
| Climax                 | 8     | ✅ Module  | Favor and bonus dice you grant can Explode (the d6 favor die explodes on max).                 |
| Starstruck Enhancement | 10    | ✅ Module  | Starstruck can now affect all Near Enemies.                                                    |

Virtuoso works through the character sheet's Virtuoso tab or the Vagabond Crawler dropdown menu.

---

## Dancer

| Feature           | Level | Status    | What It Does                                                                                         |
|-------------------|-------|-----------|------------------------------------------------------------------------------------------------------|
| Fleet of Foot     | 1     | ✅ Module  | Managed AE: reflexCritBonus reduced by ceil(Dancer Level / 4)                                        |
| Step Up           | 1     | ✅ Module  | Dialog to select allies, grants bonus action via AE                                                  |
| Evasive           | 2     | ✅ Module  | Ignore Hinder on Reflex Saves while not Incapacitated. Ignore two Dodged damage dice instead of one. |
| Don't Stop Me Now | 4     | 🔲 Todo   | Speed unaffected by Difficult Terrain. Favor on Saves vs Paralyzed, Restrained, or being moved.      |
| Choreographer     | 6     | ✅ Module  | Extends Step Up with Favor + Speed bonus                                                             |
| Flash of Beauty   | 8     | ✅ Module  | Injects "two Actions this turn" reminder into chat cards                                             |
| Double Time       | 10    | ✅ Module  | Step Up can target two Allies instead of one.                                                        |

---

## Druid

| Feature         | Level | Status    | What It Does                                                                                |
|-----------------|-------|-----------|---------------------------------------------------------------------------------------------|
| Primal Mystic   | 1     | ✅ System  | Casting handled by base system                                                              |
| Feral Shift     | 1     | 📝 Flavor | Perk grant + action economy rule                                                            |
| Tempest Within  | 2     | ✅ Module  | Cold/Fire/Shock DR per die (monkey-patch on damage calc)                                    |
| Innervate       | 4     | 📝 Flavor | Action to transfer Mana to a Close Being, or end Charmed/Confused/Frightened/Sickened.      |
| Ancient Growth  | 6     | 🔲 Partial | Self-Polymorph Focus allows one additional Focus Spell. Beast attacks count as (+1) Relics. |
| Savagery        | 8     | ✅ Module  | +1 Armor managed AE, toggles active only during polymorph                                   |
| Force of Nature | 10    | ✅ Module  | Auto-rolls Awareness check on lethal damage, chat card with result                          |

### Polymorph (Beast Form)

The character sheet adds a Beast Form tab populated with 72 modified beast actors from a built-in compendium. Cast Polymorph → pick beast → token swap. Cast skill checks use the caster's own skill, not the beast's. The Beast Form tab also has a Roll Damage button per attack, auto-applies bestial conditions, and scales token size.

**Works for any caster** with the Polymorph spell — not just Druids. Druid-specific bonuses (Savagery +1 Armor) only fire while the polymorphing actor is a Druid. The Shapechanger perk correctly exempts the caster from per-round Mana cost.

---

## Fighter

| Feature           | Level | Status    | What It Does                                                                     |
|-------------------|-------|-----------|----------------------------------------------------------------------------------|
| Fighting Style    | 1     | 📝 Flavor | Perk grants (manual)                                                             |
| Valor             | 1/4/8 | ✅ System  | attackCritBonus + reflexCritBonus + endureCritBonus: -1/-2/-3 scaling with level |
| Momentum          | 2     | ✅ Module  | Pass save → next attack favored                                                  |
| Muster for Battle | 6     | 🔲 Todo   | Two actions on first turn                                                        |
| Harrying          | 10    | 🔲 Todo   | Attack twice with Attack action                                                  |

---

## Gunslinger

| Feature       | Level | Status    | What It Does                                                                                                                                  |
|---------------|-------|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| Quick Draw    | 1     | ✅ Module  | Free Ranged attack before first Turn — auto-applies Hinder on 2H weapons. Flag consumed after one attack.                                     |
| Deadeye       | 1     | ✅ Module  | Cascading crit threshold: each passed Ranged Check lowers crit by 1 (min 17). Tracks stacks via actor flags. Resets at end of Turn if no hit. |
| Skeet Shooter | 2     | 📝 Flavor | Once per Round, make Off-Turn Ranged attack to reduce incoming projectile damage.                                                             |
| Grit          | 4     | ✅ Module  | When you Crit on a Ranged attack, damage dice can explode. Accounts for Marksmanship die upsizing.                                            |
| Devastator    | 6     | ✅ Module  | Reduce an Enemy to 0 HP → Deadeye crit immediately set to 17 (max stacks).                                                                    |
| Bad Medicine  | 8     | ✅ Module  | Extra die of damage on Ranged Crit. Die size accounts for Marksmanship bonus.                                                                 |
| High Noon     | 10    | ✅ Module  | Once per Turn, Crit on Ranged → chat notification for one additional attack. Tracks usage per turn.                                           |

---

## Hunter

| Feature          | Level | Status    | What It Does                                                         |
|------------------|-------|-----------|----------------------------------------------------------------------|
| Hunter's Mark    | 1     | ✅ Module  | Mark target → 2d20 keep highest                                      |
| Survivalist      | 1     | 📝 Flavor | Perk grant + narrative bonuses                                       |
| Rover            | 2     | 📝 Flavor | Difficult Terrain doesn't impede walking Speed. Gain Climb and Swim. |
| Overwatch        | 4     | ✅ Module  | Mark bonus extends to saves                                          |
| Quarry           | 6     | 📝 Flavor | Narrative blindsight sense                                           |
| Lethal Precision | 8     | ✅ Module  | 3d20 keep highest                                                    |
| Apex Predator    | 10    | ✅ Module  | Ignore immune + armor vs mark                                        |

---

## Luminary

| Feature        | Level | Status    | What It Does                   |
|----------------|-------|-----------|--------------------------------|
| Theurgy        | 1     | ✅ System  | Casting handled by base system |
| Radiant Healer | 1     | ✅ Module  | Healing dice explode on max    |
| Overheal       | 2     | ✅ Module  | Excess HP redirect             |
| Ever-Cure      | 4     | ✅ Module  | Healing removes a status       |
| Revivify       | 6     | 📝 Flavor | Narrative revival mechanic     |
| Saving Grace   | 8     | ✅ Module  | Healing dice also explode on 2 |
| Life-Giver     | 10    | 📝 Flavor | Modifies Revivify              |

---

## Magus

| Feature          | Level | Status    | What It Does                           |
|------------------|-------|-----------|----------------------------------------|
| Spellstriker     | 1     | ✅ System  | Casting handled by base system         |
| Esoteric Eye     | 1     | 📝 Flavor | Narrative magic detection              |
| Spell Parry      | 2     | 📝 Flavor | Defensive choice                       |
| Arcane Recall    | 4     | 📝 Flavor | Swap spell known on rest               |
| Spell Surge      | 6     | ✅ Module  | Block cast by 10+ → reflect            |
| Aegis Obscura    | 8     | 📝 Flavor | Allsight + half magic damage with Ward |
| Spell Surge (8+) | 10    | ✅ Module  | Lower Spell Surge threshold            |

---

## Merchant

| Feature                 | Level | Status    | What It Does                                                                                                                                                                                                                            |
|-------------------------|-------|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Gold Sink               | 1     | ✅ Module  | Shop tab to buy/sell gear, weapons, armor, alchemical items. Favorites integrate with crawler combat strip.                                                                                                                            |
| Deep Pockets            | 1     | ✅ AE      | inventory.bonusSlots = ceil(level/2), scales with level                                                                                                                                                                                 |
| Bang for Your Buck      | 2     | 🔲 Todo   | Luck roll to not expend items                                                                                                                                                                                                           |
| Diamond Hands           | 4     | 📝 Flavor | Downtime relic modification                                                                                                                                                                                                             |
| Treasure Seeker         | 6     | 📝 Flavor | Narrative sense                                                                                                                                                                                                                         |
| Bang for Your Buck (d8) | 8     | 🔲 Todo   | Upgrade refund die                                                                                                                                                                                                                      |
| Top Shelf               | 10    | 📝 Flavor | Weekly relic pull                                                                                                                                                                                                                       |

The Gold Sink tab lets Merchants browse and buy from system compendiums (no Relics). Right-click items to favorite them — favorites appear at the top of the list and in the Vagabond Crawler combat dropdown for quick purchasing. Items marked as junk (via right-click on the inventory tab) can be sold in bulk with the "Sell Junk" button. Sell ratio is configurable in module settings (default 100%).

---

## Monk

| Feature           | Level | Status    | What It Does                                                                       |
|-------------------|-------|-----------|------------------------------------------------------------------------------------|
| Martial Arts      | 1     | ✅ Module  | 1 target → Keen (crit -1). 2 targets → Cleave (half dmg). Die escalation per round. |
| Fleet of Foot     | 1     | ✅ System  | System AE: reflexCritBonus scaling + Treads Lightly perk                           |
| Fluid Motion      | 2     | 📝 Flavor | Walk on walls/water (narrative)                                                    |
| Impetus           | 4     | ✅ Module  | Chat reminder: Dodge ignores 2 highest dice                                        |
| Flurry of Blows   | 6     | 📝 Flavor | Extra Finesse attack (player-tracked)                                              |
| Empowered Strikes | 8     | ✅ AE      | finesseDamageDieSizeBonus +2 (d4→d6)                                               |
| Flurry of Blows   | 10    | 📝 Flavor | Up to 3 extra Finesse attacks (player-tracked)                                     |

---

## Pugilist

| Feature       | Level | Status     | What It Does                                           |
|---------------|-------|------------|--------------------------------------------------------|
| Fisticuffs    | 1     | ✅ Module  | Brawl d4 minimum                                       |
| Rope-a-Dope   | 1     | 📝 Flavor  | Perk grant                                             |
| Beat Rush     | 2     | 📝 Flavor  | Action economy                                         |
| Prowess       | 4     | ✅ Module   | Chat reminder + removes 2 highest dice on passed Block |
| Haymaker      | 6     | ✅ Module   | Pass brawl by 10+ → applies Dazed                      |
| Impact        | 8     | ✅ AE       | brawlDamageDieSizeBonus +2 (d4→d6)                     |
| Haymaker (8+) | 10    | ✅ Module   | Haymaker threshold lowered to 8+                       |

---

## Psychic

| Feature              | Level | Status    | What It Does                                                                               |
|----------------------|-------|-----------|--------------------------------------------------------------------------------------------|
| Psionics             | 1     | ✅ Module  | Talents tab + Pick dialog + Cast pipeline. Mana cap = floor(level/2). Free Focus.          |
| Awakening            | 1     | ✅ Module  | Auto-grants Telepath Perk on class drop; sets `psychicMindTrinket` flag                    |
| Precognition         | 2     | ✅ Module  | While Focusing, first Save each round gets Favor (cancels Hinder); resets on round end     |
| Duality              | 4     | ✅ Module  | Focus on up to 2 Talents simultaneously (capacity enforced by TalentBuffs.getMaxFocus)     |
| Mental Fortress      | 6     | ✅ AE      | statusImmunities ADD: berserk, charmed, confused, frightened                               |
| Transcendent Duality | 8     | ✅ Module  | Focus on up to 3 Talents simultaneously                                                    |
| Transcendence        | 10    | ✅ Module  | DialogV2 swap: drop one known Talent, learn another (1 Action, honor system)               |

### Talents Tab

A scrollable list of all 14 Talents — picked entries on top, unpicked dimmed. **Right-click any row to pick or unpick** (the same favorite pattern as the beast browser). Picked Talents get a Cast button and, when focused, a Drop Focus button. Header counter shows `Picked X / Y` for the level (turns amber when below the cap, red when over). Focused rows glow with the same accent as focused spells; a generic `_focus` Sequencer animation plays on the caster's token.

Cast opens a Crawler-style configuration dialog (−/Nd6/+ pill buttons, Effect toggle, Delivery dropdown, Mana row with cap, live Targets row, Focus toggle). Casts route through the system's `VagabondChatCard.spellCast` and `VagabondDamageHelper.rollSpellDamage` for full polish (targets section, big damage numbers, Apply Direct, save buttons), and respect Effect (Fx) gating — casting Pyrokinesis with Effect: Off does fire damage but no Burning. Cast attacks bypass armor and use Mysticism with favor/hinder applied.

### Buff Talents (Shield, Evade, Absence, Transvection)

Flow through the same Cast dialog as everything else — pick delivery, pick targets, fire. Shield-on-an-ally and Evade-on-an-ally work via Touch / Remote, with the d4 reductions correctly applying to the buffed actor (not the caster). Distributed buff AEs route through the GM relay when the caster doesn't own the target, so Shielding a hireling or summoned ally just works. Each focused Talent reserves a slot from the Psychic's focus pool (1/2/3 by Duality at L1/L4/L8); dropping focus tears down every distributed AE in the world via `casterActorId` flag matching.

The **Control Talent** (Animate-spell logic) spawns a synthetic NPC controlled object via the unified Companion system — adds a Companions tab + a Control button to the Companions action bar, attacks route through the Psychic's Mysticism, HP-to-zero auto-dismisses, and dropping focus removes the object cleanly.

---

## Revelator

| Feature        | Level | Status    | What It Does                                                                                          |
|----------------|-------|-----------|-------------------------------------------------------------------------------------------------------|
| Righteous      | 1     | ✅ System  | Casting handled by base system                                                                        |
| Selfless       | 1     | ✅ Module  | Prompt to redirect ally damage; raw pre-armor amount                                                  |
| Lay on Hands   | 2     | ✅ Module  | Sheet button + chat card heal (d6+Level), 2 uses/rest                                                 |
| Paragon's Aura | 4     | 🔲 Partial | +1 Focus AE + AuraManager. Free 10' Aura delivery (cost discount enforced via SpellHandler patch)     |
| Divine Resolve | 6     | ✅ AE      | statusImmunities: blinded, paralyzed, sickened                                                        |
| Holy Diver     | 8     | 🔲 Todo   | After Selfless → favor + Presence damage (no turn expiry)                                             |
| Sacrosanct     | 10    | ✅ AE      | saves.reflex/endure/will.bonus +2                                                                     |

---

## Rogue

| Feature                | Level | Status    | What It Does                                           |
|------------------------|-------|-----------|--------------------------------------------------------|
| Sneak Attack           | 1     | ✅ Module  | Extra d4s on favored hit + armor pen. Scales per level |
| Infiltrator            | 1     | 📝 Flavor | Perk grant + narrative bonuses                         |
| Unflinching Luck       | 2     | 📝 Flavor | Luck refund die (d12) — player-tracked                 |
| Evasive                | 4     | ✅ Module  | Ignore Reflex hinder + remove 2 Dodge dice             |
| Lethal Weapon          | 6     | ✅ Module  | Sneak Attack on all favored attacks per turn           |
| Unflinching Luck (d10) | 8     | 📝 Flavor | Upgrade refund die — player-tracked                    |
| Waylay                 | 10    | 📝 Flavor | Kill → extra action — player-tracked                   |

---

## Sorcerer

| Feature        | Level | Status    | What It Does                                   |
|----------------|-------|-----------|------------------------------------------------|
| Glamour        | 1     | ✅ System  | Casting handled by base system                 |
| Tap            | 1     | 📝 Flavor | Reduce Max HP → regain Mana (player-tracked)   |
| Spell-Slinger  | 2     | ✅ AE      | castCritBonus -1 + spellDamageDieSize 8        |
| Quickening     | 4     | 📝 Flavor | Skip move to cast                              |
| Arcane Anomaly | 6     | 📝 Flavor | Half magic damage (player-tracked)             |
| Spell Twinning | 8     | 📝 Flavor | 2nd same-spell cast favored (player-tracked)   |
| Overpowered    | 10    | ✅ AE      | Additional castCritBonus -1 (total crit on 18) |

---

## Summoner

| Feature          | Level | Status    | What It Does                                                                                       |
|------------------|-------|-----------|----------------------------------------------------------------------------------------------------|
| Arcanum          | 1     | 📝 Flavor | Casting handled by base system                                                                     |
| Creature Codex   | 1     | ✅ Module  | Summon tab with creature list, personal Codex management, conjure flow, mana cost, token placement |
| Soulbonder       | 2     | ✅ Module  | Copies summon's Armor + Immunities as managed AEs while conjured                                   |
| Second Nature    | 4     | ✅ Module  | Cd4 countdown option instead of Focus (no mana drain per round)                                    |
| Avatar Emergence | 6     | ✅ Module  | Once per Shift, conjure without Mana cost. Resets on rest.                                         |
| Guardian Force   | 8     | ✅ Module  | Summoner 0 HP → summon persists on Cd4 countdown, revive at 1 HP (+1 Fatigue) on expiry            |
| Ultimate Weapon  | 10    | ✅ Module  | Max summon HD cap increased by +5                                                                  |

See [Companion System](companions.md) for the unified engine that drives summons alongside familiars, raised undead, animal companions, and hirelings.

---

## Vanguard

| Feature        | Level | Status    | What It Does                                                                                                    |
|----------------|-------|-----------|-----------------------------------------------------------------------------------------------------------------|
| Stalwart       | 1     | 🔲 Partial | Protector perk automated — auto-rolls Block on ally failed save, heals for highest die on pass                  |
| Guard          | 1     | ✅ Module  | Prompt card on Block pass or enemy entering Close range. Brawl check with Beefy/Bully favor, Push/Prone on pass |
| Rampant Charge | 2     | 📝 Flavor | Push during movement (player-tracked)                                                                           |
| Wall (Large)   | 4     | ✅ Module  | Managed AE + shove size override — treated as Large for Shoves via brawl-intent                                 |
| Unstoppable    | 6     | 📝 Flavor | Chain shoves (player-tracked)                                                                                   |
| Wall (Huge)    | 8     | ✅ Module  | Managed AE + shove size override — treated as Huge for Shoves via brawl-intent                                  |
| Indestructible | 10    | ✅ Module  | Immune to melee/ranged attack damage while Armor ≥ 1 and not Incapacitated. Spells still apply.                 |

---

## Witch

| Feature        | Level | Status    | What It Does                                                                                                                                |
|----------------|-------|-----------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Occultist      | 1     | ✅ System  | Casting handled by base system                                                                                                              |
| Hex            | 1     | ✅ Module  | "Hex" button on spell cast cards. Tracks hexed targets with managed AE. Max slots = ceil(level/2). Oldest hex removed when over capacity.   |
| Ritualism      | 2     | 📝 Flavor | Downtime ritual (player-tracked)                                                                                                            |
| Things Betwixt | 4     | ✅ Module  | Applies Invisible status + consumes Focus slot. Once per scene. Auto-expires on round change.                                               |
| Coventry       | 6     | 📝 Flavor | Cast allies' spells (player-tracked)                                                                                                        |
| Widdershins    | 8     | ✅ Module  | Hexed targets are Weak to witch's damage — armor bypassed in calculateFinalDamage. Does not bypass Immunity.                                |
| Ritualism (2)  | 10    | 📝 Flavor | Two rituals per shift (player-tracked)                                                                                                      |

---

## Wizard

| Feature           | Level | Status    | What It Does                                                                                  |
|-------------------|-------|-----------|-----------------------------------------------------------------------------------------------|
| Spellcaster       | 1     | ✅ System  | Casting handled by base system                                                                |
| Page Master       | 1     | ✅ Module  | "+1d6 Studied Die" button on spell damage cards. Updates damage total + save amounts on click. |
| Sculpt Spell      | 2     | ✅ System  | deliveryManaCostReduction +1 (system AE on class item)                                        |
| Manifold Mind     | 4     | ✅ AE      | focus.maxBonus +1                                                                             |
| Extracurricular   | 6     | 📝 Flavor | Studied die to cast unknown spell (player-tracked)                                            |
| Manifold Mind (3) | 8     | ✅ AE      | Additional focus.maxBonus +1 (total +2)                                                       |
| Archwizard        | 10    | ✅ System  | Additional deliveryManaCostReduction +1 (system AE on class item)                             |
