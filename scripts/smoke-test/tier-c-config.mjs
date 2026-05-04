/**
 * Tier C — perk + spell test generation config.
 * Skips: emit a skip result with the reason (no run).
 * Overrides: load a custom test.run from the named module.
 *
 * Populated during Task 11 triage and Task 13 final pass.
 */
export const TIER_C_SKIPS = {
  perks: {
    // Add perks here that can't be smoke-tested.
    // Example: "lucky strike": "GM-arbitrated reroll, no automation hook"
    "primordial summoner": "Not in vagabond.perks system compendium (v5.3.0). PERK_REGISTRY references a perk the system doesn't ship."
  },
  spells: {
    "polymorph": "Already covered by Tier A polymorph round-trip"
  }
};

export const TIER_C_OVERRIDES = {
  perks: {},
  spells: {}
};
