import { markBroken, pickVisual, portraitCandidates } from "../assets";
import type { ClipSlot, Persona } from "../contract";
import { h } from "../dom";
import { expressionFor } from "../reducer";
import type { Bust } from "./bust3d";
import { Puppet } from "./puppet";

/** Static portrait (queue board): neutral cut-out/still, else silhouette. Still blinks. */
export function portrait(p: Persona): HTMLElement {
  const puppet = new Puppet(p);
  puppet.show(portraitCandidates(p, "neutral"), "neutral");
  return h("div", { class: "portrait", style: `--accent:${p.color}` }, puppet.el);
}

/**
 * One official on the stage. Main path: the talking-portrait puppet. A persona's optional
 * clip (for the slot) or GLB bust is used only if listed and loadable.
 */
export class OfficialView {
  readonly el: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly puppet: Puppet;
  private key = "";
  private slot: ClipSlot = "idle";
  private speaking = false;
  private bust: Bust | null = null;
  private finishedOneShot = "";
  private level: () => number | null = () => null;

  constructor(readonly persona: Persona) {
    this.puppet = new Puppet(persona);
    this.frame = h("div", { class: "frame" });
    this.el = h(
      "figure",
      { class: "official", style: `--accent:${persona.color}`, dataset: { id: persona.id } },
      this.frame,
      h("figcaption", { class: "nameplate" }, h("strong", null, persona.name), h("span", null, persona.title)),
    );
    this.render();
  }

  update(slot: ClipSlot, speaking: boolean, level?: () => number | null): void {
    if (slot !== this.slot) this.finishedOneShot = "";
    if (level) this.level = level;
    this.slot = slot;
    this.speaking = speaking;
    this.el.classList.toggle("speaking", speaking);
    this.render();
  }

  startle(): void {
    this.puppet.startle();
  }

  private effectiveSlot(): ClipSlot {
    if (this.finishedOneShot === this.slot) return this.speaking ? "talking" : "idle";
    return this.slot;
  }

  private render(): void {
    const slot = this.effectiveSlot();
    const expr = expressionFor(slot, this.speaking);
    const v = pickVisual(this.persona, slot, expr);
    this.bust?.setTalking(this.speaking);
    this.puppet.setTalking(this.speaking, this.level);
    if (v.kind === "puppet") {
      this.puppet.show(v.images, expr);
      if (this.key !== "puppet") {
        this.key = "puppet";
        this.swap(this.puppet.el);
      }
      return;
    }
    const key = `${v.kind}:${v.url}`;
    if (key === this.key) return;
    this.key = key;
    if (v.kind === "clip") this.showClip(v.url, v.loop, key);
    else this.showBust(v.url, key);
  }

  private fail(url: string, key: string): void {
    markBroken(url);
    if (this.key === key) {
      this.key = "";
      this.render();
    }
  }

  private swap(layer: HTMLElement): void {
    for (const old of [...this.frame.children]) {
      if (old === layer) continue;
      if (old.classList.contains("layer-bust") && this.bust) {
        this.bust.dispose();
        this.bust = null;
      }
      old.remove();
    }
    layer.classList.add("layer");
    if (!layer.isConnected) this.frame.append(layer);
  }

  private showClip(url: string, loop: boolean, key: string): void {
    const v = h("video", { class: "layer-clip", muted: true, playsInline: true, autoplay: true, loop, preload: "auto" });
    v.muted = true;
    v.style.visibility = "hidden";
    v.addEventListener("loadeddata", () => {
      if (this.key !== key) return v.remove();
      v.style.visibility = "";
      this.swap(v);
      void v.play().catch(() => undefined);
    }, { once: true });
    v.addEventListener("error", () => (v.remove(), this.fail(url, key)), { once: true });
    v.addEventListener("ended", () => {
      this.finishedOneShot = this.slot;
      this.render();
    });
    v.src = url;
    this.frame.append(v);
  }

  private showBust(url: string, key: string): void {
    const host = h("div", { class: "layer-bust" });
    host.style.visibility = "hidden";
    this.frame.append(host);
    import("./bust3d")
      .then(({ mountBust }) => mountBust(host, url))
      .then((bust) => {
        if (this.key !== key) return bust.dispose();
        host.style.visibility = "";
        this.swap(host);
        this.bust = bust;
        bust.setTalking(this.speaking);
      })
      .catch((err) => {
        console.warn("[official] bust failed", url, err);
        host.remove();
        this.fail(url, key);
      });
  }

  dispose(): void {
    this.bust?.dispose();
    this.puppet.dispose();
    this.el.remove();
  }
}
