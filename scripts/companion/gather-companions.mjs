/**
 * Gather Companions — HUD button that compresses/releases a PC's companion tokens.
 *
 * Adds a compress/expand button to the right-click HUD on any PC token.
 * - Gather: snapshots each companion token's full document (preserves delta),
 *   animates them to the hero, deletes them from the scene, and stores the
 *   snapshots on the hero's flag. Works only for companions flagged by VCE
 *   (actor.controllerActorId === hero.id).
 * - Release: recreates each token from its snapshot in a spiral around the hero,
 *   preserving HP, conditions, imbues, and any other delta state.
 *
 * Mirrors the Vagabond system's _gatherParty / _releaseParty pattern (see
 * systems/vagabond/module/vagabond.mjs) but scoped to VCE-flagged companions
 * instead of party members.
 *
 * Replaces vagabond-crawler's `GatherFriendlies` (v0.4.0): the companion concept
 * lives in VCE, so the gather logic does too. The crawler's init of
 * GatherFriendlies is disabled in this release.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { CompanionSpawner } from "./companion-spawner.mjs";

const FLAG_GATHERED = "gatheredCompanions";

export const GatherCompanions = {
  init() {
    Hooks.on("renderTokenHUD", this._onRenderTokenHUD.bind(this));
    log("GatherCompanions", "HUD hook registered.");
  },

  _onRenderTokenHUD(hud, html) {
    const token = hud.object;
    if (token?.actor?.type !== "character") return;
    if (!token.actor.isOwner) return;

    const leftCol = html.querySelector(".col.left");
    if (!leftCol) return;
    if (leftCol.querySelector(".vce-gather-companions")) return;

    const hero = token.actor;
    const isGathered = !!hero.getFlag(MODULE_ID, FLAG_GATHERED);

    // Only show the button if there's something to gather OR something already gathered
    const companionsOnScene = isGathered ? null : CompanionSpawner.getCompanionsFor(hero)
      .filter(c => c.tokenId && c.actor.token ? true : !!c.tokenId);
    if (!isGathered && companionsOnScene && companionsOnScene.length === 0) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("control-icon", "vce-gather-companions");
    if (isGathered) btn.classList.add("active");
    btn.setAttribute("data-tooltip", isGathered
      ? `Release ${hero.name}'s Companions`
      : `Gather ${hero.name}'s Companions`);
    btn.innerHTML = isGathered
      ? '<i class="fas fa-expand-arrows-alt"></i>'
      : '<i class="fas fa-compress-arrows-alt"></i>';

    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const gathered = !!hero.getFlag(MODULE_ID, FLAG_GATHERED);
      const success = gathered
        ? await this.releaseCompanions(token)
        : await this.gatherCompanions(token);
      if (success) hud.render();
    });

    leftCol.appendChild(btn);
  },

  /**
   * Snapshot every companion token linked to the hero, animate them to the
   * hero's position, delete them from the scene, and store the snapshots.
   *
   * @param {Token} heroToken - the hero's placeable token
   * @returns {Promise<boolean>} true if at least one companion was gathered
   */
  async gatherCompanions(heroToken) {
    if (!heroToken?.document) return false;
    const hero = heroToken.actor;
    const scene = heroToken.document.parent;
    if (!hero || !scene) return false;

    // Find every placed token on this scene that points to a companion of the hero.
    // Match by world actor id so unlinked tokens (synthetic actors) resolve correctly.
    const companions = CompanionSpawner.getCompanionsFor(hero);
    if (!companions.length) {
      ui.notifications.warn(`${hero.name} has no companions to gather.`);
      return false;
    }

    const companionActorIds = new Set(companions.map(c => c.actor.id));
    const memberTokens = scene.tokens
      .filter(td => companionActorIds.has(td.actorId))
      .map(td => td.object ?? canvas.tokens.get(td.id))
      .filter(Boolean);

    if (!memberTokens.length) {
      ui.notifications.warn(`No companion tokens to gather on this scene.`);
      return false;
    }

    // Snapshot full token document data (preserves delta for unlinked tokens: HP,
    // conditions, imbues, statuses — so Release recreates the exact same tokens).
    const savedTokenData = memberTokens.map(mt => {
      const obj = mt.document.toObject();
      delete obj._id;
      return obj;
    });

    // Animate member tokens to the hero's position
    const { x, y } = heroToken.document;
    await Promise.all(memberTokens.map(mt => mt.document.update({ x, y })));

    // Let the animation play before deleting
    await new Promise(resolve => setTimeout(resolve, 700));

    // Delete the tokens from the scene
    await scene.deleteEmbeddedDocuments("Token", memberTokens.map(mt => mt.id));

    // Store snapshots on the hero so we can release later
    await hero.setFlag(MODULE_ID, FLAG_GATHERED, savedTokenData);

    ui.notifications.info(`Gathered ${memberTokens.length} companion${memberTokens.length === 1 ? "" : "s"}.`);
    log("GatherCompanions", `Gathered ${memberTokens.length} tokens for ${hero.name}`);
    return true;
  },

  /**
   * Recreate previously-gathered tokens in a spread around the hero.
   *
   * @param {Token} heroToken
   * @returns {Promise<boolean>} true if any tokens were released
   */
  async releaseCompanions(heroToken) {
    if (!heroToken?.document) return false;
    const hero = heroToken.actor;
    const scene = heroToken.document.parent;
    if (!hero || !scene) return false;

    const savedTokenData = hero.getFlag(MODULE_ID, FLAG_GATHERED) ?? [];
    if (!savedTokenData.length) {
      ui.notifications.warn(`${hero.name} has no gathered companions to release.`);
      return false;
    }

    const { x: px, y: py } = heroToken.document;
    const gridSize = scene.grid?.size ?? canvas.grid?.size ?? 100;
    const offsets = _releaseOffsets(savedTokenData.length, gridSize);

    // Place each snapshot at a spread position around the hero.
    const tokenDataArray = savedTokenData.map((data, i) => {
      const off = offsets[i] ?? { x: 0, y: 0 };
      return { ...data, x: px + off.x, y: py + off.y };
    });

    await scene.createEmbeddedDocuments("Token", tokenDataArray);

    await hero.unsetFlag(MODULE_ID, FLAG_GATHERED);

    ui.notifications.info(`Released ${savedTokenData.length} companion${savedTokenData.length === 1 ? "" : "s"}.`);
    log("GatherCompanions", `Released ${savedTokenData.length} tokens for ${hero.name}`);
    return true;
  },
};

/**
 * Compute free adjacent-square offsets in a spiral pattern around origin.
 * Returns `count` offsets suitable for placing released companion tokens.
 * First ring is the 8 neighbours, then expanding rings.
 *
 * @param {number} count - number of offsets to return
 * @param {number} gridSize - grid size in pixels
 * @returns {Array<{x: number, y: number}>}
 */
function _releaseOffsets(count, gridSize) {
  const offsets = [];
  // Ring 1: 8 adjacent
  const ring1 = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  for (const [dx, dy] of ring1) {
    offsets.push({ x: dx * gridSize, y: dy * gridSize });
    if (offsets.length >= count) return offsets;
  }
  // Ring 2: 16 cells at distance 2
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
      offsets.push({ x: dx * gridSize, y: dy * gridSize });
      if (offsets.length >= count) return offsets;
    }
  }
  // If we still need more, fall back to stacking on the last offset
  while (offsets.length < count) offsets.push(offsets[offsets.length - 1] ?? { x: 0, y: 0 });
  return offsets;
}
