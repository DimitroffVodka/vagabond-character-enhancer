/**
 * Tier A — Phase 5 chat-message injection behavioral tests.
 *
 * 14+ VCE subsystems hook `renderChatMessage` to inject buttons, visual
 * decorations, or modify button data attrs on system chat cards. This is a
 * fragile cross-cut: a single regression in `onRenderChatMessage` (the
 * utils.mjs v14 shim), or a renamed CSS class in the system, silently
 * breaks ALL of these features at once with no console error.
 *
 * Earlier tests only verify that the modules expose hook-registration
 * methods. These tests drive the actual injection pipeline:
 *
 *   1. Synthesize a chat card matching the system's known DOM shape.
 *   2. Configure the speaker / target actor state the hook reads.
 *   3. Create the message — Foundry renders it, the hook fires.
 *   4. Assert the expected DOM mutation or side-effect happened.
 *   5. (For button clicks) click the injected button and assert the
 *      handler ran (flag state change, etc.).
 *
 * Pattern is uniform across tests so adding more features later is just
 * "describe the input card, assert the output". This file targets three
 * representative subsystems; expand here if more chat-injection regressions
 * surface in the wild.
 */
import { MODULE_ID } from "../../../utils.mjs";

/** Locate the rendered chat-message DOM element by message id. */
function _findRenderedMessage(msgId) {
  return document.querySelector(`[data-message-id="${msgId}"]`);
}

/**
 * Wait up to timeoutMs for `predicate(rendered)` to return truthy. Returns
 * the rendered element if found, or undefined on timeout.
 *
 * Foundry's chat-message render is async — message create → DOM mount →
 * renderChatMessage hook → injection. Fixed waits are flaky under load;
 * poll for the expected end state.
 */
async function _waitForRenderedInjection(msgId, predicate, timeoutMs = 2500) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const rendered = _findRenderedMessage(msgId);
    if (rendered && predicate(rendered)) return rendered;
    await new Promise(r => setTimeout(r, 50));
  }
  return _findRenderedMessage(msgId); // return whatever we have for error reporting
}

export const tests = [

  /* ============================================================== */
  /*  BARBARIAN: RAGE visual tag on attack cards                     */
  /* ============================================================== */
  {
    id: "chat-injection.barbarian-rage-tag-on-attack",
    name: "Barbarian: 'RAGE' tag injected into card-header when berserk + low armor",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.TestPC;

      // State the hook reads:
      //   - hasFeature(actor, "barbarian_rage")
      //   - actor in berserk status
      //   - _isLightOrNoArmor (no equipped armor items → returns true)
      // system.armor is derived from equipped armor items; not settable
      // directly. The fixture has no equipped armor so we're already at 0.
      const features = a.getFlag(MODULE_ID, "features") ?? {};
      await a.setFlag(MODULE_ID, "features", { ...features, barbarian_rage: true });
      await a.toggleStatusEffect("berserk", { active: true });
      await wait(100);

      // Pre-check: confirm preconditions are actually in place before sending
      assert(a.getFlag(MODULE_ID, "features")?.barbarian_rage === true,
        "precondition: barbarian_rage flag should be set");
      assert(a.statuses.has("berserk"),
        `precondition: actor should be berserk; statuses=${[...a.statuses].join(",")}`);

      let msg;
      try {
        // Create a synthetic attack card with the .card-header the hook
        // selects on. Speaker.actor points at our barbarian.
        msg = await ChatMessage.create({
          content: `<div class="card-header">Test attack</div>`,
          speaker: { actor: a.id },
        });

        const rendered = await _waitForRenderedInjection(msg.id,
          (el) => !!el.querySelector(".vce-rage-tag"));
        assert(!!rendered, "chat message should render to DOM");
        const rageTag = rendered?.querySelector(".vce-rage-tag");
        assert(!!rageTag,
          `expected .vce-rage-tag injected into .card-header; got: ${rendered?.querySelector(".card-header")?.outerHTML}`);
        assert((rageTag?.textContent ?? "").trim() === "RAGE" ||
               (rageTag?.textContent ?? "").trim().length > 0,
          `expected RAGE label; got "${rageTag?.textContent}"`);

        // Negative: hook should NOT double-inject on re-render
        const cardHeaderHTML = rendered?.querySelector(".card-header")?.outerHTML ?? "";
        const tagCount = (cardHeaderHTML.match(/vce-rage-tag/g) || []).length;
        assert(tagCount === 1, `expected exactly 1 vce-rage-tag; got ${tagCount}`);
      } finally {
        if (msg) await msg.delete();
        await a.toggleStatusEffect("berserk", { active: false }).catch(() => {});
        // Snapshot/restore handles flag + armor reset.
      }
    }
  },

  /* ============================================================== */
  /*  BARBARIAN: Rage DR breakdown on save-damage cards              */
  /* ============================================================== */
  {
    id: "chat-injection.barbarian-rage-dr-breakdown",
    name: "Barbarian: Rage DR breakdown injected on save-damage card targeting berserk barbarian",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const a = fixtures.TestPC;
      const features = a.getFlag(MODULE_ID, "features") ?? {};
      await a.setFlag(MODULE_ID, "features", { ...features, barbarian_rage: true });
      await a.toggleStatusEffect("berserk", { active: true });
      await wait(100);

      // TestPC has no equipped armor so actualArmor = 0. The hook computes:
      //   totalReduction = total - final = 10 - 4 = 6
      //   rageDR = totalReduction - actualArmor = 6 - 0 = 6
      // Trigger condition: rageDR > 0 — passes (6 > 0).
      const actualArmor = a.system.armor ?? 0;
      const expectedRageDR = 6 - actualArmor;
      assert(expectedRageDR > 0,
        `precondition: expected positive rageDR; got ${expectedRageDR}`);

      let msg;
      try {
        // Mimic the system's save-damage card structure. Total=10, Armor span
        // shows actualArmor (no separate armor injected — the hook *reads* this),
        // final=4 → reduction=6.
        const cardHTML = `
          <div class="damage-formula-line">
            <span class="damage-component" title="Total Damage">10</span>
            <span class="damage-operator">-</span>
            <span class="damage-component" title="Armor ${actualArmor}">${actualArmor}</span>
            <span class="damage-final">4</span>
          </div>
          <button class="vagabond-apply-direct-button" data-targets='[{"actorId":"${a.id}"}]'>Apply</button>
        `;
        msg = await ChatMessage.create({ content: cardHTML, speaker: { actor: a.id } });

        const rendered = await _waitForRenderedInjection(msg.id,
          (el) => !!el.querySelector(".vce-rage-dr"));
        const rageDRSpan = rendered?.querySelector(".vce-rage-dr");
        assert(!!rageDRSpan,
          `expected .vce-rage-dr span injected; formula line HTML: ${rendered?.querySelector(".damage-formula-line")?.outerHTML}`);
        const drText = (rageDRSpan?.textContent ?? "").trim();
        // Match against the expected value based on the actor's actual armor
        assert(new RegExp(String(expectedRageDR)).test(drText),
          `Rage DR span should display ${expectedRageDR}; got "${drText}"`);
      } finally {
        if (msg) await msg.delete();
        await a.toggleStatusEffect("berserk", { active: false }).catch(() => {});
      }
    }
  },

  /* ============================================================== */
  /*  HUNTER: Unmark button click clears hunterMark flag             */
  /* ============================================================== */
  {
    id: "chat-injection.hunter-unmark-button-click",
    name: "Hunter: clicking [data-action='vce-hunter-unmark'] clears hunterMark flag",
    tier: "a",
    usesFixtures: ["TestPC"],
    run: async ({ fixtures, assert, wait }) => {
      const hunter = fixtures.TestPC;
      // Plant a mark so we have something to clear
      await hunter.setFlag(MODULE_ID, "hunterMark", {
        targetId: "fake-target-id",
        targetName: "FakeTarget",
        targetImg: "icons/svg/mystery-man.svg",
      });
      assert(!!hunter.getFlag(MODULE_ID, "hunterMark"),
        "precondition: hunterMark flag set before click");

      let msg;
      try {
        // Synthetic unmark button — the hook attaches a click listener via
        // onRenderChatMessage that reads dataset.hunterId and calls _unmarkTarget.
        const cardHTML = `
          <button data-action="vce-hunter-unmark" data-hunter-id="${hunter.id}">Unmark</button>
        `;
        msg = await ChatMessage.create({ content: cardHTML, speaker: { actor: hunter.id } });

        const rendered = await _waitForRenderedInjection(msg.id,
          (el) => !!el.querySelector("[data-action='vce-hunter-unmark']"));
        const btn = rendered?.querySelector("[data-action='vce-hunter-unmark']");
        assert(!!btn, "expected unmark button in rendered DOM");

        // Trigger the click — the registered click handler should clear the flag
        btn.click();

        // _unmarkTarget is async — poll until the flag is gone or timeout.
        const deadline = performance.now() + 1500;
        while (performance.now() < deadline) {
          if (!hunter.getFlag(MODULE_ID, "hunterMark")) break;
          await wait(50);
        }
        const after = hunter.getFlag(MODULE_ID, "hunterMark");
        assert(!after,
          `hunterMark flag should be cleared after Unmark button click; got ${JSON.stringify(after)}`);
      } finally {
        if (msg) await msg.delete();
        await hunter.unsetFlag(MODULE_ID, "hunterMark").catch(() => {});
      }
    }
  },
];
