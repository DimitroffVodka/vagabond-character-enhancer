# Spell Automation Reference

Reference for the `vagabond-character-enhancer` (VCE) FoundryVTT module listing all 59 Vagabond RPG spells and their automation status.

## How to Read This Document

Each spell is categorized by what kind of automation it would need:

| Icon | Status | Meaning |
|------|--------|---------|
| ✅ Module | Automated | Currently implemented in VCE |
| ✅ System | Automated | Handled by the system's causedStatuses data + VCE's effect-only handler |
| 🟢 AE | Easy | Automatable via simple Active Effect (buff/debuff on target) |
| 🟡 Status Removal | Medium | Automatable via status removal + immunity grant |
| 🟡 Complex | Medium-Hard | Needs special handling, custom UI, or conditional logic |
| 🔴 Narrative | No automation | Fully narrative, too situational, or no mechanical effect to automate |

## Effect-Only Handler

VCE's `EffectOnlyHandler` (`scripts/spell-features/effect-only-handler.mjs`) automatically handles
ALL spells with `causedStatuses` configured in the system compendium when cast without damage:

- Replaces erroneous "Roll Damage" button with "Apply Effects"
- Applies statuses to targets via `StatusHelper.processCausedStatuses()`
- Handles saves (Will, Endure, Reflex) automatically
- Overrides `requiresDamage` for effect-only casts
- On crit: `critCausedStatuses` overrides same-statusId entries (e.g., focusing -> continual)
- Focusing duration: auto-expires next round if caster isn't focusing
- Continual duration (crit): persists until manually removed
- Works from both character sheet AND vagabond-crawler strip

## Summary

| Category | Count |
|----------|-------|
| ✅ Module (VCE custom) | 4 |
| ✅ System (causedStatuses) | 19 |
| 🟢 AE (easy automation) | 6 |
| 🟡 Status Removal | 2 |
| 🟡 Complex | 12 |
| 🔴 Narrative | 17 |
| **Total** | **60** |

## Spells with Full Automation (✅)

### VCE Custom Modules

| Spell | Damage | Handler | Notes |
|-------|--------|---------|-------|
| Bless | -- | `bless-manager.mjs` | d4 save bonus AE on allies, silvered weapons, mode dialog |
| Exalt | -- | Class feature (Revelator) | +1 per damage die AE, +1 Will vs Frightened |
| Imbue | -- | `imbue-manager.mjs` | Spell damage dice added to weapon, consumed on attack |
| Polymorph | -- | `polymorph/` system | Full beast form transformation (Druid) |

### System causedStatuses (handled by effect-only handler + system damage flow)

These spells have `causedStatuses` configured in the `vagabond.spells` compendium. When cast with
damage dice, the system's damage -> save -> status pipeline handles them. When cast as effect-only
(0 dice or damageType "-"), VCE's EffectOnlyHandler provides the "Apply Effects" button.

| Spell | Damage | Status | Save | Normal Dur | Crit |
|-------|--------|--------|------|------------|------|
| Adhere | acid | Restrained | none | continual | -- |
| Apoplex | fire | Berserk | none | focusing | continual |
| Burn | fire | Burning | none | Cd4 | Cd6 |
| Charm | -- | Charmed | will | focusing | continual |
| Color | -- | Blinded | none | focusing | continual |
| Confuse | -- | Confused | will | focusing | continual |
| Control | -- | Charmed | will | focusing | -- |
| Erupt | fire | -- | -- | -- | Burning Cd4 (crit-only) |
| Fade | -- | Invisible | none | focusing | -- |
| Fear | -- | Frightened | will | focusing | continual |
| Frostburn | cold | Burning | none | Cd4 | Cd6 |
| Gas | poison | Sickened | endure | focusing | continual |
| Goop | acid | Burning | reflex | Cd6 | +Restrained (continual) |
| Hold | -- | Paralyzed | none | focusing | continual |
| Leech | poison | Sickened | none | focusing | -- |
| Light | fire | -- | -- | -- | Blinded Cd4 (crit-only) |
| Sleep | -- | Unconscious | none | focusing | -- |
| Sprout | blunt | -- | -- | -- | Restrained (focusing, crit-only) |
| Zap | shock | Dazed | endure | focusing | +Paralyzed (focusing) |

## Spells with No Automation — Ranked by Feasibility

### 🟢 Automatable via Active Effects

These could be implemented as AEs applied to the target on cast.

| Spell | Damage | What it does | Automation approach |
|-------|--------|--------------|---------------------|
| Exalt | -- | +1 bonus to each damage die + Will vs Frightened | AE: `universalDamageBonus +1`, `saves.will.bonus +1`. Already automated for Revelator, could be generalized. |
| Tempo | -- | Speed +/- 5' per mana | AE: speed modifier. Needs dialog for direction + amount. Crit: 1 min no focus. |
| Freeze | cold | Target's Speed -10' | AE: speed -10. Also freezes water / creates ice (narrative). Crit: continual. |
| Shrink | -- | Size and damage dice reduced by one | AE: size reduction + damage die downgrade. Crit: 1 min no focus. |
| Guide | -- | Checks relying on sight vs target are Favored | AE: mark target with "Guided" for favor on attacks/checks. Crit: 1 min no focus. |
| Moon | cold | Shapechangers Burning(d6) in moonlight | Add `causedStatuses` with Burning d6. Conditional on shapechanger (GM adjudication). |

### 🟡 Automatable via Status Removal

These remove existing statuses and grant temporary immunity.

| Spell | What it does | Automation approach |
|-------|--------------|---------------------|
| Cure | Removes Blinded/Sickened + Immune for duration | Remove statuses, apply immunity AE with `statusImmunities: "blinded,sickened"`. |
| Hymn | Removes Berserk/Charmed/Confused/Frightened + Immune | Remove statuses, apply immunity AE with `statusImmunities: "berserk,charmed,confused,frightened"`. |

### 🟡 Complex (Needs Special Handling)

| Spell | Damage | What it does | Challenge |
|-------|--------|--------------|-----------|
| Ward | -- | Reduce damage by d6 per mana on Cast Check pass | Intercept incoming damage reactively + roll Cast Check. Crit: negate all damage. |
| Enchant | -- | Item becomes Relic + optional +1/+2/+3 Bonus | AE on item with Relic flag + bonus. Needs mana cost dialog. |
| Animate | -- | Animate Item: 30' Fly, obeys commands, attacks with Cast Skill | Create temporary actor from item. Very complex. |
| Beast | -- | Summon Beast(s) with cumulative HD <= half Level | Summon actors with HD budget. Could reuse polymorph beast cache. |
| Raise | -- | Corpses rise as Undead under control (HD <= Level) | Summon Undead actors. Similar to Beast but with Undead template. |
| Disintegrate | shock | Destroy nonmagical Target; 0 HP -> ash | Object/target destruction logic. |
| Rust | acid | Metal Objects rust; roll d6 per turn, 1 = item breaks | Item destruction with per-turn rolls. |
| Forge | -- | Materialize Item (1 Slot, 1g max) for duration | Create temporary items in inventory. |
| Junk | -- | Create cheap Item (5s, 1 Slot). No Focus. | Create temporary items, dismissed on recast. |
| Dispel | -- | Suspend a magic effect for duration | AE removal / suppression. Crit: permanent dispel. |
| Mirage | -- | Create illusionary Object/effect | Illusion creation. Fully narrative. |
| Portal | -- | Two linked portals on surfaces | Token teleportation between points. |

### 🔴 Narrative / No Mechanical Automation

These are purely narrative, too situational, or have no quantifiable mechanical effect.

| Spell | Damage | Why not automatable |
|-------|--------|---------------------|
| Amplify | -- | Sound amplification is narrative. "Can't surprise" and "Favored Detect" are too situational. |
| Aqua | -- | Water creation/destruction is positional/narrative. Push effect is GM-adjudicated. |
| Babble | -- | Forced speech is narrative. No standard status maps to this. |
| Blink | -- | Teleport is a movement mode, not a status or buff. Would need token movement UI. |
| Enflesh | acid | Material transformation is purely narrative. |
| Erupt (terrain) | fire | Magma terrain creation is a map/region effect, not actor-targetable. (Crit Burning IS automated via causedStatuses.) |
| Fog | cold | Area obscurement is a lighting/region effect. Hinder is positional. |
| Gust | -- | Wind push/slow fall effects are positional and situational. |
| Kinesis | blunt | Object throwing is just damage (already works via damage flow). |
| Knock | -- | Opens locks — purely narrative. |
| Levitate | -- | 1-foot float is token elevation, not a status. |
| Life | healing | Revive + healing is a system-level action. Healing already works via system. |
| Mend | -- | Object repair is downtime/narrative. |
| Morph | -- | Appearance change is narrative (no mechanical effect). |
| Mute | -- | Silence has no standard status. Could be a custom marker but no mechanical impact. |
| Shade | -- | Magical darkness is a lighting effect. |
| Speak | -- | Language understanding is narrative. |
| Terraform | blunt | Terrain manipulation is a map/region effect. |
| Truth | -- | "Can't lie" has no mechanical enforcement possible. |
