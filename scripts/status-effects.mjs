/**
 * Status Effects Reference
 * Documents all status conditions in the Vagabond system, their automation level,
 * and what the system vs module handles.
 *
 * This file serves as a reference for understanding what the system already
 * automates and what gaps exist that this module could fill.
 *
 * Automation levels (from system config descriptions):
 *   "fully_automated" — System handles all mechanical effects via Active Effects / code.
 *   "partial"         — System handles some parts, others require manual tracking or module help.
 *   "manual"          — System only provides the status icon. All mechanics are GM/player managed.
 */

/* -------------------------------------------- */
/*  Status Effects Registry                     */
/* -------------------------------------------- */

export const STATUS_EFFECTS_REGISTRY = {
  // ──────────────────────────────────────────────
  // Focusing
  // ──────────────────────────────────────────────
  // Currently sustaining one or more spells through Focus.
  //
  // AUTOMATION: partial
  // SYSTEM: Tracks Focus state. Visual indicator on token.
  // NOT ENFORCED: Focus capacity limits may need module support.
  "focusing": {
    id: "focusing",
    icon: "icons/svg/aura.svg",
    automation: "partial",
    description: "Currently sustaining one or more spells through Focus."
  },

  // ──────────────────────────────────────────────
  // Berserk
  // ──────────────────────────────────────────────
  // Can't take Cast Action or Focus. Doesn't make Morale Checks.
  // Can't be Frightened. Class-specific bonuses are applied via
  // Active Effects using @statuses.berserk formulas.
  //
  // AUTOMATION: partial
  // SYSTEM: Status icon on token. Config describes restrictions but
  //   mechanical enforcement is limited. The system uses @statuses.berserk
  //   in AE formulas for conditional bonuses (actor-character.mjs:1006).
  //   damage-helper.mjs:1178 checks berserk for DR application.
  // NOT ENFORCED BY SYSTEM: Cast/Focus prevention, Frightened immunity, Morale skip.
  //   These are described in config but not mechanically blocked by the system.
  //
  // MODULE HANDLES (barbarian.mjs):
  //   - When Berserk is applied to a barbarian with Rage, creates a companion
  //     "Rage (Active)" AE that adds Frightened to statusImmunities.
  //   - When Berserk is removed, deletes the companion AE.
  //   - Cast/Focus prevention: NOT YET (would need to block the Cast action UI)
  //   - Morale skip: NOT YET (morale system in vagabond-crawler handles this)
  //
  // NOTE: Berserk can be caused by non-Barbarian sources (Apoplex spell, etc).
  //   The Frightened immunity currently only applies to barbarians with Rage.
  //   A more complete implementation would add Frightened immunity to ALL
  //   Berserk actors, but that would require a separate hook not gated by Rage.
  "berserk": {
    id: "berserk",
    icon: "icons/svg/terror.svg",
    automation: "partial",
    description: "Can't take Cast Action or Focus. Doesn't make Morale Checks. Can't be Frightened. Class-specific bonuses applied via @statuses.berserk AE formulas."
  },

  // ──────────────────────────────────────────────
  // Burning
  // ──────────────────────────────────────────────
  // Takes damage at the start of its turn.
  //
  // AUTOMATION: manual
  // SYSTEM: Status icon only. The countdown dice system (if using the
  //   vagabond-crawler module) handles burning damage automatically.
  // MODULE: Could hook round start to auto-apply burning damage.
  "burning": {
    id: "burning",
    icon: "icons/svg/fire.svg",
    automation: "manual",
    description: "Takes damage at the start of its turn. Can be ended by an appropriate action."
  },

  // ──────────────────────────────────────────────
  // Charmed
  // ──────────────────────────────────────────────
  // Can't willingly make an Attack Action targeting the one who Charmed it.
  //
  // AUTOMATION: manual
  // SYSTEM: Status icon only. No mechanical enforcement.
  // NOTE: Attack prevention would need to know WHO charmed the target,
  //   which requires tracking the charm source.
  "charmed": {
    id: "charmed",
    icon: "icons/svg/heal.svg",
    automation: "manual",
    description: "Can't willingly make an Attack Action targeting the one who Charmed it."
  },

  // ──────────────────────────────────────────────
  // Suffocating
  // ──────────────────────────────────────────────
  // After not breathing for 1 minute, each round: Heroes roll d8
  // (if >= Might, gain 1 Fatigue), Enemies gain 1 Fatigue.
  //
  // AUTOMATION: manual
  // SYSTEM: Status icon only.
  "suffocating": {
    id: "suffocating",
    icon: "icons/svg/stoned.svg",
    automation: "manual",
    description: "After not breathing for 1 minute, each round: Heroes roll d8 (if >= Might, gain 1 Fatigue), Enemies gain 1 Fatigue."
  },

  // ──────────────────────────────────────────────
  // Dazed
  // ──────────────────────────────────────────────
  // Can't Focus or Move unless it uses an Action to do so. Speed reduced to 0.
  //
  // AUTOMATION: partial
  // SYSTEM: Speed = 0 is automated. Action restrictions are manual.
  "dazed": {
    id: "dazed",
    icon: "icons/svg/sleep.svg",
    automation: "partial",
    description: "Can't Focus or Move unless it uses an Action to do so. Speed reduced to 0."
  },

  // ──────────────────────────────────────────────
  // Fatigued
  // ──────────────────────────────────────────────
  // Each Fatigue occupies an Item Slot. At 3+ Fatigue, can't Rush.
  // At 5 Fatigue, dies.
  //
  // AUTOMATION: partial
  // SYSTEM: Fatigue tracker on character sheet. Slot reduction automatic.
  //   Rush prevention and death at 5 may be manual.
  "fatigued": {
    id: "fatigued",
    icon: "icons/svg/degen.svg",
    automation: "partial",
    description: "Each Fatigue occupies an Item Slot. At 3+ Fatigue, can't Rush. At 5 Fatigue, dies."
  },

  // ──────────────────────────────────────────────
  // Prone
  // ──────────────────────────────────────────────
  // Speed = 0. Costs 10' Speed to stand. Can crawl (2:1 ratio).
  // Can't Rush. Vulnerable (attacks/saves Hindered, incoming attacks Favored).
  //
  // AUTOMATION: partial
  // SYSTEM: Speed = 0 and Vulnerable are automated.
  //   Stand cost and crawl ratio are manual.
  "prone": {
    id: "prone",
    icon: "icons/svg/falling.svg",
    automation: "partial",
    description: "Speed = 0. Costs 10' Speed to stand. Can crawl (2:1 ratio). Can't Rush. Vulnerable."
  },

  // ──────────────────────────────────────────────
  // Frightened
  // ──────────────────────────────────────────────
  // -2 penalty to all damage dealt.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated via Active Effects.
  "frightened": {
    id: "frightened",
    icon: "icons/svg/hazard.svg",
    automation: "fully_automated",
    description: "-2 penalty to all damage dealt."
  },

  // ──────────────────────────────────────────────
  // Sickened
  // ──────────────────────────────────────────────
  // -2 penalty to any healing received.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated via Active Effects.
  "sickened": {
    id: "sickened",
    icon: "icons/svg/poison.svg",
    automation: "fully_automated",
    description: "-2 penalty to any healing received."
  },

  // ──────────────────────────────────────────────
  // Confused
  // ──────────────────────────────────────────────
  // Checks and Saves have Hinder. Saves against its Actions have Favor.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated via Active Effects.
  "confused": {
    id: "confused",
    icon: "icons/svg/daze.svg",
    automation: "fully_automated",
    description: "Checks and Saves have Hinder. Saves against its Actions have Favor."
  },

  // ──────────────────────────────────────────────
  // Vulnerable
  // ──────────────────────────────────────────────
  // Its attacks and saves have Hinder. Attacks targeting it have Favor.
  // Saves against its attacks have Favor.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated via Active Effects.
  "vulnerable": {
    id: "vulnerable",
    icon: "icons/svg/downgrade.svg",
    automation: "fully_automated",
    description: "Its attacks and saves have Hinder. Attacks targeting it have Favor. Saves against its attacks have Favor."
  },

  // ──────────────────────────────────────────────
  // Blinded
  // ──────────────────────────────────────────────
  // Can't see. Vulnerable.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated — applies Vulnerable effects.
  "blinded": {
    id: "blinded",
    icon: "icons/svg/blind.svg",
    automation: "fully_automated",
    description: "Can't see. Vulnerable."
  },

  // ──────────────────────────────────────────────
  // Invisible
  // ──────────────────────────────────────────────
  // Can't be seen. Attackers act as Blinded (attacks Hindered).
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated via Active Effects.
  "invisible": {
    id: "invisible",
    icon: "icons/svg/invisible.svg",
    automation: "fully_automated",
    description: "Can't be seen. Attackers act as Blinded (attacks Hindered)."
  },

  // ──────────────────────────────────────────────
  // Restrained
  // ──────────────────────────────────────────────
  // Vulnerable + Speed = 0.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated — applies Vulnerable + Speed = 0.
  "restrained": {
    id: "restrained",
    icon: "icons/svg/teleport.svg",
    automation: "fully_automated",
    description: "Vulnerable + Speed = 0."
  },

  // ──────────────────────────────────────────────
  // Grappling
  // ──────────────────────────────────────────────
  // Restraining a target. Speed halved unless target is smaller.
  //
  // AUTOMATION: partial
  // SYSTEM: Speed penalty applied at grapple time.
  //   Bidirectional cleanup (deleteActiveEffect hook in vagabond.mjs).
  "grappling": {
    id: "grappling",
    icon: "icons/svg/net.svg",
    automation: "partial",
    description: "Restraining a target. Speed halved unless target is smaller."
  },

  // ──────────────────────────────────────────────
  // Incapacitated
  // ──────────────────────────────────────────────
  // Can't Focus, use Actions, or Move. Automatically fails Might and
  // Dexterity checks. Vulnerable. Speed = 0.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated via Active Effects.
  "incapacitated": {
    id: "incapacitated",
    icon: "icons/svg/unconscious.svg",
    automation: "fully_automated",
    description: "Can't Focus, use Actions, or Move. Auto-fails Might and Dexterity checks. Vulnerable. Speed = 0."
  },

  // ──────────────────────────────────────────────
  // Paralyzed
  // ──────────────────────────────────────────────
  // Incapacitated + Speed = 0.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated — applies Incapacitated effects.
  "paralyzed": {
    id: "paralyzed",
    icon: "icons/svg/paralysis.svg",
    automation: "fully_automated",
    description: "Incapacitated + Speed = 0."
  },

  // ──────────────────────────────────────────────
  // Unconscious
  // ──────────────────────────────────────────────
  // Blinded + Incapacitated + Prone. Close Attacks always Crit.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated — applies Blinded + Incapacitated + Prone.
  "unconscious": {
    id: "unconscious",
    icon: "icons/svg/sleep.svg",
    automation: "fully_automated",
    description: "Blinded + Incapacitated + Prone. Close Attacks always Crit."
  },

  // ──────────────────────────────────────────────
  // Dead
  // ──────────────────────────────────────────────
  // Same as Incapacitated but automatically fails ALL rolls.
  //
  // AUTOMATION: fully_automated
  // SYSTEM: Fully automated. Auto-applied when HP reaches 0
  //   (vagabond.mjs updateActor hook).
  "dead": {
    id: "dead",
    icon: "icons/svg/skull.svg",
    automation: "fully_automated",
    description: "Same as Incapacitated but automatically fails ALL rolls (stats, skills, saves, attacks)."
  }
};
