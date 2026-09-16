/**
 * System Contract — drift canary
 *
 * Every other test in this suite asks "does my feature behave correctly?".
 * These two ask "is the ground still there?".
 *
 * VCE works by monkey-patching system methods and by writing Active Effects at
 * specific `system.*` paths. Neither of those is a stable public API — the
 * Vagabond system can rename or delete any of it in a point release. When that
 * happens the failure is SILENT: a patch installed onto a method nobody calls
 * any more, or an AE writing to a field that no longer exists, does nothing at
 * all and throws nothing. The rest of the suite can stay green while half the
 * module quietly stops working.
 *
 * That is exactly what a big system jump does. These tests turn a "why did my
 * module stop working three months ago" archaeology session into a named
 * failure that takes seconds.
 *
 * Written after the system moved 5.8.0 → 5.36.0 (121 commits) with no
 * changelog. Nothing had actually broken — but the only way to find that out
 * was to probe all of it by hand.
 */

import { MODULE_ID } from "../../../utils.mjs";

/* -------------------------------------------- */
/*  1. Monkey-patch targets                     */
/* -------------------------------------------- */

/**
 * Every system method VCE REPLACES, reachable by importing a system module.
 *
 * MAINTENANCE: when you add a monkey-patch anywhere in the module, add it here.
 * This list is the explicit contract between VCE and the system — if it drifts
 * out of date the canary still passes, it just guards less. Regenerate with a
 * CLASS-AGNOSTIC scan; an earlier version of this list was built by grepping
 * for known system class names and therefore silently missed every patch
 * applied to a class resolved at runtime (see CONFIG_PATCH_TARGETS below):
 *
 *   grep -rhoE '[A-Za-z_][A-Za-z0-9_]*\.prototype\.[A-Za-z_][A-Za-z0-9_]*\s*=[^=]' scripts
 *   grep -rhoE '\b[A-Z][A-Za-z0-9_]*\.[a-zA-Z_][A-Za-z0-9_]*\s*=[^=]' scripts
 */
const PATCH_TARGETS = [
  ["documents/item.mjs",                  "VagabondItem",         "prototype.roll"],
  ["documents/item.mjs",                  "VagabondItem",         "prototype.rollAttack"],
  ["documents/item.mjs",                  "VagabondItem",         "prototype.rollDamage"],

  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "calculateFinalDamage"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "calculateFinalDamageDetailed"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "_rollSave"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "handleSaveRoll"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "handleSaveReminderRoll"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "handleApplyDirect"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "handleApplyRestorative"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "handleApplySaveDamage"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "shouldRollDamage"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "_removeHighestDie"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "_getDamageSourceDieSize"],
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "_shouldDoublePerDieBonus"],

  ["helpers/status-helper.mjs",           "StatusHelper",         "processCausedStatuses"],

  ["helpers/roll-builder.mjs",            "VagabondRollBuilder",  "buildAndEvaluateD20"],
  ["helpers/roll-builder.mjs",            "VagabondRollBuilder",  "buildAndEvaluateD20WithRollData"],
  ["helpers/roll-builder.mjs",            "VagabondRollBuilder",  "buildAndEvaluateD20WithConditionalHinder"],
  ["helpers/roll-builder.mjs",            "VagabondRollBuilder",  "buildD20Formula"],
  ["helpers/roll-builder.mjs",            "VagabondRollBuilder",  "evaluateRoll"],
  ["helpers/roll-builder.mjs",            "VagabondRollBuilder",  "calculateCritThreshold"],

  ["helpers/chat-card.mjs",               "VagabondChatCard",     "npcAction"],

  ["sheets/handlers/roll-handler.mjs",    "RollHandler",          "prototype.roll"],
  ["sheets/handlers/roll-handler.mjs",    "RollHandler",          "prototype.rollWeapon"],

  ["helpers/target-helper.mjs",           "TargetHelper",         "captureCurrentTargets"],

  ["sheets/handlers/spell-handler.mjs",   "SpellHandler",         "prototype._executeCast"],
  ["sheets/handlers/spell-handler.mjs",   "SpellHandler",         "prototype._calculateSpellCost"],
  ["sheets/handlers/spell-handler.mjs",   "SpellHandler",         "prototype.toggleSpellFocus"],
];

/**
 * Patches applied to classes VCE resolves at RUNTIME rather than by import —
 * data models and region behaviours come off CONFIG, so no `import` reaches
 * them. These were invisible to the original class-name-based scan and were
 * therefore entirely unguarded, including the character data model, which
 * every derived stat flows through.
 *
 * Each entry is [label, resolver, methodPath].
 */
const CONFIG_PATCH_TARGETS = [
  ["CONFIG.Actor.dataModels.character",
    () => CONFIG.Actor?.dataModels?.character, "prototype.prepareDerivedData"],
  ["CONFIG.RegionBehavior.dataModels.modifyMovementCost",
    () => CONFIG.RegionBehavior?.dataModels?.modifyMovementCost, "prototype._getTerrainEffects"],
];

/**
 * System methods VCE CALLS but never replaces. Their disappearance breaks us
 * exactly as hard as a patched method's would, but they are not patches — the
 * previous version of this list conflated the two and so overstated how many
 * methods VCE actually monkey-patches.
 */
const DEPENDENCIES = [
  // Read by the spell path — see the "Spell Damage Path" note in CLAUDE.md.
  ["helpers/damage-helper.mjs",           "VagabondDamageHelper", "rollSpellDamage"],
  ["helpers/chat-card.mjs",               "VagabondChatCard",     "spellCast"],
  ["helpers/roll-builder.mjs",            "VagabondRollBuilder",  "calculateCritThreshold"],
  ["sheets/handlers/spell-handler.mjs",   "SpellHandler",         "prototype.castSpell"],
  // Imbue cost authority — called from the _executeCast patch.
  ["applications/spell-cast-dialog.mjs",  "SpellCastDialog",      "calculateCosts"],
];

/* -------------------------------------------- */
/*  2. Active Effect field paths                */
/* -------------------------------------------- */

/**
 * Paths written imperatively rather than declared in the catalog — polymorph's
 * stat overlay, the undead template, aura buffs. A deep walk can't reach these
 * because the `changes` arrays are built at runtime from live actor data.
 *
 * This list only ever UNDER-covers: a stale entry can't cause a false failure,
 * it just stops guarding something. Regenerate with:
 *
 *   grep -rhoE 'key:\s*"system\.[^"]+"' scripts | sort -u
 */
const IMPERATIVE_AE_PATHS = [
  "system.beingType",
  "system.senses",
  "system.speed",
  "system.speed.bonus",
  "system.health.bonus",
  "system.immunities",
  "system.weaknesses",
  "system.inventory.bonusSlots",
  "system.universalDamageBonus",
  "system.bonusPerDamageDie",
  "system.bonusPerDamageDieDoubleVsBeingTypes",
  "system.incomingAttacksModifier",
  "system.incomingHealingModifier",
  "system.outgoingSavesModifier",
  "system.meleeDamageDieSizeBonus",
  "system.rangedDamageDieSizeBonus",
  "system.rangedCritBonus",
  "system.finesseCritBonus",
  "system.favorHinder",
  "system.bonuses.globalExplode",
];

/**
 * Every `system.*` AE key VCE can write.
 *
 * Derived from the Active Effects catalog and the feature registries rather
 * than hardcoded, so features added later are covered for free — a hardcoded
 * list would rot exactly the way `dialogv2.imbue-weapon-picker-button-fires`
 * did. The imperative paths above are unioned in.
 *
 * @returns {Promise<Map<string,string>>} key → where it came from
 */
async function _collectAEKeys() {
  const keys = new Map();

  const walk = (node, origin) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, origin)); return; }
    if (typeof node.key === "string" && node.key.startsWith("system.") && !keys.has(node.key)) {
      keys.set(node.key, origin);
    }
    for (const v of Object.values(node)) walk(v, origin);
  };

  // 1. The catalog — canonical home for managed AE definitions since v0.5.x.
  try {
    const { CATALOG } = await import("../../../active-effects-catalog.mjs");
    for (const entry of CATALOG ?? []) walk(entry, `catalog:${entry?.canonicalId ?? "?"}`);
  } catch (e) {
    keys.set("__catalogImportFailed", e.message);
  }

  // 2. Registries — most now defer to the catalog and carry `effects: []`, but
  //    walk them anyway so any entry still declaring inline changes is covered.
  const registryModules = await Promise.all([
    "barbarian", "rogue", "bard", "dancer", "alchemist", "fighter", "vanguard",
    "pugilist", "hunter", "gunslinger", "sorcerer", "wizard", "witch", "druid",
    "luminary", "magus", "revelator", "merchant",
  ].map(n => import(`../../../class-features/${n}.mjs`).catch(() => null)));
  registryModules.push(await import("../../../perk-features.mjs").catch(() => null));

  for (const mod of registryModules) {
    if (!mod) continue;
    for (const [exportName, registry] of Object.entries(mod)) {
      if (!exportName.endsWith("_REGISTRY")) continue;
      for (const [featureName, entry] of Object.entries(registry ?? {})) {
        walk(entry?.effects, `${exportName}:${featureName}`);
      }
    }
  }

  // 3. Imperative paths.
  for (const k of IMPERATIVE_AE_PATHS) if (!keys.has(k)) keys.set(k, "imperative");

  return keys;
}

/**
 * Resolve a list of [file, exportName, methodPath] against the system's
 * modules. Returns human-readable descriptions of whatever didn't resolve.
 */
async function _checkModuleTargets(list) {
  const missing = [];
  const cache = new Map();

  for (const [file, exportName, path] of list) {
    const spec = `/systems/vagabond/module/${file}`;
    if (!cache.has(spec)) {
      try { cache.set(spec, await import(spec)); }
      catch (e) { cache.set(spec, { __importError: e.message }); }
    }
    const mod = cache.get(spec);
    if (mod.__importError) { missing.push(`${file} — import failed: ${mod.__importError}`); continue; }

    const root = mod[exportName];
    if (!root) { missing.push(`${file} → ${exportName} (export gone)`); continue; }

    const target = path.split(".").reduce((o, k) => o?.[k], root);
    if (typeof target !== "function") missing.push(`${exportName}.${path} (${typeof target})`);
  }
  return missing;
}

export const tests = [

  // ── The system still exposes everything we patch ─────────────────────────
  {
    id: "contract.patch-targets-still-exist",
    name: "System contract: every monkey-patched system method still exists",
    tier: "a",
    run: async ({ assert }) => {
      const missing = await _checkModuleTargets(PATCH_TARGETS);

      // CONFIG-resolved classes (data models, region behaviours).
      for (const [label, resolve, path] of CONFIG_PATCH_TARGETS) {
        let root;
        try { root = resolve(); } catch (e) { missing.push(`${label} — resolver threw: ${e.message}`); continue; }
        if (!root) { missing.push(`${label} (not registered on CONFIG)`); continue; }
        const target = path.split(".").reduce((o, k) => o?.[k], root);
        if (typeof target !== "function") missing.push(`${label}.${path} (${typeof target})`);
      }

      assert(missing.length === 0,
        `System API drift — these patched methods no longer resolve to functions: ${missing.join("; ")}`);
    },
  },

  // ── Methods we call but don't patch ──────────────────────────────────────
  {
    id: "contract.dependencies-still-exist",
    name: "System contract: every system method VCE calls still exists",
    tier: "a",
    run: async ({ assert }) => {
      const missing = await _checkModuleTargets(DEPENDENCIES);
      assert(missing.length === 0,
        `System API drift — VCE calls these but they no longer resolve: ${missing.join("; ")}`);
    },
  },

  // ── Cross-module patch into the optional Crawler ─────────────────────────
  // Soft: the Crawler is an optional dependency. Only assert when it's active,
  // otherwise a user without it would see a permanent red.
  {
    id: "contract.crawler-spell-dialog-patch-target",
    name: "System contract: CrawlerSpellDialog._cast still exists when the Crawler is active",
    tier: "a",
    skip: () => !game.modules.get("vagabond-crawler")?.active,
    skipReason: "vagabond-crawler not active — cross-module patch not applicable",
    run: async ({ assert }) => {
      let cls = null;
      try {
        const mod = await import("/modules/vagabond-crawler/scripts/npc-action-menu.mjs");
        cls = mod.CrawlerSpellDialog;
      } catch (e) {
        assert(false, `Could not import the Crawler's npc-action-menu.mjs: ${e.message}`);
        return;
      }
      assert(typeof cls?.prototype?._cast === "function",
        "CrawlerSpellDialog.prototype._cast is gone — VCE's cast-time state capture silently stops working from the Crawler strip (see the 'Spell Cast-Time Tracking' note in CLAUDE.md)");
    },
  },

  // ── The system still has every field our AEs write to ────────────────────
  {
    id: "contract.ae-field-paths-still-resolve",
    name: "System contract: every registry AE target path still resolves",
    tier: "a",
    usesFixtures: ["Generic", "NPC"],
    run: async ({ fixtures, assert }) => {
      const pc  = fixtures.Generic;
      const npc = fixtures.NPC;
      if (!pc)  { assert(false, "Generic fixture missing"); return; }

      const keys = await _collectAEKeys();
      // Floor guard: if a refactor moves the AE definitions somewhere this
      // walker can't see, coverage silently drops to nothing. Fail on that
      // rather than reporting a green "0/0 paths OK".
      assert(!keys.has("__catalogImportFailed"),
        `active-effects-catalog.mjs failed to import: ${keys.get("__catalogImportFailed")}`);
      assert(keys.size >= 25,
        `Only collected ${keys.size} AE paths — the walker has lost sight of the definitions, this is a test bug not system drift`);

      // A key counts as present if it resolves on EITHER document type. Some
      // are NPC-only (system.beingType, system.senses) and some PC-only; not
      // worth maintaining a classification that would itself drift.
      const unresolved = [];
      for (const [key, feature] of keys) {
        const onPC  = foundry.utils.getProperty(pc, key) !== undefined;
        const onNPC = npc ? foundry.utils.getProperty(npc, key) !== undefined : false;
        if (!onPC && !onNPC) unresolved.push(`${key} (from "${feature}")`);
      }

      assert(unresolved.length === 0,
        `System data-model drift — ${unresolved.length}/${keys.size} AE target paths resolve on neither a character nor an NPC, so effects writing them silently do nothing: ${unresolved.join("; ")}`);
    },
  },

  // ── Declared compatibility hasn't fallen behind reality ──────────────────
  // Not a correctness failure — a reminder. A module verified many minors back
  // is one Foundry warning away from users assuming it's abandoned.
  {
    id: "contract.declared-system-compat-is-current",
    name: "System contract: module.json verified system version tracks the installed one",
    tier: "a",
    run: async ({ assert }) => {
      const mod = game.modules.get(MODULE_ID);
      const declared = [...(mod?.relationships?.systems ?? [])]
        .find(s => s.id === "vagabond")?.compatibility?.verified;
      const installed = game.system.version;

      assert(!!declared, "module.json declares no verified version for the vagabond system");
      if (!declared) return;

      const major = v => String(v).split(".").slice(0, 2).join(".");
      assert(major(declared) === major(installed),
        `module.json verifies system ${declared} but ${installed} is installed — re-verify and bump, or the compatibility warning trains users to ignore it. `
        + `NOTE: game.modules reads the manifest as cached at world launch, so if you just edited module.json this stays red until the world is restarted (an F5 is not enough).`);
    },
  },
];
