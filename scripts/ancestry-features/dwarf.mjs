/**
 * Dwarf Ancestry Traits
 * Registry entries for all Dwarf traits.
 * Type: Humanlike | Size: Medium
 */

/* -------------------------------------------- */
/*  Trait Registry                              */
/* -------------------------------------------- */

export const DWARF_TRAITS = {
  // Darksight
  // You are not Blinded by Dark.
  "darksight": {
    ancestry: "dwarf",
    flag: "dwarf_darksight",
    description: "You are not Blinded by Dark."
  },

  // Sturdy
  // You have Favor on Saves against being Frightened, Sickened, or Shoved.
  "sturdy": {
    ancestry: "dwarf",
    flag: "dwarf_sturdy",
    description: "You have Favor on Saves against being Frightened, Sickened, or Shoved."
  },

  // Tough
  // You have a bonus to your max HP equal to your Level.
  "tough": {
    ancestry: "dwarf",
    flag: "dwarf_tough",
    description: "You have a bonus to your max HP equal to your Level."
  }
};
