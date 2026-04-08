/**
 * Brawl Intent System
 * Adds Damage/Grapple/Shove intent selection for Brawl and Shield weapons.
 *
 * ARCHITECTURE OVERVIEW
 * ---------------------
 * When a Brawl or Shield weapon is used against a target:
 *   1. rollWeapon patch shows a DialogV2 intent chooser (Damage/Grapple/Shove)
 *   2. Grapple/Shove options are size-gated (target must be your size or smaller)
 *   3. Bully perk grants Favor on Grapple/Shove vs strictly smaller targets
 *   4. On hit, renderChatMessage injects action buttons based on intent:
 *      - Grapple: reuses system's handleGrapple + optional Bully weapon
 *      - Shove: Push 5' (token movement) or Prone (status application)
 *
 * Additional features triggered by attack results (no intent dialog):
 *   - Fisticuffs (Pugilist L1): Favor + Brawl hit → Grapple/Shove buttons
 *   - Full Swing perk: Melee hit by 10+ → Push 5' button
 *
 * Module-level state:
 *   _brawlIntent   — set by rollWeapon patch, consumed by renderChatMessage
 *   _lastAttackMeta — stashed during rollAttack for Fisticuffs/FullSwing detection
 */

import { MODULE_ID, log, hasFeature, getFeatures, combineFavor } from "../utils.mjs";

/* -------------------------------------------- */
/*  Size Helpers                                 */
/* -------------------------------------------- */

export const SIZE_ORDER = { small: 0, medium: 1, large: 2, huge: 3, giant: 4, colossal: 5 };

/**
 * Get an actor's numeric size index.
 * NPCs: system.size, Characters: system.attributes.size ?? ancestry fallback.
 */
export function getActorSize(actor) {
  if (!actor) return SIZE_ORDER.medium;
  const sizeStr = actor.type === "npc"
    ? (actor.system.size || "medium")
    : (actor.system.attributes?.size || "medium");
  return SIZE_ORDER[sizeStr] ?? SIZE_ORDER.medium;
}

/**
 * Get effective shove size, accounting for Vanguard Wall overrides.
 */
export function getEffectiveShoveSize(actor, features) {
  let size = getActorSize(actor);
  if (features?.vanguard_wallHuge) size = Math.max(size, SIZE_ORDER.huge);
  else if (features?.vanguard_wall) size = Math.max(size, SIZE_ORDER.large);
  return size;
}

/* -------------------------------------------- */
/*  Module-Level State                           */
/* -------------------------------------------- */

/**
 * Brawl intent data, set by rollWeapon patch before the attack roll.
 * { intent: "damage"|"grapple"|"shove", favorModified: boolean, targetsAtRollTime: [...] }
 */
export let _brawlIntent = null;

/** Set brawl intent (called from rollWeapon patch). */
export function setBrawlIntent(value) { _brawlIntent = value; }

/** Reset brawl intent (called from rollWeapon finally block). */
export function resetBrawlIntent() { _brawlIntent = null; }

/**
 * Last attack metadata, stashed during rollAttack for post-card injection.
 * { actorId, weaponSkillKey, favorHinder, isHit, margin, targetsAtRollTime }
 */
let _lastAttackMeta = null;

/* -------------------------------------------- */
/*  BrawlIntent Exports                          */
/* -------------------------------------------- */

export const BrawlIntent = {

  registerHooks() {
    // Inject buttons into weapon attack chat cards
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      this._injectButtons(message, el);
      this._attachClickHandlers(el);
    });

    // Bully weapon cleanup: when Grappling status removed, delete Bully weapon
    Hooks.on("deleteActiveEffect", async (effect) => {
      if (!effect.statuses?.has("grappling")) return;
      if (!game.user.isGM) return;
      this._cleanupBullyWeapon(effect);
    });

    log("BrawlIntent", "Hooks registered.");
  },

  /* -------------------------------------------- */
  /*  Intent Dialog                                */
  /* -------------------------------------------- */

  /**
   * Show the Brawl/Shield intent dialog before an attack.
   * Returns { intent, favorModified } or null if cancelled.
   */
  async showIntentDialog(actor, item, targetsAtRollTime, features) {
    const props = item.system.properties?.map(p => p.toLowerCase()) ?? [];
    const hasBrawl = props.includes("brawl");
    const hasShield = props.includes("shield");
    if (!hasBrawl && !hasShield) return { intent: "damage", favorModified: false };

    if (!targetsAtRollTime?.length) return { intent: "damage", favorModified: false };

    // Resolve first target for size check
    const targetActor = game.actors.get(targetsAtRollTime[0].actorId);
    if (!targetActor) return { intent: "damage", favorModified: false };

    const actorSize = getActorSize(actor);
    const targetSize = getActorSize(targetActor);
    const effectiveShoveSize = getEffectiveShoveSize(actor, features);

    const canGrapple = hasBrawl && targetSize <= actorSize;
    const canShove = targetSize <= effectiveShoveSize;

    // If no grapple or shove is possible, skip the dialog
    if (!canGrapple && !canShove) return { intent: "damage", favorModified: false };

    // Build buttons
    const buttons = [
      { action: "damage", label: "Damage", icon: "fas fa-dice" }
    ];
    if (canGrapple) {
      buttons.push({ action: "grapple", label: "Grapple", icon: "fas fa-hand-fist" });
    }
    if (canShove) {
      buttons.push({ action: "shove", label: "Shove", icon: "fas fa-hand-back-fist" });
    }

    const dialogTitle = hasBrawl ? "Brawl Attack" : "Shield Attack";
    const intent = await foundry.applications.api.DialogV2.wait({
      window: { title: dialogTitle },
      content: `<p>Choose your attack intent against <strong>${targetActor.name}</strong>:</p>`,
      buttons,
      close: () => null
    });

    if (!intent) return null; // cancelled

    // Apply Favor for Grapple/Shove intents:
    // - Orc Beefy: Favor on all Grapple/Shove checks
    // - Bully perk: Favor on Grapple/Shove vs strictly smaller targets
    let favorModified = false;
    if (intent !== "damage") {
      if (features?.orc_beefy) favorModified = true;
      if (features?.perk_bully && targetSize < actorSize) favorModified = true;
    }

    return { intent, favorModified };
  },

  /* -------------------------------------------- */
  /*  Pre-Roll Attack Handler                      */
  /* -------------------------------------------- */

  /**
   * Apply Bully Favor if brawl intent requires it.
   * Called from the rollAttack pre-handler chain.
   */
  onPreRollAttack(ctx) {
    if (!_brawlIntent?.favorModified) return;
    ctx.favorHinder = combineFavor(ctx.favorHinder, "favor");
    log("BrawlIntent", `Bully: applied Favor for ${_brawlIntent.intent} (${ctx.actor.name})`);
  },

  /**
   * Stash attack metadata for post-card button injection.
   * If the player chose Grapple/Shove intent and the attack hit,
   * auto-execute the intent immediately (no extra button click needed).
   * Called from the rollAttack post-handler chain.
   */
  async onPostRollAttack(ctx) {
    if (!ctx.rollResult) return;
    const result = ctx.rollResult;
    _lastAttackMeta = {
      actorId: ctx.actor.id,
      weaponSkillKey: result.weaponSkillKey,
      favorHinder: result.favorHinder,
      isHit: result.isHit,
      margin: result.roll ? result.roll.total - result.difficulty : 0,
      targetsAtRollTime: _brawlIntent?.targetsAtRollTime ?? null
    };

    // Auto-execute Grapple/Shove intent on hit
    if (_brawlIntent && result.isHit && _brawlIntent.intent !== "damage") {
      const targets = _brawlIntent.targetsAtRollTime || [];
      const targetIds = targets.map(t => t.tokenId);
      const attackerToken = ctx.actor.getActiveTokens()?.[0];

      if (_brawlIntent.intent === "grapple" && targetIds.length > 0) {
        // Call system's handleGrapple with a mock button
        const mockButton = {
          dataset: {
            actorId: ctx.actor.id,
            targets: JSON.stringify(targets)
          }
        };
        const { VagabondDamageHelper: DH } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");
        await DH.handleGrapple(mockButton);
        log("BrawlIntent", `Auto-grapple: ${ctx.actor.name} grapples ${targets.map(t => t.actorName).join(", ")}`);
      } else if (_brawlIntent.intent === "shove" && targetIds.length > 0 && attackerToken) {
        // Show Push/Prone choice dialog immediately
        const choice = await foundry.applications.api.DialogV2.wait({
          window: { title: "Shove Effect" },
          content: "<p>Choose the shove effect:</p>",
          buttons: [
            { action: "push", label: "Push 5'", icon: "fas fa-arrow-right" },
            { action: "prone", label: "Prone", icon: "fas fa-person-falling" }
          ],
          close: () => null
        });
        if (choice === "push") {
          await this._executePush(targetIds, attackerToken.id, ctx.actor.id);
        } else if (choice === "prone") {
          await this._executeProne(targetIds, ctx.actor.id);
        }
      }

      // Clear intent — already consumed
      _brawlIntent = null;
    }
  },

  /* -------------------------------------------- */
  /*  Chat Card Button Injection                   */
  /* -------------------------------------------- */

  /**
   * Inject Grapple/Shove buttons into weapon attack chat cards.
   * Handles three cases: intent-based, Fisticuffs, and Full Swing.
   */
  _injectButtons(message, el) {
    // Only process weapon attack cards
    if (!el.querySelector(".roll-result-banner")) return;

    const meta = _lastAttackMeta;
    if (!meta) return;

    // Verify this card belongs to the actor who just attacked
    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId || speakerActorId !== meta.actorId) return;

    const actor = game.actors.get(meta.actorId);
    if (!actor) return;
    const features = getFeatures(actor);

    const footer = el.querySelector(".action-buttons-container") || el.querySelector(".card-actions");
    if (!footer) return;

    const buttonsHtml = [];

    // 1. Intent-based buttons (from dialog)
    if (_brawlIntent && meta.isHit) {
      const intent = _brawlIntent.intent;
      const targetsJson = JSON.stringify(_brawlIntent.targetsAtRollTime || []).replace(/"/g, "&quot;");
      const attackerToken = actor.getActiveTokens()?.[0];
      const attackerTokenId = attackerToken?.id || "";

      if (intent === "grapple") {
        buttonsHtml.push(this._grappleButtonHtml(meta.actorId, targetsJson));
        if (features?.perk_bully) {
          buttonsHtml.push(this._bullyWeaponButtonHtml(meta.actorId, targetsJson));
        }
      } else if (intent === "shove") {
        buttonsHtml.push(this._shoveChoiceButtonHtml(meta.actorId, targetsJson, attackerTokenId));
      }
    }

    // 2. Fisticuffs: Favor + Brawl + Hit → extra Grapple/Shove buttons
    if (features?.pugilist_fisticuffs
        && meta.weaponSkillKey === "brawl"
        && meta.isHit
        && meta.favorHinder === "favor"
        && (!_brawlIntent || _brawlIntent.intent === "damage")) {
      const targets = meta.targetsAtRollTime || [];
      if (targets.length > 0) {
        const targetsJson = JSON.stringify(targets).replace(/"/g, "&quot;");
        const attackerToken = actor.getActiveTokens()?.[0];
        const attackerTokenId = attackerToken?.id || "";
        const targetActor = game.actors.get(targets[0].actorId);
        if (targetActor) {
          const actorSize = getActorSize(actor);
          const targetSize = getActorSize(targetActor);
          const effectiveShoveSize = getEffectiveShoveSize(actor, features);
          if (targetSize <= actorSize) {
            buttonsHtml.push(this._grappleButtonHtml(meta.actorId, targetsJson, "Fisticuffs: Grapple"));
          }
          if (targetSize <= effectiveShoveSize) {
            buttonsHtml.push(this._shoveChoiceButtonHtml(meta.actorId, targetsJson, attackerTokenId, "Fisticuffs: Shove"));
          }
        }
      }
    }

    // 3. Full Swing: Melee hit by 10+ → Push 5' button
    if (features?.perk_fullSwing
        && meta.weaponSkillKey === "melee"
        && meta.isHit
        && meta.margin >= 10) {
      const targets = meta.targetsAtRollTime || [];
      if (targets.length > 0) {
        const targetActor = game.actors.get(targets[0].actorId);
        if (targetActor) {
          const actorSize = getActorSize(actor);
          const targetSize = getActorSize(targetActor);
          // Full Swing: max one size larger
          if (targetSize <= actorSize + 1) {
            const targetsJson = JSON.stringify(targets).replace(/"/g, "&quot;");
            const attackerToken = actor.getActiveTokens()?.[0];
            const attackerTokenId = attackerToken?.id || "";
            buttonsHtml.push(this._pushButtonHtml(meta.actorId, targetsJson, attackerTokenId, "Full Swing: Push 5'"));
          }
        }
      }
    }

    // Inject buttons before existing footer content
    if (buttonsHtml.length > 0) {
      const wrapper = document.createElement("div");
      wrapper.classList.add("vce-brawl-actions");
      wrapper.style.cssText = "margin-bottom:0.5rem; text-align:center;";
      wrapper.innerHTML = `<div class="save-buttons-row">${buttonsHtml.join("")}</div>`;
      footer.prepend(wrapper);
    }

    // Clear stashed state (consumed)
    _lastAttackMeta = null;
    _brawlIntent = null;
  },

  /* -------------------------------------------- */
  /*  Button HTML Builders                         */
  /* -------------------------------------------- */

  _grappleButtonHtml(actorId, targetsJson, label = "Grapple") {
    return `<button class="vagabond-grapple-button vagabond-save-button"
      data-vagabond-button="true"
      data-actor-id="${actorId}"
      data-targets="${targetsJson}">
      <i class="fas fa-hand-fist"></i> ${label}
    </button>`;
  },

  _bullyWeaponButtonHtml(actorId, targetsJson) {
    return `<button class="vagabond-save-button" data-action="vce-bully-weapon"
      data-vagabond-button="true"
      data-actor-id="${actorId}"
      data-targets="${targetsJson}">
      <i class="fas fa-baseball-bat-ball"></i> Use as Greatclub (Bully)
    </button>`;
  },

  _shoveChoiceButtonHtml(actorId, targetsJson, attackerTokenId, label = "Shove") {
    return `<button class="vagabond-save-button" data-action="vce-shove-choice"
      data-vagabond-button="true"
      data-actor-id="${actorId}"
      data-targets="${targetsJson}"
      data-attacker-token-id="${attackerTokenId}">
      <i class="fas fa-hand-back-fist"></i> ${label}
    </button>`;
  },

  _pushButtonHtml(actorId, targetsJson, attackerTokenId, label = "Push 5'") {
    return `<button class="vagabond-save-button" data-action="vce-shove-push"
      data-vagabond-button="true"
      data-actor-id="${actorId}"
      data-targets="${targetsJson}"
      data-attacker-token-id="${attackerTokenId}">
      <i class="fas fa-arrow-right"></i> ${label}
    </button>`;
  },

  /* -------------------------------------------- */
  /*  Click Handlers                               */
  /* -------------------------------------------- */

  _attachClickHandlers(el) {
    // Shove choice (Push 5' or Prone sub-dialog)
    el.querySelectorAll("[data-action='vce-shove-choice']").forEach(btn => {
      btn.addEventListener("click", (ev) => this._onShoveChoice(ev));
    });

    // Direct push
    el.querySelectorAll("[data-action='vce-shove-push']").forEach(btn => {
      btn.addEventListener("click", (ev) => this._onShovePush(ev));
    });

    // Bully weapon creation
    el.querySelectorAll("[data-action='vce-bully-weapon']").forEach(btn => {
      btn.addEventListener("click", (ev) => this._onBullyWeapon(ev));
    });

    // Grapple — the system binds this in renderChatMessageHTML, but our buttons
    // are injected during renderChatMessage which may fire in a different order.
    // Bind our own handler to ensure it works regardless of hook ordering.
    el.querySelectorAll(".vagabond-grapple-button").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        btn.disabled = true;
        const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");
        VagabondDamageHelper.handleGrapple(btn);
      });
    });
  },

  /**
   * Shove choice: show sub-dialog to choose Push 5' or Prone.
   */
  async _onShoveChoice(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    btn.disabled = true;

    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: "Shove Effect" },
      content: "<p>Choose the shove effect:</p>",
      buttons: [
        { action: "push", label: "Push 5'", icon: "fas fa-arrow-right" },
        { action: "prone", label: "Prone", icon: "fas fa-person-falling" }
      ],
      close: () => null
    });

    if (!choice) {
      btn.disabled = false;
      return;
    }

    const targetIds = this._parseTargetIds(btn);
    const attackerTokenId = btn.dataset.attackerTokenId;
    const actorId = btn.dataset.actorId;

    if (choice === "push") {
      await this._executePush(targetIds, attackerTokenId, actorId);
    } else if (choice === "prone") {
      await this._executeProne(targetIds, actorId);
    }
  },

  /**
   * Direct Push 5' button (Full Swing).
   */
  async _onShovePush(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    btn.disabled = true;

    const targetIds = this._parseTargetIds(btn);
    const attackerTokenId = btn.dataset.attackerTokenId;
    const actorId = btn.dataset.actorId;
    await this._executePush(targetIds, attackerTokenId, actorId);
  },

  /**
   * Push targets 5' (1 grid square) away from attacker.
   */
  async _executePush(targetIds, attackerTokenId, actorId) {
    const attackerToken = canvas.tokens.get(attackerTokenId);
    const appliedNames = [];

    for (const tokenId of targetIds) {
      const token = canvas.tokens.get(tokenId);
      if (!token || !attackerToken) continue;

      const dx = token.document.x - attackerToken.document.x;
      const dy = token.document.y - attackerToken.document.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const gridSize = canvas.grid.size;
      const nx = Math.round(dx / dist);
      const ny = Math.round(dy / dist);
      await token.document.update({
        x: token.document.x + nx * gridSize,
        y: token.document.y + ny * gridSize
      });
      appliedNames.push(token.name);
    }

    if (appliedNames.length > 0) {
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="shove-push">
          <div class="card-body">
            <section class="content-body">
              <div class="card-description" style="text-align:center;">
                <i class="fas fa-arrow-right"></i> <strong>Shove!</strong>
                ${appliedNames.join(", ")} pushed 5'.
              </div>
            </section>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: game.actors.get(actorId) })
      });
      log("BrawlIntent", `Push: ${appliedNames.join(", ")} pushed 5'`);
    }
  },

  /**
   * Apply Prone to targets.
   */
  async _executeProne(targetIds, actorId) {
    const appliedNames = [];
    const immuneNames = [];

    for (const tokenId of targetIds) {
      const token = canvas.tokens.get(tokenId);
      if (!token?.actor) continue;

      const immunities = token.actor.system.statusImmunities ?? [];
      if (immunities.includes("prone")) {
        immuneNames.push(token.name);
      } else {
        await token.actor.toggleStatusEffect("prone", { active: true });
        appliedNames.push(token.name);
      }
    }

    let msg = "";
    if (appliedNames.length > 0) {
      msg += `<strong>Shove!</strong> ${appliedNames.join(", ")} knocked <em>Prone</em>.`;
    }
    if (immuneNames.length > 0) {
      if (msg) msg += "<br>";
      msg += `<i class="fas fa-shield-halved"></i> ${immuneNames.join(", ")} ${immuneNames.length === 1 ? "is" : "are"} <strong>immune</strong> to Prone!`;
    }

    if (msg) {
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="shove-prone">
          <div class="card-body">
            <section class="content-body">
              <div class="card-description" style="text-align:center;">${msg}</div>
            </section>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: game.actors.get(actorId) })
      });
      log("BrawlIntent", `Prone: ${appliedNames.join(", ")} knocked Prone`);
    }
  },

  /**
   * Bully perk: create "Grappled Creature" weapon on the grappler.
   */
  async _onBullyWeapon(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    btn.disabled = true;

    const actorId = btn.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return;

    const targets = JSON.parse(btn.dataset.targets?.replace(/&quot;/g, '"') || "[]");
    if (!targets.length) return;

    const targetActor = game.actors.get(targets[0].actorId);
    if (!targetActor) return;

    // Remove existing Bully weapon for this target if any
    const existing = actor.items.find(i =>
      i.getFlag(MODULE_ID, "bullyWeapon") && i.getFlag(MODULE_ID, "grappledActorId") === targetActor.id
    );
    if (existing) await existing.delete();

    // Create the "Grappled Creature" weapon
    await actor.createEmbeddedDocuments("Item", [{
      name: `${targetActor.name} (Grappled)`,
      type: "equipment",
      img: targetActor.img || "icons/skills/melee/unarmed-punch-fist.webp",
      system: {
        equipmentType: "weapon",
        weaponSkill: "brawl",
        range: "close",
        grip: "2H",
        damageOneHand: "d8",
        damageTwoHands: "d8",
        damageTypeOneHand: "physical",
        damageTypeTwoHands: "physical",
        equipmentState: "twoHands",
        equipped: true,
        properties: ["Brawl"],
        quantity: 1,
        baseSlots: 0
      },
      flags: {
        [MODULE_ID]: {
          bullyWeapon: true,
          grappledActorId: targetActor.id
        }
      }
    }]);

    ui.notifications.info(`${actor.name} can use ${targetActor.name} as a greatclub!`);
    log("BrawlIntent", `Bully: created Grappled Creature weapon for ${actor.name} (target: ${targetActor.name})`);
  },

  /**
   * Cleanup Bully weapon when Grappling status is removed.
   */
  async _cleanupBullyWeapon(effect) {
    const actor = effect.parent;
    if (!actor) return;

    const targetUuids = effect.flags?.vagabond?.grappling?.targetUuids ?? [];
    for (const uuid of targetUuids) {
      try {
        const target = await fromUuid(uuid);
        if (!target) continue;
        const bullyWeapon = actor.items.find(i =>
          i.getFlag(MODULE_ID, "bullyWeapon") && i.getFlag(MODULE_ID, "grappledActorId") === target.id
        );
        if (bullyWeapon) {
          await bullyWeapon.delete();
          log("BrawlIntent", `Bully: removed Grappled Creature weapon from ${actor.name} (target: ${target.name})`);
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | BrawlIntent | Failed to clean up Bully weapon:`, err);
      }
    }
  },

  /* -------------------------------------------- */
  /*  Utility                                      */
  /* -------------------------------------------- */

  /**
   * Parse target token IDs from a button's data-targets attribute.
   * Returns array of token IDs.
   */
  _parseTargetIds(btn) {
    try {
      const targets = JSON.parse(btn.dataset.targets?.replace(/&quot;/g, '"') || "[]");
      return targets.map(t => t.tokenId).filter(Boolean);
    } catch {
      return [];
    }
  }
};
