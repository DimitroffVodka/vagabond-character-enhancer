/**
 * Tier A spell-system tests.
 *
 * API notes (from source):
 * - ImbueManager: exposed as game.vagabondCharacterEnhancer.imbue (= ImbueManager object).
 *   Public entry points: applyImbue(actor, weaponId, spellData, opts),
 *   clearImbue(actor), handleImbueCast(actor, spell, state, costs).
 *   There is NO `.imbue(actor, spell, weapon)` convenience method per CLAUDE.md.
 * - BlessManager: entirely hook-driven via createChatMessage. No direct bless(caster, targets)
 *   call exists. _applyBlessAllies/_applyBlessWeapons are internal methods.
 * - WardManager: internal methods only (_applyWardAE, _promptWardReaction).
 *   wardAE is applied via _onWardCast hook when a Ward spell card is created.
 * - api.hex(actor, targetId, targetName, targetImg) — targetId is a string, not an actor.
 * - api.unhex(actor, targetId) — targetId is a string.
 */
import { MODULE_ID } from "../../../utils.mjs";
import { A } from "../../assertions.mjs";

export const tests = [
  {
    id: "imbue.attaches-to-weapon",
    name: "ImbueManager.applyImbue attaches imbue flag to wielder actor",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Witch;
      const weapon = a.items.find(i =>
        (i.type === "weapon" || (i.type === "equipment" && i.system?.equipmentType === "weapon"))
        && i.system?.equipped
      );
      // Some fixture builders don't auto-equip — fall back to first weapon
      const anyWeapon = weapon ?? a.items.find(i =>
        i.type === "weapon" || (i.type === "equipment" && i.system?.equipmentType === "weapon")
      );
      assert(!!anyWeapon, `Witch fixture has a weapon; items: ${a.items.map(i => i.name).join(", ")}`);

      const burnSpell = a.items.find(i => i.name === "Burn" && i.type === "spell");
      assert(!!burnSpell, "Witch fixture has Burn spell");

      if (!anyWeapon || !burnSpell) return;

      const IM = game.vagabondCharacterEnhancer.imbue;
      assert(typeof IM?.applyImbue === "function", "ImbueManager.applyImbue is a function");
      if (typeof IM?.applyImbue !== "function") return;

      // Ensure weapon is equipped (applyImbue gating may check equipped)
      if (!anyWeapon.system?.equipped) {
        try { await anyWeapon.update({ "system.equipped": true }); } catch (e) { /* ignore */ }
        await wait(100);
      }

      // Clear any pre-existing imbue
      await IM.clearImbue(a).catch(() => {});

      try {
        const spellData = {
          spellId: burnSpell.id,
          spellName: burnSpell.name,
          spellImg: burnSpell.img,
          damageType: burnSpell.system?.damageType || "fire",
          damageDice: 1,
          dieSize: 6,
          hasEffect: true,
          effectDesc: burnSpell.system?.description || "",
          pendingDeliveryCost: 0,  // skip mana cost for test
          castInCombat: false,
          expiresAtRound: null,
        };
        await IM.applyImbue(a, anyWeapon.id, spellData, {});
        await wait(300);

        const imbueFlag = a.getFlag?.(MODULE_ID, "imbue");
        assert(!!imbueFlag, `actor should have imbue flag after applyImbue; got ${JSON.stringify(imbueFlag)}`);
        if (imbueFlag) {
          assert(imbueFlag.weaponId === anyWeapon.id, `imbue.weaponId should be "${anyWeapon.id}", got "${imbueFlag.weaponId}"`);
          assert(imbueFlag.spellId === burnSpell.id, `imbue.spellId should be "${burnSpell.id}", got "${imbueFlag.spellId}"`);
        }
      } catch (e) {
        assert(false, `ImbueManager.applyImbue threw: ${e.message}`);
      } finally {
        await IM.clearImbue(a).catch(() => {});
        await wait(150);
      }
    }
  },

  {
    id: "imbue.detaches-on-clear",
    name: "ImbueManager.clearImbue removes the imbue flag and AE",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.Witch;
      const anyWeapon = a.items.find(i =>
        i.type === "weapon" || (i.type === "equipment" && i.system?.equipmentType === "weapon")
      );
      const burnSpell = a.items.find(i => i.name === "Burn" && i.type === "spell");

      assert(!!anyWeapon && !!burnSpell, `prerequisites: weapon=${!!anyWeapon}, burn=${!!burnSpell}`);
      if (!anyWeapon || !burnSpell) return;

      const IM = game.vagabondCharacterEnhancer.imbue;
      if (typeof IM?.applyImbue !== "function" || typeof IM?.clearImbue !== "function") {
        assert(false, "ImbueManager.applyImbue or clearImbue not available");
        return;
      }

      // Ensure weapon is equipped
      if (!anyWeapon.system?.equipped) {
        try { await anyWeapon.update({ "system.equipped": true }); } catch (e) { /* ignore */ }
        await wait(100);
      }

      await IM.clearImbue(a).catch(() => {});

      try {
        const spellData = {
          spellId: burnSpell.id,
          spellName: burnSpell.name,
          spellImg: burnSpell.img,
          damageType: burnSpell.system?.damageType || "fire",
          damageDice: 1,
          dieSize: 6,
          hasEffect: true,
          effectDesc: "",
          pendingDeliveryCost: 0,
          castInCombat: false,
          expiresAtRound: null,
        };
        await IM.applyImbue(a, anyWeapon.id, spellData, {});
        await wait(200);

        // Verify flag was set before clearing
        const imbueBefore = a.getFlag?.(MODULE_ID, "imbue");
        assert(!!imbueBefore, "imbue flag present after applyImbue (pre-clear)");

        // Now clear it
        await IM.clearImbue(a);
        await wait(250);

        const imbueAfter = a.getFlag?.(MODULE_ID, "imbue");
        assert(!imbueAfter, `imbue flag should be cleared; got ${JSON.stringify(imbueAfter)}`);

        // AE should also be gone
        const imbueAE = a.effects.find(e => e.getFlag?.(MODULE_ID, "imbueAE"));
        assert(!imbueAE, `imbue AE should be removed; got "${imbueAE?.name}"`);
      } catch (e) {
        assert(false, `imbue/clear threw: ${e.message}`);
      }
    }
  },

  {
    id: "bless.internal-apply-adds-AE",
    name: "BlessManager._applyBlessAllies creates Bless AE on target",
    tier: "a",
    usesFixtures: ["Revelator", "NPC"],
    run: async ({ fixtures, assert, wait }) => {
      const caster = fixtures.Revelator;
      const target = fixtures.NPC;

      const { BlessManager } = await import("../../spell-features/bless-manager.mjs");

      // Clear any pre-existing bless AE from target
      const existingBlessAEs = target.effects.filter(e =>
        e.getFlag?.(MODULE_ID, "blessAE") || e.name?.toLowerCase?.().includes("bless")
      );
      if (existingBlessAEs.length) {
        await target.deleteEmbeddedDocuments("ActiveEffect", existingBlessAEs.map(e => e.id)).catch(() => {});
        await wait(100);
      }

      try {
        // _applyBlessAllies takes (caster, targets) where targets is an array
        // of { actorId, actorName } objects (the format from vagabond targeting)
        await BlessManager._applyBlessAllies(caster, [{ actorId: target.id, actorName: target.name }]);
        await wait(300);

        const ae = target.effects.find(e =>
          e.getFlag?.(MODULE_ID, "blessAE") || /bless/i.test(e.name)
        );
        assert(!!ae, `Bless AE expected on target; effects: ${target.effects.map(e => e.name).join(", ")}`);

        // Cleanup
        if (ae) {
          await target.deleteEmbeddedDocuments("ActiveEffect", [ae.id]).catch(() => {});
        }
      } catch (e) {
        assert(false, `BlessManager._applyBlessAllies threw: ${e.message}`);
      }
    }
  },

  {
    id: "ward.method-is-callable",
    name: "WardManager exposes callable methods (hook-driven apply)",
    tier: "a",
    usesFixtures: ["Witch"],
    run: async ({ fixtures, assert }) => {
      const a = fixtures.Witch;
      const ward = a.items.find(i => i.name === "Ward" && i.type === "spell");
      assert(!!ward, "Witch fixture has Ward spell");
      if (!ward) return;

      let WardMod;
      try {
        WardMod = await import("../../spell-features/ward-manager.mjs");
      } catch (e) {
        assert(false, `Could not import ward-manager: ${e.message}`);
        return;
      }

      const WM = WardMod.WardManager;
      assert(!!WM, "WardManager export is present");
      if (!WM) return;

      // WardManager is hook-driven: no direct public apply() exists.
      // Verify the internal application method and the hook registration method
      // are callable (not undefined / not a function would be a real bug).
      const hasApply = typeof WM._applyWardAE === "function";
      const hasRegister = typeof WM.registerHooks === "function";
      assert(hasRegister, "WardManager.registerHooks is a function");
      assert(hasApply, "WardManager._applyWardAE is a function (internal apply entry)");

      // Verify the Ward AE flag constant is consistent: the constant WARD_AE_FLAG
      // is used internally but not exported. We can verify it indirectly by
      // confirming the module exports only what's expected.
      const exportKeys = Object.keys(WardMod);
      assert(exportKeys.includes("WardManager"), `ward-manager exports WardManager; exports: ${exportKeys.join(", ")}`);
    }
  },

  {
    id: "hex.applies-and-clears",
    name: "Hex API applies hexed AE to target and unhex clears it",
    tier: "a",
    usesFixtures: ["Witch", "NPC"],
    run: async ({ fixtures, assert, wait }) => {
      const caster = fixtures.Witch;
      const target = fixtures.NPC;
      const api = game.vagabondCharacterEnhancer;

      assert(typeof api.hex === "function", "api.hex is a function");
      assert(typeof api.unhex === "function", "api.unhex is a function");
      if (typeof api.hex !== "function" || typeof api.unhex !== "function") return;

      // Ensure witch has witch_hex feature flag (Witch class L1 should set it)
      const features = caster.getFlag?.(MODULE_ID, "features") ?? {};
      if (!features.witch_hex) {
        // Re-scan to pick up features — fixture might not have run scan yet
        await game.vagabondCharacterEnhancer.rescan(caster);
        await wait(300);
        const featuresAfter = caster.getFlag?.(MODULE_ID, "features") ?? {};
        assert(!!featuresAfter.witch_hex, `Witch fixture should have witch_hex feature; flags: ${JSON.stringify(featuresAfter)}`);
        if (!featuresAfter.witch_hex) return;
      }

      // Remove any pre-existing hex from this target
      await api.unhex(caster, target.id).catch(() => {});
      await wait(100);

      try {
        // api.hex(actor, targetId, targetName, targetImg)
        await api.hex(caster, target.id, target.name, target.img || "icons/svg/mystery-man.svg");
        await wait(300);

        // Check for hexed AE on target
        const hexAE = target.effects.find(e =>
          e.getFlag?.(MODULE_ID, "hexAE") || /hex/i.test(e.name)
        );
        assert(!!hexAE, `hexed AE expected on target after hex; effects: ${target.effects.map(e => e.name).join(", ")}`);

        // Also check hex flag on caster
        const hexTargets = caster.getFlag?.(MODULE_ID, "hexTargets") || [];
        assert(hexTargets.some(h => h.targetId === target.id),
          `caster hexTargets flag should include target; got ${JSON.stringify(hexTargets)}`);

        // Unhex
        await api.unhex(caster, target.id);
        await wait(300);

        const hexAEAfter = target.effects.find(e =>
          e.getFlag?.(MODULE_ID, "hexAE") || /hex/i.test(e.name)
        );
        assert(!hexAEAfter, `hexed AE should be removed after unhex; effects: ${target.effects.map(e => e.name).join(", ")}`);

        const hexTargetsAfter = caster.getFlag?.(MODULE_ID, "hexTargets") || [];
        assert(!hexTargetsAfter.some(h => h.targetId === target.id),
          "caster hexTargets should no longer include target after unhex");
      } catch (e) {
        assert(false, `hex/unhex threw: ${e.message}`);
      }
    }
  }
];
