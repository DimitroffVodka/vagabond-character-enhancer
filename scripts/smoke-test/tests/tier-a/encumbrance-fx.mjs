/**
 * Tier A tests: encumbrance speed penalty + Feature FX config roundtrip.
 *
 * API notes (discovered by reading source):
 * - EncumbranceManager setting key: "homebrewEncumbranceSpeedPenalty" (NOT "encumbranceEnabled").
 *   Gated by game.settings.get(MODULE_ID, "homebrewEncumbranceSpeedPenalty").
 *   EncumbranceManager.refresh(actor) is the idempotent re-compute call.
 *   The managed AE has flag: { MODULE_ID: { encumberedAE: true } }.
 * - getFeatureFxConfig(key?) / DEFAULT_FEATURE_FX exported from feature-fx-config.mjs.
 *   No setter exposed at module level — config is stored via
 *   game.settings.set(MODULE_ID, "featureFxConfig", data) directly.
 *   getFeatureFxConfig() merges stored settings over DEFAULT_FEATURE_FX.
 */
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [

  // ── Test 8 ──────────────────────────────────────────────────────────────
  {
    id: "encumbrance.over-capacity-applies-encumbered",
    name: "EncumbranceManager: over-slot actor gets encumbered AE (setting-gated)",
    tier: "a",
    usesFixtures: ["Generic"],
    skip: () => {
      try {
        return game.settings.get(MODULE_ID, "homebrewEncumbranceSpeedPenalty") !== true;
      } catch (e) {
        return true; // setting not registered — skip
      }
    },
    skipReason: "homebrewEncumbranceSpeedPenalty setting is OFF — encumbrance test skipped",
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.Generic;
      if (!actor) { assert(false, "Generic fixture missing"); return; }

      const { EncumbranceManager } = await import("../../../encumbrance/encumbrance-manager.mjs");

      // Determine max slots for this actor from the computed system value
      const maxSlots = actor.system?.inventory?.maxSlots ?? 8;
      const { computeQuantityAwareOccupiedSlots } = await import("../../../encumbrance/encumbrance-manager.mjs");
      const currentOccupied = computeQuantityAwareOccupiedSlots(actor);

      // Create enough 2-slot items to push occupied > maxSlots
      // Each item uses system.baseSlots (the writable source field; "slots" is derived)
      const slotsNeeded = maxSlots - currentOccupied + 2; // guarantee +2 over cap
      const needed = Math.ceil(slotsNeeded / 2);
      const items = Array.from({ length: needed }, (_, i) => ({
        name: `_smoke-bulky-item-${i}`,
        type: "equipment",
        system: { equipmentType: "gear", baseSlots: 2, quantity: 1 }
      }));

      let created = [];
      try {
        created = await actor.createEmbeddedDocuments("Item", items);
        await wait(300);

        // Force a refresh in case the debounce hasn't fired yet
        await EncumbranceManager.refresh(actor);
        await wait(300);

        // The encumbered AE should now be present
        const encumberedAE = actor.effects.find(e =>
          e.getFlag?.(MODULE_ID, "encumberedAE") === true
        );
        assert(!!encumberedAE,
          `expected an encumberedAE active effect; effects: ${actor.effects.map(e => e.name).join(", ")}`);

        // Also check status
        const hasStatus = actor.statuses?.has?.("encumbered") ??
          actor.effects.some(e => e.statuses?.has?.("encumbered"));
        assert(hasStatus, "actor.statuses should include 'encumbered'");
      } finally {
        // Clean up items (runner also does this, but belt-and-suspenders)
        if (created.length) {
          await actor.deleteEmbeddedDocuments("Item", created.map(i => i.id)).catch(() => {});
        }
        // Refresh to clear the encumbered AE
        await EncumbranceManager.refresh(actor).catch(() => {});
        await wait(200);
      }
    }
  },

  // ── Test 9 ──────────────────────────────────────────────────────────────
  {
    id: "feature-fx.config-roundtrip",
    name: "FeatureFX: getFeatureFxConfig() returns defaults merged with stored overrides",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert, wait }) => {
      const { getFeatureFxConfig, DEFAULT_FEATURE_FX } = await import("../../../focus/feature-fx-config.mjs");

      assert(typeof getFeatureFxConfig === "function",
        "getFeatureFxConfig should be exported as a function");
      assert(typeof DEFAULT_FEATURE_FX === "object" && DEFAULT_FEATURE_FX !== null,
        "DEFAULT_FEATURE_FX should be exported as an object");
      if (typeof getFeatureFxConfig !== "function") return;

      // Snapshot current stored config so we can restore it
      let originalStored;
      try {
        originalStored = game.settings.get(MODULE_ID, "featureFxConfig");
      } catch (e) {
        originalStored = {};
      }

      const TEST_KEY = "_smoke_test_fx_key";
      const TEST_CONFIG = {
        label: "Smoke Test FX",
        class: "_test",
        enabled: false,
        target: "caster",
        file: "test/path/file.webm",
        scale: 1.5,
        opacity: 0.4,
        persist: false,
        fadeIn: 300,
        fadeOut: 300,
        belowToken: true,
        sound: "",
        soundVolume: 0.6
      };

      try {
        // Store a test override
        const storeData = foundry.utils.deepClone(originalStored ?? {});
        storeData[TEST_KEY] = TEST_CONFIG;
        await game.settings.set(MODULE_ID, "featureFxConfig", storeData);
        await wait(100);

        // Read back via getFeatureFxConfig
        const merged = getFeatureFxConfig();
        assert(typeof merged === "object" && merged !== null,
          "getFeatureFxConfig() should return an object");

        // Default keys should still be present (merged in)
        const defaultKeys = Object.keys(DEFAULT_FEATURE_FX);
        assert(defaultKeys.length > 0, "DEFAULT_FEATURE_FX should have entries");
        for (const k of defaultKeys.slice(0, 3)) {
          assert(k in merged, `default key "${k}" should be present in merged config`);
        }

        // Our test key should also be present with the stored value
        assert(TEST_KEY in merged,
          `test key "${TEST_KEY}" should appear in merged config`);
        if (TEST_KEY in merged) {
          assert(merged[TEST_KEY].scale === TEST_CONFIG.scale,
            `merged[${TEST_KEY}].scale should be ${TEST_CONFIG.scale}, got ${merged[TEST_KEY].scale}`);
          assert(merged[TEST_KEY].file === TEST_CONFIG.file,
            `merged[${TEST_KEY}].file should be "${TEST_CONFIG.file}", got "${merged[TEST_KEY].file}"`);
        }

        // getFeatureFxConfig(key) should return single-entry form
        const single = getFeatureFxConfig("_focus");
        assert(typeof single === "object" && single !== null,
          "getFeatureFxConfig('_focus') should return an object (exists in defaults)");

        // Non-existent key returns null
        const missing = getFeatureFxConfig("__nonexistent_key__");
        assert(missing === null,
          `getFeatureFxConfig('__nonexistent_key__') should return null, got ${JSON.stringify(missing)}`);

      } finally {
        // Restore original stored config (delete test key)
        try {
          const restore = foundry.utils.deepClone(originalStored ?? {});
          delete restore[TEST_KEY];
          await game.settings.set(MODULE_ID, "featureFxConfig", restore);
        } catch (e) {
          console.warn(`${MODULE_ID} | SmokeTest | Could not restore featureFxConfig: ${e.message}`);
        }
      }
    }
  },
];
