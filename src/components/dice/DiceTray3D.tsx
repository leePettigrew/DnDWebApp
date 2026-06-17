"use client";

import { useEffect, useRef } from "react";
import type { DieRoll } from "@/lib/domain/types";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/**
 * The result dice as REAL polyhedra, rendered together in one three.js canvas:
 * a 20-faced icosahedron for a d20, a cube for a d6, an octahedron for a d8, a
 * dodecahedron for a d12, a tetrahedron for a d4, and a 10-faced die for
 * d10/d100. Each die tumbles and settles so the rolled value's face points at
 * the viewer. Styled to match the 3D arena: charcoal-purple bodies, glowing
 * gold edges, and glowing numbers (green 20, red 1, gold otherwise). Lazy-loads
 * three so it stays off other pages; honours prefers-reduced-motion.
 */

const DURATION = 0.95; // seconds

type Three = typeof import("three");
type V3 = InstanceType<Three["Vector3"]>;

interface Face {
  centroid: V3;
  normal: V3;
}

interface DieAnim {
  group: InstanceType<Three["Group"]>;
  target: InstanceType<Three["Quaternion"]>;
  axis: V3;
  turns: number;
  basePos: V3;
  start: number;
  animate: boolean;
  disposables: { dispose: () => void }[];
}

interface GL {
  rebuild: (rolls: DieRoll[]) => void;
  dispose: () => void;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function dieGeometry(THREE: Three, sides: number) {
  const R = 0.62;
  switch (sides) {
    case 4:
      return new THREE.TetrahedronGeometry(R * 1.15);
    case 6:
      return new THREE.BoxGeometry(R * 1.18, R * 1.18, R * 1.18);
    case 8:
      return new THREE.OctahedronGeometry(R * 1.05);
    case 12:
      return new THREE.DodecahedronGeometry(R);
    case 20:
      return new THREE.IcosahedronGeometry(R);
    default:
      return pentagonalBipyramid(THREE, R); // d10 / d100
  }
}

/** A 10-faced die (pentagonal bipyramid) for d10 and d100. */
function pentagonalBipyramid(THREE: Three, R: number) {
  const top = [0, R * 1.1, 0];
  const bot = [0, -R * 1.1, 0];
  const ring: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ring.push([Math.cos(a) * R, 0, Math.sin(a) * R]);
  }
  const verts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 5];
    verts.push(...top, ...a, ...b); // upper face
    verts.push(...bot, ...b, ...a); // lower face
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

/** Group a geometry's triangles into its distinct flat faces. */
function facesOf(THREE: Three, geo: InstanceType<Three["BufferGeometry"]>): Face[] {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute("position") as InstanceType<Three["BufferAttribute"]>;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const groups = new Map<
    string,
    { c: V3; n: V3; count: number }
  >();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const key = `${Math.round(normal.x * 20)},${Math.round(normal.y * 20)},${Math.round(normal.z * 20)}`;
    let e = groups.get(key);
    if (!e) {
      e = { c: new THREE.Vector3(), n: new THREE.Vector3(), count: 0 };
      groups.set(key, e);
    }
    e.c.add(centroid);
    e.n.add(normal);
    e.count++;
  }
  const faces: Face[] = [];
  for (const e of groups.values()) {
    const centroid = e.c.multiplyScalar(1 / e.count);
    const normal = e.n.normalize();
    if (normal.dot(centroid) < 0) normal.negate(); // ensure outward
    faces.push({ centroid, normal });
  }
  return faces;
}

function palette(value: number, sides: number): { color: string; glow: string } {
  if (sides === 20 && value === 20) return { color: "#7dff98", glow: "#13e24a" };
  if (sides === 20 && value === 1) return { color: "#ff5d5d", glow: "#ff1515" };
  return { color: "#ffd57c", glow: "#ffab1f" };
}

function numberTexture(THREE: Three, value: number, sides: number) {
  const { color, glow } = palette(value, sides);
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = `bold ${value >= 100 ? 54 : value >= 10 ? 66 : 78}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = glow;
  ctx.fillStyle = color;
  ctx.shadowBlur = 22;
  ctx.fillText(String(value), 64, 70);
  ctx.fillText(String(value), 64, 70);
  ctx.shadowBlur = 6;
  ctx.fillText(String(value), 64, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

const PLANE_SIZE: Record<number, number> = {
  4: 0.56,
  6: 0.7,
  8: 0.56,
  10: 0.46,
  12: 0.54,
  20: 0.38,
  100: 0.46,
};

/** Values to print on each face. The rolled value sits on faces[0]. */
function faceValues(roll: DieRoll, faceCount: number): number[] {
  const out: number[] = [roll.value];
  if (roll.sides <= faceCount + 1 && roll.sides !== 100) {
    // A real numbering 1..sides; put the rest in order, skipping the result.
    for (let v = 1; v <= roll.sides && out.length < faceCount; v++) {
      if (v !== roll.value) out.push(v);
    }
  } else {
    // d100 (or odd cases): the result, then tens for flavour.
    for (let i = 1; out.length < faceCount; i++) out.push((i * 10) % 100 || 100);
  }
  return out;
}

export function DiceTray3D({
  rolls,
  rolling,
}: {
  rolls: DieRoll[];
  rolling?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<GL | null>(null);
  const reduced = useReducedMotion();
  // Latest props for the async init to read once three has loaded.
  const propsRef = useRef({ rolls, reduced });
  propsRef.current = { rolls, reduced };

  // One-time three.js setup + animation loop.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed || !container) return;

      const width = container.clientWidth || 480;
      const height = container.clientHeight || 180;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.domElement.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;";
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
      camera.position.set(0, 3.0, 5.6);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0xffe9c4, 0.8));
      const key = new THREE.DirectionalLight(0xfff1d6, 1.25);
      key.position.set(4, 8, 6);
      scene.add(key);
      const rim = new THREE.PointLight(0x7858b6, 0.6, 40);
      rim.position.set(-5, 3, -2);
      scene.add(rim);

      const root = new THREE.Group();
      scene.add(root);

      // Show direction (toward the camera) + an up vector for upright numbers.
      const showDir = camera.position.clone().normalize();
      const worldUp = new THREE.Vector3(0, 1, 0);
      const up = worldUp
        .clone()
        .sub(showDir.clone().multiplyScalar(worldUp.dot(showDir)))
        .normalize();

      let dice: DieAnim[] = [];

      function clearDice() {
        for (const d of dice) {
          for (const obj of d.disposables) obj.dispose();
          root.remove(d.group);
        }
        dice = [];
      }

      /**
       * Scale the pool to fit what the camera actually sees. The visible width
       * depends on the panel's aspect ratio, so derive it from the frustum (not
       * a fixed number) — otherwise wide pools clip on narrow panels. Measured
       * at scale 1 so it never compounds with the previous fit.
       */
      function refit() {
        if (dice.length === 0) return;
        root.scale.setScalar(1);
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const dist = camera.position.length();
        const halfH = Math.tan((camera.fov * Math.PI) / 360) * dist;
        const visW = halfH * camera.aspect * 2;
        const visD = halfH * 2;
        const scale = Math.min(
          (visW * 0.82) / (size.x || 1),
          (visD * 0.72) / (size.z || 1),
          2.1,
        );
        root.scale.setScalar(scale);
      }

      function rebuild(list: DieRoll[]) {
        clearDice();
        const n = list.length;
        const cols = Math.min(n, 5);
        const rows = Math.ceil(n / cols);
        const spacing = 1.55;
        const now = performance.now() / 1000;
        const animate = !propsRef.current.reduced;

        list.forEach((roll, i) => {
          const group = new THREE.Group();
          const disposables: { dispose: () => void }[] = [];

          const geo = dieGeometry(THREE, roll.sides);
          disposables.push(geo);
          const faces = facesOf(THREE, geo);
          const values = faceValues(roll, faces.length);

          const dropped = !!roll.dropped;
          const bodyMat = new THREE.MeshStandardMaterial({
            color: dropped ? 0x4a4458 : 0x2c2540,
            emissive: dropped ? 0x0a0814 : 0x150f26,
            emissiveIntensity: 0.6,
            metalness: 0.35,
            roughness: 0.5,
            flatShading: true,
            transparent: dropped,
            opacity: dropped ? 0.55 : 1,
          });
          disposables.push(bodyMat);
          const mesh = new THREE.Mesh(geo, bodyMat);
          group.add(mesh);

          const edgeGeo = new THREE.EdgesGeometry(geo);
          disposables.push(edgeGeo);
          const edgeMat = new THREE.LineBasicMaterial({
            color: 0xe7c06d,
            transparent: true,
            opacity: dropped ? 0.3 : 0.8,
            blending: THREE.AdditiveBlending,
          });
          disposables.push(edgeMat);
          group.add(new THREE.LineSegments(edgeGeo, edgeMat));

          const size = PLANE_SIZE[roll.sides] ?? 0.45;
          const planeGeo = new THREE.PlaneGeometry(size, size);
          disposables.push(planeGeo);
          let resultFaceNormal = faces[0]?.normal ?? new THREE.Vector3(0, 0, 1);
          faces.forEach((face, fi) => {
            const tex = numberTexture(THREE, values[fi] ?? 1, roll.sides);
            disposables.push(tex);
            const mat = new THREE.MeshBasicMaterial({
              map: tex,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              opacity: dropped ? 0.55 : 1,
            });
            disposables.push(mat);
            const plane = new THREE.Mesh(planeGeo, mat);
            plane.position.copy(
              face.centroid.clone().add(face.normal.clone().multiplyScalar(0.012)),
            );
            plane.lookAt(face.centroid.clone().add(face.normal));
            group.add(plane);
            if (fi === 0) resultFaceNormal = face.normal.clone();
          });

          // Orientation that lands the result face toward the viewer, upright.
          const n = resultFaceNormal.normalize();
          let t = worldUp.clone().sub(n.clone().multiplyScalar(worldUp.dot(n)));
          if (t.lengthSq() < 1e-4) t = new THREE.Vector3(0, 0, 1);
          t.normalize();
          const mFrom = new THREE.Matrix4().makeBasis(
            n,
            t,
            n.clone().cross(t).normalize(),
          );
          const mTo = new THREE.Matrix4().makeBasis(
            showDir,
            up,
            showDir.clone().cross(up).normalize(),
          );
          const target = new THREE.Quaternion().setFromRotationMatrix(
            mTo.multiply(mFrom.transpose()),
          );

          const col = i % cols;
          const row = Math.floor(i / cols);
          const basePos = new THREE.Vector3(
            (col - (cols - 1) / 2) * spacing,
            0,
            (row - (rows - 1) / 2) * spacing,
          );
          group.position.copy(basePos);
          if (!animate) group.quaternion.copy(target);

          root.add(group);
          dice.push({
            group,
            target,
            axis: new THREE.Vector3(
              Math.random() - 0.5,
              Math.random() - 0.5,
              Math.random() - 0.5,
            ).normalize(),
            turns: 2 + Math.random() * 2,
            basePos,
            start: now,
            animate,
            disposables,
          });
        });

        refit();
      }

      const delta = new THREE.Quaternion();
      let raf = 0;
      const tick = () => {
        const now = performance.now() / 1000;
        for (const d of dice) {
          if (d.animate) {
            const t = Math.min(1, (now - d.start) / DURATION);
            const e = easeOutCubic(t);
            const angle = (1 - e) * d.turns * Math.PI * 2;
            delta.setFromAxisAngle(d.axis, angle);
            d.group.quaternion.copy(d.target).multiply(delta);
            d.group.position.y =
              d.basePos.y + Math.sin(Math.min(1, t) * Math.PI) * 0.4 * (1 - t);
          }
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const ro = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w && h) {
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          refit();
        }
      });
      ro.observe(container);

      glRef.current = {
        rebuild,
        dispose: () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          clearDice();
          renderer.dispose();
          if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        },
      };
      rebuild(propsRef.current.rolls);
      cleanup = () => glRef.current?.dispose();
    })();

    return () => {
      disposed = true;
      cleanup();
      glRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild whenever the rolled dice change.
  const key = rolls.map((r) => `${r.sides}:${r.value}:${r.dropped ? 1 : 0}`).join("|");
  useEffect(() => {
    glRef.current?.rebuild(rolls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);

  return (
    <div
      ref={containerRef}
      className="relative h-72 w-full sm:h-80"
      aria-hidden="true"
      data-rolling={rolling ? "true" : undefined}
    />
  );
}
