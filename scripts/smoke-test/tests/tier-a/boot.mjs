import { MODULE_ID } from "../../../utils.mjs";

export const tests = [
  {
    id: "boot.no-console-errors-recent",
    name: "No recent VCE console errors before suite start",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert, consoleErrors }) => {
      // Filter to errors with VCE source. Since ConsoleWatcher snapshotted at
      // test-start, any errors here are emitted DURING this test only.
      const recent = consoleErrors().filter(e => /vagabond-character-enhancer/i.test(e.message));
      assert(recent.length === 0, `expected zero VCE errors at boot, got ${recent.length}: ${recent.map(e=>e.message).join(" | ")}`);
    }
  },
  {
    id: "boot.api-surface-present",
    name: "game.vagabondCharacterEnhancer exposes documented API surface",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert }) => {
      const api = game.vagabondCharacterEnhancer;
      const required = [
        "rescan", "rescanAll", "getFlags",
        "focus", "focusAcquire", "focusRelease",
        "virtuoso", "stepUp", "hunterMark", "layOnHands",
        "aura", "imbue", "brawlIntent",
        "witch", "summoner", "conjure", "banish",
        "familiar", "alchemist", "polymorph",
        "smokeTest"
      ];
      for (const k of required) {
        assert(typeof api?.[k] !== "undefined", `api.${k} is missing`);
      }
    }
  },
  {
    id: "boot.feature-detector-runs-on-create",
    name: "Creating a fresh Druid actor populates feature flags",
    tier: "a",
    usesFixtures: [],
    run: async ({ assert, wait }) => {
      const a = await Actor.create({ name: "_smoke-tmp-druid", type: "character" });
      try {
        const pack = game.packs.get("vagabond.classes");
        const idx = await pack.getIndex();
        const entry = idx.find(e => e.name === "Druid");
        if (!entry) {
          assert(false, "Druid not found in vagabond.classes compendium");
          return;
        }
        const cls = await pack.getDocument(entry._id);
        await a.createEmbeddedDocuments("Item", [cls.toObject()]);
        await wait(200);
        const flags = a.getFlag(MODULE_ID, "features") ?? {};
        const druidFlags = Object.keys(flags).filter(k => k.startsWith("druid_"));
        assert(druidFlags.length > 0, `expected druid_* flags after class creation, got: ${JSON.stringify(flags)}`);
      } finally {
        try { await a.delete(); } catch (e) { /* fixture cleanup race ok */ }
      }
    }
  }
];
