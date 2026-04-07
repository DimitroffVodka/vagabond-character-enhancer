# Perk Automation Reference

Reference for all 104 Vagabond RPG perks and their automation status in the `vagabond-character-enhancer` (VCE) FoundryVTT module.

## Status Legend

| Icon | Status | Meaning |
|------|--------|---------|
| ✅ System AE | System Active Effect | The Vagabond system compendium includes a built-in AE that works automatically |
| ✅ Module | VCE Automated | Automated by VCE via runtime hooks or managed Active Effects |
| 🔲 Automatable | Could Be Automated | Not yet implemented but feasible via AE or hook |
| 📝 Flavor | No Automation | Narrative, social, downtime, or character-build perk with no meaningful automation target |

## Summary

| Status | Count |
|--------|-------|
| ✅ System AE | 8 |
| ✅ Module | 5 |
| 🔲 Automatable | 22 |
| 📝 Flavor | 69 |
| **Total** | **104** |

## Full Perk List (Alphabetical)

| Perk | Status | Description | Notes |
|------|--------|-------------|-------|
| Abjurer | 📝 Flavor | While Focusing on Ward with another Being as Target, you also gain Ward's benefits. | Requires tracking Ward spell target state; complex Focus interaction |
| Advancement | 📝 Flavor | Increase one Stat by 1 (max 7). Can take multiple times. | Character build; applied manually at level-up |
| Akimbo Trigger | ✅ Module | Ranged attacks against Close Targets aren't Hindered; Move half Speed on skip-Move attack. | Runtime check: range validator skips Ranged-at-Close hinder |
| Ambusher | 🔲 Automatable | Favor on attacks to initiate Combat and against Beings that haven't acted yet. | Hook: detect combat start and track who has acted; grant Favor |
| Animal Companion | 📝 Flavor | Tame a Beast with HD no higher than half your Level as a companion. | Narrative; companion management is manual |
| Arcane Artisan | 📝 Flavor | When Crafting, spend Mana to supplement Materials at 5s per Mana. | Downtime crafting; no combat automation |
| Archaeologist | 📝 Flavor | Favor on Checks and Saves against traps; Will Save to break curses. | Situational; trap interactions are GM-adjudicated |
| Assured Healer | 🔲 Automatable | Healing rolls from Spells explode on a 1. | Hook: intercept healing spell damage rolls and set explode-on-1 |
| Athame | 📝 Flavor | 10-minute Ritual to make a dagger your athame (Relic with Loyalty Power). | Ritual; item property is manual |
| Bookworm | 📝 Flavor | Gain an extra Studied die when you Study. Can take multiple times. | Studied die economy; no combat hook |
| Botanical Mediciner | 📝 Flavor | Restore d6 HP during a Breather with herbs; can remove Blinded, Paralyzed, or Sickened. | Breather healing; manual application |
| Briar Healer | 📝 Flavor | Life Spell Target gains +1 Armor and deals d6 to melee attackers while you Focus. | Complex Focus + reactive damage interaction |
| Bully | ✅ Module | Grapple/Shove Checks against smaller Targets are Favored; can use grappled Targets as a greatclub. | Runtime check: favor on Grapple/Shove vs smaller targets (brawl-intent.mjs) |
| Cardistry | 📝 Flavor | Use deck of cards as Trinket and 2H Thrown/Finesse weapon (d4 damage). | Item property; manual weapon setup |
| Cat-Like Reflexes | 🔲 Automatable | Reduce fall damage by half; while Prone, stand up using only 5' of Speed. | AE: could halve fall damage via hook; Prone stand-up is harder |
| Check Hook | 🔲 Automatable | Once per Round, make one Brawl Weapon attack when a Close Enemy Moves or Attacks. | Hook: detect enemy movement/attack near actor; prompt reaction attack |
| Chicanery | 📝 Flavor | Failed Checks don't alert Beings to your presence or advance relevant Progress Clocks. | Narrative stealth rule; GM-adjudicated |
| Combat Medic | 📝 Flavor | Action to remove Sickened and heal (d6 + Reason) HP. Once per Being per Shift. | Could be a chat button/macro but healing is manual |
| Conjurer | 📝 Flavor | Cast Action to conjure a previously-defeated non-Humanlike Being by spending Mana equal to its HD. | Complex summoning; manual actor creation |
| Deft Hands | 📝 Flavor | Skip Move to take the Use Action. | Action economy; no automation target |
| Diplomat | 📝 Flavor | Favor on Leadership Checks to negotiate/parley if you haven't damaged the Target in the last minute. | Social; conditional on recent combat history |
| Drunken Master | 📝 Flavor | 1H Crude Weapons have the Finesse property for you. | Item property override; manual weapon setup |
| Duelist | 🔲 Automatable | While Dual-Wielding, can Move up to half Speed when skipping Move to attack; Dodge with Favor in 1v1. | Hook: detect dual-wield + 1v1 scenario for Favor on Dodge |
| Endless Stamina | 📝 Flavor | Fatigue doesn't prevent Rush; once per Day, remove 1 Fatigue during a Breather. | Fatigue management; mostly narrative |
| Extrovert | 📝 Flavor | Once per Day, gain a Studied die if you meet a new friendly person. | Social/narrative trigger |
| Fallaway Reverse | 🔲 Automatable | If you Crit to Dodge a Melee Attack, the attacker falls Prone. | Hook: detect crit Dodge result and apply Prone to attacker |
| Familiar | 📝 Flavor | 10-minute Ritual to conjure a Small Being (HD 1) familiar; uses your Cast Skill; can Cast through it. | Summoning/ritual; manual companion management |
| Full Swing | ✅ Module | On a Melee Attack that beats Difficulty by 10+, push Target as a shove. | Runtime check: auto-shove on Melee beat-by-10+ (brawl-intent.mjs) |
| Gish | ✅ System AE | Use Weapons as Trinkets to Cast; when Imbuing, can attack with same Action. | System AE: `system.attributes.isSpellcaster` = true |
| Grim Harvest | 🔲 Automatable | When Spell kills a non-Artificial/Undead Enemy, regain HP equal to damage. | Hook: detect spell kill, check target type, heal caster |
| Guardian Angel | 📝 Flavor | Once per Round, spend 1 Luck when Ally is Targeted to attack Enemy; hit grants Ally Favor. | Reactive; requires Luck spend + ally targeting detection |
| Harmonic Resonance | 📝 Flavor | Use a Musical Instrument as a Trinket; Cast with Aura or Cone delivery, spend 1 less Mana. | Mana cost reduction conditional on delivery + instrument |
| Heavy Arms | 🔲 Automatable | While holding a weapon as 2H Grip, its damage rolls explode on 1. | Hook: detect 2H grip and set damage dice to explode on 1 |
| Heightened Cognition | 📝 Flavor | Spend a Studied die to pass a Detect, Mysticism, or Survival Check you fail. | Studied die spend; manual reroll |
| Heightened Intellect | 📝 Flavor | Spend a Studied die to pass an Arcana, Craft, or Medicine Check you fail. | Studied die spend; manual reroll |
| Heightened Magnetism | 📝 Flavor | Spend a Luck to pass an Influence, Leadership, or Performance Check you fail. | Luck spend; manual reroll |
| Ice Knife | 📝 Flavor | Ice Objects from Freeze last up to 1 minute without requiring Focus. | Spell-specific Focus override; niche |
| Impersonator | 📝 Flavor | Unerringly imitate the voice of any Humanlike you have heard speak. | Pure narrative |
| Infesting Burst | 📝 Flavor | When creating an Undead with Raise, can raise them as a Boomer. | Spell variant; manual creature selection |
| Infravision | 🔲 Automatable | Gain Darksight. | AE: grant Darksight vision mode |
| Inspiring Presence | 📝 Flavor | Use Action to rally Allies affected by status countdowns; pass Leadership Check to shrink die. | Complex social/support action; manual |
| Interceptor | 📝 Flavor | Once per Round, attack a Close Enemy that begins to Move out of your reach. | Reactive attack; requires movement detection |
| Knife Juggler | 📝 Flavor | 1H Thrown Weapons are 0 Slots; can draw one as part of an attack. | Item slot/property override; manual |
| Limit Break | 🔲 Automatable | Once per Combat, when dropped below half HP, take another Action on your next Turn. | Hook: detect HP crossing below half; post notification/chat message |
| Mage Slayer | 🔲 Automatable | Damage rolls against Focusing Beings can explode; beat by 10+ ends Focus. | Hook: detect target Focus state, set exploding dice, end Focus on beat-by-10 |
| Magical Secret | ✅ System AE | Learn a Spell and Cast it using a Skill of your choice. Can take multiple times. | System AE: `system.attributes.isSpellcaster` = true |
| Marksmanship | ✅ System AE | Damage dice for Ranged Weapon attacks are one size larger. | System AE: `system.rangedDamageDieSizeBonus` +2 |
| Master Artisan | 📝 Flavor | When spending a Shift to Craft, counts as two Shifts of work. | Downtime crafting; no combat automation |
| Master Breaker | 📝 Flavor | Failed Finesse lockpick doesn't break pick; Favor on Saves against triggered traps. | Exploration; GM-adjudicated |
| Master Chef | 📝 Flavor | Cook meals using 5s of Materials during a Scene; makes d6+1 rations that restore d6 HP during a Breather. | Downtime/rest activity |
| Medium | 📝 Flavor | 10-minute Ritual to ask GM up to 3 yes/no questions; can't use again until completing a Quest. | Pure narrative ritual |
| Mesmer | 📝 Flavor | Cast Check 10+ for Charm/Frighten also forces Target to take an action. | Spell enhancement; requires cast check result tracking |
| Metamagic | ✅ System AE | Maximum Mana per Spell increases by 1. Can take multiple times. | System AE: `system.mana.castingMaxBonus` +1 |
| Mithridatism | 🔲 Automatable | Saves against Sickened are Favored; reduce Poison-based damage by 2 per die. | Hook: detect Sickened saves for Favor; reduce poison damage per die |
| Moonlight Sonata | 📝 Flavor | Cause light from your Spells to be Moonlight. | Light type flavor; no mechanical hook |
| Mounted Combatant | 📝 Flavor | Favor on mount Checks; Versatile as 1H while mounted with 2H benefits. | Mount detection + weapon property override; niche |
| Necromancer | 📝 Flavor | While Focusing on Raise, choose a controlled Undead to regain HP equal to half your Level. | Focus + companion healing; manual |
| New Training | 📝 Flavor | Gain a Training. Can take multiple times. | Character build; applied manually |
| Owl-Blasted | 📝 Flavor | If a Charm Cast Check fails, regain d4 Mana spent on the Casting. | Mana refund on failed cast; niche spell interaction |
| Pack Mule | ✅ System AE | Gain +2 Item Slots. Can take multiple times. | System AE: `system.inventory.bonusSlots` +2 |
| Padfoot | 📝 Flavor | Once per Day, gain a Studied die when you Travel 6 miles or more. | Travel trigger; narrative |
| Panache | 🔲 Automatable | If you hit a Close Enemy with an attack, your next Save before your next Turn is Favored. | Hook: detect melee hit, apply temp AE granting Favor on next save |
| Patience | 🔲 Automatable | When you Hold to Attack, your next Endure Save to Block before your next Turn is Favored. | Hook: detect Hold action, apply temp AE granting Favor on Block |
| Peerless Athlete | 📝 Flavor | Stand from Prone at start of Turn (no Action); can Rush and Jump with the same Action. | Action economy; no simple automation |
| Perfect Parry | 🔲 Automatable | If you Crit to Block, attacker is Vulnerable until end of your next Turn. | Hook: detect crit Block result, apply Vulnerable to attacker |
| Poisoner | 📝 Flavor | Coat your Equipped Weapon with a poison when you attack with it. | Item interaction; manual poison selection |
| Protector | ✅ Module | Can Block on behalf of an Ally that fails their Save against a Close Enemy's attack. | Auto-rolls Endure save when ally fails; heals ally for highest die on pass. Checks Protector is Close (5ft) to attacker via `measureDistance`. |
| Provoker | 📝 Flavor | Use Action to goad Enemy; Allies' Saves against that Enemy have Favor. | Social/tactical; requires target marking |
| Rally | 📝 Flavor | Once per Shift, use an Action to grant Allies 1 Luck and end Charmed or Frightened on them. | Action-based buff; could be a macro but involves Luck economy |
| Reanimator | 📝 Flavor | 10-minute Ritual to raise a corpse as an Undead under your control for one Shift. | Ritual/summoning; manual |
| Resourceful | 📝 Flavor | Spend 1 Luck to recall having packed an Item (up to 50s value) in your inventory. | Narrative Luck spend |
| Sage | 📝 Flavor | As an Action, grant an Ally one of your Studied Dice. | Studied die transfer; manual |
| Salbenist | 📝 Flavor | Ritual with a Weapon and an oil grants ability to attack with Craft and freely coat the weapon. | Ritual; manual weapon/oil interaction |
| Scout | 📝 Flavor | Can't get lost during Travel; when Hunting, roll twice and choose. | Exploration; GM-adjudicated |
| Scrapper's Delight | 📝 Flavor | 10-minute Ritual to break down a nonmagical Item into raw materials. | Downtime; inventory management |
| Second Wind | ✅ System AE | Once per Combat, use Action or skip Move to regain (d6 + Might) HP. | System AE: empty placeholder (no actual automation). Could be a chat button/macro. |
| Secret of Mana | ✅ System AE | Gain 1 Mana per Level. Can take multiple times. | System AE: `system.mana.bonus` = `@lvl` |
| Sentinel | 🔲 Automatable | Enemies hit with a Melee Attack can't Move for the rest of the Turn. | Hook: on melee hit, apply a movement-prevention effect to target |
| Shapechanger | 📝 Flavor | When you target yourself with Polymorph, use your Cast Skill for its Actions and Focus doesn't cost Mana. | Polymorph self-target variant; complex spell interaction |
| Sharpshooter | 🔲 Automatable | Skip Move to reduce Ranged attack Crit threshold by 1 this Turn. | Hook: detect skip-Move, apply temp crit threshold reduction via AE |
| Silver Tongued | 🔲 Automatable | Reduce Crit threshold on Influence Checks by 1. Can take up to 4 times. | AE: could apply crit bonus to Influence checks |
| Situational Awareness | 📝 Flavor | Favor on Checks against surprise; being flanked doesn't Hinder your Saves. | Surprise/flanking; GM-adjudicated positioning |
| Sixth Sense | 📝 Flavor | Ignore Blinded Status for sight-based Checks and Saves. | Status condition override; complex conditional |
| Skirmisher | 🔲 Automatable | +5 foot Speed bonus while wearing Light Armor or no armor. | AE: +5 Speed conditional on armor type |
| Smooth Talker | 📝 Flavor | Once per Scene, reroll a failed Influence Check. | Manual reroll |
| Snareroot Trapper | 📝 Flavor | Cast Sprout with Glyph delivery for no extra Mana and without Focusing; one active at a time. | Spell-specific cost/focus override; niche |
| Solar Flare | 📝 Flavor | Cause Spell light to be Sunlight. | Light type flavor; no mechanical hook |
| Spin-to-Win | ✅ Module | When attacking with a Melee Cleave weapon, deal half damage to any viable Targets (not just one extra). | Managed AE: `cleaveMaxTargets` set to 100; range validator enforces |
| Steady Aim | 🔲 Automatable | Ignore Hinder on Ranged Weapon attacks if you can see the Target; Favor vs targets that haven't moved since last Turn. | Hook: remove Ranged hinder; track target movement for Favor |
| Storm Raiser | 📝 Flavor | Once per Day, 10-minute Ritual to change weather in surrounding mile for Cd4 Shifts. | Narrative ritual; weather is GM-managed |
| Strategist | 🔲 Automatable | Attacks against Targets Close to non-Incapacitated Allies are Favored. | Hook: check proximity of allies to target; grant Favor |
| Tactician | 📝 Flavor | Use Action or skip Move to issue orders lasting until you issue another. | Orders system; complex state tracking |
| Telepath | 📝 Flavor | Gain Telepathy (Far) while Focusing on this Ability. | Focus-based ability; narrative communication |
| Tough | ✅ System AE | Max HP increases by current Level (and +1 per future Level). Can take multiple times. | System AE: `system.bonuses.hpPerLevel` +1 |
| Transvection | 📝 Flavor | Cast Levitate on a small Item (2 Slots or less) to give it Fly Speed 30' without Focus. | Spell variant; manual |
| Treads Lightly | ✅ Module | Speed not impeded by nonmagical Difficult Terrain; don't trigger traps. | Runtime hook: nullifies walk-type region movement costs (Foundry regions + Vagabond Crawler) |
| Unfailing Guidance | 📝 Flavor | If Guide Target Hinders an Ally's Save, the Hinder is ignored if Ally can see you. | Conditional hinder removal; complex state tracking |
| Ungarmax | 📝 Flavor | Allies you cause to be Berserk with Apoplex gain +1 bonus to each damage die on attacks. | Requires tracking Berserk source + ally damage modification |
| Vehement Magic | 🔲 Automatable | Spell damage rolls explode on a roll of 1. | Hook: intercept spell damage rolls and set explode-on-1 |
| Vigilance | 📝 Flavor | Don't need sleep to gain Rest benefits, but can't remove Fatigue without normal Rest. | Rest rules; narrative |
| Vituperation | 📝 Flavor | Use Action/skip Move to rebuke an Enemy; if passed, Target is Vulnerable. | Action-based debuff; could be a macro |
| Wander the Wooded | 📝 Flavor | Natural Difficult Terrain doesn't impede Speed; Saves against natural hazards are Favored. | Exploration/terrain; overlaps with Treads Lightly but nature-specific |
| Water Walker | 📝 Flavor | You can walk on water. | Narrative movement ability |
| Witchsight | 📝 Flavor | While Focusing, Checks against illusions are Favored and you can see Invisible Beings. | Focus-conditional detection; complex |

## Implementation Priority Notes

### High-Value Automatable Perks
These perks are commonly taken and would benefit the most players:
- **Heavy Arms** / **Vehement Magic** / **Assured Healer** — Explode-on-1 mechanics; similar hook pattern
- **Sharpshooter** — Popular ranged perk; skip-Move crit reduction
- **Panache** — Common martial perk; temp Favor on save after hit
- **Sentinel** — Common martial perk; movement prevention on hit
- **Infravision** — Simple AE to grant Darksight
- **Skirmisher** — Simple conditional Speed AE

### Implementation Patterns
- **Explode-on-1 perks** (Heavy Arms, Vehement Magic, Assured Healer, Mage Slayer): All share the same damage roll intercept pattern
- **Crit-reaction perks** (Perfect Parry, Fallaway Reverse): Both trigger on crit saves; apply status to attacker
- **Conditional Favor perks** (Panache, Patience, Strategist, Steady Aim): Apply temporary Favor based on game state
- **Skip-Move perks** (Sharpshooter): Require tracking whether the actor moved this turn
