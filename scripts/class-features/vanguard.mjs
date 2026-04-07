/**
 * Vanguard Class Features
 * Registry entries + runtime hooks for all Vanguard features.
 */

import { MODULE_ID, log, hasFeature, getFeatures, combineFavor } from "../utils.mjs";
import { measureDistance } from "../range-validator.mjs";
import { _saveSourceActorId } from "../vagabond-character-enhancer.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const RANGE_CLOSE = 5;

/* -------------------------------------------- */
/*  Feature Registry                            */
/* -------------------------------------------- */

export const VANGUARD_REGISTRY = {
  // L1: Stalwart — Protector Perk + extended Hold duration
  // STATUS: partial — Protector perk automated, Hold extension is flavor
  "stalwart": {
    class: "vanguard", level: 1, flag: "vanguard_stalwart", status: "partial",
    description: "Gain Protector Perk. Hold Action can be used as late as end of next Turn."
  },

  // L1: Guard — Free Shove when enemy becomes Close or on Block
  // STATUS: module — reminder card on Block pass or enemy movement into Close range
  "guard": {
    class: "vanguard", level: 1, flag: "vanguard_guard", status: "module",
    description: "Once per Round, free Shove attempt when a Target becomes Close or you Block their Attack."
  },

  // L2: Rampant Charge — Push shoved targets during Move
  // STATUS: flavor — movement-based combo, no automation needed
  "rampant charge": {
    class: "vanguard", level: 2, flag: "vanguard_rampantCharge", status: "flavor",
    description: "Push Shoved Targets ahead of you while Moving. Prone on stop or collision (deals weapon damage)."
  },

  // L4: Wall (Large) — Considered Large for Shoves
  // STATUS: module — Managed AE
  "wall (large)": {
    class: "vanguard", level: 4, flag: "vanguard_wall", status: "module",
    description: "Considered Large for Shoves.",
    effects: [{
      label: "Wall (Large)",
      icon: "icons/equipment/shield/heater-crystal-blue.webp",
      changes: []  // Shove size override handled by brawl-intent.mjs via feature flag
    }]
  },

  // L6: Unstoppable — Chain shoves during Rampant Charge
  // STATUS: flavor — extends Rampant Charge, no automation
  "unstoppable": {
    class: "vanguard", level: 6, flag: "vanguard_unstoppable", status: "flavor",
    description: "Rampant Charge can chain: push additional Beings you collide with."
  },

  // L8: Wall (Huge) — Considered Huge for Shoves
  // STATUS: partial — same as Wall
  "wall (huge)": {
    class: "vanguard", level: 8, flag: "vanguard_wallHuge", status: "module",
    description: "Considered Huge for Shoves.",
    effects: [{
      label: "Wall (Huge)",
      icon: "icons/equipment/shield/heater-crystal-blue.webp",
      changes: []  // Shove size override handled by brawl-intent.mjs via feature flag
    }]
  },

  // L10: Indestructible — Immune to attack damage with Armor ≥ 1
  // STATUS: module — calculateFinalDamage returns 0 if actor has armor and isn't incapacitated
  "indestructible": {
    class: "vanguard", level: 10, flag: "vanguard_indestructible", status: "module",
    description: "While not Incapacitated and Armor ≥ 1, Immune to attack damage."
  }
};

/* -------------------------------------------- */
/*  Vanguard Runtime Hooks                      */
/* -------------------------------------------- */

export const VanguardFeatures = {

  registerHooks() {
    this._registerProtectorHooks();
    this._registerGuardHooks();
    log("Vanguard","Hooks registered.");
  },

  /* ------------------------------------------ */
  /*  Guard                                     */
  /* ------------------------------------------ */

  /**
   * Guard: "Once per Round, you can try to Shove a Close Target (no Action)
   * when they become Close to you, or if you successfully Block their Attack."
   *
   * Two triggers post a prompt card with a "Guard: Shove" button:
   * 1. Vanguard passes an Endure (Block) save
   * 2. Enemy token moves to within Close range of a Vanguard
   *
   * Player chooses whether to use Guard by clicking the button.
   * On click: validates weapon/size, rolls Brawl check, offers Push/Prone on pass.
   * Once-per-round tracked via actor flag; cleared on combat round/turn change.
   */
  _registerGuardHooks() {
    // Trigger 1: Successful Block (Endure save PASS)
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      this._checkGuardBlock(message);
    });

    // Trigger 2: Enemy token enters Close range of a Vanguard
    // preUpdateToken captures old position before the move
    Hooks.on("preUpdateToken", (tokenDoc, changes) => {
      if (!game.user.isGM) return;
      if (!("x" in changes || "y" in changes)) return;
      // Stash old position for the updateToken hook
      tokenDoc._vceOldX = tokenDoc.x;
      tokenDoc._vceOldY = tokenDoc.y;
    });
    Hooks.on("updateToken", (tokenDoc, changes) => {
      if (!game.user.isGM) return;
      if (!("x" in changes || "y" in changes)) return;
      // Pass the new position from changes since tokenDoc may not be updated yet
      const newX = changes.x ?? tokenDoc.x;
      const newY = changes.y ?? tokenDoc.y;
      this._checkGuardMovement(tokenDoc, newX, newY);
    });

    // Attach click handlers to Guard Shove buttons
    Hooks.on("renderChatMessage", (message, html) => {
      const el = html instanceof jQuery ? html[0] : html;
      const btns = el.querySelectorAll("[data-action='vce-guard-shove']");
      if (!btns.length) return;

      // If already resolved, keep button disabled
      const resolved = message.getFlag(MODULE_ID, "guardResolved");
      if (resolved) {
        btns.forEach(b => { b.disabled = true; b.style.opacity = "0.5"; });
        return;
      }

      btns.forEach(btn => {
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          const guardActor = game.actors.get(btn.dataset.actorId);
          if (!game.user.isGM && !guardActor?.isOwner) return;
          await this._onGuardShove(message, btn);
        });
      });
    });

    // Clear guard-used flag on round/turn change
    Hooks.on("updateCombat", (combat, changes) => {
      if (!game.user.isGM) return;
      if (!("turn" in changes) && !("round" in changes)) return;
      this._clearGuardFlags();
    });
  },

  /**
   * Trigger 1: Vanguard passes an Endure (Block) save → offer Guard shove.
   */
  async _checkGuardBlock(message) {
    const content = message.content || "";
    if (!content.includes("save-roll") || !content.includes("PASS")) return;

    // Must be an Endure save (Block)
    const titleMatch = content.match(/header-title[^>]*>([^<]+)/);
    const title = titleMatch?.[1]?.trim()?.toLowerCase();
    if (!title?.includes("endure")) return;

    const actorId = message.speaker?.actor;
    if (!actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor || actor.type !== "character") return;
    if (!hasFeature(actor, "vanguard_guard")) return;
    if (actor.getFlag(MODULE_ID, "guardUsedThisRound")) return;

    // Find the attacker from the preceding damage card
    const attackerId = _saveSourceActorId || this._findAttackerFromRecentDamageCard(message);
    if (!attackerId) return;

    const vanguardToken = canvas.tokens?.placeables?.find(t => t.actor?.id === actorId);
    const attackerToken = canvas.tokens?.placeables?.find(t => t.actor?.id === attackerId);
    if (!vanguardToken || !attackerToken) return;
    if (measureDistance(vanguardToken, attackerToken) > RANGE_CLOSE) return;

    await this._postGuardPrompt(actor, vanguardToken, attackerToken, "Blocked an attack");
  },

  /**
   * Trigger 2: Enemy token enters Close range of a Vanguard.
   * Only triggers when the enemy was >5ft away BEFORE the move and is now <=5ft.
   * @param {TokenDocument} tokenDoc - the token that moved
   * @param {number} newX - the new x position from changes
   * @param {number} newY - the new y position from changes
   */
  async _checkGuardMovement(tokenDoc, newX, newY) {
    const movingActor = tokenDoc.actor;
    if (!movingActor || movingActor.type === "character") return;

    const enemyToken = canvas.tokens?.get(tokenDoc.id);
    if (!enemyToken) return;

    // Need old position to check if enemy was previously farther away
    const oldX = tokenDoc._vceOldX;
    const oldY = tokenDoc._vceOldY;
    if (oldX == null || oldY == null) return;

    // Build mock token objects for measureDistance (includes size for large tokens)
    const enemyW = tokenDoc.width ?? 1;
    const enemyH = tokenDoc.height ?? 1;
    const newMock = { x: newX, y: newY, width: enemyW, height: enemyH };
    const oldMock = { x: oldX, y: oldY, width: enemyW, height: enemyH };

    for (const token of (canvas.tokens?.placeables || [])) {
      if (!token.actor || token.actor.type !== "character") continue;
      if (!hasFeature(token.actor, "vanguard_guard")) continue;
      if (token.actor.getFlag(MODULE_ID, "guardUsedThisRound")) continue;

      // New distance (after move) — size-aware
      const newDist = measureDistance(token, newMock);
      if (newDist > RANGE_CLOSE) continue;

      // Old distance (before move) — size-aware
      const oldDist = measureDistance(token, oldMock);

      // Only trigger if the enemy ENTERED Close range (was farther before)
      if (oldDist <= RANGE_CLOSE) continue;

      await this._postGuardPrompt(token.actor, token, enemyToken, `${tokenDoc.name} moved Close`);
    }
  },

  /**
   * Post a Guard prompt card with a "Shove" button.
   * Does NOT mark guard as used — that happens when the player clicks the button.
   */
  async _postGuardPrompt(actor, vanguardToken, enemyToken, trigger) {
    // Quick-check: must have Brawl or Shield weapon equipped
    const equippedItems = actor.items.filter(i => i.system?.equipped);
    const hasShoveWeapon = equippedItems.some(i => {
      const props = i.system?.properties?.map(p => p.toLowerCase()) ?? [];
      return props.includes("brawl") || props.includes("shield");
    });
    if (!hasShoveWeapon) {
      log("Vanguard", `Guard: ${actor.name} has no Brawl/Shield weapon equipped — skipping.`);
      return;
    }

    const cardContent = `
      <div class="vagabond-chat-card-v2" data-card-type="guard-prompt">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/equipment/shield/heater-crystal-blue.webp" alt="Guard">
            </div>
            <div class="header-info">
              <h3 class="header-title">Guard — ${actor.name}</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-hand-rock"></i><span>Free Shove</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-bolt"></i><span>${trigger}</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              <strong>${actor.name}</strong> can attempt a free Shove against <strong>${enemyToken.name}</strong>!<br>
              <em>(Once per Round — no Action required)</em>
            </div>
            <div style="text-align:center; margin-top:6px;">
              <button class="vagabond-save-button" data-action="vce-guard-shove"
                data-actor-id="${actor.id}"
                data-vanguard-token-id="${vanguardToken.id}"
                data-enemy-token-id="${enemyToken.id}"
                data-enemy-actor-id="${enemyToken.actor?.id}">
                <i class="fas fa-hand-back-fist"></i> Guard: Shove ${enemyToken.name}
              </button>
            </div>
          </section>
        </div>
      </div>`;

    await ChatMessage.create({
      content: cardContent,
      speaker: ChatMessage.getSpeaker({ actor }),
      flags: { [MODULE_ID]: { guardCard: true } }
    });

    log("Vanguard", `Guard: ${actor.name} — prompt to shove ${enemyToken.name} (${trigger})`);
  },

  /**
   * Handle clicking the Guard Shove button.
   * Validates size, rolls Brawl check, posts result with Push/Prone on pass.
   */
  async _onGuardShove(message, btn) {
    const actor = game.actors.get(btn.dataset.actorId);
    if (!actor) return;

    // Mark guard as used and resolve the prompt
    await actor.setFlag(MODULE_ID, "guardUsedThisRound", true);
    await message.setFlag(MODULE_ID, "guardResolved", true);

    const vanguardToken = canvas.tokens?.get(btn.dataset.vanguardTokenId);
    const enemyToken = canvas.tokens?.get(btn.dataset.enemyTokenId);
    const targetActor = game.actors.get(btn.dataset.enemyActorId);
    if (!vanguardToken || !enemyToken || !targetActor) return;

    // --- Size check ---
    const SIZE_ORDER = { small: 0, medium: 1, large: 2, huge: 3, giant: 4, colossal: 5 };
    const features = getFeatures(actor);
    const targetSizeStr = targetActor.type === "npc"
      ? (targetActor.system?.size || "medium")
      : (targetActor.system?.attributes?.size || "medium");
    const targetSize = SIZE_ORDER[targetSizeStr] ?? SIZE_ORDER.medium;

    let effectiveSize = SIZE_ORDER[actor.system?.attributes?.size || "medium"] ?? SIZE_ORDER.medium;
    if (features?.vanguard_wallHuge) effectiveSize = Math.max(effectiveSize, SIZE_ORDER.huge);
    else if (features?.vanguard_wall) effectiveSize = Math.max(effectiveSize, SIZE_ORDER.large);

    if (targetSize > effectiveSize) {
      await ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="guard-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <strong>${actor.name}</strong> can't shove <strong>${enemyToken.name}</strong> — target is too large!
            </div>
          </section></div></div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
      return;
    }

    // --- Determine Favor/Hinder ---
    // Orc Beefy: Favor on Grapple/Shove checks
    // Bully: Favor on Grapple/Shove vs smaller targets
    const actorSize = SIZE_ORDER[actor.system?.attributes?.size || "medium"] ?? SIZE_ORDER.medium;
    let favorState = "none";
    if (features?.orc_beefy) favorState = combineFavor(favorState, "favor");
    if (features?.perk_bully && targetSize < actorSize) favorState = combineFavor(favorState, "favor");

    // --- Roll Brawl check ---
    const brawlDifficulty = actor.system?.skills?.brawl?.difficulty ?? 10;
    const formula = favorState === "favor" ? "1d20 + 1d6"
      : favorState === "hinder" ? "1d20 - 1d6"
      : "1d20";
    const roll = new Roll(formula);
    await roll.evaluate();
    const total = roll.total;
    const passed = total >= brawlDifficulty;
    const isCrit = roll.dice[0].total === 20;  // Crit on natural 20 only

    let favorTag = "";
    if (favorState === "favor") favorTag = ` <span style="color:#2d9e2d;">(Favored)</span>`;
    else if (favorState === "hinder") favorTag = ` <span style="color:#c92020;">(Hindered)</span>`;

    let resultText;
    let shoveButtons = "";

    if (isCrit) {
      resultText = `<strong style="color:#2d9e2d;">CRITICAL!</strong> ${actor.name} shoves ${enemyToken.name}!`;
    } else if (passed) {
      resultText = `<strong style="color:#2d9e2d;">PASS</strong> — ${actor.name} shoves ${enemyToken.name}!`;
    } else {
      resultText = `<strong style="color:#c92020;">FAIL</strong> — ${actor.name} failed to shove ${enemyToken.name}.`;
    }

    if (passed) {
      const targetsJson = JSON.stringify([{
        tokenId: enemyToken.id,
        actorId: targetActor.id,
        actorName: enemyToken.name
      }]).replace(/"/g, "&quot;");

      shoveButtons = `
        <div style="display:flex; gap:4px; justify-content:center; margin-top:6px;">
          <button class="vagabond-save-button" data-action="vce-shove-choice"
            data-vagabond-button="true"
            data-actor-id="${actor.id}"
            data-targets="${targetsJson}"
            data-attacker-token-id="${vanguardToken.id}">
            <i class="fas fa-hand-back-fist"></i> Push 5' or Prone
          </button>
        </div>`;
    }

    await ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="guard-result">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/equipment/shield/heater-crystal-blue.webp" alt="Guard">
            </div>
            <div class="header-info">
              <h3 class="header-title">Guard — ${actor.name}</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-hand-rock"></i><span>Brawl Check${favorTag}</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-dice-d20"></i><span>${total} vs ${brawlDifficulty}</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${resultText}
            </div>
            ${shoveButtons}
          </section>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
      rolls: [roll]
    });

    log("Vanguard", `Guard: ${actor.name} rolled ${total} vs ${brawlDifficulty} — ${passed ? "PASS" : "FAIL"} vs ${enemyToken.name}`);
  },

  /**
   * Clear the guard-used flag on all Vanguards at turn/round change.
   */
  async _clearGuardFlags() {
    for (const actor of game.actors) {
      if (actor.type !== "character") continue;
      if (!actor.getFlag(MODULE_ID, "guardUsedThisRound")) continue;
      await actor.unsetFlag(MODULE_ID, "guardUsedThisRound");
    }
  },

  /* ------------------------------------------ */
  /*  Protector Perk                            */
  /* ------------------------------------------ */

  /**
   * Protector: "Block on behalf of an Ally that fails their Save
   * against the attack of an Enemy that is Close to you."
   *
   * Fully automatic — no button needed. When an ally fails a save:
   * 1. Find eligible Protectors Close to the attacker
   * 2. Auto-roll Endure save for each Protector
   * 3. If pass → heal ally for highest damage die, post result card
   */
  _registerProtectorHooks() {
    Hooks.on("createChatMessage", (message) => {
      if (!game.user.isGM) return;
      this._checkProtector(message);
    });
  },

  /**
   * Detect ally failed save, find eligible Protectors, auto-roll Block,
   * and apply retroactive heal if successful.
   */
  async _checkProtector(message) {
    const content = message.content || "";

    // Must be a save-roll card with FAIL outcome
    if (!content.includes("save-roll") || !content.includes("FAIL")) return;

    // Get the ally who failed the save
    const allyActorId = message.speaker?.actor;
    if (!allyActorId) return;
    const allyActor = game.actors.get(allyActorId);
    if (!allyActor || allyActor.type !== "character") return;

    // Get the attacker who provoked the save.
    // _saveSourceActorId may already be cleared (async timing), so fall back to
    // parsing the attacker from the preceding damage card in chat.
    const attackerId = _saveSourceActorId || this._findAttackerFromRecentDamageCard(message);
    if (!attackerId) return;

    // Find attacker token(s) on the canvas
    const attackerTokens = canvas.tokens?.placeables?.filter(
      t => t.actor?.id === attackerId
    ) || [];
    if (attackerTokens.length === 0) return;

    // Extract the highest damage die from the recent damage roll for this attacker
    const highestDie = this._findHighestDamageDie(attackerId);

    // Find all character tokens with Protector perk (excluding the failing ally)
    const protectors = [];
    for (const token of (canvas.tokens?.placeables || [])) {
      if (!token.actor || token.actor.type !== "character") continue;
      if (token.actor.id === allyActorId) continue;
      if (!hasFeature(token.actor, "perk_protector")) continue;

      // Check if any attacker token is Close to this Protector
      for (const atkToken of attackerTokens) {
        const dist = measureDistance(token, atkToken);
        if (dist <= RANGE_CLOSE) {
          protectors.push({ token, actor: token.actor });
          break;
        }
      }
    }

    if (protectors.length === 0) return;

    // Auto-roll Protector Block for each eligible Protector
    for (const p of protectors) {
      await this._rollProtectorBlock(p.actor, allyActor, highestDie);
    }
  },

  /**
   * Auto-roll an Endure save for the Protector. If passed, heal the ally
   * for the highest damage die and post the result to chat.
   */
  async _rollProtectorBlock(protector, ally, highestDie) {
    // Read the system's pre-computed Endure difficulty
    const difficulty = protector.system?.saves?.endure?.difficulty ?? 10;
    const roll = new Roll("1d20");
    await roll.evaluate();
    const total = roll.total;
    const passed = total >= difficulty;
    const isCrit = total === 20;

    // Build result text
    let resultText;
    if (isCrit) {
      resultText = `<strong style="color:#2d9e2d;">CRITICAL BLOCK!</strong> ${protector.name} blocks for ${ally.name}!`;
    } else if (passed) {
      resultText = `<strong style="color:#2d9e2d;">PASS</strong> — ${protector.name} blocks for ${ally.name}!`;
    } else {
      resultText = `<strong style="color:#c92020;">FAIL</strong> — ${protector.name} failed to block for ${ally.name}.`;
    }

    let healText = "";
    if (passed && highestDie > 0) {
      const currentHp = ally.system?.health?.value ?? 0;
      const maxHp = ally.system?.health?.max ?? currentHp;
      const newHp = Math.min(currentHp + highestDie, maxHp);
      const actualHeal = newHp - currentHp;

      if (actualHeal > 0) {
        await ally.update({ "system.health.value": newHp });
        healText = `<br>${ally.name} recovers <strong>${actualHeal} HP</strong> (highest die: ${highestDie}).`;
      } else {
        healText = `<br>${ally.name} is already at full HP.`;
      }
    } else if (passed && highestDie === 0) {
      healText = `<br><em>Could not determine highest damage die — GM should adjust HP manually.</em>`;
    }

    const resultCard = `
      <div class="vagabond-chat-card-v2" data-card-type="protector-result">
        <div class="card-body">
          <header class="card-header">
            <div class="header-icon">
              <img src="icons/equipment/shield/heater-crystal-blue.webp" alt="Protector">
            </div>
            <div class="header-info">
              <h3 class="header-title">Protector — ${protector.name}</h3>
              <div class="metadata-tags-row">
                <div class="meta-tag tag-skill"><i class="fas fa-shield-alt"></i><span>Endure</span></div>
                <span class="tag-separator">//</span>
                <div class="meta-tag tag-standard"><i class="fas fa-dice-d20"></i><span>${total} vs ${difficulty}</span></div>
              </div>
            </div>
          </header>
          <section class="content-body">
            <div class="card-description" style="text-align:center;">
              ${resultText}${healText}
            </div>
          </section>
        </div>
      </div>`;

    await ChatMessage.create({
      content: resultCard,
      speaker: ChatMessage.getSpeaker({ actor: protector }),
      rolls: [roll]
    });

    log("Vanguard", `Protector: ${protector.name} rolled ${total} vs ${difficulty} — ${passed ? "PASS" : "FAIL"}${passed ? ` (heal ${highestDie})` : ""}`);
  },

  /**
   * Search recent chat messages for the damage roll from a specific attacker
   * and extract the highest individual die value.
   * Looks for damage cards that contain roll-terms data or Roll objects.
   */
  _findHighestDamageDie(attackerId) {
    const recent = game.messages.contents.slice(-10);
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i];
      const content = msg.content || "";

      // Skip save-roll cards (those are save results, not damage)
      if (content.includes("save-roll")) continue;

      // Try to match this message to the attacker via data-actor-id in the HTML
      if (attackerId && !content.includes(attackerId)) continue;

      // Extract dice from Roll objects on the message
      const rolls = msg.rolls;
      if (!rolls?.length) continue;

      const allDice = [];
      for (const roll of rolls) {
        for (const term of (roll.terms || [])) {
          if (term.faces && term.results) {
            for (const r of term.results) {
              if (r.result != null) allDice.push(r.result);
            }
          }
        }
      }

      if (allDice.length > 0) {
        allDice.sort((a, b) => b - a);
        return allDice[0];
      }
    }
    return 0;
  },

  /**
   * Look backwards through recent chat messages to find the damage card that
   * preceded a save-roll message. The damage card has data-actor-id on its
   * save/damage buttons which identifies the attacker.
   */
  _findAttackerFromRecentDamageCard(saveMessage) {
    const msgs = game.messages.contents;
    const saveIdx = msgs.indexOf(saveMessage);
    if (saveIdx < 0) return null;

    // Search backwards from the save message for a damage card with save buttons
    for (let i = saveIdx - 1; i >= Math.max(0, saveIdx - 5); i--) {
      const content = msgs[i].content || "";
      if (!content.includes("vagabond-save-buttons-container")) continue;
      const match = content.match(/data-actor-id="([^"]+)"/);
      if (match) return match[1];
    }
    return null;
  }
};
