/**
 * Tier A tests: FeatureDetector AE management + RangeValidator.
 *
 * API notes (discovered by reading source):
 * - Feature detection scans `item.system.levelFeatures` from the system compendium.
 *   The registry key "manifold mind" maps to flag `wizard_manifoldMind` and creates
 *   a managed AE labelled "Manifold Mind". Unlocks at level 4.
 * - api.rescan(actor) triggers FeatureDetector.scan(actor).
 * - Managed AEs are created/deleted by the detector on each scan.
 * - RangeValidator: patched into rollAttack pre-roll chain.  It validates targets
 *   and may cancel an attack, but should NOT throw uncaught exceptions.
 */
import { MODULE_ID } from "../../../utils.mjs";

const CLASSES_PACK = "vagabond.classes";

async function _getWizardClassDoc() {
  const pack = game.packs.get(CLASSES_PACK);
  if (!pack) throw new Error(`Pack ${CLASSES_PACK} not found`);
  const idx = await pack.getIndex();
  const entry = idx.find(e => e.name === "Wizard");
  if (!entry) throw new Error("Wizard not found in vagabond.classes compendium");
  return pack.getDocument(entry._id);
}

export const tests = [

  // ── Test 5 ──────────────────────────────────────────────────────────────
  {
    id: "feature-detector.adds-managed-AE",
    name: "FeatureDetector: adding Wizard class (lvl 5) creates Manifold Mind AE",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      const api = game.vagabondCharacterEnhancer;
      assert(typeof api?.rescan === "function", "api.rescan should be a function");
      if (typeof api?.rescan !== "function") return;

      // Remove any existing Wizard class items to start fresh
      const existingClass = actor.items.find(i => i.type === "class" && i.name === "Wizard");
      if (existingClass) {
        await actor.deleteEmbeddedDocuments("Item", [existingClass.id]);
        await wait(200);
      }

      // Also remove any existing Manifold Mind AEs from a previous test run
      const staleMMAE = actor.effects.filter(e => /manifold mind/i.test(e.name));
      if (staleMMAE.length) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", staleMMAE.map(e => e.id));
        await wait(100);
      }

      // Add Wizard class (Manifold Mind unlocks at level 4).
      // Level is stored on the ACTOR (system.attributes.level.value), not on the class item.
      let wizardDoc;
      try {
        wizardDoc = await _getWizardClassDoc();
      } catch (e) {
        assert(false, `Could not load Wizard class: ${e.message}`);
        return;
      }
      const classData = wizardDoc.toObject();

      // Set actor level to 5 so features at level ≤ 5 (including Manifold Mind at 4) unlock
      const originalLevel = actor.system?.attributes?.level?.value ?? 1;
      await actor.update({ "system.attributes.level.value": 5 });
      await wait(100);

      const [createdClass] = await actor.createEmbeddedDocuments("Item", [classData]);
      await wait(400);

      // Rescan to trigger feature detection
      try {
        await api.rescan(actor);
      } catch (e) {
        // Restore level before bailing
        await actor.update({ "system.attributes.level.value": originalLevel }).catch(() => {});
        assert(false, `api.rescan threw: ${e.message}`);
        return;
      }
      await wait(400);

      // Check the wizard_manifoldMind flag was set
      const features = actor.getFlag(MODULE_ID, "features") ?? {};
      assert(features.wizard_manifoldMind === true,
        `expected wizard_manifoldMind=true in features; got ${JSON.stringify(features)}`);

      // Check a "Manifold Mind" AE was created
      const manifoldAE = actor.effects.find(e => /manifold mind/i.test(e.name));
      assert(!!manifoldAE, `expected a "Manifold Mind" AE on actor after rescan; effects: ${actor.effects.map(e => e.name).join(", ")}`);

      // Restore actor level (runner will clean up class item + AE)
      await actor.update({ "system.attributes.level.value": originalLevel }).catch(() => {});
    }
  },

  // ── Test 6 ──────────────────────────────────────────────────────────────
  {
    id: "feature-detector.removes-AE-when-class-removed",
    name: "FeatureDetector: deleting Wizard class removes Manifold Mind AE",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      const api = game.vagabondCharacterEnhancer;
      if (typeof api?.rescan !== "function") {
        assert(false, "api.rescan should be a function");
        return;
      }

      // Ensure actor level is 5 (level stored on actor, not on class item)
      const originalLevel = actor.system?.attributes?.level?.value ?? 1;
      await actor.update({ "system.attributes.level.value": 5 });
      await wait(100);

      // Ensure Wizard class is present
      let wizardClass = actor.items.find(i => i.type === "class" && i.name === "Wizard");
      if (!wizardClass) {
        let wizardDoc;
        try {
          wizardDoc = await _getWizardClassDoc();
        } catch (e) {
          await actor.update({ "system.attributes.level.value": originalLevel }).catch(() => {});
          assert(false, `Could not load Wizard class: ${e.message}`);
          return;
        }
        const classData = wizardDoc.toObject();
        const [created] = await actor.createEmbeddedDocuments("Item", [classData]);
        wizardClass = created;
        await wait(300);
      }

      // Rescan to ensure Manifold Mind AE is present before removal
      try {
        await api.rescan(actor);
      } catch (e) {
        await actor.update({ "system.attributes.level.value": originalLevel }).catch(() => {});
        assert(false, `api.rescan (setup) threw: ${e.message}`);
        return;
      }
      await wait(400);

      const aeBeforeRemoval = actor.effects.find(e => /manifold mind/i.test(e.name));
      if (!aeBeforeRemoval) {
        // Still check feature flag path first
        const features = actor.getFlag(MODULE_ID, "features") ?? {};
        // If flag was also not set, detector may not have fired — not a hard failure here
        // but we can't meaningfully test removal. Note it and skip assertion.
        assert(false,
          `Setup: expected Manifold Mind AE before class removal; effects: ${actor.effects.map(e => e.name).join(", ")}, features: ${JSON.stringify(features)}`);
        return;
      }

      // Delete the Wizard class item
      const classItemId = actor.items.find(i => i.type === "class" && i.name === "Wizard")?.id;
      if (!classItemId) {
        assert(false, "Could not find Wizard class item to delete");
        return;
      }
      await actor.deleteEmbeddedDocuments("Item", [classItemId]);
      await wait(400);

      // Rescan to trigger cleanup
      try {
        await api.rescan(actor);
      } catch (e) {
        assert(false, `api.rescan (post-removal) threw: ${e.message}`);
        return;
      }
      await wait(400);

      // The Manifold Mind AE should be gone
      const manifoldAEAfter = actor.effects.find(e => /manifold mind/i.test(e.name));
      assert(!manifoldAEAfter,
        `expected Manifold Mind AE to be removed after class deletion; effects: ${actor.effects.map(e => e.name).join(", ")}`);

      // Restore actor level
      await actor.update({ "system.attributes.level.value": originalLevel }).catch(() => {});
    }
  },

  // ── Regression guard: stale managed AE definitions get refreshed ────────
  //
  // Bug (Codex P1, 2026-05-13): _syncManagedEffects skipped any existing
  // managed AE whose effectKey matched a desired effect. When the catalog
  // was fixed (e.g., the Mental Fortress mode-4 → mode-2 patch), existing
  // actors kept the BROKEN AE forever — the catalog update only reached
  // fresh actors.
  //
  // Fix: existing managed AEs whose `changes` array (or `disabled`) differs
  // from the current catalog spec are now included in toDelete, so the
  // create pass rebuilds them with current spec.
  //
  // Test approach: install Barbarian L5 → Rage AE is created from catalog.
  // Manually mutate the existing AE's mode value to a stale number (5 ≠
  // catalog's 2). Trigger rescan. Assert the AE was deleted + recreated
  // with the catalog's current mode (2).
  {
    id: "feature-detector.refreshes-stale-managed-AE",
    name: "FeatureDetector replaces existing managed AE when its changes diverge from catalog",
    tier: "a",
    usesFixtures: ["TestPC"],
    setup: async () => {
      const { Fixtures } = await import("../../fixtures.mjs");
      await Fixtures.swapClass("TestPC", "Barbarian", 5);
    },
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      await wait(300);

      const rageAE = actor.effects.find(e => /^Rage$/i.test(e.name ?? "")
        && e.getFlag(MODULE_ID, "managed"));
      assert(!!rageAE, `precondition: managed "Rage" AE present after Barbarian swap; effects: ${actor.effects.map(e=>e.name).join(", ")}`);
      if (!rageAE) return;

      // The Vagabond system uses a custom AE schema — each change entry has
      // a string `type` (e.g. "add"), not the Foundry-default numeric `mode`.
      // We mutate `type` because that's the actual stored field.
      const desiredChanges = foundry.utils.deepClone(rageAE.changes);
      assert(desiredChanges.length > 0,
        `Rage AE should have a non-empty changes array; got ${JSON.stringify(rageAE.changes)}`);
      const originalType = String(desiredChanges[0].type ?? "add");

      // Mutate the AE to a stale spec: switch type from "add" to "upgrade".
      // (Simulates a release where the catalog corrected an old type value
      // — exactly what the Mental Fortress mode-4 → mode-2 fix did.)
      const staleType = originalType === "upgrade" ? "override" : "upgrade";
      const staleChanges = foundry.utils.deepClone(desiredChanges);
      staleChanges[0].type = staleType;
      await rageAE.update({ changes: staleChanges });
      await wait(200);

      // Pre-check: the AE on the actor is now stale
      const aeAfterMutation = actor.effects.find(e => e.getFlag(MODULE_ID, "managed") && /^Rage$/i.test(e.name ?? ""));
      assert(String(aeAfterMutation?.changes?.[0]?.type) === staleType,
        `mutation didn't take — expected type="${staleType}", got "${aeAfterMutation?.changes?.[0]?.type}"`);

      // Trigger rescan — divergence detector should remove + recreate
      await game.vagabondCharacterEnhancer.rescan(actor);
      await wait(300);

      const finalAE = actor.effects.find(e => e.getFlag(MODULE_ID, "managed") && /^Rage$/i.test(e.name ?? ""));
      assert(!!finalAE, `Rage AE should still exist after rescan; effects: ${actor.effects.map(e=>e.name).join(", ")}`);
      assert(String(finalAE?.changes?.[0]?.type) === originalType,
        `rescan should refresh stale AE back to catalog type="${originalType}"; got "${finalAE?.changes?.[0]?.type}"`);
    }
  },

  // Removed (2026-05-13): `range-validator.no-error-on-out-of-range` was a
  // 🔴 structural test that only asserted "doesn't throw" without verifying
  // that the validator actually blocked or hindered the attack. Superseded
  // by 4 stronger Phase 4 tests in `tier-a/cross-cutting.mjs`:
  //   - range.measureDistance-chebyshev
  //   - range.melee-out-of-range-blocked
  //   - range.ranged-at-close-hinder
  //   - range.multi-target-no-cleave-blocked
];
