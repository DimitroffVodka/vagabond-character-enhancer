# Spell Automation

Spells in the Vagabond system have no built-in Active Effects. VCE automates select spells via runtime hooks, chat-card buttons, and the unified [Companion System](companions.md) for spells that summon creatures.

> Full reference with all 59 spells: [`spell-automation-reference.md`](spell-automation-reference.md)

See the [README's status legend](../README.md#status-legend) for icon meanings.

---

## Currently Automated Spells

| Spell      | What It Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Bless      | Full aura system — d4 save bonus AE on allies, silvered weapons, mode buttons in chat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Exalt      | +1 per damage die (+2 vs Undead/Hellspawn), counts all dice including silver/imbue bonus dice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Imbue      | RAW delivery: 1 Mana of cost is deferred to on-hit (auto-deducted from caster's pool); imbue persists as a standing buff until end of round (or longer if Focused, free sustain). Spell damage dice added to weapon formula on the cast round only — sustained imbues deliver Effect only. Spell's Effect (Burning, Charmed, etc.) applied on Apply via `causedStatuses` injection. Damage routes through Roll Damage button so vagabond-crawler relic bonuses (Strike, Bane, Vicious) compose. Out-of-combat casts require Focus. Friendly-target resolves wielder (self, ally, multi-target with picker).                                                                                                                                                                                                                                  |
| Polymorph  | Beast Form tab on the character sheet, stat swap, token swap, beast action rolls, mana drain per round. 72 modified beasts in a built-in compendium. Works for any caster with the Polymorph spell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Ward       | +1 Armor AE applied to target. On incoming damage, intercepts via `vagabond.preDamageApply` (v5.3.0+) and opens a Cast Check dialog BEFORE damage lands; on success, reduces damage by Nd6 (1 + extra Mana spent), crit negates entirely. Damage chat card shows the already-reduced amount — no death-revive race.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Companion-Spawning Spells

These spells summon creatures via the unified [Companion System](companions.md):

- **Beast** — Conjure a beast for combat
- **Animate** — Animate an inventory item as a creature
- **Raise** — Reanimate a defeated corpse as undead
- **Polymorph** — (Druid Beast Form, also a companion-style summon)

For the remaining 54 spells (📝 Flavor and 🔲 Todo), see the [full reference](spell-automation-reference.md).

---

## Imbue — Detailed Behavior

Imbue is the most complex spell automation in the module — it took a full RAW rewrite in v0.4.13 to faithfully match the rulebook entry. Quick reference:

### Mana Timing

- **Cast time**: Charge `damage + effect` mana only (`totalCost - 1`).
- **On hit**: Caster's pool auto-deducts the deferred 1 Mana → spell rides along.
- **Caster ≠ wielder**: 1 Mana comes from the **caster's** pool, GM-routed via socket relay.

### Duration

- **In combat**: Imbue AE expires at end of cast round unless caster is focusing on the spell.
- **Out of combat**: Cast aborts unless caster is already focusing on the spell at cast time.
- **Sustained past cast round**: Damage portion is gone (per "Focus sustains the Effect; damage is Instant"); only the spell's Effect carries forward.

### On-Hit Outcomes

| Caster state             | Behavior                                                                                                                                |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| Alive, conscious, ≥1 mana | 1 Mana deducted, spell rides along. Damage dice + Effect both delivered (cast round) or Effect only (sustained round).                  |
| 0 mana / unconscious / dead | Delivery skips with chat note. Weapon does plain damage. Imbue stays on the weapon for the next attack.                              |

### Manual End

- Player deletes the imbue AE on the wielder, OR
- Caster drops focus on the spell → all imbues from that cast cascade-clear past their round window.

### Cross-Module Composition

Imbue dice are appended to the Roll Damage button's `data-damage-formula` rather than auto-rolled inline. This routes through `rollDamageFromButton`, which is where vagabond-crawler's relic engine injects relic dice. Final roll formula is `weapon + imbue + relic`, all in one roll.

---

## Cast-Time Rules

### Focus + Effect Coupling

Per Vagabond core rules, Focus sustains a spell's Effect; the damage portion is Instant. So Focus on a cast with `Include Effect` toggled off is invalid — there's nothing to sustain. The cast is blocked at `SpellHandler.castSpell` (and `CrawlerSpellDialog._cast`) with a notification asking the player to either turn Effect on or unfocus the spell.
