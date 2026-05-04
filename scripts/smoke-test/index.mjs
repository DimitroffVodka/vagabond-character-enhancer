/**
 * VCE Smoke Test Harness — runner orchestration.
 * Test discovery (Tier A/B/C aggregation) is filled in by Tasks 5-12.
 */
import { Runner } from "./runner.mjs";
import { emitOutput } from "./output.mjs";

export const SmokeTest = {
  async run(opts = {}) {
    const tests = await this._discoverTests();
    // For Tier C: ensure TestPC has a class so the feature-detector pipeline runs.
    // Perk tests need TestPC to be a real character, not a blank slate.
    if (tests.some(t => t.tier === "c") && (!opts.tier || opts.tier === "c")) {
      const { Fixtures } = await import("./fixtures.mjs");
      await Fixtures.ensureAll();
      try { await Fixtures.swapClass("TestPC", "Wizard", 10); } catch { /* ignore */ }
    }
    const result = await Runner.run(tests, opts);
    if (!opts.silent) await emitOutput(result);
    return result;
  },

  async _discoverTests() {
    const all = [
      await import("./tests/tier-a/boot.mjs"),
      await import("./tests/tier-a/focus.mjs"),
      await import("./tests/tier-a/companion.mjs"),
      await import("./tests/tier-a/spells.mjs"),
      await import("./tests/tier-a/aura-polymorph-brawl.mjs"),
      await import("./tests/tier-a/detection-ae.mjs"),
      await import("./tests/tier-a/encumbrance-fx.mjs"),
      await import("./tests/tier-b/martial.mjs"),
      await import("./tests/tier-b/skirmisher.mjs"),
      await import("./tests/tier-b/casters.mjs"),
      await import("./tests/tier-b/specialists.mjs"),
      await import("./tests/tier-c/perks.mjs"),
      await import("./tests/tier-c/spells.mjs"),
    ];
    return all.flatMap(m => m.tests);
  }
};
