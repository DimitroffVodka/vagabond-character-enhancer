/**
 * Tier A — Buff aura propagation (Bless / Ward / Exalt).
 *
 * Behavioral assertions:
 *   1. Cast aura → caster gets the flag-tagged AE
 *   2. Cast aura → ally token in range gets the AE
 *   3. Cast aura → hostile token in range does NOT get the AE
 *      (disposition filter + `_applyBuffsInRange` friendliness check)
 *   4. Cancel aura → all flag-tagged AEs swept, region deleted
 *
 * These guard against the v0.5.0 regression set:
 *   - Region's `applyActiveEffect` was double-applying on top of `_tickAura`
 *   - Hostile NPCs were getting buffed (disposition filter missing)
 *   - Region delete left legacy AEs as orphans
 */
import { MODULE_ID } from "../../../utils.mjs";
import { SceneHelper } from "../../scene-helper.mjs";

/** Find a Bless/Ward/Exalt AE on an actor by name pattern. */
function _findAuraAE(actor, label) {
  return [...actor.effects].find(e => new RegExp(`^${label} \\(Aura`).test(e.name ?? ""));
}

/** Count active aura regions on the current scene that VCE owns. */
function _countVceAuraRegions() {
  return (canvas.scene?.regions?.contents ?? [])
    .filter(r => r.flags?.[MODULE_ID]?.auraOwner)
    .length;
}

/** Common setup: place caster + ally + hostile, return placed refs. */
async function _placeStandardTrio() {
  return SceneHelper.placeFixtures({
    caster:  { fixture: "Revelator",   x: 400, y: 400, disposition: "friendly" },
    ally:    { fixture: "Generic",     x: 500, y: 400, disposition: "friendly" }, // adjacent
    hostile: { fixture: "HostileNPC",  x: 600, y: 400, disposition: "hostile"  }, // adjacent
  });
}

/**
 * Wipe leftover aura state from prior runs that the runner's fixture-restore
 * doesn't catch:
 *   - Regions tagged as VCE auras
 *   - Per-actor `activeAura` flags on fixture actors (snapshot/restore
 *     preserves whatever was there at setup, so a prior bleed contaminates
 *     subsequent tests)
 *   - Any flag-tagged Bless/Ward/Exalt AEs on fixture actors that aren't
 *     paired with a real cast
 */
async function _wipePriorAuras() {
  const scene = canvas.scene;
  if (scene) {
    const stale = (scene.regions?.contents ?? [])
      .filter(r => r.flags?.[MODULE_ID]?.auraOwner)
      .map(r => r.id);
    if (stale.length) await scene.deleteEmbeddedDocuments("Region", stale);
  }
  // Clear activeAura flag + sweep buff AEs across all smoke fixtures.
  // (Runner restore will recreate the snapshot, but if snapshot was polluted
  // we need to clean PRE-snapshot, before this test runs.)
  const fixtureActorNames = ["_smoke-Revelator", "_smoke-Generic", "_smoke-HostileNPC",
                              "_smoke-UndeadNPC", "_smoke-Witch", "_smoke-Druid", "_smoke-NPC"];
  for (const name of fixtureActorNames) {
    const a = game.actors.getName(name);
    if (!a) continue;
    if (a.getFlag(MODULE_ID, "activeAura")) {
      await a.unsetFlag(MODULE_ID, "activeAura");
    }
    const stale = [...a.effects].filter(e => /^(Bless|Ward|Exalt) \(Aura/.test(e.name ?? ""));
    if (stale.length) await a.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id));
  }
}

export const tests = [

  // ── Bless: caster + ally get buff, hostile blocked ──────────────────────
  {
    id: "aura.bless.propagation",
    name: "Bless aura: caster + ally get buff; hostile blocked by disposition",
    tier: "a",
    usesFixtures: ["Revelator", "Generic", "HostileNPC"],
    run: async ({ assert, wait }) => {
      await _wipePriorAuras();
      const { placed, cleanup } = await _placeStandardTrio();
      try {
        const caster = placed.caster.actor;
        // Wait for placed tokens to fully appear on canvas.tokens.placeables.
        // Without this, the cast's `_applyBuffsInRange` iterates canvas
        // placeables BEFORE the freshly-created tokens are rendered, so they
        // get skipped — no AE applied.
        await wait(400);

        await game.vagabondCharacterEnhancer.aura(caster, "bless", 30);
        await wait(1000);

        const casterEffects = [...placed.caster.actor.effects].map(e => e.name);
        const allyEffects = [...placed.ally.actor.effects].map(e => e.name);
        const hostileEffects = [...placed.hostile.actor.effects].map(e => e.name);

        const casterAE  = _findAuraAE(placed.caster.actor, "Bless");
        const allyAE    = _findAuraAE(placed.ally.actor,   "Bless");
        const hostileAE = _findAuraAE(placed.hostile.actor, "Bless");

        assert(!!casterAE,  `Caster should have Bless (Aura: ...) AE; got: [${casterEffects.join(", ")}]`);
        assert(!!allyAE,    `Ally in range should have Bless AE; got: [${allyEffects.join(", ")}]`);
        assert(!hostileAE,  `Hostile in range should NOT have Bless AE; got: [${hostileEffects.join(", ")}]`);

        // Cleanup the aura before scene cleanup
        try { await game.vagabondCharacterEnhancer.auraEnd(caster); } catch {}
        await wait(400);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Ward: same propagation rules ────────────────────────────────────────
  {
    id: "aura.ward.propagation",
    name: "Ward aura: caster + ally get buff; hostile blocked",
    tier: "a",
    usesFixtures: ["Revelator", "Generic", "HostileNPC"],
    run: async ({ assert, wait }) => {
      await _wipePriorAuras();
      const { placed, cleanup } = await _placeStandardTrio();
      try {
        const caster = placed.caster.actor;
        await game.vagabondCharacterEnhancer.aura(caster, "ward", 30);
        await wait(600);

        assert(!!_findAuraAE(placed.caster.actor,  "Ward"), "Caster should have Ward AE");
        assert(!!_findAuraAE(placed.ally.actor,    "Ward"), "Ally should have Ward AE");
        assert(!_findAuraAE(placed.hostile.actor,  "Ward"), "Hostile should NOT have Ward AE");

        try { await game.vagabondCharacterEnhancer.auraEnd(caster); } catch {}
        await wait(400);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Exalt: same propagation rules ───────────────────────────────────────
  {
    id: "aura.exalt.propagation",
    name: "Exalt aura: caster + ally get buff; hostile blocked",
    tier: "a",
    usesFixtures: ["Revelator", "Generic", "HostileNPC"],
    run: async ({ assert, wait }) => {
      await _wipePriorAuras();
      const { placed, cleanup } = await _placeStandardTrio();
      try {
        const caster = placed.caster.actor;
        await game.vagabondCharacterEnhancer.aura(caster, "exalt", 30);
        await wait(600);

        assert(!!_findAuraAE(placed.caster.actor,  "Exalt"), "Caster should have Exalt AE");
        assert(!!_findAuraAE(placed.ally.actor,    "Exalt"), "Ally should have Exalt AE");
        assert(!_findAuraAE(placed.hostile.actor,  "Exalt"), "Hostile should NOT have Exalt AE");

        try { await game.vagabondCharacterEnhancer.auraEnd(caster); } catch {}
        await wait(400);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Buff stacking guard — only ONE Bless AE per actor ──────────────────
  // Pre-fix, the region's `applyActiveEffect` and the legacy `_tickAura`
  // both wrote AEs, producing duplicates that stacked save bonuses.
  {
    id: "aura.bless.no-double-stack",
    name: "Bless aura: caster has exactly 1 Bless AE (no region+legacy stacking)",
    tier: "a",
    usesFixtures: ["Revelator", "Generic"],
    run: async ({ assert, wait }) => {
      await _wipePriorAuras();
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster: { fixture: "Revelator", x: 400, y: 400, disposition: "friendly" },
        ally:   { fixture: "Generic",   x: 500, y: 400, disposition: "friendly" },
      });
      try {
        const caster = placed.caster.actor;
        await game.vagabondCharacterEnhancer.aura(caster, "bless", 30);
        await wait(600);

        const casterBlessCount = [...placed.caster.actor.effects]
          .filter(e => /^Bless \(Aura/.test(e.name ?? "")).length;
        const allyBlessCount = [...placed.ally.actor.effects]
          .filter(e => /^Bless \(Aura/.test(e.name ?? "")).length;

        assert(casterBlessCount === 1,
          `Caster should have exactly 1 Bless AE, got ${casterBlessCount}`);
        assert(allyBlessCount === 1,
          `Ally should have exactly 1 Bless AE, got ${allyBlessCount}`);

        try { await game.vagabondCharacterEnhancer.auraEnd(caster); } catch {}
        await wait(400);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Cancel sweeps all AEs + region ──────────────────────────────────────
  {
    id: "aura.cancel.no-orphans",
    name: "Aura cancel: removes region AND all flag-tagged AEs across allies",
    tier: "a",
    usesFixtures: ["Revelator", "Generic"],
    run: async ({ assert, wait }) => {
      await _wipePriorAuras();
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster: { fixture: "Revelator", x: 400, y: 400, disposition: "friendly" },
        ally:   { fixture: "Generic",   x: 500, y: 400, disposition: "friendly" },
      });
      try {
        const caster = placed.caster.actor;
        await game.vagabondCharacterEnhancer.aura(caster, "exalt", 30);
        await wait(600);

        // Sanity: both should have Exalt before we cancel
        assert(!!_findAuraAE(placed.caster.actor, "Exalt"), "(pre-cancel) caster has Exalt");
        assert(!!_findAuraAE(placed.ally.actor,   "Exalt"), "(pre-cancel) ally has Exalt");
        const regionsBefore = _countVceAuraRegions();
        assert(regionsBefore >= 1, `(pre-cancel) at least 1 VCE region (got ${regionsBefore})`);

        await game.vagabondCharacterEnhancer.auraEnd(caster);
        await wait(800);

        // Post-cancel: everything cleaned
        assert(!_findAuraAE(placed.caster.actor, "Exalt"), "(post-cancel) caster Exalt AE swept");
        assert(!_findAuraAE(placed.ally.actor,   "Exalt"), "(post-cancel) ally Exalt AE swept");
        assert(_countVceAuraRegions() === 0,
          `(post-cancel) 0 VCE regions remain (got ${_countVceAuraRegions()})`);
        const flag = caster.getFlag(MODULE_ID, "activeAura");
        assert(!flag, "activeAura flag should be cleared after auraEnd");
      } finally {
        await cleanup();
      }
    },
  },

  // ── Exalt writes system fields (the real damage path) ──────────────────
  {
    id: "aura.exalt.writes-system-bonusPerDamageDie",
    name: "Exalt aura: populates system.bonusPerDamageDie = 1 and double-vs Undead/Hellspawn",
    tier: "a",
    usesFixtures: ["Revelator"],
    run: async ({ assert, wait }) => {
      await _wipePriorAuras();
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster: { fixture: "Revelator", x: 400, y: 400, disposition: "friendly" },
      });
      try {
        const caster = placed.caster.actor;
        const before = caster.system.bonusPerDamageDie ?? 0;
        await game.vagabondCharacterEnhancer.aura(caster, "exalt", 30);
        await wait(700);

        assert(caster.system.bonusPerDamageDie === before + 1,
          `bonusPerDamageDie should increment by 1 (was ${before}, now ${caster.system.bonusPerDamageDie})`);

        const doubleVs = caster.system.bonusPerDamageDieDoubleVsBeingTypes ?? [];
        assert(doubleVs.includes("Undead"),    "doubleVs should include Undead");
        assert(doubleVs.includes("Hellspawn"), "doubleVs should include Hellspawn");

        try { await game.vagabondCharacterEnhancer.auraEnd(caster); } catch {}
        await wait(400);
        assert((caster.system.bonusPerDamageDie ?? 0) === before,
          `After auraEnd, bonusPerDamageDie should return to ${before}`);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Regression guard: _restoreAuras must not spawn orphan templates ─────
  //
  // Bug (Codex P2, 2026-05-13): _restoreAuras checked
  // `canvas.scene.templates.get(auraState.templateId)` even for region-based
  // auras, where `templateId` is undefined (region auras save `regionId`).
  // The lookup returned undefined → "template missing — recreate it" branch
  // fired → a NEW MeasuredTemplate was created and `activeAura.templateId`
  // was overwritten. Later deactivate took the region path (line 444) and
  // returned BEFORE the legacy template cleanup at line 481, leaving the
  // synthesized MeasuredTemplate orphaned on the scene.
  //
  // Fix: _restoreAuras now branches on auraState.regionId FIRST. Region
  // auras skip the MeasuredTemplate logic entirely; the Region itself
  // persists across canvasReady and its applyActiveEffect behavior
  // re-applies buffs natively.
  {
    id: "aura.restore-region-aura-creates-no-orphan-template",
    name: "Region aura restore: _restoreAuras must not spawn a MeasuredTemplate or set templateId",
    tier: "a",
    usesFixtures: ["Revelator"],
    run: async ({ assert, wait }) => {
      await _wipePriorAuras();
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster: { fixture: "Revelator", x: 400, y: 400, disposition: "friendly" },
      });
      try {
        const caster = placed.caster.actor;
        await game.vagabondCharacterEnhancer.aura(caster, "exalt", 30);
        await wait(700);

        // Precondition: region path activated successfully.
        const stateAfterCast = caster.getFlag(MODULE_ID, "activeAura");
        assert(!!stateAfterCast?.regionId,
          `precondition: activeAura.regionId must be set after region-path cast; got ${JSON.stringify(stateAfterCast)}`);
        assert(!stateAfterCast?.templateId,
          `precondition: region-path activeAura must NOT carry templateId; got ${JSON.stringify(stateAfterCast)}`);

        // Baseline: count MeasuredTemplates owned by VCE on the scene
        const vceTemplatesBefore = (canvas.scene?.templates?.contents ?? [])
          .filter(t => t.flags?.[MODULE_ID]?.aura).length;

        // Trigger the restore path (simulates canvasReady firing)
        const { AuraManager } = await import("../../../aura/aura-manager.mjs");
        await AuraManager._restoreAuras();
        await wait(400);

        // Post: NO new VCE-owned MeasuredTemplate should have been spawned.
        const vceTemplatesAfter = (canvas.scene?.templates?.contents ?? [])
          .filter(t => t.flags?.[MODULE_ID]?.aura).length;
        assert(vceTemplatesAfter === vceTemplatesBefore,
          `_restoreAuras created an orphan MeasuredTemplate; before=${vceTemplatesBefore}, after=${vceTemplatesAfter}`);

        // Post: activeAura state must still be region-based — templateId
        // must NOT have been written by the restore logic.
        const stateAfterRestore = caster.getFlag(MODULE_ID, "activeAura");
        assert(!!stateAfterRestore?.regionId,
          `regionId should survive _restoreAuras; got ${JSON.stringify(stateAfterRestore)}`);
        assert(!stateAfterRestore?.templateId,
          `templateId must remain unset for region auras after restore; got ${JSON.stringify(stateAfterRestore)}`);

        try { await game.vagabondCharacterEnhancer.auraEnd(caster); } catch {}
        await wait(400);
      } finally {
        await cleanup();
      }
    },
  },
];
