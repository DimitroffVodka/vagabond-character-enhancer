/**
 * Raise-adjacent perks:
 *   - Grim Harvest — when your spell kills a non-Artificial/Undead enemy,
 *     regain HP equal to the spell's damage.
 *   - Necromancer — while Focusing on Raise, choose a raised Undead you
 *     control; it regains HP equal to ceil(level/2).
 *
 * (Infesting Burst is handled inline in `scripts/spell-features/raise-spell.mjs`
 *  since it extends the Raise cast flow directly.)
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { CompanionSpawner } from "../companion/companion-spawner.mjs";
import { RaiseSpell } from "../spell-features/raise-spell.mjs";

/**
 * Target-keyed pending tracker for Grim Harvest.
 *
 * Replaces the earlier time-windowed caster-keyed tracker. Now we key by
 * the damage TARGET so:
 *   - back-to-back casts at different targets are tracked independently
 *   - entries stay valid until the target actually dies (no time pressure)
 *   - entries are overwritten when the same target is hit again — latest
 *     spell wins if the target dies
 *
 * The heal amount is NOT stored here — it's computed at kill-time from
 * the HP delta (pre-update HP − post-update HP), so we correctly cap at
 * HP actually lost (rulebook: a 6-dmg spell killing a 2-HP target heals
 * 2, not 6 — you regain HP equal to the damage *done*, not rolled).
 *
 *  Map shape: targetActorId → { casterId, spellName, targetName }
 */
const _pendingGrimHarvest = new Map();

const EXCLUDED_HEAL_TYPES = ["artificial", "undead", "construct", "object"];

export const RaisePerks = {
  init() {
    this._registerGrimHarvest();
    this._registerNecromancer();
    log("RaisePerks", "Grim Harvest + Necromancer perk adapters registered.");
  },

  /* -------------------------------------------- */
  /*  Grim Harvest                                */
  /* -------------------------------------------- */

  _registerGrimHarvest() {
    // Track spell casts against potential targets (only the fact that the
    // caster's spell touched this target — heal amount is derived later).
    Hooks.on("createChatMessage", (msg) => this._onDamageChatCard(msg));

    // Snapshot pre-update HP so _onPossibleKill can compute HP actually lost.
    // Without this, we'd have no way to know a 2-HP target took 6 damage but
    // only "lost" 2 HP — rulebook caps heal at HP actually lost.
    Hooks.on("preUpdateActor", (actor, changes, options) => {
      if (actor.type !== "npc") return;
      if (foundry.utils.getProperty(changes, "system.health.value") === undefined) return;
      options._vceGrimHarvestOldHP = actor.system?.health?.value ?? 0;
    });

    // On NPC death, consume the pending entry and heal the caster by HP lost.
    Hooks.on("updateActor", (actor, changes, options) => this._onPossibleKill(actor, changes, options));
  },

  _onDamageChatCard(msg) {
    if (!game.user.isGM) return; // GM-only to avoid multi-client double-heal
    const itemId = msg.flags?.vagabond?.itemId;
    if (!itemId) return;
    const casterId = msg.speaker?.actor;
    const caster = casterId ? game.actors.get(casterId) : null;
    if (!caster) return;
    const features = getFeatures(caster);
    if (!features?.perk_grimHarvest) return;

    // Confirm this is a spell
    const item = caster.items.get(itemId);
    if (!item || item.type !== "spell") return;

    // Only track spells that could actually deal damage (effects-only spells
    // shouldn't mark targets). Check either the rolled damage card content
    // (a data-damage-amount button) OR the spell's base damageDice value so
    // we don't rely solely on chat-card regex matching.
    const hasDamageButton = /data-damage-amount=["'](\d+)["']/.test(msg.content ?? "");
    const spellHasDamage = Number(item.system?.damageDice ?? 0) > 0
      || Number(item.system?.damage?.dice ?? 0) > 0;
    if (!hasDamageButton && !spellHasDamage) return;

    // Extract target actor IDs from the card flag (targetsAtRollTime is the
    // canonical targets list). If absent, we can't track per-target — skip.
    const targets = msg.flags?.vagabond?.targetsAtRollTime ?? [];
    if (!targets.length) return;

    for (const t of targets) {
      if (!t.actorId) continue;
      _pendingGrimHarvest.set(t.actorId, {
        casterId: caster.id,
        spellName: item.name,
        targetName: t.actorName ?? "target",
      });
    }
    log("RaisePerks/GrimHarvest",
      `Tagged ${targets.length} target(s) with ${caster.name}'s ${item.name}.`);
  },

  _onPossibleKill(actor, changes, options) {
    if (!game.user.isGM) return;
    if (actor.type !== "npc") return;

    const newHP = foundry.utils.getProperty(changes, "system.health.value");
    if (newHP === undefined || newHP > 0) return;

    // Rulebook exclusion: non-Artificial/Undead. Also skip construct/object
    // types that we also treat as ineligible for the heal.
    const beingType = (actor.system?.beingType ?? "").toLowerCase();
    if (EXCLUDED_HEAL_TYPES.some(t => beingType.includes(t))) return;

    // Rulebook "Enemy" check — only heal for kills of HOSTILE-disposition
    // tokens (not friendlies that happen to die). We check the most
    // recent placed token for this actor's disposition — if the actor
    // has any non-hostile token on scene, bail.
    let tokenDisposition = null;
    for (const scene of game.scenes) {
      const tok = scene.tokens.find(t => t.actorId === actor.id);
      if (tok) { tokenDisposition = tok.disposition; break; }
    }
    const HOSTILE = CONST.TOKEN_DISPOSITIONS.HOSTILE;
    if (tokenDisposition !== null && tokenDisposition !== HOSTILE) return;

    // Consume the pending entry for this target
    const entry = _pendingGrimHarvest.get(actor.id);
    if (!entry) return;
    _pendingGrimHarvest.delete(actor.id);

    const caster = game.actors.get(entry.casterId);
    if (!caster) return;

    // Double-check the caster still has the perk (might have been removed)
    if (!getFeatures(caster)?.perk_grimHarvest) return;

    // Rulebook: "regain HP equal to the damage of the Spell". We interpret
    // that as HP actually removed from the enemy (armor-reduced, capped at
    // pre-kill HP). Example: 2 HP / 4 Armor enemy + 6 fire dmg → lost 2 HP
    // (armor absorbed 4), so heal = 2, not 6.
    const oldHP = options?._vceGrimHarvestOldHP ?? 0;
    const hpLost = Math.max(0, oldHP - (newHP ?? 0));
    if (hpLost <= 0) {
      log("RaisePerks/GrimHarvest",
        `${actor.name} died but HP delta was 0 — no heal (old=${oldHP}, new=${newHP}).`);
      return;
    }

    this._healFromGrimHarvest(caster, actor, { ...entry, damage: hpLost }).catch(e =>
      log("RaisePerks/GrimHarvest", `Heal failed: ${e.message}`));
  },

  async _healFromGrimHarvest(caster, victim, entry) {
    const curHP = caster.system?.health?.value ?? 0;
    const maxHP = caster.system?.health?.max ?? curHP;
    const newHP = Math.min(maxHP, curHP + entry.damage);
    if (newHP <= curHP) {
      log("RaisePerks/GrimHarvest",
        `${caster.name} already at max HP (${curHP}/${maxHP}) — no heal needed.`);
      return;
    }
    await caster.update({ "system.health.value": newHP });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>Grim Harvest</strong><br>
            <strong>${caster.name}</strong> drains <strong>${entry.damage}</strong> HP
            from <strong>${victim.name}</strong>'s death <em>(${entry.spellName})</em>.
          </div>
        </section></div>
      </div>`,
    });
    log("RaisePerks/GrimHarvest",
      `${caster.name} healed ${entry.damage} (${curHP}→${newHP}) from ${victim.name}'s death.`);
  },

  /* -------------------------------------------- */
  /*  Necromancer                                 */
  /* -------------------------------------------- */

  /**
   * Necromancer fires AUTOMATICALLY at the end of each combat round.
   * For every PC with the perk who is currently focusing Raise, ALL of
   * their Raise-sourced undead (not Reanimator, not Hex-bypass) regain
   * ceil(level/2) HP.
   *
   * Rulebook: "When you Focus on Raise, you can choose an Undead you
   * control. The Target regains HP equal to half your Level."
   *
   * Interpretation: rulebook is silent on frequency and doesn't say
   * "each". Healing all is defensible given the built-in cost gate
   * (1 Mana/round for Focus upkeep) and modest heal (ceil(4/2) = 2 HP
   * at L4). The natural guards rule out abusive setups:
   *   - Hex-continuous Raise skips _isFocusingRaise (no focus state)
   *   - Reanimator undead have sourceId "perk-reanimator", excluded
   *     by the filter below
   */
  _registerNecromancer() {
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      for (const pc of game.actors) {
        if (pc.type !== "character") continue;
        const features = getFeatures(pc);
        if (!features?.perk_necromancer) continue;
        if (!RaiseSpell._isFocusingRaise(pc)) continue;

        // Only Raise-sourced undead (Reanimator perk undead are "perk-reanimator")
        const raised = CompanionSpawner.getCompanionsFor(pc)
          .filter(c => c.sourceId === "spell-raise")
          .map(c => c.actor);
        if (!raised.length) continue;

        // Heal every wounded raised undead
        let healedAny = false;
        for (const r of raised) {
          const cur = r.system?.health?.value ?? 0;
          const max = r.system?.health?.max ?? cur;
          if (max <= 0 || cur >= max) continue;
          await this._necromancerHeal(pc, r);
          healedAny = true;
        }
        if (!healedAny) continue;
      }
    });
  },

  async _necromancerHeal(caster, raised) {
    const level = Number(caster.system?.attributes?.level?.value ?? 1) || 1;
    const heal = Math.ceil(level / 2);
    const curHP = raised.system?.health?.value ?? 0;
    const maxHP = raised.system?.health?.max ?? curHP;
    const newHP = Math.min(maxHP, curHP + heal);
    if (newHP <= curHP) return;
    await raised.update({ "system.health.value": newHP });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>Necromancer</strong><br>
            <strong>${caster.name}</strong> channels Raise to heal
            <strong>${raised.name}</strong> for <strong>${heal}</strong> HP
            (${curHP} → ${newHP}).
          </div>
        </section></div>
      </div>`,
    });
    log("RaisePerks/Necromancer", `${caster.name} auto-healed ${raised.name} +${heal}`);
  },
};
