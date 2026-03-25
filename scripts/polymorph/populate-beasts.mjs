/**
 * One-time script to populate the VCE module compendium with modified beasts.
 * Run via: game.modules.get("vagabond-character-enhancer").populateBeasts()
 *
 * Modifications applied:
 * - Endure/Will/Reflex saves removed (cast check replaces them for PC use)
 * - "Cd6 days" → "Cd6 rounds"
 * - extraInfo text cleaned up to remove save references
 */

const MODULE_ID = "vagabond-character-enhancer";
const VCE_PACK_ID = `${MODULE_ID}.vce-beasts`;
const SYSTEM_PACK_ID = "vagabond.bestiary";

/**
 * Beasts that need modifications and the rules for modifying them.
 * Key = beast name in the system compendium.
 */
const MODIFICATION_RULES = {
  // --- Sickened Cd6 days → Cd6 rounds, remove Endure save ---
  "Bat": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd6 rounds)",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d6", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }]
      }
    }
  },
  "Bat, Giant": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd6 rounds)",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d6", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }]
      }
    }
  },
  "Rat": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd6 rounds)",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d6", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }]
      }
    }
  },
  "Rat, Giant": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd6 rounds)",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d6", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }]
      }
    }
  },

  // --- Poison snakes: Sickened with tick damage, remove Endure ---
  "Snake, Cobra": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd6 rounds, damage each round)",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d6", tickDamageEnabled: true, damageOnTick: "", damageType: "poison" }]
      }
      // Venom Spit keeps its Blinded + recharge as-is
    }
  },
  "Snake, Pit Viper": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd6 rounds, damage each round)",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d6", tickDamageEnabled: true, damageOnTick: "", damageType: "poison" }]
      }
    }
  },
  "Snake, Giant Poisonous": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd6 rounds, damage each round)",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d6", tickDamageEnabled: true, damageOnTick: "", damageType: "poison" }]
      }
    }
  },

  // --- Centipede: Sickened + Paralyzed, remove Endure ---
  "Centipede, Giant": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd4 rounds, Paralyzed)",
        causedStatuses: [
          { statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d4", tickDamageEnabled: false, damageOnTick: "", damageType: "-" },
          { statusId: "paralyzed", requiresDamage: true, saveType: "none", duration: "d4", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }
        ]
      }
    }
  },

  // --- Scorpion: Sickened + Fatigue, remove Endure ---
  "Scorpion, Giant": {
    actions: {
      "Sting": {
        extraInfo: "and Sickened or gain 1 Fatigue",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }]
      }
    }
  },

  // --- Spiders: various Sickened effects, remove Endure ---
  "Spider, Giant Crab": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd4 rounds, +1 Fatigue each round)",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d4", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }]
      }
    }
  },
  "Spider, Giant Black Widow": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd4 rounds, +1 Fatigue each round)",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d4", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }]
      }
    }
  },
  "Spider, Giant Tarantella": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd4 rounds, Vulnerable and must skip Move to dance, -4 penalty to Attacks. Witnesses must pass Will or become Charmed and dance. +1 Fatigue each round)",
        causedStatuses: [
          { statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d4", tickDamageEnabled: false, damageOnTick: "", damageType: "-" },
          { statusId: "charmed", requiresDamage: true, saveType: "none", duration: "d4", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }
        ]
      }
    }
  },
  "Spider, Giant": {
    actions: {
      "Bite": {
        extraInfo: "and Sickened (Cd8 rounds). On fail, take 4 (d8) additional damage and become Paralyzed",
        causedStatuses: [{ statusId: "sickened", requiresDamage: true, saveType: "none", duration: "d8", tickDamageEnabled: true, damageOnTick: "1d8", damageType: "poison" }]
      }
      // Web Shot keeps its Restrained + recharge as-is
    }
  },

  // --- Electric Eel: Paralyzed on strong hit ---
  "Electric Eel": {
    actions: {
      "Shock": {
        extraInfo: "Aura. Paralyzed (Cd4 rounds) if failed by 5+",
        causedStatuses: [{ statusId: "paralyzed", requiresDamage: true, saveType: "none", duration: "d4", tickDamageEnabled: false, damageOnTick: "", damageType: "-" }]
      }
    }
  },

  // --- These just have recharge or restrained that work fine, but we include
  //     them so the module compendium has clean consistent data ---
  "Elephant": {
    // Trample recharge Cd4 — keep as-is, just ensure clean data
  },
  "Wolf, Winter": {
    // Frost Breath recharge Cd4 — keep as-is
  },
  "Beetle, Bombardier": {
    // Noxious Gas recharge Cd6 — keep as-is
  },
  "Slug, Giant": {
    // Acid Spit recharge Cd4 + Burning — keep as-is
  },
  "Leech, Giant": {
    // Restrained on Latch — keep as-is
  },
  "Frog/Toad, Giant": {
    // Restrained on Tongue — keep as-is
  }
};

/**
 * Apply modifications to a beast's system data.
 */
function applyModifications(systemData, rules) {
  if (!rules.actions) return systemData;

  const modified = foundry.utils.deepClone(systemData);

  for (const [actionName, mods] of Object.entries(rules.actions)) {
    const action = modified.actions?.find(a => a.name === actionName);
    if (!action) continue;

    if (mods.extraInfo !== undefined) action.extraInfo = mods.extraInfo;
    if (mods.causedStatuses !== undefined) action.causedStatuses = mods.causedStatuses;
    if (mods.recharge !== undefined) action.recharge = mods.recharge;
    if (mods.rollDamage !== undefined) action.rollDamage = mods.rollDamage;
    if (mods.flatDamage !== undefined) action.flatDamage = mods.flatDamage;
  }

  return modified;
}

/**
 * Populate the module compendium with modified beasts.
 */
export async function populateBeasts() {
  const vcePack = game.packs.get(VCE_PACK_ID);
  if (!vcePack) {
    ui.notifications.error(`Compendium ${VCE_PACK_ID} not found. Restart Foundry after adding it to module.json.`);
    return;
  }

  const systemPack = game.packs.get(SYSTEM_PACK_ID);
  if (!systemPack) {
    ui.notifications.error(`System compendium ${SYSTEM_PACK_ID} not found.`);
    return;
  }

  // Unlock the compendium for editing
  await vcePack.configure({ locked: false });

  // Clear existing entries
  const existing = await vcePack.getDocuments();
  for (const doc of existing) {
    await doc.delete();
  }

  // Load all system beasts
  const systemDocs = await systemPack.getDocuments();
  const beasts = systemDocs.filter(a => a.system.beingType === "Beasts");

  let created = 0;
  let modified = 0;

  for (const [beastName, rules] of Object.entries(MODIFICATION_RULES)) {
    const source = beasts.find(b => b.name === beastName);
    if (!source) {
      console.warn(`${MODULE_ID} | PopulateBeasts | Beast "${beastName}" not found in system compendium.`);
      continue;
    }

    // Clone the source data
    const actorData = source.toObject();
    delete actorData._id; // Let Foundry assign new ID

    // Apply modifications if there are action rules
    if (rules.actions && Object.keys(rules.actions).length > 0) {
      actorData.system = applyModifications(actorData.system, rules);
      modified++;
    }

    // Mark as VCE-modified
    actorData.flags = actorData.flags || {};
    actorData.flags[MODULE_ID] = { vceModified: true };

    // Create in module compendium
    await Actor.create(actorData, { pack: VCE_PACK_ID });
    created++;
  }

  // Lock the compendium
  await vcePack.configure({ locked: true });

  const msg = `VCE Beast Compendium populated: ${created} beasts created (${modified} modified).`;
  console.log(`${MODULE_ID} | PopulateBeasts | ${msg}`);
  ui.notifications.info(msg);
}
