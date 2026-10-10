import "./styles.css";
import { mdToHtml } from "./md.js";
import { ideaFromQuery, MIN_IDEA_CHARS } from "./query.js";
import type { Citation, Finding, ItemStatus, Report, Severity } from "../../src/types.js";

const API = "/api/analyze";
const STAGES = [
  ["intake", "Reading the input"],
  ["classify", "Classifying — AI Act tier & role, framework applicability"],
  ["checklist", "Running both skills' checklists"],
  ["report", "Writing findings, overlap, deadlines"],
  ["validate", "Validating every citation against the provision index"],
] as const;
const SEV: Severity[] = ["critical", "high", "medium", "low"];
const app = document.getElementById("app")!;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const cite = (c: Citation) => `<a class="cite" href="${esc(c.url)}" target="_blank" rel="noopener" title="${esc(c.title)}">${esc(c.display)}</a>`;
const cites = (cs: Citation[]) => cs.map(cite).join("");
const shortCap = (cap: string) => (cap.split(/;\s*/).at(-1) ?? cap).replace(/\s*\(.*\)/, "").replace(/\s+of worldwide.*$/i, " of global turnover").trim();
const chip = (s: Severity) => `<span class="chip sev-${s}">${s}</span>`;

let tab: "idea" | "document" | "repo" = "idea";
let reportId = "";
let draft = "";

const SKILL_REPO = "https://github.com/bioztar/warden";
const SKILL_INSTALL = "git clone https://github.com/bioztar/warden && warden/scripts/install-skill.sh";

function shell(inner: string) {
  app.innerHTML = `<header class="top" id="top"><span class="brand">warden<small>by Pro7ocol</small></span></header><main>${inner}</main>
  <aside class="skill no-print" aria-label="Install as an agent skill"><h3>Install this as an agent skill</h3><p>Works in Claude Code, Codex, Pi and other agent harnesses. Source: <a href="${SKILL_REPO}" target="_blank" rel="noopener">github.com/bioztar/warden</a></p><div class="cmd"><code>${esc(SKILL_INSTALL)}</code><button type="button" class="ghost" id="copy-skill">Copy</button></div></aside>
  <footer>warden — EU AI Act &amp; compliance analyzer · <a href="https://warden.pro7ocol.com/analyze/">warden.pro7ocol.com</a> · <a href="https://eurocrat.pro7ocol.com/" title="for the brave">🇪🇺</a></footer>`;
  const copy = app.querySelector<HTMLButtonElement>("#copy-skill")!;
  copy.onclick = () => void navigator.clipboard?.writeText(SKILL_INSTALL).then(() => (copy.textContent = "Copied"));
}

function renderForm(error = "") {
  shell(`<p class="value">Your idea, document or repo vs EU AI Act, GDPR, NIS2, DORA &amp; 5 more — in 60 seconds, with real citations.</p>
  <h1>Which EU AI Act and compliance obligations apply to you?</h1>
  <p class="lede">Describe a product idea, upload a design document, or point at a public GitHub repo. warden classifies it under the EU AI Act, checks GDPR, NIS2, DORA, ISO 27001/42001, SOC 2, NIST AI RMF and OWASP LLM Top 10, and reports gaps with real, validated citations and concrete fixes.</p>
  <form id="input" class="card">
    <div class="tabs" role="tablist">${(["idea", "document", "repo"] as const).map((t) => `<button type="button" role="tab" data-tab="${t}" aria-selected="${t === tab}">${{ idea: "Idea", document: "Document", repo: "GitHub repo" }[t]}</button>`).join("")}</div>
    <div id="pane">${pane()}</div>
    <div class="row"><label>Warden checklist <select name="checklist"><option value="auto">Matching artifact type</option><option value="vendor-assessment">Vendor assessment</option></select></label></div>
    <div class="row"><button class="primary" type="submit">Analyse</button></div>
    <p class="privacy">🔒 processed in memory on EU infrastructure, not stored, not used for training — not legal advice</p>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
  </form>
  ${pricing()}`);
  const ta = app.querySelector<HTMLTextAreaElement>("textarea[name=text]");
  if (ta) (ta.value = draft), (ta.oninput = () => (draft = ta.value));
  app.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => (b.onclick = () => ((tab = b.dataset.tab as typeof tab), renderForm())));
  (app.querySelector("#input") as HTMLFormElement).onsubmit = submit;
}

const CONTACT = "hello@pro7ocol.com";
const mailto = (subject: string) => `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;

function pricing() {
  const plans = [
    { name: "Quick scan", price: "Free", note: "this tool", items: ["AI Act tier + role", "Which frameworks apply", "Severity-ranked gaps with citations", "Markdown export"], cta: `<a class="ghost" href="#top">Run a scan</a>` },
    { name: "Full compliance dossier", price: "€49", note: "per artifact", items: ["Everything in the quick scan", "PDF dossier for investors & buyers", "Full checklist with evidence", "Step-by-step fixes and effort"], cta: `<a class="primary" href="${mailto("warden — Full compliance dossier (€49)")}">Get the dossier</a>`, featured: true },
    { name: "Expert review", price: "€249", note: "per artifact", items: ["The dossier, reviewed by a human compliance consultant", "Written sign-off on tier and priorities", "30-minute call"], cta: `<a class="ghost" href="${mailto("warden — Expert review (€249)")}">Book a review</a>` },
    { name: "Accelerators & VCs", price: "Portfolio", note: "cohort screening", items: ["Screen a whole cohort or portfolio", "One view of AI Act exposure across companies", "Volume pricing"], cta: `<a class="ghost" href="${mailto("warden — portfolio / cohort screening")}">Contact ${CONTACT}</a>` },
  ];
  return `<section class="pricing no-print" id="pricing"><h2>Pricing</h2><div class="plans">${plans
    .map((p) => `<div class="plan${p.featured ? " featured" : ""}"><h3>${esc(p.name)}</h3><div class="price">${p.price}<small>${p.note}</small></div><ul>${p.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>${p.cta}</div>`)
    .join("")}</div><p class="privacy">Not legal advice. Paid tiers are delivered by Pro7ocol — <a href="mailto:${CONTACT}">${CONTACT}</a>.</p></section>`;
}

function pane() {
  if (tab === "idea") return `<textarea name="text" required minlength="20" placeholder="e.g. An app that screens CVs with an LLM and ranks applicants for EU employers, with a chatbot that answers candidates' questions."></textarea>`;
  if (tab === "document") return `<label class="drop">Design doc, PRD or spec — .pdf, .docx, .md, .txt (max 10 MB)<br/><br/><input type="file" name="file" required accept=".pdf,.docx,.md,.txt"/></label>`;
  return `<input type="url" name="repoUrl" required placeholder="https://github.com/owner/repo" pattern="https://github\\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+/?"/><p class="privacy">Public repositories only. warden reads the README, tree, manifests and up to ~30 small source files via the GitHub API. Tracked .env/key files are reported, never opened.</p>`;
}

async function submit(ev: SubmitEvent) {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  const fd = new FormData(form);
  fd.set("kind", tab);
  (form.querySelector("button.primary") as HTMLButtonElement).disabled = true;
  let res: Response;
  try {
    res = tab === "document" ? await fetch(API, { method: "POST", body: fd }) : await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"))) });
  } catch {
    return renderForm("Could not reach the analyzer. Try again.");
  }
  const body = (await res.json().catch(() => ({}))) as { reportId?: string; error?: string };
  if (!res.ok || !body.reportId) return renderForm(body.error ?? `Request failed (${res.status})`);
  reportId = body.reportId;
  progress(body.reportId);
}

function progress(id: string) {
  const state: Record<string, { status: string; detail?: string }> = {};
  const draw = () =>
    shell(`<h1>Analysing…</h1><p class="lede">Each stage runs one step of the EU AI Act and warden skills.</p><ol class="stages">${STAGES.map(([k, label]) => {
      const s = state[k];
      return `<li class="${s?.status === "done" ? "done" : s ? "run" : ""}"><span class="dot"></span><span>${label}${s?.detail ? ` — <small>${esc(s.detail)}</small>` : ""}</span></li>`;
    }).join("")}</ol>`);
  draw();
  const es = new EventSource(`${API}/${id}/stream`);
  es.addEventListener("stage", (m) => {
    const e = JSON.parse((m as MessageEvent).data) as { stage: string; status: string; detail?: string };
    state[e.stage] = { status: e.status, detail: e.detail };
    draw();
  });
  es.addEventListener("report", (m) => {
    es.close();
    renderReport((JSON.parse((m as MessageEvent).data) as { report: Report }).report);
  });
  es.addEventListener("error", (m) => {
    es.close();
    const data = (m as MessageEvent).data;
    renderForm(data ? (JSON.parse(data) as { message: string }).message : "The connection to the analyzer was lost.");
  });
}

function findingHtml(f: Finding) {
  return `<article class="finding" data-sev="${f.severity}"><header>${chip(f.severity)}<h3>${esc(f.title)}</h3><span class="id">${esc(f.id)} · ${f.skill === "eu-ai-act" ? "EU AI Act" : "warden"}${f.status === "unclear" ? " · unclear" : ""} · effort ${f.effort}</span></header>
  <dl><dt>What</dt><dd>${esc(f.what)}</dd><dt>Why it matters</dt><dd>${esc(f.why)}</dd><dt>Fix</dt><dd>${esc(f.fix)}</dd><dt>Evidence</dt><dd>${esc(f.evidence)}</dd>${f.citations.length ? `<dt>Provisions</dt><dd>${cites(f.citations)}</dd>` : ""}${f.overlap.length ? `<dt>Overlap</dt><dd>${f.overlap.join(", ")}</dd>` : ""}</dl></article>`;
}

function renderReport(r: Report, mock = false) {
  const s = r.summary;
  const pen = s.headlinePenalty;
  shell(`<div class="actions no-print"><button class="ghost" id="again">← New analysis</button>${mock ? "" : `<a class="ghost" href="${API}/${r.id}.md" download>Export Markdown</a>`}<button class="ghost" id="md">${mock ? "Export Markdown" : "Copy link"}</button><button class="ghost" onclick="window.print()">Print / PDF</button></div>
  <h1>${esc(r.title)}</h1><p class="lede">${{ idea: "Product idea", document: "Design document", repo: "Public GitHub repository" }[r.kind]} · ${r.createdAt.slice(0, 10)} · checklists: EU AI Act <b>${r.checklists["eu-ai-act"]}</b>, warden <b>${r.checklists.warden}</b>${mock ? " · <b>sample report</b>" : ""}</p>
  <section class="summary">
    <div class="card"><div class="k">EU AI Act</div><div class="v">${esc(s.aiAct.headline)}</div><div class="k" style="margin-top:6px">confidence ${esc(s.aiAct.confidence)}</div></div>
    <div class="card"><div class="k">Frameworks triggered</div><div class="fw">${s.frameworksTriggered.map((f) => `<span title="${esc(f.status)}">${esc(f.framework)}</span>`).join("") || "—"}</div><div class="k" style="margin-top:8px">warden verdict: ${esc(s.wardenVerdict)}</div></div>
    <div class="card"><div class="k">Findings</div><div class="counts">${SEV.map((x) => `<span class="chip sev-${x}">${s.counts[x]} ${x}</span>`).join("")}</div></div>
    <div class="card"><div class="k">Headline penalty exposure</div><div class="v">${pen ? esc(shortCap(pen.cap)) : "No statutory fine"}</div>${pen ? `<div>${esc(pen.framework)} ${cites(pen.citations)}</div>` : ""}</div>
  </section>
  <h2>EU AI Act classification</h2><div class="card"><p><b>Tier:</b> ${esc(r.aiAct.tier)} · <b>Roles:</b> ${esc(r.aiAct.roles.join(", ") || "—")}</p><ol class="decisions">${r.aiAct.decisions.map((d) => `<li><b>${esc(d.step)}</b> — ${esc(d.verdict)}. ${esc(d.reasoning)} ${cites(d.citations)}</li>`).join("")}</ol></div>
  <h2>Applicability (warden)</h2><div class="tablewrap"><table><thead><tr><th>Framework</th><th>Verdict</th><th>Basis</th><th>Provisions</th></tr></thead><tbody>${r.warden.frameworks.map((f) => `<tr><td>${esc(f.framework)}</td><td>${esc(f.status)}</td><td>${esc(f.basis)}</td><td>${cites(f.citations)}</td></tr>`).join("")}</tbody></table></div><p class="handoff">${esc(r.handoff)}</p>
  <h2>Findings</h2><div class="filters no-print"><select id="fsev"><option value="">All severities</option>${SEV.map((x) => `<option>${x}</option>`).join("")}</select></div><div id="findings">${r.findings.map(findingHtml).join("") || "<p>No gaps found.</p>"}</div>
  ${r.overlap.length ? `<h2>Build once, evidence many</h2><p class="lede">One control, several frameworks (warden overlap matrix).</p><div class="tablewrap"><table><thead><tr><th>#</th><th>Control</th><th>Satisfies</th><th>Findings</th></tr></thead><tbody>${r.overlap.map((o) => `<tr><td>${o.id}</td><td>${esc(o.theme)}</td><td>${o.cells.map((c) => `<div><b>${esc(c.framework)}</b> ${cites(c.citations)}</div>`).join("")}</td><td>${o.findings.join(", ") || "—"}</td></tr>`).join("")}</tbody></table></div>` : ""}
  ${r.deadlines.length ? `<h2>Deadlines &amp; reporting clocks</h2><div class="tablewrap"><table><thead><tr><th>When</th><th>Framework</th><th>What</th><th>Source</th></tr></thead><tbody>${r.deadlines.map((d) => `<tr><td>${esc(d.date)}</td><td>${esc(d.framework)}</td><td>${esc(d.event)}</td><td>${cites(d.citations)}</td></tr>`).join("")}</tbody></table></div>` : ""}
  ${r.penalties.length ? `<h2>Penalty exposure</h2><div class="tablewrap"><table><thead><tr><th>Framework</th><th>Cap</th><th>Basis</th><th>Source</th></tr></thead><tbody>${r.penalties.map((p) => `<tr><td>${esc(p.framework)}</td><td>${esc(p.cap)}</td><td>${esc(p.basis)}</td><td>${cites(p.citations)}</td></tr>`).join("")}</tbody></table></div>` : ""}
  <h2>Checklist</h2><div class="filters no-print"><select id="cskill"><option value="">Both skills</option><option value="eu-ai-act">EU AI Act</option><option value="warden">warden</option></select><select id="cstatus"><option value="">All statuses</option>${["gap", "unclear", "met", "n/a"].map((x) => `<option>${x}</option>`).join("")}</select></div>
  <div class="tablewrap"><table><thead><tr><th>Item</th><th>Severity</th><th>Status</th><th>Evidence</th></tr></thead><tbody id="ctable"></tbody></table></div>
  ${r.explainer ? `<h2>In plain language</h2><button class="ghost no-print" id="toggleExp">Show explainer</button><div id="exp" hidden><div class="explainer">${mdToHtml(r.explainer.body)}</div><p>Sources: ${cites(r.explainer.sources)}</p></div>` : ""}
  ${r.intake.sensitiveFiles.length ? `<p class="handoff">Tracked secret-like files (not opened): ${r.intake.sensitiveFiles.map(esc).join(", ")}</p>` : ""}
  <p class="disclaimer">${esc(r.disclaimer)} Citations validated against ${r.validation.indexSize} indexed provisions (${r.validation.index}); ${r.validation.droppedIds.length} unverifiable references removed${r.validation.strippedAiAct ? `; ${r.validation.strippedAiAct} AI Act references kept out of the warden half by design (see the AI Act section)` : ""}.</p>`);
  const ct = app.querySelector("#ctable")!;
  const drawChecklist = () => {
    const sk = (app.querySelector("#cskill") as HTMLSelectElement).value;
    const st = (app.querySelector("#cstatus") as HTMLSelectElement).value as ItemStatus | "";
    ct.innerHTML = r.checklist
      .filter((c) => (!sk || c.skill === sk) && (!st || c.status === st))
      .map((c) => `<tr><td><b>${c.skill === "eu-ai-act" ? "AI Act" : "warden"} ${esc(c.itemId)}</b> ${esc(c.title)}<div>${cites(c.citations)}</div></td><td>${chip(c.severity)}</td><td class="st-${c.status === "n/a" ? "na" : c.status}">${c.status} <small>(${esc(c.verdict)})</small></td><td>${esc(c.evidence)}</td></tr>`)
      .join("");
  };
  app.querySelectorAll("#cskill,#cstatus").forEach((el) => el.addEventListener("change", drawChecklist));
  drawChecklist();
  (app.querySelector("#fsev") as HTMLSelectElement).onchange = (e) => {
    const v = (e.target as HTMLSelectElement).value;
    app.querySelectorAll<HTMLElement>(".finding").forEach((f) => (f.hidden = !!v && f.dataset.sev !== v));
  };
  const t = app.querySelector<HTMLButtonElement>("#toggleExp");
  if (t) t.onclick = () => {
    const box = app.querySelector<HTMLElement>("#exp")!;
    box.hidden = !box.hidden;
    t.textContent = box.hidden ? "Show explainer" : "Hide explainer";
  };
  (app.querySelector("#again") as HTMLButtonElement).onclick = () => {
    history.replaceState(null, "", location.pathname);
    renderForm();
  };
  (app.querySelector("#md") as HTMLButtonElement).onclick = async () => {
    if (mock) {
      const { reportMarkdownBrowser } = await import("./markdown-browser.js");
      const blob = new Blob([reportMarkdownBrowser(r)], { type: "text/markdown" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "warden-sample-report.md" });
      a.click();
    } else void navigator.clipboard?.writeText(location.href);
  };
  if (!mock && reportId) history.replaceState(null, "", `?report=${r.id}`);
}

async function boot() {
  const q = new URLSearchParams(location.search);
  if (q.get("mock") === "1") {
    const fixture = (await import("./fixture-report.json")).default as unknown as Report;
    return renderReport(fixture, true);
  }
  const rid = q.get("report");
  if (rid) {
    const res = await fetch(`${API}/${encodeURIComponent(rid)}`).catch(() => null);
    if (res?.status === 200) return renderReport((await res.json()) as Report);
    if (res?.status === 202) return progress(rid);
  }
  const idea = ideaFromQuery(location.search);
  if (idea) (tab = "idea"), (draft = idea), history.replaceState(null, "", location.pathname);
  renderForm();
  if (idea && idea.length >= MIN_IDEA_CHARS) app.querySelector<HTMLFormElement>("#input")!.requestSubmit();
}
void boot();
