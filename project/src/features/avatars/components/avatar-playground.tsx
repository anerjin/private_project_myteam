"use client";

import { Maximize2, Minimize2, Monitor } from "lucide-react";
import {
  Bodies,
  Body,
  Composite,
  Engine,
  Events,
  Mouse,
  MouseConstraint,
  Runner,
} from "matter-js";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 잡아서 던질 수 있는 아바타 — [matter-js](https://github.com/liabru/matter-js) 물리 (`DEC-066`).
 *
 * ## 캔버스에 그리지 않습니다
 *
 * matter-js 에는 자체 렌더러가 있지만 쓰지 않습니다. **물리는 «위치와 각도»만
 * 계산하게 두고, 그림은 원래대로 DOM 의 `<img>`** 입니다. 그래야
 *
 * - 아바타 SVG 안의 움직임(꼬리·귀·깜빡임)이 **던져지는 동안에도 그대로** 돌고
 * - 그림을 바꿔도 이 컴포넌트는 손댈 곳이 없습니다 (`catalog.ts` 의 `src` 뿐)
 *
 * 캔버스로 그리면 SVG 를 래스터로 굽는 순간 그 둘을 다 잃습니다.
 *
 * ## 상자 안과 화면 전체, 두 자리
 *
 * 기본은 카드 안의 상자입니다. 「화면 전체로」를 누르면 **화면을 덮는 투명한
 * 판**으로 옮겨 가 브라우저 창 전체를 돌아다닙니다. 그 판은
 * `pointer-events: none` 이라 **밑에 있는 앱은 그대로 쓸 수 있고**, 강아지
 * 그림에만 포인터가 살아 있습니다.
 *
 * 모니터까지 덮으려면 브라우저를 전체화면으로 만들어야 합니다 — 「모니터 전체」가
 * 그것입니다(`requestFullscreen`). **다른 프로그램 위에까지 나가는 것은 웹
 * 페이지가 할 수 없습니다** — 그건 데스크톱 앱(시메지류)의 영역입니다.
 *
 * ## 움직임을 줄이는 설정
 *
 * 이 움직임은 **사람이 끌어야만** 일어납니다. 스스로 튀는 것이 아니라 손에
 * 붙어 오는 반응이라, `prefers-reduced-motion` 에서도 끄지 않습니다 —
 * 끄면 기능 자체가 사라집니다. 대신 아바타 그림 «안»의 자동 움직임은
 * 그 설정에서 멈춥니다 (`public/avatars/dog.svg`).
 */
export function AvatarPlayground({
  src,
  name,
  size = 112,
}: {
  /** `public/` 기준 경로 */
  src: string;
  name: string;
  /** 화면에 그릴 한 변 (px) */
  size?: number;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dogRef = useRef<HTMLImageElement>(null);
  /** 「제자리로」가 쓰는 손잡이 — 엔진 바깥에서 몸통 하나를 다시 잡습니다 */
  const bodyRef = useRef<Body | null>(null);
  const [dragging, setDragging] = useState(false);
  /*
   * 화면 전체 모드. **처음에는 반드시 `false`** 입니다 — 포털은 `document.body`
   * 를 쓰는데 서버 렌더에는 그것이 없습니다. 사람이 눌러야 켜지므로 그때는
   * 이미 브라우저입니다. 「마운트됐는가」를 따로 들고 있을 필요가 없습니다.
   */
  const [full, setFull] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    const dogEl = dogRef.current;
    if (!stage || !dogEl) return;

    const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
    const world = engine.world;

    /*
     * 몸통은 «원»입니다. 강아지 실루엣이 대체로 둥글기도 하고, 사각형으로
     * 두면 모서리가 바닥에 서서 **머리로 물구나무를 섭니다.**
     * 반지름은 그림보다 조금 작게 — 그림 가장자리에는 여백이 있습니다.
     */
    const radius = size * 0.46;
    const dog = Bodies.circle(stage.clientWidth / 2, radius + 8, radius, {
      restitution: 0.62, // 통통 튀되 영원히 튀지는 않게
      friction: 0.06,
      frictionAir: 0.008,
      density: 0.0016,
    });
    bodyRef.current = dog;
    Composite.add(world, dog);

    // ── 벽 넷 ────────────────────────────────────────────────
    const THICK = 200;
    let walls: Body[] = [];

    // `isStatic` 은 **생성할 때** 줍니다. 나중에 대입하면 질량이 그대로 남아
    // 「고정인데 밀리는」 몸통이 됩니다 (`Body.setStatic` 이 그 계산을 합니다).
    const WALL = { isStatic: true, restitution: 0.4, friction: 0.4 };

    const buildWalls = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (walls.length > 0) Composite.remove(world, walls);
      walls = [
        // 바닥 · 천장
        Bodies.rectangle(w / 2, h + THICK / 2, w + THICK * 2, THICK, WALL),
        Bodies.rectangle(w / 2, -THICK / 2, w + THICK * 2, THICK, WALL),
        // 좌 · 우
        Bodies.rectangle(-THICK / 2, h / 2, THICK, h + THICK * 2, WALL),
        Bodies.rectangle(w + THICK / 2, h / 2, THICK, h + THICK * 2, WALL),
      ];
      Composite.add(world, walls);
    };
    buildWalls();

    // ── 마우스 ───────────────────────────────────────────────
    const mouse = Mouse.create(stage);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        // 낮을수록 «고무줄»처럼 늘어집니다. 0.2 쯤이 잡은 느낌이 납니다
        stiffness: 0.18,
        damping: 0.02,
        render: { visible: false },
      },
    });
    Composite.add(world, mouseConstraint);

    const listeners = mouse as unknown as {
      mousewheel: EventListener;
      mousemove: EventListener;
      mouseup: EventListener;
    };

    /*
     * **휠 이벤트는 되돌려 줍니다.** matter 의 Mouse 가 휠을 가로채
     * `preventDefault` 하므로, 그대로 두면 이 상자 위에서 **페이지 스크롤이
     * 멈춥니다.** 놀이터 하나 때문에 문서를 못 읽게 되는 것은 과합니다.
     */
    stage.removeEventListener("wheel", listeners.mousewheel);
    stage.removeEventListener("DOMMouseScroll", listeners.mousewheel);

    /*
     * **상자 밖에서 손을 놓으면 강아지가 커서에 붙어 버립니다.**
     *
     * matter 는 마우스 이벤트를 «상자에만» 겁니다. 끌다가 밖으로 나가서 놓으면
     * 그 `mouseup` 을 못 보고 «아직 잡고 있다»고 믿습니다 — 실측에서 강아지가
     * 허공에 뜬 채 커서를 따라다녔습니다. 던지기는 대개 밖으로 나가면서 놓으므로
     * 드문 일이 아니라 **기본 동작**입니다.
     *
     * 끄는 동안만 창 전체에서 듣습니다. matter 가 만들어 둔 그 핸들러를 그대로
     * 빌려 쓰므로 내부 상태가 갈라지지 않습니다.
     */
    const onStart = () => {
      setDragging(true);
      // 끌다가 밑에 있는 글자가 통째로 선택되는 것을 막습니다
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", listeners.mousemove);
      window.addEventListener("mouseup", listeners.mouseup);
      window.addEventListener("touchend", listeners.mouseup);
    };
    const onEnd = () => {
      setDragging(false);
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", listeners.mousemove);
      window.removeEventListener("mouseup", listeners.mouseup);
      window.removeEventListener("touchend", listeners.mouseup);
    };
    Events.on(mouseConstraint, "startdrag", onStart);
    Events.on(mouseConstraint, "enddrag", onEnd);

    /*
     * **오뚝이** — 던지면 구르지만 결국 다시 일어섭니다.
     *
     * 회전을 아예 막으면(`inertia: Infinity`) 던져도 뻣뻣하고, 그냥 두면
     * **거꾸로 뒤집힌 채 멈춥니다.** 실측에서 바로 그렇게 끝났고, 뒤집힌
     * 캐릭터는 귀엽지 않습니다.
     *
     * 그래서 매 프레임 «바로 서려는» 약한 힘을 줍니다(스프링 + 감쇠).
     * 세게 던지면 그 힘을 이기고 몇 바퀴 구르고, 느려지면 이깁니다.
     */
    const STAND_SPRING = 0.06;
    const STAND_DAMPING = 0.2;

    const standUp = () => {
      // 각도를 (-π, π] 로 접습니다 — 안 접으면 720° 를 되감으려 듭니다
      const angle = Math.atan2(Math.sin(dog.angle), Math.cos(dog.angle));
      const pull = -angle * STAND_SPRING - dog.angularVelocity * STAND_DAMPING;
      Body.setAngularVelocity(dog, dog.angularVelocity + pull);
    };

    // ── 물리 → 화면 ──────────────────────────────────────────
    const draw = () => {
      standUp();
      dogEl.style.transform =
        `translate3d(${dog.position.x - size / 2}px, ${dog.position.y - size / 2}px, 0)` +
        ` rotate(${dog.angle}rad)`;
    };
    Events.on(engine, "afterUpdate", draw);
    draw();

    const runner = Runner.create();
    Runner.run(runner, engine);

    /*
     * 상자 크기가 바뀌면 벽도 따라가야 합니다. 안 그러면 창을 줄였을 때
     * 강아지가 **보이지 않는 옛 바닥** 위에 서 있거나 밖으로 나갑니다.
     */
    const observer = new ResizeObserver(() => {
      buildWalls();
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (dog.position.x > w || dog.position.y > h) {
        Body.setPosition(dog, { x: Math.min(dog.position.x, w / 2), y: h / 2 });
        Body.setVelocity(dog, { x: 0, y: 0 });
      }
    });
    observer.observe(stage);

    return () => {
      observer.disconnect();
      onEnd(); // 끄는 도중에 화면을 떠나도 창에 리스너가 남지 않게
      Events.off(mouseConstraint, "startdrag", onStart);
      Events.off(mouseConstraint, "enddrag", onEnd);
      Events.off(engine, "afterUpdate", draw);
      Runner.stop(runner);
      Composite.clear(world, false);
      Engine.clear(engine);
      bodyRef.current = null;
    };
    // `full` 이 바뀌면 무대가 통째로 바뀝니다 — 엔진도 다시 세웁니다
  }, [size, full]);

  /** 던져서 구석에 박아 뒀을 때 — 위에서 다시 떨어뜨립니다 */
  const reset = useCallback(() => {
    const dog = bodyRef.current;
    const stage = stageRef.current;
    if (!dog || !stage) return;
    Body.setPosition(dog, { x: stage.clientWidth / 2, y: 60 });
    Body.setVelocity(dog, { x: 0, y: 0 });
    Body.setAngularVelocity(dog, 0);
    Body.setAngle(dog, 0);
  }, []);

  /** 브라우저를 모니터 전체로 — 여기가 웹 페이지가 갈 수 있는 끝입니다 */
  const toggleMonitor = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  const dogImage = (
    <Image
      ref={dogRef}
      src={src}
      alt={`${name} 아바타`}
      width={512}
      height={512}
      unoptimized
      // 화면 맨 위에 있는 그림이라 LCP 로 잡힙니다 — 늦게 불러오면 그만큼 늦어집니다
      priority
      draggable={false}
      /*
        물리가 위치를 잡으므로 왼쪽 위에 두고 transform 으로만 옮깁니다.

        화면 전체 모드에서는 **그림에만** 포인터를 살립니다 — 판 전체가
        포인터를 먹으면 밑에 있는 앱을 못 씁니다. `pointer-events` 는
        **상속되므로** 판의 `none` 을 그림에서 `auto` 로 «되돌려» 줘야 합니다.
        빼먹었더니 실측에서 강아지가 아예 안 잡혔습니다.
      */
      className={cn(
        "absolute top-0 left-0 will-change-transform",
        full
          ? cn(
              "pointer-events-auto",
              dragging ? "cursor-grabbing" : "cursor-grab"
            )
          : "pointer-events-none"
      )}
      style={{ width: size, height: size }}
    />
  );

  return (
    <div className="space-y-2">
      {full ? (
        // 상자는 자리를 지킵니다 — 카드가 갑자기 납작해지지 않게
        <div className="bg-muted/40 text-muted-foreground flex h-72 items-center justify-center rounded-xl border border-dashed text-sm">
          화면 전체에서 놀고 있습니다
        </div>
      ) : (
        <div
          ref={stageRef}
          className={cn(
            "bg-muted/40 relative h-72 overflow-hidden rounded-xl border border-dashed select-none",
            dragging ? "cursor-grabbing" : "cursor-grab"
          )}
        >
          {dogImage}
        </div>
      )}

      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span>잡아서 던져 보세요. 벽과 바닥에 부딪히고 다시 일어섭니다.</span>
        <div className="flex shrink-0 items-center">
          {!full && (
            <Button variant="ghost" size="sm" onClick={reset}>
              제자리로
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setFull(true)}>
            <Maximize2 />
            화면 전체로
          </Button>
        </div>
      </div>

      {full &&
        createPortal(
          <div
            ref={stageRef}
            // 판은 포인터를 먹지 않습니다 — 밑에 있는 앱이 그대로 살아 있어야 합니다
            className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
          >
            {dogImage}

            <div className="bg-background/90 pointer-events-auto fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border p-1 shadow-lg backdrop-blur">
              <Button variant="ghost" size="sm" onClick={reset}>
                제자리로
              </Button>
              <Button variant="ghost" size="sm" onClick={toggleMonitor}>
                <Monitor />
                모니터 전체
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFull(false)}>
                <Minimize2 />
                상자로
              </Button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
