/**
 * Briar Healer Perk
 * Prerequisite: Spell: Life
 *
 * "The Target of your Life Spell gains a cloak of ethereal thorns while you
 *  Focus on it, giving it +1 Armor and dealing d6 to any Being who damages
 *  them with a Melee Attack."
 *
 * Implementation:
 *   - On Life spell cast by a caster with perk_briarHealer flag, apply a
 *     managed AE to the primary target adding +1 to system.armorBonus.
 *   - The AE is tagged with briarCasterId and persists only while the caster
 *     keeps Life in their system.focus.spellIds.
 *   - Round-tick + updateActor watch caster focus state and remove the AE
 *     when Life is no longer focused.
 *   - Subscribed to `vagabond.postDamageApply` (Vagabond v5.3.0+ system
 *     hook): when a buffed actor takes a melee attack with damage > 0,
 *     roll d6 and post a chat card relaying the d6 damage to the attacker.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { _directSourceAttackType, _saveSourceAttackType, _damageSourceActorId } from "../vagabond-character-enhancer.mjs";
import { gmRequest } from "../socket-relay.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const BRIAR_AE_FLAG = "briarHealerAE";
const BRIAR_CASTER_FLAG = "briarCasterId";
const BRIAR_ICON = "icons/magic/nature/vines-thorned-green.webp";

/* -------------------------------------------- */
/*  BriarHealerManager                           */
/* -------------------------------------------- */

export const BriarHealerManager = {

  registerHooks() {
    // Detect Life spell cast and apply buff (owner-side)
    Hooks.on("createChatMessage", async (message) => {
      await this._onLifeCast(message);
    });

    // GM relay: apply briar buff requested by a non-owner player
    Hooks.on("createChatMessage", async (message) => {
      if (!game.user.isGM) return;
      const flags = message.flags?.[MODULE_ID];
      if (!flags?.briarHealerRequest) return;
      const caster = game.actors.get(flags.casterId);
      const targetActor = game.actors.get(flags.targetId);
      if (!caster || !targetActor) return;
      await this._applyBriarBuff(caster, targetActor);
    });

    // Round tick: remove briar AEs whose caster is no longer focusing Life
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;
      await this._cleanupExpiredBuffs();
    });

    // Caster releases focus mid-round → cleanup their briar AEs immediately
    Hooks.on("updateActor", async (actor, changes) => {
      if (!foundry.utils.hasProperty(changes, "system.focus.spellIds")) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;
      await this._cleanupForCaster(actor);
    });

    // Reactive d6: when a Briar-buffed actor takes >0 melee damage, fire
    // a d6 back at the attacker. Subscribes to the v5.3.0 postDamageApply
    // hook (fires after HP changes) instead of the older calculateFinal-
    // Damage dispatcher in vagabond-character-enhancer.mjs. Direct
    // subscription to the system event reduces coupling and means Briar
    // doesn't depend on VCE's internal damage-pipeline plumbing.
    //
    // postDamageApply context: { actor, amount, damageType, sourceItem,
    // oldHp, newHp }. It doesn't include attack type, so we still consult
    // VCE's `_directSourceAttackType` / `_saveSourceAttackType` globals
    // (set by the wrapper patches on handleSaveRoll / handleApplyDirect).
    // Attacker comes from sourceItem.parent if available, with a fallback
    // to the `_damageSourceActorId` global for paths where sourceItem is
    // null (e.g., the manual "Apply to Target" save button click).
    Hooks.on("vagabond.postDamageApply", (ctx) => {
      if (!ctx?.actor || !(ctx.amount > 0)) return;

      const attackType = _directSourceAttackType || _saveSourceAttackType;
      if (attackType !== "melee") return;

      const briarAE = ctx.actor.effects?.find(e =>
        e.getFlag(MODULE_ID, BRIAR_AE_FLAG) && !e.disabled
      );
      if (!briarAE) return;

      const casterId = briarAE.getFlag(MODULE_ID, BRIAR_CASTER_FLAG);
      const caster = casterId ? game.actors.get(casterId) : null;
      if (!caster) return;
      // Belt-and-braces: the buff AE is removed by the focus-cleanup
      // hooks when the caster drops Life, but a damage event arriving
      // between the focus-drop and the cleanup hook could otherwise
      // sneak through. Refuse to fire the reaction if the caster is
      // not currently focusing Life.
      if (!this._isCasterFocusingLife(caster)) return;

      const attackerId = ctx.sourceItem?.parent?.id || _damageSourceActorId;
      if (!attackerId) return;
      const attacker = game.actors.get(attackerId);
      if (!attacker || attacker.id === ctx.actor.id) return;

      // Fire-and-forget: postDamageApply listeners run synchronously but
      // we want the reaction (dialog-free; just a roll + chat card)
      // to run async without blocking the caller.
      this._triggerBriarReaction(caster, ctx.actor, attacker).catch(err =>
        log("BriarHealer", `Reaction error: ${err.message}`)
      );
    });
  },

  /* -------------------------------------------- */
  /*  Spell Cast Detection                         */
  /* -------------------------------------------- */

  async _onLifeCast(message) {
    // Guard: only the message author processes the cast (avoid multi-client duplicates)
    if (game.user.id !== message.user?.id) return;

    const content = message.content ?? "";
    if (!content.includes("vagabond-chat-card-v2")) return;

    const actorId = message.flags?.vagabond?.actorId;
    const itemId = message.flags?.vagabond?.itemId;
    if (!actorId || !itemId) return;

    const actor = game.actors.get(actorId);
    if (!actor) return;

    const item = actor.items.get(itemId);
    if (!item || item.type !== "spell") return;
    if (item.name.toLowerCase() !== "life") return;

    const features = actor.getFlag(MODULE_ID, "features");
    if (!features?.perk_briarHealer) return;

    const targets = message.flags?.vagabond?.targetsAtRollTime || [];
    if (targets.length === 0) {
      log("BriarHealer", `${actor.name} cast Life with no targets — no briar buff applied`);
      return;
    }

    // RAW: "the Target" (singular) — first target only
    const primary = targets[0];
    const targetActor = game.actors.get(primary.actorId);
    if (!targetActor) return;

    if (game.user.isGM || targetActor.isOwner) {
      await this._applyBriarBuff(actor, targetActor);
    } else {
      // Non-owner player → relay to GM
      await ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <i class="fas fa-seedling" style="color:#5b8a3a;"></i>
              <strong>${actor.name}</strong> requests Briar Healer on <strong>${targetActor.name}</strong>
              <br><span style="font-size:0.8em; opacity:0.7;">Waiting for GM…</span>
            </div>
          </section></div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
        flags: {
          [MODULE_ID]: {
            briarHealerRequest: true,
            casterId: actor.id,
            targetId: targetActor.id
          }
        }
      });
    }
  },

  /* -------------------------------------------- */
  /*  Apply / Remove Buff                          */
  /* -------------------------------------------- */

  async _applyBriarBuff(caster, targetActor) {
    // One briar buff at a time per target — clear any existing briar AEs first
    const existing = targetActor.effects.filter(e => e.getFlag(MODULE_ID, BRIAR_AE_FLAG));
    for (const ae of existing) {
      try { await targetActor.deleteEmbeddedDocuments("ActiveEffect", [ae.id]); } catch {}
    }

    try {
      await targetActor.createEmbeddedDocuments("ActiveEffect", [{
        name: `Briar Healer (${caster.name})`,
        img: BRIAR_ICON,
        origin: `Actor.${caster.id}`,
        changes: [
          { key: "system.armorBonus", mode: 2, value: "1" }
        ],
        disabled: false,
        transfer: true,
        statuses: ["briar-healer"],
        flags: {
          [MODULE_ID]: {
            // No `managed: true` here — that flag triggers
            // FeatureDetector._syncManagedEffects to delete the AE on
            // every scan (because briar isn't in the feature registry).
            // Same bug we hit on the encumbered AE (fixed v0.4.6) and
            // Soulbonder AEs (fixed v0.4.7). The lookup paths use
            // BRIAR_AE_FLAG, not `managed`.
            [BRIAR_AE_FLAG]: true,
            [BRIAR_CASTER_FLAG]: caster.id
          }
        }
      }]);
    } catch (e) {
      log("BriarHealer", `Could not apply briar to ${targetActor.name}: ${e.message}`);
      return;
    }

    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <i class="fas fa-seedling" style="color:#5b8a3a;"></i>
            <strong>${caster.name}</strong> wreathes <strong>${targetActor.name}</strong> in ethereal thorns
            <br><span style="font-size:0.85em; opacity:0.7;">+1 Armor; deals d6 to melee attackers while ${caster.name} Focuses on Life</span>
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: caster })
    });
    log("BriarHealer", `${caster.name} applied Briar Healer to ${targetActor.name}`);
  },

  /* -------------------------------------------- */
  /*  Reactive Damage                              */
  /* -------------------------------------------- */

  async _triggerBriarReaction(caster, target, attacker) {
    const roll = new Roll("1d6");
    await roll.evaluate();
    const dmg = roll.total;

    // Resolve the attacker's active scene token. For unlinked tokens (most
    // NPCs), the world actor's HP is meaningless — each token has its own
    // synthetic actor with its own HP. We need to apply damage to that
    // token's actor, not the world actor. Pass tokenUuid when found so the
    // GM relay updates the right document.
    //
    // `getActiveTokens()` (no args) returns ALL active tokens (linked or
    // unlinked). The second arg `true` returns TokenDocuments (which have
    // `.uuid`). Picking the single matching token; if multiple wolves are
    // on the scene we can't disambiguate without source-token info from
    // the damage event, so we fall back to the world actor in that case.
    const attackerTokenDocs = attacker.getActiveTokens?.(false, true) ?? [];
    const attackerToken = attackerTokenDocs.length === 1 ? attackerTokenDocs[0] : null;

    // Auto-apply damage via GM relay (works for player clients without owner perms
    // on the attacker). Bypasses armor — reactive thorn damage, not an attack roll.
    let applyResult;
    try {
      applyResult = await gmRequest("applyDamage", {
        targetTokenUuid: attackerToken?.uuid, // attackerToken is already a TokenDocument
        targetActorId: attacker.id, // fallback for linked actors / ambiguous token cases
        damage: dmg,
      });
    } catch (e) {
      log("BriarHealer", `applyDamage relay failed: ${e.message}`);
      applyResult = { error: e.message };
    }

    // Build a system-styled chat card matching the look of normal action
    // cards (header with perk icon + name, target portrait, green-pentagon
    // damage block that DSN can animate). Uses the VagabondChatCard
    // builder directly so we get the dice rendering without the auto save/
    // apply buttons that createActionCard's damageRoll path adds.
    const VCC = game.vagabond?.api?.VagabondChatCard;
    if (VCC) {
      try {
        const briarPerk = caster.items.find(i =>
          i.type === "perk" && /briar healer/i.test(i.name)
        );

        const tags = [
          { label: `Protecting ${target.name}`, cssClass: "" },
        ];
        if (applyResult?.ok) {
          tags.push({
            label: `${attacker.name} HP: ${applyResult.oldHp} → ${applyResult.newHp}`,
            cssClass: "",
          });
        } else if (applyResult?.error) {
          tags.push({ label: `Damage failed: ${applyResult.error}`, cssClass: "" });
        }

        const card = new VCC();
        if (briarPerk) card.setItem(briarPerk);
        card.setActor(caster);
        card.setTitle(briarPerk?.name ?? "Briar Healer");
        // Show the attacker as the "target" of the thorn reaction
        const attackerTokenForCard = attacker.getActiveTokens(false, true)[0];
        card.setTargets([{
          tokenId: attackerTokenForCard?.id,
          sceneId: attackerTokenForCard?.parent?.id,
          actorId: attacker.id,
          actorName: attacker.name,
          actorImg: attackerTokenForCard?.texture?.src ?? attacker.img,
        }]);
        // d6 thorns rendered as a damage block with pentagon dice (DSN-friendly)
        card.addDamage(roll, "Thorns", false, "physical");
        card.data.standardTags = tags;
        card.data.propertyTags = [];
        card.setMetadataTags(tags);
        await card.send();
      } catch (e) {
        log("BriarHealer", `card.send failed, falling back to plain message: ${e.message}`);
        // Fallback to the legacy simple format
        const hpLine = applyResult?.ok
          ? `<br><span style="font-size:0.85em; opacity:0.8;">${attacker.name} hp: ${applyResult.oldHp} → ${applyResult.newHp}</span>`
          : `<br><span style="font-size:0.85em; color:#cc4444;">Could not apply damage${applyResult?.error ? `: ${applyResult.error}` : ""}</span>`;
        await ChatMessage.create({
          content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
            <div class="card-body"><section class="content-body">
              <div class="card-description" style="text-align:center;">
                <i class="fas fa-seedling" style="color:#5b8a3a;"></i>
                <strong>${target.name}</strong>'s briar thorns lash <strong>${attacker.name}</strong>
                <br><span style="font-size:0.9em;">Thorns: <strong>${dmg}</strong> (${roll.result})</span>
                ${hpLine}
              </div>
            </section></div>
          </div>`,
          speaker: ChatMessage.getSpeaker({ actor: caster }),
          rolls: [roll]
        });
      }
    }

    log("BriarHealer", `${target.name}'s briar dealt ${dmg} to ${attacker.name}`);
  },

  /* -------------------------------------------- */
  /*  Focus-Tracked Cleanup                        */
  /* -------------------------------------------- */

  async _cleanupExpiredBuffs() {
    for (const actor of game.actors) {
      const briarAEs = actor.effects.filter(e => e.getFlag(MODULE_ID, BRIAR_AE_FLAG));
      for (const ae of briarAEs) {
        const casterId = ae.getFlag(MODULE_ID, BRIAR_CASTER_FLAG);
        const caster = casterId ? game.actors.get(casterId) : null;
        if (!caster || !this._isCasterFocusingLife(caster)) {
          try { await actor.deleteEmbeddedDocuments("ActiveEffect", [ae.id]); } catch {}
          log("BriarHealer", `Briar expired on ${actor.name} (caster not focusing Life)`);
        }
      }
    }
  },

  async _cleanupForCaster(caster) {
    if (this._isCasterFocusingLife(caster)) return;

    for (const actor of game.actors) {
      const briarAEs = actor.effects.filter(e =>
        e.getFlag(MODULE_ID, BRIAR_AE_FLAG)
        && e.getFlag(MODULE_ID, BRIAR_CASTER_FLAG) === caster.id
      );
      for (const ae of briarAEs) {
        try { await actor.deleteEmbeddedDocuments("ActiveEffect", [ae.id]); } catch {}
        log("BriarHealer", `Briar removed from ${actor.name} (${caster.name} stopped focusing Life)`);
      }
    }
  },

  _isCasterFocusingLife(caster) {
    const focusedIds = caster.system?.focus?.spellIds || [];
    return focusedIds.some(id => {
      const spell = caster.items.get(id);
      return spell?.name?.toLowerCase() === "life";
    });
  }
};
