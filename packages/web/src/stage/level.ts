/** RMS of 8-bit time-domain samples (128 = silence), scaled so speech sits around 0.3–0.9. */
export function levelFromSamples(buf: Uint8Array): number {
  if (!buf.length) return 0;
  let sum = 0;
  for (const v of buf) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 4);
}
