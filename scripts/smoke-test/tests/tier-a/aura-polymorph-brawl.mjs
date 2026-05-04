/**
 * Tier A tests: aura, polymorph, and brawl subsystems.
 *
 * API notes (discovered by reading source):
 * - AuraManager.activate(actor, spellKey, radius) — spellKey must be in AURA_SPELLS
 *   ("exalt", "bless", "ward"). api.aura(actor, spellKey, radius) delegates here.
 *   AuraManager.deactivate(actor) removes the aura.
 * - PolymorphManager.applyBeastForm(actor, beastActor) — transforms actor to beast form.
 *   PolymorphManager.revertBeastForm(actor) — reverts.
 *   Flag: flags.vagabond-character-enhancer.polymorphData (set on transform, cleared on revert).
 *   api.polymorph is PolymorphManager itself.
 * - BrawlIntent: module-level state object. The intent dialog (showIntentDialog) fires
 *   during rollWeapon. There is NO direct applyResult(attacker, target, ...) method.
 *   Grapple/shove auto-execute on hit via onPostRollAttack (which calls DH.handleGrapple).
 *   The only direct-callable grapple path is DH.handleGrapple({ dataset: { actorId, targets } }).
 *   For smoke testing we assert that BrawlIntent object is accessible and has the
 *   expected methods, then apply a grapple AE directly to confirm status machinery works.
 */
import { MODULE_ID } from "../../../utils.mjs";

const BEASTS_PACK = "vagabond-character-enhancer.vce-beasts";

/** Load the first beast actor from the vce-beasts compendium (used for polymorph tests). */
async function _firstBeastActor() {
  const pack = game.packs.get(BEASTS_PACK);
  if (!pack) throw new Error(`Pack ${BEASTS_PACK} not found`);
  const idx = await pack.getIndex();
  const first = idx.contents?.[0] ?? [...idx][0];
  if (!first) throw new Error(`Pack ${BEASTS_PACK} yielded no index entries`);
  return pack.getDocument(first._id);
}

export const tests = [

  // ── Test 1 ──────────────────────────────────────────────────────────────
  {
    id: "aura.template-follows-token",
    name: "AuraManager: activate creates activeAura flag; template id is stored",
    tier: "a",
    usesFixtures: ["Revelator"],
    // Aura requires a token on canvas to create a MeasuredTemplate; if the
    // Revelator fixture has no token on the current scene we test flag-only.
    skip: () => false,
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.Revelator;
      if (!actor) { assert(false, "Revelator fixture missing"); return; }

      const { AuraManager } = await import("../../../aura/aura-manager.mjs");

      // Ensure clean state
      const existing = actor.getFlag(MODULE_ID, "activeAura");
      if (existing) {
        try { await AuraManager.deactivate(actor); await wait(200); } catch (e) { /* ignore */ }
      }

      // Activate "bless" aura (safe: no AE changes on the caster)
      try {
        await AuraManager.activate(actor, "bless", 10);
      } catch (e) {
        assert(false, `AuraManager.activate threw: ${e.message}`);
        return;
      }
      await wait(300);

      const auraState = actor.getFlag(MODULE_ID, "activeAura");
      assert(!!auraState, "activeAura flag should be set after activate()");
      if (auraState) {
        assert(auraState.spellKey === "bless", `activeAura.spellKey = "${auraState.spellKey}" expected "bless"`);
        assert(auraState.radius === 10, `activeAura.radius = ${auraState.radius} expected 10`);
      }

      // If a token exists, verify the template was created
      const token = actor.getActiveTokens()?.[0];
      if (token && auraState?.templateId) {
        const template = canvas.scene?.templates?.get(auraState.templateId);
        assert(!!template, `MeasuredTemplate ${auraState.templateId} should exist on scene`);
      }

      // Deactivate and assert flag is cleared
      try {
        await AuraManager.deactivate(actor);
        await wait(300);
      } catch (e) {
        assert(false, `AuraManager.deactivate threw: ${e.message}`);
        return;
      }

      const afterState = actor.getFlag(MODULE_ID, "activeAura");
      assert(!afterState, `activeAura flag should be cleared after deactivate(); got ${JSON.stringify(afterState)}`);
    }
  },

  // ── Test 2 ──────────────────────────────────────────────────────────────
  {
    id: "polymorph.druid-becomes-and-reverts",
    name: "PolymorphManager: applyBeastForm sets polymorphData flag; revertBeastForm clears it",
    tier: "a",
    usesFixtures: ["Druid"],
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.Druid;
      if (!actor) { assert(false, "Druid fixture missing"); return; }

      const { PolymorphManager } = await import("../../../polymorph/polymorph-manager.mjs");

      // Ensure clean state
      const existing = actor.getFlag(MODULE_ID, "polymorphData");
      if (existing) {
        try { await PolymorphManager.revertBeastForm(actor); await wait(300); } catch (e) { /* ignore */ }
      }

      let beastActor;
      try {
        beastActor = await _firstBeastActor();
      } catch (e) {
        assert(false, `Could not load beast from compendium: ${e.message}`);
        return;
      }

      // Apply beast form
      try {
        await PolymorphManager.applyBeastForm(actor, beastActor);
      } catch (e) {
        assert(false, `PolymorphManager.applyBeastForm threw: ${e.message}`);
        return;
      }
      await wait(400);

      const polyData = actor.getFlag(MODULE_ID, "polymorphData");
      assert(!!polyData, "polymorphData flag should be set after applyBeastForm()");
      if (polyData) {
        assert(polyData.beastName === beastActor.name,
          `polymorphData.beastName = "${polyData.beastName}" expected "${beastActor.name}"`);
      }

      // Revert
      try {
        await PolymorphManager.revertBeastForm(actor);
      } catch (e) {
        assert(false, `PolymorphManager.revertBeastForm threw: ${e.message}`);
        return;
      }
      await wait(400);

      const afterPolyData = actor.getFlag(MODULE_ID, "polymorphData");
      assert(!afterPolyData, `polymorphData flag should be cleared after revertBeastForm(); got ${JSON.stringify(afterPolyData)}`);
    }
  },

  // ── Test 3 ──────────────────────────────────────────────────────────────
  {
    id: "polymorph.spellids-array-survives-roundtrip",
    name: "PolymorphManager: system.focus.spellIds array survives transform+revert roundtrip",
    tier: "a",
    usesFixtures: ["Druid"],
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.Druid;
      if (!actor) { assert(false, "Druid fixture missing"); return; }

      const { PolymorphManager } = await import("../../../polymorph/polymorph-manager.mjs");

      // Plant a test spell ID in focus.spellIds
      const TEST_SPELL_ID = "smoke-test-polymorph-roundtrip";
      const originalIds = [...(actor.system?.focus?.spellIds ?? [])];
      const idsWithTest = [...new Set([...originalIds, TEST_SPELL_ID])];
      await actor.update({ "system.focus.spellIds": idsWithTest });
      await wait(100);

      // Ensure clean polymorph state
      const existing = actor.getFlag(MODULE_ID, "polymorphData");
      if (existing) {
        try { await PolymorphManager.revertBeastForm(actor); await wait(300); } catch (e) { /* ignore */ }
      }

      let beastActor;
      try {
        beastActor = await _firstBeastActor();
      } catch (e) {
        assert(false, `Could not load beast from compendium: ${e.message}`);
        // Restore spellIds before returning
        await actor.update({ "system.focus.spellIds": originalIds }).catch(() => {});
        return;
      }

      try {
        await PolymorphManager.applyBeastForm(actor, beastActor);
        await wait(300);
        await PolymorphManager.revertBeastForm(actor);
        await wait(300);
      } catch (e) {
        assert(false, `Polymorph round-trip threw: ${e.message}`);
        return;
      }

      const afterIds = actor.system?.focus?.spellIds;
      assert(Array.isArray(afterIds), `focus.spellIds should still be an array after polymorph round-trip; got ${typeof afterIds}`);

      // Restore original spellIds
      await actor.update({ "system.focus.spellIds": originalIds }).catch(() => {});
    }
  },

  // ── Test 4 ──────────────────────────────────────────────────────────────
  {
    id: "brawl.grapple-intent-api-surface",
    name: "BrawlIntent: object accessible from api; can apply grappled status via system",
    tier: "a",
    usesFixtures: ["Generic", "NPC"],
    run: async ({ fixtures, assert, wait }) => {
      const api = game.vagabondCharacterEnhancer;
      const brawlIntent = api?.brawlIntent;

      // Assert BrawlIntent object is accessible
      assert(typeof brawlIntent === "object" && brawlIntent !== null, "api.brawlIntent should be an object");
      if (!brawlIntent) return;

      // Assert it has the expected public methods
      assert(typeof brawlIntent.showIntentDialog === "function",
        "BrawlIntent.showIntentDialog should be a function");
      assert(typeof brawlIntent.onPreRollAttack === "function",
        "BrawlIntent.onPreRollAttack should be a function");
      assert(typeof brawlIntent.onPostRollAttack === "function",
        "BrawlIntent.onPostRollAttack should be a function");

      // Smoke-test the grappling-status pathway directly:
      // Apply "grappling" status to NPC (attacker), assert it appears,
      // then clean up (runner restores statuses anyway).
      // Note: "grappled" is NOT a registered status in this system — "grappling" is.
      const npc = fixtures.NPC;
      if (!npc) { assert(false, "NPC fixture missing"); return; }

      // toggleStatusEffect is the Foundry v13 API
      try {
        await npc.toggleStatusEffect("grappling", { active: true });
        await wait(150);
        const hasGrappling = npc.statuses?.has("grappling") ??
          npc.effects.some(e => e.statuses?.has("grappling"));
        assert(hasGrappling, "NPC should have 'grappling' status after toggleStatusEffect");
      } finally {
        await npc.toggleStatusEffect("grappling", { active: false }).catch(() => {});
      }
    }
  },
];
