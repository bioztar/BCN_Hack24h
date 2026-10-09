export interface Bust {
  setTalking(talking: boolean): void;
  dispose(): void;
}

/** GLB bust with a slow idle sway and a nod while talking. Rejects if anything fails. */
export async function mountBust(host: HTMLElement, url: string): Promise<Bust> {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(url);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.15, 4.2);

  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.scale.setScalar(2 / Math.max(size.x, size.y, size.z, 1e-3));
  scene.add(pivot);

  host.append(renderer.domElement);
  const resize = () => {
    const w = host.clientWidth || 300;
    const hgt = host.clientHeight || 300;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let talking = false;
  let raf = 0;
  const t0 = performance.now();
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    pivot.rotation.y = Math.sin(t * 0.35) * 0.55;
    const nod = talking ? Math.sin(t * 9) * 0.06 + Math.sin(t * 2.3) * 0.03 : 0;
    pivot.rotation.x += (nod - pivot.rotation.x) * 0.25;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();

  return {
    setTalking: (b) => void (talking = b),
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as InstanceType<typeof THREE.Mesh>;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mat) => mat.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
