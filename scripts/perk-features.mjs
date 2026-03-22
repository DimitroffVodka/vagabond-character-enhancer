/**
 * Perk Features
 * Registry entries for all Vagabond perks (alphabetical).
 */

/* -------------------------------------------- */
/*  Perk Registry                               */
/* -------------------------------------------- */

export const PERK_REGISTRY = {
  // Abjurer
  // Prerequisite: Spell: Ward
  // While Focusing on Ward with another Being as the Target, you also gain the
  // benefits of Ward.
  "abjurer": {
    flag: "perk_abjurer",
    description: "While Focusing on Ward with another Being as Target, you also gain the benefits of Ward."
  },

  // Advancement
  // Prerequisite: Stat: Chosen Stat <7
  // Increase one of your Stats by 1. You can take this Perk multiple times.
  "advancement": {
    flag: "perk_advancement",
    description: "Increase one of your Stats by 1. You can take this Perk multiple times."
  },

  // Akimbo Trigger
  // Prerequisite: Stat: DEX 4+ | Trained: Ranged
  // Attacking a Close Target with a Ranged attack doesn't Hinder the Check,
  // and you can Move up to half your Speed when you skip your Move to make
  // an attack.
  "akimbo trigger": {
    flag: "perk_akimboTrigger",
    description: "Attacking a Close Target with Ranged doesn't Hinder. Move up to half Speed when skipping Move to attack."
  },

  // Ambusher
  // Prerequisite: Stat: AWR 4+ | Trained: Sneak
  // You have Favor on attacks to initiate a Combat and against Beings that
  // haven't acted in that Combat.
  "ambusher": {
    flag: "perk_ambusher",
    description: "Favor on attacks to initiate Combat and against Beings that haven't acted in that Combat."
  },

  // Animal Companion
  // Prerequisite: Stat: PRS 4+ | Trained: Survival
  // If you spend a Shift taming and training a non-hostile Beast with a HD
  // count no higher than half your Level, you can have it follow you as a
  // companion. You control it by commanding it with your Action or by skipping
  // your Move. Otherwise, it instinctually attacks your Enemies. It uses your
  // Survival Difficulty for Checks. You can only have one such companion at
  // a time.
  "animal companion": {
    flag: "perk_animalCompanion",
    description: "Tame a non-hostile Beast with HD no higher than half your Level as a companion."
  },

  // Arcane Artisan
  // Prerequisite: Spell: Any | Trained: Craft
  // When you spend a Shift to Craft, you can spend Mana to supplement
  // Materials at a rate of 5s per Mana spent.
  "arcane artisan": {
    flag: "perk_arcaneArtisan",
    description: "When Crafting, spend Mana to supplement Materials at 5s per Mana spent."
  },

  // Archaeologist
  // Prerequisite: Stat: RSN 4+ | Trained: Craft
  // Checks and Saves you make against traps have Favor and, if you are
  // subjected to a Curse, you can make a Will Save to instantly break the
  // curse's hold on you.
  "archaeologist": {
    flag: "perk_archaeologist",
    description: "Favor on Checks and Saves against traps. Will Save to instantly break curses."
  },

  // Assured Healer
  // Prerequisite: Spell: Life
  // Granted by: Luminary (Radiant Healer, L1)
  // Healing rolls of your Spells Explode on a 1.
  "assured healer": {
    flag: "perk_assuredHealer",
    description: "Healing rolls of your Spells Explode on a 1."
  },

  // Athame
  // Prerequisite: Trained: Arcana or Mysticism
  // You can perform a 10-minute Ritual with a dagger, making it your athame
  // until you conduct this ritual again. Your athame is a Relic with the
  // Loyalty Power, and it can be used as a Trinket.
  "athame": {
    flag: "perk_athame",
    description: "10-minute Ritual to make a dagger your athame (Relic with Loyalty, usable as Trinket)."
  },

  // Bookworm
  // Prerequisite: Stat: RSN 4+
  // Granted by: Wizard (Page Master, L1)
  // You gain an extra Studied die when you Study. You can take this Perk
  // multiple times.
  "bookworm": {
    flag: "perk_bookworm",
    description: "Gain an extra Studied die when you Study. Can take multiple times."
  },

  // Botanical Mediciner
  // Prerequisite: Trained: Medicine & Survival
  // You can restore d6 HP to a willing Being during a Breather if you have
  // herbs. If you do, you can also remove a Status from the Ally from either
  // Blinded, Paralyzed, or Sickened. That Being can't be affected by this
  // Ability for the rest of the Shift.
  "botanical mediciner": {
    flag: "perk_botanicalMediciner",
    description: "Restore d6 HP during Breather with herbs. Can remove Blinded, Paralyzed, or Sickened."
  },

  // Briar Healer
  // Prerequisite: Spell: Life
  // The Target of your Life Spell gains a cloak of ethereal thorns while you
  // Focus on it, giving it +1 Armor and dealing d6 to any Being who damages
  // them with a Melee Attack.
  "briar healer": {
    flag: "perk_briarHealer",
    description: "Life Spell Target gains +1 Armor and deals d6 to melee attackers while you Focus."
  },

  // Bully
  // Prerequisite: Stat: MIT 4+ | Trained: Brawl
  // Checks you make to Grapple or Shove Targets that are smaller than you are
  // Favored, and you can use them as a greatclub with the Brawl property that
  // deals its damage to both the Target and itself on a hit. Your attacks with
  // it count as maintaining the grapple.
  "bully": {
    flag: "perk_bully",
    description: "Favor on Grapple/Shove vs smaller Targets. Can use grappled Target as a greatclub."
  },

  // Cardistry
  // Prerequisite: Spell: Any | Stat: DEX 4+
  // You can use a deck of cards as a Trinket and can make attacks with cards
  // drawn from a deck using your Cast Skill. The Deck must be used as a 2H
  // Grip Weapon to do so. It deals d4, and has the Finesse and Thrown
  // properties. Cards used for an attack magically reappear in the deck.
  "cardistry": {
    flag: "perk_cardistry",
    description: "Use a deck of cards as a Trinket. Attack with cards using Cast Skill (d4, Finesse, Thrown)."
  },

  // Cat-Like Reflexes
  // Prerequisite: Stat: DEX 4+ | Trained: Finesse
  // You reduce any fall damage you take by half and, while you are Prone, you
  // can stand up using only 5 feet of Speed.
  "cat-like reflexes": {
    flag: "perk_catLikeReflexes",
    description: "Reduce fall damage by half. Stand from Prone using only 5 feet of Speed."
  },

  // Check Hook
  // Prerequisite: Stat: DEX 4+ | Trained: Brawl
  // Granted by: Pugilist (Rope-a-Dope, L1)
  // Once per Round, you can make one attack with a Brawl Weapon you have
  // Equipped if a Close Enemy Moves or Attacks (no Action).
  "check hook": {
    flag: "perk_checkHook",
    description: "Once per Round, make one Brawl attack if a Close Enemy Moves or Attacks (no Action)."
  },

  // Chicanery
  // Prerequisite: Stat: DEX 4+ | Trained: Sneak
  // If you fail a Check, it doesn't alert Beings to your presence, or advance
  // relevant Progress Clocks being tracked.
  "chicanery": {
    flag: "perk_chicanery",
    description: "Failed Checks don't alert Beings to your presence or advance Progress Clocks."
  },

  // Combat Medic
  // Prerequisite: Stat: RSN 4+ | Trained: Medicine
  // As an Action, you can tend to a willing Being's injuries. Doing so removes
  // the Sickened Status if they have it and they regain (d6 + your Reason) HP.
  // That Being can't be affected by this Ability for the rest of the Shift.
  "combat medic": {
    flag: "perk_combatMedic",
    description: "As an Action, remove Sickened and restore (d6 + Reason) HP. Once per Shift per target."
  },

  // Deft Hands
  // Prerequisite: Stat: DEX 4+ | Trained: Finesse
  // Granted by: Alchemist (Catalyze, L1), Merchant (Gold Sink, L1)
  // You can skip your Move to take the Use Action.
  "deft hands": {
    flag: "perk_deftHands",
    description: "You can skip your Move to take the Use Action."
  },

  // Diplomat
  // Prerequisite: Stat: PRS 4+ | Trained: Leadership
  // You have Favor on Leadership Checks to negotiate and parley if you have
  // not dealt damage to the Target in the last minute.
  "diplomat": {
    flag: "perk_diplomat",
    description: "Favor on Leadership Checks to negotiate if you haven't damaged the Target in the last minute."
  },

  // Drunken Master
  // Prerequisite: Trained: Brawl & Finesse
  // 1H Crude Weapons have the Finesse property for you.
  "drunken master": {
    flag: "perk_drunkenMaster",
    description: "1H Crude Weapons have the Finesse property for you."
  },

  // Duelist
  // Prerequisite: Stat: DEX 4+ | Trained: Melee
  // While Dual-Wielding, you can Move up to half your Speed when you skip your
  // Move to make an attack, and you Dodge attacks with Favor if you and the
  // attacker are the only Beings Close to each other.
  "duelist": {
    flag: "perk_duelist",
    description: "While Dual-Wielding, Move half Speed on skip-Move attacks. Favor on Dodge when 1v1."
  },

  // Endless Stamina
  // Prerequisite: Stat: MIT 4+ | Trained: Brawl
  // Fatigue doesn't prevent you from taking the Rush Action and, once per day,
  // you can remove 1 Fatigue during a Breather.
  "endless stamina": {
    flag: "perk_endlessStamina",
    description: "Fatigue doesn't prevent Rush Action. Once per Day, remove 1 Fatigue during Breather."
  },

  // Extrovert
  // Prerequisite: Stat: PRS 4+ | Trained: Influence
  // Once per Day, you gain a Studied die if you meet a new friendly person.
  "extrovert": {
    flag: "perk_extrovert",
    description: "Once per Day, gain a Studied die when you meet a new friendly person."
  },

  // Fallaway Reverse
  // Prerequisite: Stat: DEX 4+ | Trained: Finesse
  // If you Crit to Dodge a Melee Attack, the attacker falls Prone.
  "fallaway reverse": {
    flag: "perk_fallawayReverse",
    description: "If you Crit to Dodge a Melee Attack, the attacker falls Prone."
  },

  // Familiar
  // Prerequisite: Trained: Arcana or Mysticism
  // You can perform a 10-minute Ritual to conjure a familiar, a loyal Ally to
  // you that you control. The familiar can be any Small Being with HD: 1. It
  // uses your Cast Skill for Checks and Saves, and you can Cast Spells using
  // the familiar as a conduit for your Magic. If you do, you can deliver the
  // Spell from the familiar as if it were originating from you. The familiar is
  // banished when it drops to 0 HP or if you conduct this Ritual again to
  // create another familiar.
  "familiar": {
    flag: "perk_familiar",
    description: "10-minute Ritual to conjure a Small familiar (HD 1). Cast Spells through it."
  },

  // Full Swing
  // Prerequisite: Stat: MIT 4+ | Trained: Melee
  // When you make a Melee Attack Check and roll 10 above your Melee
  // Difficulty, you can choose to push the Target as if you had shoved them if
  // they are no more than one size larger than you.
  "full swing": {
    flag: "perk_fullSwing",
    description: "On Melee Attack 10+ above Difficulty, push Target as if Shoved (max one size larger)."
  },

  // Gish
  // Prerequisite: Spell: Any | Trained: Melee or Ranged
  // Granted by: Magus (Spellstriker, L1), Revelator (Righteous, L1)
  // You can use Weapons as Trinkets to Cast and, when you Cast with a Delivery
  // of Imbue on a Weapon you have Equipped, you can make an attack with the
  // Weapon with the same Action.
  "gish": {
    flag: "perk_gish",
    description: "Use Weapons as Trinkets to Cast. Imbue + attack with same Action."
  },

  // Grim Harvest
  // Prerequisite: Spell: Raise
  // When one of your Spells kills an Enemy that is not an Artificial or
  // Undead, you regain HP equal to the damage of the Spell.
  "grim harvest": {
    flag: "perk_grimHarvest",
    description: "When your Spell kills a non-Artificial/Undead Enemy, regain HP equal to Spell damage."
  },

  // Guardian Angel
  // Prerequisite: Stat: AWR 4+ | Trained: Melee or Ranged
  // Once per Round, if one of your Allies is Targeted by an Enemy, you can
  // spend 1 Luck to make an attack against that Enemy. If you hit, your Ally
  // has Favor on any Save forced by that Enemy this Turn.
  "guardian angel": {
    flag: "perk_guardianAngel",
    description: "Once per Round, spend 1 Luck to attack an Enemy targeting your Ally. Hit grants Ally Favor on Saves."
  },

  // Harmonic Resonance
  // Prerequisite: Spell: Any | Trained: Performance
  // You can use a Musical Instrument as a Trinket. When you do, you can Cast
  // with a delivery of Aura or Cone if you otherwise couldn't, and you spend
  // 1 less Mana on Aura and Cone delivery. This Casting still creates sound.
  "harmonic resonance": {
    flag: "perk_harmonicResonance",
    description: "Use Musical Instrument as Trinket. Can Cast Aura/Cone, 1 less Mana on those deliveries."
  },

  // Heavy Arms
  // Prerequisite: Stat: MIT 4+ | Trained: Melee
  // The knight has made you vigilant. While you have a Weapon held as 2H Grip,
  // its damage rolls Explode on a 1. For the purpose of this Perk, Fist Grip
  // counts as 2H Grip.
  "heavy arms": {
    flag: "perk_heavyArms",
    description: "While holding a 2H Grip Weapon, damage rolls Explode on a 1. Fist Grip counts as 2H."
  },

  // Heightened Cognition
  // Prerequisite: Stat: AWR 7
  // You can spend a Studied die to pass a Detect, Mysticism, or Survival
  // Check you fail.
  "heightened cognition": {
    flag: "perk_heightenedCognition",
    description: "Spend a Studied die to pass a failed Detect, Mysticism, or Survival Check."
  },

  // Heightened Magnetism
  // Prerequisite: Stat: PRS 7
  // You can spend a Luck to pass an Influence, Leadership, or Performance
  // Check you fail.
  "heightened magnetism": {
    flag: "perk_heightenedMagnetism",
    description: "Spend a Luck to pass a failed Influence, Leadership, or Performance Check."
  },

  // Heightened Reason
  // Prerequisite: Stat: RSN 7
  // You can spend a Studied die to pass an Arcana, Craft, or Medicine Check
  // you fail.
  "heightened reason": {
    flag: "perk_heightenedReason",
    description: "Spend a Studied die to pass a failed Arcana, Craft, or Medicine Check."
  },

  // Ice Knife
  // Prerequisite: Spell: Freeze
  // Ice Objects you create with Freeze last for up to 1 minute without
  // requiring Focus.
  "ice knife": {
    flag: "perk_iceKnife",
    description: "Ice Objects from Freeze last up to 1 minute without Focus."
  },

  // Impersonator
  // Prerequisite: Stat: PRS 4+ | Trained: Influence
  // You can unerringly imitate the voice of any Humanlike you have heard
  // speak.
  "impersonator": {
    flag: "perk_impersonator",
    description: "You can unerringly imitate the voice of any Humanlike you have heard speak."
  },

  // Infesting Burst
  // Prerequisite: Spell: Raise
  // When you create an Undead with Raise, you can choose to raise them up as
  // a Boomer.
  "infesting burst": {
    flag: "perk_infestingBurst",
    description: "When you create an Undead with Raise, you can raise them as a Boomer."
  },

  // Infravision
  // Prerequisite: Stat: AWR 4+ | Trained: Detect
  // You gain Darksight.
  "infravision": {
    flag: "perk_infravision",
    description: "You gain Darksight."
  },

  // Inspiring Presence
  // Prerequisite: Stat: PRS 4+ | Trained: Leadership
  // If any of your Allies are Berserk, Charmed, Confused, or Frightened by an
  // effect that ends on a Countdown die, you can use your Action to attempt to
  // rally them and make a Leadership Check. If you pass, the Countdown die for
  // the effect decreases by 1 size.
  "inspiring presence": {
    flag: "perk_inspiringPresence",
    description: "Use Action to rally Allies with Berserk/Charmed/Confused/Frightened countdown — decrease die by 1 size."
  },

  // Interceptor
  // Prerequisite: Stat: AWR 4+ | Trained: Melee
  // Granted by: Barbarian (Wrath, L1)
  // Once per Round, you can make one attack on an Off-Turn against a Close
  // Enemy that begins to Move out of your reach.
  "interceptor": {
    flag: "perk_interceptor",
    description: "Once per Round, attack a Close Enemy that begins to Move out of your reach (Off-Turn)."
  },

  // Knife Juggler
  // Prerequisite: Stat: DEX 4+ | Trained: Finesse
  // You treat 1H Thrown Weapons as 0 Slot for occupying your Item Slots, and
  // can draw one as part of an attack with it.
  "knife juggler": {
    flag: "perk_knifeJuggler",
    description: "1H Thrown Weapons are 0 Slot. Draw one as part of an attack."
  },

  // Limit Break
  // Prerequisite: Stat: MIT 7
  // Once per Combat, when you are dropped below half HP and aren't Fatigued,
  // you can take another Action on your next Turn.
  "limit break": {
    flag: "perk_limitBreak",
    description: "Once per Combat, when dropped below half HP and not Fatigued, take another Action next Turn."
  },

  // Mage Slayer
  // Prerequisite: Trained: Arcana or Mysticism
  // When you damage a Focusing Being, the damage rolls can Explode and, if
  // the result of your d20 roll on the Check is 10 or higher than your
  // Difficulty, the Focus ends.
  "mage slayer": {
    flag: "perk_mageSlayer",
    description: "Damage vs Focusing Beings can Explode. Roll 10+ above Difficulty ends their Focus."
  },

  // Magical Secret
  // Prerequisite: Trained: Arcana, Influence, or Mysticism
  // Choose a Spell. You learn the Spell and can Cast it using a Skill of your
  // choice. You can take this Perk multiple times.
  "magical secret": {
    flag: "perk_magicalSecret",
    description: "Learn a Spell and Cast it with a Skill of your choice. Can take multiple times."
  },

  // Marksmanship
  // Prerequisite: Stat: AWR 7 | Trained: Ranged
  // Granted by: Gunslinger (Quick Draw, L1)
  // The damage dice for your Ranged Weapon attacks are one size larger.
  "marksmanship": {
    flag: "perk_marksmanship",
    description: "Ranged Weapon damage dice are one size larger."
  },

  // Master Artisan
  // Prerequisite: Stat: RSN 4+ | Trained: Craft
  // When you spend a Shift to Craft, it puts two Shifts worth of work towards
  // making the Item, rather than one.
  "master artisan": {
    flag: "perk_masterArtisan",
    description: "Crafting puts two Shifts of work per Shift spent."
  },

  // Master Breaker
  // Prerequisite: Stat: DEX 4+ | Trained: Finesse
  // If you fail a Finesse Check to pick a lock, your lockpick isn't broken and
  // you make Saves against traps it triggers with Favor.
  "master breaker": {
    flag: "perk_masterBreaker",
    description: "Failed Finesse lockpick Check doesn't break pick. Favor on Saves against triggered traps."
  },

  // Master Chef
  // Prerequisite: Stat: PRS 4+ | Trained: Survival
  // During a Scene where you have cooking tools, you can cook meals using 5s
  // worth of Materials. Doing so makes d6+1 rations which restore d6 HP to
  // anyone who eats one as part of a Breather. They function as normal rations
  // after a Shift.
  "master chef": {
    flag: "perk_masterChef",
    description: "Cook d6+1 rations (5s Materials) that restore d6 HP during Breather."
  },

  // Medium
  // Prerequisite: Stat: AWR 4+ | Trained: Mysticism
  // You can conduct a 10-minute Ritual to ask up to 3 questions from the GM
  // which can only be answered with a "yes" or "no." The Fates are the source
  // of the information, and will answer these questions truthfully (if
  // possible). Afterward, you can't conduct this Ritual until you complete
  // a Quest.
  "medium": {
    flag: "perk_medium",
    description: "10-minute Ritual to ask 3 yes/no questions from the Fates. Once per Quest."
  },

  // Mesmer
  // Prerequisite: Spell: Charm
  // If you pass a Cast Check by 10 or more to cause a Target to be Charmed or
  // Frightened, you can also cause it to act in one of the following ways in a
  // manner of your choice on its next Turn:
  // - Move up to half its Speed.
  // - Attack a Target (it can attack itself).
  // - Drop or pick up an Item.
  "mesmer": {
    flag: "perk_mesmer",
    description: "On Cast Check 10+ for Charm/Frighten, also force Target to Move, Attack, or interact."
  },

  // Metamagic
  // Prerequisite: Resource: Maximum Mana 7+
  // Granted by: Sorcerer (Tap, L1)
  // The Maximum Mana you can spend on a Spell increases by 1. You can take
  // this Perk multiple times.
  "metamagic": {
    flag: "perk_metamagic",
    description: "Maximum Mana per Spell increases by 1. Can take multiple times."
  },

  // Mithridatism
  // Prerequisite: Stat: MIT 4+ | Trained: Medicine
  // Your Saves against Sickened are Favored, and you reduce Poison-based
  // damage you take by 2 per die of the effect.
  "mithridatism": {
    flag: "perk_mithridatism",
    description: "Favor on Saves against Sickened. Reduce Poison damage by 2 per die."
  },

  // Moonlight Sonata
  // Prerequisite: Spell: Light
  // You can cause the light shed by your Spells to be Moonlight.
  "moonlight sonata": {
    flag: "perk_moonlightSonata",
    description: "You can cause Spell light to be Moonlight."
  },

  // Mounted Combatant
  // Prerequisite: Stat: MIT 4+ | Trained: Survival
  // Any Check you make to avoid falling off a mount is Favored, and you can
  // wield Weapons with the Versatile Grip as 1H while riding a mount and get
  // the benefits of them being wielded in both hands.
  "mounted combatant": {
    flag: "perk_mountedCombatant",
    description: "Favor on mount Checks. Wield Versatile weapons as 1H while mounted with 2H benefits."
  },

  // Necromancer
  // Prerequisite: Spell: Raise
  // When you Focus on Raise, you can choose an Undead you control. The Target
  // regains HP equal to (half your Level).
  "necromancer": {
    flag: "perk_necromancer",
    description: "While Focusing on Raise, a controlled Undead regains HP equal to half your Level."
  },

  // New Training
  // Prerequisite: —
  // You gain a Training. You can take this Perk multiple times.
  "new training": {
    flag: "perk_newTraining",
    description: "Gain a Training. Can take multiple times."
  },

  // Owl-Blasted
  // Prerequisite: Spell: Charm
  // If you spend Mana to attempt to cause a Being to be Charmed and the Check
  // fails, you regain d4 Mana that was spent on the Casting.
  "owl-blasted": {
    flag: "perk_owlBlasted",
    description: "If Charm Cast fails, regain d4 Mana spent on the Casting."
  },

  // Pack Mule
  // Prerequisite: Stat: MIT 4+ | Trained: Brawl
  // You gain +2 Item Slots. You can take this Perk multiple times.
  "pack mule": {
    flag: "perk_packMule",
    description: "Gain +2 Item Slots. Can take multiple times."
  },

  // Padfoot
  // Prerequisite: Stat: AWR 4+ | Trained: Survival
  // Granted by: Hunter (Survivalist, L1)
  // Once per Day, you gain a Studied die when you Travel 6 miles or more.
  "padfoot": {
    flag: "perk_padfoot",
    description: "Once per Day, gain a Studied die when you Travel 6+ miles."
  },

  // Panache
  // Prerequisite: Stat: DEX 4+ | Trained: Melee
  // If you hit an Enemy with a Melee attack, the next Save you make against an
  // attack before the start of your next Turn is Favored.
  "panache": {
    flag: "perk_panache",
    description: "After hitting with Melee, next Save against an attack before your next Turn is Favored."
  },

  // Patience
  // Prerequisite: Stat: MIT 4+ | Trained: Detect
  // When you Hold to Attack, your next Endure Save to Block before your next
  // Turn is Favored.
  "patience": {
    flag: "perk_patience",
    description: "When you Hold to Attack, next Endure Save to Block before your next Turn is Favored."
  },

  // Peerless Athlete
  // Prerequisite: Stat: MIT 4+ | Trained: Brawl
  // You can stand from Prone at the start of your Turn (no Action), and you
  // can Rush and Jump with the same Action.
  "peerless athlete": {
    flag: "perk_peerlessAthlete",
    description: "Stand from Prone at start of Turn (no Action). Rush and Jump with same Action."
  },

  // Perfect Parry
  // Prerequisite: Stat: MIT 4+ | Trained: Brawl or Melee
  // If you Crit to Block an attack, the attacker is Vulnerable until the end
  // of your next Turn.
  "perfect parry": {
    flag: "perk_perfectParry",
    description: "If you Crit to Block, the attacker is Vulnerable until end of your next Turn."
  },

  // Poisoner
  // Prerequisite: Stat: DEX 4+ | Trained: Finesse
  // You can coat your Equipped Weapon with a poison when you attack with it.
  "poisoner": {
    flag: "perk_poisoner",
    description: "Coat your Equipped Weapon with poison when you attack with it."
  },

  // Primordial Summoner
  // Prerequisite: Trained: Arcana or Mysticism
  // You can conduct a 10-minute Ritual to conjure a Primordial with Hit Dice
  // no higher than (half your Level, round up). It obeys your commands, which
  // you can issue as an Action or by skipping your Move. Otherwise, it attacks
  // your Enemies using your Cast Skill for its Checks and Saves. If you use
  // this Feature to conjure another Primordial, the previous one is banished.
  "primordial summoner": {
    flag: "perk_primordialSummoner",
    description: "10-minute Ritual to conjure a Primordial with HD up to half your Level."
  },

  // Protector
  // Prerequisite: Stat: MIT 4+ | Trained: Melee
  // Granted by: Vanguard (Stalwart, L1)
  // You can Block on behalf of an Ally that fails their Save against the
  // attack of an Enemy that is Close to you.
  "protector": {
    flag: "perk_protector",
    description: "Block on behalf of an Ally that fails their Save against a Close Enemy's attack."
  },

  // Provoker
  // Prerequisite: Stat: PRS 4+ | Trained: Influence
  // You can use your Action to intimidate or otherwise goad an Enemy that can
  // see or hear you. When you do, your Allies make all Saves provoked by that
  // Enemy's Attacks with Favor until the start of your Group's next Turn.
  "provoker": {
    flag: "perk_provoker",
    description: "Use Action to goad an Enemy. Allies' Saves against that Enemy's Attacks have Favor until your Group's next Turn."
  },

  // Rally
  // Prerequisite: Stat: PRS 4+ | Trained: Leadership
  // Once per Shift, you can give an inspirational speech, or otherwise boost
  // the morale of your Allies. Doing so requires an Action and grants them all
  // 1 Luck and ends a Status affecting them from either Charmed or Frightened.
  "rally": {
    flag: "perk_rally",
    description: "Once per Shift, Action to grant all Allies 1 Luck and end Charmed or Frightened."
  },

  // Re-Animator
  // Prerequisite: Trained: Craft & either Arcana or Mysticism
  // You can perform a 10-minute Ritual with the corpse of a non-Artificial or
  // Undead Being with HD no higher than your Level, raising it as an Undead as
  // per the Raise Spell. It is under your control for one Shift, or until you
  // perform this Ritual again. You can command it during your Turn (no Action),
  // and it uses your Craft Skill for Checks it makes.
  "re-animator": {
    flag: "perk_reAnimator",
    description: "10-minute Ritual to raise a corpse as Undead (Raise Spell). Lasts one Shift. Uses Craft Skill."
  },

  // Resourceful
  // Prerequisite: Stat: LUK 4+ | Trained: Craft
  // Granted by: Rogue (Infiltrator, L1)
  // You can spend 1 Luck to recall having packed an Item in your inventory
  // with a value as high as 50s. It doesn't "appear," it was always there.
  "resourceful": {
    flag: "perk_resourceful",
    description: "Spend 1 Luck to recall having packed an Item worth up to 50s."
  },

  // Sage
  // Prerequisite: Stat: RSN 4+
  // As an Action, you can grant an Ally one of your Studied Dice if they can
  // see or hear you.
  "sage": {
    flag: "perk_sage",
    description: "As an Action, grant an Ally one of your Studied Dice if they can see or hear you."
  },

  // Salbenist
  // Prerequisite: Trained: Craft & Mysticism
  // You can perform a 10-minute Ritual with a Weapon and an oil. Upon
  // concluding the Ritual, you gain the following benefits until you perform
  // it again:
  // - You can attack with it using Craft.
  // - You can will the absorbed oil to coat it on your Turn (no Action). This
  //   doesn't consume it, and it remains coated until you dismiss it, it
  //   leaves your hand, or until it is coated with another oil.
  "salbenist": {
    flag: "perk_salbenist",
    description: "10-minute Ritual to bond a Weapon with an oil. Attack with Craft, will oil to coat on Turn."
  },

  // Scout
  // Prerequisite: Trained: Detect & Survival
  // Your Survival Checks to Navigate during Travel have Favor and, if you
  // choose to Hunt, you can roll for the discovered game twice and use the
  // roll of your choice.
  "scout": {
    flag: "perk_scout",
    description: "Favor on Survival Navigate Checks during Travel. Roll twice for Hunt and choose."
  },

  // Scrapper's Delight
  // Prerequisite: Trained: Arcana & Craft
  // You can conduct a 10-minute Ritual to magically break down an unsecured
  // Item you touch throughout the ritual. The Item must be nonmagical, it must
  // have a value of at least 5s, and can occupy no more than 2 Slots. The Item
  // becomes raw materials of a value equal to 5s per 1 Slot it occupies of its
  // original form.
  "scrapper's delight": {
    flag: "perk_scrappersDelight",
    description: "10-minute Ritual to break down an Item (nonmagical, 5s+, 2 Slots max) into raw materials."
  },

  // Second Wind
  // Prerequisite: Stat: MIT 4+ | Trained: Brawl
  // Once per Combat, you can use your Action or skip your Move to regain
  // (d6 + Might) HP.
  "second wind": {
    flag: "perk_secondWind",
    description: "Once per Combat, Action or skip Move to regain (d6 + Might) HP."
  },

  // Secret of Mana
  // Prerequisite: Spell: Any
  // You gain 1 Mana per Level you have, and gain 1 Mana each time you gain a
  // Level. You can take this Perk multiple times.
  "secret of mana": {
    flag: "perk_secretOfMana",
    description: "Gain 1 Mana per Level, and 1 Mana each Level up. Can take multiple times."
  },

  // Sentinel
  // Prerequisite: Stat: MIT 4+ | Trained: Melee
  // Enemies you hit with a Melee Attack can't Move for the rest of the Turn.
  "sentinel": {
    flag: "perk_sentinel",
    description: "Enemies you hit with Melee can't Move for the rest of the Turn."
  },

  // Shapechanger
  // Prerequisite: Spell: Polymorph
  // Granted by: Druid (Feral Shift, L1)
  // When you are a Target of your Polymorph Spell, you use your Cast Skill for
  // its Actions, and it doesn't cost you Mana to Focus on it as per the
  // Spell's description.
  "shapechanger": {
    flag: "perk_shapechanger",
    description: "When you Target yourself with Polymorph, use Cast Skill for Actions. No Mana to Focus."
  },

  // Sharpshooter
  // Prerequisite: Stat: AWR 7 | Trained: Ranged
  // You can skip your Move to reduce the roll you need to Crit on a Ranged
  // attack this Turn by 1.
  "sharpshooter": {
    flag: "perk_sharpshooter",
    description: "Skip Move to reduce Ranged Crit roll needed by 1 this Turn."
  },

  // Singer
  // Prerequisite: Stat: PRS 4+ | Trained: Performance
  // You can use your voice as a Musical Instrument. If you are capable of
  // singing, you are considered to have a Musical Instrument Equipped.
  "singer": {
    flag: "perk_singer",
    description: "Your voice counts as a Musical Instrument."
  },

  // Situational Awareness
  // Prerequisite: Stat: AWR 4+ | Trained: Detect
  // Granted by: Fighter (Fighting Style, L1)
  // You have Favor on Checks against surprise, and being flanked doesn't
  // Hinder your Saves.
  "situational awareness": {
    flag: "perk_situationalAwareness",
    description: "Favor on Checks against surprise. Being flanked doesn't Hinder your Saves."
  },

  // Sixth Sense
  // Prerequisite: Stat: AWR 6+ | Trained: Detect
  // You ignore the Blinded Status for sight-based Checks and Saves.
  "sixth sense": {
    flag: "perk_sixthSense",
    description: "Ignore Blinded Status for sight-based Checks and Saves."
  },

  // Skirmisher
  // Prerequisite: Stat: DEX 4+ | Trained: Melee
  // While you have Light Armor or no armor Equipped, you have a 5' bonus to
  // Speed.
  "skirmisher": {
    flag: "perk_skirmisher",
    description: "With Light or no Armor, +5 bonus to Speed."
  },

  // Smooth Talker
  // Prerequisite: Stat: PRS 4+ | Trained: Influence
  // Once per Scene, if you fail an Influence Check made to interact with a
  // Being who understands you, you can reroll it.
  "smooth talker": {
    flag: "perk_smoothTalker",
    description: "Once per Scene, reroll a failed Influence Check made to interact with a Being who understands you."
  },

  // Snareroot Trapper
  // Prerequisite: Spell: Sprout
  // You can Cast Sprout with a Glyph delivery for no additional Mana and
  // without Focusing. You can have one Casting of Sprout active this way.
  "snareroot trapper": {
    flag: "perk_snarerootTrapper",
    description: "Cast Sprout with Glyph delivery for no extra Mana and without Focusing. One active at a time."
  },

  // Solar Flare
  // Prerequisite: Spell: Light
  // You can cause the light shed by Spells you Cast to be Sunlight.
  "solar flare": {
    flag: "perk_solarFlare",
    description: "You can cause Spell light to be Sunlight."
  },

  // Spin-to-Win
  // Prerequisite: Stat: MIT 4+ | Trained: Melee
  // When you attack with a Melee Cleave Weapon, you can deal half its damage
  // to any viable Targets, rather than just one extra Being.
  "spin-to-win": {
    flag: "perk_spinToWin",
    description: "Melee Cleave attacks can deal half damage to all viable Targets, not just one extra."
  },

  // Steady Aim
  // Prerequisite: Trained: Detect & Ranged
  // You ignore Hinder on Ranged Weapon attacks if you can see the Target, and
  // have Favor on Ranged Checks against Targets who haven't Moved since the
  // end of your last Turn.
  "steady aim": {
    flag: "perk_steadyAim",
    description: "Ignore Hinder on visible Ranged attacks. Favor vs Targets who haven't Moved since your last Turn."
  },

  // Storm Raiser
  // Prerequisite: Stat: AWR 4+ | Trained: Mysticism
  // Once per Day, you can perform a 10-minute Ritual to change the weather in
  // the surrounding 1-mile radius. This change is strong enough to cause or
  // end heavy storms.
  "storm raiser": {
    flag: "perk_stormRaiser",
    description: "Once per Day, 10-minute Ritual to change weather in 1-mile radius."
  },

  // Strategist
  // Prerequisite: Stat: AWR 4+ | Trained: Leadership
  // Your attacks against Targets that are Close to at least one of your Allies
  // are Favored if that Ally isn't Incapacitated.
  "strategist": {
    flag: "perk_strategist",
    description: "Favor on attacks against Targets Close to a non-Incapacitated Ally."
  },

  // Tactician
  // Prerequisite: Stat: RSN 4+ | Trained: Leadership
  // You can use your Action or skip your Move to issue an order, choosing from
  // the following list. The benefits last for the Combat or until you issue
  // another order:
  // - Attack: Declare a Target Enemy. Attack and Cast Checks against it ignore
  //   Hinder.
  // - Defend: You and your Allies' Saves against attacks can't be Hindered.
  // - Retreat: Your Allies that use their Action to Rush and end their Turn
  //   further away from any Enemies than they started have Favor on Saves
  //   against attacks that Round.
  "tactician": {
    flag: "perk_tactician",
    description: "Action or skip Move to issue an order (Attack/Defend/Retreat) lasting the Combat."
  },

  // Telepath
  // Prerequisite: Stat: RSN 7
  // While you aren't Unconscious, you can communicate with any Being you can
  // see through Telepathy by Focusing on this Ability.
  "telepath": {
    flag: "perk_telepath",
    description: "Communicate via Telepathy with any Being you can see by Focusing on this Ability."
  },

  // Tough
  // Prerequisite: Stat: MIT 7
  // Your Max HP increases by an amount equal to your current Level, and
  // increases by 1 additional point each time you gain a Level. You can take
  // this Perk multiple times.
  "tough": {
    flag: "perk_tough",
    description: "Max HP increases by current Level, and +1 per Level up. Can take multiple times."
  },

  // Transvection
  // Prerequisite: Spell: Levitate
  // If you Cast Levitate to give an Item of 2 Slots or less a Fly Speed of
  // 30', you do not need to Focus on that Cast. It remains Imbued until you
  // Imbue another Item this way.
  "transvection": {
    flag: "perk_transvection",
    description: "Levitate an Item (2 Slots or less) with 30' Fly Speed without Focus."
  },

  // Treads Lightly
  // Prerequisite: Stat: DEX 4+
  // Granted by: Dancer (Fleet of Foot, L1)
  // Your Speed isn't impeded by nonmagical Difficult Terrain, and you don't
  // trigger traps by walking on them.
  "treads lightly": {
    flag: "perk_treadsLightly",
    description: "Nonmagical Difficult Terrain doesn't impede Speed. Don't trigger traps by walking on them."
  },

  // Unfailing Guidance
  // Prerequisite: Spell: Guide
  // If the Target of your Guide Spell forces one of your Allies to make a
  // Hindered Save, the Hinder is ignored if the Ally can see you.
  "unfailing guidance": {
    flag: "perk_unfailingGuidance",
    description: "If Guide Spell Target Hinders an Ally's Save, the Hinder is ignored if Ally can see you."
  },

  // Ungarmax
  // Prerequisite: Spell: Apoplex
  // Allies you cause to be Berserk with Apoplex gain a +1 bonus to each
  // damage die used for their attacks.
  "ungarmax": {
    flag: "perk_ungarmax",
    description: "Allies you make Berserk with Apoplex gain +1 bonus to each damage die."
  },

  // Vehement Magic
  // Prerequisite: Spell: Any
  // Damage rolls from Spells you Cast Explode on a roll of 1.
  "vehement magic": {
    flag: "perk_vehementMagic",
    description: "Spell damage rolls Explode on a 1."
  },

  // Vigilance
  // Prerequisite: Stat: MIT 4+ | Trained: Detect
  // You don't need to sleep to gain the benefits of a Rest, but you can't
  // remove Fatigue without normal Rest.
  "vigilance": {
    flag: "perk_vigilance",
    description: "No sleep needed for Rest benefits, but can't remove Fatigue without normal Rest."
  },

  // Vituperation
  // Prerequisite: Stat: PRS 4+ | Trained: Influence
  // You can use your Action or skip your Move to rebuke an Enemy, and make an
  // Influence Check with a penalty equal to the Target's Morale. If you pass,
  // that Enemy is Vulnerable until your next Turn or until it deals damage.
  // Beings without Morale can't be affected by this Ability.
  "vituperation": {
    flag: "perk_vituperation",
    description: "Action or skip Move to rebuke an Enemy (Influence Check - Morale). Pass makes Enemy Vulnerable."
  },

  // Wander the Wooded
  // Prerequisite: Stat: DEX 4+ | Trained: Survival
  // Natural Difficult Terrain doesn't impede your Speed, and Saves you make
  // against natural hazards (such as avalanches or extreme heat) are Favored.
  "wander the wooded": {
    flag: "perk_wanderTheWooded",
    description: "Natural Difficult Terrain doesn't impede Speed. Favor on Saves against natural hazards."
  },

  // Water Walker
  // Prerequisite: Spell: Aqua
  // While you aren't Incapacitated, you can walk on water.
  "water walker": {
    flag: "perk_waterWalker",
    description: "While not Incapacitated, you can walk on water."
  },

  // Witchsight
  // Prerequisite: Stat: AWR 4+ | Trained: Arcana or Mysticism
  // You make Checks against illusions with Favor and you can see Invisible
  // Beings if you aren't otherwise Blinded.
  "witchsight": {
    flag: "perk_witchsight",
    description: "Favor on Checks against illusions. See Invisible Beings if not otherwise Blinded."
  }
};
