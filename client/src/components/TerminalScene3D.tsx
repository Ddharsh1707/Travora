import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Live 3D wallpaper used behind the landing intro and the sign-in page: an
 * oil and gas terminal at night, of the kind Mahathi Infra Services builds.
 * Storage tanks, an LPG sphere, a pumpjack, a pipe rack and a flare push up
 * out of the ground with a glowing ripple, the tanks fill, product flows
 * through the pipes, steam drifts, tanker trucks drive past and roof lights
 * blink. Tanks at the back of the yard keep sinking and rising again so the
 * scene never stops moving. The camera flies in on load, then circles slowly
 * like a looping film, follows the mouse a little and tilts as the page
 * scrolls. Rendering stops while the scene is off screen.
 *
 * `shift` moves the plant sideways on wide screens (negative = to the right).
 *
 * `onFail` is called when WebGL is not available so the page can fall back
 * to the flat drawing.
 */

const AMBER = 0xf2a93b;
const TEAL = 0x1ba39c;
const STEEL = 0x8796a0;
const GRAPHITE = 0x0b1319;

type Rising = { obj: THREE.Object3D; delay: number; baseY?: number; depth?: number; ripple?: THREE.Mesh; cycle?: number };
type Fill = { mesh: THREE.Mesh; ring: THREE.Mesh; height: number; level: number; base: number; delay: number };
type Flow = { curve: THREE.Curve<THREE.Vector3>; dots: THREE.Mesh[]; speed: number };

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 4);

/** Soft round sprite used for dust, steam and glows. */
function softDot(inner = "rgba(255,255,255,1)") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.4, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function TerminalScene3D({
  className = "",
  onFail,
  reduceMotion = false,
  shift = -0.21,
}: {
  className?: string;
  onFail?: () => void;
  reduceMotion?: boolean;
  shift?: number;
}) {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      onFail?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    // Everything below ground level is cut away, so structures can rise out of the ground.
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.02)];
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.setAttribute("aria-hidden", "true");

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(GRAPHITE, 24, 64);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

    // Lights: cool sky, warm key from the left, teal rim from behind.
    scene.add(new THREE.HemisphereLight(0xcfe3ea, 0x0b1319, 0.9));
    const key = new THREE.DirectionalLight(0xffe1b0, 2.2);
    key.position.set(-10, 16, 10);
    scene.add(key);
    const rim = new THREE.PointLight(TEAL, 60, 40, 1.6);
    rim.position.set(8, 6, -10);
    scene.add(rim);
    const glow = new THREE.PointLight(AMBER, 30, 22, 1.8);
    glow.position.set(-2, 3, 4);
    scene.add(glow);

    const disposables: Array<{ dispose: () => void }> = [];
    const keep = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };

    // Ground: drawing grid that fades into the fog.
    const grid = new THREE.GridHelper(80, 80, 0x2c4250, 0x15232d);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    scene.add(grid);
    keep(grid.geometry);
    keep(grid.material as THREE.Material);
    const pad = new THREE.Mesh(keep(new THREE.PlaneGeometry(22, 13)), keep(new THREE.MeshStandardMaterial({ color: 0x15232d, roughness: 0.95, metalness: 0.1, transparent: true, opacity: 0.85 })));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0.5, 0.01, 0);
    scene.add(pad);
    const padEdge = new THREE.LineSegments(keep(new THREE.EdgesGeometry(pad.geometry)), keep(new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.35 })));
    padEdge.rotation.x = -Math.PI / 2;
    padEdge.position.copy(pad.position).setY(0.02);
    scene.add(padEdge);

    const steel = keep(new THREE.MeshStandardMaterial({ color: 0xc9d3d8, metalness: 0.75, roughness: 0.32 }));
    const darkSteel = keep(new THREE.MeshStandardMaterial({ color: 0x4a6170, metalness: 0.6, roughness: 0.45 }));
    const amberGlow = keep(new THREE.MeshStandardMaterial({ color: AMBER, emissive: AMBER, emissiveIntensity: 1.4, roughness: 0.4 }));
    const product = keep(new THREE.MeshStandardMaterial({ color: AMBER, emissive: AMBER, emissiveIntensity: 0.55, transparent: true, opacity: 0.55, roughness: 0.3 }));
    const pipeMat = keep(new THREE.MeshStandardMaterial({ color: 0x7a8e9b, metalness: 0.7, roughness: 0.35 }));
    const tealMat = keep(new THREE.MeshStandardMaterial({ color: TEAL, emissive: TEAL, emissiveIntensity: 0.9 }));

    const rising: Rising[] = [];
    const fills: Fill[] = [];
    const soft = keep(softDot());
    const rippleGeo = keep(new THREE.RingGeometry(0.86, 1, 64));

    // A glowing ring on the ground where a structure breaks through.
    function ripple(x: number, z: number, r: number) {
      const m = new THREE.Mesh(rippleGeo, keep(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.04, z);
      m.scale.setScalar(r);
      m.userData.r = r;
      m.visible = false;
      scene.add(m);
      return m;
    }

    // Spiral stair up the side of a tank, with an outer handrail.
    function helix(r: number, h: number, turns: number, start: number) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const u = i / 60;
        const a = start + u * turns * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, u * h, Math.sin(a) * r));
      }
      return new THREE.CatmullRomCurve3(pts);
    }

    const blinkers: THREE.Mesh[] = [];
    const postGeo = keep(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 4));

    // Storage tanks: a steel shell (open wireframe so the level shows), a cone roof, a level ring.
    function tank(x: number, z: number, r: number, h: number, level: number, delay: number) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const shell = new THREE.Mesh(keep(new THREE.CylinderGeometry(r, r, h, 48, 1, true)), keep(new THREE.MeshStandardMaterial({ color: 0xd6dee2, metalness: 0.7, roughness: 0.3, transparent: true, opacity: 0.32, side: THREE.DoubleSide })));
      shell.position.y = h / 2;
      g.add(shell);
      const bands = new THREE.LineSegments(keep(new THREE.EdgesGeometry(keep(new THREE.CylinderGeometry(r, r, h, 24, 4, true)), 1)), keep(new THREE.LineBasicMaterial({ color: STEEL, transparent: true, opacity: 0.6 })));
      bands.position.y = h / 2;
      g.add(bands);
      const roof = new THREE.Mesh(keep(new THREE.ConeGeometry(r * 1.02, r * 0.35, 48)), steel);
      roof.position.y = h + r * 0.175;
      g.add(roof);
      const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.12, 48)), darkSteel);
      base.position.y = 0.06;
      g.add(base);
      // spiral stair, roof handrail with posts, and a roof beacon
      const stair = new THREE.Mesh(keep(new THREE.TubeGeometry(helix(r * 1.04, h, 0.3, 2.2), 60, 0.045, 5)), pipeMat);
      g.add(stair);
      const rail = new THREE.Mesh(keep(new THREE.TubeGeometry(helix(r * 1.1, h + 0.3, 0.3, 2.2), 60, 0.02, 4)), pipeMat);
      g.add(rail);
      const roofRail = new THREE.Mesh(keep(new THREE.TorusGeometry(r * 0.98, 0.025, 6, 64)), pipeMat);
      roofRail.rotation.x = Math.PI / 2;
      roofRail.position.y = h + 0.32;
      g.add(roofRail);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const post = new THREE.Mesh(postGeo, pipeMat);
        post.position.set(Math.cos(a) * r * 0.98, h + 0.16, Math.sin(a) * r * 0.98);
        g.add(post);
      }
      const beacon = new THREE.Mesh(keep(new THREE.SphereGeometry(0.09, 8, 6)), amberGlow);
      beacon.position.y = h + r * 0.35 + 0.08;
      g.add(beacon);
      blinkers.push(beacon);
      const fill = new THREE.Mesh(keep(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 1, 48)), product);
      fill.scale.y = 0.001;
      fill.position.y = 0.12;
      g.add(fill);
      const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(r * 0.99, 0.035, 8, 64)), amberGlow);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      g.add(ring);
      scene.add(g);
      rising.push({ obj: g, delay, ripple: ripple(x, z, r * 1.5) });
      fills.push({ mesh: fill, ring, height: h - 0.2, level, base: 0.12, delay: delay + 0.6 });
      return g;
    }

    tank(-5.6, 1.2, 2.0, 3.6, 0.68, 0.35);
    tank(-0.9, 2.6, 1.6, 3.0, 0.42, 0.5);
    tank(-2.4, -2.6, 1.4, 2.6, 0.82, 0.65);

    // LPG sphere on legs.
    const sphere = new THREE.Group();
    sphere.position.set(5.2, 0, -0.6);
    const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(1.9, 48, 32)), steel);
    ball.position.y = 3.3;
    sphere.add(ball);
    const equator = new THREE.Mesh(keep(new THREE.TorusGeometry(1.92, 0.05, 8, 64)), amberGlow);
    equator.rotation.x = Math.PI / 2;
    equator.position.y = 3.3;
    sphere.add(equator);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.11, 3.3, 8)), darkSteel);
      leg.position.set(Math.cos(a) * 1.55, 1.65, Math.sin(a) * 1.55);
      sphere.add(leg);
    }
    scene.add(sphere);
    // ladder up to the sphere's top platform
    const ladder = new THREE.Mesh(keep(new THREE.TubeGeometry(helix(2.05, 5.1, 0.35, 2.2), 60, 0.045, 5)), darkSteel);
    sphere.add(ladder);
    const topDeck = new THREE.Mesh(keep(new THREE.TorusGeometry(0.55, 0.03, 6, 32)), pipeMat);
    topDeck.rotation.x = Math.PI / 2;
    topDeck.position.y = 5.4;
    sphere.add(topDeck);
    rising.push({ obj: sphere, delay: 0.8, ripple: ripple(5.2, -0.6, 2.8) });

    // Small pump house and flare stack for scale.
    const house = new THREE.Mesh(keep(new THREE.BoxGeometry(1.6, 1.1, 1.2)), darkSteel);
    house.position.set(2.6, 0.55, 3.4);
    scene.add(house);
    rising.push({ obj: house, delay: 0.9 });
    const chimney = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 10)), darkSteel);
    chimney.position.set(3.0, 1.55, 3.6);
    scene.add(chimney);
    rising.push({ obj: chimney, delay: 1.0 });
    const stack = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 12)), darkSteel);
    stack.position.set(9.2, 2.6, -4.6);
    scene.add(stack);
    const flame = new THREE.Mesh(keep(new THREE.ConeGeometry(0.22, 0.6, 12)), amberGlow);
    flame.position.set(9.2, 5.5, -4.6);
    scene.add(flame);
    rising.push({ obj: stack, delay: 1.0 });
    rising.push({ obj: flame, delay: 1.1 });
    const flareGlow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: soft, color: 0xffb54d, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));
    flareGlow.position.set(9.2, 5.6, -4.6);
    flareGlow.scale.setScalar(2.6);
    scene.add(flareGlow);
    // guy wires on the flare stack
    for (const [dx, dz] of [[1.6, 0.6], [-1.2, 1.2], [0.2, -1.7]] as Array<[number, number]>) {
      const a = new THREE.Vector3(9.2, 4.6, -4.6);
      const b = new THREE.Vector3(9.2 + dx, 0, -4.6 + dz);
      const wire = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.012, a.distanceTo(b), 4)), pipeMat);
      wire.position.copy(a).add(b).multiplyScalar(0.5);
      wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      scene.add(wire);
      rising.push({ obj: wire, delay: 1.2 });
    }

    // Oil pumpjack at the wellhead: the beam nods up and down.
    const jack = new THREE.Group();
    jack.position.set(-5.4, 0, -8.6);
    jack.scale.set(1.25, 1.25, 1.25);
    jack.rotation.y = 0.62;
    const jackBase = new THREE.Mesh(keep(new THREE.BoxGeometry(4.2, 0.25, 1.1)), darkSteel);
    jackBase.position.y = 0.125;
    jack.add(jackBase);
    for (const z of [-0.35, 0.35]) {
      const leg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.09, 2.5, 8)), darkSteel);
      leg.position.set(0, 1.35, z);
      leg.rotation.x = z > 0 ? -0.12 : 0.12;
      jack.add(leg);
    }
    const beam = new THREE.Group();
    beam.position.set(0, 2.6, 0);
    const beamBar = new THREE.Mesh(keep(new THREE.BoxGeometry(4, 0.22, 0.26)), steel);
    beam.add(beamBar);
    const head = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 24, 1, false, -Math.PI / 2.6, Math.PI / 1.3)), amberGlow);
    head.rotation.x = Math.PI / 2;
    head.position.set(2.0, -0.1, 0);
    beam.add(head);
    const weight = new THREE.Mesh(keep(new THREE.BoxGeometry(0.7, 0.9, 0.5)), darkSteel);
    weight.position.set(-1.9, -0.45, 0);
    beam.add(weight);
    jack.add(beam);
    const well = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 10)), pipeMat);
    well.position.set(2.7, 0.6, 0);
    jack.add(well);
    scene.add(jack);
    rising.push({ obj: jack, delay: 0.2, ripple: ripple(-5.4, -8.6, 3.4) });

    // Pipelines with product flowing through them.
    const flows: Flow[] = [];
    const dotGeo = keep(new THREE.SphereGeometry(0.14, 10, 8));
    function pipe(points: Array<[number, number, number]>, speed = 0.12, dotCount = 7) {
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[i + 1])));
      for (let i = 0; i < points.length - 1; i++) {
        const a = new THREE.Vector3(...points[i]);
        const b = new THREE.Vector3(...points[i + 1]);
        const len = a.distanceTo(b);
        const seg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.11, 0.11, len, 12)), pipeMat);
        seg.position.copy(a).add(b).multiplyScalar(0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        scene.add(seg);
        rising.push({ obj: seg, delay: 1.2 + i * 0.05 });
        if (i > 0) {
          const elbow = new THREE.Mesh(keep(new THREE.SphereGeometry(0.15, 12, 10)), pipeMat);
          elbow.position.copy(a);
          scene.add(elbow);
          rising.push({ obj: elbow, delay: 1.2 });
        }
      }
      const dots: THREE.Mesh[] = [];
      for (let i = 0; i < dotCount; i++) {
        const d = new THREE.Mesh(dotGeo, amberGlow);
        d.visible = false;
        scene.add(d);
        dots.push(d);
      }
      flows.push({ curve: path, dots, speed });
    }
    pipe([[-5.6, 0.5, 3.4], [-5.6, 0.5, 5], [2.6, 0.5, 5], [2.6, 0.5, 4.1]], 0.1, 9);
    pipe([[-0.9, 0.5, 4.3], [-0.9, 0.5, 5]], 0.2, 2);
    pipe([[-2.4, 0.5, -4.1], [3.2, 0.5, -4.1], [3.2, 0.5, -0.6], [3.4, 0.5, -0.6]], 0.11, 8);
    pipe([[3.4, 0.5, 3.4], [5.2, 0.5, 3.4], [5.2, 0.5, 1.3]], 0.14, 4);

    // Valves on the pipe runs.
    for (const [x, z] of [[-1.5, 5], [0.6, -4.1], [5.2, 2.4]] as Array<[number, number]>) {
      const v = new THREE.Mesh(keep(new THREE.BoxGeometry(0.34, 0.34, 0.34)), tealMat);
      v.position.set(x, 0.5, z);
      v.rotation.y = Math.PI / 4;
      scene.add(v);
      rising.push({ obj: v, delay: 1.4 });
    }

    // Far side of the terminal: more tanks and spheres fading into the night, with blinking roof lights.
    const blinkGeo = keep(new THREE.SphereGeometry(0.11, 8, 6));
    const farMat = keep(new THREE.MeshStandardMaterial({ color: 0x5c6b77, metalness: 0.6, roughness: 0.5 }));
    const far: Array<[number, number, number, number, string]> = [
      [-14, -12, 2.4, 3.4, "tank"], [-8, -15, 2.0, 3.0, "tank"], [9, -13, 2.2, 3.2, "tank"], [15, -9, 1.8, 2.6, "tank"],
      [-17, -4, 1.6, 2.4, "tank"], [14, -18, 2.6, 3.6, "tank"], [-2, -18, 1.7, 0, "sphere"], [19, -2, 1.5, 0, "sphere"],
    ];
    // Mid-yard tanks: lit steel, banded, with a stair. These and the far tanks keep re-emerging.
    const midMat = keep(new THREE.MeshStandardMaterial({ color: 0xaab7bf, metalness: 0.7, roughness: 0.35 }));
    const mid: Array<[number, number, number, number]> = [[1.4, -11.4, 1.5, 2.8], [5.2, -10.6, 1.8, 3.3], [-10.6, -9.6, 1.4, 2.4], [-11.5, 1.5, 1.2, 2.2]];
    mid.forEach(([x, z, r, h], i) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(r, r, h, 40)), midMat);
      body.position.y = h / 2;
      g.add(body);
      const roof = new THREE.Mesh(keep(new THREE.ConeGeometry(r * 1.02, r * 0.32, 40)), steel);
      roof.position.y = h + r * 0.16;
      g.add(roof);
      for (const f of [0.33, 0.66]) {
        const band = new THREE.Mesh(keep(new THREE.TorusGeometry(r * 1.005, 0.03, 6, 48)), f === 0.66 ? amberGlow : darkSteel);
        band.rotation.x = Math.PI / 2;
        band.position.y = h * f;
        g.add(band);
      }
      const st = new THREE.Mesh(keep(new THREE.TubeGeometry(helix(r * 1.06, h, 0.5, i), 60, 0.045, 5)), darkSteel);
      g.add(st);
      const light = new THREE.Mesh(blinkGeo, amberGlow);
      light.position.y = h + r * 0.34;
      g.add(light);
      blinkers.push(light);
      scene.add(g);
      rising.push({ obj: g, delay: 0.4 + i * 0.15, ripple: ripple(x, z, r * 1.5), cycle: 1 });
    });

    far.forEach(([x, z, r, h, kind], i) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      if (kind === "tank") {
        const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(r, r, h, 32)), farMat);
        body.position.y = h / 2;
        g.add(body);
        const roof = new THREE.Mesh(keep(new THREE.ConeGeometry(r * 1.02, r * 0.3, 32)), farMat);
        roof.position.y = h + r * 0.15;
        g.add(roof);
        const light = new THREE.Mesh(blinkGeo, amberGlow);
        light.position.y = h + r * 0.32;
        g.add(light);
        blinkers.push(light);
      } else {
        const ballFar = new THREE.Mesh(keep(new THREE.SphereGeometry(r, 32, 20)), farMat);
        ballFar.position.y = r + 1.6;
        g.add(ballFar);
        for (let k = 0; k < 4; k++) {
          const a2 = (k / 4) * Math.PI * 2;
          const legFar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6)), darkSteel);
          legFar.position.set(Math.cos(a2) * r * 0.75, 0.9, Math.sin(a2) * r * 0.75);
          g.add(legFar);
        }
        const light = new THREE.Mesh(blinkGeo, amberGlow);
        light.position.y = r * 2 + 1.7;
        g.add(light);
        blinkers.push(light);
      }
      scene.add(g);
      rising.push({ obj: g, delay: 0.1 + i * 0.08, ripple: ripple(x, z, r * 1.5), cycle: 1 });
    });

    // Elevated pipe rack behind the tanks: portal frames carrying three lines.
    const rackZ = [-6.9, -7.25, -7.6];
    for (let x = -2.4; x <= 8.2; x += 2.12) {
      const frame = new THREE.Group();
      frame.position.set(x, 0, -7.25);
      for (const dz of [-0.55, 0.55]) {
        const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.14, 1.9, 0.14)), darkSteel);
        post.position.set(0, 0.95, dz);
        frame.add(post);
      }
      const cross = new THREE.Mesh(keep(new THREE.BoxGeometry(0.14, 0.12, 1.3)), darkSteel);
      cross.position.y = 1.84;
      frame.add(cross);
      scene.add(frame);
      rising.push({ obj: frame, delay: 1.0 + (x + 2.4) * 0.04 });
    }
    rackZ.forEach((z, i) => pipe([[-3.2, 0.2, z], [-3.2, 1.98, z], [9, 1.98, z], [9, 0.2, z]], 0.07 + i * 0.025, i === 1 ? 10 : 6));

    // Floodlight masts with soft light beams.
    const beamMat = keep(new THREE.MeshBasicMaterial({ color: 0xffe1b0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const beamGeo = keep(new THREE.ConeGeometry(3.2, 7, 32, 1, true));
    for (const [x, z] of [[-12, 3.5], [11.6, -7.4], [-9.2, -5.2]] as Array<[number, number]>) {
      const mast = new THREE.Group();
      mast.position.set(x, 0, z);
      const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.1, 7.2, 8)), darkSteel);
      pole.position.y = 3.6;
      mast.add(pole);
      const lamp = new THREE.Mesh(keep(new THREE.BoxGeometry(0.7, 0.22, 0.4)), keep(new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe1b0, emissiveIntensity: 1.6 })));
      lamp.position.y = 7.2;
      mast.add(lamp);
      const cone = new THREE.Mesh(beamGeo, beamMat);
      cone.position.y = 3.6;
      mast.add(cone);
      scene.add(mast);
      rising.push({ obj: mast, delay: 0.6 });
    }

    // Road along the front with tanker trucks driving through.
    const road = new THREE.Mesh(keep(new THREE.PlaneGeometry(80, 2.2)), keep(new THREE.MeshStandardMaterial({ color: 0x0d171e, roughness: 1 })));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.015, 8.6);
    scene.add(road);
    const laneGeo = keep(new THREE.PlaneGeometry(1, 0.06));
    const laneMat = keep(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.5 }));
    for (let x = -40; x < 40; x += 2.4) {
      const lane = new THREE.Mesh(laneGeo, laneMat);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(x, 0.02, 8.6);
      scene.add(lane);
    }
    const trucks: THREE.Group[] = [];
    const cabMat = keep(new THREE.MeshStandardMaterial({ color: AMBER, metalness: 0.3, roughness: 0.5 }));
    const headMat = keep(new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
    const tailMat = keep(new THREE.MeshBasicMaterial({ color: 0xff4a2a }));
    const lightBeamGeo = keep(new THREE.ConeGeometry(0.9, 4, 16, 1, true));
    for (let k = 0; k < 2; k++) {
      const tr = new THREE.Group();
      const cab = new THREE.Mesh(keep(new THREE.BoxGeometry(0.9, 0.85, 0.9)), cabMat);
      cab.position.set(1.35, 0.6, 0);
      tr.add(cab);
      const chassis = new THREE.Mesh(keep(new THREE.BoxGeometry(3.4, 0.18, 0.8)), darkSteel);
      chassis.position.set(0.1, 0.28, 0);
      tr.add(chassis);
      const tankBody = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.42, 1.8, 6, 16)), steel);
      tankBody.rotation.z = Math.PI / 2;
      tankBody.position.set(-0.35, 0.82, 0);
      tr.add(tankBody);
      const stripe = new THREE.Mesh(keep(new THREE.TorusGeometry(0.43, 0.025, 6, 24)), amberGlow);
      stripe.rotation.y = Math.PI / 2;
      stripe.position.set(-0.35, 0.82, 0);
      tr.add(stripe);
      for (const dz of [-0.3, 0.3]) {
        const hl = new THREE.Mesh(blinkGeo, headMat);
        hl.position.set(1.81, 0.45, dz);
        tr.add(hl);
        const tl = new THREE.Mesh(blinkGeo, tailMat);
        tl.position.set(-1.6, 0.4, dz);
        tl.scale.setScalar(0.7);
        tr.add(tl);
      }
      const hb = new THREE.Mesh(lightBeamGeo, beamMat);
      hb.rotation.z = Math.PI / 2;
      hb.position.set(3.8, 0.45, 0);
      tr.add(hb);
      for (const wx of [-1.2, -0.5, 1.3]) {
        for (const dz of [-0.42, 0.42]) {
          const wheel = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12)), darkSteel);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(wx, 0.2, dz);
          tr.add(wheel);
        }
      }
      tr.position.set(0, 0, k === 0 ? 8.1 : 9.1);
      if (k === 1) tr.rotation.y = Math.PI;
      scene.add(tr);
      trucks.push(tr);
    }

    // Steam drifting up from the pump house chimney and a vent by the sphere.
    const emitters = [new THREE.Vector3(3.0, 2.0, 3.6), new THREE.Vector3(7.4, 0.6, 1.6)];
    const steamCount = 70;
    const steamPos = new Float32Array(steamCount * 3);
    const steamGeo = keep(new THREE.BufferGeometry());
    steamGeo.setAttribute("position", new THREE.BufferAttribute(steamPos, 3));
    const steam = new THREE.Points(steamGeo, keep(new THREE.PointsMaterial({ map: soft, color: 0xc4d0d6, size: 1.3, transparent: true, opacity: 0.16, depthWrite: false })));
    scene.add(steam);

    // Night sky.
    const starCount = 400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.42;
      const rr = 70;
      starPos[i * 3] = Math.cos(th) * Math.sin(ph) * rr;
      starPos[i * 3 + 1] = Math.cos(ph) * rr * 0.6 + 6;
      starPos[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * rr;
    }
    const starGeo = keep(new THREE.BufferGeometry());
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: 0xdfe8ec, size: 0.12, transparent: true, opacity: 0.55, fog: false, depthWrite: false })));
    scene.add(stars);

    // Warm glow from the flare on the clouds.
    const flareLight = new THREE.PointLight(AMBER, 40, 30, 1.6);
    flareLight.position.set(9.2, 6.5, -4.6);
    scene.add(flareLight);

    // Floating dust for depth.
    const dustCount = 160;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 34;
      dustPos[i * 3 + 1] = Math.random() * 12;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    const dustGeo = keep(new THREE.BufferGeometry());
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, keep(new THREE.PointsMaterial({ map: soft, color: 0xf6bc55, size: 0.16, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
    scene.add(dust);

    // Start state for the rise-in.
    const box = new THREE.Box3();
    for (const r of rising) {
      box.setFromObject(r.obj);
      r.baseY = r.obj.position.y;
      r.depth = Math.max(0.3, box.max.y) + 0.25;
      r.obj.position.y = r.baseY - r.depth;
    }
    const cycled = rising.filter((r) => r.cycle);

    // Camera framing: wide screens push the plant to the right of the text.
    const target = new THREE.Vector3();
    let frameShift = 0;
    // Pull the camera back on narrow screens so the whole plant fits.
    const w0Radius = () => (camera.aspect < 0.8 ? 34 : camera.aspect < 1.3 ? 30 : 27);
    function resize() {
      const w = el!.clientWidth || 1;
      const h = el!.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      frameShift = w > 1024 ? shift : 0;
      camera.clearViewOffset();
      if (frameShift) camera.setViewOffset(w, h, frameShift * w, 0, w, h);
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    let scrollT = 0;
    const onScroll = () => { scrollT = Math.min(1, window.scrollY / Math.max(1, el!.clientHeight)); };
    window.addEventListener("scroll", onScroll, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) loop(); }, { threshold: 0 });
    io.observe(el);

    const clock = new THREE.Clock();
    const start = performance.now();
    let raf = 0;

    function update(t: number, elapsed: number) {
      // Rise-in of every structure, staggered.
      // Back-yard tanks take turns sinking into the ground and pushing back up.
      const slot = 3.2;
      const period = cycled.length * slot;
      for (const r of rising) {
        let p = easeOut((t - r.delay) / 1.4);
        let rippleT = (t - r.delay) / 1.4;
        if (r.cycle && !reduceMotion && t > 7) {
          const idx = cycled.indexOf(r);
          const local = (((t - 7 - idx * slot) % period) + period) % period;
          if (local < 1.1) { p = Math.min(p, 1 - easeOut(local / 1.1) * 0.999); rippleT = -1; }
          else if (local < 2.9) { p = Math.min(p, easeOut((local - 1.1) / 1.8)); rippleT = (local - 1.1) / 1.8; }
        }
        r.obj.position.y = (r.baseY ?? 0) - (r.depth ?? 0) * (1 - p);
        r.obj.visible = p > 0.002;
        if (r.ripple) {
          const on = rippleT > 0 && rippleT < 1.3 && !reduceMotion;
          r.ripple.visible = on;
          if (on) {
            const q = rippleT / 1.3;
            r.ripple.scale.setScalar(r.ripple.userData.r * (0.7 + q * 0.9));
            (r.ripple.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.min(q, 1) * Math.PI) * 0.9;
          }
        }
      }
      // Tanks fill to their level, then breathe a little.
      for (const f of fills) {
        const p = easeOut((t - f.delay) / 2.2);
        const level = f.level * p + (p >= 1 ? Math.sin(elapsed * 0.6 + f.delay * 5) * 0.015 : 0);
        const hgt = Math.max(0.001, f.height * level);
        f.mesh.scale.y = hgt;
        f.mesh.position.y = f.base + hgt / 2;
        f.ring.position.y = f.base + hgt;
      }
      // Product moving through the pipes.
      const pipesOn = t > 1.8;
      for (const fl of flows) {
        fl.dots.forEach((d, i) => {
          d.visible = pipesOn;
          if (!pipesOn) return;
          const u = (elapsed * fl.speed + i / fl.dots.length) % 1;
          fl.curve.getPointAt(u, d.position);
        });
      }
      // Roof lights blink out of step, the flare flickers.
      blinkers.forEach((l, i) => { l.visible = Math.sin(elapsed * 2.2 + i * 1.7) > 0.2; });
      flareLight.intensity = 34 + Math.sin(elapsed * 11) * 6 + Math.sin(elapsed * 4.3) * 5;
      stars.rotation.y = elapsed * 0.004;
      beam.rotation.z = Math.sin(elapsed * 1.6) * 0.22;
      flame.scale.set(1 + Math.sin(elapsed * 9) * 0.08, 1 + Math.sin(elapsed * 7) * 0.18, 1);
      dust.rotation.y = elapsed * 0.01;
      flareGlow.scale.setScalar(2.4 + Math.sin(elapsed * 9) * 0.25 + Math.sin(elapsed * 3.1) * 0.2);
      // Tanker trucks on the front road, one each way.
      trucks.forEach((tr, k) => {
        const x = (((elapsed * 2.6 + k * 30) % 70) + 70) % 70 - 35;
        tr.position.x = k === 0 ? x : -x;
      });
      // Steam puffs rise, spread and recycle.
      for (let i = 0; i < steamCount; i++) {
        const e = emitters[i % emitters.length];
        const life = ((elapsed * 0.22 + i / steamCount) % 1 + 1) % 1;
        steamPos[i * 3] = e.x + Math.sin(i * 12.9 + elapsed * 0.4) * life * 0.9 + life * 1.4;
        steamPos[i * 3 + 1] = e.y + life * 4.2;
        steamPos[i * 3 + 2] = e.z + Math.cos(i * 7.3) * life * 0.8;
      }
      steamGeo.attributes.position.needsUpdate = true;

      // Camera: fly-in, slow drift, mouse parallax, scroll tilt.
      const fly = easeOut(t / 2.6);
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      const angle = THREE.MathUtils.lerp(-1.25, 0.62, fly) + (reduceMotion ? 0 : Math.max(0, elapsed - 2.6) * 0.035) + mouse.x * 0.12;
      const radius = THREE.MathUtils.lerp(52, w0Radius(), fly) - scrollT * 3;
      const height = THREE.MathUtils.lerp(30, 13.5, fly) + mouse.y * -1.2 + scrollT * 6;
      camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
      target.set(0.5, 1.6 - scrollT * 1.5, 0);
      camera.lookAt(target);
    }

    function render() {
      const elapsed = clock.getElapsedTime();
      const t = reduceMotion ? 99 : (performance.now() - start) / 1000;
      update(t, reduceMotion ? 0 : elapsed);
      renderer.render(scene, camera);
    }

    function loop() {
      cancelAnimationFrame(raf);
      if (reduceMotion) { render(); return; }
      const tick = () => {
        if (!visible) return;
        render();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onFail, reduceMotion]);

  return <div ref={host} className={className} />;
}
