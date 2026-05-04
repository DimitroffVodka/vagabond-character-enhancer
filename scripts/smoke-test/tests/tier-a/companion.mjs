/**
 * Tier A companion-spawner tests.
 *
 * API note: CompanionSpawner.spawn takes `creatureUuid` (a UUID string),
 * not a raw actor + tokenData. It returns { tokenId, actorId, success, error? }
 * — not an array of token documents. Dismiss is CompanionSpawner.dismiss(actor).
 */
import { MODULE_ID } from "../../../utils.mjs";

const BEASTS_PACK = "vagabond-character-enhancer.vce-beasts";

/**
 * Get the first beast UUID from the vce-beasts compendium.
 * Returns null (and logs) if the pack is missing or empty.
 */
async function _firstBeastUuid() {
  const pack = game.packs.get(BEASTS_PACK);
  if (!pack) throw new Error(`Pack ${BEASTS_PACK} not found`);
  const idx = await pack.getIndex();
  if (!idx.size && !idx.length) throw new Error(`Pack ${BEASTS_PACK} is empty`);
  const first = idx.contents?.[0] ?? [...idx][0];
  if (!first) throw new Error(`Pack ${BEASTS_PACK} yielded no index entries`);
  return `Compendium.${BEASTS_PACK}.Actor.${first._id}`;
}

export const tests = [
  {
    id: "companion.spawn-via-CompanionSpawner",
    name: "CompanionSpawner.spawn creates actor with companionMeta flag",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const { CompanionSpawner } = await import("../../companion/companion-spawner.mjs");
      let creatureUuid;
      try {
        creatureUuid = await _firstBeastUuid();
      } catch (e) {
        assert(false, `Could not get beast UUID: ${e.message}`);
        return;
      }

      const result = await CompanionSpawner.spawn({
        caster: fixtures.Witch,
        sourceId: "spell-beast",
        creatureUuid,
        suppressChat: true,
        allowMultiple: true,
      });

      try {
        await wait(300);
        assert(result.success === true, `spawn.success should be true; error: ${result.error}`);
        if (!result.success) return;

        const companionActor = game.actors.get(result.actorId);
        assert(!!companionActor, `companion actor ${result.actorId} found in world`);

        const meta = companionActor?.getFlag?.(MODULE_ID, "companionMeta");
        assert(!!meta, "companionMeta flag present on companion actor");
        assert(meta?.sourceId === "spell-beast", `companionMeta.sourceId = "${meta?.sourceId}" expected "spell-beast"`);
        assert(meta?.casterActorId === fixtures.Witch.id || companionActor?.getFlag?.(MODULE_ID, "controllerActorId") === fixtures.Witch.id,
          `caster link present; casterActorId=${meta?.casterActorId}, controllerActorId=${companionActor?.getFlag?.(MODULE_ID, "controllerActorId")}`);
      } finally {
        // Cleanup: dismiss the companion
        if (result.success) {
          const companionActor = game.actors.get(result.actorId);
          if (companionActor) {
            await CompanionSpawner.dismiss(companionActor, { reason: "test" }).catch(() => {});
          }
          await wait(150);
        }
      }
    }
  },

  {
    id: "companion.dismiss-clears-token",
    name: "CompanionSpawner.dismiss removes the spawned companion token",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const { CompanionSpawner } = await import("../../companion/companion-spawner.mjs");
      let creatureUuid;
      try {
        creatureUuid = await _firstBeastUuid();
      } catch (e) {
        assert(false, `Could not get beast UUID: ${e.message}`);
        return;
      }

      const result = await CompanionSpawner.spawn({
        caster: fixtures.Witch,
        sourceId: "spell-beast",
        creatureUuid,
        suppressChat: true,
        allowMultiple: true,
      });

      if (!result.success) {
        assert(false, `spawn failed: ${result.error}`);
        return;
      }

      await wait(200);

      const companionActor = game.actors.get(result.actorId);
      assert(!!companionActor, "companion actor exists before dismiss");

      // Dismiss via the API — should remove the token from the scene
      await CompanionSpawner.dismiss(companionActor, { reason: "test" });
      await wait(400);

      // Token should be gone from its scene
      const meta = companionActor?.getFlag?.(MODULE_ID, "companionMeta");
      const sceneId = meta?.sceneId ?? result.sceneId;
      const tokenId = meta?.tokenId ?? result.tokenId;
      let tokenStillThere = false;
      if (sceneId && tokenId) {
        const scene = game.scenes.get(sceneId);
        tokenStillThere = !!scene?.tokens?.get(tokenId);
      }
      assert(!tokenStillThere, "companion token removed after dismiss");
    }
  },

  {
    id: "companion.zero-hp-auto-terminates",
    name: "Companion at 0 HP auto-dismisses (companion-termination)",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const { CompanionSpawner } = await import("../../companion/companion-spawner.mjs");
      let creatureUuid;
      try {
        creatureUuid = await _firstBeastUuid();
      } catch (e) {
        assert(false, `Could not get beast UUID: ${e.message}`);
        return;
      }

      const result = await CompanionSpawner.spawn({
        caster: fixtures.Witch,
        sourceId: "spell-beast",
        creatureUuid,
        suppressChat: true,
        allowMultiple: true,
      });

      if (!result.success) {
        assert(false, `spawn failed: ${result.error}`);
        return;
      }

      await wait(200);
      const companionActor = game.actors.get(result.actorId);
      assert(!!companionActor, "companion actor found");

      // Read scene/token for later verification
      const metaBefore = companionActor?.getFlag?.(MODULE_ID, "companionMeta");
      const sceneId = metaBefore?.sceneId ?? result.sceneId;
      const tokenId = metaBefore?.tokenId ?? result.tokenId;

      try {
        // Set HP to 0 — CompanionTerminationManager hook should auto-dismiss
        if (companionActor?.isOwner || game.user.isGM) {
          await companionActor.update({ "system.health.value": 0 });
        } else {
          assert(false, "no permission to update companion HP — test cannot proceed");
          return;
        }

        // Termination is deferred 250ms inside CompanionTerminationManager
        await wait(1000);

        let tokenStillThere = false;
        if (sceneId && tokenId) {
          const scene = game.scenes.get(sceneId);
          tokenStillThere = !!scene?.tokens?.get(tokenId);
        }
        assert(!tokenStillThere, "companion token auto-dismissed at 0 HP");
      } finally {
        // Cleanup: if token somehow survived, remove it
        if (sceneId && tokenId) {
          const scene = game.scenes.get(sceneId);
          const tok = scene?.tokens?.get(tokenId);
          if (tok) {
            await scene.deleteEmbeddedDocuments("Token", [tokenId]).catch(() => {});
          }
        }
      }
    }
  },

  {
    id: "companion.controllerActorId-flag-set",
    name: "Spawned companion carries controllerActorId pointing to caster",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const { CompanionSpawner } = await import("../../companion/companion-spawner.mjs");
      let creatureUuid;
      try {
        creatureUuid = await _firstBeastUuid();
      } catch (e) {
        assert(false, `Could not get beast UUID: ${e.message}`);
        return;
      }

      const result = await CompanionSpawner.spawn({
        caster: fixtures.Witch,
        sourceId: "spell-beast",
        creatureUuid,
        suppressChat: true,
        allowMultiple: true,
      });

      try {
        await wait(200);
        assert(result.success === true, `spawn should succeed; error: ${result.error}`);
        if (!result.success) return;

        const companionActor = game.actors.get(result.actorId);
        const controllerId = companionActor?.getFlag?.(MODULE_ID, "controllerActorId");
        const meta = companionActor?.getFlag?.(MODULE_ID, "companionMeta");

        assert(controllerId === fixtures.Witch.id,
          `controllerActorId = "${controllerId}" expected "${fixtures.Witch.id}"`);
        assert(!!game.actors.get(controllerId), "controllerActorId resolves to a world actor");
      } finally {
        if (result.success) {
          const companionActor = game.actors.get(result.actorId);
          if (companionActor) {
            await CompanionSpawner.dismiss(companionActor, { reason: "test" }).catch(() => {});
          }
          await wait(150);
        }
      }
    }
  }
];
