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
 *   - the heal amount is tied to the specific kill, not the most-recent spell
 *   - entries stay valid until the target actually dies (no time pressure)
 *   - entries are overwritten when the same target is hit again — latest
 *     spell damage wins if the target dies
 *
 *  Map shape: targetActorId → { casterId, damage, spellName, targetName }
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
    // Track spell damage as it's posted to chat
    Hooks.on("createChatMessage", (msg) => this._onDamageChatCard(msg));

    // On NPC death, consume the tracked damage and heal the caster
    Hooks.on("updateActor", (actor, changes) => this._onPossibleKill(actor, changes));
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

    // Extract damage amount from the card content
    const damage = this._extractDamageFromContent(msg.content) ?? msg.flags?.vagabond?.damage;
    if (!Number.isFinite(damage) || damage <= 0) return;

    // Extract target actor IDs from the card flag (targetsAtRollTime is the
    // canonical targets list — damage-helper populates it when the damage
    // card is posted). If absent, we can't track per-target — skip.
    const targets = msg.flags?.vagabond?.targetsAtRollTime ?? [];
    if (!targets.length) return;

    for (const t of targets) {
      if (!t.actorId) continue;
      _pendingGrimHarvest.set(t.actorId, {
        casterId: caster.id,
        damage,
        spellName: item.name,
        targetName: t.actorName ?? "target",
      });
    }
  },

  _extractDamageFromContent(content) {
    if (typeof content !== "string") return null;
    // Match `data-damage-amount="N"` or `data-damage="N"`
    const m = content.match(/data-damage(?:-amount)?=["'](\d+)["']/);
    if (m) return parseInt(m[1]);
    // Fallback: first big number in a strong tag in the damage section
    const m2 = content.match(/<strong[^>]*>\s*(\d+)\s*<\/strong>/);
    if (m2) return parseInt(m2[1]);
    return null;
  },

  _onPossibleKill(actor, changes) {
    if (!game.user.isGM) return;
    if (actor.type !== "npc") return;

    const newHP = changes.system?.health?.value ?? changes["system.health.value"];
    if (newHP === undefined || newHP > 0) return;

    // Rulebook exclusion: non-Artificial/Undead. Also skip construct/object
    // types that we also treat as ineligible for the heal.
    const beingType = (actor.system?.beingType ?? "").toLowerCase();
    if (EXCLUDED_HEAL_TYPES.some(t => beingType.includes(t))) return;

    // Rulebook "Enemy" check — only heal for kills of HOSTILE-disposition
    // tokens (not friendlies that happen to die). We check the most
    // recent placed token for this actor's disposition — if the actor
    // has any non-hostile token on scene, bail.
    //
    // For unlinked tokens, the token document carries the disposition.
    // For the actor being killed we look at whatever scene token is
    // tied to it (usually just one).
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

    this._healFromGrimHarvest(caster, actor, entry).catch(e =>
      log("RaisePerks/GrimHarvest", `Heal failed: ${e.message}`));
  },

  async _healFromGrimHarvest(caster, victim, entry) {
    const curHP = caster.system?.health?.value ?? 0;
    const maxHP = caster.system?.health?.max ?? curHP;
    const newHP = Math.min(maxHP, curHP + entry.damage);
    if (newHP <= curHP) return;
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
    log("RaisePerks/GrimHarvest", `${caster.name} healed ${entry.damage} from ${victim.name}'s death.`);
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
