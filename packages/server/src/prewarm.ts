/** Boot: warm every paired official's voice, render the round-1 openers first, then every other canned line. */
import type { Engine } from "./engine.js";
import type { Roster } from "./personas.js";
import { audioHash, PRIORITY_IDLE, type AudioCache, type VoiceSpec } from "./voice.js";

export async function prewarm(engine: Engine, roster: Roster, audio: AudioCache): Promise<{ voices: number; warmed: number; openers: number; ok: number; total: number }> {
  const voices = new Map<string, VoiceSpec>();
  for (const pair of roster.pairs()) for (const id of pair.officers) {
    const v = roster.get(id)!.voice;
    voices.set(audioHash("", v), v);
  }
  const voiceOf = (id: string) => roster.get(id)!.voice;
  const openers = engine.openerLines();
  const openerKeys = new Set(openers.map((l) => `${l.speaker}|${l.text}`));
  const rest = engine.cannedLines().filter((l) => !openerKeys.has(`${l.speaker}|${l.text}`));
  const warm = Promise.all([...voices.values()].map((v) => audio.warm(v, 0)));
  const first = Promise.all(openers.map((l) => audio.render(l.text, voiceOf(l.speaker), 0)));
  const later = Promise.all(rest.map((l) => audio.render(l.text, voiceOf(l.speaker), PRIORITY_IDLE)));
  const [w, o, r] = await Promise.all([warm, first, later]);
  return { voices: voices.size, warmed: w.filter(Boolean).length, openers: o.filter(Boolean).length, ok: o.filter(Boolean).length + r.filter(Boolean).length, total: openers.length + rest.length };
}
