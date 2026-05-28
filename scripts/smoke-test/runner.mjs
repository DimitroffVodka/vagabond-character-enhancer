import { MODULE_ID, log } from "../utils.mjs";
import { Fixtures } from "./fixtures.mjs";
import { createAssert } from "./assertions.mjs";
import { ConsoleWatcher } from "./console-watcher.mjs";

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export const Runner = {
  async run(tests, opts = {}) {
    await Fixtures.ensureAll();
    const filtered = tests.filter(t =>
      (!opts.tier || t.tier === opts.tier) &&
      (!opts.pattern || opts.pattern.test(t.id))
    );
    const results = [];
    const overallStart = performance.now();
    for (const test of filtered) {
      const result = await this._runOne(test);
      results.push(result);
      if (opts.failFast && (result.status === "fail" || result.status === "error")) break;
    }
    const summary = this._summarize(results, performance.now() - overallStart);
    return { summary, results };
  },

  async _runOne(test) {
    const start = performance.now();
    const base = {
      id: test.id, name: test.name, tier: test.tier,
      status: "pass", durationMs: 0,
      failures: [], errors: [], consoleErrors: []
    };

    if (test.skip?.()) {
      return { ...base, status: "skip", durationMs: 0, skipReason: test.skipReason ?? null };
    }

    const fixtures = this._collectFixtures(test.usesFixtures ?? [], test.id);
    const snapshot = this._snapshotFixtures(fixtures);
    const chatBaseline = game.messages.size;
    const consoleToken = ConsoleWatcher.snapshot();
    const { assert, failures } = createAssert();

    // Per-test timeout so a test that awaits an unanswered dialog (or any other
    // never-resolving promise) can't hang the whole suite — it aborts as an
    // error and the run continues. No legit test approaches this; the slow-test
    // warning fires at 5s.
    const TEST_TIMEOUT_MS = 30000;
    let timeoutId;
    try {
      if (test.setup) await test.setup({ fixtures });
      const timeoutP = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`test exceeded ${TEST_TIMEOUT_MS}ms — aborted (hung dialog or await?)`)),
          TEST_TIMEOUT_MS
        );
      });
      await Promise.race([
        test.run({
          fixtures,
          assert,
          wait,
          chatTail: () => Array.from(game.messages).slice(chatBaseline),
          consoleErrors: () => ConsoleWatcher.collect(consoleToken)
        }),
        timeoutP
      ]);
      base.failures = failures;
      base.consoleErrors = ConsoleWatcher.collect(consoleToken);
      if (failures.length > 0) base.status = "fail";
      else if (test.failOnConsoleError && base.consoleErrors.length > 0) base.status = "fail";
    } catch (e) {
      base.status = "error";
      base.errors = [{ message: e?.message ?? String(e), stack: e?.stack }];
      base.consoleErrors = ConsoleWatcher.collect(consoleToken);
    } finally {
      clearTimeout(timeoutId);
      // Dismiss any dialog the test (or a fire-and-forget auto-prompt hook like
      // Draken's Draconic Resilience postScan) left open. Leaked dialogs both
      // hang the next "click the top-most dialog" test and accumulate on screen.
      try {
        const inst = foundry.applications?.instances;
        if (inst?.forEach) inst.forEach(app => {
          if (app?.constructor?.name === "DialogV2") { try { app.close(); } catch { /* ignore */ } }
        });
      } catch { /* ignore */ }
      try {
        await this._restoreFixtures(snapshot);
        await this._trimNewChat(chatBaseline);
      } catch (cleanupErr) {
        console.warn(`${MODULE_ID} | SmokeTest | Cleanup error in ${test.id}:`, cleanupErr);
      }
      base.durationMs = Math.round(performance.now() - start);
      if (base.durationMs > 5000) {
        console.warn(`${MODULE_ID} | slow smoke test: ${test.id} took ${base.durationMs}ms`);
      }
    }
    return base;
  },

  _collectFixtures(names, testId) {
    const out = {};
    for (const n of names) {
      const a = Fixtures.get(n);
      if (a) out[n] = a;
      else console.warn(`${MODULE_ID} | SmokeTest | Fixture "${n}" not found — test "${testId}" will likely fail`);
    }
    return out;
  },

  _snapshotFixtures(fixturesMap) {
    const snaps = [];
    for (const [name, actor] of Object.entries(fixturesMap)) {
      snaps.push({
        name,
        actorId: actor.id,
        flagsModule: foundry.utils.deepClone(actor.flags?.[MODULE_ID] ?? {}),
        // TODO: snapshot/restore non-spellIds focus fields (focus.value, focus.max bonus AE consumption) if any test mutates them
        spellIds: [...(actor.system?.focus?.spellIds ?? [])],
        hp: actor.system?.health?.value,
        statuses: [...(actor.statuses ?? [])],
        itemIds: actor.items.map(i => i.id),
        // Full item data (not just ids) so restore can RE-ADD items a test
        // removed — e.g. the original class that swapClass deletes. Without
        // this, restore only deletes added items and leaves class-swap
        // fixtures class-less, corrupting every subsequent class test.
        itemData: actor.items.map(i => i.toObject()),
        effectIds: actor.effects.map(e => e.id)
      });
    }
    return snaps;
  },

  async _restoreFixtures(snaps) {
    for (const s of snaps) {
      const actor = game.actors.get(s.actorId);
      if (!actor) continue;

      // Delete items added during the test
      const newItems = actor.items.filter(i => !s.itemIds.includes(i.id)).map(i => i.id);
      if (newItems.length) await actor.deleteEmbeddedDocuments("Item", newItems);

      // Re-add items the test removed (e.g. a class deleted by swapClass).
      // Recreating items with keepId fires the same item-CRUD hooks the
      // feature-detector listens on, so it rebuilds the correct features +
      // managed AEs from the restored items — no manual AE bookkeeping.
      const presentIds = new Set(actor.items.map(i => i.id));
      const removed = (s.itemData ?? []).filter(d => !presentIds.has(d._id));
      if (removed.length) await actor.createEmbeddedDocuments("Item", removed, { keepId: true });

      // Delete effects added during the test
      const newEffects = actor.effects.filter(e => !s.effectIds.includes(e.id)).map(e => e.id);
      if (newEffects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", newEffects);

      // Restore module flags. Foundry merges flag updates rather than replacing
      // them, so we must do two sequential actor.update() calls:
      //   Pass 1 — delete surplus keys (using Foundry's -=key notation),
      //             recursively for nested objects.
      //   Pass 2 — write back all snapshot key values.
      // Combining both into one call causes the object assignment to win over
      // the -=key deletion because Foundry processes them in document order.
      const currentModuleFlags = actor.flags?.[MODULE_ID] ?? {};
      const deletions = {};
      this._buildFlagDeletions(deletions, `flags.${MODULE_ID}`, s.flagsModule, currentModuleFlags);
      if (Object.keys(deletions).length) await actor.update(deletions, { diff: false });

      // Pass 2: restore all snapshot values + other fields in one update
      const update = {};
      update[`flags.${MODULE_ID}`] = s.flagsModule;
      if (s.hp != null) update["system.health.value"] = s.hp;
      update["system.focus.spellIds"] = s.spellIds;
      await actor.update(update, { diff: false });

      // Restore statuses by toggling differences (after item/AE cleanup, since
      // some statuses come from AEs we may have already removed).
      const current = new Set(actor.statuses ?? []);
      const target  = new Set(s.statuses);
      for (const st of current) {
        if (!target.has(st)) await actor.toggleStatusEffect(st, { active: false }).catch(() => {});
      }
      for (const st of target) {
        if (!current.has(st)) await actor.toggleStatusEffect(st, { active: true }).catch(() => {});
      }
    }
  },

  /**
   * Recursively build a Foundry update object containing ONLY "-=key" deletion
   * entries for keys present in `current` but absent from `snapshot`, at every
   * nesting depth. This is used as Pass 1 of flag restoration; Pass 2 writes
   * back snapshot values.
   *
   * Combining deletions and restorations in one actor.update() call doesn't
   * work: Foundry processes the object assignment after the -=key deletion,
   * causing the deletion to be silently overwritten.
   *
   * @param {object} out      - accumulator object passed to actor.update()
   * @param {string} prefix   - dotted Foundry path prefix (e.g. "flags.vce")
   * @param {object} snapshot - the deep-cloned flag state to restore to
   * @param {object} current  - the actor's current flag state at this level
   */
  _buildFlagDeletions(out, prefix, snapshot, current) {
    // Delete top-level keys absent from snapshot
    for (const k of Object.keys(current ?? {})) {
      if (!(k in snapshot)) {
        out[`${prefix}.-=${k}`] = null;
      }
    }
    // Recurse into nested objects that exist in both snapshot and current
    for (const [k, v] of Object.entries(snapshot)) {
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        const curChild = (current?.[k] != null && typeof current[k] === "object")
          ? current[k] : {};
        this._buildFlagDeletions(out, `${prefix}.${k}`, v, curChild);
      }
    }
  },

  async _trimNewChat(baseline) {
    if (game.messages.size <= baseline) return;
    const all = Array.from(game.messages);
    const toDelete = all.slice(baseline).map(m => m.id);
    if (toDelete.length) await ChatMessage.deleteDocuments(toDelete);
  },

  _summarize(results, durationMs) {
    return {
      total: results.length,
      passed: results.filter(r => r.status === "pass").length,
      failed: results.filter(r => r.status === "fail").length,
      errored: results.filter(r => r.status === "error").length,
      skipped: results.filter(r => r.status === "skip").length,
      durationMs: Math.round(durationMs)
    };
  }
};
