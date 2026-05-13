import { MODULE_ID, log } from "../utils.mjs";
import { FIXTURE_DEFS, FIXTURE_FOLDER_NAME, PACKS } from "./fixture-defs.mjs";

const SMOKE_FLAG = "smokeTestFixture";

export const Fixtures = {
  /** @type {Map<string, Actor>} keyed by fixture short-name (e.g. "Witch") */
  _cache: new Map(),

  async ensureAll() {
    const folder = await this._ensureFolder();
    for (const [shortName, def] of Object.entries(FIXTURE_DEFS)) {
      const actor = await this._ensureFixture(shortName, def, folder);
      this._cache.set(shortName, actor);
    }
    log("SmokeTest", `Fixtures ready: ${[...this._cache.keys()].join(", ")}`);
  },

  get(shortName) {
    if (this._cache.has(shortName)) return this._cache.get(shortName);
    const def = FIXTURE_DEFS[shortName];
    if (!def) return null;
    // TODO: populate _cache on get() lookup so post-reload calls stay fast
    return game.actors.getName(def.name);
  },

  async swapClass(shortName, className, level = 5) {
    const a = this.get(shortName);
    if (!a) throw new Error(`Fixture "${shortName}" not found — call Fixtures.ensureAll first`);
    await this._syncClass(a, { className, level });
    try {
      await a.update({ "system.attributes.level.value": level });
    } catch (e) {
      log("SmokeTest", `Could not set level on ${a.name}: ${e.message}`);
    }
    await game.vagabondCharacterEnhancer.rescan(a);
  },

  async _ensureFolder() {
    let f = game.folders.find(f => f.name === FIXTURE_FOLDER_NAME && f.type === "Actor");
    if (!f) f = await Folder.create({ name: FIXTURE_FOLDER_NAME, type: "Actor", color: "#5d3fd3" });
    return f;
  },

  async _ensureFixture(shortName, def, folder) {
    let a = game.actors.getName(def.name);
    if (!a) {
      a = await Actor.create({
        name: def.name, type: def.type, folder: folder.id,
        flags: { [MODULE_ID]: { [SMOKE_FLAG]: true } }
      });
    }
    // Hygiene: wipe stale VCE flags (except the smokeTestFixture marker).
    // Without this, a crashed/interrupted prior session can leave residue
    // (e.g. featureFocus entries, draconicResilienceType, hunterMark target)
    // that the runner's snapshot/restore then bakes into the test baseline
    // — every subsequent test sees the pollution as its starting state.
    // `features` is preserved because the detector rewrites it on rescan;
    // we don't need to clear it explicitly and clearing it can cause a
    // flash where downstream tests read empty flags before rescan completes.
    await this._wipeStaleFlags(a);
    await this._syncStats(a, def);
    await this._syncClass(a, def);
    await this._syncAncestry(a, def);
    await this._syncSpells(a, def);
    await this._syncItems(a, def);
    return a;
  },

  async _wipeStaleFlags(actor) {
    const KEEP = new Set([SMOKE_FLAG, "features"]);
    const flags = actor.flags?.[MODULE_ID] ?? {};
    const deletions = {};
    for (const k of Object.keys(flags)) {
      if (!KEEP.has(k)) deletions[`flags.${MODULE_ID}.-=${k}`] = null;
    }
    if (Object.keys(deletions).length) {
      await actor.update(deletions, { diff: false });
    }
  },

  async _syncStats(actor, def) {
    if (!def.stats) return;
    const update = {};
    for (const [k, v] of Object.entries(def.stats)) {
      update[`system.stats.${k}.value`] = v;
    }
    if (def.hp != null) {
      update["system.health.value"] = def.hp;
      update["system.health.max"] = def.hp;
    }
    if (def.armor != null) update["system.armor"] = def.armor;
    if (def.beingType != null) update["system.beingType"] = def.beingType;
    await actor.update(update);
  },

  async _syncClass(actor, def) {
    if (!def.className) return;
    const existing = actor.items.find(i => i.type === "class" && i.name === def.className);
    if (existing && existing.system?.level === def.level) return;
    const stale = actor.items.filter(i => i.type === "class" && i.name !== def.className);
    if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map(i => i.id));
    if (existing) {
      await existing.update({ "system.level": def.level });
    } else {
      // Try the system pack first, then fall back to the VCE custom-class
      // pack. Custom classes (Psychic, Monk, Dragoon, Jester, Samurai,
      // Summoner) live there and weren't reachable from this helper before.
      let doc = null;
      for (const packId of [PACKS.classes, PACKS.classesVce]) {
        const pack = game.packs.get(packId);
        if (!pack) continue;
        const idx = await pack.getIndex();
        const entry = idx.find(e => e.name === def.className);
        if (entry) {
          doc = await pack.getDocument(entry._id);
          break;
        }
      }
      if (!doc) {
        log("SmokeTest", `Missing class in any compendium: ${def.className}`);
        return;
      }
      const data = doc.toObject();
      if (data.system) data.system.level = def.level;
      await actor.createEmbeddedDocuments("Item", [data]);
    }
  },

  async _syncAncestry(actor, def) {
    if (!def.ancestryName) return;
    const existing = actor.items.find(i => i.type === "ancestry" && i.name === def.ancestryName);
    if (existing) return;
    // TODO: remove stale ancestry items when ancestryName changes (mirror _syncClass pattern)
    // System pack first, then VCE custom-ancestry fallback (Centaur, Pixie,
    // Kindled, Fiend, Changeling, etc. live in the VCE pack).
    let doc = null;
    for (const packId of [PACKS.ancestries, PACKS.ancestriesVce]) {
      const pack = game.packs.get(packId);
      if (!pack) continue;
      const idx = await pack.getIndex();
      const entry = idx.find(e => e.name === def.ancestryName);
      if (entry) {
        doc = await pack.getDocument(entry._id);
        break;
      }
    }
    if (!doc) {
      log("SmokeTest", `Missing ancestry in any compendium: ${def.ancestryName}`);
      return;
    }
    await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
  },

  async _syncSpells(actor, def) {
    if (!def.spells?.length) return;
    const existing = new Set(actor.items.filter(i => i.type === "spell").map(i => i.name));
    const toAdd = def.spells.filter(name => !existing.has(name));
    if (!toAdd.length) return;
    const stubs = toAdd.map(name => ({ name, type: "spell", system: {} }));
    await actor.createEmbeddedDocuments("Item", stubs);
  },

  async _syncItems(actor, def) {
    if (!def.items?.length) return;
    // In the Vagabond system all physical items (weapons, armor, gear) use type "equipment".
    // The fixture def uses "weapon" as a logical category; map it to the correct doc type.
    const existing = new Set(actor.items.filter(i => i.type === "equipment").map(i => i.name));
    const toAdd = def.items.filter(it => !existing.has(it.name));
    if (!toAdd.length) return;
    const stubs = toAdd.map(it => ({
      name: it.name,
      type: "equipment",
      system: { equipmentType: it.type }
    }));
    await actor.createEmbeddedDocuments("Item", stubs);
  },

  isFixtureActor(actor) {
    return !!actor?.getFlag?.(MODULE_ID, SMOKE_FLAG);
  }
};
