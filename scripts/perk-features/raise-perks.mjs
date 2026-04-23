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

/** Windowed tracker: spellId → { casterId, damage, timestamp } for Grim Harvest.
 *  The damage-applied chat card fires before (or simultaneously with) the
 *  updateActor hook that drops HP to 0. We cache the damage by caster+spell
 *  for a short window (5s) and consume it on a matching NPC death. */
const _recentSpellDamage = new Map();
const GRIM_HARVEST_WINDOW_MS = 5000;

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

    // Extract damage from the card. Vagabond damage cards embed
    // data-damage-amount in the HTML; fall back to card-level flag.
    const damageFromAttr = this._extractDamageFromContent(msg.content);
    const damage = damageFromAttr
      ?? msg.flags?.vagabond?.damage
      ?? null;
    if (!Number.isFinite(damage) || damage <= 0) return;

    // Record for the short window keyed by caster id
    _recentSpellDamage.set(caster.id, {
      casterId: caster.id,
      damage,
      spellName: item.name,
      timestamp: Date.now(),
    });
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

    const beingType = (actor.system?.beingType ?? "").toLowerCase();
    if (EXCLUDED_HEAL_TYPES.some(t => beingType.includes(t))) return;

    // Scan tracked casters and heal any whose window hasn't expired
    const now = Date.now();
    for (const [casterId, entry] of [..._recentSpellDamage.entries()]) {
      if (now - entry.timestamp > GRIM_HARVEST_WINDOW_MS) {
        _recentSpellDamage.delete(casterId);
        continue;
      }
      const caster = game.actors.get(casterId);
      if (!caster) { _recentSpellDamage.delete(casterId); continue; }
      // Consume the tracked damage — one heal per death, not per caster window
      _recentSpellDamage.delete(casterId);

      this._healFromGrimHarvest(caster, actor, entry).catch(e =>
        log("RaisePerks/GrimHarvest", `Heal failed: ${e.message}`));
      break; // one kill = one heal
    }
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
   * Necromancer is exposed as a button on each raised-undead companion card
   * (in the Companions tab). We inject it via a render hook on the tab so we
   * don't have to modify companion-manager-tab.mjs to know about this perk.
   */
  _registerNecromancer() {
    Hooks.on("renderApplicationV2", (app) => {
      if (app.document?.type !== "character") return;
      this._injectNecromancerButtons(app);
    });
    // Re-inject on companion state change (so buttons appear on newly-raised undead)
    Hooks.on("updateActor", () => this._rebindNecromancerSoon());
    Hooks.on("createToken", () => this._rebindNecromancerSoon());
    Hooks.on("deleteToken", () => this._rebindNecromancerSoon());
  },

  _rebindTimer: null,
  _rebindNecromancerSoon() {
    clearTimeout(this._rebindTimer);
    this._rebindTimer = setTimeout(() => {
      for (const app of foundry.applications.instances.values()) {
        if (app.document?.type === "character" && app.element?.isConnected) {
          this._injectNecromancerButtons(app);
        }
      }
    }, 150);
  },

  _injectNecromancerButtons(app) {
    const pc = app.document;
    const features = getFeatures(pc);
    if (!features?.perk_necromancer) return;

    const panel = app.element.querySelector('section[data-tab="vce-companions"]');
    if (!panel) return;

    const cards = panel.querySelectorAll('.vce-companion-card');
    for (const card of cards) {
      const actorId = card.dataset.actorId;
      const raisedActor = game.actors.get(actorId);
      if (!raisedActor) continue;
      const meta = raisedActor.getFlag(MODULE_ID, "companionMeta");
      if (meta?.sourceId !== "spell-raise") continue;
      if (card.querySelector(".vce-necromancer-btn")) continue;

      // Insert the button after the save-buttons row
      const savesRow = card.querySelector(".vce-companion-saves");
      if (!savesRow) continue;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add("vce-necromancer-btn");
      const level = Number(pc.system?.level ?? 1) || 1;
      const heal = Math.ceil(level / 2);
      btn.innerHTML = `<i class="fas fa-heart" style="margin-right:4px;"></i> Necromancer Heal (+${heal})`;
      btn.title = `Heal this Undead for ceil(Level/2) = ${heal} HP`;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await this._necromancerHeal(pc, raisedActor);
      });
      savesRow.insertAdjacentElement("afterend", btn);
    }
  },

  async _necromancerHeal(caster, raised) {
    const level = Number(caster.system?.level ?? 1) || 1;
    const heal = Math.ceil(level / 2);
    const curHP = raised.system?.health?.value ?? 0;
    const maxHP = raised.system?.health?.max ?? curHP;
    const newHP = Math.min(maxHP, curHP + heal);
    if (newHP <= curHP) {
      ui.notifications.info(`${raised.name} is already at full HP.`);
      return;
    }
    await raised.update({ "system.health.value": newHP });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>Necromancer</strong><br>
            <strong>${caster.name}</strong> channels Raise to heal
            <strong>${raised.name}</strong> for <strong>${heal}</strong> HP.
          </div>
        </section></div>
      </div>`,
    });
  },
};
