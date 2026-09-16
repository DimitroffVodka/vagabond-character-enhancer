/**
 * Tier B — Damage-pipeline class features that the previous suite never tested.
 *
 *   - Vanguard Indestructible: full melee/ranged immunity via the
 *     `vagabond.preDamageApply` hook. Gated on Armor ≥ 1 and the target NOT
 *     being incapacitated/unconscious/paralyzed.
 *
 * Indestructible was recently moved from `calculateFinalDamage` to
 * `preDamageApply` (CHANGELOG v0.4.16); these tests guard that wiring.
 *
 * Two traps the earlier versions of these tests fell into, both of which made
 * the negative cases pass no matter what the handler did:
 *   - `system.armor` is DERIVED from worn armor; `actor.update({"system.armor"})`
 *     is discarded, so Armor stayed 0 and the handler bailed on the armor gate
 *     before reaching the branch under test. Wear a real armor item instead.
 *   - `Hooks.callAll` never returns false. Only `Hooks.call` reports that a
 *     callback cancelled, which is how the system itself reads this hook.
 */
import { MODULE_ID } from "../../../utils.mjs";

const setup = async () => {
  const { Fixtures } = await import("../../fixtures.mjs");
  await Fixtures.swapClass("TestPC", "Vanguard", 10);
};

/**
 * Wear the system's Light Armor (Armor 1) and assert the gates this file
 * depends on actually hold — a test that can't reach its branch must fail,
 * not pass. The runner's snapshot/restore removes the item afterwards.
 * @returns {Promise<boolean>} false when preconditions failed
 */
async function _armoredVanguard(actor, assert, wait) {
  const pack = game.packs.get("vagabond.armor");
  const entry = (await pack?.getIndex())?.find(e => e.name === "Light Armor");
  if (!entry) { assert(false, "Light Armor not found in vagabond.armor"); return false; }
  const data = (await pack.getDocument(entry._id)).toObject();
  data.system.equipmentState = "worn";
  await actor.createEmbeddedDocuments("Item", [data]);
  await wait(300);

  const hasFeature = actor.getFlag(MODULE_ID, "features")?.vanguard_indestructible === true;
  assert(hasFeature, "precondition: Vanguard L10 should have vanguard_indestructible");
  assert((actor.system.armor ?? 0) >= 1, `precondition: worn Light Armor should give Armor >= 1; got ${actor.system.armor}`);
  return hasFeature && (actor.system.armor ?? 0) >= 1;
}

/** Call the hook the way the system does, and drop any Indestructible card it posted. */
async function _preDamageApply(ctx, wait) {
  const before = new Set(game.messages.keys());
  const allowed = Hooks.call("vagabond.preDamageApply", ctx);
  await wait(200);
  const cards = game.messages.filter(m => !before.has(m.id) && m.content?.includes('data-card-type="indestructible"'));
  if (cards.length) await ChatMessage.deleteDocuments(cards.map(m => m.id));
  return allowed;
}

const meleeHit = actor => ({
  actor, amount: 50, damageType: "physical",
  sourceItem: { type: "weapon", system: { attackType: "melee" } },
});

export const tests = [

  // ── Positive trigger: armored Vanguard cancels melee damage ─────────────
  {
    id: "vanguard.indestructible-cancels-melee-damage",
    name: "Vanguard Indestructible: cancels melee damage when armored (positive trigger)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup,
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      if (!await _armoredVanguard(actor, assert, wait)) return;

      const allowed = await _preDamageApply(meleeHit(actor), wait);
      assert(allowed === false,
        `Indestructible should cancel melee damage at Armor ${actor.system.armor}; Hooks.call returned ${allowed}`);
    }
  },

  // ── Negative case: Indestructible does NOT cancel non-melee/ranged ──────
  {
    id: "vanguard.indestructible-does-not-cancel-cast-damage",
    name: "Vanguard Indestructible: does NOT cancel spell-source damage (only melee/ranged)",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup,
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      if (!await _armoredVanguard(actor, assert, wait)) return;

      // Spell source → atkType = "cast" → handler should early-return without cancel
      const ctx = { actor, amount: 30, damageType: "fire", sourceItem: { type: "spell", system: {} } };
      const allowed = await _preDamageApply(ctx, wait);
      assert(allowed !== false,
        `Indestructible should NOT cancel spell damage; Hooks.call returned ${allowed}`);
    }
  },

  // ── Negative case: Indestructible OFF when incapacitated ────────────────
  {
    id: "vanguard.indestructible-blocked-when-incapacitated",
    name: "Vanguard Indestructible: does NOT fire while incapacitated/unconscious/paralyzed",
    tier: "b",
    usesFixtures: ["TestPC"],
    setup,
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }
      if (!await _armoredVanguard(actor, assert, wait)) return;

      await actor.toggleStatusEffect("incapacitated", { active: true });
      await wait(200);
      try {
        assert(actor.statuses.has("incapacitated"), "precondition: incapacitated status should be applied");
        const allowed = await _preDamageApply(meleeHit(actor), wait);
        assert(allowed !== false,
          `Indestructible should NOT fire while incapacitated; Hooks.call returned ${allowed}`);
      } finally {
        await actor.toggleStatusEffect("incapacitated", { active: false }).catch(() => {});
      }
    }
  },
];
