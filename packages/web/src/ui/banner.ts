import { h, fmtInt, sleep } from "../dom";
import { tick } from "../stage/sfx";

const PARTNERS = [
  "Legitimate Interest Holdings S.à r.l.",
  "Consent Harvesting GmbH",
  "Pixel & Tracker Notaires Associés",
  "Brussels Lobby Analytics BV",
  "Data Broker of Last Resort Ltd",
  "The Cookie (sentient)",
  "Your Co-Founder's Previous Startup",
  "Fingerprinting for Good e.V.",
];

/** Gag 1. Resolves once the visitor has suffered enough. */
export function cookieBanner(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const status = h("p", { class: "cookie-status", role: "status" });
    const bar = h("div", { class: "progress" }, h("i"));
    bar.hidden = true;

    const toggles = PARTNERS.map((name, i) => {
      const input = h("input", { type: "checkbox", checked: true, id: `p${i}` });
      input.addEventListener("change", () => {
        if (input.checked) return;
        setTimeout(() => {
          input.checked = true;
          row.classList.add("flash");
          setTimeout(() => row.classList.remove("flash"), 900);
          status.textContent = `${name} relies on legitimate interest (Art. 6(1)(f) GDPR). Your objection has been noted and overruled.`;
        }, 700 + Math.random() * 600);
      });
      const row = h("label", { class: "toggle", for: `p${i}` }, input, h("span", { class: "slider" }), h("span", null, name), h("small", null, "Legitimate interest"));
      return row;
    });

    const accept = h("button", { class: "btn primary", disabled: true }, "Please read the notice (4)");
    const save = h("button", { class: "btn" }, "Save my choices");
    const reject = h("button", { class: "btn", disabled: true, title: "Unavailable pending implementing act" }, "Reject all");
    const manage = h("details", { class: "partners" }, h("summary", null, `Manage ${fmtInt(1412)} partners`), toggles, h("p", { class: "more" }, `… and ${fmtInt(1404)} further partners, each with a legitimate interest in you.`));

    const box = h(
      "div",
      { class: "cookie-box", role: "dialog", "aria-modal": "true", "aria-labelledby": "ck-t" },
      h("h2", { id: "ck-t" }, "Your privacy is important to us."),
      h("p", { class: "lead" }, `That is why we share it with ${fmtInt(1412)} legitimate-interest partners.`),
      h(
        "p",
        { class: "small" },
        "We and our partners store and/or access information on your device, process personal data such as unique identifiers, your pitch deck and your hopes, " +
          "for the purposes of refusal, profiling, measuring your disappointment and developing new forms. Some partners do not ask for your consent but rely on their legitimate interest, which they have.",
      ),
      manage,
      status,
      bar,
      h("div", { class: "cookie-actions" }, h("span", { class: "reject-wrap" }, reject, h("small", null, "pending implementing act")), save, accept),
      h("p", { class: "form-no" }, "Form CK(2026) 1412 final"),
    );
    const wall = h("div", { class: "cookie-wall" }, h("div", { class: "cookie-bg", "aria-hidden": "true" }, "DG ROAST"), box);
    root.replaceChildren(wall);

    let n = 4;
    const countdown = setInterval(() => {
      n--;
      if (n > 0) accept.textContent = `Please read the notice (${n})`;
      else {
        clearInterval(countdown);
        accept.textContent = "Accept all";
        accept.disabled = false;
      }
    }, 1000);

    async function proceed(kind: "accept" | "save") {
      accept.disabled = save.disabled = true;
      manage.open = false;
      toggles.forEach((t) => ((t.querySelector("input") as HTMLInputElement).checked = true));
      bar.hidden = false;
      const fill = bar.firstElementChild as HTMLElement;
      const total = 1412;
      const t0 = performance.now();
      const dur = kind === "save" ? 3000 : 2400;
      for (;;) {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const done = Math.round(total * (1 - (1 - k) ** 2));
        fill.style.width = `${k * 100}%`;
        status.textContent =
          kind === "save"
            ? `Saving your choices and re-enabling them… ${fmtInt(done)}/${fmtInt(total)}`
            : `Notifying partners of your consent… ${fmtInt(done)}/${fmtInt(total)}`;
        if (Math.random() < 0.3) tick();
        if (k >= 1) break;
        await sleep(60);
      }
      status.textContent = kind === "save" ? "Your preferences have been saved and overruled. You may proceed." : "Consent recorded. Thank you for your cooperation.";
      await sleep(900);
      clearInterval(countdown);
      resolve();
    }
    accept.addEventListener("click", () => void proceed("accept"));
    save.addEventListener("click", () => void proceed("save"));
  });
}
