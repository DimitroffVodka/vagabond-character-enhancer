import { MODULE_ID } from "../../../utils.mjs";

export const tests = [
  {
    id: "focus.acquire-and-release",
    name: "FocusManager acquireFeatureFocus + releaseFeatureFocus round-trip",
    tier: "a",
    usesFixtures: ["Generic"],
    run: async ({ fixtures, assert }) => {
      const a = fixtures.Generic;
      const FM = game.vagabondCharacterEnhancer.focus;
      const ok = await FM.acquireFeatureFocus(a, "smoke_demo", "Smoke Demo");
      assert(ok === true, "acquire returned true");
      assert(FM.hasFeatureFocus(a, "smoke_demo"), "feature focus flag set");
      assert(FM.getTotalFocusCount(a) === 1, `expected total count 1, got ${FM.getTotalFocusCount(a)}`);
      await FM.releaseFeatureFocus(a, "smoke_demo");
      assert(!FM.hasFeatureFocus(a, "smoke_demo"), "feature focus flag cleared");
      assert(FM.getTotalFocusCount(a) === 0, "total count back to 0");
    }
  },
  {
    id: "focus.cap-enforced",
    name: "Focus cap blocks acquire when full",
    tier: "a",
    usesFixtures: ["Generic"],
    run: async ({ fixtures, assert }) => {
      const a = fixtures.Generic;
      const FM = game.vagabondCharacterEnhancer.focus;
      const max = a.system.focus?.max ?? 1;
      // Fill to cap
      for (let i = 0; i < max; i++) {
        const r = await FM.acquireFeatureFocus(a, `smoke_fill_${i}`, `fill ${i}`);
        assert(r === true, `fill #${i} should succeed`);
      }
      const overflow = await FM.acquireFeatureFocus(a, "smoke_overflow", "overflow");
      assert(overflow === false, "overflow acquire returned false");
    }
  },
  {
    id: "focus.stale-spellid-deleteItem-hook",
    name: "Deleting a focused spell auto-strips its ID from focus.spellIds",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Witch;
      const [spell] = await a.createEmbeddedDocuments("Item", [{ name: "TmpSmoke", type: "spell", system: {} }]);
      await a.update({ "system.focus.spellIds": [spell.id] });
      await spell.delete();
      await wait(250);
      const ids = a.system.focus?.spellIds ?? [];
      assert(!ids.includes(spell.id), `expected ${spell.id} stripped, got ${JSON.stringify(ids)}`);
    }
  },
  {
    id: "focus.berserk-drops-all-focus",
    name: "Applying Berserk status drops all current focus",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Witch;
      const FM = game.vagabondCharacterEnhancer.focus;
      await FM.acquireFeatureFocus(a, "smoke_berserk_test", "for berserk drop");
      assert(FM.getTotalFocusCount(a) === 1, "have 1 focus before berserk");
      await a.toggleStatusEffect("berserk", { active: true });
      // Poll up to 3s for the drop to commit. The createActiveEffect hook
      // defers _dropAllFocus by 100ms, then unsetFlag() takes another
      // 200-1500ms under heavy suite load. Fixed waits are flaky; poll for
      // the end state.
      const deadline = performance.now() + 3000;
      let total = FM.getTotalFocusCount(a);
      while (performance.now() < deadline && total !== 0) {
        await wait(50);
        total = FM.getTotalFocusCount(a);
      }
      assert(total === 0, `berserk should drop focus to 0, got ${total}`);
    }
  }
];
