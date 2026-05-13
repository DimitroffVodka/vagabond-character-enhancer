/**
 * Fixture specs for the smoke test suite.
 * Each entry declares the desired post-build state of one fixture actor.
 * The builder diffs current state against this spec and patches deltas.
 */
export const FIXTURE_FOLDER_NAME = "VCE Smoke Test (do not delete)";
export const FIXTURE_PREFIX = "_smoke-";

// Compendium pack IDs
// Core classes/ancestries come from the system pack (vagabond.*).
// The vce-classes/vce-ancestries packs contain VCE homebrew additions only.
export const PACKS = {
  classes: "vagabond.classes",
  perks:   "vagabond-character-enhancer.vce-perks",
  ancestries: "vagabond.ancestries",
};

export const FIXTURE_DEFS = {
  Generic: {
    name: "_smoke-Generic",
    type: "character",
    className: "Fighter",
    level: 5,
    ancestryName: "Human",
    stats: { mig: 5, dex: 4, awr: 3, rsn: 2, prs: 3, lck: 3 },
    perks: [],
    items: [
      { name: "Longsword", type: "weapon" },
      { name: "Dagger", type: "weapon" }
    ],
    spells: [],
  },
  Druid: {
    name: "_smoke-Druid",
    type: "character",
    className: "Druid",
    level: 5,
    ancestryName: "Human",
    stats: { mig: 3, dex: 3, awr: 6, rsn: 3, prs: 3, lck: 3 },
    perks: [],
    items: [],
    spells: ["Polymorph", "Bless"],
  },
  Revelator: {
    name: "_smoke-Revelator",
    type: "character",
    className: "Revelator",
    level: 5,
    ancestryName: "Human",
    stats: { mig: 3, dex: 3, awr: 3, rsn: 3, prs: 6, lck: 3 },
    perks: [],
    items: [],
    spells: ["Bless", "Life"],
  },
  Witch: {
    name: "_smoke-Witch",
    type: "character",
    className: "Witch",
    level: 5,
    ancestryName: "Human",
    stats: { mig: 3, dex: 3, awr: 6, rsn: 3, prs: 3, lck: 3 },
    perks: [],
    items: [
      { name: "Dagger", type: "weapon" }
    ],
    spells: ["Burn", "Bless", "Imbue", "Ward", "Hex"],
  },
  NPC: {
    name: "_smoke-NPC",
    type: "npc",
    stats: { mig: 1, dex: 2, awr: 2, rsn: 2, prs: 2, lck: 1 },
    hp: 1,
    armor: 0,
  },
  // Hostile generic — for disposition-filter tests (Bless/Ward/Exalt allies-only).
  // Disposition is set on the token at place-time, not on the actor.
  HostileNPC: {
    name: "_smoke-HostileNPC",
    type: "npc",
    stats: { mig: 1, dex: 2, awr: 2, rsn: 2, prs: 2, lck: 1 },
    hp: 999,
    armor: 0,
  },
  // Undead-typed hostile — for Exalt doubling tests.
  UndeadNPC: {
    name: "_smoke-UndeadNPC",
    type: "npc",
    stats: { mig: 1, dex: 2, awr: 2, rsn: 2, prs: 2, lck: 1 },
    hp: 999,
    armor: 0,
    beingType: "Undead",
  },
  TestPC: {
    name: "_smoke-TestPC",
    type: "character",
    className: null,
    level: 5,
    ancestryName: "Human",
    stats: { mig: 4, dex: 4, awr: 4, rsn: 4, prs: 4, lck: 3 },
    perks: [],
    items: [],
    spells: [],
  },
};
