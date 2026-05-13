/**
 * Feature Detector
 * Scans actor class/ancestry/perk items and sets flags + managed Active Effects.
 */

import { MODULE_ID, log } from "./utils.mjs";
import { cloneFor as catalogCloneFor } from "./active-effects-catalog.mjs";

// Import class registries — each class file owns all its feature definitions
import { BARBARIAN_REGISTRY } from "./class-features/barbarian.mjs";
import { ROGUE_REGISTRY } from "./class-features/rogue.mjs";
import { BARD_REGISTRY } from "./class-features/bard.mjs";
import { DANCER_REGISTRY } from "./class-features/dancer.mjs";
import { ALCHEMIST_REGISTRY } from "./class-features/alchemist.mjs";
import { FIGHTER_REGISTRY } from "./class-features/fighter.mjs";
import { VANGUARD_REGISTRY } from "./class-features/vanguard.mjs";
import { PUGILIST_REGISTRY } from "./class-features/pugilist.mjs";
import { HUNTER_REGISTRY } from "./class-features/hunter.mjs";
import { GUNSLINGER_REGISTRY } from "./class-features/gunslinger.mjs";
import { SORCERER_REGISTRY } from "./class-features/sorcerer.mjs";
import { WIZARD_REGISTRY } from "./class-features/wizard.mjs";
import { WITCH_REGISTRY } from "./class-features/witch.mjs";
import { DRUID_REGISTRY } from "./class-features/druid.mjs";
import { LUMINARY_REGISTRY } from "./class-features/luminary.mjs";
import { MAGUS_REGISTRY } from "./class-features/magus.mjs";
import { REVELATOR_REGISTRY } from "./class-features/revelator.mjs";
import { MERCHANT_REGISTRY } from "./class-features/merchant.mjs";
import { MONK_REGISTRY } from "./class-features/monk.mjs";
import { SUMMONER_REGISTRY } from "./class-features/summoner.mjs";
import { PSYCHIC_REGISTRY } from "./class-features/psychic.mjs";

// Import ancestry registries — each ancestry file owns all its trait definitions
import { HUMAN_TRAITS } from "./ancestry-features/human.mjs";
import { DWARF_TRAITS } from "./ancestry-features/dwarf.mjs";
import { ELF_TRAITS } from "./ancestry-features/elf.mjs";
import { HALFLING_TRAITS } from "./ancestry-features/halfling.mjs";
import { DRAKEN_TRAITS } from "./ancestry-features/draken.mjs";
import { GOBLIN_TRAITS } from "./ancestry-features/goblin.mjs";
import { ORC_TRAITS } from "./ancestry-features/orc.mjs";

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

/**
 * Combined registry of all class features.
 * Each class file exports its own registry, merged here via spread.
 * Keys are lowercase feature names matching the class compendium's levelFeatures.
 * The `effects` field (optional) defines managed Active Effects to create.
 *
 * NOTE: Some feature names collide across classes (e.g. "evasive" exists in
 * both Dancer and Rogue). The flat spread below means the last entry wins.
 * To handle collisions, _CLASS_FEATURE_MULTI maps each name to an array of
 * all entries, and _lookupFeature picks the one matching the actor's class.
 */
const _CLASS_REGISTRIES = [
  BARBARIAN_REGISTRY, ROGUE_REGISTRY, BARD_REGISTRY, DANCER_REGISTRY,
  ALCHEMIST_REGISTRY, FIGHTER_REGISTRY, VANGUARD_REGISTRY, PUGILIST_REGISTRY,
  HUNTER_REGISTRY, GUNSLINGER_REGISTRY, SORCERER_REGISTRY, WIZARD_REGISTRY,
  WITCH_REGISTRY, DRUID_REGISTRY, LUMINARY_REGISTRY, MAGUS_REGISTRY,
  REVELATOR_REGISTRY, MERCHANT_REGISTRY, MONK_REGISTRY, SUMMONER_REGISTRY,
  PSYCHIC_REGISTRY
];

// Flat registry (last-wins) — still used for managed AE sync and legacy lookups
const CLASS_FEATURE_REGISTRY = Object.assign({}, ..._CLASS_REGISTRIES);

// Multi-map: featureName → [entry, entry, ...] — handles name collisions
const _CLASS_FEATURE_MULTI = {};
for (const registry of _CLASS_REGISTRIES) {
  for (const [name, entry] of Object.entries(registry)) {
    if (!_CLASS_FEATURE_MULTI[name]) _CLASS_FEATURE_MULTI[name] = [];
    _CLASS_FEATURE_MULTI[name].push(entry);
  }
}

/**
 * Look up a feature by name, preferring the entry whose `class` matches className.
 * Falls back to the first entry if no class match (shouldn't happen normally).
 */
function _lookupFeature(featureName, className) {
  const entries = _CLASS_FEATURE_MULTI[featureName];
  if (!entries || entries.length === 0) return null;
  if (entries.length === 1) return entries[0];
  // Multiple entries — pick the one matching the actor's class
  const classMatch = entries.find(e => e.class === className);
  return classMatch || entries[0];
}

// Import perk registry
import { PERK_REGISTRY } from "./perk-features.mjs";

/**
 * Combined registry of all ancestry traits.
 * Each ancestry file exports its own registry, merged here via spread.
 *
 * NOTE: Some trait names collide across ancestries (e.g. "darksight" exists
 * in Dwarf, Goblin, and Orc; "nimble" exists in Goblin and Halfling).
 * The flat spread below would mean the last entry wins, masking the others.
 * To handle collisions, _ANCESTRY_TRAIT_MULTI maps each name to an array of
 * all entries; the scan loop walks all entries and picks those whose
 * `ancestry` matches the owning item's ancestry name.
 */
const _ANCESTRY_REGISTRIES = [
  HUMAN_TRAITS, DWARF_TRAITS, ELF_TRAITS, HALFLING_TRAITS,
  DRAKEN_TRAITS, GOBLIN_TRAITS, ORC_TRAITS
];

// Flat registry (last-wins) — kept for backwards compatibility / debug lookups
const ANCESTRY_TRAIT_REGISTRY = Object.assign({}, ..._ANCESTRY_REGISTRIES);

// Multi-map: traitName → [entry, entry, ...] — handles name collisions
const _ANCESTRY_TRAIT_MULTI = {};
for (const registry of _ANCESTRY_REGISTRIES) {
  for (const [name, entry] of Object.entries(registry)) {
    if (!_ANCESTRY_TRAIT_MULTI[name]) _ANCESTRY_TRAIT_MULTI[name] = [];
    _ANCESTRY_TRAIT_MULTI[name].push(entry);
  }
}

/**
 * Combined registry of all perk features.
 */
const PERK_FEATURE_REGISTRY = PERK_REGISTRY;

/* -------------------------------------------- */
/*  Effect Resolution                            */
/* -------------------------------------------- */

/**
 * Resolve a registry feature definition's effects into the actor-bound
 * shape the feature-detector apply pipeline expects, and merge them into
 * the `desiredEffects` map keyed by `${featureFlag}_${name}`.
 *
 * A feature def can declare effects in two ways:
 *   - `effects: [{ label, icon, changes, ... }]` — inline. Legacy shape.
 *   - `canonicalIds: ["bless-aura", "rage-dr-1"]` — references to entries
 *      in the VCE Active Effects Catalog. The catalog holds the canonical
 *      definitions; we clone here and merge with managed-flag metadata.
 *
 * Both shapes are honored; defs may use either or both. The effectKey
 * format `${flag}_${name}` is preserved across the two paths so the
 * feature-detector's existing diff-and-create loop matches old managed
 * AEs against the same key after a catalog migration — no recreate
 * needed if the catalog entry's `name` matches the old `label`.
 */
async function _collectFeatureEffects(featureDef, desiredEffects, classUuid) {
  const managedFlags = (label) => ({
    [MODULE_ID]: {
      managed: true,
      featureFlag: featureDef.flag,
      effectKey: `${featureDef.flag}_${label}`,
    },
  });
  const originForDef = classUuid || `${MODULE_ID}.${featureDef.flag}`;

  // Inline effects (legacy shape) — preserved verbatim.
  if (Array.isArray(featureDef.effects)) {
    for (const effectDef of featureDef.effects) {
      const key = `${featureDef.flag}_${effectDef.label}`;
      desiredEffects.set(key, {
        ...effectDef,
        origin: originForDef,
        flags: managedFlags(effectDef.label),
      });
    }
  }

  // Catalog references — clone from the VCE Active Effects Catalog and
  // merge with management metadata. The catalog entry's `name` is used
  // as the label for effectKey so a migration from inline→canonicalId
  // keeps the same key (no AE recreate on next scan).
  if (Array.isArray(featureDef.canonicalIds)) {
    for (const canonicalId of featureDef.canonicalIds) {
      const data = await catalogCloneFor(canonicalId);
      if (!data) {
        log("FeatureDetector", `Catalog entry "${canonicalId}" missing for ${featureDef.flag}; skipping`);
        continue;
      }
      // The cloned data carries the catalog's flags; merge in management metadata.
      const label = data.name;
      const key = `${featureDef.flag}_${label}`;
      desiredEffects.set(key, {
        // Translate catalog field names to the inline-effect shape that
        // the rest of the apply pipeline expects.
        label,
        icon: data.img,
        changes: data.changes ?? [],
        statuses: data.statuses ?? [],
        description: data.description ?? "",
        ...data, // keep all other fields (img, name, etc.)
        origin: originForDef,
        flags: foundry.utils.mergeObject(data.flags ?? {}, managedFlags(label), { inplace: false }),
      });
    }
  }
}

/* -------------------------------------------- */
/*  Psychic Talent pick-on-detect               */
/* -------------------------------------------- */

/**
 * Defensive backfill: copies causedStatuses / critCausedStatuses /
 * damageDieSize from each Talent's source spell onto the embedded talent
 * item, so the system's status-application path can read them.
 *
 * Why this exists: Talent items can end up with empty status data in two
 * cases:
 *   1. They were created on the actor BEFORE the schema extension landed
 *      (schema gained the fields later — old embedded items don't have
 *      them populated).
 *   2. The compendium migration ran before Foundry F5'd, so writes were
 *      against an old schema and got silently stripped.
 *
 * Idempotent: only updates talents where aliasOf is set AND causedStatuses
 * is currently empty.
 *
 * @param {Actor} actor
 */
async function _backfillTalentStatusData(actor) {
  const TALENT_TYPE = `${MODULE_ID}.talent`;
  const stale = actor.items.filter(i =>
    i.type === TALENT_TYPE
    && (i.system.aliasOf ?? "").trim() !== ""
    && !(i.system.causedStatuses?.length > 0)
  );
  if (stale.length === 0) return;

  const spellPack = game.packs.get("vagabond.spells");
  if (!spellPack) return;
  const sourceSpells = await spellPack.getDocuments();

  for (const t of stale) {
    const aliasName = t.system.aliasOf.trim().toLowerCase();
    const src = sourceSpells.find(s => s.name.toLowerCase() === aliasName);
    if (!src) continue;
    const cs  = foundry.utils.deepClone(src.system.causedStatuses ?? []);
    const ccs = foundry.utils.deepClone(src.system.critCausedStatuses ?? []);
    // Only write if the source actually has data — avoids no-op writes
    // for talents whose source spell carries no statuses (e.g., Levitate).
    if (cs.length === 0 && ccs.length === 0 && src.system.damageDieSize == null) continue;
    await t.update({
      "system.causedStatuses":     cs,
      "system.critCausedStatuses": ccs,
      "system.damageDieSize":      src.system.damageDieSize ?? null,
    });
    log("TalentBackfill", `Backfilled status data for ${t.name} on ${actor.name} from ${src.name}`);
  }
}

/**
 * Run defensive backfill on a Psychic actor's Talent items. Players pick
 * their Talents directly from the Talents tab (right-click to toggle), so
 * there's no auto-firing dialog to gate — but we still want the backfill
 * to run on scan so old talents get their status data populated.
 *
 * @param {Actor} actor
 */
async function _ensurePsychicTalentBackfill(actor) {
  if (!game.user.isGM) return;
  const psychic = actor.items.find(i => i.type === "class" && i.name === "Psychic");
  if (!psychic) return;
  await _backfillTalentStatusData(actor);
}

/* -------------------------------------------- */
/*  Feature Detector Singleton                  */
/* -------------------------------------------- */

export const FeatureDetector = {
  _debounceTimers: new Map(),


  /**
   * Register all hooks for automatic feature detection.
   */
  registerHooks() {
    // Rescan when items are added/removed
    Hooks.on("createItem", (item) => {
      if (["class", "ancestry", "perk", "spell"].includes(item.type) && item.actor) {
        this._debounceScan(item.actor);
      }
    });

    Hooks.on("deleteItem", (item) => {
      if (["class", "ancestry", "perk", "spell"].includes(item.type) && item.actor) {
        this._debounceScan(item.actor);
      }
    });

    // Rescan when items are updated (e.g., feature name changes)
    Hooks.on("updateItem", (item, changes) => {
      if (["class", "ancestry", "perk", "spell"].includes(item.type) && item.actor) {
        this._debounceScan(item.actor);
      }
    });

    // Rescan when actor level changes
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type === "character" && changes.system?.attributes?.level) {
        this._debounceScan(actor);
      }
    });

    log("FeatureDetector","Hooks registered.");
  },

  /**
   * Debounce scan to avoid multiple rapid rescans.
   */
  _debounceScan(actor) {
    if (this._debounceTimers.has(actor.id)) {
      clearTimeout(this._debounceTimers.get(actor.id));
    }
    this._debounceTimers.set(actor.id, setTimeout(() => {
      this._debounceTimers.delete(actor.id);
      this.scan(actor);
    }, 100));
  },

  /**
   * Scan all character actors in the world.
   */
  async scanAll() {
    if (!game.user.isGM) return;
    const characters = game.actors.filter(a => a.type === "character");
    log("FeatureDetector",`Scanning ${characters.length} characters...`);
    for (const actor of characters) {
      await this.scan(actor);
    }
  },

  /**
   * Scan a single actor and update flags + managed effects.
   */
  async scan(actor) {
    if (!actor || actor.type !== "character") return;
    if (!game.user.isGM) return;

    if (!game.settings.get(MODULE_ID, "enableClassFeatures")) return;

    const features = {};
    const level = actor.system.attributes?.level?.value ?? 1;

    // --- Scan class items ---
    // Also store UUID so managed AEs can reference the class item as their origin/source
    for (const item of actor.items.filter(i => i.type === "class")) {
      const className = item.name.toLowerCase().trim();
      features._className = item.name;
      features._classLevel = level;
      features._classUuid = item.uuid;

      // Scan levelFeatures
      const levelFeatures = item.system.levelFeatures ?? [];
      for (const feature of levelFeatures) {
        if (feature.level > level) continue;
        const featureName = feature.name.toLowerCase().trim();
        const registered = _lookupFeature(featureName, className);
        if (registered) {
          features[registered.flag] = true;
          log("FeatureDetector",`Detected: ${feature.name} (${registered.class}) on ${actor.name}`);
        }
      }
    }

    // --- Scan ancestry items ---
    for (const item of actor.items.filter(i => i.type === "ancestry")) {
      const ancestryName = item.name.toLowerCase().trim();
      features._ancestryName = item.name;

      // Match traits by ancestry name — each trait's `ancestry` field
      // tells us which ancestry it belongs to. Iterate the MULTI map so every
      // ancestry's version of a name-collided trait is considered (e.g. "darksight"
      // is registered by Dwarf, Goblin, AND Orc; the flat registry would last-wins).
      for (const [traitName, entries] of Object.entries(_ANCESTRY_TRAIT_MULTI)) {
        for (const traitDef of entries) {
          if (traitDef.ancestry === ancestryName) {
            features[traitDef.flag] = true;
            log("FeatureDetector",`Detected trait: ${traitName} (${traitDef.ancestry}) on ${actor.name}`);
          }
        }
      }
    }

    // --- Scan perk items ---
    if (game.settings.get(MODULE_ID, "enablePerkFeatures")) {
      for (const item of actor.items.filter(i => i.type === "perk")) {
        const perkName = item.name.toLowerCase().trim();
        const registered = PERK_FEATURE_REGISTRY[perkName];
        if (registered) {
          features[registered.flag] = true;
          log("FeatureDetector",`Detected perk: ${item.name} on ${actor.name}`);
        }
      }
    }

    // --- Scan spell items for automation-relevant spells ---
    for (const item of actor.items.filter(i => i.type === "spell")) {
      if (item.name.toLowerCase().trim() === "polymorph") {
        features.has_polymorph = true;
        log("FeatureDetector", `Detected Polymorph spell on ${actor.name}`);
        break;
      }
    }

    // --- Update flags (skip write if nothing changed) ---
    // IMPORTANT: unsetFlag + setFlag instead of just setFlag, because setFlag
    // deep-merges and would preserve stale flags (e.g. a level 8 feature flag
    // lingering after the actor drops back to level 3).
    const oldFeatures = actor.getFlag(MODULE_ID, "features") ?? {};
    const changed = JSON.stringify(oldFeatures) !== JSON.stringify(features);
    if (changed) {
      await actor.unsetFlag(MODULE_ID, "features");
      await actor.setFlag(MODULE_ID, "features", features);
    }

    // --- Always sync managed Active Effects ---
    // Run even when features haven't changed, because new AE definitions
    // (e.g., perk effects added in a module update) need to be created for
    // actors whose feature flags were already set in a previous scan.
    await this._syncManagedEffects(actor, features, oldFeatures);

    // Always fire postScan so modules can sync item-level data (e.g., spell explosion)
    Hooks.callAll(`${MODULE_ID}.postScan`, actor, features);

    // --- Psychic: backfill Talent status data on owned talents ---
    // Runs after flags/effects are committed so the Psychic class is fully detected.
    await _ensurePsychicTalentBackfill(actor);

    log("FeatureDetector",`Scan complete for ${actor.name}:`, features);
  },

  /**
   * Create/remove managed Active Effects based on detected features.
   */
  async _syncManagedEffects(actor, features, oldFeatures) {
    const existingManaged = actor.effects.filter(e => e.getFlag(MODULE_ID, "managed"));

    // Build set of effects that SHOULD exist
    const desiredEffects = new Map();

    // Use the class item's UUID as origin so the effects panel shows the class name as "Source"
    const classUuid = features._classUuid || null;

    // Check class feature registry — iterate the MULTI map so every class's
    // version of a name-collided feature is considered. The flat registry
    // would last-wins-overwrite, e.g. Monk's "fleet of foot" (no effects)
    // would mask Dancer's "fleet of foot" (Reflex crit AE).
    for (const [featureName, entries] of Object.entries(_CLASS_FEATURE_MULTI)) {
      for (const featureDef of entries) {
        if (!features[featureDef.flag]) continue;
        await _collectFeatureEffects(featureDef, desiredEffects, classUuid);
      }
    }

    // Check perk feature registry
    for (const [perkName, perkDef] of Object.entries(PERK_FEATURE_REGISTRY)) {
      if (!features[perkDef.flag]) continue;
      await _collectFeatureEffects(perkDef, desiredEffects, null);
    }

    // Allow class feature modules to dynamically modify effect definitions
    // (e.g., Valor scaling crit bonus with level, Deep Pockets scaling slots)
    Hooks.callAll(`${MODULE_ID}.preSyncEffects`, actor, desiredEffects);

    // Remove effects that should no longer exist OR have stale definitions.
    //
    // Stale-definition handling (added 2026-05-13 — Codex review P1):
    // Previously this filter only removed effects whose key was absent from
    // desiredEffects. If the catalog's `changes` array for an effect was
    // updated in a release (e.g., the Mental Fortress mode-4 → mode-2 fix),
    // existing actors kept the broken AE forever because the create loop
    // below skips any key already present. We now also remove existing AEs
    // whose `changes` (or `disabled`) diverge from the desired definition,
    // so the create pass rebuilds them fresh with the current spec.
    const toDelete = existingManaged.filter(e => {
      const key = e.getFlag(MODULE_ID, "effectKey");
      if (!desiredEffects.has(key)) return true;
      const desired = desiredEffects.get(key);
      return _existingDivergesFromDesired(e, desired);
    });

    if (toDelete.length > 0) {
      log("FeatureDetector",`Removing ${toDelete.length} managed effects from ${actor.name}`);
      await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete.map(e => e.id));
    }

    // Create effects that don't exist yet. Any AE we just removed for being
    // stale will be regenerated here with current spec.
    const survivingKeys = new Set(
      existingManaged
        .filter(e => !toDelete.includes(e))
        .map(e => e.getFlag(MODULE_ID, "effectKey"))
    );
    const toCreate = [];

    for (const [key, effectDef] of desiredEffects) {
      if (survivingKeys.has(key)) continue;
      toCreate.push({
        name: effectDef.label,
        icon: effectDef.icon,
        origin: effectDef.origin,
        flags: effectDef.flags,
        changes: effectDef.changes,
        disabled: effectDef.disabled ?? false,
        transfer: true
      });
    }

    if (toCreate.length > 0) {
      log("FeatureDetector",`Creating ${toCreate.length} managed effects on ${actor.name}:`, toCreate.map(e => e.name));
      await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
    }
  }
};

/**
 * Detect divergence between an existing managed AE on an actor and the desired
 * definition built from the current registry/catalog. Used so catalog-level
 * fixes (e.g., a mode value, an added/removed change entry, a disabled flag)
 * reach actors whose AE was installed by a prior version of the module.
 *
 * Returns `true` if the existing AE should be recreated.
 *
 * Compares:
 *  - `disabled`            (boolean equality)
 *  - `changes` array       (length + entry-wise key/normalized-mode/value)
 *
 * NOT compared:
 *  - `name` / `icon`       — cosmetic, would churn AEs on every rename
 *  - `origin`              — varies by class item uuid which is per-actor
 *  - flag bag              — `effectKey` already matched; other flags are
 *                            book-keeping and can drift safely.
 *  - `phase` / `priority`  — system-internal scheduling, not user-meaningful
 *
 * CRITICAL: the Vagabond system uses a custom AE schema where each change
 * entry has `type: "add"` (string), NOT the Foundry-default `mode: 2`
 * (number). When the catalog/registry writes `{ mode: 2 }` and the system
 * persists it, the stored shape becomes `{ type: "add" }` — `mode` is
 * undefined post-conversion. We MUST normalize both sides before
 * comparing, or every rescan would think every AE has diverged and
 * delete/recreate every managed AE on every actor every time.
 */
const _MODE_TO_TYPE = ["custom", "multiply", "add", "downgrade", "upgrade", "override"];

function _normalizeChangeMode(change) {
  // System-stored shape carries `type`; pre-persist catalog shape carries `mode`.
  if (typeof change?.type === "string") return change.type.toLowerCase();
  const m = Number(change?.mode);
  if (Number.isInteger(m) && m >= 0 && m < _MODE_TO_TYPE.length) {
    return _MODE_TO_TYPE[m];
  }
  return null;
}

function _existingDivergesFromDesired(existingAE, desired) {
  if ((existingAE.disabled ?? false) !== (desired.disabled ?? false)) return true;
  const existing = existingAE.changes ?? [];
  const desiredChanges = desired.changes ?? [];
  if (existing.length !== desiredChanges.length) return true;
  for (let i = 0; i < desiredChanges.length; i++) {
    const a = existing[i] ?? {};
    const b = desiredChanges[i] ?? {};
    if (a.key !== b.key) return true;
    if (_normalizeChangeMode(a) !== _normalizeChangeMode(b)) return true;
    if (String(a.value ?? "") !== String(b.value ?? "")) return true;
  }
  return false;
}
