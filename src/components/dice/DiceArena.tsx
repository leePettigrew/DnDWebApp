"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useRealtime } from "@/lib/data/hooks";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

const FLOOR = 5; // half-size of the tray floor
const RADIUS = 0.92; // die collision radius
const WALL = FLOOR - RADIUS; // bounce bound for the die centre
const GRAVITY = 24;
const RESTITUTION = 0.42;
const HOLD_Y = 2.4; // height the die floats at while held

/**
 * A real 3D dice arena (three.js): a lit felt tray you grab and fling a d20
 * into. Gravity + floor/wall bounce + spin, then it settles on a face and reads
 * the result, which is logged + shared to the table (trust-based). Lazy-loads
 * three so it stays off other pages; respects prefers-reduced-motion.
 */
export function DiceArena() {
  const realtime = useRealtime();
  const reducedMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const tossRef = useRef<() => void>(() => {});
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const [result, setResult] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "rolling" | "settled">("idle");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed || !container) return;

      const width = container.clientWidth || 600;
      const height = container.clientHeight || 320;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;";
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x14100b, 14, 26);

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 10.5, 8.5);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0xffe9c4, 0.7));
      const key = new THREE.DirectionalLight(0xfff1d6, 1.5);
      key.position.set(5, 12, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 40;
      key.shadow.camera.left = -8;
      key.shadow.camera.right = 8;
      key.shadow.camera.top = 8;
      key.shadow.camera.bottom = -8;
      scene.add(key);
      const rim = new THREE.PointLight(0xb98a3c, 0.5, 30);
      rim.position.set(-6, 5, -4);
      scene.add(rim);

      // Felt floor.
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(FLOOR * 2, FLOOR * 2),
        new THREE.MeshStandardMaterial({ color: 0x2c1c14, roughness: 0.95 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      // Wooden rim walls.
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x3a2616,
        roughness: 0.85,
      });
      const wallH = 1.2;
      const mkWall = (
        w: number,
        d: number,
        x: number,
        z: number,
      ): InstanceType<typeof THREE.Mesh> => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
        m.position.set(x, wallH / 2, z);
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
        return m;
      };
      mkWall(FLOOR * 2 + 0.6, 0.3, 0, -FLOOR);
      mkWall(FLOOR * 2 + 0.6, 0.3, 0, FLOOR);
      mkWall(0.3, FLOOR * 2 + 0.6, -FLOOR, 0);
      mkWall(0.3, FLOOR * 2 + 0.6, FLOOR, 0);

      // The d20.
      const die = new THREE.Group();
      const geo = new THREE.IcosahedronGeometry(RADIUS, 0);
      const dieMesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: 0xc99a4a,
          metalness: 0.35,
          roughness: 0.42,
          flatShading: true,
        }),
      );
      dieMesh.castShadow = true;
      die.add(dieMesh);

      // Compute faces (centroid + normal), assign 1..20, and label them.
      const pos = geo.getAttribute("position");
      const faces: { normal: InstanceType<typeof THREE.Vector3>; value: number }[] =
        [];
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const faceCount = pos.count / 3;
      for (let f = 0; f < faceCount; f++) {
        a.fromBufferAttribute(pos, f * 3);
        b.fromBufferAttribute(pos, f * 3 + 1);
        c.fromBufferAttribute(pos, f * 3 + 2);
        const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        const normal = b
          .clone()
          .sub(a)
          .cross(c.clone().sub(a))
          .normalize();
        const value = f + 1;
        faces.push({ normal: normal.clone(), value });

        // Number label plane sitting on the face.
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, 128, 128);
        ctx.fillStyle = "#2a1407";
        ctx.font = "bold 78px Georgia, serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(value), 64, 70);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.62, 0.62),
          new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
          }),
        );
        plane.position.copy(centroid.clone().add(normal.clone().multiplyScalar(0.02)));
        plane.lookAt(centroid.clone().add(normal));
        die.add(plane);
      }

      die.position.set(0, RADIUS, 0);
      scene.add(die);

      // --- physics state ---
      const vel = new THREE.Vector3();
      const angVel = new THREE.Vector3();
      let held = false;
      let simulating = false;
      let settling = false;
      let targetQuat: InstanceType<typeof THREE.Quaternion> | null = null;
      let restTime = 0;
      let rollClock = 0;
      const up = new THREE.Vector3(0, 1, 0);
      const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_Y);
      const ndc = new THREE.Vector2();
      const ray = new THREE.Raycaster();
      const hitPt = new THREE.Vector3();
      const history: { x: number; z: number; t: number }[] = [];

      function setNdc(e: PointerEvent) {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1,
        );
      }
      function dragPoint(): InstanceType<typeof THREE.Vector3> | null {
        ray.setFromCamera(ndc, camera);
        return ray.ray.intersectPlane(dragPlane, hitPt) ? hitPt.clone() : null;
      }
      function upFaceValue(): number {
        let best = -Infinity;
        let value = 20;
        for (const fc of faces) {
          const d = fc.normal.clone().applyQuaternion(die.quaternion).y;
          if (d > best) {
            best = d;
            value = fc.value;
          }
        }
        return value;
      }
      function beginSettle() {
        simulating = false;
        const value = upFaceValue();
        // Snap chosen face flat to "up".
        let bestFace = faces[0];
        let best = -Infinity;
        for (const fc of faces) {
          const d = fc.normal.clone().applyQuaternion(die.quaternion).y;
          if (d > best) {
            best = d;
            bestFace = fc;
          }
        }
        const nWorld = bestFace.normal
          .clone()
          .applyQuaternion(die.quaternion)
          .normalize();
        const correction = new THREE.Quaternion().setFromUnitVectors(nWorld, up);
        targetQuat = correction.multiply(die.quaternion.clone());
        settling = true;
        setResult(value);
        setPhase("settled");
        realtime.logPhysicalRoll(value, "Physical toss");
      }

      function launch(vx: number, vz: number, vy: number) {
        vel.set(vx, vy, vz);
        angVel.set(
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 18,
        );
        simulating = true;
        settling = false;
        targetQuat = null;
        rollClock = 0;
        restTime = 0;
        setResult(null);
        setPhase("rolling");
      }

      function onDown(e: PointerEvent) {
        setNdc(e);
        ray.setFromCamera(ndc, camera);
        if (ray.intersectObject(dieMesh, false).length === 0) return;
        renderer.domElement.setPointerCapture(e.pointerId);
        held = true;
        simulating = false;
        settling = false;
        vel.set(0, 0, 0);
        angVel.set(0, 0, 0);
        history.length = 0;
        setResult(null);
        setPhase("idle");
      }
      function onMove(e: PointerEvent) {
        if (!held) return;
        setNdc(e);
        const p = dragPoint();
        if (!p) return;
        die.position.set(
          Math.max(-WALL, Math.min(WALL, p.x)),
          HOLD_Y,
          Math.max(-WALL, Math.min(WALL, p.z)),
        );
        die.rotation.y += 0.08;
        history.push({ x: die.position.x, z: die.position.z, t: performance.now() });
        if (history.length > 6) history.shift();
      }
      function onUp(e: PointerEvent) {
        if (!held) return;
        held = false;
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        let vx = 0;
        let vz = 0;
        if (history.length >= 2) {
          const f = history[0];
          const l = history[history.length - 1];
          const dt = (l.t - f.t) / 1000 || 0.05;
          vx = ((l.x - f.x) / dt) * 0.9;
          vz = ((l.z - f.z) / dt) * 0.9;
        }
        history.length = 0;
        const speed = Math.hypot(vx, vz);
        if (reducedRef.current || speed < 1.5) {
          launch((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 2);
        } else {
          launch(vx, vz, 2.5);
        }
      }

      const dom = renderer.domElement;
      dom.addEventListener("pointerdown", onDown);
      dom.addEventListener("pointermove", onMove);
      dom.addEventListener("pointerup", onUp);
      dom.addEventListener("pointercancel", onUp);

      tossRef.current = () => {
        held = false;
        die.position.set(
          (Math.random() - 0.5) * 4,
          HOLD_Y,
          FLOOR - 1.5,
        );
        const dir = Math.random() * Math.PI - Math.PI / 2;
        const power = 7 + Math.random() * 5;
        launch(Math.sin(dir) * power, -power, 3);
      };

      const dq = new THREE.Quaternion();
      let raf = 0;
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(1 / 30, (now - last) / 1000);
        last = now;

        if (simulating && !held) {
          rollClock += dt;
          vel.y -= GRAVITY * dt;
          die.position.addScaledVector(vel, dt);

          // floor
          if (die.position.y < RADIUS) {
            die.position.y = RADIUS;
            if (vel.y < 0) vel.y = -vel.y * RESTITUTION;
            vel.x *= 0.86;
            vel.z *= 0.86;
            angVel.multiplyScalar(0.9);
          }
          // walls
          if (die.position.x < -WALL) {
            die.position.x = -WALL;
            vel.x = Math.abs(vel.x) * RESTITUTION;
          } else if (die.position.x > WALL) {
            die.position.x = WALL;
            vel.x = -Math.abs(vel.x) * RESTITUTION;
          }
          if (die.position.z < -WALL) {
            die.position.z = -WALL;
            vel.z = Math.abs(vel.z) * RESTITUTION;
          } else if (die.position.z > WALL) {
            die.position.z = WALL;
            vel.z = -Math.abs(vel.z) * RESTITUTION;
          }

          // spin
          const av = angVel.length();
          if (av > 1e-4) {
            dq.setFromAxisAngle(angVel.clone().normalize(), av * dt);
            die.quaternion.premultiply(dq);
          }

          const grounded = die.position.y <= RADIUS + 0.02;
          const slow = vel.length() < 0.6 && av < 0.8;
          if (grounded && slow) {
            restTime += dt;
            if (restTime > 0.25 || rollClock > 6) beginSettle();
          } else {
            restTime = 0;
          }
        }

        if (settling && targetQuat) {
          die.quaternion.slerp(targetQuat, 0.2);
          die.position.y += (RADIUS - die.position.y) * 0.2;
          if (die.quaternion.angleTo(targetQuat) < 0.01) {
            die.quaternion.copy(targetQuat);
            settling = false;
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
        }
      });
      ro.observe(container);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        dom.removeEventListener("pointerdown", onDown);
        dom.removeEventListener("pointermove", onMove);
        dom.removeEventListener("pointerup", onUp);
        dom.removeEventListener("pointercancel", onUp);
        renderer.dispose();
        if (dom.parentNode) dom.parentNode.removeChild(dom);
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const crit = phase === "settled" && result === 20;
  const fumble = phase === "settled" && result === 1;

  return (
    <Panel
      title="3D Dice Arena"
      eyebrow="Grab &amp; throw — shared with the table"
      action={
        <Button variant="secondary" size="sm" onClick={() => tossRef.current()}>
          Toss for me
        </Button>
      }
    >
      <div className="relative">
        <div
          ref={containerRef}
          className="relative h-80 w-full overflow-hidden rounded-card border-2 border-parchment-400/70 bg-leather"
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end p-3">
          {phase === "settled" && result !== null ? (
            <span
              className={cn(
                "animate-fade-in-up rounded-full border px-4 py-1 font-display text-base font-bold shadow-raised",
                crit
                  ? "border-gilt bg-brass/30 text-brass-light"
                  : fumble
                    ? "border-oxblood bg-oxblood/30 text-oxblood-light"
                    : "border-parchment-400/70 bg-parchment-100/95 text-ink",
              )}
            >
              {crit
                ? "Critical — 20!"
                : fumble
                  ? "Fumble — 1"
                  : `You threw ${result}`}
            </span>
          ) : phase === "idle" ? (
            <span className="text-xs uppercase tracking-[0.2em] text-parchment-300/70">
              Grab the die &amp; fling it
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        Grab the d20 and throw it across the tray — it tumbles with real physics
        and the result is logged + shared to your table&apos;s roll log.
      </p>
    </Panel>
  );
}
