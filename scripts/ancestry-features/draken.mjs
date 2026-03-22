/**
 * Draken Ancestry Traits
 * Registry entries for all Draken traits.
 * Type: Cryptid | Size: Medium
 */

/* -------------------------------------------- */
/*  Trait Registry                              */
/* -------------------------------------------- */

export const DRAKEN_TRAITS = {
  // Breath Attack
  // You can attack with an Endure or Will Save to make a 15' Cone of draconic
  // breath that deals 2d6!. Afterward, you can't use this Ability until you Rest
  // or take 1 Fatigue to do so again.
  "breath attack": {
    ancestry: "draken",
    flag: "draken_breathAttack",
    description: "Endure or Will Save to make a 15' Cone dealing 2d6! draconic breath. Recharges on Rest or 1 Fatigue."
  },

  // Scale
  // You have a +1 bonus to Armor Rating.
  "scale": {
    ancestry: "draken",
    flag: "draken_scale",
    description: "You have a +1 bonus to Armor Rating."
  },

  // Draconic Resilience
  // You take half damage from a source of your choice from either Acid, Cold,
  // Fire, or Shock.
  "draconic resilience": {
    ancestry: "draken",
    flag: "draken_draconicResilience",
    description: "You take half damage from a chosen source: Acid, Cold, Fire, or Shock."
  }
};
