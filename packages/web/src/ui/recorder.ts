import type { Api } from "../api";
import { h } from "../dom";

export interface RecorderOpts {
  api: Api;
  label?: string;
  onText: (text: string) => void;
  onStatus: (status: string, kind?: "info" | "error") => void;
}

function pickMime(): string | undefined {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

/** Hold-to-dictate button: MediaRecorder → POST /api/stt → onText. */
export function holdToRecord(o: RecorderOpts): HTMLButtonElement {
  const label = o.label ?? "Hold to dictate";
  const btn = h("button", { type: "button", class: "btn rec" }, h("span", { class: "rec-dot" }), h("span", { class: "rec-label" }, label));
  const setLabel = (t: string) => ((btn.querySelector(".rec-label") as HTMLElement).textContent = t);
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let held = false;
  let busy = false;
  let startedAt = 0;

  async function transcribe(blob: Blob) {
    busy = true;
    btn.disabled = true;
    setLabel("Transcribing — Form STT-2…");
    o.onStatus("Your statement is being transcribed and placed on file.");
    try {
      const text = (await o.api.stt(blob)).trim();
      if (text) {
        o.onText(text);
        o.onStatus("Transcript entered into the record. You may amend it before submission.");
      } else o.onStatus("Nothing intelligible was said. This has been noted.", "error");
    } catch (err) {
      o.onStatus(`Transcription refused: ${(err as Error).message}. Please type instead, in triplicate.`, "error");
    } finally {
      busy = false;
      btn.disabled = false;
      setLabel(label);
    }
  }

  async function start() {
    if (busy || rec) return;
    held = true;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      if (o.api.mock) return void transcribe(new Blob([], { type: "audio/webm" }));
      o.onStatus("Dictation is not available in this browser. Please type, in triplicate.", "error");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (o.api.mock) return void transcribe(new Blob([], { type: "audio/webm" }));
      o.onStatus("Microphone access refused. Your withdrawal of consent (Art. 7(3) GDPR) has been noted and ignored.", "error");
      return;
    }
    const mimeType = pickMime();
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      rec = null;
      btn.classList.remove("on");
      const blob = new Blob(chunks, { type: r.mimeType || mimeType || "audio/webm" });
      if (performance.now() - startedAt < 500 || (!o.api.mock && blob.size < 800)) {
        setLabel(label);
        o.onStatus("Too short. Hold the button while you speak.", "error");
        return;
      }
      void transcribe(blob);
    };
    rec = r;
    startedAt = performance.now();
    r.start();
    btn.classList.add("on");
    setLabel("Recording — release to submit");
    o.onStatus("Recording. Everything you say may be used against you.");
    if (!held) stop();
  }

  function stop() {
    held = false;
    if (rec && rec.state === "recording") rec.stop();
  }

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    void start();
  });
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      void start();
    }
  });
  btn.addEventListener("keyup", (e) => (e.key === " " || e.key === "Enter") && stop());
  return btn;
}
