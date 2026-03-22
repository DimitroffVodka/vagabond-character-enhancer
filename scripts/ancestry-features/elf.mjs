/**
 * Elf Ancestry Traits
 * Registry entries for all Elf traits.
 * Type: Fae | Size: Medium
 */

/* -------------------------------------------- */
/*  Trait Registry                              */
/* -------------------------------------------- */

export const ELF_TRAITS = {
  // Ascendancy
  // You are Trained in a Skill from either Arcana, Mysticism, Influence, or
  // in Ranged Attacks.
  "ascendancy": {
    ancestry: "elf",
    flag: "elf_ascendancy",
    description: "You are Trained in a Skill from either Arcana, Mysticism, Influence, or Ranged Attacks."
  },

  // Elven Eyes
  // You have Favor on sight-based Detect Checks.
  "elven eyes": {
    ancestry: "elf",
    flag: "elf_elvenEyes",
    description: "You have Favor on sight-based Detect Checks."
  },

  // Naturally Attuned
  // You know a Spell and can Cast it with a Skill of your choice.
  "naturally attuned": {
    ancestry: "elf",
    flag: "elf_naturallyAttuned",
    description: "You know a Spell and can Cast it with a Skill of your choice."
  }
};
