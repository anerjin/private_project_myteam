"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import type { NeoCharacter as Spec } from "@/features/chat/characters";
import type { VoicePhase } from "@/features/chat/voice/use-voice";

/**
 * 네오의 얼굴 — three.js. **동물의 숲 풍** (`characters.ts` 주석).
 *
 * ## 얼굴만 나옵니다
 *
 * 처음엔 몸까지 세웠는데 운영자가 「얼굴만」으로 정했습니다(2026-09-04). 무대가
 * 세로로 긴 상자가 아니라 얼굴이 꽉 차는 쪽이 표정이 읽힙니다. 몸은 짓지
 * 않습니다 — 안 보이는 것을 만들어 두면 언젠가 카메라가 그걸 비춥니다.
 *
 * ## 마우스로 움직입니다
 *
 * - **끌면 돌아갑니다** — 좌우 ±70°, 위아래 ±30°. 놓고 3초 지나면 천천히
 *   정면으로 돌아옵니다(비뚤어진 채로 남아 있으면 «고장»으로 보입니다)
 * - **커서를 따라 봅니다** — 무대 위에 커서가 있으면 눈동자와 머리가 그쪽으로
 *   조금 기웁니다. 나가면 돌아옵니다
 *
 * 둘 다 **사람이 움직여야** 일어나므로 `prefers-reduced-motion` 에서도 끄지
 * 않습니다(`DEC-066` 과 같은 규칙). 끄는 것은 스스로 도는 것 — 숨쉬기·
 * 프로펠러·깜빡임·귀 흔들기 — 뿐입니다.
 *
 * ## React 는 «상자»만 그립니다
 *
 * 장면·카메라·렌더 루프·포인터 리스너가 전부 하나의 이펙트 안에 있습니다.
 * React 가 관여하는 것은 `<div>` 하나와 두 개의 값(캐릭터 명세·지금 상태)뿐입니다.
 * 상태는 ref 로 흘려보내고 루프가 매 프레임 읽습니다.
 *
 * ## 자세는 «목표»이고 얼굴은 «따라갑니다»
 *
 * 상태가 바뀌면 그 순간 튀지 않고 목표 자세를 향해 감쇠합니다(`damp`).
 * 끌기·커서 따라가기도 같은 감쇠를 지나므로 손을 떼도 부드럽게 이어집니다.
 */

interface Pose {
  /** 앞으로 (rad) */
  lean: number;
  /** 옆으로 갸웃 (rad) */
  tilt: number;
  /** 프로펠러 속도 (rad/s) */
  rotor: number;
  /** 눈동자가 보는 높이 */
  gaze: number;
  /** 크기 */
  scale: number;
  /** 귀 흔들림 크기 */
  ears: number;
}

const POSES: Record<VoicePhase, Pose> = {
  idle: { lean: 0, tilt: 0, rotor: 3, gaze: 0, scale: 1, ears: 0.04 },
  listening: { lean: 0.14, tilt: 0.1, rotor: 8, gaze: 0.02, scale: 1.04, ears: 0.22 },
  thinking: { lean: -0.06, tilt: 0.24, rotor: 18, gaze: 0.1, scale: 1, ears: 0.06 },
  speaking: { lean: 0.04, tilt: 0, rotor: 5, gaze: 0, scale: 1.02, ears: 0.1 },
};

/** 끌기 한계 (rad) */
const MAX_YAW = 1.2;
const MAX_PITCH = 0.5;
/** 놓은 뒤 이만큼 지나면 정면으로 */
const RETURN_MS = 3_000;

/** 값을 목표로 감쇠시킵니다 — 프레임 간격이 달라도 같은 느낌이 나게 */
function damp(cur: number, target: number, speed: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-speed * dt));
}

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

interface Rig {
  head: THREE.Group;
  /** 눈 전체(흰자·눈동자·반짝이) — 깜빡임은 이걸 납작하게 */
  eyes: THREE.Group;
  pupils: THREE.Group;
  mouth: THREE.Mesh;
  earL: THREE.Group;
  earR: THREE.Group;
  rotor: THREE.Group;
  dispose: () => void;
}

/**
 * 공으로만 짓습니다. 상자·원기둥은 프로펠러뿐 — 그 그림체에 모서리가 없습니다.
 * 좌표는 머리 중심이 원점입니다.
 */
function build(spec: Spec): Rig {
  const head = new THREE.Group();
  const own: { dispose(): void }[] = [];
  const mat = (color: string, extra?: Partial<THREE.MeshStandardMaterialParameters>) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
    own.push(m);
    return m;
  };
  const ball = (r: number, seg = 32) => {
    const g = new THREE.SphereGeometry(r, seg, seg);
    own.push(g);
    return g;
  };
  const put = (
    parent: THREE.Object3D,
    mesh: THREE.Mesh,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1
  ) => {
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  };

  const fur = mat(spec.fur);
  const dark = mat(spec.dark, { roughness: 0.35 });
  const white = mat("#FFFFFF", { roughness: 0.25 });
  const cheek = mat(spec.cheek, { roughness: 0.9 });
  const cap = mat(spec.cap, { roughness: 0.5 });

  put(head, new THREE.Mesh(ball(1, 48), fur), 0, 0, 0);

  // 귀 — 밑동을 축으로 흔들리게 그룹으로
  const ear = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.72, 0.78, -0.05);
    put(g, new THREE.Mesh(ball(0.3, 24), fur), 0, 0.12, 0);
    put(g, new THREE.Mesh(ball(0.17, 20), cheek), 0, 0.12, 0.2, 1, 1, 0.5);
    head.add(g);
    return g;
  };
  const earL = ear(-1);
  const earR = ear(1);

  // 눈 — 크고, 반짝이 하나
  const eyes = new THREE.Group();
  const pupils = new THREE.Group();
  head.add(eyes, pupils);
  for (const s of [-1, 1]) {
    put(eyes, new THREE.Mesh(ball(0.25, 24), white), s * 0.38, 0.1, 0.86, 1, 1.35, 0.55);
    put(pupils, new THREE.Mesh(ball(0.17, 24), dark), s * 0.38, 0.1, 0.98, 1, 1.3, 0.5);
    put(pupils, new THREE.Mesh(ball(0.06, 12), white), s * 0.32, 0.22, 1.1);
    put(head, new THREE.Mesh(ball(0.16, 20), cheek), s * 0.66, -0.16, 0.72, 1, 0.7, 0.35); // 볼
  }
  put(head, new THREE.Mesh(ball(0.08, 16), dark), 0, -0.08, 1.0, 1.2, 0.8, 0.8); // 코
  const mouth = put(head, new THREE.Mesh(ball(0.14, 20), dark), 0, -0.33, 0.93, 1.2, 0.3, 0.5);

  // 프로펠러 모자 — 머리 위쪽만 덮는 구면 조각
  const capGeo = new THREE.SphereGeometry(1.06, 40, 24, 0, Math.PI * 2, 0, 0.95);
  own.push(capGeo);
  put(head, new THREE.Mesh(capGeo, cap), 0, 0.02, 0);
  const mastGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.3, 12);
  own.push(mastGeo);
  put(head, new THREE.Mesh(mastGeo, cap), 0, 1.16, 0);

  const rotor = new THREE.Group();
  rotor.position.set(0, 1.34, 0);
  head.add(rotor);
  put(rotor, new THREE.Mesh(ball(0.1, 16), mat(spec.shirt)), 0, 0, 0);
  const bladeGeo = new THREE.BoxGeometry(1.2, 0.05, 0.16);
  own.push(bladeGeo);
  const blade = new THREE.Mesh(bladeGeo, mat(spec.shirt, { roughness: 0.6 }));
  const blade2 = blade.clone();
  blade2.rotation.y = Math.PI / 2;
  rotor.add(blade, blade2);

  return {
    head,
    eyes,
    pupils,
    mouth,
    earL,
    earR,
    rotor,
    dispose: () => own.forEach((o) => o.dispose()),
  };
}

export function NeoCharacter({
  spec,
  phase,
  className,
}: {
  spec: Spec;
  phase: VoicePhase;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  /** 루프가 매 프레임 읽는 «지금 상태». 렌더가 아니라 이펙트가 씁니다 */
  const phaseRef = useRef<VoicePhase>(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // 얼굴이 꽉 차게 — 턱(-1)부터 프로펠러(+1.45)까지가 세로 한 화면입니다
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.35, 5.6);
    camera.lookAt(0, 0.2, 0);

    // 밝은 화면·어두운 화면 어디서나 같은 빛 — 바탕은 투명입니다
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa7c4, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(2.5, 4, 3);
    scene.add(key);

    const rig = build(spec);
    scene.add(rig.head);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const fit = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    /* ── 마우스 ── */
    // 커서가 무대의 어디에 있는가 — 가운데가 0, 가장자리가 ±1. 없으면 0
    const hover = { x: 0, y: 0 };
    // 끌어서 돌린 각. 놓은 시각을 보고 «아직 사람 것»인지 판단합니다
    const drag = { on: false, yaw: 0, pitch: 0, lastX: 0, lastY: 0, releasedAt: -Infinity };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      hover.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, 1);
      hover.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, 1);
      if (!drag.on) return;
      drag.yaw = clamp(drag.yaw + (e.clientX - drag.lastX) * 0.012, MAX_YAW);
      drag.pitch = clamp(drag.pitch + (e.clientY - drag.lastY) * 0.01, MAX_PITCH);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      drag.on = true;
      // 지금 보고 있는 방향에서 «이어서» 돕니다 — 정면으로 튀지 않게
      drag.yaw = rig.head.rotation.y;
      drag.pitch = rig.head.rotation.x - POSES[phaseRef.current].lean;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      el.style.cursor = "grabbing";
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.on) return;
      drag.on = false;
      drag.releasedAt = performance.now();
      el.releasePointerCapture(e.pointerId);
      el.style.cursor = "grab";
    };
    const onLeave = () => {
      hover.x = 0;
      hover.y = 0;
    };
    el.style.cursor = "grab";
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);

    // 얼굴이 «지금» 취하고 있는 자세 — 목표(POSES)를 향해 감쇠합니다
    const cur: Pose = { ...POSES.idle };
    let yaw = 0;
    let pitch = 0;
    let spin = 0;
    let nextBlink = 2 + Math.random() * 3;
    let blinkLeft = 0;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const still = reduced.matches;
      const target = POSES[phaseRef.current];
      const speaking = phaseRef.current === "speaking";

      // 움직임 줄이기면 «바로» 목표 자세로 — 감쇠도 장식입니다
      const k = still ? 1000 : 6;
      cur.lean = damp(cur.lean, target.lean, k, dt);
      cur.tilt = damp(cur.tilt, target.tilt, k, dt);
      cur.rotor = damp(cur.rotor, target.rotor, k, dt);
      cur.gaze = damp(cur.gaze, target.gaze, k, dt);
      cur.scale = damp(cur.scale, target.scale, k, dt);
      cur.ears = damp(cur.ears, target.ears, k, dt);

      /*
       * 어디를 보는가 — 끌고 있거나 놓은 지 얼마 안 됐으면 **사람이 돌린 각**,
       * 아니면 커서 쪽으로 조금. 끌기는 손을 따라야 하므로 빠르게, 나머지는
       * 천천히 감쇠합니다.
       */
      const mine = drag.on || now - drag.releasedAt < RETURN_MS;
      const wantYaw = mine ? drag.yaw : hover.x * 0.3;
      const wantPitch = mine ? drag.pitch : hover.y * 0.15;
      const follow = drag.on ? 30 : 4;
      yaw = damp(yaw, wantYaw, follow, dt);
      pitch = damp(pitch, wantPitch, follow, dt);

      const breathe = still ? 0 : Math.sin(t * 1.6) * 0.03;
      const sway = still ? 0 : Math.sin(t * 0.9) * 0.04;
      rig.head.position.y = breathe;
      rig.head.rotation.x = cur.lean + pitch;
      rig.head.rotation.y = yaw + sway;
      rig.head.rotation.z = cur.tilt + sway * 0.3;

      if (!still) {
        spin += cur.rotor * dt;
        rig.rotor.rotation.y = spin;
        const wiggle = Math.sin(t * 7) * cur.ears;
        rig.earL.rotation.z = wiggle;
        rig.earR.rotation.z = -wiggle;
      }

      // 눈동자는 머리보다 먼저 커서를 봅니다 — 그래서 «살아 있는» 눈이 됩니다
      rig.pupils.position.x = damp(rig.pupils.position.x, mine ? 0 : hover.x * 0.1, 8, dt);
      rig.pupils.position.y = damp(rig.pupils.position.y, cur.gaze - (mine ? 0 : hover.y * 0.08), 8, dt);

      // 입 — 말할 때만 열립니다. 움직임 줄이기면 «반쯤 연 채» 멈춥니다
      const open = speaking
        ? still
          ? 0.7
          : 0.35 + Math.abs(Math.sin(t * 11) * Math.sin(t * 3.7)) * 1.1
        : 0.3;
      rig.mouth.scale.y = damp(rig.mouth.scale.y, open, 20, dt);
      // 말할 때 얼굴이 살짝 통통 — 인형의 «찌부»
      const squash = (rig.mouth.scale.y - 0.3) * 0.02;
      rig.head.scale.set(cur.scale + squash, cur.scale - squash, cur.scale);

      // 깜빡임 — 흰자·눈동자·반짝이가 같이 납작해집니다
      if (!still) {
        nextBlink -= dt;
        if (nextBlink <= 0) {
          blinkLeft = 0.12;
          nextBlink = 2.5 + Math.random() * 3.5;
        }
        if (blinkLeft > 0) blinkLeft -= dt;
        const y = blinkLeft > 0 ? 0.1 : 1;
        rig.eyes.scale.y = y;
        rig.pupils.scale.y = y;
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.style.cursor = "";
      ro.disconnect();
      rig.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [spec]);

  // `touch-none` — 끄는 동안 화면이 스크롤되지 않게
  return <div ref={box} className={`touch-none ${className ?? ""}`} aria-hidden="true" />;
}
