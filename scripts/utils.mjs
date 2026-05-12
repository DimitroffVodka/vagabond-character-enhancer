/**
 * Shared Utilities
 * Common functions used across all class feature modules.
 */

export const MODULE_ID = "vagabond-character-enhancer";

/**
 * Log a debug message if debug mode is enabled.
 * @param {string} prefix - Class or subsystem name (e.g. "Barbarian", "Detector")
 * @param {...any} args - Message parts
 */
export function log(prefix, ...args) {
  if (game.settings.get(MODULE_ID, "debugMode")) {
    console.log(`${MODULE_ID} | ${prefix} |`, ...args);
  }
}

/**
 * Check if an actor has a specific feature flag.
 * @param {Actor} actor
 * @param {string} flag - e.g. "barbarian_rage"
 * @returns {boolean}
 */
export function hasFeature(actor, flag) {
  const features = actor?.getFlag(MODULE_ID, "features");
  return features?.[flag] ?? false;
}

/**
 * Get all feature flags for an actor.
 * @param {Actor} actor
 * @returns {object|null}
 */
export function getFeatures(actor) {
  return actor?.getFlag?.(MODULE_ID, "features") ?? null;
}

/**
 * Combine a favor modifier with an existing favorHinder state.
 * favor + favor = favor, none + favor = favor, hinder + favor = none (cancel)
 * @param {string} currentFH - "favor", "hinder", or "none"
 * @param {"favor"|"hinder"} modifier - what to apply
 * @returns {string}
 */
export function combineFavor(currentFH, modifier = "favor") {
  if (modifier === "favor") {
    return currentFH === "hinder" ? "none" : "favor";
  }
  if (modifier === "hinder") {
    return currentFH === "favor" ? "none" : "hinder";
  }
  return currentFH;
}

/**
 * Register a chat-message render callback that works on both v14
 * (`renderChatMessageHTML`, HTMLElement) and v13.330+ (`renderChatMessage`,
 * jQuery — deprecated on v14). Coerces `html` to a plain HTMLElement before
 * invoking the callback so consumers can use `el.querySelector(...)` etc
 * without a jQuery guard at every call site.
 *
 * @param {(message: ChatMessage, html: HTMLElement, context?: object) => void} callback
 */
export function onRenderChatMessage(callback) {
  const useNewHook = foundry.utils.isNewerVersion(game.version, "13.330");
  const hookName = useNewHook ? "renderChatMessageHTML" : "renderChatMessage";
  Hooks.on(hookName, (message, html, context) => {
    const el = html instanceof HTMLElement ? html : (html?.[0] ?? html);
    callback(message, el, context);
  });
}

/**
 * Register a renderApplicationV2 callback scoped to actor sheets of a given
 * type. Replaces the boilerplate `Hooks.on("renderApplicationV2", (app, html)
 * => { if (app.actor?.type !== "character") return; ... })` repeated across
 * 15+ call sites. Coerces `html` to HTMLElement.
 *
 * @param {(app: Application, html: HTMLElement, data?: object) => void} callback
 * @param {object} [opts]
 * @param {string|null} [opts.type] Actor type filter, e.g. "character"; pass
 *   `null` to receive every sheet render. Default "character".
 */
export function onRenderActorSheet(callback, { type = "character" } = {}) {
  Hooks.on("renderApplicationV2", (app, html, data) => {
    if (!app?.actor) return;
    if (type && app.actor.type !== type) return;
    const el = html instanceof HTMLElement ? html : (html?.[0] ?? html);
    callback(app, el, data);
  });
}

/**
 * Run a `registerHooks()`-style init function in a try/catch so one failing
 * subsystem doesn't abort the rest of the module init. Errors are logged with
 * the subsystem label so they surface in the console instead of silently
 * killing every downstream init step.
 *
 * Background: VCE init runs inside one large `Hooks.once("ready")` callback.
 * If any subsystem throws, Foundry's async hook dispatcher swallows the
 * error and all subsequent init code is skipped — presents as "half-loaded
 * VCE" with no console errors. Wrapping each subsystem's init in this helper
 * ensures every failure surfaces.
 *
 * @param {string} label Subsystem name, used in error logging.
 * @param {() => (void|Promise<void>)} fn The init function to run.
 */
export async function safeRegister(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`${MODULE_ID} | ${label} init failed:`, err);
  }
}

/**
 * Check if any PC combatant (or scene PC) has an active Inspiration buff.
 * @returns {boolean}
 */
export function hasActiveInspiration() {
  if (game.combat) {
    for (const combatant of game.combat.combatants) {
      if (combatant.actor?.type === "character" &&
          combatant.actor.effects?.find(e => e.getFlag(MODULE_ID, "virtuosoBuff") === "inspiration")) {
        return true;
      }
    }
    return false;
  }
  const scenePCs = canvas.tokens?.placeables?.filter(t => t.actor?.type === "character") || [];
  return scenePCs.some(t => {
    const features = t.actor?.getFlag(MODULE_ID, "features");
    return features?.bard_virtuoso;
  });
}
