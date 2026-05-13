/**
 * Tier A — Phase 4 cross-cutting behavioral tests.
 *
 * These subsystems sit between classes/ancestries/perks and the system's
 * damage/save pipeline. Existing tests cover their *presence* (the modules
 * load, methods exist), but not the actual logic. Phase 4 closes that gap.
 *
 * Subsystems covered:
 *   - Range Validator       — measureDistance + onPreRollAttack target gating
 *   - Brawl Intent helpers  — getActorSize + getEffectiveShoveSize
 *   - Save Routing          — resolveSaveRoller behavior
 *   - Silver/Metal Weakness — calculateFinalDamage armor-bypass patch
 *
 * Focus consumption is already covered behaviorally in tier-a/focus.mjs
 * (acquire-and-release, cap-enforced, stale-spellid, berserk-drops-all).
 */
import { MODULE_ID } from "../../../utils.mjs";

export const tests = [

  /* ============================================================== */
  /*  RANGE VALIDATOR                                                */
  /* ============================================================== */

  // ── measureDistance: Chebyshev with grid increments ─────────────
  {
    id: "range.measureDistance-chebyshev",
    name: "RangeValidator.measureDistance returns Chebyshev distance in grid units",
    tier: "a",
    usesFixtures: ["TestPC", "HostileNPC"],
    run: async ({ fixtures, assert }) => {
      const { measureDistance } = await import("../../../range-validator.mjs");
      const { SceneHelper } = await import("../../scene-helper.mjs");

      const scene = canvas.scene;
      const gridSize = scene.grid?.size ?? 100;

      // Place attacker at (0, 0) and target 3 squares east + 2 south.
      // Chebyshev = max(3, 2) = 3 grid squares = 15ft (at 5ft per square).
      const { placed, cleanup } = await SceneHelper.placeFixtures({
        attacker: { fixture: "TestPC",     x: 0,             y: 0,             disposition: "friendly" },
        target:   { fixture: "HostileNPC", x: 3 * gridSize,  y: 2 * gridSize,  disposition: "hostile" },
      });
      try {
        const d = measureDistance(placed.attacker.token, placed.target.token);
        // 3 squares × 5ft/square = 15ft (Chebyshev: max of 3, 2)
        assert(d === 15, `Chebyshev distance for (3,2) offset should be 15ft; got ${d}`);
      } finally { await cleanup(); }
    }
  },

  // ── onPreRollAttack: melee weapon at 30ft → blocked ─────────────
  {
    id: "range.melee-out-of-range-blocked",
    name: "RangeValidator blocks melee attack when target is beyond Close range",
    tier: "a",
    usesFixtures: ["TestPC", "HostileNPC"],
    run: async ({ fixtures, assert }) => {
      const { RangeValidator } = await import("../../../range-validator.mjs");
      const { SceneHelper } = await import("../../scene-helper.mjs");
      const scene = canvas.scene;
      const gridSize = scene.grid?.size ?? 100;

      const { placed, cleanup } = await SceneHelper.placeFixtures({
        attacker: { fixture: "TestPC",     x: 0,             y: 0,             disposition: "friendly" },
        target:   { fixture: "HostileNPC", x: 6 * gridSize,  y: 0,             disposition: "hostile" },
      });
      try {
        // Mark target so RangeValidator's `game.user.targets` check fires
        game.user.targets.clear();
        placed.target.token.object?.setTarget(true, { releaseOthers: true, user: game.user });

        // Build a minimal melee weapon (Close range, no special props)
        const meleeWeapon = {
          name: "TestMelee",
          system: {
            equipmentType: "weapon",
            properties: [],
            range: "close",
            weaponSkill: "melee",
          },
          getFlag: () => null,
        };
        const ctx = { item: meleeWeapon, actor: placed.attacker.actor, features: {}, favorHinder: null };
        const blocked = RangeValidator.onPreRollAttack(ctx);
        // 6 squares = 30ft; Close + no Long = 5ft max → out of range
        assert(blocked === true,
          `melee at 30ft should be blocked; got blocked=${blocked}`);
      } finally {
        game.user.targets.clear();
        await cleanup();
      }
    }
  },

  // ── onPreRollAttack: ranged weapon at Close → auto-Hinder ───────
  {
    id: "range.ranged-at-close-hinder",
    name: "RangeValidator applies Hinder to ranged weapon used at Close range",
    tier: "a",
    usesFixtures: ["TestPC", "HostileNPC"],
    run: async ({ fixtures, assert }) => {
      const { RangeValidator } = await import("../../../range-validator.mjs");
      const { SceneHelper } = await import("../../scene-helper.mjs");
      const scene = canvas.scene;
      const gridSize = scene.grid?.size ?? 100;

      const { placed, cleanup } = await SceneHelper.placeFixtures({
        attacker: { fixture: "TestPC",     x: 0,        y: 0,  disposition: "friendly" },
        target:   { fixture: "HostileNPC", x: gridSize, y: 0,  disposition: "hostile" },
      });
      try {
        game.user.targets.clear();
        placed.target.token.object?.setTarget(true, { releaseOthers: true, user: game.user });

        const rangedWeapon = {
          name: "TestRangedBow",
          system: {
            equipmentType: "weapon",
            properties: ["Ranged"],
            range: "far",
            weaponSkill: "ranged",
          },
          getFlag: () => null,
        };
        const ctx = { item: rangedWeapon, actor: placed.attacker.actor, features: {}, favorHinder: null };
        const blocked = RangeValidator.onPreRollAttack(ctx);
        // 5ft (1 square) is Close — ranged at Close should not block, but should Hinder
        assert(blocked === false, `ranged at Close should not be blocked; got blocked=${blocked}`);
        assert(ctx.favorHinder === "hinder",
          `ranged at Close should set favorHinder='hinder'; got '${ctx.favorHinder}'`);
      } finally {
        game.user.targets.clear();
        await cleanup();
      }
    }
  },

  // ── onPreRollAttack: 2 targets, no Cleave → blocked ──────────────
  {
    id: "range.multi-target-no-cleave-blocked",
    name: "RangeValidator blocks attack when 2 targets selected and weapon lacks Cleave",
    tier: "a",
    usesFixtures: ["TestPC", "HostileNPC", "Generic"],
    run: async ({ fixtures, assert }) => {
      const { RangeValidator } = await import("../../../range-validator.mjs");
      const { SceneHelper } = await import("../../scene-helper.mjs");

      const { placed, cleanup } = await SceneHelper.placeFixtures({
        attacker: { fixture: "TestPC",     x: 0,    y: 0,   disposition: "friendly" },
        target1:  { fixture: "HostileNPC", x: 100,  y: 0,   disposition: "hostile" },
        target2:  { fixture: "Generic",    x: 100,  y: 100, disposition: "hostile" },
      });
      try {
        game.user.targets.clear();
        placed.target1.token.object?.setTarget(true, { releaseOthers: false, user: game.user });
        placed.target2.token.object?.setTarget(true, { releaseOthers: false, user: game.user });

        const weapon = {
          name: "TestSword",
          system: {
            equipmentType: "weapon",
            properties: [], // no Cleave
            range: "close",
            weaponSkill: "melee",
          },
          getFlag: () => null,
        };
        const ctx = { item: weapon, actor: placed.attacker.actor, features: {}, favorHinder: null };
        const blocked = RangeValidator.onPreRollAttack(ctx);
        assert(blocked === true,
          `2 targets without Cleave should be blocked; got blocked=${blocked}`);
      } finally {
        game.user.targets.clear();
        await cleanup();
      }
    }
  },

  /* ============================================================== */
  /*  BRAWL INTENT HELPERS                                           */
  /* ============================================================== */

  // ── getActorSize: reads attribute, defaults to medium ────────────
  {
    id: "brawl.getActorSize-defaults-medium",
    name: "BrawlIntent.getActorSize defaults to medium and reads attributes.size",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert }) => {
      const { getActorSize, SIZE_ORDER } = await import("../../../brawl/brawl-intent.mjs");
      const a = fixtures.TestPC;
      const original = a.system?.attributes?.size;
      try {
        // Clear → expect medium (default fallback)
        await a.update({ "system.attributes.size": "" });
        assert(getActorSize(a) === SIZE_ORDER.medium,
          `empty size should default to medium (${SIZE_ORDER.medium}); got ${getActorSize(a)}`);

        // Set to large → expect SIZE_ORDER.large
        await a.update({ "system.attributes.size": "large" });
        assert(getActorSize(a) === SIZE_ORDER.large,
          `size=large should map to ${SIZE_ORDER.large}; got ${getActorSize(a)}`);
      } finally {
        await a.update({ "system.attributes.size": original ?? "medium" });
      }
    }
  },

  // ── getEffectiveShoveSize: Vanguard Wall boosts to Large/Huge ────
  {
    id: "brawl.getEffectiveShoveSize-vanguard-wall",
    name: "BrawlIntent.getEffectiveShoveSize bumps a Medium dancer to Large with vanguard_wall flag",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert }) => {
      const { getEffectiveShoveSize, SIZE_ORDER } = await import("../../../brawl/brawl-intent.mjs");
      const a = fixtures.TestPC;
      const baseline = getEffectiveShoveSize(a, {});
      // TestPC is medium by default
      assert(baseline === SIZE_ORDER.medium,
        `baseline TestPC should be medium; got ${baseline}`);

      // With vanguard_wall (L4) → Large
      const withWall = getEffectiveShoveSize(a, { vanguard_wall: true });
      assert(withWall === SIZE_ORDER.large,
        `vanguard_wall should bump shove size to large (${SIZE_ORDER.large}); got ${withWall}`);

      // With vanguard_wallHuge (L9) → Huge (overrides wall)
      const withWallHuge = getEffectiveShoveSize(a, { vanguard_wall: true, vanguard_wallHuge: true });
      assert(withWallHuge === SIZE_ORDER.huge,
        `vanguard_wallHuge should bump shove size to huge (${SIZE_ORDER.huge}); got ${withWallHuge}`);
    }
  },

  /* ============================================================== */
  /*  SAVE ROUTING                                                   */
  /* ============================================================== */

  // ── resolveSaveRoller returns null when controller flags absent ──
  {
    id: "save-routing.no-controller-returns-null",
    name: "resolveSaveRoller returns null for an actor without controller flags",
    tier: "a",
    usesFixtures: ["HostileNPC"],
    run: async ({ fixtures, assert }) => {
      const { resolveSaveRoller } = await import("../../../companion/save-routing.mjs");
      const npc = fixtures.HostileNPC;
      // Ensure flags are absent
      await npc.unsetFlag(MODULE_ID, "controllerActorId").catch(() => {});
      await npc.unsetFlag(MODULE_ID, "controllerType").catch(() => {});
      const result = resolveSaveRoller(npc);
      assert(result === null,
        `unflagged NPC should resolve to null; got ${JSON.stringify(result?.roller?.name ?? result)}`);
    }
  },

  // ── resolveSaveRoller returns controller PC for flagged companion
  {
    id: "save-routing.flagged-resolves-to-controller",
    name: "resolveSaveRoller returns controller PC for a companion-flagged NPC",
    tier: "a",
    usesFixtures: ["HostileNPC", "Witch"],
    run: async ({ fixtures, assert }) => {
      const { resolveSaveRoller, CONTROLLER_TYPES } = await import("../../../companion/save-routing.mjs");
      const { setController, clearController } = await import("../../../companion/save-routing.mjs");
      const npc = fixtures.HostileNPC;
      const witch = fixtures.Witch;
      try {
        await setController(npc, { controllerId: witch.id, type: CONTROLLER_TYPES.COMPANION });
        const result = resolveSaveRoller(npc);
        assert(!!result, "resolveSaveRoller should return a result object");
        assert(result?.roller?.id === witch.id,
          `roller should be Witch (id=${witch.id}); got ${result?.roller?.id}`);
        assert(result?.type === CONTROLLER_TYPES.COMPANION,
          `type should be companion; got ${result?.type}`);
        // Companion type → Mana skill
        assert(result?.skill === "mana",
          `companion controller uses mana skill; got '${result?.skill}'`);
      } finally {
        await clearController(npc);
      }
    }
  },

  // ── Hireling controller → leadership skill ───────────────────────
  {
    id: "save-routing.hireling-uses-leadership",
    name: "resolveSaveRoller routes hireling-type controller to leadership skill",
    tier: "a",
    usesFixtures: ["HostileNPC", "Witch"],
    run: async ({ fixtures, assert }) => {
      const { resolveSaveRoller, setController, clearController, CONTROLLER_TYPES } =
        await import("../../../companion/save-routing.mjs");
      const npc = fixtures.HostileNPC;
      const witch = fixtures.Witch;
      try {
        await setController(npc, { controllerId: witch.id, type: CONTROLLER_TYPES.HIRELING });
        const result = resolveSaveRoller(npc);
        assert(result?.skill === "leadership",
          `hireling controller uses leadership skill; got '${result?.skill}'`);
        assert(result?.skillLabel === "Leadership",
          `hireling skillLabel = "Leadership"; got "${result?.skillLabel}"`);
      } finally {
        await clearController(npc);
      }
    }
  },

  /* ============================================================== */
  /*  SILVER / METAL WEAKNESS                                        */
  /* ============================================================== */

  // ── calculateFinalDamage: silvered weapon + silver-weak target + ─
  //    typeless damage → armor BYPASSED (VCE fix)
  {
    id: "silver.calculateFinalDamage-armor-bypass",
    name: "calculateFinalDamage bypasses armor for typeless silver damage on silver-weak target",
    tier: "a",
    usesFixtures: ["UndeadNPC"],
    run: async ({ fixtures, assert }) => {
      const helper = game.vagabond?.api?.VagabondDamageHelper;
      assert(typeof helper?.calculateFinalDamage === "function",
        "VagabondDamageHelper.calculateFinalDamage must exist");

      const target = fixtures.UndeadNPC;
      const originalWeaknesses = [...(target.system?.weaknesses ?? [])];
      const originalArmor = target.system?.armor;
      try {
        // Add silver to the target's weaknesses, ensure armor > 0 so we can
        // observe whether it gets bypassed.
        await target.update({
          "system.weaknesses": [...originalWeaknesses, "silver"],
          "system.armor": 3,
        });

        const silverWeapon = {
          name: "TestSilverBlade",
          system: { metal: "silver", damageType: "-" },
        };

        // VCE's patch: typeless + silver weapon + silver-weak target → armor bypassed
        // Pass 10 damage. Without bypass: 10 - 3 = 7. With bypass: 10.
        const bypassed = helper.calculateFinalDamage(target, 10, "-", silverWeapon);
        assert(bypassed === 10,
          `silver vs silver-weak (typeless) should bypass armor: expected 10, got ${bypassed}`);

        // Negative control: same target, normal "none"-metal weapon → armor applies
        const ironWeapon = { name: "TestIronBlade", system: { metal: "none", damageType: "-" } };
        const armored = helper.calculateFinalDamage(target, 10, "-", ironWeapon);
        assert(armored === 7,
          `non-silver typeless damage should still subtract armor: expected 7, got ${armored}`);
      } finally {
        await target.update({
          "system.weaknesses": originalWeaknesses,
          "system.armor": originalArmor,
        });
      }
    }
  },

  /* ============================================================== */
  /*  CONCURRENCY — per-defender damage source attribution           */
  /* ============================================================== */
  //
  // Bug (Gemini review, 2026-05-13): VCE used a module-level `let
  // _damageSourceActorId` to pass the attacker's id through async damage-apply
  // flows. Concurrent flows on different defenders would overwrite each
  // other's state during await yields — A's Apex Predator handler would see
  // B's source actor, and B's would see `null` because A's finally cleared it.
  //
  // Demonstrated as a generic JS race in the review thread (Promise.all on
  // two flows touching the same module-level let → both flows corrupted).
  //
  // Fix: replaced the single module global with a `WeakMap<defenderActor,
  // sourceId>`. Each writer (handleSaveRoll, handleSaveReminderRoll,
  // handleApplySaveDamage, handleApplyDirect) now sets per-defender; readers
  // in calculateFinalDamage + processCausedStatuses look up by their own
  // `actor` arg (which IS the defender). Two flows on different defenders
  // can no longer corrupt each other.
  //
  // Test races two concurrent flows that each:
  //   1. Set a distinct source for their distinct defender
  //   2. Await briefly to let the OTHER flow's set land
  //   3. Read back their own defender's source via getDamageSourceFor
  //   4. Verify it's STILL their original source (not the other flow's)
  //
  // Pre-refactor this test would have shown crossover (A reads B's source).
  {
    id: "concurrency.damage-source-per-defender-race-safe",
    name: "Concurrency: per-defender damage-source attribution survives concurrent async flows",
    tier: "a",
    usesFixtures: ["HostileNPC", "UndeadNPC", "Revelator", "Witch"],
    run: async ({ fixtures, assert }) => {
      const vce = await import("../../../vagabond-character-enhancer.mjs");
      assert(typeof vce.getDamageSourceFor === "function",
        "getDamageSourceFor must be exported");
      assert(typeof vce._setDamageSource === "function",
        "_setDamageSource must be exported for tests");
      assert(typeof vce._clearDamageSource === "function",
        "_clearDamageSource must be exported for tests");

      const defenderA = fixtures.HostileNPC;
      const defenderB = fixtures.UndeadNPC;
      const sourceA = fixtures.Revelator.id;
      const sourceB = fixtures.Witch.id;

      // Sanity: both unset → null
      vce._clearDamageSource(defenderA);
      vce._clearDamageSource(defenderB);
      assert(vce.getDamageSourceFor(defenderA) === null,
        `precondition: defender A source should be null; got ${vce.getDamageSourceFor(defenderA)}`);
      assert(vce.getDamageSourceFor(defenderB) === null,
        `precondition: defender B source should be null; got ${vce.getDamageSourceFor(defenderB)}`);

      // Race: each flow sets its own source, yields, reads its own back.
      // With the old module-level `let _damageSourceActorId`, both flows would
      // see whichever's set landed last (and one would see null after the
      // other's finally cleared). With per-defender WeakMap, each flow sees
      // its own.
      async function flow(defender, sourceId, otherSetFn) {
        vce._setDamageSource(defender, sourceId);
        // Yield so the other flow can also run its set() before we read.
        await new Promise(r => setTimeout(r, 15));
        const observed = vce.getDamageSourceFor(defender);
        vce._clearDamageSource(defender);
        return { defender: defender.name, set: sourceId, observed };
      }

      const [resA, resB] = await Promise.all([
        flow(defenderA, sourceA),
        flow(defenderB, sourceB),
      ]);

      assert(resA.observed === sourceA,
        `flow A defender ${resA.defender}: expected its own source "${sourceA}", got "${resA.observed}" — RACE!`);
      assert(resB.observed === sourceB,
        `flow B defender ${resB.defender}: expected its own source "${sourceB}", got "${resB.observed}" — RACE!`);

      // Sanity post-clear
      assert(vce.getDamageSourceFor(defenderA) === null,
        `defender A should be cleared post-test; got ${vce.getDamageSourceFor(defenderA)}`);
      assert(vce.getDamageSourceFor(defenderB) === null,
        `defender B should be cleared post-test; got ${vce.getDamageSourceFor(defenderB)}`);
    }
  },

  // ── calculateFinalDamage: silver weapon vs target NOT weak to silver
  //    → armor still applies (no false-positive bypass)
  {
    id: "silver.no-weakness-no-bypass",
    name: "calculateFinalDamage does not bypass armor when target is not weak to weapon's metal",
    tier: "a",
    usesFixtures: ["HostileNPC"],
    run: async ({ fixtures, assert }) => {
      const helper = game.vagabond?.api?.VagabondDamageHelper;
      const target = fixtures.HostileNPC;
      const originalWeaknesses = [...(target.system?.weaknesses ?? [])];
      const originalArmor = target.system?.armor;
      try {
        // Ensure target has NO silver weakness, and a real armor value
        await target.update({
          "system.weaknesses": originalWeaknesses.filter(w => w !== "silver"),
          "system.armor": 2,
        });
        const silverWeapon = { name: "TestSilverBlade", system: { metal: "silver", damageType: "-" } };
        const final = helper.calculateFinalDamage(target, 10, "-", silverWeapon);
        assert(final === 8,
          `target without silver weakness should still get armor: expected 10-2=8, got ${final}`);
      } finally {
        await target.update({
          "system.weaknesses": originalWeaknesses,
          "system.armor": originalArmor,
        });
      }
    }
  },
];
