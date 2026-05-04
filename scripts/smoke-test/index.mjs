/**
 * VCE Smoke Test Harness — runner orchestration.
 * Test discovery (Tier A/B/C aggregation) is filled in by Tasks 5-12.
 */
import { Runner } from "./runner.mjs";

export const SmokeTest = {
  async run(opts = {}) {
    const tests = await this._discoverTests();
    return Runner.run(tests, opts);
  },

  async _discoverTests() {
    // Filled in by later tasks (Tier A/B/C imports).
    return [];
  }
};
