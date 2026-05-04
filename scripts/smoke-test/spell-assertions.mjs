/**
 * Spell-manager assertion handlers for Tier C spell smoke tests.
 *
 * Each entry is an object with:
 *   setupCaster  — fixture short-name to use as the caster
 *   needsTarget  — bool, whether the test also needs fixtures.NPC
 *   cast(caster, target?)  — async fn that invokes the manager's primary entry
 *   assert({ caster, target, assert }) — async fn that checks expected state
 *   cleanup({ caster, target }) — optional async fn for manual post-test cleanup
 *
 * Actual method names were verified by reading each manager file directly.
 * See scripts/spell-features/ for authoritative source.
 */

import { MODULE_ID } from "../utils.mjs";

export const SPELL_HANDLERS = {

  /* ---------------------------------------------------------------------- */
  /*  imbue — ImbueManager.applyImbue(actor, weaponId, spellData, opts)      */
  /* ---------------------------------------------------------------------- */
  imbue: {
    setupCaster: "Witch",
    needsTarget: false,
    cast: async (caster) => {
      const weapon = caster.items.find(i =>
        (i.type === "weapon" || (i.type === "equipment" && i.system?.equipmentType === "weapon"))
      );
      if (!weapon) throw new Error("imbue: Witch fixture has no weapon item");

      const burnSpell = caster.items.find(i => i.name === "Burn" && i.type === "spell");
      if (!burnSpell) throw new Error("imbue: Witch fixture has no Burn spell");

      // Ensure weapon is equipped
      if (!weapon.system?.equipped) {
        await weapon.update({ "system.equipped": true }).catch(() => {});
        await new Promise(r => setTimeout(r, 100));
      }

      const IM = game.vagabondCharacterEnhancer.imbue;
      if (typeof IM?.applyImbue !== "function") {
        throw new Error("ImbueManager.applyImbue is not a function on the exposed API");
      }

      // Clear any leftover imbue first
      await IM.clearImbue(caster).catch(() => {});

      const spellData = {
        spellId: burnSpell.id,
        spellName: burnSpell.name,
        spellImg: burnSpell.img,
        damageType: burnSpell.system?.damageType || "fire",
        damageDice: 1,
        dieSize: 6,
        hasEffect: true,
        effectDesc: "",
        pendingDeliveryCost: 0, // skip mana deduction in test
        castInCombat: false,
        expiresAtRound: null,
      };
      await IM.applyImbue(caster, weapon.id, spellData, {});
    },
    assert: async ({ caster, assert }) => {
      const flag = caster.getFlag(MODULE_ID, "imbue");
      assert(!!flag, `imbue flag should be set on caster after applyImbue; got ${JSON.stringify(flag)}`);
      if (flag) {
        assert(typeof flag.weaponId === "string", `imbue.weaponId should be a string; got ${JSON.stringify(flag.weaponId)}`);
        assert(typeof flag.spellId === "string", `imbue.spellId should be a string; got ${JSON.stringify(flag.spellId)}`);
      }
    },
    cleanup: async ({ caster }) => {
      const IM = game.vagabondCharacterEnhancer.imbue;
      if (IM?.clearImbue) await IM.clearImbue(caster).catch(() => {});
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  bless — BlessManager._applyBlessAllies(caster, [{actorId, actorName}]) */
  /* ---------------------------------------------------------------------- */
  bless: {
    setupCaster: "Revelator",
    needsTarget: true,
    cast: async (caster, target) => {
      const { BlessManager } = await import("../spell-features/bless-manager.mjs");
      if (typeof BlessManager._applyBlessAllies !== "function") {
        throw new Error("BlessManager._applyBlessAllies is not a function");
      }
      // Clear pre-existing bless AE on target
      const existingBless = target.effects.filter(e =>
        e.getFlag?.(MODULE_ID, "blessAE") || /^bless/i.test(e.name)
      );
      if (existingBless.length) {
        await target.deleteEmbeddedDocuments("ActiveEffect", existingBless.map(e => e.id)).catch(() => {});
        await new Promise(r => setTimeout(r, 100));
      }
      await BlessManager._applyBlessAllies(caster, [{ actorId: target.id, actorName: target.name }]);
    },
    assert: async ({ target, assert }) => {
      const ae = target.effects.find(e =>
        e.getFlag?.(MODULE_ID, "blessAE") || /^bless/i.test(e.name)
      );
      assert(!!ae, `Bless AE expected on target after _applyBlessAllies; effects: ${target.effects.map(e => e.name).join(", ")}`);
    },
    cleanup: async ({ target }) => {
      const { BlessManager: _BM } = await import("../spell-features/bless-manager.mjs").catch(() => ({}));
      const aes = target.effects.filter(e =>
        e.getFlag?.(MODULE_ID, "blessAE") || /^bless/i.test(e.name)
      );
      if (aes.length) await target.deleteEmbeddedDocuments("ActiveEffect", aes.map(e => e.id)).catch(() => {});
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  ward — WardManager._applyWardAE(caster, [{actorId, actorName}])        */
  /* ---------------------------------------------------------------------- */
  ward: {
    setupCaster: "Witch",
    needsTarget: true,
    cast: async (caster, target) => {
      const { WardManager } = await import("../spell-features/ward-manager.mjs");
      if (typeof WardManager._applyWardAE !== "function") {
        throw new Error("WardManager._applyWardAE is not a function");
      }
      // Clear pre-existing ward AE
      const existingWard = target.effects.filter(e => e.getFlag?.(MODULE_ID, "wardAE"));
      if (existingWard.length) {
        await target.deleteEmbeddedDocuments("ActiveEffect", existingWard.map(e => e.id)).catch(() => {});
        await new Promise(r => setTimeout(r, 100));
      }
      await WardManager._applyWardAE(caster, [{ actorId: target.id, actorName: target.name }]);
    },
    assert: async ({ target, assert }) => {
      const ae = target.effects.find(e => e.getFlag?.(MODULE_ID, "wardAE"));
      assert(!!ae, `Ward AE expected on target after _applyWardAE; effects: ${target.effects.map(e => e.name).join(", ")}`);
    },
    cleanup: async ({ target }) => {
      const aes = target.effects.filter(e => e.getFlag?.(MODULE_ID, "wardAE"));
      if (aes.length) await target.deleteEmbeddedDocuments("ActiveEffect", aes.map(e => e.id)).catch(() => {});
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  hex — api.hex(actor, targetId, targetName, targetImg)                  */
  /* ---------------------------------------------------------------------- */
  hex: {
    setupCaster: "Witch",
    needsTarget: true,
    cast: async (caster, target) => {
      const api = game.vagabondCharacterEnhancer;
      if (typeof api.hex !== "function") throw new Error("api.hex is not a function");

      // Ensure witch has witch_hex feature
      const features = caster.getFlag?.(MODULE_ID, "features") ?? {};
      if (!features.witch_hex) {
        await api.rescan(caster);
        await new Promise(r => setTimeout(r, 300));
        const featuresAfter = caster.getFlag?.(MODULE_ID, "features") ?? {};
        if (!featuresAfter.witch_hex) {
          throw new Error(`Witch fixture lacks witch_hex feature flag; features: ${JSON.stringify(featuresAfter)}`);
        }
      }

      // Clear existing hex on this target
      await api.unhex(caster, target.id).catch(() => {});
      await new Promise(r => setTimeout(r, 100));

      await api.hex(caster, target.id, target.name, target.img || "icons/svg/mystery-man.svg");
    },
    assert: async ({ caster, target, assert }) => {
      const hexAE = target.effects.find(e =>
        e.getFlag?.(MODULE_ID, "hexAE") || /^hex/i.test(e.name)
      );
      assert(!!hexAE, `hexed AE expected on target after api.hex; effects: ${target.effects.map(e => e.name).join(", ")}`);

      const hexTargets = caster.getFlag?.(MODULE_ID, "witch_hexTargets") || [];
      assert(
        hexTargets.some(h => h.targetId === target.id),
        `caster witch_hexTargets should include target id "${target.id}"; got ${JSON.stringify(hexTargets)}`
      );
    },
    cleanup: async ({ caster, target }) => {
      const api = game.vagabondCharacterEnhancer;
      if (typeof api.unhex === "function") await api.unhex(caster, target.id).catch(() => {});
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  beast — API existence + CompanionSpawner source sanity                 */
  /*  The Beast spell requires a GUI creature picker (CreaturePicker dialog)  */
  /*  and a placed scene token, both of which require interactive setup.      */
  /*  Smoke test: verify the module loads, exports BeastSpell, and that the   */
  /*  companion source registry knows "spell-beast".                          */
  /* ---------------------------------------------------------------------- */
  beast: {
    setupCaster: "Witch",
    needsTarget: false,
    cast: async (_caster) => {
      // No live invocation — see assert() for what we verify
    },
    assert: async ({ assert }) => {
      let mod;
      try {
        mod = await import("../spell-features/beast-spell.mjs");
      } catch (e) {
        assert(false, `beast-spell.mjs failed to import: ${e.message}`);
        return;
      }
      assert(typeof mod.BeastSpell === "object" && mod.BeastSpell !== null, "BeastSpell export is an object");
      assert(typeof mod.BeastSpell.init === "function", "BeastSpell.init is a function");
      assert(typeof mod.BeastSpell.trigger === "function" || typeof mod.BeastSpell._onFocusToggle === "function",
        "BeastSpell exposes trigger or _onFocusToggle");

      // Verify companion source registry contains spell-beast
      const { COMPANION_SOURCES } = await import("../companion/companion-sources.mjs").catch(() => ({}));
      if (COMPANION_SOURCES) {
        assert(
          "spell-beast" in COMPANION_SOURCES,
          `companion-sources.mjs should have "spell-beast"; keys: ${Object.keys(COMPANION_SOURCES).join(", ")}`
        );
      }
    },
    cleanup: async () => {}
  },

  /* ---------------------------------------------------------------------- */
  /*  raise — API existence check only.                                       */
  /*  Raise requires a defeated NPC token on the scene, a corpse-picker        */
  /*  dialog, and GM-side actor mutation — not feasible as an automated smoke. */
  /* ---------------------------------------------------------------------- */
  raise: {
    setupCaster: "Witch",
    needsTarget: false,
    cast: async () => {
      // No live invocation — see assert()
    },
    assert: async ({ assert }) => {
      let mod;
      try {
        mod = await import("../spell-features/raise-spell.mjs");
      } catch (e) {
        assert(false, `raise-spell.mjs failed to import: ${e.message}`);
        return;
      }
      assert(typeof mod.RaiseSpell === "object" && mod.RaiseSpell !== null, "RaiseSpell export is an object");
      assert(typeof mod.RaiseSpell.init === "function", "RaiseSpell.init is a function");
      assert(typeof mod.RaiseSpell._isFocusingRaise === "function", "RaiseSpell._isFocusingRaise is a function");

      const { COMPANION_SOURCES } = await import("../companion/companion-sources.mjs").catch(() => ({}));
      if (COMPANION_SOURCES) {
        assert(
          "spell-raise" in COMPANION_SOURCES,
          `companion-sources.mjs should have "spell-raise"; keys: ${Object.keys(COMPANION_SOURCES).join(", ")}`
        );
      }
    },
    cleanup: async () => {}
  },

  /* ---------------------------------------------------------------------- */
  /*  animate — API existence check only.                                     */
  /*  Animate requires an inventory-item picker (creates a synthetic NPC)     */
  /*  and a placed scene token — not automatable as a headless smoke test.    */
  /* ---------------------------------------------------------------------- */
  animate: {
    setupCaster: "Witch",
    needsTarget: false,
    cast: async () => {
      // No live invocation — see assert()
    },
    assert: async ({ assert }) => {
      let mod;
      try {
        mod = await import("../spell-features/animate-spell.mjs");
      } catch (e) {
        assert(false, `animate-spell.mjs failed to import: ${e.message}`);
        return;
      }
      assert(typeof mod.AnimateSpell === "object" && mod.AnimateSpell !== null, "AnimateSpell export is an object");
      assert(typeof mod.AnimateSpell.init === "function", "AnimateSpell.init is a function");
      assert(typeof mod.AnimateSpell._isFocusingAnimate === "function", "AnimateSpell._isFocusingAnimate is a function");

      const { COMPANION_SOURCES } = await import("../companion/companion-sources.mjs").catch(() => ({}));
      if (COMPANION_SOURCES) {
        assert(
          "spell-animate" in COMPANION_SOURCES,
          `companion-sources.mjs should have "spell-animate"; keys: ${Object.keys(COMPANION_SOURCES).join(", ")}`
        );
      }
    },
    cleanup: async () => {}
  },

  /* ---------------------------------------------------------------------- */
  /*  effect-only — EffectOnlyHandler module existence                        */
  /*  Handler is hook-driven (renderChatMessage); tests that the module       */
  /*  exports the expected object and the registerHooks method is callable.   */
  /* ---------------------------------------------------------------------- */
  "effect-only": {
    setupCaster: "Witch",
    needsTarget: false,
    cast: async () => {},
    assert: async ({ assert }) => {
      let mod;
      try {
        mod = await import("../spell-features/effect-only-handler.mjs");
      } catch (e) {
        assert(false, `effect-only-handler.mjs failed to import: ${e.message}`);
        return;
      }
      assert(typeof mod.EffectOnlyHandler === "object" && mod.EffectOnlyHandler !== null, "EffectOnlyHandler export is an object");
      assert(typeof mod.EffectOnlyHandler.registerHooks === "function", "EffectOnlyHandler.registerHooks is a function");
      assert(typeof mod.EffectOnlyHandler._processCard === "function", "EffectOnlyHandler._processCard is a function");
    },
    cleanup: async () => {}
  },
};
