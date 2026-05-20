/**
 * Smoke-test scene helper — place fixture actors as tokens on the current
 * scene for behavioral tests that need real positioning + targeting.
 *
 * Pattern:
 *   const { placed, cleanup } = await SceneHelper.placeFixtures({
 *     caster: { fixture: "Revelator", x: 200, y: 200, disposition: 1 },
 *     ally:   { fixture: "Generic",   x: 300, y: 200, disposition: 1 },
 *     hostile:{ fixture: "HostileNPC", x: 400, y: 200, disposition: -1 },
 *   });
 *   // ... do test work using placed.caster.token, placed.ally.token, etc.
 *   await cleanup();
 *
 * Tokens are tagged with `flags.vagabond-character-enhancer.smokeToken: true`
 * so cleanup removes only what we placed — never touches user tokens.
 *
 * Placement also TARGETS the hostile/undead token if requested, so
 * disposition-aware code paths (Exalt doubling, brawl intent) see it.
 */
import { MODULE_ID } from "../utils.mjs";
import { Fixtures } from "./fixtures.mjs";

const TOKEN_FLAG = "smokeToken";

const TOKEN_DISPOSITIONS = {
  friendly: 1,
  neutral: 0,
  hostile: -1,
  secret: -2,
};

function dispositionValue(raw) {
  if (typeof raw === "number") return raw;
  return TOKEN_DISPOSITIONS[raw] ?? 1;
}

export const SceneHelper = {
  /**
   * Place a single fixture as a token on the current scene.
   * @param {string} fixtureName - Fixture short-name (e.g. "Revelator")
   * @param {object} opts
   * @param {number} opts.x - Pixel position (use grid increments)
   * @param {number} opts.y
   * @param {number|string} [opts.disposition=1] - Token disposition
   * @returns {Promise<{actor: Actor, token: TokenDocument}>}
   */
  async placeFixture(fixtureName, opts = {}) {
    const actor = Fixtures.get(fixtureName);
    if (!actor) throw new Error(`Fixture "${fixtureName}" not found — call Fixtures.ensureAll first`);
    const scene = canvas.scene;
    if (!scene) throw new Error("No active scene — open a scene before running scene-helper tests");

    // Inherit the actor's prototype `actorLink` setting (true for characters,
    // false for NPCs by default). Without this, the placed token is unlinked
    // and AEs applied via `token.actor` go to a synthetic delta instance —
    // the global actor (which tests reference) never sees them. This was
    // the silent-fail mode that made the aura-buff tests look broken when
    // the code was actually working correctly.
    const tokenData = {
      actorId: actor.id,
      name: actor.name,
      x: opts.x ?? 200,
      y: opts.y ?? 200,
      width: 1,
      height: 1,
      actorLink: actor.prototypeToken?.actorLink ?? (actor.type === "character"),
      disposition: dispositionValue(opts.disposition ?? 1),
      flags: { [MODULE_ID]: { [TOKEN_FLAG]: true } },
    };

    // Remove any pre-existing tokens for this fixture actor (strays left by a
    // prior run whose cleanup didn't complete). Without this, getActiveTokens()
    // [0] inside product code can resolve to a stray token instead of the one we
    // place — which silently broke the ranged-at-Close hinder test (it measured
    // off a leftover token 25ft away instead of the 5ft placement). Safe: these
    // are `_smoke-*` fixtures, never user tokens.
    const strayIds = scene.tokens.filter(t => t.actorId === actor.id).map(t => t.id);
    if (strayIds.length) await scene.deleteEmbeddedDocuments("Token", strayIds);

    const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [tokenData]);
    return { actor, token: tokenDoc };
  },

  /**
   * Place several fixtures at once. The arrangement is a flat record:
   *   { caster: { fixture, x, y, disposition }, target: {...}, ... }
   * Returns:
   *   - `placed`: { caster: {actor, token}, target: {actor, token}, ... }
   *   - `cleanup`: async fn that removes the placed tokens + clears targets
   *
   * @param {object} arrangement
   * @returns {Promise<{ placed: object, cleanup: () => Promise<void> }>}
   */
  async placeFixtures(arrangement) {
    const placed = {};
    const placedTokenIds = [];
    for (const [role, spec] of Object.entries(arrangement)) {
      const { fixture, ...opts } = spec;
      const result = await this.placeFixture(fixture, opts);
      placed[role] = result;
      placedTokenIds.push(result.token.id);
    }

    const cleanup = async () => {
      const scene = canvas.scene;
      if (!scene) return;
      const existing = placedTokenIds.filter(id => scene.tokens.get(id));
      if (existing.length > 0) {
        await scene.deleteEmbeddedDocuments("Token", existing);
      }
      game.user.targets.clear();
    };

    // Give the canvas time to register the placeables in
    // `canvas.tokens.placeables`. Without this, code that iterates the
    // canvas placeables (like `_applyBuffsInRange`) misses the freshly
    // created tokens — silent miss, no error. 350ms is sometimes too
    // short on busy scenes; 700ms is safe across the test suite.
    await new Promise(r => setTimeout(r, 700));

    return { placed, cleanup };
  },

  /**
   * Programmatically target one or more tokens.
   * The system's per-die-bonus doubling reads `game.user.targets`.
   */
  setTargets(tokens) {
    game.user.targets.clear();
    const arr = Array.isArray(tokens) ? tokens : [tokens];
    for (const t of arr) {
      const placeable = t?.object ?? canvas.tokens.get(t?.id);
      placeable?.setTarget(true, { releaseOthers: false, groupSelection: false });
    }
  },

  /** Convenience — clear any leftover smoke-test tokens from prior runs. */
  async cleanupOrphans() {
    const scene = canvas.scene;
    if (!scene) return 0;
    const orphans = scene.tokens.filter(t =>
      t.getFlag(MODULE_ID, TOKEN_FLAG) === true
    ).map(t => t.id);
    if (orphans.length > 0) {
      await scene.deleteEmbeddedDocuments("Token", orphans);
    }
    return orphans.length;
  },
};
