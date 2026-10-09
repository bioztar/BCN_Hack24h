/**
 * The shareable 1080×1080 badge: a hand-written SVG rendered by resvg (WebAssembly — no native
 * build, no headless browser) with the bundled fonts.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { ellipsize, fitSize, fontBuffers } from "./fonts.js";
import { formatEur, formatJail } from "./format.js";
import type { ReportData, ReportOfficer } from "./model.js";

export const BADGE_SIZE = 1080;
export const PUBLIC_HOST = "eurocrat.pro7ocol.com";

const NAVY = "#0b1f4d";
const NAVY_DEEP = "#06122e";
const GOLD = "#ffd617";
const PALE = "#c9d3ea";
const RED = "#ff2b2b";
const FLAME = "#ff7a1a";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let ready: Promise<void> | null = null;
function init(): Promise<void> {
  ready ??= (async () => {
    const wasm = createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm");
    await initWasm(readFileSync(wasm));
  })();
  return ready;
}

/** The face on a transparent cut-out sits in the upper-middle third; frame it in a circle. */
function face(o: ReportOfficer, cx: number, cy: number, r: number, i: number): string {
  const clip = `face${i}`;
  let img = `<path d="M${cx - r * 0.55},${cy + r} q0,-${r * 0.75} ${r * 0.55},-${r * 0.8} a${r * 0.36},${r * 0.4} 0 1,1 0.1,0 q${r * 0.55},${r * 0.05} ${r * 0.55},${r * 0.8} z" fill="#7a86a3"/>`;
  if (o.cutout && existsSync(o.cutout)) {
    const data = readFileSync(o.cutout).toString("base64");
    const scale = (2 * r) / 430;
    img = `<image href="data:image/png;base64,${data}" x="${cx - 384 * scale}" y="${cy - 250 * scale}" width="${768 * scale}" height="${1024 * scale}" preserveAspectRatio="none"/>`;
  }
  return `<clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${PALE}"/>
  <g clip-path="url(#${clip})">${img}</g>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${GOLD}" stroke-width="4"/>`;
}

export function meanwhileLine(m: NonNullable<ReportData["meanwhile"]>): string {
  return `MEANWHILE: CHINA ${m.china.models.toLocaleString("en-US")} AI MODELS · US ${m.us.models.toLocaleString("en-US")} · EU ${m.eu.regulations.toLocaleString("en-US")} REGULATIONS + ${m.eu.forms.toLocaleString("en-US")} FORMS`;
}

export function badgeSvg(r: ReportData): string {
  const W = BADGE_SIZE;
  const mid = W / 2;
  const inner = 860;
  const name = r.startupName.toUpperCase();
  const nameSize = fitSize(name, "display", inner, 128, 48, 2);
  const nameText = nameSize === 48 ? ellipsize(name, "display", 48, inner) : name;
  const fines = formatEur(r.totalEur);
  const finesSize = fitSize(fines, "display", inner, 118, 40, 1);
  const jail = r.totalJailMonths > 0 ? `+ ${formatJail(r.totalJailMonths).toUpperCase()} IN PRISON` : "+ A SUSPENDED SENTENCE OF PAPERWORK";
  const jailSize = fitSize(jail, "display", inner, 50, 24, 2);
  const mw = r.meanwhile ? meanwhileLine(r.meanwhile) : null;
  const mwSize = mw ? fitSize(mw, "sansBold", inner, 24, 12, 1) : 0;
  const founder = r.founderName ? `founded by ${r.founderName}` : "founder unknown to the Directorate (suspicious)";
  const officers = `${r.officers[0].name} & ${r.officers[1].name}`;
  const offSize = fitSize(officers, "sansBold", 400, 21, 12);
  const offText = offSize === 12 ? ellipsize(officers, "sansBold", 12, 400) : officers;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#16326f"/><stop offset="0.6" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DEEP}"/></radialGradient>
    <filter id="ink" x="-10%" y="-20%" width="120%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -14 9.6" result="specks"/>
      <feComposite in="SourceGraphic" in2="specks" operator="in" result="speckled"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="warp"/>
      <feDisplacementMap in="speckled" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <pattern id="lines" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="none"/><line x1="0" y1="0" x2="0" y2="12" stroke="#ffffff" stroke-opacity="0.025" stroke-width="6"/></pattern>
  </defs>
  <rect width="${W}" height="${W}" fill="url(#bg)"/>
  <rect width="${W}" height="${W}" fill="url(#lines)"/>
  <rect x="26" y="26" width="${W - 52}" height="${W - 52}" fill="none" stroke="${GOLD}" stroke-width="6"/>
  <rect x="40" y="40" width="${W - 80}" height="${W - 80}" fill="none" stroke="${GOLD}" stroke-opacity="0.6" stroke-width="2"/>

  <text x="${mid}" y="152" text-anchor="middle" font-family="Anton" font-size="104" letter-spacing="14" fill="${GOLD}">EUROCRAT</text>
  <text x="${mid}" y="194" text-anchor="middle" font-family="Liberation Sans" font-weight="bold" font-size="19" letter-spacing="3" fill="${PALE}">DG ROAST · DIRECTORATE-GENERAL FOR REGULATORY ROASTING</text>
  <line x1="200" y1="216" x2="${W - 200}" y2="216" stroke="${GOLD}" stroke-opacity="0.5" stroke-width="2"/>
  <text x="${mid}" y="250" text-anchor="middle" font-family="Liberation Serif" font-style="italic" font-size="24" fill="${PALE}">Notice of Non-Compliance issued to</text>

  <text x="${mid}" y="${270 + nameSize * 0.82}" text-anchor="middle" font-family="Anton" font-size="${nameSize}" letter-spacing="2" fill="#ffffff">${esc(nameText)}</text>
  <text x="${mid}" y="${270 + nameSize * 0.82 + 44}" text-anchor="middle" font-family="Liberation Serif" font-style="italic" font-size="28" fill="${PALE}">${esc(ellipsize(founder, "serifItalic", 28, inner))}</text>

  <g transform="translate(${mid} 556) rotate(-6)" filter="url(#ink)" opacity="0.95">
    <rect x="-400" y="-104" width="800" height="208" rx="14" fill="none" stroke="${RED}" stroke-width="12"/>
    <rect x="-380" y="-84" width="760" height="168" rx="7" fill="none" stroke="${RED}" stroke-width="4"/>
    <text x="0" y="28" text-anchor="middle" font-family="Anton" font-size="108" letter-spacing="10" fill="${RED}">REFUSÉ</text>
    <text x="0" y="70" text-anchor="middle" font-family="Anton" font-size="34" letter-spacing="12" fill="${RED}">BANNED IN THE EU</text>
  </g>

  <text x="${mid}" y="722" text-anchor="middle" font-family="Liberation Sans" font-weight="bold" font-size="24" letter-spacing="6" fill="${PALE}">TOTAL FINES</text>
  <text x="${mid}" y="${734 + finesSize * 0.86}" text-anchor="middle" font-family="Anton" font-size="${finesSize}" letter-spacing="1" fill="${GOLD}">${esc(fines)}</text>
  <text x="${mid}" y="902" text-anchor="middle" font-family="Anton" font-size="${jailSize}" letter-spacing="2" fill="#ffffff">${esc(jail)}</text>
  ${mw ? `<text x="${mid}" y="946" text-anchor="middle" font-family="Liberation Sans" font-weight="bold" font-size="${mwSize}" letter-spacing="1" fill="${GOLD}">${esc(mw)}</text>` : ""}

  ${face(r.officers[0], 104, 1000, 40, 0)}
  ${face(r.officers[1], 190, 1000, 40, 1)}
  <text x="246" y="${r.meltdown ? 993 : 1003}" font-family="Liberation Sans" font-weight="bold" font-size="${offSize}" fill="#ffffff">${esc(offText)}</text>
  ${r.meltdown ? `<text x="246" y="1020" font-family="Liberation Sans" font-weight="bold" font-size="16" letter-spacing="2" fill="${FLAME}">MELTDOWN · BOTH OFFICERS COMBUSTED</text>` : `<text x="246" y="1026" font-family="Liberation Sans" font-size="16" letter-spacing="1" fill="${PALE}">CASE OFFICERS</text>`}
  <text x="${W - 64}" y="990" text-anchor="end" font-family="Liberation Sans" font-weight="bold" font-size="22" letter-spacing="1" fill="${PALE}">No. ${esc(r.serial)}</text>
  <text x="${W - 64}" y="1022" text-anchor="end" font-family="Liberation Sans" font-weight="bold" font-size="22" letter-spacing="1" fill="${GOLD}">${PUBLIC_HOST}</text>
</svg>`;
}

export async function renderBadge(r: ReportData): Promise<Buffer> {
  await init();
  const resvg = new Resvg(badgeSvg(r), { font: { fontBuffers: fontBuffers(), defaultFontFamily: "Liberation Sans" }, fitTo: { mode: "width", value: BADGE_SIZE } });
  const img = resvg.render();
  const png = Buffer.from(img.asPng());
  img.free();
  resvg.free();
  return png;
}
