import * as THREE from "three";
import type { BodyKind } from "./physics";
import type { Persona } from "./types";

export type Mood = "neutral" | "appalled" | "asleep" | "smug";

export interface Rig {
  /** Driven by the physics body. */
  root: THREE.Group;
  /** Local animation layer (bob, nod). */
  inner: THREE.Group;
  /** Where the Zzz and speech come out. */
  head: THREE.Object3D;
  talk(level: number): void;
  stamp(): void;
  mood(m: Mood): void;
  update(dt: number, t: number): void;
  /** Procedural face pieces hidden when a cutout portrait is mounted. */
  faceParts: THREE.Object3D[];
  /** Where a cutout portrait goes (a plane on the head / screen / cookie). */
  faceMount: { parent: THREE.Object3D; y: number; z: number; size: number } | null;
}

export function kindFor(id: string): BodyKind {
  if (id === "auditor-9000") return "terminal";
  if (id === "the-cookie") return "cookie";
  return "human";
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string | number, opts: { emissive?: number; metal?: number; rough?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.emissive ?? ""}|${opts.metal ?? ""}|${opts.rough ?? ""}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: opts.rough ?? 0.78, metalness: opts.metal ?? 0 });
    if (opts.emissive !== undefined) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = 0.9;
    }
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function ball(r: number, m: THREE.Material, x = 0, y = 0, z = 0, detail = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 7): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = true;
  return mesh;
}

function textTexture(text: string, bg: string, fg: string, w = 128, h = 64, font = "bold 28px Arial"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKIN = "#e8b894";
const INK_RED = "#c8102e";

function rubberStamp(): THREE.Group {
  const g = new THREE.Group();
  const handle = cyl(0.025, 0.03, 0.09, mat("#5a3a22"));
  handle.position.y = 0.05;
  const knob = ball(0.035, mat("#5a3a22"), 0, 0.11, 0, 0);
  const base = box(0.1, 0.03, 0.07, mat("#333"), 0, 0, 0);
  const ink = box(0.1, 0.008, 0.07, mat(INK_RED), 0, -0.018, 0);
  g.add(handle, knob, base, ink);
  return g;
}

function briefcase(color = "#6b4226"): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.2, 0.15, 0.06, mat(color), 0, -0.08, 0));
  const h = box(0.07, 0.02, 0.02, mat("#222"), 0, 0.005, 0);
  g.add(h);
  g.add(box(0.03, 0.02, 0.065, mat("#d4af37", { metal: 0.6, rough: 0.3 }), 0, -0.03, 0));
  return g;
}

interface Face {
  eyes: THREE.Mesh[];
  mouth: THREE.Mesh;
  brows: THREE.Mesh[];
  browY: number;
  /** Resting brow tilt: >0 = stern frown (inner ends down). */
  stern: number;
  extra: THREE.Object3D[];
}

interface FaceOpts { lips?: string; spread?: number; eyeColor?: string; brow?: string | null; browW?: number; browH?: number; stern?: number; }

function addFace(parent: THREE.Object3D, y: number, z: number, opts: FaceOpts = {}): Face {
  const s = opts.spread ?? 0.055;
  const eyeM = mat(opts.eyeColor ?? "#1a1a1a");
  const eyes = [box(0.035, 0.035, 0.02, eyeM, -s, y + 0.04, z), box(0.035, 0.035, 0.02, eyeM, s, y + 0.04, z)];
  const mouth = box(0.07, 0.02, 0.02, mat(opts.lips ?? "#5b2a2a"), 0, y - 0.045, z);
  parent.add(...eyes, mouth);
  const browY = y + 0.085;
  const brows: THREE.Mesh[] = [];
  if (opts.brow !== null) {
    const bm = mat(opts.brow ?? "#3a2a1a");
    for (const x of [-s, s]) brows.push(box(opts.browW ?? 0.06, opts.browH ?? 0.014, 0.02, bm, x, browY, z + 0.004));
    parent.add(...brows);
  }
  return { eyes, mouth, brows, browY, stern: opts.stern ?? 0.25, extra: [] };
}

function glasses(parent: THREE.Object3D, y: number, z: number, spread = 0.055, color = "#222"): THREE.Group {
  const m = mat(color, { metal: 0.5, rough: 0.4 });
  const g = new THREE.Group();
  for (const x of [-spread, spread]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 4, 10), m);
    ring.position.set(x, y, z);
    g.add(ring);
  }
  g.add(box(0.04, 0.008, 0.008, m, 0, y, z));
  parent.add(g);
  return g;
}

interface HumanOpts {
  suit: string;
  trousers?: string;
  shirt?: string;
  tie?: string | null;
  hair: (head: THREE.Group) => void;
  glasses?: boolean | string;
  lips?: string;
  face?: FaceOpts;
  /** Non-uniform body scale, e.g. tall and thin. */
  stretch?: [number, number, number];
  skirt?: boolean;
  torsoW?: number;
  leftHand?: THREE.Object3D;
  extras?: (torso: THREE.Group, inner: THREE.Group) => void;
  scale?: number;
}

function makeRig(root: THREE.Group, inner: THREE.Group, head: THREE.Object3D, face: Face | null, arm: THREE.Object3D | null, onStamp?: () => void, onMood?: (m: Mood) => void, onTalk?: (l: number) => void): Rig {
  let talk = 0;
  let stampT = -1;
  let current: Mood = "neutral";
  let blinkT = 2 + Math.random() * 3;
  const applyEyes = () => {
    if (!face) return;
    for (const e of face.eyes) {
      const sy = current === "asleep" ? 0.15 : current === "appalled" ? 1.5 : current === "smug" ? 0.5 : 1;
      e.scale.set(current === "appalled" ? 1.4 : 1, sy, 1);
    }
    face.brows.forEach((b, i) => {
      const side = i === 0 ? 1 : -1;
      const lift = current === "appalled" ? 0.03 : current === "asleep" ? -0.012 : 0;
      const tilt = current === "appalled" ? -0.25 : current === "smug" ? (i === 0 ? -0.35 : face.stern) : current === "asleep" ? 0 : face.stern;
      b.position.y = face.browY + lift + (current === "smug" && i === 0 ? 0.015 : 0);
      b.rotation.z = -side * tilt;
    });
  };
  applyEyes();
  return {
    root,
    inner,
    head,
    faceParts: face ? [...face.eyes, face.mouth, ...face.brows, ...face.extra] : [],
    faceMount: null,
    talk(level) {
      talk = level;
      onTalk?.(level);
    },
    stamp() {
      stampT = 0;
      onStamp?.();
    },
    mood(m) {
      current = m;
      applyEyes();
      onMood?.(m);
    },
    update(dt, t) {
      inner.position.y = Math.sin(t * 16) * 0.012 * talk;
      head.rotation.x = Math.sin(t * 9) * 0.08 * talk + (current === "asleep" ? 0.35 : 0);
      head.rotation.z = current === "asleep" ? Math.sin(t * 1.5) * 0.06 : 0;
      if (face) {
        const open = current === "appalled" ? 0.6 : 0;
        face.mouth.scale.y = 1 + Math.max(open, talk) * 3.2;
        face.mouth.scale.x = current === "smug" ? 1.4 : 1;
        blinkT -= dt;
        if (blinkT < 0 && current !== "asleep") {
          for (const e of face.eyes) e.scale.y = 0.1;
          if (blinkT < -0.12) {
            blinkT = 2 + Math.random() * 4;
            applyEyes();
          }
        }
      }
      if (arm) {
        if (stampT >= 0) {
          stampT += dt;
          const k = stampT;
          arm.rotation.x = k < 0.25 ? -2.7 * (k / 0.25) : k < 0.33 ? -2.7 + 1.4 * ((k - 0.25) / 0.08) : k < 0.7 ? -1.3 : -1.3 * Math.max(0, 1 - (k - 0.7) / 0.3);
          if (k > 1) stampT = -1;
        } else {
          arm.rotation.x = -0.15 * talk * (1 + Math.sin(t * 6));
        }
      }
    },
  };
}

function human(o: HumanOpts): Rig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const tw = o.torsoW ?? 0.4;
  const trouserM = mat(o.trousers ?? o.suit);
  if (o.skirt) {
    const skirt = cyl(0.17, 0.22, 0.2, trouserM, 8);
    skirt.position.y = -0.3;
    inner.add(skirt);
    inner.add(box(0.06, 0.06, 0.06, mat(SKIN), -0.08, -0.43, 0), box(0.06, 0.06, 0.06, mat(SKIN), 0.08, -0.43, 0));
  } else {
    inner.add(box(0.13, 0.24, 0.16, trouserM, -0.085, -0.32, 0), box(0.13, 0.24, 0.16, trouserM, 0.085, -0.32, 0));
  }
  inner.add(box(0.14, 0.05, 0.2, mat("#141414"), -0.085, -0.445, 0.02), box(0.14, 0.05, 0.2, mat("#141414"), 0.085, -0.445, 0.02));

  const torso = new THREE.Group();
  inner.add(torso);
  torso.add(box(tw, 0.42, 0.24, mat(o.suit), 0, -0.0, 0));
  torso.add(box(0.11, 0.2, 0.02, mat(o.shirt ?? "#f4f4f4"), 0, 0.1, 0.122));
  if (o.tie !== null) torso.add(box(0.035, 0.18, 0.02, mat(o.tie ?? "#003399"), 0, 0.07, 0.132));
  const neck = box(0.08, 0.06, 0.08, mat(SKIN), 0, 0.235, 0);
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.34;
  inner.add(head);
  head.add(ball(0.15, mat(SKIN), 0, 0, 0, 1));
  head.add(box(0.035, 0.05, 0.04, mat(SKIN), 0, -0.01, 0.15));
  const nose = head.children[head.children.length - 1]!;
  const face = addFace(head, 0.0, 0.14, { lips: o.lips, ...o.face });
  face.extra.push(nose);
  if (o.glasses) face.extra.push(glasses(head, 0.04, 0.158, 0.055, typeof o.glasses === "string" ? o.glasses : "#222"));
  o.hair(head);

  const armM = mat(o.suit);
  const rArm = new THREE.Group();
  rArm.position.set(tw / 2 + 0.04, 0.16, 0);
  rArm.add(box(0.08, 0.32, 0.09, armM, 0, -0.15, 0));
  rArm.add(box(0.07, 0.06, 0.07, mat(SKIN), 0, -0.33, 0));
  const st = rubberStamp();
  st.position.set(0, -0.4, 0);
  st.rotation.x = Math.PI;
  rArm.add(st);
  inner.add(rArm);

  const lArm = new THREE.Group();
  lArm.position.set(-tw / 2 - 0.04, 0.16, 0);
  lArm.add(box(0.08, 0.32, 0.09, armM, 0, -0.15, 0));
  lArm.add(box(0.07, 0.06, 0.07, mat(SKIN), 0, -0.33, 0));
  const left = o.leftHand ?? briefcase();
  left.position.y = -0.36;
  lArm.add(left);
  inner.add(lArm);

  o.extras?.(torso, inner);
  if (o.scale) inner.scale.setScalar(o.scale);
  if (o.stretch) inner.scale.set(...o.stretch);
  const rig = makeRig(root, inner, head, face, rArm);
  rig.faceMount = { parent: head, y: 0, z: 0.152, size: 0.33 };
  return rig;
}

function paperStack(): THREE.Group {
  const g = new THREE.Group();
  const tints = ["#fbfbf5", "#fff3b0", "#fbfbf5", "#cfe8ff", "#fbfbf5", "#ffd1d1", "#fbfbf5"];
  for (let i = 0; i < 14; i++) {
    const sheet = box(0.2, 0.012, 0.26, mat(tints[i % tints.length]!), (Math.sin(i * 2.3) * 0.012), 0.012 * i, Math.cos(i * 1.7) * 0.01);
    sheet.rotation.y = Math.sin(i * 1.3) * 0.08;
    g.add(sheet);
  }
  g.add(box(0.205, 0.18, 0.012, mat("#c8102e"), 0, 0.08, 0), box(0.012, 0.18, 0.265, mat("#c8102e"), 0, 0.08, 0));
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.05), new THREE.MeshStandardMaterial({ map: textTexture("IN TRIPLICATE", "#fffef6", "#003399", 160, 56, "bold 20px Arial"), side: THREE.DoubleSide }));
  tag.position.set(0, 0.18, 0.135);
  g.add(tag);
  g.rotation.x = Math.PI / 2;
  g.position.z = 0.04;
  return g;
}

function folder(label: string, color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.2, 0.27, 0.025, mat(color)));
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.07), new THREE.MeshStandardMaterial({ map: textTexture(label, "#fffef6", "#111", 192, 64, "bold 18px Arial") }));
  lab.position.set(0, 0.05, 0.014);
  g.add(lab);
  g.position.z = 0.03;
  return g;
}

function lanyards(torso: THREE.Group, count: number): void {
  const colours = ["#003399", "#ffcc00", "#c8102e", "#2e8b57", "#7b3fa0", "#ff8c00", "#00a3a3"];
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.007, 3, 12, Math.PI), mat("#1c1c1c"));
  cord.rotation.z = Math.PI;
  cord.position.set(0, 0.2, 0.12);
  torso.add(cord);
  for (let i = 0; i < count; i++) {
    const a = (i - (count - 1) / 2) * 0.16;
    const badge = new THREE.Group();
    badge.add(box(0.06, 0.08, 0.01, mat("#f8f8f8")));
    badge.add(box(0.06, 0.018, 0.012, mat(colours[i % colours.length]!), 0, 0.03, 0));
    badge.position.set(Math.sin(a) * 0.12, 0.02 - Math.cos(a) * 0.05 + 0.04, 0.13 + i * 0.002);
    badge.rotation.z = a * 0.6;
    torso.add(badge);
  }
}

function knitting(): THREE.Group {
  const g = new THREE.Group();
  const needleM = mat("#cfcfcf", { metal: 0.7, rough: 0.3 });
  const n1 = cyl(0.006, 0.006, 0.3, needleM, 4);
  n1.rotation.z = 0.9;
  n1.position.set(0.02, 0.06, 0.05);
  const n2 = cyl(0.006, 0.006, 0.3, needleM, 4);
  n2.rotation.z = -0.9;
  n2.position.set(0.02, 0.06, 0.05);
  const swatch = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.13), new THREE.MeshStandardMaterial({ map: knitTexture(), side: THREE.DoubleSide, roughness: 1 }));
  swatch.position.set(0.02, -0.02, 0.05);
  const yarn = ball(0.065, mat("#003399", { rough: 1 }), -0.02, -0.1, -0.04, 1);
  const strand = cyl(0.004, 0.004, 0.14, mat("#003399"), 3);
  strand.position.set(0, -0.06, 0.0);
  strand.rotation.x = 0.6;
  g.add(n1, n2, swatch, yarn, strand);
  return g;
}

function knitTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 72;
  const g = c.getContext("2d")!;
  g.fillStyle = "#003399";
  g.fillRect(0, 0, 96, 72);
  g.strokeStyle = "rgba(255,255,255,0.18)";
  for (let y = 0; y < 72; y += 6) for (let x = 0; x < 96; x += 6) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 3, y + 6);
    g.lineTo(x + 6, y);
    g.stroke();
  }
  g.fillStyle = "#ffcc00";
  g.font = "bold 22px Arial";
  g.textAlign = "center";
  g.fillText("GDPR", 48, 30);
  g.font = "bold 16px Arial";
  g.fillText("★ ★ ★", 48, 56);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function clipboard(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.2, 0.26, 0.015, mat("#8b5a2b"), 0, 0, 0));
  g.add(box(0.17, 0.22, 0.005, mat("#fbfbf5"), 0, -0.01, 0.01));
  g.add(box(0.07, 0.03, 0.02, mat("#aaa", { metal: 0.7 }), 0, 0.12, 0.012));
  for (let i = 0; i < 5; i++) g.add(box(0.12, 0.006, 0.003, mat("#777"), 0, 0.06 - i * 0.035, 0.014));
  g.rotation.x = -Math.PI / 2;
  g.rotation.z = 0;
  g.position.z = 0.12;
  return g;
}

function terminal(color: string): Rig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const beige = mat("#d8cfb0");
  inner.add(box(0.6, 0.58, 0.52, beige, 0, 0, 0));
  inner.add(box(0.5, 0.4, 0.04, mat("#bfb594"), 0, 0.03, 0.265));
  inner.add(box(0.36, 0.05, 0.3, beige, 0, -0.38, 0.02));
  inner.add(box(0.5, 0.06, 0.2, mat("#cfc6a6"), 0, -0.29, 0.25));
  for (let i = 0; i < 6; i++) inner.add(box(0.05, 0.015, 0.04, mat("#8f876c"), -0.15 + i * 0.06, -0.255, 0.26));
  inner.add(box(0.035, 0.12, 0.02, mat("#003399"), 0.0, -0.2, 0.29));
  inner.add(box(0.03, 0.02, 0.02, mat("#c00", { emissive: 0xaa0000 }), 0.22, -0.13, 0.29));
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.35), new THREE.MeshStandardMaterial({ map: textTexture("NON-COMPLIANT", "#fbfbf5", "#333", 128, 150, "bold 13px monospace"), side: THREE.DoubleSide }));
  paper.position.set(0, 0.45, -0.1);
  paper.rotation.x = -0.4;
  inner.add(paper);
  inner.add(box(0.32, 0.02, 0.06, mat("#555"), 0, 0.3, -0.1));

  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(0, 0.03, 0.29);
  inner.add(screen);
  const green = color && color.toLowerCase() !== "#ffffff" ? color : "#33ff66";
  let mood: Mood = "neutral";
  let talk = 0;
  let stampFor = 0;
  let lastKey = "";
  const draw = () => {
    const mouth = Math.round(talk * 4);
    const key = `${mood}|${mouth}|${stampFor > 0}`;
    if (key === lastKey) return;
    lastKey = key;
    g.fillStyle = "#031a08";
    g.fillRect(0, 0, 128, 96);
    g.fillStyle = green;
    if (stampFor > 0) {
      g.font = "bold 22px monospace";
      g.textAlign = "center";
      g.fillText("REFUSÉ", 64, 56);
      tex.needsUpdate = true;
      return;
    }
    const px = (x: number, y: number, w: number, h: number) => g.fillRect(x * 8, y * 8, w * 8, h * 8);
    if (mood === "asleep") {
      px(3, 4, 3, 1);
      px(10, 4, 3, 1);
      g.font = "bold 16px monospace";
      g.fillText("z", 110, 18);
    } else if (mood === "appalled") {
      px(3, 2, 3, 3);
      px(10, 2, 3, 3);
    } else {
      px(4, 3, 2, 2);
      px(10, 3, 2, 2);
    }
    if (mood === "smug") px(4, 8, 8, 1);
    else px(5, 8, 6, 1 + mouth);
    for (let y = 0; y < 96; y += 4) {
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(0, y, 128, 1);
    }
    tex.needsUpdate = true;
  };
  draw();
  const head = new THREE.Object3D();
  head.position.set(0, 0.3, 0);
  inner.add(head);
  return {
    root,
    inner,
    head,
    faceParts: [screen],
    faceMount: { parent: inner, y: 0.03, z: 0.292, size: 0.32 },
    talk(l) { talk = l; },
    stamp() { stampFor = 1.1; },
    mood(m) { mood = m; },
    update(dt, t) {
      if (stampFor > 0) stampFor -= dt;
      inner.position.y = Math.abs(Math.sin(t * 20)) * 0.015 * talk;
      inner.rotation.z = mood === "asleep" ? Math.sin(t * 1.2) * 0.03 : 0;
      draw();
    },
  };
}

function cookie(): Rig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const head = new THREE.Group();
  head.position.y = 0.12;
  inner.add(head);
  const disc = cyl(0.3, 0.3, 0.11, mat("#c68642"), 11);
  disc.rotation.x = Math.PI / 2;
  head.add(disc);
  const chipM = mat("#3b2314");
  const chips: [number, number][] = [[-0.18, 0.12], [0.16, 0.16], [0.2, -0.08], [-0.12, -0.17], [0.03, 0.22], [-0.22, -0.02], [0.1, -0.2]];
  for (const [x, y] of chips) {
    head.add(ball(0.03, chipM, x, y, 0.055, 0));
    head.add(ball(0.025, chipM, -x * 0.9, y * 0.8, -0.055, 0));
  }
  const face = addFace(head, 0.0, 0.065, { spread: 0.08 });
  const torso = new THREE.Group();
  torso.position.y = -0.3;
  inner.add(torso);
  torso.add(box(0.24, 0.24, 0.14, mat("#2b2b33"), 0, 0, 0));
  torso.add(box(0.07, 0.12, 0.01, mat("#f4f4f4"), 0, 0.05, 0.072));
  torso.add(box(0.06, 0.03, 0.015, mat("#c8102e"), 0, 0.1, 0.08));
  inner.add(box(0.07, 0.1, 0.08, mat("#2b2b33"), -0.06, -0.47, 0), box(0.07, 0.1, 0.08, mat("#2b2b33"), 0.06, -0.47, 0));
  const arm = new THREE.Group();
  arm.position.set(0.15, -0.22, 0);
  arm.add(box(0.05, 0.16, 0.05, mat("#2b2b33"), 0, -0.07, 0));
  const st = rubberStamp();
  st.scale.setScalar(0.7);
  st.position.y = -0.18;
  st.rotation.x = Math.PI;
  arm.add(st);
  inner.add(arm);
  const lArm = new THREE.Group();
  lArm.position.set(-0.15, -0.22, 0);
  lArm.add(box(0.05, 0.16, 0.05, mat("#2b2b33"), 0, -0.07, 0));
  const b = briefcase("#3b2314");
  b.scale.setScalar(0.6);
  b.position.y = -0.17;
  lArm.add(b);
  inner.add(lArm);
  const rig = makeRig(root, inner, head, face, arm);
  rig.faceMount = { parent: head, y: 0, z: 0.058, size: 0.36 };
  return rig;
}

export function buildFigure(p: Persona): Rig {
  switch (p.id) {
    case "formblatt":
      return human({
        suit: "#8a8f98",
        trousers: "#7b8088",
        tie: "#5a1a1a",
        glasses: true,
        torsoW: 0.44,
        leftHand: paperStack(),
        face: { brow: "#f0f0f0", browW: 0.075, browH: 0.026, stern: 0.35 },
        hair: (h) => {
          const hm = mat("#e9e9e9");
          h.add(box(0.05, 0.08, 0.16, hm, -0.14, 0.02, -0.02), box(0.05, 0.08, 0.16, hm, 0.14, 0.02, -0.02), box(0.24, 0.06, 0.05, hm, 0, 0.0, -0.14));
          h.add(box(0.11, 0.025, 0.03, hm, 0, -0.025, 0.155));
        },
        extras: (torso) => {
          torso.add(box(0.2, 0.22, 0.02, mat("#6c7078"), 0, 0.02, 0.125));
          torso.add(box(0.36, 0.2, 0.08, mat("#8a8f98"), 0, -0.12, 0.12));
          lanyards(torso, 7);
          const cord = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.004, 3, 10, Math.PI), mat("#222"));
          cord.position.set(0, 0.3, 0.14);
          cord.rotation.z = Math.PI;
          torso.add(cord);
        },
      });
    case "annexe":
      return human({
        suit: "#1f3a68",
        tie: null,
        lips: "#b0122a",
        torsoW: 0.34,
        stretch: [0.94, 1.1, 0.94],
        leftHand: folder("PROPORTIONALITY", "#0f2347"),
        face: { brow: "#1a120c", browW: 0.065, browH: 0.01, stern: 0.45 },
        hair: (h) => {
          const hm = mat("#2a1d15");
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.168, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), hm);
          cap.position.y = 0.01;
          cap.castShadow = true;
          h.add(cap, box(0.34, 0.2, 0.12, hm, 0, -0.06, -0.08), box(0.06, 0.2, 0.18, hm, -0.15, -0.06, 0.0), box(0.06, 0.2, 0.18, hm, 0.15, -0.06, 0.0));
        },
        extras: (torso) => {
          const pearl = mat("#f6f1e7", { rough: 0.2, metal: 0.1 });
          for (let i = 0; i < 9; i++) {
            const a = -Math.PI / 2 + ((i - 4) / 8) * 1.9;
            torso.add(ball(0.016, pearl, Math.cos(a) * 0.075, 0.21 + Math.sin(a) * 0.06, 0.1 + Math.cos(a - -Math.PI / 2) * 0.01, 0));
          }
        },
      });
    case "grandma-gdpr":
      return human({
        suit: "#9c6b8e",
        trousers: "#5b4a6b",
        shirt: "#f5efe0",
        tie: null,
        skirt: true,
        glasses: true,
        torsoW: 0.44,
        scale: 0.88,
        leftHand: knitting(),
        face: { brow: "#bdbdbd", stern: -0.15 },
        hair: (h) => {
          const hm = mat("#c9c9c9");
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.162, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.45), hm);
          cap.position.y = 0.01;
          h.add(cap, ball(0.075, hm, 0, 0.12, -0.11, 1));
        },
        extras: (torso) => {
          for (let i = 0; i < 4; i++) torso.add(ball(0.014, mat("#e7d27a"), 0.07, 0.1 - i * 0.08, 0.125, 0));
          torso.add(box(0.44, 0.04, 0.25, mat("#8a5a7e"), 0, -0.2, 0));
          const shawl = box(0.5, 0.1, 0.28, mat("#d9c9a8", { rough: 1 }), 0, 0.17, 0);
          shawl.rotation.x = 0.08;
          torso.add(shawl, box(0.12, 0.12, 0.02, mat("#d9c9a8"), 0, 0.08, 0.14));
          torso.add(box(0.1, 0.06, 0.02, mat("#7a4a6e"), -0.12, -0.08, 0.125));
        },
      });
    case "de-vries":
      return human({
        suit: "#2f343b",
        tie: "#1c1c1c",
        torsoW: 0.46,
        leftHand: clipboard(),
        face: { brow: "#2a1d10", browW: 0.07, browH: 0.02, stern: 0.5 },
        hair: (h) => {
          const capM = mat("#1d1f22");
          h.add(box(0.31, 0.09, 0.31, capM, 0, 0.12, -0.01), box(0.26, 0.02, 0.12, capM, 0, 0.085, 0.17));
          const capPatch = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), new THREE.MeshBasicMaterial({ map: textTexture("CSIRT", "#1d1f22", "#ffcc00", 128, 48, "bold 30px Arial") }));
          capPatch.position.set(0, 0.125, 0.146);
          h.add(capPatch);
          h.add(box(0.03, 0.05, 0.03, mat("#111"), 0.155, 0.0, 0.02));
          const shades = box(0.2, 0.045, 0.02, mat("#0a0a0a", { metal: 0.6, rough: 0.2 }), 0, 0.04, 0.162);
          h.add(shades);
        },
        extras: (torso) => {
          torso.add(box(0.43, 0.32, 0.27, mat("#1d1f22"), 0, -0.02, 0));
          for (const x of [-0.12, 0, 0.12]) torso.add(box(0.09, 0.08, 0.04, mat("#2b2e33"), x, -0.1, 0.15));
          const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshBasicMaterial({ map: textTexture("NIS2", "#ffcc00", "#111", 128, 48, "bold 34px Arial") }));
          patch.position.set(0, 0.07, 0.137);
          torso.add(patch);
          torso.add(box(0.03, 0.09, 0.03, mat("#111"), -0.17, 0.1, 0.14));
          torso.add(box(0.48, 0.05, 0.28, mat("#111"), 0, -0.19, 0));
          for (const x of [-0.17, 0.17]) torso.add(box(0.07, 0.07, 0.05, mat("#3b4a2f"), x, -0.19, 0.15));
          torso.add(box(0.1, 0.06, 0.29, mat("#1d1f22"), -0.2, 0.17, 0), box(0.1, 0.06, 0.29, mat("#1d1f22"), 0.2, 0.17, 0));
        },
      });
    case "auditor-9000":
      return terminal(p.color);
    case "the-cookie":
      return cookie();
    default:
      return human({
        suit: p.color || "#003399",
        glasses: true,
        hair: (h) => h.add(box(0.27, 0.06, 0.27, mat("#3a2a1a"), 0, 0.12, -0.01)),
        extras: (torso) => lanyards(torso, 2),
      });
  }
}
