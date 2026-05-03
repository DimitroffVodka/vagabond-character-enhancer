# Perk Automation

Perks are auto-detected from character items. Some have built-in system AEs (handled natively by Vagabond), some are automated by VCE via runtime hooks, and the rest are tracked for future automation.

> Full reference with all 104 perks: [`perk-automation-reference.md`](perk-automation-reference.md)

See the [README's status legend](../README.md#status-legend) for icon meanings.

---

## Currently Automated Perks

| Perk            | Status        | What It Does                                                                                                                                                                                                                                                                |
|-----------------|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Tough           | ✅ System AE  | `hpPerLevel` +1 — Max HP increases by Level                                                                                                                                                                                                                                 |
| Pack Mule       | ✅ System AE  | `inventory.bonusSlots` +2 — Gain +2 Item Slots                                                                                                                                                                                                                              |
| Secret of Mana  | ✅ System AE  | `mana.bonus` = `@lvl` — +1 Mana per Level                                                                                                                                                                                                                                   |
| Marksmanship    | ✅ System AE  | `rangedDamageDieSizeBonus` +2 — Ranged damage dice one size larger                                                                                                                                                                                                          |
| Metamagic       | ✅ System AE  | `mana.castingMaxBonus` +1 — Max Mana per Spell +1                                                                                                                                                                                                                           |
| Magical Secret  | ✅ System AE  | `isSpellcaster` = true — Grants spellcaster flag                                                                                                                                                                                                                            |
| Gish            | ✅ System AE  | `isSpellcaster` = true — Grants spellcaster flag                                                                                                                                                                                                                            |
| Second Wind     | ✅ System AE  | Placeholder AE (no changes)                                                                                                                                                                                                                                                 |
| Spin-to-Win     | ✅ Module     | Managed AE: `cleaveMaxTargets` = 100, removes Cleave target cap                                                                                                                                                                                                             |
| Treads Lightly  | ✅ Module     | Runtime hook: nullifies region movement costs (Foundry + Crawler)                                                                                                                                                                                                           |
| Akimbo Trigger  | ✅ Module     | Range validator skips Ranged-at-Close hinder                                                                                                                                                                                                                                |
| Bully           | ✅ Module     | Favor on Grapple/Shove vs smaller targets                                                                                                                                                                                                                                   |
| Full Swing      | ✅ Module     | Auto-shove on Melee beat-by-10+                                                                                                                                                                                                                                             |
| Protector       | ✅ Module     | Auto-rolls Endure save when ally fails a save near attacker; heals for highest die on pass                                                                                                                                                                                  |
| Briar Healer    | ✅ Module     | While caster Focuses on Life: target gains +1 Armor + reactive d6 thorn damage to any Being who melees them. Subscribes to `vagabond.postDamageApply` (v5.3.0+) so the reaction fires cleanly without monkey-patching the damage pipeline.                                  |

For the remaining 89 perks (📝 Flavor and 🔲 Todo), see the [full reference](perk-automation-reference.md).
