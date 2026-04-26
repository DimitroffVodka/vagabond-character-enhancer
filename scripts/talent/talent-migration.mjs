/**
 * Talent migrations — one-shot data updates run on world load.
 *
 * Currently:
 *   v0.4.2 — `talentDeliveryV2Migrated`
 *     Expand the four self-buff Talents (Shield, Evade, Absence, Transvection)
 *     from `delivery: ["self"]` to `["self", "touch", "remote"]`. With the
 *     unified Cast pipeline, buff Talents can now be cast on allies via
 *     Touch / Remote, and dropping the restrictive delivery list lets the
 *     dialog surface those choices. Updates both the compendium pack and
 *     any Talent items already embedded on actors.
 *
 * Each migration is gated by a hidden world setting so it runs exactly once
 * per world and is GM-only (only the GM has write access to compendium packs).
 */

import { MODULE_ID, log } from "../utils.mjs";
import { TALENT_TYPE } from "./talent-data-model.mjs";

/** Talent names whose delivery list should expand to self / touch / remote. */
const BUFF_TALENT_NAMES = ["Shield", "Evade", "Absence", "Transvection"];

/** Target delivery list for the migration. */
const EXPANDED_DELIVERY = ["self", "touch", "remote"];

/**
 * Run all pending talent migrations. Call from the module's ready hook.
 */
export async function runTalentMigrations() {
  if (!game.user.isGM) return;
  await _migrateBuffTalentDelivery();
}

/**
 * v0.4.2 — expand buff Talent delivery lists.
 */
async function _migrateBuffTalentDelivery() {
  const settingKey = "talentDeliveryV2Migrated";
  if (game.settings.get(MODULE_ID, settingKey)) return;

  log("TalentMigration", "Running buff-Talent delivery expansion...");

  const expectedSet = new Set(EXPANDED_DELIVERY);
  const needsUpdate = (current) => {
    const cur = Array.isArray(current) ? current : [];
    if (cur.length !== EXPANDED_DELIVERY.length) return true;
    for (const d of expectedSet) {
      if (!cur.includes(d)) return true;
    }
    return false;
  };

  // 1) Compendium pack — update the source docs so future picks get the
  //    expanded delivery list out of the box. Module packs are locked by
  //    default in Foundry; unlock for the duration of the migration and
  //    restore the original lock state afterward (mirrors populate-beasts).
  const pack = game.packs.get(`${MODULE_ID}.vce-talents`);
  if (pack) {
    const wasLocked = pack.locked;
    try {
      if (wasLocked) await pack.configure({ locked: false });
      const docs = await pack.getDocuments();
      let packUpdates = 0;
      for (const doc of docs) {
        if (!BUFF_TALENT_NAMES.includes(doc.name)) continue;
        if (!needsUpdate(doc.system?.delivery)) continue;
        await doc.update({ "system.delivery": [...EXPANDED_DELIVERY] });
        packUpdates++;
        log("TalentMigration", `Pack: updated ${doc.name} delivery → ${EXPANDED_DELIVERY.join(", ")}`);
      }
      log("TalentMigration", `Compendium update complete (${packUpdates} talent doc(s) modified).`);
    } catch (err) {
      console.error(`${MODULE_ID} | TalentMigration: pack update failed`, err);
      // Don't mark migrated — let the next world load retry.
      // Restore lock state before bailing out.
      if (wasLocked) {
        try { await pack.configure({ locked: true }); } catch (_) { /* best effort */ }
      }
      return;
    }
    if (wasLocked) {
      try { await pack.configure({ locked: true }); }
      catch (err) { console.warn(`${MODULE_ID} | TalentMigration: failed to relock pack`, err); }
    }
  } else {
    log("TalentMigration", `Pack ${MODULE_ID}.vce-talents not found — skipping pack update.`);
  }

  // 2) Embedded items on world actors — characters who already picked one
  //    of these Talents need the expanded delivery so they can pick Remote
  //    in the cast dialog without re-picking the Talent.
  let actorUpdates = 0;
  for (const actor of game.actors) {
    const stale = actor.items.filter(i =>
      i.type === TALENT_TYPE
      && BUFF_TALENT_NAMES.includes(i.name)
      && needsUpdate(i.system?.delivery)
    );
    if (stale.length === 0) continue;
    try {
      const updates = stale.map(i => ({ _id: i.id, "system.delivery": [...EXPANDED_DELIVERY] }));
      await actor.updateEmbeddedDocuments("Item", updates);
      actorUpdates += updates.length;
      log("TalentMigration", `${actor.name}: updated ${updates.length} talent item(s)`);
    } catch (err) {
      console.warn(`${MODULE_ID} | TalentMigration: actor ${actor.name} update failed`, err);
    }
  }
  log("TalentMigration", `Actor update complete (${actorUpdates} embedded talent item(s) modified).`);

  await game.settings.set(MODULE_ID, settingKey, true);
  ui.notifications.info(
    `Vagabond Character Enhancer: expanded delivery options on Shield / Evade / Absence / Transvection.`
  );
  log("TalentMigration", "Buff-Talent delivery migration complete.");
}
