/**
 * Smoke-test assertion helpers.
 * `assert` collects failures rather than throwing — multiple failures per test
 * are reported.
 */
export function createAssert() {
  const failures = [];
  const assert = (condition, message) => {
    if (!condition) failures.push({ message: String(message ?? "(no message)") });
  };
  return { assert, failures };
}

/** Common assertion shortcuts used by Tier A/B/C test files. */
export const A = {
  hasFlag(actor, moduleId, key) {
    return !!actor.getFlag(moduleId, key);
  },
  flagEquals(actor, moduleId, key, expected) {
    const v = actor.getFlag(moduleId, key);
    return foundry.utils.objectsEqual?.(v, expected) ?? JSON.stringify(v) === JSON.stringify(expected);
  },
  hasAE(actor, name) {
    return actor.effects.some(e => e.name === name);
  },
  hasStatus(actor, statusId) {
    return actor.statuses?.has?.(statusId) ?? false;
  },
  chatLastContains(messages, substring) {
    return messages.at(-1)?.content?.includes(substring) ?? false;
  }
};
