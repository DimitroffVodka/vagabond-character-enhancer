/**
 * Human Ancestry Traits
 * Registry entries for all Human traits.
 * Type: Humanlike | Size: Medium
 */

/* -------------------------------------------- */
/*  Trait Registry                              */
/* -------------------------------------------- */

export const HUMAN_TRAITS = {
  // Knack
  // You gain a Perk and a Training.
  "knack": {
    ancestry: "human",
    flag: "human_knack",
    description: "You gain a Perk and a Training."
  },

  // Strong Potential
  // Increase one of your Stats by 1, but no higher than 7.
  "strong potential": {
    ancestry: "human",
    flag: "human_strongPotential",
    description: "Increase one of your Stats by 1, but no higher than 7."
  }
};
