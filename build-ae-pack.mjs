/**
 * Generate the vce-active-effects compendium source JSON files from CATALOG.
 *
 * Reads CATALOG from scripts/active-effects-catalog.mjs, emits one JSON per
 * entry to packs/_source/vce-active-effects/. Each AE gets a stable 16-char
 * `_id` derived from the canonicalId so re-runs of this script don't churn
 * IDs (re-packing the LevelDB would otherwise re-key every entry).
 *
 * Run: node build-ae-pack.mjs
 * Then: npx fvtt package pack --in packs/_source/vce-active-effects --out packs/vce-active-effects --id vagabond-character-enhancer --type Module
 */
import { CATALOG } from "./scripts/active-effects-catalog.mjs";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, "packs/_source/vce-active-effects");

// Foundry doc IDs are 16-char base16-ish alphanumeric. Derive deterministically
// from canonicalId so the same input always produces the same _id.
function stableId(canonicalId) {
  const hex = createHash("sha1").update(canonicalId).digest("hex");
  // Foundry IDs are case-sensitive alphanumeric; hex chars are safe.
  return hex.slice(0, 16);
}

if (existsSync(SRC_DIR)) rmSync(SRC_DIR, { recursive: true, force: true });
mkdirSync(SRC_DIR, { recursive: true });

const MODULE_ID = "vagabond-character-enhancer";

for (const def of CATALOG) {
  const _id = stableId(def.canonicalId);
  const doc = {
    _id,
    name: def.name,
    img: def.img,
    type: "base",
    description: def.description ?? "",
    changes: def.changes ?? [],
    disabled: def.disabled ?? false,
    transfer: true,
    statuses: def.statuses ?? [],
    // NOTE: `duration.startTime` is intentionally omitted — it is a runtime
    // tracking field set when the effect is applied, and emitting it in source
    // data triggers a v14 deprecation warning. Foundry fills the default.
    duration: { seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null },
    origin: null,
    tint: "#ffffff",
    flags: {
      [MODULE_ID]: {
        canonicalId: def.canonicalId,
        ...(def.moduleFlags ?? {}),
      },
    },
    _key: `!effects!${_id}`,
  };
  const filename = `${def.canonicalId.replace(/[^a-z0-9-]/gi, "_")}_${_id}.json`;
  writeFileSync(resolve(SRC_DIR, filename), JSON.stringify(doc, null, 2) + "\n", "utf8");
}

console.log(`Wrote ${CATALOG.length} effects to ${SRC_DIR}`);
