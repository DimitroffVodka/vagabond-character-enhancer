# Spell Automation Reference

Reference for the `vagabond-character-enhancer` (VCE) FoundryVTT module listing all 59 Vagabond RPG spells and their automation status.

## How to Read This Document

Each spell is categorized by what kind of automation it would need:

| Icon | Status | Meaning |
|------|--------|---------|
| ✅ Module | Automated | Currently implemented in VCE |
| 🔲 Status | Automatable | Could auto-apply a status effect on cast |
| 🔲 Buff | Automatable | Could create buff/utility Active Effects on targets |
| 🔲 Complex | Automatable | Needs significant special handling or custom UI |
| 📝 Narrative | No automation | Fully narrative, too situational, or no mechanical effect to automate |

## Summary

| Category | Count |
|----------|-------|
| ✅ Module | 3 |
| 🔲 Status | 13 |
| 🔲 Buff | 20 |
| 🔲 Complex | 18 |
| 📝 Narrative | 6 |
| **Total** | **60** |

## All Spells (Alphabetical)

| Spell | Status | Damage Type | Description | Notes |
|-------|--------|-------------|-------------|-------|
| Adhere | 🔲 Status | acid | Sticky slime, Difficult Terrain, Vulnerable/Restrained | Apply Restrained / Difficult Terrain |
| Amplify | 🔲 Buff | -- | Sound amplified tenfold, can't surprise, Favor on sound-based Detect | Favor on detect-by-sound checks |
| Animate | 🔲 Complex | -- | Animate Item (1 Slot), 30' Fly, obeys commands | Create animated item actor. `noRollRequired` |
| Apoplex | 🔲 Status | fire | Berserked | Apply Berserk |
| Aqua | 🔲 Complex | -- | Create/destroy water | Water/ice manipulation. `noRollRequired` |
| Babble | 🔲 Status | -- | Target loudly repeats your mental commands; otherwise mute | Apply custom effect (mute + forced speech) |
| Beast | 🔲 Complex | -- | Summon Beast(s) with cumulative HD <= half Level | Summon actors with HD budget. `noRollRequired` |
| Bless | ✅ Module | -- | Silvered weapons, d4 Save bonus | Full aura system: d4 save bonus AE on allies, silvered weapons, mode buttons in chat. `noRollRequired` |
| Blink | 🔲 Buff | -- | Skip Move to teleport to visible empty space within Near | Teleport movement mode. `noRollRequired` |
| Burn | 🔲 Status | fire | Burning (Cd4). No Focus needed | Apply Burning Cd4 |
| Charm | 🔲 Status | -- | Charmed, ends on damage | Apply Charmed |
| Color | 🔲 Buff | -- | Blinded for Beings, color change for Objects | Apply Blinded. `noRollRequired` |
| Confuse | 🔲 Status | -- | Confused | Apply Confused |
| Control | 🔲 Complex | -- | Objects manipulated; Beings Charmed and obey if HD/Level lower | Charmed + commands (HD check) |
| Cure | 🔲 Buff | -- | End Blinded/Sickened + Immune | Remove/immunize Blinded/Sickened. `noRollRequired` |
| Disintegrate | 🔲 Complex | shock | Destroy nonmagical Target; 0 HP targets also destroyed | Object/target destruction |
| Dispel | 🔲 Complex | -- | Suspend a magic effect | Suspend magic effect. `noRollRequired` |
| Enchant | 🔲 Buff | -- | Item counts as Relic | Item becomes Relic. `noRollRequired` |
| Enflesh | 📝 Narrative | acid | Turn non-Relic materials to flesh/bone | Purely narrative material transformation. `noRollRequired` |
| Erupt | 🔲 Complex | fire | Magma, Difficult Terrain, d6 fire damage | Terrain/region creation. `noRollRequired` |
| Exalt | ✅ Module | -- | +1 per damage die, +1 Will vs Frightened. Doubled vs Hellspawn/Undead | +1 per damage die AE (+2 vs Undead/Hellspawn), applied via focus/aura. `noRollRequired` |
| Fade | 🔲 Buff | -- | Invisible, ends on Action | Apply Invisible status. `noRollRequired` |
| Fear | 🔲 Status | -- | Frightened of chosen Target | Apply Frightened |
| Fog | 📝 Narrative | cold | Obscuring cloud, Hinders sight-based Checks | Area obscurement, hard to mechanize. `noRollRequired` |
| Forge | 🔲 Complex | -- | Materialize Item (1 Slot, 1g max). Lasts 1 hour | Create temporary items. `noRollRequired` |
| Freeze | 🔲 Complex | cold | Freeze water, -10 Speed, or create ice Object | Water/ice manipulation. `noRollRequired` |
| Frostburn | 🔲 Status | cold | Burning (d4) + Speed -10 | Apply Burning d4 + Speed -10 |
| Gas | 🔲 Status | poison | Cloud of gas, Sickened (Vulnerable) | Apply Sickened (Vulnerable) in area. `noRollRequired` |
| Goop | 🔲 Complex | acid | Sticky acidic sludge, Difficult Terrain, Burning (d6) if dealing damage | Terrain/region creation |
| Guide | 🔲 Buff | -- | Favor on sight-based Checks vs Target | Favor on sight-based checks vs target. `noRollRequired` |
| Gust | 📝 Narrative | -- | Wind effects: Feather (slow fall), Blast (knock back), Shear (clear gas/fog) | Situational wind effects. `noRollRequired` |
| Hold | 🔲 Status | -- | Paralyzed if HD/Level <= yours. Spend Mana to increase effective Level | Apply Paralyzed (HD check) |
| Hymn | 🔲 Buff | -- | End Berserk/Charmed/Confused/Frightened + Immune | Remove/immunize Berserk/Charmed/Confused/Frightened. `noRollRequired` |
| Imbue | ✅ Module | -- | Spell damage dice added to weapon, single armor application | Spell damage dice added to weapon formula, single armor application |
| Junk | 🔲 Complex | -- | Create Item (5s, 1 Slot). Lasts 1 hour | Create temporary items. `noRollRequired` |
| Kinesis | 🔲 Complex | blunt | Shoot unsecured Target at another | Shoot object at target |
| Knock | 📝 Narrative | -- | Opens barred/locked/stuck things | Purely narrative. `noRollRequired` |
| Leech | 🔲 Status | poison | Sickened, healing redirected to caster | Apply Sickened + healing redirect |
| Levitate | 🔲 Buff | -- | Float 1 foot, Move in air as walking | Float movement mode |
| Life | 🔲 Buff | healing | Revive with 1 HP + 1 Fatigue. Spend Mana for more HP | Heal target (1 HP + mana, 1 Fatigue). `noRollRequired` |
| Light | 🔲 Buff | fire | Shed Light to Near | Light emission. `noRollRequired` |
| Mend | 📝 Narrative | -- | Repair Objects (5s Material per d8 HP) | Downtime repair. `noRollRequired` |
| Mirage | 🔲 Complex | -- | Illusionary Object/effect | Illusion creation |
| Moon | 🔲 Buff | cold | Shed Moonlight, Shapechangers Burning (d6) | Light/darkness emission. `noRollRequired` |
| Morph | 🔲 Buff | -- | Alter appearance illusorily | Appearance change |
| Mute | 🔲 Buff | -- | No sound from Target | Silence effect on target |
| Polymorph | 🔲 Complex | -- | Become a Beast (HD <= Level). Uses Beast's stats but keeps mental stats and HP | Full beast form. Druid already has this infrastructure |
| Portal | 🔲 Complex | -- | Two linked portals on surfaces | Linked portal creation. `noRollRequired` |
| Raise | 🔲 Complex | -- | Corpses rise as Undead under control | Summon Undead actors. `noRollRequired` |
| Rust | 🔲 Complex | acid | Metal Objects rust; roll d6, on 1 item breaks | Metal destruction. `noRollRequired` |
| Shade | 🔲 Buff | -- | Magic darkness out to Close | Darkness emission. `noRollRequired` |
| Shrink | 🔲 Buff | -- | Size and damage dice reduced by one size | Size and damage dice reduction |
| Sleep | 🔲 Status | -- | Unconscious (HD check), ends on damage | Apply Unconscious (HD check) |
| Speak | 📝 Narrative | -- | Target can speak/understand you | Language understanding. `noRollRequired` |
| Sprout | 🔲 Buff | blunt | Plants cause Difficult Terrain; damage = Restrained | Difficult Terrain + Restrained on damage |
| Tempo | 🔲 Buff | -- | Speed +/- 5 per mana | Speed modifier AE |
| Terraform | 🔲 Complex | blunt | Manipulate earth/stone | Terrain/region creation |
| Truth | 🔲 Buff | -- | Can't lie | Apply truth-telling effect on target |
| Ward | 🔲 Buff | -- | Reduce damage by d6 per mana on Cast Check pass | Damage reduction on cast check (d6 per mana) |
| Zap | 🔲 Status | shock | Dazed if damageable by shock | Apply Dazed |
