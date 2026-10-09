import { sleep } from "../dom";

/** Procedural three.js rubber stamp that slams onto the screen. No assets. */
interface StampScene {
  slam(text: string, onImpact: () => void): Promise<void>;
}

let scene: Promise<StampScene | null> | null = null;
let chain: Promise<void> = Promise.resolve();

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

async function build(): Promise<StampScene | null> {
  try {
    const THREE = await import("three");
    const canvas = document.createElement("canvas");
    canvas.className = "stamp-canvas";
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.append(canvas);

    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xfff4e0, 0x223355, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(3, 8, 5);
    s.add(sun);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 9, 10);
    camera.lookAt(0, 0, 0);

    const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.55 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.5 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x9b1c1c, roughness: 0.9 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x8a1111, roughness: 0.25, metalness: 0.1 });

    const label = document.createElement("canvas");
    label.width = 1024;
    label.height = 160;
    const tex = new THREE.CanvasTexture(label);
    tex.colorSpace = THREE.SRGBColorSpace;
    const drawLabel = (text: string) => {
      const g = label.getContext("2d")!;
      g.fillStyle = "#e9dcc0";
      g.fillRect(0, 0, label.width, label.height);
      g.strokeStyle = "#003399";
      g.lineWidth = 10;
      g.strokeRect(8, 8, label.width - 16, label.height - 16);
      g.fillStyle = "#003399";
      g.font = "bold 64px Arial, Helvetica, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(`DG ROAST · ${text}`, label.width / 2, label.height / 2 + 4, label.width - 60);
      tex.needsUpdate = true;
    };

    const stamp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 1.8), wood);
    stamp.add(base);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.2, 1.7), rubber);
    pad.position.y = -0.4;
    stamp.add(pad);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    plate.position.set(0, 0, 0.901);
    stamp.add(plate);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 1.3, 32), darkWood);
    neck.position.y = 0.95;
    stamp.add(neck);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.08, 12, 32), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.3 }));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.55;
    stamp.add(collar);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 24), knobMat);
    knob.scale.set(1, 0.78, 1);
    knob.position.y = 2.15;
    stamp.add(knob);
    s.add(stamp);

    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const sg = shadowCanvas.getContext("2d")!;
    const grad = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.52;
    s.add(shadow);

    const resize = () => {
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };
    addEventListener("resize", resize);
    resize();

    return {
      async slam(text, onImpact) {
        drawLabel(text);
        stamp.position.x = (Math.random() - 0.5) * 2.5;
        stamp.position.z = (Math.random() - 0.5) * 1.2;
        shadow.position.x = stamp.position.x;
        shadow.position.z = stamp.position.z;
        const spin = (Math.random() - 0.5) * 0.5;
        canvas.style.opacity = "1";
        canvas.classList.add("on");
        const fall = 300;
        const hold = 700;
        const lift = 1100;
        const t0 = performance.now();
        let impacted = false;
        await new Promise<void>((done) => {
          const frame = () => {
            const t = performance.now() - t0;
            let y: number;
            let squash = 1;
            if (t < fall) {
              const k = t / fall;
              y = 7 - 6.48 * k * k;
              stamp.rotation.z = 0.35 * (1 - k);
              stamp.rotation.y = spin * (1 - k);
            } else if (t < hold) {
              y = 0.52;
              if (!impacted) {
                impacted = true;
                onImpact();
              }
              squash = t < fall + 90 ? 0.88 : 1;
              stamp.rotation.set(0, 0, 0);
            } else {
              const k = Math.min(1, (t - hold) / (lift - hold));
              y = 0.52 + 7 * (1 - (1 - k) * (1 - k));
              canvas.style.opacity = String(1 - Math.max(0, (k - 0.6) / 0.4));
            }
            stamp.position.y = y;
            stamp.scale.set(1, squash, 1);
            const near = Math.max(0, 1 - (y - 0.52) / 6.5);
            shadow.scale.setScalar(0.5 + near * 0.6);
            (shadow.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = 0.2 + near * 0.8;
            renderer.render(s, camera);
            if (t < lift) requestAnimationFrame(frame);
            else done();
          };
          requestAnimationFrame(frame);
        });
        canvas.classList.remove("on");
      },
    };
  } catch (err) {
    console.warn("[stamp3d] WebGL unavailable, 2D stamp only", err);
    return null;
  }
}

/** Slams are serialised; without WebGL (or with reduced motion) only the impact fires. */
export function slam(text: string, onImpact: () => void): Promise<void> {
  const run = async () => {
    if (reduced()) {
      onImpact();
      return;
    }
    scene ??= build();
    const sc = await scene;
    if (sc) await sc.slam(text, onImpact);
    else {
      await sleep(200);
      onImpact();
      await sleep(400);
    }
  };
  chain = chain.then(run, run);
  return chain;
}
