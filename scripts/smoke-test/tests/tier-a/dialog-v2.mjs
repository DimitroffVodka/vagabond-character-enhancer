/**
 * Tier A — DialogV2 button-click behavior.
 *
 * v0.5.0 fixed two dialogs whose custom buttons silently did nothing because
 * `render: (event, dialog) => {...}` isn't a valid DialogV2 constructor
 * option — the callback never ran, so click listeners never attached.
 *
 * Both fixed dialogs now route through native button callbacks via
 * `DialogV2.wait()`. These tests confirm:
 *   1. Draconic Resilience picker — clicking a damage-type button persists
 *      the actor flag.
 *   2. Imbue weapon picker — clicking a weapon button records imbue state.
 *
 * Both tests programmatically click the button rather than waiting on UI
 * input; the dialog briefly appears and is auto-dismissed.
 */
import { MODULE_ID } from "../../../utils.mjs";

const FLAG_RESILIENCE_TYPE = "draken_draconicResilienceType";

/**
 * Click the dialog button whose action matches, scoped to the LAST (top-most)
 * open dialog. Without scoping, document.querySelector grabs the first matching
 * dialog DOM-wise, which can be a stray left over by another test — leading to
 * confusing "clicked the wrong button" failures (e.g. clicked acid instead of
 * fire when the Draken dialog's button order matches a stale dialog's).
 */
async function _clickDialogButton(action, timeoutMs = 1000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const dialogs = [...document.querySelectorAll("dialog.application")];
    const top = dialogs[dialogs.length - 1];
    const btn = top?.querySelector(`button[data-action="${action}"]`);
    if (btn) { btn.click(); return true; }
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

/** Dismiss any pre-existing dialogs so this test starts clean. */
async function _dismissOpenDialogs() {
  for (const d of [...document.querySelectorAll("dialog.application")]) {
    const close = d.querySelector('button[data-action="close"], button[data-action="cancel"]');
    if (close) close.click();
    else d.close?.();
  }
  await new Promise(r => setTimeout(r, 100));
}

export const tests = [

  // ── Draconic Resilience: buttons actually persist flag ──────────────────
  {
    id: "dialogv2.draken-resilience-button-fires",
    name: "DialogV2: Draconic Resilience type picker — clicking 'fire' persists flag",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.TestPC;
      if (!actor) { assert(false, "TestPC fixture missing"); return; }

      // Clear any prior choice so we're testing fresh
      await actor.unsetFlag(MODULE_ID, FLAG_RESILIENCE_TYPE).catch(() => {});
      // Dismiss any pre-existing dialogs left over by a prior test
      await _dismissOpenDialogs();

      const { DrakenFeatures } = await import("../../../ancestry-features/draken.mjs");

      // Fire the dialog (returns a Promise we'll await)
      const dialogPromise = DrakenFeatures.promptResilienceChoice(actor);

      // Race to click the "fire" button
      const clicked = await _clickDialogButton("fire", 1500);
      assert(clicked, "Dialog 'fire' button should be findable + clickable within 1.5s");

      const result = await dialogPromise.catch(() => null);
      await wait(200);

      assert(result === "fire", `Dialog should resolve to 'fire', got ${JSON.stringify(result)}`);
      assert(actor.getFlag(MODULE_ID, FLAG_RESILIENCE_TYPE) === "fire",
        `Actor flag should be 'fire', got ${actor.getFlag(MODULE_ID, FLAG_RESILIENCE_TYPE)}`);

      // The dialog also creates a display AE. Verify.
      const ae = [...actor.effects].find(e => /Draconic Resilience/.test(e.name ?? ""));
      assert(!!ae, "Should create a 'Draconic Resilience (Fire)' display AE");
    },
  },

  // ── Imbue weapon picker: buttons fire applyImbue ─────────────────────────
  {
    id: "dialogv2.imbue-weapon-picker-button-fires",
    name: "DialogV2: Imbue weapon picker — clicking a weapon records imbue state",
    tier: "a",
    usesFixtures: ["Witch"],
    skip: () => {
      // Need a Witch with at least 2 equipped weapons for the picker to fire.
      // (1 weapon auto-selects; 0 weapons errors out.) Skip if the fixture
      // hasn't been set up that way — better than a false fail.
      const witch = game.actors.getName("_smoke-Witch");
      if (!witch) return true;
      const weapons = witch.items.filter(i =>
        i.type === "weapon" || (i.type === "equipment" && i.system?.equipmentType === "weapon")
      );
      return weapons.filter(w => w.system?.equipped).length < 2;
    },
    skipReason: "Needs ≥2 equipped weapons on Witch fixture",
    run: async ({ fixtures, assert, wait }) => {
      const actor = fixtures.Witch;
      if (!actor) { assert(false, "Witch fixture missing"); return; }

      // Pick the first equipped weapon to target
      const weapons = actor.items.filter(i =>
        i.system?.equipped && (i.type === "weapon" || (i.type === "equipment" && i.system?.equipmentType === "weapon"))
      );
      const targetWeapon = weapons[0];

      const { ImbueManager } = await import("../../../spell-features/imbue-manager.mjs");
      const spellData = {
        spellId: "smoke-test-imbue",
        spellName: "TestImbue",
        spellImg: "icons/svg/aura.svg",
        damageType: "fire",
        damageDice: 1,
        dieSize: 6,
        hasEffect: false,
      };

      const dialogPromise = ImbueManager.promptWeaponPicker(actor, spellData);
      const clicked = await _clickDialogButton(targetWeapon.id, 1500);
      assert(clicked, `Imbue weapon button '${targetWeapon.id}' should be clickable within 1.5s`);

      const result = await dialogPromise.catch(() => null);
      await wait(200);

      assert(result === targetWeapon.id, `Dialog should resolve to weapon id, got ${result}`);
      const imbueState = actor.getFlag(MODULE_ID, "imbue");
      assert(!!imbueState, "Imbue flag should be set after button click");
      if (imbueState) {
        assert(imbueState.weaponId === targetWeapon.id,
          `Imbue.weaponId should be the clicked weapon, got ${imbueState.weaponId}`);
        assert(imbueState.spellName === "TestImbue",
          `Imbue.spellName should be 'TestImbue', got ${imbueState.spellName}`);
      }

      // Cleanup — clearImbue removes the flag + display AE
      try { await ImbueManager.clearImbue(actor); } catch {}
    },
  },
];
