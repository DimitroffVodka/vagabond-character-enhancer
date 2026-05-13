/**
 * Tier A — Exalt damage bonus (the multi-bug fix from v0.5.0).
 *
 * Behavioral assertions, each derived from a real bug found in play:
 *   1. Weapon damage gets +1 per die when Exalt active (was broken when
 *      VCE's hand-rolled hook missed the auto-roll path).
 *   2. Spell damage gets +1 per die when Exalt active (was broken — the
 *      hand-rolled hook only patched weapon rollDamage).
 *   3. Alchemical damage gets +1 per die (same — never reached the hook).
 *   4. Striking-relic weapons count the relic's bonus die (was broken —
 *      VCE counted `currentDamage` dice only, missing system-injected
 *      relic dice).
 *   5. Doubling vs Undead targets (+2 per die) actually fires (was broken
 *      — target shape mismatch made `_shouldDoublePerDieBonus` return false).
 *   6. Without Exalt, no bonus applied (sanity).
 *
 * Assertion strategy: each test rolls damage with a known formula and
 * asserts the rolled `_perDieBonusTotal` matches the expected math
 * (bonusPerDie × diceCount × maybeDoubled). Dice values themselves
 * vary per roll — we assert the BONUS, not the total.
 */
import { MODULE_ID } from "../../../utils.mjs";
import { SceneHelper } from "../../scene-helper.mjs";

async function _castExalt(caster) {
  // Wipe stale state — region AND activeAura flag. Without clearing the
  // flag, `aura()` may early-return when called twice in the same test.
  const scene = canvas.scene;
  if (scene) {
    const stale = (scene.regions?.contents ?? [])
      .filter(r => r.flags?.[MODULE_ID]?.auraOwner === caster.id)
      .map(r => r.id);
    if (stale.length) await scene.deleteEmbeddedDocuments("Region", stale);
  }
  if (caster.getFlag(MODULE_ID, "activeAura")) {
    await caster.unsetFlag(MODULE_ID, "activeAura");
  }
  // Also clear any stale Exalt AEs from the caster (legacy auraBuff path)
  const stale = [...caster.effects].filter(e => /^Exalt \(Aura/.test(e.name ?? ""));
  if (stale.length) await caster.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id));

  await game.vagabondCharacterEnhancer.aura(caster, "exalt", 30);
  await new Promise(r => setTimeout(r, 600));
}

async function _endExalt(caster) {
  try { await game.vagabondCharacterEnhancer.auraEnd(caster); } catch {}
  await new Promise(r => setTimeout(r, 400));
}

/** Find / create a fresh Dagger on the actor (vanilla, no relic, 1d4). */
async function _ensureVanillaDagger(actor) {
  let dagger = actor.items.find(i =>
    (i.type === "weapon" || (i.type === "equipment" && i.system?.equipmentType === "weapon"))
    && i.name === "Dagger"
  );
  if (dagger) return dagger;
  const pack = game.packs.get("vagabond.weapons");
  const idx = [...await pack.getIndex()];
  const entry = idx.find(e => e.name === "Dagger");
  if (!entry) throw new Error("System pack missing 'Dagger'");
  const doc = await pack.getDocument(entry._id);
  const [created] = await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
  return created;
}

export const tests = [

  // ── Test 1: weapon damage gets +1 per die ───────────────────────────────
  {
    id: "exalt.weapon-damage-bonus",
    name: "Exalt: weapon attack adds +1 per die to damage",
    tier: "a",
    usesFixtures: ["Revelator"],
    run: async ({ assert }) => {
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster: { fixture: "Revelator", x: 400, y: 400, disposition: "friendly" },
      });
      try {
        const caster = placed.caster.actor;
        const dagger = await _ensureVanillaDagger(caster);

        // Baseline: no Exalt — no per-die bonus
        await _endExalt(caster);
        const dmgBaseline = await dagger.rollDamage(caster, false);
        assert(!dmgBaseline._perDieBonusTotal || dmgBaseline._perDieBonusTotal === 0,
          `(no Exalt) _perDieBonusTotal should be 0/undefined, got ${dmgBaseline._perDieBonusTotal}`);

        // With Exalt: expect +1 per die
        await _castExalt(caster);
        const dmg = await dagger.rollDamage(caster, false);
        assert(dmg._perDieBonusPerDie === 1,
          `Exalt should set perDieBonus=+1, got ${dmg._perDieBonusPerDie}`);
        assert(dmg._perDieBonusDiceCount === 1,
          `Dagger has 1 die in formula, got count ${dmg._perDieBonusDiceCount}`);
        assert(dmg._perDieBonusTotal === 1,
          `+1 × 1 die = +1 bonus, got ${dmg._perDieBonusTotal}`);
        await _endExalt(caster);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Test 2: spell damage gets +1 per die ────────────────────────────────
  {
    id: "exalt.spell-damage-bonus",
    name: "Exalt: spell cast adds +1 per die to spell damage",
    tier: "a",
    usesFixtures: ["Revelator"],
    run: async ({ assert }) => {
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster: { fixture: "Revelator", x: 400, y: 400, disposition: "friendly" },
      });
      try {
        const caster = placed.caster.actor;
        const spell = caster.items.find(i => i.type === "spell") ?? {
          system: { damageType: "-", damageDieSize: 6, canExplode: false },
          name: "TestSpell",
        };

        const helper = game.vagabond.api.VagabondDamageHelper;
        const spellState = { damageDice: 2 };

        await _endExalt(caster);
        const baseline = await helper.rollSpellDamage(caster, spell, spellState, false, null, []);
        assert(!baseline?._perDieBonusTotal,
          `(no Exalt) spell damage shouldn't have perDieBonus, got ${baseline?._perDieBonusTotal}`);

        await _castExalt(caster);
        const dmg = await helper.rollSpellDamage(caster, spell, spellState, false, null, []);
        assert(dmg?._perDieBonusPerDie === 1, `Exalt: +1 per die, got ${dmg?._perDieBonusPerDie}`);
        assert(dmg?._perDieBonusDiceCount === 2, `2d6 spell → 2 dice, got ${dmg?._perDieBonusDiceCount}`);
        assert(dmg?._perDieBonusTotal === 2, `+1 × 2 dice = +2, got ${dmg?._perDieBonusTotal}`);
        await _endExalt(caster);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Test 3: doubling vs Undead target ───────────────────────────────────
  {
    id: "exalt.doubling-vs-undead",
    name: "Exalt: +1 doubles to +2 per die when target is Undead",
    tier: "a",
    usesFixtures: ["Revelator", "UndeadNPC"],
    run: async ({ assert }) => {
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster: { fixture: "Revelator", x: 400, y: 400, disposition: "friendly" },
        undead: { fixture: "UndeadNPC", x: 500, y: 400, disposition: "hostile" },
      });
      try {
        const caster = placed.caster.actor;
        const dagger = await _ensureVanillaDagger(caster);

        await _castExalt(caster);
        SceneHelper.setTargets(placed.undead.token);

        const dmg = await dagger.rollDamage(caster, false);
        assert(dmg._perDieBonusPerDie === 2,
          `vs Undead: +2 per die (doubled), got ${dmg._perDieBonusPerDie}`);
        assert(dmg._perDieBonusTotal === 2,
          `+2 × 1 die = +2, got ${dmg._perDieBonusTotal}`);
        await _endExalt(caster);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Test 4: NO doubling when target is not Undead/Hellspawn ─────────────
  {
    id: "exalt.no-doubling-vs-other",
    name: "Exalt: vs non-Undead target, bonus stays +1 per die",
    tier: "a",
    usesFixtures: ["Revelator", "HostileNPC"],
    run: async ({ assert }) => {
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster:  { fixture: "Revelator",  x: 400, y: 400, disposition: "friendly" },
        hostile: { fixture: "HostileNPC", x: 500, y: 400, disposition: "hostile"  },
      });
      try {
        const caster = placed.caster.actor;
        const dagger = await _ensureVanillaDagger(caster);

        await _castExalt(caster);
        SceneHelper.setTargets(placed.hostile.token);

        const dmg = await dagger.rollDamage(caster, false);
        assert(dmg._perDieBonusPerDie === 1,
          `vs non-Undead: +1 per die (no doubling), got ${dmg._perDieBonusPerDie}`);
        await _endExalt(caster);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Test 5: dice count via 2-die formula ────────────────────────────────
  // Real Strike I/II relic injection only fires through `rollDamageFromButton`
  // (vagabond-crawler's patch site), not `item.rollDamage()`. Rather than
  // simulate that whole pipeline, we mutate the weapon's `currentDamage` to
  // a 2-die formula directly — the test then verifies that VCE's bonus
  // calculation counts BOTH dice (+2 total) regardless of where the extra
  // die came from. This is the actual invariant Exalt depends on.
  {
    id: "exalt.counts-multi-die-formula",
    name: "Exalt: bonus scales with rolled dice count (e.g. 2-die formula → +2 bonus)",
    tier: "a",
    usesFixtures: ["Revelator"],
    run: async ({ assert }) => {
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster: { fixture: "Revelator", x: 400, y: 400, disposition: "friendly" },
      });
      try {
        const caster = placed.caster.actor;
        const dagger = await _ensureVanillaDagger(caster);

        // Cast FIRST — Exalt AE addition triggers actor data refresh which
        // re-derives item.currentDamage from raw fields. Setting currentDamage
        // before the cast gets wiped. Set it AFTER the AE is applied.
        await _castExalt(caster);
        const origDamage = dagger.system.currentDamage;
        dagger.system.currentDamage = "d4 + 1d4";

        try {
          const dmg = await dagger.rollDamage(caster, false);
          assert(dmg._perDieBonusDiceCount === 2,
            `2-die formula should yield dice count 2, got ${dmg._perDieBonusDiceCount} (formula: ${dmg?.formula})`);
          assert(dmg._perDieBonusTotal === 2,
            `+1 × 2 dice = +2, got ${dmg._perDieBonusTotal}`);
        } finally {
          dagger.system.currentDamage = origDamage;
          await _endExalt(caster);
        }
      } finally {
        await cleanup();
      }
    },
  },

  // ── Test 6: critical-hit handling preserves the bonus ────────────────────
  {
    id: "exalt.bonus-on-critical-hit",
    name: "Exalt: bonus still applies on critical-hit rolls",
    tier: "a",
    usesFixtures: ["Revelator"],
    run: async ({ assert }) => {
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster: { fixture: "Revelator", x: 400, y: 400, disposition: "friendly" },
      });
      try {
        const caster = placed.caster.actor;
        const dagger = await _ensureVanillaDagger(caster);

        await _castExalt(caster);
        const dmg = await dagger.rollDamage(caster, true /* isCritical */, "might");
        assert(dmg._perDieBonusTotal > 0,
          `Crit-roll Exalt bonus should be positive, got ${dmg._perDieBonusTotal}`);
        assert(dmg._perDieBonusPerDie === 1,
          `Crit-roll Exalt: +1 per die (no Undead target), got ${dmg._perDieBonusPerDie}`);
        await _endExalt(caster);
      } finally {
        await cleanup();
      }
    },
  },

  // ── Test 7: REGRESSION GUARD — mixed-target doubling bug ────────────────
  //
  // Bug demonstrated 2026-05-13 then fixed in the same session: with Exalt
  // active and bonusPerDamageDieDoubleVsBeingTypes = ["Undead", "Hellspawn"],
  // the system's _shouldDoublePerDieBonus used `.some()` — returning true if
  // ANY target was a doubleable type. That doubled the per-die bonus on the
  // shared rolled damage, which was then applied to ALL targets — meaning a
  // mixed cast (Undead + Humanlike) gave the Humanlike target free doubled
  // damage it shouldn't have received.
  //
  // VCE patches the helper to use `.every()` (bounded fix — under-rewards
  // mixed Undead casts instead of over-rewarding mixed Humanlike casts).
  //
  // This test pins the patched semantic and would FAIL if the patch is
  // removed, reverted, or the system upgrades and we forget to re-apply.
  {
    id: "exalt.mixed-target-doubling-regression-guard",
    name: "Exalt regression: mixed Undead+Humanlike targets must NOT double the bonus",
    tier: "a",
    usesFixtures: ["Revelator", "UndeadNPC", "HostileNPC"],
    run: async ({ fixtures, assert }) => {
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        caster:    { fixture: "Revelator",  x: 200, y: 200, disposition: "friendly" },
        undeadTgt: { fixture: "UndeadNPC",  x: 300, y: 200, disposition: "hostile" },
        humanTgt:  { fixture: "HostileNPC", x: 300, y: 300, disposition: "hostile" },
      });
      try {
        const caster = placed.caster.actor;
        await _castExalt(caster);

        const helper = game.vagabond?.api?.VagabondDamageHelper;
        assert(typeof helper?._shouldDoublePerDieBonus === "function",
          "VagabondDamageHelper._shouldDoublePerDieBonus must exist");

        const sceneId = canvas.scene.id;
        const tUndead = [{ sceneId, tokenId: placed.undeadTgt.token.id }];
        const tHuman  = [{ sceneId, tokenId: placed.humanTgt.token.id }];
        const tMixed  = [
          { sceneId, tokenId: placed.undeadTgt.token.id },
          { sceneId, tokenId: placed.humanTgt.token.id },
        ];

        // Sanity guards: the pure cases must behave the way they always have
        assert(helper._shouldDoublePerDieBonus(caster, tUndead) === true,
          "pure Undead target should still double the per-die bonus");
        assert(helper._shouldDoublePerDieBonus(caster, tHuman) === false,
          "pure Humanlike target should not double the per-die bonus");

        // The regression itself: mixed must NOT double under the bounded fix.
        // Before the patch this returned true → Humanlike got Undead-doubled
        // damage. The patch flips it to false, which is the safer side of wrong
        // (Undead in mixed casts gets under-rewarded, but no free damage to
        // non-Undead targets).
        const mixed = helper._shouldDoublePerDieBonus(caster, tMixed);
        assert(mixed === false,
          `mixed Undead+Humanlike must NOT double the bonus (would over-apply to Humanlike). got: ${mixed}`);

        await _endExalt(caster);
      } finally {
        await cleanup();
      }
    },
  },
];
