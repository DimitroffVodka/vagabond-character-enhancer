/**
 * Beast Cache
 * Caches beast data from compendiums on module ready for instant access.
 * Prioritizes module compendium (vce-beasts) over system compendium (vagabond.bestiary).
 */

const MODULE_ID = "vagabond-character-enhancer";
const VCE_PACK_ID = `${MODULE_ID}.vce-beasts`;
const SYSTEM_PACK_ID = "vagabond.bestiary";

export const BeastCache = {

  /** @type {Map<string, object>} Cached beast index: name → summary data */
  _index: new Map(),

  /** @type {Map<string, string>} Maps beast name → compendium pack ID for full fetch */
  _packMap: new Map(),

  /** @type {boolean} Whether the cache has been initialized */
  _ready: false,

  /**
   * Initialize the cache on module ready.
   * Loads beast index from both compendiums, module overrides system.
   */
  async initialize() {
    if (this._ready) return;

    const t0 = performance.now();

    // 1. Load system bestiary first (base data)
    const systemPack = game.packs.get(SYSTEM_PACK_ID);
    if (systemPack) {
      const index = await systemPack.getIndex({ fields: [
        "system.beingType", "system.hd", "system.size", "system.armor",
        "system.speed", "system.speedTypes", "system.speedValues",
        "system.actions", "system.abilities", "system.senses",
        "system.immunities", "system.weaknesses"
      ]});

      for (const entry of index) {
        if (entry.system?.beingType !== "Beasts") continue;
        this._index.set(entry.name, {
          _id: entry._id,
          name: entry.name,
          img: entry.img,
          hd: entry.system.hd ?? 1,
          size: entry.system.size ?? "medium",
          armor: entry.system.armor ?? 0,
          speed: entry.system.speed ?? 30,
          speedTypes: entry.system.speedTypes,
          speedValues: entry.system.speedValues,
          senses: entry.system.senses,
          immunities: entry.system.immunities || [],
          weaknesses: entry.system.weaknesses || [],
          actions: entry.system.actions || [],
          abilities: entry.system.abilities || [],
          packId: SYSTEM_PACK_ID
        });
        this._packMap.set(entry.name, SYSTEM_PACK_ID);
      }
    }

    // 2. Load module overrides (these take priority)
    const vcePack = game.packs.get(VCE_PACK_ID);
    if (vcePack) {
      const index = await vcePack.getIndex({ fields: [
        "system.beingType", "system.hd", "system.size", "system.armor",
        "system.speed", "system.speedTypes", "system.speedValues",
        "system.actions", "system.abilities", "system.senses",
        "system.immunities", "system.weaknesses"
      ]});

      for (const entry of index) {
        if (entry.system?.beingType !== "Beasts") continue;
        this._index.set(entry.name, {
          _id: entry._id,
          name: entry.name,
          img: entry.img,
          hd: entry.system.hd ?? 1,
          size: entry.system.size ?? "medium",
          armor: entry.system.armor ?? 0,
          speed: entry.system.speed ?? 30,
          speedTypes: entry.system.speedTypes,
          speedValues: entry.system.speedValues,
          senses: entry.system.senses,
          immunities: entry.system.immunities || [],
          weaknesses: entry.system.weaknesses || [],
          actions: entry.system.actions || [],
          abilities: entry.system.abilities || [],
          packId: VCE_PACK_ID
        });
        this._packMap.set(entry.name, VCE_PACK_ID);
      }
    }

    this._ready = true;
    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`${MODULE_ID} | BeastCache | Cached ${this._index.size} beasts in ${elapsed}ms`);
  },

  /**
   * Get all beasts with HD ≤ maxHD.
   * @param {number} maxHD - Maximum hit dice
   * @returns {object[]} Array of beast summary objects
   */
  getAvailableBeasts(maxHD) {
    const results = [];
    for (const beast of this._index.values()) {
      if (beast.hd <= maxHD) results.push(beast);
    }
    return results.sort((a, b) => a.hd - b.hd || a.name.localeCompare(b.name));
  },

  /**
   * Get a specific beast by name.
   * @param {string} name - Beast name
   * @returns {object|null} Beast summary or null
   */
  getBeast(name) {
    return this._index.get(name) || null;
  },

  /**
   * Fetch the full Actor document from the compendium.
   * Only called when a beast is actually selected for transformation.
   * @param {string} name - Beast name
   * @returns {Promise<Actor|null>} Full actor document
   */
  async fetchFullBeast(name) {
    const summary = this._index.get(name);
    if (!summary) return null;

    const packId = this._packMap.get(name);
    const pack = game.packs.get(packId);
    if (!pack) return null;

    return pack.getDocument(summary._id);
  },

  /**
   * Get the total number of cached beasts.
   * @returns {number}
   */
  get size() {
    return this._index.size;
  }
};
