/**
 * Perk Features
 * Registry entries for all Vagabond perks (alphabetical).
 */

/* -------------------------------------------- */
/*  Perk Registry                               */
/* -------------------------------------------- */

export const PERK_REGISTRY = {
  "abjurer": {
    flag: "perk_abjurer",
    description: "While Focusing on Ward with another Being as Target, you also gain the benefits of Ward."
  },
  "advancement": {
    flag: "perk_advancement",
    description: "Increase one of your Stats by 1. You can take this Perk multiple times."
  },
  "akimbo trigger": {
    flag: "perk_akimboTrigger",
    description: "Attacking a Close Target with Ranged doesn't Hinder. Move up to half Speed when skipping Move to attack."
  },
  "ambusher": {
    flag: "perk_ambusher",
    description: "Favor on attacks to initiate Combat and against Beings that haven't acted in that Combat."
  },
  "animal companion": {
    flag: "perk_animalCompanion",
    description: "Tame a non-hostile Beast with HD no higher than half your Level as a companion."
  },
  "arcane artisan": {
    flag: "perk_arcaneArtisan",
    description: "When Crafting, spend Mana to supplement Materials at 5s per Mana spent."
  },
  "archaeologist": {
    flag: "perk_archaeologist",
    description: "Favor on Checks and Saves against traps. Will Save to instantly break curses."
  },
  "assured healer": {
    flag: "perk_assuredHealer",
    description: "Healing rolls of your Spells Explode on a 1."
  },
  "athame": {
    flag: "perk_athame",
    description: "10-minute Ritual to make a dagger your athame (Relic with Loyalty, usable as Trinket)."
  },
  "bookworm": {
    flag: "perk_bookworm",
    description: "Gain an extra Studied die when you Study. Can take multiple times."
  },
  "botanical mediciner": {
    flag: "perk_botanicalMediciner",
    description: "Restore d6 HP during Breather with herbs. Can remove Blinded, Paralyzed, or Sickened."
  },
  "briar healer": {
    flag: "perk_briarHealer",
    description: "Life Spell Target gains +1 Armor and deals d6 to melee attackers while you Focus."
  },
  "bully": {
    flag: "perk_bully",
    description: "Favor on Grapple/Shove vs smaller Targets. Can use grappled Target as a greatclub."
  },
  "cardistry": {
    flag: "perk_cardistry",
    description: "Use a deck of cards as a Trinket. Attack with cards using Cast Skill (d4, Finesse, Thrown)."
  },
  "cat-like reflexes": {
    flag: "perk_catLikeReflexes",
    description: "Reduce fall damage by half. Stand from Prone using only 5 feet of Speed."
  },
  "check hook": {
    flag: "perk_checkHook",
    description: "Once per Round, make one Brawl attack if a Close Enemy Moves or Attacks (no Action)."
  },
  "chicanery": {
    flag: "perk_chicanery",
    description: "Failed Checks don't alert Beings to your presence or advance Progress Clocks."
  },
  "combat medic": {
    flag: "perk_combatMedic",
    description: "As an Action, remove Sickened and restore (d6 + Reason) HP. Once per Shift per target."
  },
  "deft hands": {
    flag: "perk_deftHands",
    description: "You can skip your Move to take the Use Action."
  },
  "diplomat": {
    flag: "perk_diplomat",
    description: "Favor on Leadership Checks to negotiate if you haven't damaged the Target in the last minute."
  },
  "drunken master": {
    flag: "perk_drunkenMaster",
    description: "1H Crude Weapons have the Finesse property for you."
  },
  "duelist": {
    flag: "perk_duelist",
    description: "While Dual-Wielding, Move half Speed on skip-Move attacks. Favor on Dodge when 1v1."
  },
  "endless stamina": {
    flag: "perk_endlessStamina",
    description: "Fatigue doesn't prevent Rush Action. Once per Day, remove 1 Fatigue during Breather."
  },
  "extrovert": {
    flag: "perk_extrovert",
    description: "Once per Day, gain a Studied die when you meet a new friendly person."
  },
  "fallaway reverse": {
    flag: "perk_fallawayReverse",
    description: "If you Crit to Dodge a Melee Attack, the attacker falls Prone."
  },
  "familiar": {
    flag: "perk_familiar",
    description: "10-minute Ritual to conjure a Small familiar (HD 1). Cast Spells through it."
  },
  "full swing": {
    flag: "perk_fullSwing",
    description: "On Melee Attack 10+ above Difficulty, push Target as if Shoved (max one size larger)."
  },
  "gish": {
    flag: "perk_gish",
    description: "Use Weapons as Trinkets to Cast. Imbue + attack with same Action."
  },
  "grim harvest": {
    flag: "perk_grimHarvest",
    description: "When your Spell kills a non-Artificial/Undead Enemy, regain HP equal to Spell damage."
  },
  "guardian angel": {
    flag: "perk_guardianAngel",
    description: "Once per Round, spend 1 Luck to attack an Enemy targeting your Ally. Hit grants Ally Favor on Saves."
  },
  "harmonic resonance": {
    flag: "perk_harmonicResonance",
    description: "Use Musical Instrument as Trinket. Can Cast Aura/Cone, 1 less Mana on those deliveries."
  },
  "heavy arms": {
    flag: "perk_heavyArms",
    description: "While holding a 2H Grip Weapon, damage rolls Explode on a 1. Fist Grip counts as 2H."
  },
  "heightened cognition": {
    flag: "perk_heightenedCognition",
    description: "Spend a Studied die to pass a failed Detect, Mysticism, or Survival Check."
  },
  "heightened magnetism": {
    flag: "perk_heightenedMagnetism",
    description: "Spend a Luck to pass a failed Influence, Leadership, or Performance Check."
  },
  "heightened reason": {
    flag: "perk_heightenedReason",
    description: "Spend a Studied die to pass a failed Arcana, Craft, or Medicine Check."
  },
  "ice knife": {
    flag: "perk_iceKnife",
    description: "Ice Objects from Freeze last up to 1 minute without Focus."
  },
  "impersonator": {
    flag: "perk_impersonator",
    description: "You can unerringly imitate the voice of any Humanlike you have heard speak."
  },
  "infesting burst": {
    flag: "perk_infestingBurst",
    description: "When you create an Undead with Raise, you can raise them as a Boomer."
  },
  "infravision": {
    flag: "perk_infravision",
    description: "You gain Darksight."
  },
  "inspiring presence": {
    flag: "perk_inspiringPresence",
    description: "Use Action to rally Allies with Berserk/Charmed/Confused/Frightened countdown — decrease die by 1 size."
  },
  "interceptor": {
    flag: "perk_interceptor",
    description: "Once per Round, attack a Close Enemy that begins to Move out of your reach (Off-Turn)."
  },
  "knife juggler": {
    flag: "perk_knifeJuggler",
    description: "1H Thrown Weapons are 0 Slot. Draw one as part of an attack."
  },
  "limit break": {
    flag: "perk_limitBreak",
    description: "Once per Combat, when dropped below half HP and not Fatigued, take another Action next Turn."
  },
  "mage slayer": {
    flag: "perk_mageSlayer",
    description: "Damage vs Focusing Beings can Explode. Roll 10+ above Difficulty ends their Focus."
  },
  "magical secret": {
    flag: "perk_magicalSecret",
    description: "Learn a Spell and Cast it with a Skill of your choice. Can take multiple times."
  },
  "marksmanship": {
    flag: "perk_marksmanship",
    description: "Ranged Weapon damage dice are one size larger."
  },
  "master artisan": {
    flag: "perk_masterArtisan",
    description: "Crafting puts two Shifts of work per Shift spent."
  },
  "master breaker": {
    flag: "perk_masterBreaker",
    description: "Failed Finesse lockpick Check doesn't break pick. Favor on Saves against triggered traps."
  },
  "master chef": {
    flag: "perk_masterChef",
    description: "Cook d6+1 rations (5s Materials) that restore d6 HP during Breather."
  },
  "medium": {
    flag: "perk_medium",
    description: "10-minute Ritual to ask 3 yes/no questions from the Fates. Once per Quest."
  },
  "mesmer": {
    flag: "perk_mesmer",
    description: "On Cast Check 10+ for Charm/Frighten, also force Target to Move, Attack, or interact."
  },
  "metamagic": {
    flag: "perk_metamagic",
    description: "Maximum Mana per Spell increases by 1. Can take multiple times."
  },
  "mithridatism": {
    flag: "perk_mithridatism",
    description: "Favor on Saves against Sickened. Reduce Poison damage by 2 per die."
  },
  "moonlight sonata": {
    flag: "perk_moonlightSonata",
    description: "You can cause Spell light to be Moonlight."
  },
  "mounted combatant": {
    flag: "perk_mountedCombatant",
    description: "Favor on mount Checks. Wield Versatile weapons as 1H while mounted with 2H benefits."
  },
  "necromancer": {
    flag: "perk_necromancer",
    description: "While Focusing on Raise, a controlled Undead regains HP equal to half your Level."
  },
  "new training": {
    flag: "perk_newTraining",
    description: "Gain a Training. Can take multiple times."
  },
  "owl-blasted": {
    flag: "perk_owlBlasted",
    description: "If Charm Cast fails, regain d4 Mana spent on the Casting."
  },
  "pack mule": {
    flag: "perk_packMule",
    description: "Gain +2 Item Slots. Can take multiple times."
  },
  "padfoot": {
    flag: "perk_padfoot",
    description: "Once per Day, gain a Studied die when you Travel 6+ miles."
  },
  "panache": {
    flag: "perk_panache",
    description: "After hitting with Melee, next Save against an attack before your next Turn is Favored."
  },
  "patience": {
    flag: "perk_patience",
    description: "When you Hold to Attack, next Endure Save to Block before your next Turn is Favored."
  },
  "peerless athlete": {
    flag: "perk_peerlessAthlete",
    description: "Stand from Prone at start of Turn (no Action). Rush and Jump with same Action."
  },
  "perfect parry": {
    flag: "perk_perfectParry",
    description: "If you Crit to Block, the attacker is Vulnerable until end of your next Turn."
  },
  "poisoner": {
    flag: "perk_poisoner",
    description: "Coat your Equipped Weapon with poison when you attack with it."
  },
  "primordial summoner": {
    flag: "perk_primordialSummoner",
    description: "10-minute Ritual to conjure a Primordial with HD up to half your Level."
  },
  "protector": {
    flag: "perk_protector",
    description: "Block on behalf of an Ally that fails their Save against a Close Enemy's attack."
  },
  "provoker": {
    flag: "perk_provoker",
    description: "Use Action to goad an Enemy. Allies' Saves against that Enemy's Attacks have Favor until your Group's next Turn."
  },
  "rally": {
    flag: "perk_rally",
    description: "Once per Shift, Action to grant all Allies 1 Luck and end Charmed or Frightened."
  },
  "re-animator": {
    flag: "perk_reAnimator",
    description: "10-minute Ritual to raise a corpse as Undead (Raise Spell). Lasts one Shift. Uses Craft Skill."
  },
  "resourceful": {
    flag: "perk_resourceful",
    description: "Spend 1 Luck to recall having packed an Item worth up to 50s."
  },
  "sage": {
    flag: "perk_sage",
    description: "As an Action, grant an Ally one of your Studied Dice if they can see or hear you."
  },
  "salbenist": {
    flag: "perk_salbenist",
    description: "10-minute Ritual to bond a Weapon with an oil. Attack with Craft, will oil to coat on Turn."
  },
  "scout": {
    flag: "perk_scout",
    description: "Favor on Survival Navigate Checks during Travel. Roll twice for Hunt and choose."
  },
  "scrapper's delight": {
    flag: "perk_scrappersDelight",
    description: "10-minute Ritual to break down an Item (nonmagical, 5s+, 2 Slots max) into raw materials."
  },
  "second wind": {
    flag: "perk_secondWind",
    description: "Once per Combat, Action or skip Move to regain (d6 + Might) HP."
  },
  "secret of mana": {
    flag: "perk_secretOfMana",
    description: "Gain 1 Mana per Level, and 1 Mana each Level up. Can take multiple times."
  },
  "sentinel": {
    flag: "perk_sentinel",
    description: "Enemies you hit with Melee can't Move for the rest of the Turn."
  },
  "shapechanger": {
    flag: "perk_shapechanger",
    description: "When you Target yourself with Polymorph, use Cast Skill for Actions. No Mana to Focus."
  },
  "sharpshooter": {
    flag: "perk_sharpshooter",
    description: "Skip Move to reduce Ranged Crit roll needed by 1 this Turn."
  },
  "singer": {
    flag: "perk_singer",
    description: "Your voice counts as a Musical Instrument."
  },
  "situational awareness": {
    flag: "perk_situationalAwareness",
    description: "Favor on Checks against surprise. Being flanked doesn't Hinder your Saves."
  },
  "sixth sense": {
    flag: "perk_sixthSense",
    description: "Ignore Blinded Status for sight-based Checks and Saves."
  },
  "skirmisher": {
    flag: "perk_skirmisher",
    description: "With Light or no Armor, +5 bonus to Speed."
  },
  "smooth talker": {
    flag: "perk_smoothTalker",
    description: "Once per Scene, reroll a failed Influence Check made to interact with a Being who understands you."
  },
  "snareroot trapper": {
    flag: "perk_snarerootTrapper",
    description: "Cast Sprout with Glyph delivery for no extra Mana and without Focusing. One active at a time."
  },
  "solar flare": {
    flag: "perk_solarFlare",
    description: "You can cause Spell light to be Sunlight."
  },
  "spin-to-win": {
    flag: "perk_spinToWin",
    description: "Melee Cleave attacks can deal half damage to all viable Targets, not just one extra."
  },
  "steady aim": {
    flag: "perk_steadyAim",
    description: "Ignore Hinder on visible Ranged attacks. Favor vs Targets who haven't Moved since your last Turn."
  },
  "storm raiser": {
    flag: "perk_stormRaiser",
    description: "Once per Day, 10-minute Ritual to change weather in 1-mile radius."
  },
  "strategist": {
    flag: "perk_strategist",
    description: "Favor on attacks against Targets Close to a non-Incapacitated Ally."
  },
  "tactician": {
    flag: "perk_tactician",
    description: "Action or skip Move to issue an order (Attack/Defend/Retreat) lasting the Combat."
  },
  "telepath": {
    flag: "perk_telepath",
    description: "Communicate via Telepathy with any Being you can see by Focusing on this Ability."
  },
  "tough": {
    flag: "perk_tough",
    description: "Max HP increases by current Level, and +1 per Level up. Can take multiple times."
  },
  "transvection": {
    flag: "perk_transvection",
    description: "Levitate an Item (2 Slots or less) with 30' Fly Speed without Focus."
  },
  "treads lightly": {
    flag: "perk_treadsLightly",
    description: "Nonmagical Difficult Terrain doesn't impede Speed. Don't trigger traps by walking on them."
  },
  "unfailing guidance": {
    flag: "perk_unfailingGuidance",
    description: "If Guide Spell Target Hinders an Ally's Save, the Hinder is ignored if Ally can see you."
  },
  "ungarmax": {
    flag: "perk_ungarmax",
    description: "Allies you make Berserk with Apoplex gain +1 bonus to each damage die."
  },
  "vehement magic": {
    flag: "perk_vehementMagic",
    description: "Spell damage rolls Explode on a 1."
  },
  "vigilance": {
    flag: "perk_vigilance",
    description: "No sleep needed for Rest benefits, but can't remove Fatigue without normal Rest."
  },
  "vituperation": {
    flag: "perk_vituperation",
    description: "Action or skip Move to rebuke an Enemy (Influence Check - Morale). Pass makes Enemy Vulnerable."
  },
  "wander the wooded": {
    flag: "perk_wanderTheWooded",
    description: "Natural Difficult Terrain doesn't impede Speed. Favor on Saves against natural hazards."
  },
  "water walker": {
    flag: "perk_waterWalker",
    description: "While not Incapacitated, you can walk on water."
  },
  "witchsight": {
    flag: "perk_witchsight",
    description: "Favor on Checks against illusions. See Invisible Beings if not otherwise Blinded."
  }
};
