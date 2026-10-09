import * as THREE from "three";
import type * as CANNON from "cannon-es";
import { tryApplyCutout } from "./cutout";
import { buildFigure, kindFor, tryLoadModel, type Rig } from "./figures";
import { PocketWorld, type StepResult } from "./physics";
import type { Persona } from "./types";

const BOX_H = 3.6;
const BOX_D = 1.0;
const FOV = 38;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function euStars(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number): void {
  g.fillStyle = "#ffcc00";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const b = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? s * 0.42 : s;
      g.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr);
    }
    g.fill();
  }
}

function backWall(ticket: () => number): THREE.CanvasTexture {
  return canvasTex(512, 1024, (g) => {
    g.fillStyle = "#e6e2d3";
    g.fillRect(0, 0, 512, 1024);
    g.fillStyle = "#d6d1bf";
    for (let y = 0; y < 1024; y += 48) g.fillRect(0, y, 512, 2);
    g.fillStyle = "#b9b39c";
    g.fillRect(0, 760, 512, 14);
    g.fillStyle = "#003399";
    g.fillRect(56, 90, 220, 148);
    euStars(g, 166, 164, 48, 9);
    g.fillStyle = "#fff";
    g.fillRect(300, 90, 160, 70);
    g.fillStyle = "#003399";
    g.font = "bold 22px Arial";
    g.fillText("DG ROAST", 318, 122);
    g.font = "16px Arial";
    g.fillText("Unit C.4 · Pocket", 318, 146);
    g.fillStyle = "#222";
    g.fillRect(300, 190, 160, 70);
    g.fillStyle = "#ff3b30";
    g.font = "bold 40px monospace";
    g.fillText(String(ticket()).padStart(4, "0"), 320, 240);
    g.fillStyle = "#fff";
    g.font = "12px Arial";
    g.fillText("NOW SERVING", 334, 206);
    g.fillStyle = "#fffef6";
    g.fillRect(80, 330, 340, 300);
    g.fillStyle = "#333";
    g.font = "bold 20px Arial";
    g.fillText("ORGANIGRAMME", 170, 362);
    g.strokeStyle = "#555";
    g.lineWidth = 2;
    const nodes: [number, number][] = [[250, 400], [160, 470], [340, 470], [110, 540], [210, 540], [290, 540], [390, 540], [250, 600]];
    for (const [x, y] of nodes) g.strokeRect(x - 34, y - 14, 68, 28);
    for (const [a, b] of [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6], [6, 7], [3, 7]] as const) {
      g.beginPath();
      g.moveTo(nodes[a]![0], nodes[a]![1] + 14);
      g.lineTo(nodes[b]![0], nodes[b]![1] - 14);
      g.stroke();
    }
    g.fillStyle = "#c8102e";
    g.font = "bold 13px Arial";
    g.fillText("(you are not on it)", 186, 625);
    g.fillStyle = "#fffef6";
    g.beginPath();
    g.arc(410, 700, 36, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#222";
    g.lineWidth = 4;
    g.stroke();
    g.beginPath();
    g.moveTo(410, 700);
    g.lineTo(410, 674);
    g.moveTo(410, 700);
    g.lineTo(428, 708);
    g.stroke();
    g.fillStyle = "#333";
    g.font = "bold 18px Arial";
    g.fillText("PLEASE WAIT TO BE REFUSED", 110, 880);
  });
}

function floorTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? "#7d8796" : "#9aa3b0";
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  });
}

function sideTex(left: boolean): THREE.CanvasTexture {
  return canvasTex(256, 512, (g) => {
    g.fillStyle = "#dcd7c4";
    g.fillRect(0, 0, 256, 512);
    if (left) {
      g.fillStyle = "#8a6a4a";
      g.fillRect(60, 180, 140, 300);
      g.fillStyle = "#fff";
      g.fillRect(80, 200, 100, 40);
      g.fillStyle = "#2e8b57";
      g.font = "bold 18px Arial";
      g.fillText("EXIT*", 104, 228);
      g.fillStyle = "#333";
      g.font = "11px Arial";
      g.fillText("*subject to approval", 72, 500);
    } else {
      g.fillStyle = "#b08a5a";
      g.fillRect(40, 100, 180, 220);
      const forms = ["#fff", "#ffeb99", "#cfe8ff", "#fff", "#ffd1d1"];
      forms.forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect(55 + (i % 3) * 55, 115 + Math.floor(i / 3) * 95, 46, 70);
      });
      g.fillStyle = "#5c6370";
      g.fillRect(60, 360, 140, 150);
      g.fillStyle = "#454b55";
      for (let i = 0; i < 3; i++) g.fillRect(70, 370 + i * 46, 120, 36);
    }
  });
}

const FORMS = ["FORM M-50", "ANNEX IV", "DECLARATION OF CONFORMITY", "FORM T-1", "APPEAL (REJECTED)", "CONSENT 7/7"];

function paperTex(i: number): THREE.CanvasTexture {
  return canvasTex(128, 176, (g) => {
    g.fillStyle = i % 4 === 3 ? "#fff3b0" : "#fbfbf5";
    g.fillRect(0, 0, 128, 176);
    g.fillStyle = "#003399";
    g.fillRect(0, 0, 128, 18);
    g.fillStyle = "#111";
    g.font = "bold 11px Arial";
    g.fillText(FORMS[i % FORMS.length]!, 8, 34);
    g.fillStyle = "#999";
    for (let y = 48; y < 160; y += 12) g.fillRect(8, y, 60 + ((y * 7 + i * 13) % 50), 3);
    if (i % 3 === 0) {
      g.strokeStyle = "rgba(200,16,46,0.8)";
      g.lineWidth = 3;
      g.save();
      g.translate(70, 120);
      g.rotate(-0.3);
      g.strokeRect(-36, -14, 72, 28);
      g.fillStyle = "rgba(200,16,46,0.8)";
      g.font = "bold 15px Arial";
      g.fillText("REFUSÉ", -28, 6);
      g.restore();
    }
  });
}

function zTexture(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = "#fbfbf5";
    g.beginPath();
    g.moveTo(6, 10);
    g.lineTo(58, 4);
    g.lineTo(60, 56);
    g.lineTo(4, 60);
    g.closePath();
    g.fill();
    g.strokeStyle = "#bbb";
    g.stroke();
    g.fillStyle = "#003399";
    g.font = "bold 44px Arial";
    g.textAlign = "center";
    g.fillText("Z", 32, 48);
  });
}

interface Actor { persona: Persona; rig: Rig; body: CANNON.Body; }
interface Zzz { sprite: THREE.Sprite; age: number; }

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  readonly physics = new PocketWorld(2, BOX_H, BOX_D);
  readonly actors = new Map<string, Actor>();
  private room = new THREE.Group();
  private paperMeshes: THREE.Mesh[] = [];
  private zzz: Zzz[] = [];
  private zTex = zTexture();
  private ray = new THREE.Raycaster();
  private wallTex: THREE.CanvasTexture | null = null;
  ticket = 4812;
  private t = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color("#0b1d4d");
    this.scene.add(new THREE.HemisphereLight("#fffbe8", "#5a6170", 1.4));
    const key = new THREE.DirectionalLight("#ffffff", 1.6);
    key.position.set(0.8, 2.2, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -2; sc.right = 2; sc.top = 2.5; sc.bottom = -2.5; sc.near = 0.5; sc.far = 8;
    key.shadow.bias = -0.002;
    this.scene.add(key);
    this.scene.add(this.room);
    this.physics.addPapers(10, 3);
    this.paperMeshes = this.physics.papers.map((_, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.012), [
        new THREE.MeshStandardMaterial({ color: "#eee" }), new THREE.MeshStandardMaterial({ color: "#eee" }),
        new THREE.MeshStandardMaterial({ color: "#eee" }), new THREE.MeshStandardMaterial({ color: "#eee" }),
        new THREE.MeshStandardMaterial({ map: paperTex(i), roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: "#f4f4ee", roughness: 0.9 }),
      ]);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    });
    this.resize();
  }

  resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    const aspect = w / h;
    const boxW = BOX_H * aspect;
    this.physics.resize(boxW, BOX_H, BOX_D);
    this.camera.aspect = aspect;
    this.camera.position.set(0, 0, BOX_H / 2 / Math.tan(((FOV / 2) * Math.PI) / 180) + 0.02);
    this.camera.lookAt(0, 0, -BOX_D / 2);
    this.camera.updateProjectionMatrix();
    this.buildRoom(boxW);
  }

  private buildRoom(w: number): void {
    for (const c of [...this.room.children]) {
      this.room.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
    }
    const H = BOX_H;
    const D = BOX_D;
    this.wallTex ??= backWall(() => this.ticket);
    const plane = (pw: number, ph: number, mat: THREE.Material, pos: [number, number, number], rot: [number, number, number]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
      m.position.set(...pos);
      m.rotation.set(...rot);
      m.receiveShadow = true;
      this.room.add(m);
    };
    plane(w, H, new THREE.MeshStandardMaterial({ map: this.wallTex, roughness: 0.95 }), [0, 0, -D], [0, 0, 0]);
    const ft = floorTex();
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    ft.repeat.set(w * 1.2, D * 1.2);
    plane(w, D, new THREE.MeshStandardMaterial({ map: ft, roughness: 0.6 }), [0, -H / 2, -D / 2], [-Math.PI / 2, 0, 0]);
    plane(w, D, new THREE.MeshStandardMaterial({ color: "#f2f0e8", emissive: new THREE.Color("#fffbe0"), emissiveIntensity: 0.25 }), [0, H / 2, -D / 2], [Math.PI / 2, 0, 0]);
    plane(D, H, new THREE.MeshStandardMaterial({ map: sideTex(true), roughness: 0.95 }), [-w / 2, 0, -D / 2], [0, Math.PI / 2, 0]);
    plane(D, H, new THREE.MeshStandardMaterial({ map: sideTex(false), roughness: 0.95 }), [w / 2, 0, -D / 2], [0, -Math.PI / 2, 0]);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.02, 0.3), new THREE.MeshBasicMaterial({ color: "#fffdf2" }));
    lamp.position.set(0, H / 2 - 0.011, -D / 2);
    this.room.add(lamp);
  }

  setTicket(n: number): void {
    this.ticket = n;
    if (this.wallTex) {
      const old = this.wallTex;
      this.wallTex = backWall(() => this.ticket);
      this.buildRoom(this.physics.w);
      old.dispose();
    }
  }

  addActor(p: Persona, dropIn = false): Actor {
    this.removeActor(p.id);
    const rig = buildFigure(p);
    const at = dropIn ? { x: (Math.random() - 0.5) * 0.6, y: BOX_H / 2 - 0.5, z: -BOX_D / 2 } : { x: 0, y: -0.6, z: -BOX_D / 2 };
    const fig = this.physics.addFigure(p.id, kindFor(p.id), at);
    this.scene.add(rig.root);
    const actor = { persona: p, rig, body: fig.body };
    this.actors.set(p.id, actor);
    void tryApplyCutout(rig, p.id);
    if (p.model3d) void tryLoadModel(rig, p.model3d);
    return actor;
  }

  removeActor(id: string): void {
    const a = this.actors.get(id);
    if (!a) return;
    this.scene.remove(a.rig.root);
    this.physics.removeFigure(id);
    this.actors.delete(id);
  }

  /** Persona id under a screen point, if any. */
  pick(clientX: number, clientY: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    let best: { id: string; d: number } | null = null;
    for (const [id, a] of this.actors) {
      const hit = this.ray.intersectObject(a.rig.root, true)[0];
      if (hit && (!best || hit.distance < best.d)) best = { id, d: hit.distance };
    }
    return best?.id ?? null;
  }

  sleepZ(id: string): void {
    const a = this.actors.get(id);
    if (!a) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.zTex, transparent: true }));
    a.rig.head.getWorldPosition(s.position);
    s.position.z = Math.min(s.position.z + 0.2, -0.1);
    s.scale.setScalar(0.12);
    this.scene.add(s);
    this.zzz.push({ sprite: s, age: 0 });
  }

  step(dt: number): StepResult {
    this.t += dt;
    const res = this.physics.step(dt);
    for (const a of this.actors.values()) {
      a.rig.root.position.set(a.body.position.x, a.body.position.y, a.body.position.z);
      a.rig.root.quaternion.set(a.body.quaternion.x, a.body.quaternion.y, a.body.quaternion.z, a.body.quaternion.w);
      a.rig.update(dt, this.t);
    }
    this.physics.papers.forEach((b, i) => {
      const m = this.paperMeshes[i]!;
      m.position.set(b.position.x, b.position.y, b.position.z);
      m.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    });
    for (const z of this.zzz) {
      z.age += dt;
      z.sprite.position.y += dt * 0.35;
      z.sprite.position.x += Math.sin(z.age * 3) * dt * 0.15;
      z.sprite.scale.setScalar(0.12 + z.age * 0.08);
      (z.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - z.age / 2.4);
      z.sprite.material.rotation = Math.sin(z.age * 2) * 0.3;
    }
    this.zzz = this.zzz.filter((z) => {
      if (z.age < 2.4) return true;
      this.scene.remove(z.sprite);
      z.sprite.material.dispose();
      return false;
    });
    this.renderer.render(this.scene, this.camera);
    return res;
  }

  /** A front-facing portrait of a persona, for the pick screen. */
  static thumbnails(personas: Persona[], size = 220): Map<string, string> {
    const out = new Map<string, string>();
    let r: THREE.WebGLRenderer;
    try {
      r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      return out;
    }
    r.setPixelRatio(1);
    r.setSize(size, size, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#667", 1.6));
    const d = new THREE.DirectionalLight("#fff", 1.6);
    d.position.set(1, 2, 3);
    scene.add(d);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    cam.position.set(0.35, 0.15, 2.2);
    cam.lookAt(0, 0, 0);
    for (const p of personas) {
      const rig = buildFigure(p);
      rig.root.rotation.y = -0.3;
      scene.add(rig.root);
      r.render(scene, cam);
      out.set(p.id, r.domElement.toDataURL("image/png"));
      scene.remove(rig.root);
    }
    r.dispose();
    r.forceContextLoss();
    return out;
  }
}
