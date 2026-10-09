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
}

function addFace(parent: THREE.Object3D, y: number, z: number, opts: { lips?: string; spread?: number; eyeColor?: string } = {}): Face {
  const s = opts.spread ?? 0.055;
  const eyeM = mat(opts.eyeColor ?? "#1a1a1a");
  const eyes = [box(0.035, 0.035, 0.02, eyeM, -s, y + 0.04, z), box(0.035, 0.035, 0.02, eyeM, s, y + 0.04, z)];
  const mouth = box(0.07, 0.02, 0.02, mat(opts.lips ?? "#5b2a2a"), 0, y - 0.045, z);
  parent.add(...eyes, mouth);
  return { eyes, mouth };
}

function glasses(parent: THREE.Object3D, y: number, z: number, spread = 0.055): void {
  const m = mat("#222", { metal: 0.5, rough: 0.4 });
  for (const x of [-spread, spread]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 4, 10), m);
    ring.position.set(x, y, z);
    parent.add(ring);
  }
  parent.add(box(0.04, 0.008, 0.008, m, 0, y, z));
}

interface HumanOpts {
  suit: string;
  trousers?: string;
  shirt?: string;
  tie?: string | null;
  hair: (head: THREE.Group) => void;
  glasses?: boolean;
  lips?: string;
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
  };
  return {
    root,
    inner,
    head,
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
  const face = addFace(head, 0.0, 0.14, { lips: o.lips });
  if (o.glasses) glasses(head, 0.04, 0.158);
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
  return makeRig(root, inner, head, face, rArm);
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

function cookieBanner(): THREE.Group {
  const g = new THREE.Group();
  const yarn = ball(0.06, mat("#c68642"), 0.04, -0.03, 0, 1);
  const needleM = mat("#cfcfcf", { metal: 0.7, rough: 0.3 });
  const n1 = cyl(0.006, 0.006, 0.26, needleM, 4);
  n1.rotation.z = 0.7;
  const n2 = cyl(0.006, 0.006, 0.26, needleM, 4);
  n2.rotation.z = -0.7;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshStandardMaterial({ map: textTexture("ACCEPT ALL", "#f2e6c9", "#7a4b1f", 128, 48, "bold 22px Arial"), side: THREE.DoubleSide }));
  banner.position.set(-0.02, 0.07, 0.04);
  g.add(yarn, n1, n2, banner);
  return g;
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
  return makeRig(root, inner, head, face, arm);
}

export function buildFigure(p: Persona): Rig {
  switch (p.id) {
    case "formblatt":
      return human({
        suit: "#8a8f98",
        trousers: "#7b8088",
        tie: "#5a1a1a",
        glasses: true,
        hair: (h) => {
          const hm = mat("#e9e9e9");
          h.add(box(0.05, 0.08, 0.16, hm, -0.14, 0.02, -0.02), box(0.05, 0.08, 0.16, hm, 0.14, 0.02, -0.02), box(0.24, 0.06, 0.05, hm, 0, 0.0, -0.14));
          h.add(box(0.1, 0.02, 0.02, mat("#e9e9e9"), -0.06, 0.1, 0.13), box(0.1, 0.02, 0.02, mat("#e9e9e9"), 0.06, 0.1, 0.13));
        },
        extras: (torso) => {
          torso.add(box(0.2, 0.22, 0.02, mat("#6c7078"), 0, 0.02, 0.125));
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
        torsoW: 0.36,
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
        scale: 0.9,
        leftHand: cookieBanner(),
        hair: (h) => {
          const hm = mat("#c9c9c9");
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.162, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.45), hm);
          cap.position.y = 0.01;
          h.add(cap, ball(0.075, hm, 0, 0.12, -0.11, 1));
        },
        extras: (torso) => {
          for (let i = 0; i < 4; i++) torso.add(ball(0.014, mat("#e7d27a"), 0.07, 0.1 - i * 0.08, 0.125, 0));
          torso.add(box(0.44, 0.04, 0.25, mat("#8a5a7e"), 0, -0.2, 0));
        },
      });
    case "de-vries":
      return human({
        suit: "#2f343b",
        tie: "#1c1c1c",
        leftHand: clipboard(),
        hair: (h) => {
          h.add(box(0.27, 0.06, 0.27, mat("#3a2a1a"), 0, 0.11, -0.01));
          h.add(box(0.03, 0.05, 0.03, mat("#111"), 0.155, 0.0, 0.02));
        },
        extras: (torso) => {
          torso.add(box(0.43, 0.32, 0.27, mat("#1d1f22"), 0, -0.02, 0));
          for (const x of [-0.12, 0, 0.12]) torso.add(box(0.09, 0.08, 0.04, mat("#2b2e33"), x, -0.1, 0.15));
          const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshBasicMaterial({ map: textTexture("NIS2", "#ffcc00", "#111", 128, 48, "bold 34px Arial") }));
          patch.position.set(0, 0.07, 0.137);
          torso.add(patch);
          torso.add(box(0.03, 0.09, 0.03, mat("#111"), -0.17, 0.1, 0.14));
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

/** Replaces the procedural look with a GLB when one exists; silently keeps procedural otherwise. */
export async function tryLoadModel(rig: Rig, url: string): Promise<boolean> {
  try {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;
    const bb = new THREE.Box3().setFromObject(model);
    const size = bb.getSize(new THREE.Vector3());
    const s = 0.92 / Math.max(size.y, 1e-3);
    model.scale.setScalar(s);
    const c = bb.getCenter(new THREE.Vector3()).multiplyScalar(s);
    model.position.sub(c);
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    for (const child of [...rig.inner.children]) child.visible = false;
    rig.inner.add(model);
    return true;
  } catch {
    return false;
  }
}
