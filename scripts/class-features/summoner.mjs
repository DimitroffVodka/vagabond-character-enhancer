/**
 * Summoner Class Features
 * Handles the Summoner's conjuration mechanics: summon selection, token placement,
 * focus/mana tracking, banishment, and Soulbonder armor/immunity copy.
 *
 * FLOW
 * ────
 * 1. Player triggers conjure → NPC selection dialog (filtered by HD/beingType)
 * 2. Select creature → mana spent (= HD), token placed, focus acquired
 * 3. Each summoner turn in combat → 1 mana drained (focus cost)
 * 4. Banishment: 0 HP, new summon, focus dropped, or out of mana
 * 5. Soulbonder (L2): summoner gains summon's armor + immunities while conjured
 */

import { MODULE_ID, log, getFeatures } from "../utils.mjs";
import { FocusManager } from "../focus/focus-manager.mjs";
import { gmRequest } from "../socket-relay.mjs";

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const FLAG_CONJURE = "activeConjure";
const SOULBONDER_FLAG = "soulbonderAE";
const FOCUS_KEY = "summoner_conjure";

const SIZE_MAP = {
  tiny: 0.5, small: 1, medium: 1, large: 2,
  huge: 3, giant: 4, gargantuan: 4, colossal: 5
};


/* -------------------------------------------- */
/*  Registry                                     */
/* -------------------------------------------- */

export const SUMMONER_REGISTRY = {
  "arcanum": {
    class: "summoner",
    level: 1,
    flag: "summoner_arcanum",
    status: "flavor",
    description: "Cast Spells using Mysticism. Learn 4 Spells, +1 every 2 Summoner Levels. Max Mana = 4 × Level."
  },
  "creature codex": {
    class: "summoner",
    level: 1,
    flag: "summoner_creatureCodex",
    status: "module",
    description: "Gain Conjurer Perk. Can replace Spells with Summons. Summon HD ≤ Summoner Level."
  },
  "soulbonder": {
    class: "summoner",
    level: 2,
    flag: "summoner_soulbonder",
    status: "module",
    description: "Gain the Armor and Immunities of your Summons while they are conjured."
  },
  "second nature": {
    class: "summoner",
    level: 4,
    flag: "summoner_secondNature",
    status: "module",
    description: "Rather than Focus on a Summon, you can choose for it to remain for Cd4 Rounds."
  },
  "avatar emergence": {
    class: "summoner",
    level: 6,
    flag: "summoner_avatarEmergence",
    status: "module",
    description: "Once per Shift, you can conjure a Summon without Mana to conjure it."
  },
  "guardian force": {
    class: "summoner",
    level: 8,
    flag: "summoner_guardianForce",
    status: "module",
    description: "If you drop to 0 HP with a Summon conjured, it remains for Cd4 Rounds. If not banished before the die shrinks, you are revived at 1 HP and gain 1 Fatigue."
  },
  "ultimate weapon": {
    class: "summoner",
    level: 10,
    flag: "summoner_ultimateWeapon",
    status: "module",
    description: "You can conjure Summons with HD as high as (your Summoner Level + 5)."
  }
};

/* -------------------------------------------- */
/*  SummonerFeatures                             */
/* -------------------------------------------- */

export const SummonerFeatures = {

  /* -------------------------------------------- */
  /*  Hook Registration                            */
  /* -------------------------------------------- */

  /** Cached candidates for synchronous sheet rendering */
  _candidateCache: null,
  _candidateCacheMaxHD: 0,

  registerHooks() {
    // Inject Summon tab on character sheet renders
    Hooks.on("renderApplicationV2", (app) => {
      if (app.document?.type === "character") {
        this._injectSummonTab(app);
      }
    });

    // Combat round: drain mana / tick Second Nature countdown / Guardian Force countdown
    Hooks.on("updateCombat", async (combat, changes) => {
      if (!("round" in changes)) return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== "character") continue;

        const conjure = actor.getFlag(MODULE_ID, FLAG_CONJURE);
        if (!conjure) continue;

        // Second Nature countdown (no focus mode)
        if (conjure.secondNatureCountdown) {
          const die = conjure.secondNatureCountdown;
          const roll = new Roll(`1d${die}`);
          await roll.evaluate();
          const rolled = roll.total;
          ChatMessage.create({
            content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
              <div class="card-body"><section class="content-body">
                <div class="card-description" style="text-align:center;">
                  <strong>${actor.name}</strong> — Second Nature: Cd${die} → rolled ${rolled}
                  ${rolled === 1 ? (die === 4 ? " — <strong>Summon expires!</strong>" : ` — shrinks to Cd${die - 2}`) : " — persists"}
                </div>
              </section></div>
            </div>`,
            speaker: ChatMessage.getSpeaker({ actor })
          });
          if (rolled === 1) {
            if (die <= 4) {
              await this.banishSummon(actor, "Second Nature expired");
            } else {
              await actor.setFlag(MODULE_ID, FLAG_CONJURE + ".secondNatureCountdown", die - 2);
            }
          }
          continue; // No mana drain for Second Nature
        }

        // Guardian Force countdown (summoner at 0 HP)
        if (conjure.guardianForceCountdown) {
          const die = conjure.guardianForceCountdown;
          const roll = new Roll(`1d${die}`);
          await roll.evaluate();
          const rolled = roll.total;
          ChatMessage.create({
            content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
              <div class="card-body"><section class="content-body">
                <div class="card-description" style="text-align:center;">
                  <strong>${actor.name}</strong> — Guardian Force: Cd${die} → rolled ${rolled}
                  ${rolled === 1 ? (die === 4 ? " — <strong>Revived at 1 HP!</strong>" : ` — shrinks to Cd${die - 2}`) : " — summon persists"}
                </div>
              </section></div>
            </div>`,
            speaker: ChatMessage.getSpeaker({ actor })
          });
          if (rolled === 1) {
            if (die <= 4) {
              // Guardian Force resolves: revive summoner at 1 HP + 1 Fatigue
              await actor.update({
                "system.health.value": 1,
                "system.fatigue": Math.min(5, (actor.system.fatigue ?? 0) + 1)
              });
              ChatMessage.create({
                content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
                  <div class="card-body"><section class="content-body">
                    <div class="card-description" style="text-align:center;">
                      <strong>${actor.name}</strong> is revived by <strong>Guardian Force</strong>!
                      (1 HP, +1 Fatigue)
                    </div>
                  </section></div>
                </div>`,
                speaker: ChatMessage.getSpeaker({ actor })
              });
              await this.banishSummon(actor, "Guardian Force resolved");
            } else {
              await actor.setFlag(MODULE_ID, FLAG_CONJURE + ".guardianForceCountdown", die - 2);
            }
          }
          continue; // No mana drain during Guardian Force
        }

        // Normal focus mode: drain 1 mana per round
        const featureFocus = actor.getFlag(MODULE_ID, "featureFocus") || [];
        const hasFocus = featureFocus.some(f => f.key === FOCUS_KEY);
        if (!hasFocus) continue;
        await this._drainMana(actor);
      }
    });

    // Watch summon actor HP for 0 HP banishment.
    //
    // Deferred banish: the Vagabond system's own updateActor hook calls
    // actor.toggleStatusEffect('dead', { active: true }) in parallel with
    // this one. For an unlinked-token summon, that ActiveEffect create needs
    // to resolve its parent UUID (Scene.X.Token.Y.ActorDelta...) — but if we
    // delete the token first, Foundry throws
    //   "undefined id [tokenId] does not exist in the EmbeddedCollection"
    // during parent resolution. Queuing the banish behind a setTimeout lets
    // the system's async toggleStatusEffect finish before we wipe the token.
    Hooks.on("updateActor", async (actor, changes) => {
      if (actor.type !== "npc") return;
      if (!game.user.isGM) return;

      const newHP = changes.system?.health?.value ?? changes["system.health.value"];
      if (newHP === undefined || newHP > 0) return;

      for (const char of game.actors.filter(a => a.type === "character")) {
        const conjure = char.getFlag(MODULE_ID, FLAG_CONJURE);
        if (conjure?.summonActorId === actor.id) {
          // 250ms is comfortably more than a local ActiveEffect create round-trip
          // and still fast enough to feel immediate at the table.
          setTimeout(() => this.banishSummon(char, "Defeated (0 HP)"), 250);
          break;
        }
      }
    });

    // Watch summoner HP for Guardian Force (L8) — 0 HP triggers countdown
    Hooks.on("preUpdateActor", (actor, changes, options) => {
      if (actor.type !== "character") return;
      const newHP = changes.system?.health?.value ?? changes["system.health.value"];
      if (newHP !== undefined) {
        options._vceOldHP = actor.system.health?.value ?? 0;
      }
    });
    Hooks.on("updateActor", async (actor, changes, options) => {
      if (actor.type !== "character") return;
      if (!game.user.isGM && game.users.find(u => u.isGM && u.active)) return;

      const newHP = changes.system?.health?.value ?? changes["system.health.value"];
      if (newHP === undefined || newHP > 0) return;
      const oldHP = options._vceOldHP;
      if (oldHP === undefined || oldHP <= 0) return; // Already at 0

      const conjure = actor.getFlag(MODULE_ID, FLAG_CONJURE);
      if (!conjure) return;
      const features = getFeatures(actor);
      if (!features?.summoner_guardianForce) return;
      if (conjure.guardianForceCountdown) return; // Already in Guardian Force mode

      // Activate Guardian Force: summon persists on Cd4 countdown
      await actor.setFlag(MODULE_ID, FLAG_CONJURE + ".guardianForceCountdown", 4);
      // Release normal focus (summon persists without it now)
      await FocusManager.releaseFeatureFocus(actor, FOCUS_KEY);
      ChatMessage.create({
        content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
          <div class="card-body"><section class="content-body">
            <div class="card-description" style="text-align:center;">
              <strong>${actor.name}</strong> drops to 0 HP — <strong>Guardian Force</strong> activates!
              <br>${conjure.summonName} persists for Cd4 Rounds.
            </div>
          </section></div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
    });

    // Reset Avatar Emergence when mana is restored to max (on Rest)
    Hooks.on("updateActor", async (actor, changes) => {
      if (actor.type !== "character") return;
      const newMana = changes.system?.mana?.current;
      if (newMana === undefined) return;
      const maxMana = actor.system.mana?.max ?? 0;
      if (newMana >= maxMana && actor.getFlag(MODULE_ID, "avatarEmergenceUsed")) {
        await actor.unsetFlag(MODULE_ID, "avatarEmergenceUsed");
        log("Summoner", `${actor.name}: Avatar Emergence reset (mana restored)`);
      }
    });

    // Watch for focus drop on summoner_conjure (only if not in countdown mode)
    Hooks.on("updateActor", async (actor, changes) => {
      if (actor.type !== "character") return;
      if (!game.user.isGM) return;
      if (!foundry.utils.hasProperty(changes, "system.focus.spellIds")
        && !changes.flags?.[MODULE_ID]?.featureFocus) return;

      const conjure = actor.getFlag(MODULE_ID, FLAG_CONJURE);
      if (!conjure) return;
      // Don't banish if in Second Nature or Guardian Force countdown mode
      if (conjure.secondNatureCountdown || conjure.guardianForceCountdown) return;

      const featureFocus = actor.getFlag(MODULE_ID, "featureFocus") || [];
      const hasFocus = featureFocus.some(f => f.key === FOCUS_KEY);
      if (!hasFocus) {
        await this.banishSummon(actor, "Focus dropped");
      }
    });

    log("Summoner", "Summoner hooks registered.");

    // Pre-cache candidates for sheet rendering
    this._refreshCandidateCache(99);
  },

  /* -------------------------------------------- */
  /*  Sheet Tab Injection                          */
  /* -------------------------------------------- */

  /**
   * Inject a "Summon" tab into the Summoner's character sheet.
   * When no summon active: shows creature selection list.
   * When summon active: shows summon stats + Banish button.
   */
  _injectSummonTab(sheet) {
    const actor = sheet.document;
    if (actor?.type !== "character") return;

    const sheetEl = sheet.element;
    if (!sheetEl) return;

    const windowContent = sheetEl.querySelector(".window-content");
    if (!windowContent) return;

    const tabNav = windowContent.querySelector("nav.sheet-tabs");
    if (!tabNav) return;

    // Check if this actor is a summoner
    const features = actor.getFlag(MODULE_ID, "features");
    const isSummoner = !!(features?.summoner_creatureCodex);

    if (!isSummoner) {
      windowContent.querySelector('section.tab[data-tab="vce-summon"]')?.remove();
      tabNav.querySelector('[data-tab="vce-summon"]')?.remove();
      return;
    }

    const conjure = actor.getFlag(MODULE_ID, FLAG_CONJURE);
    const actorSheet = actor.sheet;

    // Remove stale elements
    windowContent.querySelector('section.tab[data-tab="vce-summon"]')?.remove();
    tabNav.querySelector('[data-tab="vce-summon"]')?.remove();

    // Create tab link
    const summonTab = document.createElement("a");
    summonTab.dataset.action = "tab";
    summonTab.dataset.tab = "vce-summon";
    summonTab.dataset.group = "primary";
    summonTab.innerHTML = "<span>Summon</span>";
    tabNav.prepend(summonTab);

    // Create tab section
    const summonSection = document.createElement("section");
    summonSection.className = "tab vce-summon-tab scrollable";
    summonSection.dataset.tab = "vce-summon";
    summonSection.dataset.group = "primary";

    if (conjure) {
      summonSection.innerHTML = this._buildSummonActiveHTML(conjure, actor);
    } else {
      summonSection.innerHTML = this._buildSummonListHTML(actor, features);
    }

    const firstTab = windowContent.querySelector("section.tab");
    if (firstTab) {
      windowContent.insertBefore(summonSection, firstTab);
    } else {
      windowContent.appendChild(summonSection);
    }

    // Tab click handler
    summonTab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      summonTab.classList.add("active");
      summonSection.classList.add("active");
      actorSheet._vceActiveTab = "vce-summon";
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-summon";
    });

    // Restore active tab
    const desiredTab = actorSheet._vceActiveTab;
    if (desiredTab === "vce-summon") {
      tabNav.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("active"));
      windowContent.querySelectorAll("section.tab").forEach(s => s.classList.remove("active"));
      summonTab.classList.add("active");
      summonSection.classList.add("active");
      if (actorSheet.tabGroups) actorSheet.tabGroups.primary = "vce-summon";
    }

    // Track other tab clicks
    tabNav.querySelectorAll("[data-tab]:not([data-tab='vce-summon'])").forEach(t => {
      t.addEventListener("click", () => { actorSheet._vceActiveTab = t.dataset.tab; });
    });

    // Bind creature row clicks (when no active conjure)
    if (!conjure) {
      this._bindSummonRowClicks(summonSection, actor, features);
    }

    // Bind banish button + action buttons (when conjure active)
    if (conjure) {
      const banishBtn = summonSection.querySelector(".vce-summon-banish");
      if (banishBtn) {
        banishBtn.addEventListener("click", async () => {
          await this.banishSummon(actor, "Dismissed");
        });
      }
      // Action buttons — click to roll using summoner's Mysticism
      summonSection.querySelectorAll(".vce-summon-action").forEach(btn => {
        btn.addEventListener("click", async () => {
          const idx = parseInt(btn.dataset.actionIdx);
          await this.rollSummonAction(actor, conjure, idx);
        });
        btn.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); btn.click(); }
        });
        // Hover effect
        btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#FFD700"; btn.style.background = "rgba(255,215,0,0.1)"; });
        btn.addEventListener("mouseleave", () => { btn.style.borderColor = "#555"; btn.style.background = ""; });
      });
    }
  },

  /**
   * Build HTML for the creature selection list (no active summon).
   */
  _buildSummonListHTML(actor, features) {
    const maxHD = this._getMaxHD(actor, features);
    const currentMana = actor.system?.mana?.current ?? 0;
    const codex = actor.getFlag(MODULE_ID, "summonCodex") || [];

    // Use cached candidates (refreshed async if stale)
    if (!this._candidateCache || this._candidateCacheMaxHD !== maxHD) {
      this._refreshCandidateCache(maxHD);
    }
    const candidates = (this._candidateCache || []).filter(c => c.hd <= maxHD);

    if (candidates.length === 0) {
      return `
        <div class="vce-bf-prompt">
          <i class="fas fa-dragon vce-bf-prompt-icon" aria-hidden="true"></i>
          <h2 class="vce-bf-prompt-title">Creature Codex</h2>
          <p class="vce-bf-prompt-desc">No creatures available (Max HD: ${maxHD})</p>
        </div>
      `;
    }

    // Sort: codex creatures first, then rest by HD + name
    const sorted = [...candidates].sort((a, b) => {
      const aInCodex = codex.includes(a.name);
      const bInCodex = codex.includes(b.name);
      if (aInCodex && !bInCodex) return -1;
      if (!aInCodex && bInCodex) return 1;
      return (a.hd - b.hd) || a.name.localeCompare(b.name);
    });

    const rows = sorted.map((c, idx) => {
      const speedExtras = [];
      const sv = c.speedValues || {};
      if (sv.fly) speedExtras.push(`Fly ${sv.fly}'`);
      if (sv.swim) speedExtras.push(`Swim ${sv.swim}'`);
      if (sv.climb) speedExtras.push(`Climb ${sv.climb}'`);
      const speedStr = `${c.speed || 30}'` + (speedExtras.length ? ` (${speedExtras.join(", ")})` : "");

      const actions = (c.actions ?? []).map(a => {
        const dmg = a.rollDamage || a.flatDamage || "—";
        return `${a.name}: ${dmg}`;
      }).join("; ");

      const inCodex = codex.includes(c.name);
      const canAfford = currentMana >= c.hd;
      // Only codex creatures can be conjured; non-codex are dimmed
      const dimStyle = (!inCodex || !canAfford) ? ' style="opacity:0.35;"' : '';
      const starIcon = inCodex
        ? `<i class="fas fa-book-open vce-bd-fav-star vce-bd-fav-active" style="color:#FFD700;" aria-label="In Codex"></i>`
        : `<i class="far fa-book vce-bd-fav-star" style="opacity:0.4;" aria-label="Not in Codex"></i>`;
      const codexClass = inCodex ? " vce-beast-row-fav" : "";
      const title = inCodex ? "Right-click to remove from Codex" : "Right-click to add to Codex";

      return `
        <tr class="vce-beast-row vce-summon-row${codexClass}" data-summon-idx="${idx}"
            data-creature-name="${c.name}"
            role="button" tabindex="0" title="${title}"${dimStyle}>
          <td class="vce-bd-cell vce-bd-cell-img">
            <img src="${c.img || "icons/svg/mystery-man.svg"}" class="vce-bd-beast-img" alt="" loading="lazy" />
          </td>
          <td class="vce-bd-cell"><strong>${starIcon} ${c.name}</strong></td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.hd}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.beingType || "—"}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.armor || 0}</td>
          <td class="vce-bd-cell">${speedStr}</td>
          <td class="vce-bd-cell vce-bd-cell-actions">${actions || "—"}</td>
        </tr>`;
    }).join("");

    const codexCount = codex.filter(n => sorted.some(c => c.name === n)).length;

    return `
      <div class="vce-bf-beast-list">
        <div style="padding:4px 8px; font-size:0.85em; opacity:0.7;">
          Creature Codex: ${codexCount} creature${codexCount !== 1 ? "s" : ""} |
          Max HD: ${maxHD} | Mana: ${currentMana} | Cost: creature's HD
          <br><em>Right-click to add/remove from Codex. Only Codex creatures can be conjured.</em>
        </div>
        <table class="vce-bd-table" role="grid">
          <thead>
            <tr class="vce-bd-header-row">
              <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
              <th class="vce-bd-th" scope="col">Creature</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">HD</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Type</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Armor</th>
              <th class="vce-bd-th" scope="col">Speed</th>
              <th class="vce-bd-th" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  /**
   * Build HTML for the active summon stats + Banish button.
   * Mirrors the Druid's Beast Form panel layout for consistency.
   */
  _buildSummonActiveHTML(conjure, actor) {
    const summonActor = game.actors.get(conjure.summonActorId);
    const speed = summonActor?.system?.speed ?? 30;
    const sv = summonActor?.system?.speedValues || {};
    const size = summonActor?.system?.size || "medium";
    const beingType = summonActor?.system?.beingType || "—";
    const senses = summonActor?.system?.senses || "";
    const immunities = summonActor?.system?.immunities || conjure.summonImmunities || [];
    const weaknesses = summonActor?.system?.weaknesses || [];
    const hp = summonActor?.system?.health;
    const hpStr = hp ? `${hp.value} / ${hp.max}` : "—";

    // --- Header (portrait + tags + banish) ---
    let html = `
      <div class="vce-bf-header">
        <img src="${conjure.summonImg || "icons/svg/mystery-man.svg"}" class="vce-bf-portrait"
          alt="${conjure.summonName} portrait" />
        <div class="vce-bf-info">
          <h2 class="vce-bf-name">${conjure.summonName}</h2>
          <div class="vce-bf-tags">
            <span class="vce-bf-tag">HD ${conjure.summonHD}</span>
            <span class="vce-bf-tag">${size}</span>
            <span class="vce-bf-tag">${beingType}</span>
          </div>
        </div>
        <button class="vce-summon-banish vce-bf-end" title="Banish Summon">
          <i class="fas fa-times" aria-hidden="true"></i> Banish
        </button>
      </div>
    `;

    // --- HP Bar ---
    const hpPct = hp ? Math.max(0, Math.min(100, (hp.value / hp.max) * 100)) : 100;
    const hpColor = hpPct > 50 ? "#4a4" : hpPct > 25 ? "#ca4" : "#c44";
    html += `
      <div class="vce-bf-extras" style="padding:4px 8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <strong>HP:</strong>
          <div style="flex:1; height:16px; background:#333; border-radius:8px; overflow:hidden; border:1px solid #555;">
            <div style="width:${hpPct}%; height:100%; background:${hpColor}; transition:width 0.3s;"></div>
          </div>
          <span style="font-weight:bold; min-width:60px; text-align:right;">${hpStr}</span>
        </div>
      </div>
    `;

    // --- Armor + Speed (mirrors beast form layout) ---
    html += `
      <div class="vce-bf-stats-row">
        <div class="armor-overlay vce-bf-armor-overlay">
          <div class="armor-name">Armor</div>
          <div class="armor-value">${summonActor?.system?.armor ?? conjure.summonArmor ?? 0}</div>
        </div>
        <div class="speed-stats-row">
          <div class="speed-group">
            <label class="speed-group-label">Crawl</label>
            <div class="speed-group-cell"><span class="speed-group-input">${speed * 3}</span><span class="speed-group-unit">'</span></div>
            <div class="speed-group-cell"><span class="speed-group-input speed-group-input-main">${speed}</span><span class="speed-group-unit">'</span></div>
            <label class="speed-group-label">Travel</label>
            <div class="speed-group-cell"><span class="speed-group-input">${Math.floor(speed / 5)}</span><span class="speed-group-unit">mi</span></div>
            <label class="speed-group-speed-label">Speed</label>
          </div>
        </div>
      </div>
    `;

    // Extra speeds + senses
    const extraSpeeds = [];
    if (sv.fly) extraSpeeds.push(`Fly ${sv.fly}'`);
    if (sv.swim) extraSpeeds.push(`Swim ${sv.swim}'`);
    if (sv.climb) extraSpeeds.push(`Climb ${sv.climb}'`);
    if (sv.cling) extraSpeeds.push(`Cling ${sv.cling}'`);
    if (extraSpeeds.length || senses) {
      html += `<div class="vce-bf-extras">`;
      if (extraSpeeds.length) html += `<span><strong>Movement:</strong> ${extraSpeeds.join(", ")}</span>`;
      if (senses) html += `<span><strong>Senses:</strong> ${senses}</span>`;
      html += `</div>`;
    }

    // --- Immunities / Weaknesses ---
    if (immunities.length || weaknesses.length) {
      html += `<div class="vce-bf-resists">`;
      if (immunities.length) html += `<div class="vce-bf-resist"><strong>Immune:</strong> ${immunities.join(", ")}</div>`;
      if (weaknesses.length) html += `<div class="vce-bf-resist"><strong>Weak:</strong> ${weaknesses.join(", ")}</div>`;
      html += `</div>`;
    }

    // --- Actions (clickable — roll via Mysticism) ---
    const actions = summonActor?.system?.actions || [];
    if (actions.length > 0) {
      html += `<div class="vce-bf-section"><h3 class="vce-bf-section-title">Actions</h3>`;
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        // Display one damage value: prefer rollDamage (e.g. "1d6"), fall back
        // to flatDamage when no dice are set. Mirrors the roll path above
        // (formula = rollDamage || flatDamage) — never sum them, they're
        // alternates, not a dice + bonus pair.
        const dmgStr = a.rollDamage || a.flatDamage || "";
        const dTypeStr = a.damageType && a.damageType !== "-" ? ` ${a.damageType}` : "";
        const rechargeStr = a.recharge ? ` <span style="opacity:0.6;">(${a.recharge})</span>` : "";

        html += `
          <div class="vce-bf-action vce-summon-action" data-action-idx="${i}"
            role="button" tabindex="0" title="Click to use (Mysticism check)">
            <div class="vce-bf-action-header">
              <strong class="vce-bf-action-name">${a.name}</strong>${rechargeStr}
              ${a.note ? `<span class="vce-bf-action-note">${a.note}</span>` : ""}
            </div>
            ${dmgStr ? `<div class="vce-bf-action-damage">${dmgStr}${dTypeStr}</div>` : ""}
            ${a.extraInfo ? `<div class="vce-bf-action-extra">${a.extraInfo}</div>` : ""}
          </div>`;
      }
      html += `</div>`;
    }

    // --- Abilities ---
    const abilities = summonActor?.system?.abilities || [];
    if (abilities.length > 0) {
      html += `<div class="vce-bf-section"><h3 class="vce-bf-section-title">Abilities</h3>`;
      for (const a of abilities) {
        html += `
          <div class="vce-bf-ability">
            <strong>${a.name}:</strong> <span>${a.description}</span>
          </div>`;
      }
      html += `</div>`;
    }

    return html;
  },

  /**
   * Bind click handlers on summon selection rows.
   */
  _bindSummonRowClicks(container, actor, features) {
    const maxHD = this._getMaxHD(actor, features);
    const candidates = (this._candidateCache || []).filter(c => c.hd <= maxHD);
    // Sort same as _buildSummonListHTML so indices match
    const codex = actor.getFlag(MODULE_ID, "summonCodex") || [];
    const sorted = [...candidates].sort((a, b) => {
      const aIn = codex.includes(a.name); const bIn = codex.includes(b.name);
      if (aIn && !bIn) return -1; if (!aIn && bIn) return 1;
      return (a.hd - b.hd) || a.name.localeCompare(b.name);
    });

    let selecting = false;

    container.querySelectorAll(".vce-summon-row").forEach(row => {
      // Left-click: conjure (only if in Codex)
      row.addEventListener("click", async () => {
        if (selecting) return;
        const name = row.dataset.creatureName;
        const currentCodex = actor.getFlag(MODULE_ID, "summonCodex") || [];
        if (!currentCodex.includes(name)) {
          ui.notifications.info(`${name} is not in your Creature Codex. Right-click to add it.`);
          return;
        }
        selecting = true;
        const idx = parseInt(row.dataset.summonIdx);
        const selected = sorted[idx];
        if (!selected) { selecting = false; return; }
        if ((actor.system?.mana?.current ?? 0) < selected.hd) {
          ui.notifications.warn(`Not enough mana! Need ${selected.hd}.`);
          selecting = false;
          return;
        }
        row.classList.add("vce-beast-row-selected");
        await this.conjureSummon(actor, selected);
        selecting = false;
      });

      // Right-click: toggle Codex membership
      row.addEventListener("contextmenu", async (ev) => {
        ev.preventDefault();
        const name = row.dataset.creatureName;
        if (!name) return;
        const currentCodex = actor.getFlag(MODULE_ID, "summonCodex") || [];
        if (currentCodex.includes(name)) {
          await actor.setFlag(MODULE_ID, "summonCodex", currentCodex.filter(n => n !== name));
          ui.notifications.info(`Removed ${name} from Creature Codex.`);
        } else {
          await actor.setFlag(MODULE_ID, "summonCodex", [...currentCodex, name]);
          ui.notifications.info(`Added ${name} to Creature Codex.`);
        }
        // Sheet will re-render from the flag update
      });

      row.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); row.click(); }
      });
    });
  },

  /**
   * Refresh the candidate cache asynchronously.
   */
  async _refreshCandidateCache(maxHD) {
    this._candidateCache = await this._gatherCandidates(maxHD);
    this._candidateCache.sort((a, b) => (a.hd - b.hd) || a.name.localeCompare(b.name));
    this._candidateCacheMaxHD = maxHD;
  },

  /* -------------------------------------------- */
  /*  Conjure Dialog                               */
  /* -------------------------------------------- */

  /**
   * Show the NPC selection dialog for conjuring a summon.
   * Sources from world NPCs + system bestiary compendium.
   * @param {Actor} actor - The summoner actor
   */
  async showConjureDialog(actor) {
    const features = getFeatures(actor);
    const maxHD = this._getMaxHD(actor, features);
    const currentMana = actor.system?.mana?.current ?? 0;

    // Gather eligible NPCs
    const candidates = await this._gatherCandidates(maxHD);

    if (candidates.length === 0) {
      ui.notifications.warn("No eligible creatures found for conjuring.");
      return;
    }

    // Sort by HD ascending, then name
    candidates.sort((a, b) => (a.hd - b.hd) || a.name.localeCompare(b.name));

    // Build HTML rows
    const rows = candidates.map((c, idx) => {
      const speedExtras = [];
      const sv = c.speedValues || {};
      if (sv.fly) speedExtras.push(`Fly ${sv.fly}'`);
      if (sv.swim) speedExtras.push(`Swim ${sv.swim}'`);
      if (sv.climb) speedExtras.push(`Climb ${sv.climb}'`);
      const speedStr = `${c.speed || 30}'` + (speedExtras.length ? ` (${speedExtras.join(", ")})` : "");

      const actions = (c.actions ?? []).map(a => {
        const dmg = a.rollDamage || a.flatDamage || "—";
        return `${a.name}: ${dmg}`;
      }).join("; ");

      const canAfford = currentMana >= c.hd;
      const dimClass = canAfford ? "" : ' style="opacity:0.4;"';
      const manaNote = canAfford ? "" : " (not enough mana)";

      return `
        <tr class="vce-summon-row" data-idx="${idx}" role="button" tabindex="0"${dimClass}>
          <td class="vce-bd-cell vce-bd-cell-img">
            <img src="${c.img || "icons/svg/mystery-man.svg"}" class="vce-bd-beast-img" alt="" />
          </td>
          <td class="vce-bd-cell"><strong>${c.name}</strong>${manaNote}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.hd}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.beingType || "—"}</td>
          <td class="vce-bd-cell vce-bd-cell-center">${c.armor || 0}</td>
          <td class="vce-bd-cell">${speedStr}</td>
          <td class="vce-bd-cell vce-bd-cell-actions">${actions || "—"}</td>
        </tr>`;
    }).join("");

    const content = `
      <div style="margin-bottom:8px;">
        <input type="text" class="vce-summon-search" placeholder="Search creatures..."
          style="width:100%; padding:4px 8px; border:1px solid #999; border-radius:4px;" />
      </div>
      <div class="vce-bd-scroll" style="max-height:400px; overflow-y:auto;">
        <table class="vce-bd-table" role="grid">
          <thead>
            <tr class="vce-bd-header-row">
              <th class="vce-bd-th vce-bd-th-img" scope="col"></th>
              <th class="vce-bd-th" scope="col">Creature</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">HD</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Type</th>
              <th class="vce-bd-th vce-bd-th-center" scope="col">Armor</th>
              <th class="vce-bd-th" scope="col">Speed</th>
              <th class="vce-bd-th" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:0.85em; opacity:0.7; margin-top:4px;">
        Max HD: ${maxHD} | Mana: ${currentMana} | Conjure cost: creature's HD
      </p>
    `;

    return new Promise((resolve) => {
      const d = new Dialog({
        title: `${actor.name} — Conjure Summon`,
        content,
        buttons: {
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
        },
        default: "cancel",
        render: (html) => {
          // Search filter
          html.find(".vce-summon-search").on("input", (ev) => {
            const query = ev.target.value.toLowerCase();
            html.find(".vce-summon-row").each(function () {
              const name = this.querySelector("strong")?.textContent?.toLowerCase() || "";
              this.style.display = name.includes(query) ? "" : "none";
            });
          });

          // Row click
          html.find(".vce-summon-row").on("click", async (ev) => {
            const idx = parseInt(ev.currentTarget.dataset.idx);
            const selected = candidates[idx];
            if (!selected) return;
            if ((actor.system?.mana?.current ?? 0) < selected.hd) {
              ui.notifications.warn(`Not enough mana! Need ${selected.hd}, have ${actor.system.mana.current}.`);
              return;
            }
            d.close();
            await this.conjureSummon(actor, selected);
            resolve(selected);
          });

          // Keyboard navigation
          html.find(".vce-summon-row").on("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              ev.currentTarget.click();
            }
          });

          // Auto-focus search
          setTimeout(() => html.find(".vce-summon-search").focus(), 50);
        },
        close: () => resolve(null)
      }, { width: 700, height: 500 });
      d.render(true);
    });
  },

  /* -------------------------------------------- */
  /*  Conjure / Banish                             */
  /* -------------------------------------------- */

  /**
   * Conjure a summon: spend mana, place token, acquire focus, apply Soulbonder.
   * @param {Actor} actor - The summoner
   * @param {object} npcData - Creature data { name, hd, img, size, armor, immunities, ... }
   */
  async conjureSummon(actor, npcData) {
    // Banish existing summon if any
    const existing = actor.getFlag(MODULE_ID, FLAG_CONJURE);
    if (existing) {
      await this.banishSummon(actor, "Replaced by new summon");
    }

    // Avatar Emergence (L6): once per shift, conjure without mana cost
    const features = getFeatures(actor);
    const cost = npcData.hd || 1;
    const currentMana = actor.system?.mana?.current ?? 0;
    let freeConjure = false;

    if (features?.summoner_avatarEmergence && !actor.getFlag(MODULE_ID, "avatarEmergenceUsed")) {
      if (currentMana < cost) {
        // Not enough mana — auto-use Avatar Emergence
        freeConjure = true;
      } else {
        // Offer choice
        freeConjure = await new Promise(resolve => {
          new Dialog({
            title: "Avatar Emergence",
            content: `<p>Use <strong>Avatar Emergence</strong> to conjure ${npcData.name} for free? (Once per Shift)</p>
              <p style="font-size:0.85em; opacity:0.7;">Otherwise costs ${cost} Mana.</p>`,
            buttons: {
              free: { icon: '<i class="fas fa-star"></i>', label: "Free (Avatar Emergence)", callback: () => resolve(true) },
              mana: { icon: '<i class="fas fa-coins"></i>', label: `Pay ${cost} Mana`, callback: () => resolve(false) }
            },
            default: "free"
          }).render(true);
        });
      }
    }

    if (freeConjure) {
      await actor.setFlag(MODULE_ID, "avatarEmergenceUsed", true);
      log("Summoner", `${actor.name} used Avatar Emergence — free conjure`);
    } else {
      if (currentMana < cost) {
        ui.notifications.error(`Not enough mana! Need ${cost}, have ${currentMana}.`);
        return;
      }
      await actor.update({ "system.mana.current": currentMana - cost });
    }

    // Get or import the source actor (via GM relay if player)
    let sourceActorId = npcData.worldActorId;
    let importedFromCompendium = false;

    if (!sourceActorId && npcData.compendiumUuid) {
      try {
        const result = await gmRequest("importActor", { uuid: npcData.compendiumUuid });
        sourceActorId = result.actorId;
        importedFromCompendium = true;
      } catch (e) {
        ui.notifications.error(`Failed to import creature: ${e.message}`);
        return;
      }
    }

    if (!sourceActorId) {
      ui.notifications.error("Could not resolve source actor for summon.");
      return;
    }

    // Place token on canvas (via GM relay if player)
    const summonerToken = actor.getActiveTokens()?.[0];
    if (!summonerToken) {
      ui.notifications.warn("No summoner token on canvas.");
      return;
    }

    const gridSize = canvas.grid?.size ?? 100;
    const sizeMultiplier = SIZE_MAP[npcData.size?.toLowerCase()] ?? 1;

    let tokenId;
    try {
      const result = await gmRequest("placeToken", {
        sceneId: canvas.scene.id,
        tokenData: {
          name: npcData.name,
          actorId: sourceActorId,
          texture: { src: npcData.img || "icons/svg/mystery-man.svg" },
          x: summonerToken.document.x + gridSize,
          y: summonerToken.document.y,
          width: sizeMultiplier,
          height: sizeMultiplier,
          disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY
        }
      });
      tokenId = result.tokenId;
    } catch (e) {
      ui.notifications.error(`Failed to place summon token: ${e.message}`);
      if (importedFromCompendium) {
        try { await gmRequest("deleteActor", { actorId: sourceActorId }); } catch { /* best effort */ }
      }
      return;
    }

    // Second Nature (L4): choose Focus or Cd4 duration
    let useSecondNature = false;
    if (features?.summoner_secondNature) {
      useSecondNature = await new Promise(resolve => {
        new Dialog({
          title: "Second Nature",
          content: `<p>How should <strong>${npcData.name}</strong> be maintained?</p>`,
          buttons: {
            focus: { icon: '<i class="fas fa-brain"></i>', label: "Focus (1 Mana/round)", callback: () => resolve(false) },
            countdown: { icon: '<i class="fas fa-hourglass-half"></i>', label: "Cd4 Rounds (no focus)", callback: () => resolve(true) }
          },
          default: "focus"
        }).render(true);
      });
    }

    if (!useSecondNature) {
      // Normal: acquire focus
      const acquired = await FocusManager.acquireFeatureFocus(
        actor, FOCUS_KEY, `Summon (${npcData.name})`, npcData.img || "icons/svg/mystery-man.svg"
      );
      if (!acquired) {
        ui.notifications.warn("No focus slots available — summon cannot be maintained.");
        try { await gmRequest("removeToken", { sceneId: canvas.scene.id, tokenId }); } catch { /* best effort */ }
        if (importedFromCompendium) {
          try { await gmRequest("deleteActor", { actorId: sourceActorId }); } catch { /* best effort */ }
        }
        return;
      }
    }

    // Store conjure state
    const conjureState = {
      summonActorId: sourceActorId,
      summonTokenId: tokenId,
      summonName: npcData.name,
      summonImg: npcData.img,
      summonHD: npcData.hd,
      summonArmor: npcData.armor ?? 0,
      summonImmunities: npcData.immunities ?? [],
      importedFromCompendium,
      sceneId: canvas.scene.id
    };
    if (useSecondNature) conjureState.secondNatureCountdown = 4;
    await actor.setFlag(MODULE_ID, FLAG_CONJURE, conjureState);

    // Apply Soulbonder if L2+
    if (features?.summoner_soulbonder) {
      await this._applySoulbonder(actor, npcData);
    }

    // Chat notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <img src="${npcData.img || "icons/svg/mystery-man.svg"}" width="36" height="36"
              style="border:none; vertical-align:middle; margin-right:8px;">
            <strong>${actor.name}</strong> conjures <strong>${npcData.name}</strong>
            (HD ${npcData.hd}${freeConjure ? ", Avatar Emergence" : `, ${cost} Mana`}${useSecondNature ? ", Cd4 duration" : ""})
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    log("Summoner", `${actor.name} conjured ${npcData.name} (HD ${npcData.hd}, ${cost} Mana)`);
  },

  /**
   * Banish the active summon: remove token, release focus, clean up.
   * @param {Actor} actor - The summoner
   * @param {string} reason - Why the summon was banished
   */
  async banishSummon(actor, reason = "Banished") {
    const conjure = actor.getFlag(MODULE_ID, FLAG_CONJURE);
    if (!conjure) return;

    // Remove token from canvas (via GM relay if player)
    const sceneId = conjure.sceneId || canvas.scene?.id;
    if (sceneId && conjure.summonTokenId) {
      try { await gmRequest("removeToken", { sceneId, tokenId: conjure.summonTokenId }); }
      catch (e) { log("Summoner", `Could not remove token: ${e.message}`); }
    }

    // Delete imported actor if from compendium (via GM relay if player)
    if (conjure.importedFromCompendium && conjure.summonActorId) {
      try { await gmRequest("deleteActor", { actorId: conjure.summonActorId }); }
      catch (e) { log("Summoner", `Could not delete imported actor: ${e.message}`); }
    }

    // Release focus
    await FocusManager.releaseFeatureFocus(actor, FOCUS_KEY);

    // Remove Soulbonder AEs
    await this._removeSoulbonder(actor);

    // Clear flag
    await actor.unsetFlag(MODULE_ID, FLAG_CONJURE);

    // Chat notification
    ChatMessage.create({
      content: `<div class="vagabond-chat-card-v2" data-card-type="apply-result">
        <div class="card-body"><section class="content-body">
          <div class="card-description" style="text-align:center;">
            <strong>${actor.name}</strong>'s summon <strong>${conjure.summonName}</strong>
            is banished. <em>(${reason})</em>
          </div>
        </section></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    log("Summoner", `${actor.name}'s ${conjure.summonName} banished: ${reason}`);
  },

  /**
   * Get the active conjure state for an actor.
   * @param {Actor} actor
   * @returns {object|null}
   */
  getActiveConjure(actor) {
    return actor?.getFlag(MODULE_ID, FLAG_CONJURE) ?? null;
  },

  /* -------------------------------------------- */
  /*  Summon Action Rolling                        */
  /* -------------------------------------------- */

  /**
   * Roll a summoned creature's action using the summoner's Mysticism check.
   * @param {Actor} summoner - The summoner actor
   * @param {object} conjure - The active conjure flag data
   * @param {number} actionIdx - Index into the summon actor's actions array
   */
  async rollSummonAction(summoner, conjure, actionIdx) {
    const summonActor = game.actors.get(conjure.summonActorId);
    if (!summonActor) {
      ui.notifications.error("Summon actor not found.");
      return;
    }

    const action = summonActor.system?.actions?.[actionIdx];
    if (!action) {
      ui.notifications.error("Action not found.");
      return;
    }

    // Determine attack type and whether a check is needed
    const attackType = action.attackType || "melee";
    const needsCheck = !!action.attackType;

    // Get summoner's mana skill (Mysticism for Summoner)
    const manaSkillKey = summoner.system?.classData?.manaSkill || "mysticism";
    const skill = summoner.system.skills?.[manaSkillKey];
    const difficulty = skill?.difficulty ?? 12;

    // Capture targets
    const targets = Array.from(game.user.targets).map(t => ({
      tokenId: t.id, sceneId: t.scene?.id,
      actorId: t.actor?.id, actorName: t.name,
      actorImg: t.document?.texture?.src
    }));

    let roll = null;
    let isSuccess = true;
    let isCritical = false;

    if (needsCheck) {
      const { VagabondRollBuilder } = await import("/systems/vagabond/module/helpers/roll-builder.mjs");
      const rollData = summoner.getRollData();
      const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
        summoner.system.favorHinder || "none", false, false
      );
      roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);
      isSuccess = roll.total >= difficulty;
      const critNum = VagabondRollBuilder.calculateCritThreshold(rollData, "spell");
      const d20 = roll.terms.find(t => t.constructor.name === "Die" && t.faces === 20);
      isCritical = (d20?.results?.[0]?.result ?? 0) >= critNum;
    }

    // Roll damage if success and action has damage
    let damageRoll = null;
    const hasDamage = action.rollDamage || action.flatDamage;
    if (isSuccess && hasDamage) {
      const { VagabondDamageHelper } = await import("/systems/vagabond/module/helpers/damage-helper.mjs");
      const formula = action.rollDamage || action.flatDamage || "0";
      damageRoll = new Roll(formula);
      await damageRoll.evaluate();
    }

    // Build tags
    const tags = [];
    tags.push({ label: skill?.label || "Mysticism", cssClass: "tag-skill" });
    if (hasDamage) {
      const dmgLabel = action.rollDamage || action.flatDamage || "";
      const dType = action.damageType;
      if (dType && dType !== "-") {
        const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType] || "fas fa-burst";
        tags.push({ label: dmgLabel, icon, cssClass: "tag-damage" });
      } else {
        tags.push({ label: dmgLabel, cssClass: "tag-damage" });
      }
    }
    if (action.note) {
      tags.push({ label: action.note, cssClass: "tag-standard" });
    }

    // Use the system's createActionCard for proper styling
    const { VagabondChatCard } = globalThis.vagabond.utils;

    // Build a minimal "item" object for the chat card (it expects actor + item)
    const fakeItem = {
      name: `${action.name}`,
      img: conjure.summonImg || "icons/svg/mystery-man.svg",
      system: { description: action.extraInfo || "" }
    };

    const rollResultData = needsCheck ? {
      roll,
      difficulty,
      isSuccess,
      isCritical,
      isHit: isSuccess,
      weaponSkill: skill,
      weaponSkillKey: manaSkillKey,
      favorHinder: summoner.system.favorHinder || "none",
      critStatBonus: isCritical ? (summoner.system.stats?.[skill?.stat]?.value || 0) : 0
    } : null;

    await VagabondChatCard.createActionCard({
      actor: summoner,
      item: fakeItem,
      title: `${action.name} (${conjure.summonName})`,
      rollData: rollResultData,
      tags,
      damageRoll,
      damageFormula: action.rollDamage && action.flatDamage
        ? `${action.rollDamage} + ${action.flatDamage}`
        : (action.rollDamage || action.flatDamage || null),
      damageType: action.damageType || "-",
      description: action.extraInfo || "",
      hasDefenses: true,
      attackType,
      targetsAtRollTime: targets,
      actionIndex: actionIdx
    });

    log("Summoner", `${summoner.name} used ${conjure.summonName}'s ${action.name}: ${isSuccess ? "hit" : "miss"}${damageRoll ? ` for ${damageRoll.total}` : ""}`);
  },

  /* -------------------------------------------- */
  /*  Soulbonder (L2)                              */
  /* -------------------------------------------- */

  /**
   * Apply summon's armor and immunities to the summoner as managed AEs.
   */
  async _applySoulbonder(actor, summonData) {
    const aes = [];

    // Armor bonus
    const armor = summonData.armor ?? 0;
    if (armor > 0) {
      aes.push({
        name: `Soulbonder: Armor (${summonData.name})`,
        icon: "icons/magic/defensive/shield-barrier-deflect-gold.webp",
        origin: `${MODULE_ID}.soulbonder`,
        changes: [{ key: "system.armorBonus", mode: 2, value: String(armor) }],
        disabled: false,
        transfer: true,
        flags: { [MODULE_ID]: { managed: true, [SOULBONDER_FLAG]: true } }
      });
    }

    // Immunities
    const immunities = summonData.immunities ?? [];
    if (immunities.length > 0) {
      aes.push({
        name: `Soulbonder: Immunities (${summonData.name})`,
        icon: "icons/magic/defensive/shield-barrier-deflect-gold.webp",
        origin: `${MODULE_ID}.soulbonder`,
        changes: immunities.map(s => ({ key: "system.statusImmunities", mode: 2, value: s })),
        disabled: false,
        transfer: true,
        flags: { [MODULE_ID]: { managed: true, [SOULBONDER_FLAG]: true } }
      });
    }

    if (aes.length > 0) {
      await actor.createEmbeddedDocuments("ActiveEffect", aes);
      log("Summoner", `Soulbonder: Applied ${aes.length} AEs to ${actor.name} from ${summonData.name}`);
    }
  },

  /**
   * Remove all Soulbonder AEs from the summoner.
   */
  async _removeSoulbonder(actor) {
    const toDelete = actor.effects.filter(e => e.getFlag(MODULE_ID, SOULBONDER_FLAG));
    if (toDelete.length > 0) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete.map(e => e.id));
      log("Summoner", `Soulbonder: Removed ${toDelete.length} AEs from ${actor.name}`);
    }
  },

  /* -------------------------------------------- */
  /*  Internal Helpers                             */
  /* -------------------------------------------- */

  /**
   * Get the maximum HD for summons based on class level + features.
   */
  _getMaxHD(actor, features) {
    const classLevel = features?._classLevel ?? 1;
    const bonus = features?.summoner_ultimateWeapon ? 5 : 0;
    return classLevel + bonus;
  },

  /**
   * Gather eligible NPC candidates from world actors + bestiary compendium.
   * Filters: non-Humanlike, HD ≤ maxHD.
   */
  async _gatherCandidates(maxHD) {
    const candidates = [];
    const seen = new Set();

    // World NPCs
    for (const npc of game.actors.filter(a => a.type === "npc")) {
      const bt = npc.system.beingType || "";
      if (bt === "Humanlike") continue;
      if ((npc.system.hd ?? 1) > maxHD) continue;
      candidates.push({
        name: npc.name,
        hd: npc.system.hd ?? 1,
        beingType: bt,
        size: npc.system.size || "medium",
        armor: npc.system.armor ?? 0,
        speed: npc.system.speed ?? 30,
        speedValues: npc.system.speedValues || {},
        immunities: npc.system.immunities || [],
        weaknesses: npc.system.weaknesses || [],
        actions: npc.system.actions || [],
        img: npc.img,
        worldActorId: npc.id,
        compendiumUuid: null
      });
      seen.add(npc.name);
    }

    // Bestiary compendium — must request system fields explicitly for remote servers
    const bestiary = game.packs.get("vagabond.bestiary");
    if (bestiary) {
      const index = await bestiary.getIndex({ fields: [
        "system.beingType", "system.hd", "system.size", "system.armor",
        "system.speed", "system.speedTypes", "system.speedValues",
        "system.actions", "system.abilities", "system.senses",
        "system.immunities", "system.weaknesses"
      ]});
      for (const entry of index.values()) {
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        const bt = entry.system?.beingType || "";
        if (bt === "Humanlike") continue;
        if ((entry.system?.hd ?? 1) > maxHD) continue;
        candidates.push({
          name: entry.name,
          hd: entry.system?.hd ?? 1,
          beingType: bt,
          size: entry.system?.size || "medium",
          armor: entry.system?.armor ?? 0,
          speed: entry.system?.speed ?? 30,
          speedValues: entry.system?.speedValues || {},
          immunities: entry.system?.immunities || [],
          weaknesses: entry.system?.weaknesses || [],
          actions: entry.system?.actions || [],
          img: entry.img,
          worldActorId: null,
          compendiumUuid: entry.uuid
        });
      }
    }

    return candidates;
  },

  /**
   * Drain 1 mana for focus upkeep. Banish if insufficient.
   */
  async _drainMana(actor) {
    const current = actor.system?.mana?.current ?? 0;
    if (current < 1) {
      await this.banishSummon(actor, "Out of Mana");
      return;
    }
    await actor.update({ "system.mana.current": current - 1 });
    log("Summoner", `${actor.name}: 1 Mana drained for summon focus (${current} → ${current - 1})`);
  }
};
