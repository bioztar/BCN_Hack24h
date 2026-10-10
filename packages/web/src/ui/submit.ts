import type { Api } from "../api";
import type { Submission, SubmissionKind } from "../contract";
import { h } from "../dom";
import { unlockAudio } from "../stage/sfx";
import { parseRepoUrl } from "../validate";
import { chrome } from "./chrome";
import { holdToRecord } from "./recorder";

export const CONSENTS = [
  "I consent to being insulted by a public authority for the purposes set out in this notice (Art. 6(1)(a) GDPR).",
  "I consent to my pitch being processed for the sole purpose of its refusal.",
  "I acknowledge that my startup is a data subject and that its rights are under consultation.",
  "I consent to the transfer of my ambitions to a third country (Strasbourg), monthly.",
  "I consent to profiling for the purpose of determining exactly how disappointing I am.",
  "I have read the 1,412 legitimate-interest partners, and they have read me.",
  "I consent to the retention of my shame forever, for transparency.",
];

const SAMPLE = "Our startup is called Swipely: Tinder for regulatory filings. AI matches you with the compliance obligation of your dreams. Pre-revenue, post-vibes.";

export function submitScreen(root: HTMLElement, api: Api): Promise<Submission> {
  return new Promise((resolve) => {
    let kind: SubmissionKind = "text";
    const pitch = h("textarea", { rows: 6, maxlength: 2000, placeholder: SAMPLE, "aria-label": "Describe your startup" });
    const transcript = h("textarea", { rows: 5, maxlength: 2000, placeholder: "Your dictated statement will appear here. You may amend it.", "aria-label": "Transcript" });
    const repo = h("input", { type: "url", placeholder: "https://github.com/<owner>/<repo>", "aria-label": "GitHub repository URL", spellcheck: false });
    const repoMsg = h("p", { class: "field-msg" }, "Public repositories on github.com only. Other hosts are a third country.");
    const recStatus = h("p", { class: "field-msg", role: "status" }, "Press and hold. Speak clearly. Release to submit for transcription.");
    const rec = holdToRecord({
      api,
      label: "Hold to dictate",
      onText: (t) => {
        transcript.value = t;
        update();
      },
      onStatus: (s, k) => {
        recStatus.textContent = s;
        recStatus.classList.toggle("bad", k === "error");
      },
    });

    const panels: Record<SubmissionKind, HTMLElement> = {
      text: h("div", { class: "panel" }, h("label", null, "Describe your startup (max. 2,000 characters)", pitch)),
      dictation: h("div", { class: "panel" }, h("div", { class: "rec-row" }, rec, recStatus), h("label", null, "Transcript (editable)", transcript)),
      repo: h("div", { class: "panel" }, h("label", null, "GitHub repository", repo), repoMsg),
    };
    const tabNames: Record<SubmissionKind, string> = { text: "Text", dictation: "Dictate", repo: "GitHub repo" };
    const tabs = (Object.keys(panels) as SubmissionKind[]).map((k) =>
      h("button", { type: "button", role: "tab", class: "tab", dataset: { k }, onclick: () => setKind(k) }, tabNames[k]),
    );

    const consentRows = CONSENTS.map((text) => h("p", { class: "consent-note" }, "☑ ", text));
    const missing = h("p", { class: "missing", role: "status" });
    const submit = h("button", { type: "submit", class: "btn primary big" }, "Submit for refusal ▸");

    const form = h(
      "form",
      { class: "submit-form", novalidate: true },
      h("h1", null, "Application for Refusal"),
      h("p", { class: "form-sub" }, "Form SUB-1 (rev. 14) — to be completed in block capitals, in your head."),
      h("div", { class: "tabs", role: "tablist" }, tabs),
      h("div", { class: "panels" }, Object.values(panels)),
      h("fieldset", { class: "consents" }, h("legend", null, "Consent to be insulted — deemed given by showing up"), consentRows),
      missing,
      submit,
    );
    root.replaceChildren(chrome(form, "SUB-1(2026) 4812 final"));

    function current(): Submission | string {
      if (kind === "repo") {
        const r = parseRepoUrl(repo.value);
        if (!r) return "A valid https://github.com/<owner>/<repo> URL is required.";
        return { kind, repoUrl: r.url };
      }
      const text = (kind === "text" ? pitch : transcript).value.trim();
      if (text.length < 10) return kind === "text" ? "Describe your startup (at least 10 characters)." : "Dictate your pitch first (hold the button).";
      return { kind, text };
    }

    function update() {
      const r = parseRepoUrl(repo.value);
      repoMsg.textContent = !repo.value.trim()
        ? "Public repositories on github.com only. Other hosts are a third country."
        : r
          ? `✓ ${r.owner}/${r.repo} — admissible. It will be read. All of it.`
          : "Inadmissible. Only https://github.com/<owner>/<repo>. Other hosts are a third country.";
      repoMsg.classList.toggle("bad", !!repo.value.trim() && !r);
      const sub = current();
      const problems = [typeof sub === "string" ? sub : null].filter(Boolean);
      missing.textContent = problems.join(" ");
      submit.disabled = problems.length > 0;
    }

    function setKind(k: SubmissionKind) {
      kind = k;
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.k === k)));
      (Object.keys(panels) as SubmissionKind[]).forEach((p) => (panels[p].hidden = p !== k));
      update();
    }

    [pitch, transcript, repo].forEach((el) => el.addEventListener("input", update));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const sub = current();
      if (typeof sub === "string") return update();
      unlockAudio();
      submit.disabled = true;
      submit.textContent = "Registering your file…";
      resolve(sub);
    });
    setKind("text");
  });
}
