# VCE Documentation Index

Reference docs for the Vagabond Character Enhancer module, organized by purpose. The authoritative project context for new contributors is [CLAUDE.md](../CLAUDE.md) at the repo root.

## Reference catalogs

These are the canonical lookup tables for each domain — automation status, RAW mechanics, and per-entry implementation notes. **Read the relevant catalog before working on features in that domain.**

- [classes.md](classes.md) — All 20 classes with feature lists, status flags, and per-level breakdown.
- [perks.md](perks.md) — All 104 perks with automation status, descriptions, and implementation notes.
- [spells.md](spells.md) — All 59 spells with automation status, damage types, and implementation notes.
- [ancestries.md](ancestries.md) — All 7 ancestries with trait registries.

## Subsystem references

Deep dives into the more complex automation surfaces. Each one corresponds to a discrete set of modules under `scripts/`.

- [companions.md](companions.md) — Unified v0.4.0 companion engine (summons, familiars, raised undead, animated objects, hirelings). Architecture, source registry, dismiss handlers.
- [feature-fx-system.md](feature-fx-system.md) — Configurable Sequencer/JB2A animations for class features, monster attacks, and status effects.
- [magic-system-rules.md](magic-system-rules.md) — Vagabond magic system RAW reference (delivery types, damage/effect, focus rules) consolidated from the rulebook and designer errata.
- [silver-weakness-system.md](silver-weakness-system.md) — Silver/metal weakness damage system, including the Bless Silvered Weapons interaction.
- [aura-manager-crawler-port.md](aura-manager-crawler-port.md) — Notes from the AuraManager rewrite when extracting the persistent-template logic from per-class implementations.

## Process & operations

- [smoke-test.md](smoke-test.md) — How the manual smoke harness works, what each Tier asserts, and how to run it from `game.vagabondCharacterEnhancer.smokeTest`.
- [design-system.md](design-system.md) — UI tokens, color palette, and Handlebars template conventions for any UI work.
- [other-automation.md](other-automation.md) — Cross-cutting automation that doesn't fit a class/perk/spell bucket (range validator, status effects, focus tracking).

## superpowers/ — design specs and plans

Working specs and implementation plans for ongoing work, kept under `docs/superpowers/`. See `docs/superpowers/specs/` for design contracts and `docs/superpowers/plans/` for executable implementation plans.
