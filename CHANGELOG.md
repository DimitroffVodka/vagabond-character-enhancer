# Changelog

## v0.1.4

### New Features
- **Draconic Resilience (Draken ancestry):** Choose Acid, Cold, Fire, or Shock — take half damage from that type (applied after saves, before armor). Visible as an Active Effect on the character sheet with chat notifications on trigger. Re-pick via `game.vagabondCharacterEnhancer.setDraconicResilience(actor)`.
- **Imbue Spell Delivery:** Full automation of the Imbue delivery type. Casting a spell with Imbue skips d20/damage rolls, deducts mana, and opens a weapon selection dialog. On the next hit, imbued spell damage is rolled separately with the spell's damage type and its own Apply Direct button. Consumed on hit or miss. Works from both the character sheet and the Vagabond Crawler strip.
- **Exalt Per-Die Damage Bonus:** Exalt now correctly adds +1 per damage die (+2 vs Undead/Hellspawn) to weapon damage rolls. Triggers when focusing on Exalt (any delivery) or when receiving the Exalt aura buff. Will save bonus remains as an Active Effect.
- **Light Focus — Token Light Emission:** When the Light spell is focused, the caster's token emits 30' bright light with a warm golden torch animation. Light settings are saved and restored when focus drops. Persists across scene changes.

### Bug Fixes
- Fixed duplicate "Focusing" status effect when casting with Focus via the Vagabond Crawler.

## v0.1.3
- Brawl intent system (Grapple/Shove) for Brawl and Shield weapons
- Spell Surge cast-only filter fix
- Luminary postScan hook and icon fixes
- Luminary healing feature rewrites (Radiant Healer, Overheal, Ever-Cure)
