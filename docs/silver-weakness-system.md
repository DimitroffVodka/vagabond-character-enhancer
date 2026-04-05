# Silver/Metal Weakness System — Technical Documentation

## Problem Statement

The Vagabond system has a bug/gap where **metal-based weakness** (Silver, Cold Iron) doesn't work correctly for **typeless damage** (`damageType: "-"`). Most weapons in Vagabond have typeless damage. The system has three separate code paths for weakness detection, and only two of them check weapon metal — but they all skip typeless damage.

## System Code Paths (Read-Only — in `/systems/vagabond/`)

### 1. `_isWeakTo(targetActor, damageType, attackingWeapon)`
**Location:** `damage-helper.mjs:1229`
- Returns `false` immediately if `damageType === "-"` (typeless)
- Checks `attackingWeapon.system.metal` against `weaknesses` (for non-typeless)
- Checks `damageType` against `weaknesses`
- **Gap:** Never checks metal for typeless weapons

### 2. `rollWeaponDamage` / `rollDamageFromButton` (manual damage button)
**Location:** `damage-helper.mjs:347`
- Guard: `if (finalDamageTypeKey && finalDamageTypeKey !== '-')` — skips typeless entirely
- Calls `_isWeakTo()` and adds extra die to formula if weak
- Sets `weaknessPreRolled = true` on the roll
- **Gap:** Never runs for typeless damage

### 3. `handleApplyDirect` / `handleSaveRoll` (apply damage to target)
**Location:** `damage-helper.mjs:2430`
- Calls `_isWeakTo(targetActor, damageType, sourceItem)`
- If weak AND `!weaknessPreRolled`: rolls extra die silently and adds to damage
- Also bypasses armor via `calculateFinalDamage` (the system handles this for non-typeless)
- **For non-typeless:** Works correctly — `_isWeakTo` returns true for metal weakness, extra die added
- **For typeless:** `_isWeakTo` returns false, so no extra die and no armor bypass

### 4. `item.rollDamage()` (auto-roll damage)
**Location:** `documents/item.mjs:670`
- Called by character sheet auto-roll and Vagabond Crawler
- Builds damage formula from `currentDamage` + bonuses
- **Never checks weakness at all** — no `_isWeakTo` call, no extra die
- Returns a Roll object that gets passed to `weaponAttack` for the chat card

### 5. `calculateFinalDamage(actor, damage, damageType, attackingWeapon)`
**Location:** `damage-helper.mjs:1117`
- For typeless `"-"`: returns `Math.max(0, damage - armorRating)` immediately
- Metal weakness check comes AFTER the typeless early return — never reached
- **Gap:** No armor bypass for typeless + silver

## What Weapon Data Looks Like

```javascript
weapon.system.damageType      // Base type, often "-" (typeless)
weapon.system.currentDamageType // May be "piercing", "slashing", etc. (set by ammo or properties)
weapon.system.metal           // "none", "common", "silver", "cold_iron", etc.
weapon.system.currentDamage   // Formula like "d8", "2d6", etc.
```

**Important:** `currentDamageType` can differ from `damageType`. A weapon might have base `damageType: "-"` but `currentDamageType: "piercing"` from its ammunition or properties.

## Our Module's Fixes

### Fix 1: `calculateFinalDamage` — Armor Bypass for Typeless + Silver
**Location:** `vagabond-character-enhancer.mjs`, inside the `calculateFinalDamage` patch

**What it does:** After the system's `origCalcFinal` returns (which subtracted armor for typeless damage), checks if the weapon is silvered and the target is weak to silver. If so, restores `result = damage` (undoing the armor subtraction).

**Why:** The system's `calculateFinalDamage` returns early for typeless damage before reaching the metal weakness check. We add it back post-call.

```javascript
if (damageType === "-" && attackingWeapon?.system?.metal) {
  const weaponMetal = attackingWeapon.system.metal;
  const weaknesses = actor.system?.weaknesses || [];
  if (weaknesses.includes(weaponMetal)) {
    result = damage; // Bypass armor
  }
}
```

### Fix 2: `item.rollDamage()` Pre-Hook — Visible Extra Weakness Die
**Location:** `vagabond-character-enhancer.mjs`, inside the `rollDamage` patch

**What it does:** Before calling `origRollDamage`, checks if the weapon has a metal type and any targeted enemy is weak to it. If so, temporarily modifies `this.system.currentDamage` to append `+ 1d{dieSize}`. After the roll, restores the original formula and sets `damageRoll._weaknessPreRolled = true`.

**Why:** `item.rollDamage()` NEVER checks weakness (unlike `rollDamageFromButton`). Without this hook, the extra die wouldn't appear in the damage roll. The `_weaknessPreRolled` flag prevents `handleApplyDirect` from adding a SECOND silent die at apply time.

**Target detection:** Uses `this._vceAttackTargets` (stashed during `rollAttack` pre-hook) or falls back to `game.user.targets`. The stash is necessary because `game.user.targets` may be cleared by the time `rollDamage` fires after a hit.

```javascript
if (this.system?.metal && metal !== "none" && metal !== "common") {
  const targets = this._vceAttackTargets || Array.from(game.user.targets);
  const hasWeakTarget = targets.some(t =>
    t.actor?.system?.weaknesses?.includes(this.system.metal)
  );
  if (hasWeakTarget) {
    silverOrigDamage = this.system.currentDamage;
    this.system.currentDamage = `${formula} + 1d${dieSize}`;
  }
}
// ... after roll ...
if (silverOrigDamage !== undefined && damageRoll) {
  damageRoll._weaknessPreRolled = true; // Prevent double-add at apply time
}
```

### Fix 3: Target Stashing in `rollAttack`
**Location:** `vagabond-character-enhancer.mjs`, inside the `rollAttack` patch

**What it does:** Before calling `origRollAttack`, saves `Array.from(game.user.targets)` to `this._vceAttackTargets`. Cleaned up in the `rollDamage` finally block.

**Why:** `game.user.targets` may be empty by the time `rollDamage` is called (the system clears targets after the attack resolves on some code paths). Stashing ensures the targets are available for the silver weakness check in Fix 2.

## Code Paths Summary

### Character Sheet (Roll Damage With Check = OFF, manual button)
1. Player clicks weapon → `rollAttack()` → d20 roll → chat card with "Roll Damage" button
2. Player clicks "Roll Damage" → `rollDamageFromButton()` (patched by vagabond-crawler for relics)
3. System's code checks `finalDamageTypeKey !== '-'` → if weapon has `currentDamageType: "piercing"`, the system adds weakness die itself
4. `handleApplyDirect` checks `weaknessPreRolled` → skips extra die if already added
5. Our `calculateFinalDamage` fix handles armor bypass for typeless

### Character Sheet (Roll Damage With Check = ON, auto-roll)
1. Player clicks weapon → `rollAttack()` → stashes targets
2. System calls `item.rollDamage()` → our pre-hook adds silver die, sets `_weaknessPreRolled`
3. `weaponAttack()` creates chat card with `weaknessPreRolled: true`
4. `handleApplyDirect` sees `weaknessPreRolled` → skips extra die

### Vagabond Crawler
1. Crawler calls `item.rollAttack()` → stashes targets
2. Crawler calls `item.rollDamage()` → our pre-hook adds silver die, sets `_weaknessPreRolled`
3. Crawler calls `VagabondChatCard.weaponAttack()` → chat card with `weaknessPreRolled: true`
4. Same as above

## Bless Spell — Silvered Weapons

The Bless spell's "Weapons" mode sets `weapon.system.metal = "silver"` on equipped weapons. The original metal is saved in `flags.vagabond-character-enhancer.blessOrigMetal` and restored when:
- The Bless AE is deleted (via `deleteActiveEffect` hook)
- The token leaves the aura range (via `_removeAllBuffs`)
- The round changes and caster is not focusing (via `updateCombat` hook)

The aura manager stores the Bless mode (`blessMode: "allies"` or `"weapons"`) in the `activeAura` flag. The `_applyBuff` method reads this flag to determine whether to apply the d4 save buff or silver weapons when tokens enter the aura range.

## Important Gotchas

1. **vagabond-crawler patches `rollDamageFromButton`** via `relic-effects.mjs`. Any VCE patches to that function will be overwritten by the Crawler. Don't patch it.
2. **`_isWeakTo` should NOT be patched** for typeless damage. If patched, `handleApplyDirect` will add a silent extra die that can't be prevented (the system's own code path).
3. **`_weaknessPreRolled` flag** on the Roll object is critical. Without it, `handleApplyDirect` adds a second weakness die silently.
4. **`currentDamageType` vs `damageType`**: The system uses `currentDamageType` for the actual damage type shown in chat. A weapon can have `damageType: "-"` but `currentDamageType: "piercing"`.
5. **Target stashing**: Must happen in `rollAttack` because `game.user.targets` may be empty by the time `rollDamage` runs.
