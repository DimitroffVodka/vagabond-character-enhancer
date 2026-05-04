/**
 * Tier C — per-spell-manager smoke tests.
 * Auto-generated from SPELL_HANDLERS in spell-assertions.mjs.
 *
 * Each test:
 *   1. Sets up caster (and optional NPC target) from fixtures
 *   2. Invokes the handler's cast() entry point
 *   3. Waits 250 ms for async state to settle
 *   4. Runs the handler's assert() checks
 *   5. Calls cleanup() to restore pre-test state
 *
 * Runner snapshot/restore handles actor-level AE / item cleanup automatically,
 * but each handler's cleanup() does additional targeted teardown (e.g. clear
 * imbue flag, unhex target) to leave fixtures in a known clean state for the
 * next test.
 *
 * Run with:
 *   smokeTest({ tier: "c", pattern: /^spell\./ })
 */
import { SPELL_HANDLERS } from "../../spell-assertions.mjs";
import { TIER_C_SKIPS } from "../../tier-c-config.mjs";

export const tests = Object.entries(SPELL_HANDLERS).map(([name, handler]) => {
  const skipReason = TIER_C_SKIPS.spells?.[name];

  const fixtureNames = handler.needsTarget
    ? [handler.setupCaster, "NPC"]
    : [handler.setupCaster];

  return {
    id: `spell.${name}`,
    name: `Spell: ${name} manager smoke`,
    tier: "c",
    usesFixtures: fixtureNames,
    skip: skipReason ? () => true : undefined,
    skipReason,
    run: async ({ fixtures, assert, wait }) => {
      const caster = fixtures[handler.setupCaster];
      const target = handler.needsTarget ? fixtures.NPC : null;

      if (!caster) {
        assert(false, `spell.${name}: fixture "${handler.setupCaster}" not available`);
        return;
      }

      try {
        await handler.cast(caster, target);
        await wait(250);
        await handler.assert({ caster, target, assert });
      } catch (e) {
        assert(false, `spell.${name} threw: ${e.message}`);
      } finally {
        try {
          if (typeof handler.cleanup === "function") {
            await handler.cleanup({ caster, target });
            await wait(100);
          }
        } catch (_e) {
          // Cleanup errors are suppressed — they shouldn't fail the test itself
        }
      }
    }
  };
});
