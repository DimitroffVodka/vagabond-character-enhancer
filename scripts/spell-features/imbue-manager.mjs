/**
 * Imbue Manager
 * Handles the Imbue spell delivery type per RAW: cast a spell onto a weapon
 * equipped by a willing Being, then any attack with that weapon CAN deliver
 * the spell ride-along if the caster spends 1 Mana on the hit. The Attack
 * Check is the Cast Check.
 *
 * MANA TIMING (RAW)
 * ─────────────────
 * Cast time: damage + effect mana ONLY (`totalCost - 1`). The 1-Mana delivery
 * cost is deferred to the on-hit moment.
 *
 * On hit: caster's pool is auto-deducted 1 Mana (silent — no prompt). If the
 * caster can't pay (0 Mana, unconscious, dead), the imbue stays on the weapon
 * but this hit does plain weapon damage with a chat note explaining why.
 *
 * On miss: nothing. Imbue persists on the weapon.
 *
 * DURATION
 * ────────
 * In combat: imbue expires at the END of the round it was cast in unless the
 * caster is focusing on the spell. Caster maintains via the system's standard
 * spell-focus mechanism (clicking the focus star on the spell card / sheet);
 * we read `actor.system.focus.spellIds`.
 *
 * Out of combat: imbue REQUIRES focus to stick — handleImbueCast aborts with
 * a notification if the caster isn't focusing. There's no round tick to
 * anchor expiry against, so focus is the only sustain.
 *
 * Manual end:
 *   - Delete the imbue AE on the wielder (player clicks the AE icon)
 *   - Caster drops focus on the spell → all imbues from that cast clear past
 *     their round-window
 *
 * COMBINED DAMAGE ROLL
 * ────────────────────
 * The rollDamage patch (in vagabond-character-enhancer.mjs) appends spell
 * dice + spell damage bonuses to the weapon formula so they roll together as
 * one damage instance (armor applied once). It gates on a per-hit sentinel
 * (`_vceImbueDeliveryAuthorized` / `_vceImbueDeliveryDenied`) set by
 * `onPostRollAttack` after the mana check — denied hits skip the append.
 * The "Imbued: [Spell] ([Type])" tag is injected onto the attack card by
 * `_annotateWeaponAttackCard` for visibility.
 */

import { MODULE_ID, log } from "../utils.mjs";
import { gmRequest } from "../socket-relay.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const FLAG_IMBUE = "imbue";
const FLAG_PENDING = "pendingImbueDamage";
const IMBUE_AE_FLAG = "imbueAE";

/* -------------------------------------------- */
/*  ImbueManager                                 */
/* -------------------------------------------- */

export const ImbueManager = {

  /**
   * Transient cache of pre-update `system.focus.spellIds` per actor, used by
   * the focus-drop detection hook pair (preUpdateActor → updateActor). Keyed
   * by actor id; entries are deleted as soon as updateActor consumes them.
   * Lives across module lifecycle since registerHooks is one-shot.
   */
  _focusSpellIdSnapshot: new Map(),

  /* -------------------------------------------- */
  /*  Hook Registration                            */
  /* -------------------------------------------- */

  registerHooks() {
    // Inject "Imbue Weapon" button into spell cards with Imbue delivery.
    // Uses createChatMessage (modifies persisted HTML — survives Foundry v13 re-renders).
    Hooks.on("createChatMessage", async (message) => {
      await this._onSpellCardCreate(message);
      // Annotate the weapon attack card with the imbue's damage type so both
      // types are visible on the single combined-damage card.
      await this._annotateWeaponAttackCard(message);
    });

    // Attach click handlers when messages render (handles re-renders + page load)
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      this._attachHandlers(el);
      // Also attach to the real DOM element (v13 uses a different element for insertion)
      setTimeout(() => {
        const domEl = document.querySelector(`[data-message-id="${message.id}"]`);
        if (domEl) this._attachHandlers(domEl);
      }, 50);
    });

    // Round-end expiry: at round change, sweep imbues whose anchor round has
    // passed. Imbue persists if the caster is focusing on the spell. Match
    // Bless's GM-online guard so a single client (GM if online, else fallback)
    // runs the cleanup — avoids dup work and write races.
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;
      await this._sweepExpiredImbues(combat);
    });

    // Manual end #1: caster drops focus on the imbue's spell. The system
    // updates `system.focus.spellIds` wholesale; we need OLD vs NEW to know
    // which IDs were dropped. By the time `updateActor` fires, both `_source`
    // and the live data already reflect the new array, so we snapshot the
    // pre-update value in `preUpdateActor` and read it back in `updateActor`.
    Hooks.on("preUpdateActor", (actor, changes) => {
      const newIds = foundry.utils.getProperty(changes, "system.focus.spellIds");
      if (!Array.isArray(newIds)) return;
      this._focusSpellIdSnapshot.set(actor.id, [...(actor.system?.focus?.spellIds ?? [])]);
    });
    Hooks.on("updateActor", async (actor, changes) => {
      const newIds = foundry.utils.getProperty(changes, "system.focus.spellIds");
      if (!Array.isArray(newIds)) return;
      const prevIds = this._focusSpellIdSnapshot.get(actor.id) ?? [];
      this._focusSpellIdSnapshot.delete(actor.id);

      // GM-only-if-online guard mirrors Bless's pattern. Apply AFTER the
      // snapshot read so we still consume the snapshot regardless of who
      // does the cleanup work.
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      const dropped = prevIds.filter(id => !newIds.includes(id));
      if (dropped.length === 0) return;
      await this._clearImbuesByCasterAndSpells(actor.id, dropped);
    });

    // Manual end #2: someone deletes the imbue AE off the wielder (clicked
    // the AE icon, or our own clearImbue ran). Sync the imbue flag so we
    // don't leave stale state — the AE icon is the player-facing "end this"
    // affordance.
    Hooks.on("deleteActiveEffect", async (effect) => {
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;
      const wielder = effect.parent;
      if (wielder?.documentName !== "Actor") return;
      if (!effect.getFlag(MODULE_ID, IMBUE_AE_FLAG)) return;
      if (wielder.getFlag(MODULE_ID, FLAG_IMBUE)) {
        await wielder.unsetFlag(MODULE_ID, FLAG_IMBUE);
        log("Imbue", `AE deleted on ${wielder.name} — imbue flag also cleared`);
      }
    });
  },

  /* -------------------------------------------- */
  /*  Duration / Cleanup                           */
  /* -------------------------------------------- */

  /**
   * Walk all actors with an imbue flag and clear those whose `expiresAtRound`
   * has passed AND whose caster is no longer focusing on the spell.
   *
   * Triggered by `updateCombat` when `round` is in the diff (Foundry fires
   * post-update, so `combat.round` is the NEW round at hook fire time). Imbue
   * cast in round N has `expiresAtRound: N` — at round N+1 the sweep finds
   * `N+1 > N` and clears it.
   *
   * @param {Combat} combat
   */
  async _sweepExpiredImbues(combat) {
    const newRound = combat.round;
    for (const actor of game.actors) {
      const imbue = actor.getFlag(MODULE_ID, FLAG_IMBUE);
      if (!imbue) continue;
      // Only round-anchored imbues expire by the round timer.
      if (imbue.expiresAtRound == null) continue;
      // Imbue cast in round N expires at end of round N (start of round N+1).
      if (newRound <= imbue.expiresAtRound) continue;

      // Caster still focusing? — imbue persists.
      const caster = game.actors.get(imbue.casterId);
      const focusedIds = caster?.system?.focus?.spellIds ?? [];
      if (caster && focusedIds.includes(imbue.spellId)) {
        log("Imbue", `${actor.name}: imbue persists past round ${newRound} (${caster.name} focusing on ${imbue.spellName})`);
        continue;
      }

      log("Imbue", `${actor.name}: imbue on ${imbue.weaponName} expired (round ${newRound} > expiresAtRound ${imbue.expiresAtRound}, caster not focusing)`);
      await this.clearImbue(actor);
    }
  },

  /**
   * Clear all imbues across all actors whose `casterId` matches AND whose
   * `spellId` is in the dropped set. Used when a caster releases focus on
   * one or more spells — any imbues those spells were sustaining lapse if
   * they're already past their round-anchor (mid-round focus drop with the
   * imbue still inside its round window keeps it alive).
   *
   * @param {string} casterId
   * @param {string[]} droppedSpellIds
   */
  async _clearImbuesByCasterAndSpells(casterId, droppedSpellIds) {
    const dropSet = new Set(droppedSpellIds);
    const currentRound = game.combat?.round ?? null;
    for (const actor of game.actors) {
      const imbue = actor.getFlag(MODULE_ID, FLAG_IMBUE);
      if (!imbue) continue;
      if (imbue.casterId !== casterId) continue;
      if (!dropSet.has(imbue.spellId)) continue;

      // If imbue is still inside its round window, the round-tick cleanup
      // was the only thing keeping it alive past expiresAtRound. Inside the
      // window, it survives a focus drop. Out-of-combat imbues have no
      // window and lapse immediately.
      if (imbue.expiresAtRound != null && currentRound != null && currentRound <= imbue.expiresAtRound) {
        log("Imbue", `${actor.name}: caster dropped focus but imbue still in round window — persists until round ${imbue.expiresAtRound}`);
        continue;
      }

      log("Imbue", `${actor.name}: caster ${casterId} dropped focus on ${imbue.spellName} — clearing imbue`);
      await this.clearImbue(actor);
    }
  },

  /* -------------------------------------------- */
  /*  Pre-Roll Hooks (called from main dispatcher) */
  /* -------------------------------------------- */

  /**
   * After any attack with the imbued weapon. RAW: imbue is a standing buff on
   * the weapon, NOT consumed by attacking. Each hit gives the caster the
   * option to spend 1 Mana to deliver the spell ride-along; misses do nothing.
   * The imbue persists until end of round (or longer if caster is focusing).
   *
   * Behavior here:
   *   HIT  + caster can pay (alive, conscious, ≥1 mana, or already-paid fallback):
   *           deduct mana from caster, set delivery-authorized sentinel,
   *           stash annotation data, force-auto-roll the combined damage.
   *   HIT  + caster cannot pay:
   *           skip annotation + spell-dice append, post chat note explaining
   *           why, weapon does normal damage. Imbue stays.
   *   MISS:  do nothing. Imbue stays. (No more "wasted" card.)
   *
   * @param {object} ctx - { item, actor, rollResult }
   */
  async onPostRollAttack(ctx) {
    if (!ctx.rollResult) return;

    // Reset per-attack delivery sentinels — otherwise a previously-denied
    // hit's flag would persist and silently block spell-dice append on the
    // next attack even after the caster recovers mana.
    delete ctx.actor._vceImbueDeliveryAuthorized;
    delete ctx.actor._vceImbueDeliveryDenied;
    delete ctx.actor._vceImbueDamageSuppressed;

    const imbue = ctx.actor.getFlag(MODULE_ID, FLAG_IMBUE);
    if (!imbue) return;
    if (ctx.item?.id !== imbue.weaponId) return;

    // Miss: imbue persists, nothing to do here (rollDamage won't run anyway).
    if (!ctx.rollResult.isHit) {
      log("Imbue", `${ctx.actor.name} missed with imbued ${imbue.weaponName} — imbue persists`);
      return;
    }

    // HIT — gate spell-dice delivery on caster's ability to pay the 1 Mana.
    const caster = game.actors.get(imbue.casterId) ?? ctx.actor;
    const pendingCost = imbue.pendingDeliveryCost ?? 1;
    const reason = this._checkDeliveryGate(caster, pendingCost);

    if (reason) {
      // Caster can't deliver — weapon does plain damage, no spell rider.
      // Clear the rollDamage gate so the imbue flag (still on actor) doesn't
      // trigger the dice-append branch.
      ctx.actor._vceImbueDeliveryDenied = true;
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <strong>${caster.name}</strong> cannot deliver <em>${imbue.spellName}</em>
              through ${ctx.actor.id === caster.id ? "their" : `${ctx.actor.name}'s`} <strong>${imbue.weaponName}</strong>
              — <em>${reason}</em>
              <br><span style="font-size:0.8em; opacity:0.6;">(Weapon damage only — imbue stays on the weapon.)</span>
            </div>
          </section></div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: caster })
      });
      log("Imbue", `${caster.name}: delivery skipped (${reason}) — imbue persists on ${imbue.weaponName}`);
      return;
    }

    // Caster CAN pay — charge them and authorize the spell-dice append.
    if (pendingCost > 0) {
      await this._consumeDeliveryMana(caster, pendingCost);
    }

    // Authorize rollDamage to append spell dice. Used by the rollDamage patch
    // in vagabond-character-enhancer.mjs to know this hit's damage should
    // include the imbue's spell payload.
    ctx.actor._vceImbueDeliveryAuthorized = true;

    // Damage portion only fires in the cast round (Vagabond core rule). Past
    // that — caster is focus-sustaining the imbue — only the Effect carries
    // through. Track it on the pending state so the annotation hook and the
    // rollDamage patch agree on what's being delivered.
    const damageDelivered = this.isInCastRound(imbue) && imbue.damageDice > 0;
    if (!damageDelivered) {
      ctx.actor._vceImbueDamageSuppressed = true;
    }

    // Capture the spell's causedStatuses NOW (live read off the spell item).
    // We'll thread this through the pending flag → message flag → apply-time
    // patch so the imbue's effect is applied when the GM clicks Apply on the
    // weapon attack card. Without this, an effect-only spell like Charm
    // wouldn't apply ANYTHING on hit — the system reads the WEAPON's
    // causedStatuses (always empty) at apply time, never the spell's.
    const spell = caster.items.get(imbue.spellId);
    const spellCausedStatuses = spell?.system?.causedStatuses ?? [];
    const spellCritCausedStatuses = spell?.system?.critCausedStatuses ?? [];

    // Stash annotation data so createChatMessage can tag the attack card.
    const dieSize = imbue.dieSize || 6;
    await ctx.actor.setFlag(MODULE_ID, FLAG_PENDING, {
      weaponId: imbue.weaponId,
      spellName: imbue.spellName,
      spellImg: imbue.spellImg,
      damageType: imbue.damageType,
      damageDice: imbue.damageDice,
      dieSize,
      damageDelivered,  // false when sustained past cast round → annotation says "Effect only"
      // Spell effect payload — read by handleApplyDirect patch at apply time
      // to apply the imbue's status effect alongside weapon damage.
      causedStatuses: spellCausedStatuses,
      critCausedStatuses: spellCritCausedStatuses
    });

    // NOTE: We deliberately do NOT set `_vceForceRollDamage = true` here. The
    // earlier implementation force-auto-rolled the damage so the imbue dice
    // appeared without a manual click — but auto-roll bypasses the system's
    // `rollDamageFromButton` path, which is where vagabond-crawler's relic
    // patch (relic-effects.mjs) injects bonus damage like Strike I (+1d4).
    // Auto-rolling silently dropped relic dice. Instead, the annotate hook
    // injects our spell dice into the Roll Damage button's
    // `data-damage-formula`; when the player clicks Roll Damage, both our
    // imbue dice AND the crawler's relic dice ride into the same roll.
    log("Imbue", `${ctx.actor.name} hit with imbued ${imbue.weaponName} — ${caster.name} pays ${pendingCost} Mana to deliver${damageDelivered ? "" : " (effect only — sustained past cast round)"}`);
  },

  /**
   * Is this hit happening in the same combat round as the cast? Per Vagabond
   * core rules ("Focus sustains the spell's Effect; damage is Instant"), the
   * damage portion of an imbued spell only fires in the cast round. After
   * that — if the caster is focusing to keep the imbue alive — only the
   * Effect carries forward, regardless of whether damage was ever delivered
   * (e.g., caster missed every attack in the cast round).
   *
   * Out-of-combat imbues exist purely via focus and have `expiresAtRound:
   * null` — they're never "in cast round" and only deliver the Effect.
   *
   * @param {object} imbue - The imbue state flag
   * @returns {boolean} true if this is the cast round and damage should fire
   */
  isInCastRound(imbue) {
    if (!imbue || imbue.expiresAtRound == null) return false;
    const activeCombat = game.combats.contents.find(c => c.started);
    if (!activeCombat) return false;
    return activeCombat.round <= imbue.expiresAtRound;
  },

  /**
   * Check whether the caster can pay the deferred delivery cost. Returns
   * null if delivery should proceed, or a short human-readable reason string
   * if it should be blocked.
   * @param {Actor} caster
   * @param {number} pendingCost
   * @returns {string|null}
   */
  _checkDeliveryGate(caster, pendingCost) {
    if (!caster) return "caster missing";
    // Caster down: any of HP 0, unconscious, incapacitated → no delivery
    if ((caster.system?.health?.value ?? 1) <= 0) return "caster is down";
    if (caster.statuses?.has?.("unconscious")) return "caster is Unconscious";
    if (caster.statuses?.has?.("incapacitated")) return "caster is Incapacitated";
    // Mana check (skip if pendingCost is 0 — fallback path, system already paid)
    if (pendingCost > 0 && (caster.system?.mana?.current ?? 0) < pendingCost) {
      return "caster is out of Mana";
    }
    return null;
  },

  /**
   * Deduct delivery mana from the caster's pool. Direct update if the wielder's
   * client owns the caster, otherwise GM-routed via socket relay.
   * @param {Actor} caster
   * @param {number} amount
   */
  async _consumeDeliveryMana(caster, amount) {
    if (caster.isOwner) {
      const cur = caster.system?.mana?.current ?? 0;
      await caster.update({ "system.mana.current": Math.max(0, cur - amount) });
      return;
    }
    await gmRequest("consumeImbueMana", { casterId: caster.id, amount });
  },

  /* -------------------------------------------- */
  /*  Weapon Attack Card — Imbue Annotation        */
  /* -------------------------------------------- */

  /**
   * When the system posts the weapon attack card for an imbued weapon that has
   * pending imbue annotation data, inject an "Imbued: [Spell] ([Type])" tag
   * into the card so both damage types are visible at a glance. The damage
   * itself is a single combined roll (armor applied once).
   */
  async _annotateWeaponAttackCard(message) {
    const actorId = message.flags?.vagabond?.actorId;
    const itemId = message.flags?.vagabond?.itemId;
    if (!actorId || !itemId) return;

    const actor = game.actors.get(actorId);
    if (!actor) return;

    const pending = actor.getFlag(MODULE_ID, FLAG_PENDING);
    if (!pending) return;
    if (pending.weaponId !== itemId) return;

    // Only the client that created the weapon attack card should handle this
    // (prevents double-updates from multiple observers).
    if (message.user?.id !== game.user.id) return;

    // Per-attack annotation flag is consumed; the imbue itself PERSISTS until
    // end of round (or focus-drop). RAW: imbue is a standing buff on the
    // weapon, not a single-shot.
    await actor.unsetFlag(MODULE_ID, FLAG_PENDING);
    // Clear the per-attack delivery sentinels too — they're rebuilt on the
    // next attack by onPostRollAttack.
    delete actor._vceImbueDeliveryAuthorized;
    delete actor._vceImbueDeliveryDenied;
    delete actor._vceImbueDamageSuppressed;

    const damageType = (pending.damageType || "-").toLowerCase();
    const typeLabel = damageType !== "-"
      ? damageType.charAt(0).toUpperCase() + damageType.slice(1)
      : "Untyped";
    const damageIcon = CONFIG.VAGABOND?.damageTypeIcons?.[damageType] || "fas fa-burst";
    const iconHtml = damageType !== "-" ? `<i class="${damageIcon}"></i> ` : "";

    // When damage was suppressed (sustained imbue past cast round), the tag
    // shows "Effect" instead of dice — the wielder gets the spell's Effect
    // applied to the target but no extra damage from the spell.
    const damageDelivered = pending.damageDelivered ?? true; // default true for legacy/non-sustained
    const bodyText = damageDelivered
      ? (pending.damageDice > 0 ? `${pending.damageDice}d${pending.dieSize || 6} ${typeLabel}` : typeLabel)
      : `Effect (${typeLabel})`;
    const titleText = damageDelivered
      ? `Imbued with ${pending.spellName}`
      : `Imbued with ${pending.spellName} (effect only — sustained past cast round)`;

    const tagHtml = `<span class="tag tag-imbue" style="background:rgba(80,40,120,0.25); border:1px solid rgba(150,100,200,0.6); padding:2px 6px; border-radius:3px; display:inline-flex; align-items:center; gap:4px;" title="${titleText}"><i class="fas fa-hand-sparkles"></i> ${iconHtml}${bodyText}</span>`;

    let content = message.content || "";
    // Inject the tag into the first card-tags row if present, otherwise prepend
    // a small strip at the top of the card body.
    if (content.includes('class="card-tags"') || content.includes("card-tags")) {
      content = content.replace(
        /(<div[^>]*class="[^"]*card-tags[^"]*"[^>]*>)/,
        `$1${tagHtml}`
      );
    } else if (content.includes("content-body")) {
      content = content.replace(
        /(<section[^>]*class="[^"]*content-body[^"]*"[^>]*>)/,
        `$1<div class="imbue-annotation" style="padding:4px 8px;">${tagHtml}</div>`
      );
    } else {
      content = `<div class="imbue-annotation" style="padding:4px 8px; text-align:center;">${tagHtml}</div>` + content;
    }

    // Inject imbue spell dice into the Roll Damage button's data-damage-formula.
    // This routes the click-path through `rollDamageFromButton`, which is
    // where vagabond-crawler's relic patch injects its own dice. By appending
    // here (not via item.rollDamage / auto-roll), both VCE's imbue dice AND
    // crawler's relic dice land in the same roll. Skip injection when the
    // damage portion is suppressed (sustained past cast round) or the spell
    // has no damage (effect-only spells like Charm, damageDice: 0).
    if (damageDelivered && (pending.damageDice ?? 0) > 0) {
      const dieSize = pending.dieSize || 6;
      const addition = `${pending.damageDice}d${dieSize}`;
      // Caster-side spell damage bonuses (mirror the rollDamage patch's
      // formula assembly so the click path matches the auto-roll path).
      let extra = "";
      const spellFlat = actor.system?.universalSpellDamageBonus || 0;
      let spellDice = actor.system?.universalSpellDamageDice || "";
      if (Array.isArray(spellDice)) spellDice = spellDice.filter(d => !!d).join(" + ");
      if (spellFlat !== 0) extra += ` + ${spellFlat}`;
      if (typeof spellDice === "string" && spellDice.trim() !== "") extra += ` + ${spellDice}`;
      const fullAddition = `${addition}${extra}`;

      let injected = false;
      content = content.replace(/data-damage-formula="([^"]+)"/, (_m, original) => {
        injected = true;
        return `data-damage-formula="${original} + ${fullAddition}"`;
      });
      if (injected) {
        log("Imbue", `${actor.name}: appended "${fullAddition}" to Roll Damage button (lets vagabond-crawler relic patch compose on click)`);
      }
    }

    // Embed the imbue's spell effect payload onto the chat message itself.
    // The handleApplyDirect patch (in vagabond-character-enhancer.mjs) reads
    // this flag at apply time to run StatusHelper.processCausedStatuses with
    // the spell's causedStatuses on the target — without this, the system
    // would only read the WEAPON's causedStatuses (always empty for a normal
    // weapon) and effect-only imbues like Charm would silently apply nothing.
    const imbueStatusContext = {
      spellName: pending.spellName,
      causedStatuses: pending.causedStatuses ?? [],
      critCausedStatuses: pending.critCausedStatuses ?? [],
      damageDelivered
    };

    await message.update({
      content,
      [`flags.${MODULE_ID}.imbueStatusContext`]: imbueStatusContext
    });
    log("Imbue", `${actor.name}: annotated ${pending.spellName} (${typeLabel}) on attack card${imbueStatusContext.causedStatuses.length ? ` — ${imbueStatusContext.causedStatuses.length} status entry/entries embedded for apply-time` : ""}`);
  },

  /* -------------------------------------------- */
  /*  Spell Card — Imbue Weapon Button             */
  /* -------------------------------------------- */

  /**
   * On spell cast with Imbue delivery, inject "Imbue Weapon" button into message content.
   */
  async _onSpellCardCreate(message) {
    const content = message.content ?? "";
    if (!content.includes('data-delivery-type="imbue"')) return;
    if (content.includes('data-action="vce-imbue-weapon"')) return;

    const actorId = message.flags?.vagabond?.actorId;
    const spellId = message.flags?.vagabond?.itemId;
    if (!actorId || !spellId) return;

    const actor = game.actors.get(actorId);
    if (!actor || !actor.isOwner) return;

    const spell = actor.items.get(spellId);
    if (!spell) return;

    // Parse damage dice from content (e.g., "2d6" in a tag-damage span)
    const diceMatch = content.match(/(\d+)d(\d+)/);
    const damageDice = diceMatch ? parseInt(diceMatch[1]) : 0;
    const dieSize = diceMatch ? parseInt(diceMatch[2]) : 6;

    const imbueData = JSON.stringify({
      spellId: spell.id,
      spellName: spell.name,
      spellImg: spell.img,
      damageType: spell.system.damageType || "-",
      damageDice,
      dieSize,
      hasEffect: true,
      effectDesc: spell.system.description || ""
    }).replace(/"/g, "&quot;");

    const btnHtml = `<div class="vce-imbue-actions" style="margin-top:0.5rem; text-align:center;">
      <div class="save-buttons-row">
        <button class="vagabond-save-button" data-vagabond-button="true"
          data-action="vce-imbue-weapon"
          data-actor-id="${actorId}"
          data-imbue-data="${imbueData}">
          <i class="fas fa-hand-sparkles"></i> Imbue Weapon
        </button>
      </div>
    </div>`;

    let newContent = content;
    if (content.includes("action-buttons-container")) {
      newContent = content.replace(
        /(<div class="action-buttons-container">)/,
        `$1${btnHtml}`
      );
    } else {
      newContent = content + btnHtml;
    }

    await message.update({ content: newContent });
    log("Imbue", `Injected Imbue Weapon button on spell card for ${actor.name}`);
  },

  /* -------------------------------------------- */
  /*  Click Handlers                               */
  /* -------------------------------------------- */

  _attachHandlers(el) {
    el.querySelectorAll('[data-action="vce-imbue-weapon"]').forEach(btn => {
      if (btn._vceHandled) return;
      btn._vceHandled = true;
      btn.addEventListener("click", (ev) => this._onImbueWeaponClick(ev));
    });
  },

  async _onImbueWeaponClick(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const actorId = btn.dataset.actorId;
    const imbueData = JSON.parse(btn.dataset.imbueData.replace(/&quot;/g, '"'));

    const caster = game.actors.get(actorId);
    if (!caster) return;

    // Fallback path: the spell card was posted without our upfront intercept
    // (system path or external trigger). The system already deducted the FULL
    // mana cost, so we must NOT charge another 1 on hit — set pendingDeliveryCost
    // to 0 to flag the imbue as "delivery already paid."
    const activeCombat = game.combats.contents.find(c => c.started);
    const fallbackData = {
      ...imbueData,
      pendingDeliveryCost: 0,
      castInCombat: !!activeCombat,
      expiresAtRound: activeCombat?.round ?? null
    };

    // deliveryIncrease isn't available — default to 1 wielder.
    const wielders = await this._resolveWielders(caster, 1);
    for (const wielder of wielders) {
      await this.showWeaponDialog(wielder, fallbackData, { caster });
    }
  },

  /* -------------------------------------------- */
  /*  Weapon Selection Dialog                      */
  /* -------------------------------------------- */

  /**
   * Show a dialog to select which weapon to imbue.
   * @param {Actor} actor - The wielder whose weapon will be imbued
   * @param {object} spellData - Spell details for the imbue
   * @param {object} [opts]
   * @param {Actor} [opts.caster] - The spell's caster (defaults to wielder for self-imbue)
   */
  async showWeaponDialog(actor, spellData, opts = {}) {
    const weapons = actor.items.filter(i => {
      const isWeapon = i.type === "weapon"
        || (i.type === "equipment" && i.system.equipmentType === "weapon");
      return isWeapon && i.system.equipped;
    });

    if (weapons.length === 0) {
      ui.notifications.warn(`${actor.name} has no equipped weapons to imbue.`);
      return;
    }

    if (weapons.length === 1) {
      await this.applyImbue(actor, weapons[0].id, spellData, opts);
      return;
    }

    const content = `
      <p>Choose a weapon to imbue with <strong>${spellData.spellName}</strong>:</p>
      <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
        ${weapons.map(w => `
          <button type="button" class="vce-imbue-weapon-btn" data-weapon-id="${w.id}"
            style="display:flex; align-items:center; gap:8px; padding:6px 10px;">
            <img src="${w.img}" width="24" height="24" style="border:none;">
            <span>${w.name}</span>
            <span style="opacity:0.6; font-size:0.85em;">(${w.system.currentDamage || "—"})</span>
          </button>
        `).join("")}
      </div>
    `;

    return new Promise((resolve) => {
      const d = new Dialog({
        title: `${actor.name} — Imbue Weapon`,
        content,
        buttons: {
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
        },
        default: "cancel",
        render: (html) => {
          html.find(".vce-imbue-weapon-btn").on("click", async (ev) => {
            const weaponId = ev.currentTarget.dataset.weaponId;
            await this.applyImbue(actor, weaponId, spellData, opts);
            d.close();
            resolve(weaponId);
          });
        },
        close: () => resolve(null)
      }, { width: 360 });
      d.render(true);
    });
  },

  /* -------------------------------------------- */
  /*  Apply / Clear Imbue                          */
  /* -------------------------------------------- */

  /**
   * Store imbue state on the wielder and create a display AE on them. If the
   * current user doesn't own the wielder's actor (ally imbue), route the writes
   * through the GM via socket relay.
   * @param {Actor} actor - The wielder
   * @param {string} weaponId - Weapon on the wielder to imbue
   * @param {object} spellData - Spell details
   * @param {object} [opts]
   * @param {Actor} [opts.caster] - Spell's caster; defaults to wielder if omitted
   */
  async applyImbue(actor, weaponId, spellData, opts = {}) {
    const weapon = actor.items.get(weaponId);
    if (!weapon) return;

    const caster = opts.caster ?? actor;

    // Clear any existing imbue first (including stale pending-damage state from a prior attack)
    await this.clearImbue(actor);

    const imbueState = {
      weaponId,
      weaponName: weapon.name,
      spellId: spellData.spellId,
      spellName: spellData.spellName,
      spellImg: spellData.spellImg,
      damageType: spellData.damageType,
      damageDice: spellData.damageDice,
      dieSize: spellData.dieSize || 6,
      hasEffect: spellData.hasEffect,
      effectDesc: spellData.effectDesc,
      casterId: caster.id,
      // Deferred-delivery metadata (RAW: 1 Mana paid on hit, not at cast time)
      pendingDeliveryCost: spellData.pendingDeliveryCost ?? 1,
      // Duration: expires at end of `expiresAtRound` unless caster is focusing
      // on `spellId`. Out-of-combat casts have no round to anchor to and rely
      // entirely on focus — handleImbueCast already gated those.
      castInCombat: spellData.castInCombat ?? !!game.combats.contents.find(c => c.started),
      expiresAtRound: spellData.expiresAtRound ?? (game.combats.contents.find(c => c.started)?.round ?? null)
    };

    const typeLabel = spellData.damageType !== "-"
      ? ` (${spellData.damageType.charAt(0).toUpperCase() + spellData.damageType.slice(1)})`
      : "";
    const aeName = `Imbued: ${spellData.spellName}${typeLabel}`;
    const aeData = {
      name: aeName,
      img: spellData.spellImg || "icons/magic/light/explosion-star-glow-yellow.webp",
      origin: `${MODULE_ID}.imbue`,
      changes: [],
      disabled: false,
      transfer: true,
      statuses: ["imbued"],
      flags: {
        [MODULE_ID]: {
          // No `managed: true` — that flag opts the AE into
          // FeatureDetector._syncManagedEffects which would silently
          // delete it on every PC scan (no matching effectKey in the
          // class/perk registry). Lookups use IMBUE_AE_FLAG.
          [IMBUE_AE_FLAG]: true
        }
      }
    };

    if (actor.isOwner) {
      if (actor.getFlag(MODULE_ID, FLAG_PENDING)) {
        await actor.unsetFlag(MODULE_ID, FLAG_PENDING);
      }
      await actor.setFlag(MODULE_ID, FLAG_IMBUE, imbueState);
      await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);
    } else {
      await gmRequest("applyImbue", {
        wielderId: actor.id,
        imbueState,
        aeData
      });
    }

    // Chat notification — credit the caster, surface the deferred-mana rule
    // so the table knows the imbue costs 1 more on hit (unless this is the
    // fallback path where the system already paid).
    const dieSize = spellData.dieSize || 6;
    const damageText = spellData.damageDice > 0
      ? ` (+${spellData.damageDice}d${dieSize} ${spellData.damageType})`
      : "";
    const wielderText = caster.id === actor.id
      ? `<strong>${weapon.name}</strong>`
      : `<strong>${actor.name}</strong>'s <strong>${weapon.name}</strong>`;
    const deliveryNote = (imbueState.pendingDeliveryCost ?? 0) > 0
      ? `<br><span style="font-size:0.85em; opacity:0.7;">Delivery: 1 Mana from caster on hit. Expires end of round unless Focused.</span>`
      : `<br><span style="font-size:0.85em; opacity:0.7;">Expires end of round unless Focused.</span>`;
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>${caster.name}</strong> imbues ${wielderText} with
            <em>${spellData.spellName}</em>${damageText}${deliveryNote}
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: caster })
    });

    log("Imbue", `${caster.name} imbued ${actor.name}'s ${weapon.name} with ${spellData.spellName}`);
  },

  /**
   * Remove active imbue state and display AE from an actor. Routes through the
   * GM via socket relay if the current user doesn't own the actor.
   */
  async clearImbue(actor) {
    if (actor.isOwner) {
      const existing = actor.getFlag(MODULE_ID, FLAG_IMBUE);
      if (existing) {
        await actor.unsetFlag(MODULE_ID, FLAG_IMBUE);
      }
      const imbueAE = actor.effects.find(e => e.getFlag(MODULE_ID, IMBUE_AE_FLAG));
      if (imbueAE) {
        // Wrap in try/catch — focus-drop cascade and round-end sweep can race
        // with explicit clearImbue (e.g., test setup that sets focus=[] then
        // calls clearImbue — both try to delete the same AE). Idempotent
        // semantics: if the AE is already gone, treat as success.
        try {
          await actor.deleteEmbeddedDocuments("ActiveEffect", [imbueAE.id]);
        } catch (e) {
          if (!`${e.message}`.includes("does not exist")) throw e;
          log("Imbue", `clearImbue on ${actor.name}: AE already removed (race) — ignoring`);
        }
      }
      return;
    }

    // Not owned — only bother the GM if there's actually something to clear
    const hasFlag = !!actor.getFlag(MODULE_ID, FLAG_IMBUE);
    const hasAE = actor.effects.some(e => e.getFlag(MODULE_ID, IMBUE_AE_FLAG));
    if (!hasFlag && !hasAE) return;

    await gmRequest("clearImbue", { wielderId: actor.id });
  },

  /**
   * Get the current imbue state for an actor.
   */
  getImbueState(actor) {
    return actor?.getFlag(MODULE_ID, FLAG_IMBUE) ?? null;
  },

  /**
   * Handle a spell cast with Imbue delivery — bypass d20/damage rolls, deduct mana,
   * and show weapon selection. Used by both the SpellHandler patch and Vagabond Crawler.
   * @param {Actor} actor
   * @param {Item} spell
   * @param {object} state - Spell state { damageDice, deliveryType, ... }
   * @param {object} costs - Cost breakdown { totalCost }
   * @returns {Promise<boolean>} True if Imbue was handled, false if not Imbue delivery.
   */
  async handleImbueCast(actor, spell, state, costs) {
    if (state.deliveryType !== "imbue") return false;

    // RAW: "Imbue: ... if you spend 1 Mana to do so when the attack hits."
    // The 1-Mana delivery cost is DEFERRED to the on-hit moment, not paid
    // at cast time. Only damage + effect mana are spent upfront.
    const totalCost = costs.totalCost ?? 0;
    const PENDING_DELIVERY = 1;
    const castTimeCost = Math.max(0, totalCost - PENDING_DELIVERY);

    // Validate caster has the upfront cost. castTimeCost can be 0 for an
    // effect-only or delivery-only spell — that's fine, no upfront mana then.
    if (castTimeCost > (actor.system?.mana?.current ?? 0)) {
      ui.notifications.error(`Not enough mana! Cast-time cost ${castTimeCost} (delivery's 1 Mana is paid on hit), have ${actor.system.mana.current}.`);
      return true; // Handled (blocked)
    }
    if (totalCost > (actor.system?.mana?.castingMax ?? 0)) {
      // Casting max still gates the full cost — players can't configure a
      // spell beyond their max even if part is deferred.
      ui.notifications.error(`Cost exceeds casting max! Max: ${actor.system.mana.castingMax}, Cost: ${totalCost}.`);
      return true;
    }

    // Out-of-combat: Imbue requires the caster to be focusing on the spell at
    // cast time, since there's no round-tick to expire it. (In-combat cast
    // without focus is fine — it expires at end of round.)
    //
    // Note: `game.combat` can return a stale reference to a deleted combat
    // (Foundry caches the viewer's tracked encounter). Iterate the live
    // collection so the check is always correct.
    const activeCombat = game.combats.contents.find(c => c.started);
    const inCombat = !!activeCombat;
    if (!inCombat) {
      const focusedIds = actor.system?.focus?.spellIds || [];
      if (!focusedIds.includes(spell.id)) {
        ui.notifications.warn(`${spell.name}: Imbue requires Focus when cast outside of combat.`);
        return true; // Handled (blocked)
      }
    }

    // Deduct cast-time portion only. Delivery's 1 Mana is charged on hit by
    // ImbueManager.onPostRollAttack (or skipped silently if caster is at 0
    // mana / unconscious at hit time).
    if (castTimeCost > 0) {
      await actor.update({ "system.mana.current": Math.max(0, actor.system.mana.current - castTimeCost) });
    }

    // Resolve wielders — up to (1 + deliveryIncrease) friendly targets, or caster if none
    const targetCount = 1 + (state.deliveryIncrease || 0);
    const wielders = await this._resolveWielders(actor, targetCount);
    if (!wielders || wielders.length === 0) return true;

    // Show weapon selection dialog for each wielder. Pass duration metadata
    // through so applyImbue can stamp the imbue state with expiry info.
    //
    // Effect-only spells (damageType "-", e.g. Charm, Blink, Mirage) have NO
    // damage dice to deliver — the spell only applies an Effect on hit.
    // Force damageDice:0 here so the rollDamage patch's append branch doesn't
    // fire and tack on a phantom d6 of "Untyped" damage.
    const dieSize = spell.system.damageDieSize || actor.system.spellDamageDieSize || 6;
    const spellHasDamage = spell.system.damageType && spell.system.damageType !== "-";
    const spellData = {
      spellId: spell.id,
      spellName: spell.name,
      spellImg: spell.img,
      damageType: spell.system.damageType || "-",
      damageDice: spellHasDamage ? (state.damageDice ?? 1) : 0,
      dieSize,
      hasEffect: true,
      effectDesc: spell.system.description || "",
      pendingDeliveryCost: PENDING_DELIVERY,
      castInCombat: inCombat,
      expiresAtRound: inCombat ? (activeCombat.round ?? null) : null
    };

    for (const wielder of wielders) {
      await this.showWeaponDialog(wielder, spellData, { caster: actor });
    }

    return true; // Handled
  },

  /* -------------------------------------------- */
  /*  Wielder Resolution                           */
  /* -------------------------------------------- */

  /**
   * Determine which actors' weapons should be imbued. Rules:
   *   - If no friendly targets selected → [caster]
   *   - If friendlies <= targetCount → all of them
   *   - If friendlies > targetCount → show picker dialog to choose exactly N
   * @param {Actor} caster
   * @param {number} targetCount - How many wielders the mana cost paid for
   * @returns {Promise<Actor[]>}
   */
  async _resolveWielders(caster, targetCount) {
    const targets = Array.from(game.user.targets || []);
    const friendlyActors = targets
      .filter(t => {
        const disp = t.document?.disposition;
        return disp === CONST.TOKEN_DISPOSITIONS.FRIENDLY
          || disp === CONST.TOKEN_DISPOSITIONS.SECRET
          || t.actor?.id === caster.id;
      })
      .map(t => t.actor)
      .filter(Boolean);

    if (friendlyActors.length === 0) return [caster];

    // Dedupe by actor id (multiple tokens of same actor)
    const unique = [...new Map(friendlyActors.map(a => [a.id, a])).values()];

    if (unique.length <= targetCount) return unique;

    // More friendly targets than paid for — let the user pick N
    return this._showWielderPickerDialog(unique, targetCount);
  },

  /**
   * Dialog to pick exactly N wielders from a list of friendly targets.
   * @param {Actor[]} candidates
   * @param {number} pickCount
   * @returns {Promise<Actor[]>} Selected actors, or empty array on cancel
   */
  async _showWielderPickerDialog(candidates, pickCount) {
    const content = `
      <p>Choose <strong>${pickCount}</strong> ${pickCount === 1 ? "ally" : "allies"} to imbue:</p>
      <div class="vce-imbue-picker" style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
        ${candidates.map(a => `
          <label style="display:flex; align-items:center; gap:8px; padding:4px 8px; cursor:pointer;">
            <input type="checkbox" class="vce-wielder-pick" data-actor-id="${a.id}">
            <img src="${a.img}" width="28" height="28" style="border:none;">
            <span>${a.name}</span>
          </label>
        `).join("")}
      </div>
      <p class="vce-imbue-pick-status" style="margin-top:6px; opacity:0.7; font-size:0.85em;">
        Selected: 0 / ${pickCount}
      </p>
    `;

    return new Promise((resolve) => {
      const d = new Dialog({
        title: `Imbue — Choose ${pickCount} Target${pickCount > 1 ? "s" : ""}`,
        content,
        buttons: {
          confirm: {
            icon: '<i class="fas fa-check"></i>',
            label: "Confirm",
            callback: (html) => {
              const checked = [...html[0].querySelectorAll(".vce-wielder-pick:checked")];
              const picked = checked.map(c => candidates.find(a => a.id === c.dataset.actorId))
                .filter(Boolean);
              resolve(picked);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve([])
          }
        },
        default: "confirm",
        render: (html) => {
          const el = html instanceof jQuery ? html[0] : html;
          const statusEl = el.querySelector(".vce-imbue-pick-status");
          const boxes = [...el.querySelectorAll(".vce-wielder-pick")];
          const update = () => {
            const n = boxes.filter(b => b.checked).length;
            statusEl.textContent = `Selected: ${n} / ${pickCount}`;
            // Cap at pickCount by disabling unchecked boxes once reached
            boxes.forEach(b => {
              if (!b.checked) b.disabled = n >= pickCount;
            });
          };
          boxes.forEach(b => b.addEventListener("change", update));
        },
        close: () => resolve([])
      }, { width: 360 });
      d.render(true);
    });
  }
};
