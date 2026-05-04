import { MODULE_ID } from "../utils.mjs";

export async function emitOutput({ summary, results }) {
  // Console table
  const rows = results.map(r => ({
    id: r.id,
    status: r.status,
    ms: r.durationMs,
    failures: r.failures.length,
    errors: r.errors.length,
    consoleErrors: r.consoleErrors.length
  }));
  console.table(rows);
  console.log(`${MODULE_ID} | smoke summary:`, summary);

  // Chat banner
  const banner = pickBanner(summary);
  const failed = results.filter(r => r.status === "fail" || r.status === "error");
  const failureList = failed.length ? `
    <details open style="margin-top:8px;">
      <summary style="cursor:pointer; font-weight:bold;">Failures (${failed.length})</summary>
      <ul style="margin: 4px 0 0 16px; padding: 0;">
        ${failed.map(r => `<li><code>${escapeHtml(r.id)}</code>: ${escapeHtml((r.failures[0]?.message ?? r.errors[0]?.message ?? "(no detail)").slice(0, 200))}</li>`).join("")}
      </ul>
    </details>` : "";

  const content = `
    <div class="vce-smoke-summary" style="border-left: 4px solid ${banner.color}; padding: 8px 12px; background: ${banner.bg};">
      <div style="font-weight:bold; font-size:1.1em;">${banner.icon} VCE Smoke Test — ${banner.label}</div>
      <div style="margin-top:4px; font-size:0.9em;">
        ✓ ${summary.passed} passed · ✗ ${summary.failed} failed · ⚠ ${summary.errored} errored · ⏭ ${summary.skipped} skipped · ${summary.durationMs}ms
      </div>
      ${failureList}
    </div>`;

  await ChatMessage.create({
    content,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    speaker: { alias: "VCE Smoke Test" }
  });
}

function pickBanner(summary) {
  if (summary.failed > 0 || summary.errored > 0) return { color: "#c0392b", bg: "#fdecea", icon: "❌", label: "Failed" };
  if (summary.skipped > 0)                       return { color: "#d4ac0d", bg: "#fff8e1", icon: "⚠️", label: "Passed (with skips)" };
  return { color: "#27ae60", bg: "#eafaf1", icon: "✅", label: "All passed" };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
