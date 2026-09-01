import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number; type: string; t: number };

export default function ArcadeRunnerLane() {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const runnerRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<Point | null>(null);
  const pointerActiveRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const xRef = useRef(0);
  const vRef = useRef(0);
  const patrolDirRef = useRef<1 | -1>(1);
  const maxXRef = useRef(0);
  const lastWrapRef = useRef(0);
  const hoverStartRef = useRef<number | null>(null);
  const isHoveringRef = useRef(false);
  const overdriveUntilRef = useRef(0);
  const overdriveDirectionRef = useRef<1 | -1>(1);
  const frameRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const lastTsRef = useRef(0);
  const hasDoorsGlitchedRef = useRef(false);

  const [x, setX] = useState(0);
  const [scale, setScale] = useState(1);
  const [filter, setFilter] = useState("none");
  const [doorsGlitch, setDoorsGlitch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReduced = () => (reducedMotionRef.current = mql.matches);
    updateReduced();
    mql.addEventListener?.("change", updateReduced);

    const readBounds = () => {
      const lane = laneRef.current;
      const runner = runnerRef.current;
      if (!lane || !runner) return;
      const laneRect = lane.getBoundingClientRect();
      const runnerRect = runner.getBoundingClientRect();
      const maxX = Math.max(0, laneRect.width - runnerRect.width - 14);
      maxXRef.current = maxX;
      xRef.current = Math.max(0, Math.min(maxX, xRef.current));
      setX(xRef.current);
    };

    const onPointerMove = (e: PointerEvent) => {
      const pt = e.pointerType || "mouse";
      pointerActiveRef.current = pt === "mouse" || pt === "pen";
      pointerRef.current = { x: e.clientX, y: e.clientY, type: pt, t: performance.now() };
    };
    const onMouseMove = (e: MouseEvent) => {
      pointerActiveRef.current = true;
      pointerRef.current = { x: e.clientX, y: e.clientY, type: "mouse", t: performance.now() };
    };
    const onEnter = () => (isHoveringRef.current = true);
    const onLeave = () => {
      isHoveringRef.current = false;
      hoverStartRef.current = null;
    };

    const distanceToRect = (px: number, py: number, rect: DOMRect) => {
      const dx = px < rect.left ? rect.left - px : px > rect.right ? px - rect.right : 0;
      const dy = py < rect.top ? rect.top - py : py > rect.bottom ? py - rect.bottom : 0;
      return Math.hypot(dx, dy);
    };

    const tick = (ts: number) => {
      const lane = laneRef.current;
      const runner = runnerRef.current;
      if (!lane || !runner) {
        frameRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const prev = lastTsRef.current || ts;
      const dt = Math.min(0.05, Math.max(0.008, (ts - prev) / 1000));
      lastTsRef.current = ts;
      const laneRect = lane.getBoundingClientRect();
      const runnerRect = runner.getBoundingClientRect();
      const maxX = Math.max(0, laneRect.width - runnerRect.width - 14);
      maxXRef.current = maxX;
      const pointer = pointerRef.current;
      const hasPointer = !!pointer && pointerActiveRef.current && pointer.type !== "touch";
      const laneNear = hasPointer && pointer ? distanceToRect(pointer.x, pointer.y, laneRect) < 120 || distanceToRect(pointer.x, pointer.y, runnerRect) < 180 : false;
      const overdrive = ts < overdriveUntilRef.current;
      let targetVelocity = 0;
      const hovering = isHoveringRef.current;

      if (hovering && !overdrive && !hasDoorsGlitchedRef.current) {
        if (hoverStartRef.current === null) hoverStartRef.current = ts;
        if (hoverStartRef.current !== null && ts - hoverStartRef.current >= 350) {
          hasDoorsGlitchedRef.current = true;
          setDoorsGlitch(true);
          setTimeout(() => setDoorsGlitch(false), 900);
          const dur = reducedMotionRef.current ? 175 : 825;
          overdriveUntilRef.current = ts + dur;
          overdriveDirectionRef.current = pointer ? (pointer.x < runnerRect.left + runnerRect.width / 2 ? 1 : -1) : 1;
          hoverStartRef.current = null;
          if (reducedMotionRef.current) {
            const j = overdriveDirectionRef.current > 0 ? maxX : 0;
            xRef.current = j;
            setX(j);
          }
        }
      } else {
        hoverStartRef.current = null;
      }

      if (overdrive) {
        if (reducedMotionRef.current) {
          setScale(1);
          setFilter("drop-shadow(0 0 10px #A869DB)");
        } else {
          const dir = overdriveDirectionRef.current;
          const targetX = dir > 0 ? maxX : 0;
          if (ts <= overdriveUntilRef.current - 100) {
            xRef.current += (targetX - xRef.current) * 0.35;
          }
          const pulse = 1 + Math.sin((overdriveUntilRef.current - ts) * 0.08) * 0.08;
          setScale(Math.max(1, pulse + 0.05));
          setFilter(`drop-shadow(${8 * dir}px 0 0 #A869DB) drop-shadow(${16 * dir}px 0 0 rgba(168,105,219,0.65)) drop-shadow(0 0 12px #A869DB)`);
        }
      } else {
        setScale(1);
        setFilter("none");
        if (hovering) {
          targetVelocity = 0;
        } else if (laneNear && hasPointer && pointer) {
          const centerX = runnerRect.left + runnerRect.width / 2;
          const dx = centerX - pointer.x;
          const direction: 1 | -1 = dx >= 0 ? 1 : -1;
          const distance = Math.abs(dx);
          const closeness = 1 - Math.min(distance, 240) / 240;
          const speed = reducedMotionRef.current ? 90 : 70 + closeness * 680;
          targetVelocity = speed * direction;
          const pushingEdge = (xRef.current <= 0.5 && direction < 0) || (xRef.current >= maxX - 0.5 && direction > 0);
          if (!reducedMotionRef.current && pushingEdge && closeness > 0.45 && ts - lastWrapRef.current > 280) {
            xRef.current = direction > 0 ? 0 : maxX;
            setX(xRef.current);
            lastWrapRef.current = ts;
          }
        } else if (!reducedMotionRef.current) {
          const patrolSpeed = 42;
          targetVelocity = patrolSpeed * patrolDirRef.current;
          if (xRef.current <= 0.5) patrolDirRef.current = 1;
          if (xRef.current >= maxX - 0.5) patrolDirRef.current = -1;
        } else {
          targetVelocity = 0;
        }
        if (reducedMotionRef.current) {
          xRef.current = Math.max(0, Math.min(maxX, xRef.current + Math.sign(targetVelocity) * 24));
          vRef.current = 0;
          setX(xRef.current);
        } else {
          vRef.current += (targetVelocity - vRef.current) * 0.14;
          xRef.current += vRef.current * dt;
          xRef.current = Math.max(0, Math.min(maxX, xRef.current));
          setX(xRef.current);
        }
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };

    readBounds();
    roRef.current = new ResizeObserver(() => readBounds());
    if (laneRef.current) roRef.current.observe(laneRef.current);
    if (runnerRef.current) {
      roRef.current.observe(runnerRef.current);
      runnerRef.current.addEventListener("mouseenter", onEnter);
      runnerRef.current.addEventListener("mouseleave", onLeave);
    }
    window.addEventListener("pointermove", onPointerMove as any, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("resize", readBounds);
    window.addEventListener("scroll", readBounds, true);
    const onDoors = () => {
      if (!hasDoorsGlitchedRef.current) {
        hasDoorsGlitchedRef.current = true;
        setDoorsGlitch(true);
        setTimeout(() => setDoorsGlitch(false), 900);
      }
    };
    window.addEventListener("arcade:doors", onDoors);
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      mql.removeEventListener?.("change", updateReduced);
      window.removeEventListener("pointermove", onPointerMove as any);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", readBounds);
      window.removeEventListener("scroll", readBounds, true);
      window.removeEventListener("arcade:doors", onDoors);
      if (runnerRef.current) {
        runnerRef.current.removeEventListener("mouseenter", onEnter);
        runnerRef.current.removeEventListener("mouseleave", onLeave);
      }
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (roRef.current) roRef.current.disconnect();
    };
  }, []);

  return (
    <>
      <div ref={laneRef} className="relative w-full max-w-[1088px] h-[34px] mx-auto">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-accent opacity-[0.45]" />
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] flex items-center justify-between">
          <div className="w-[6px] h-[6px] bg-accent" />
          <div className="w-3 h-3 flex items-center justify-between flex-1 mx-2">
            <div className="w-[3px] h-[3px] bg-accent opacity-40" />
            <div className="w-[3px] h-[3px] bg-accent opacity-40" />
            <div className="w-[3px] h-[3px] bg-accent opacity-40" />
          </div>
          <div className="w-[6px] h-[6px] bg-accent" />
        </div>

        <div
          ref={runnerRef}
          style={{
            transform: `translateX(${x}px) scale(${scale})`,
            filter,
            willChange: "transform, filter",
          }}
          className="absolute left-0 top-0 w-[28px] h-[30px] select-none"
        >
          <div className="absolute left-[3px] top-[24px] w-[22px] h-[4px] rounded-full opacity-[0.22] bg-accent" />
          <div className="absolute left-0 top-0 w-[28px] h-[27px]">
            <div className="absolute left-[9px] top-0 w-[10px] h-[9px] bg-accent" />
            <div className="absolute left-[11px] top-[1px] w-[5px] h-[4px] bg-raised-surface" />
            <div className="absolute left-[15px] top-[4px] w-[2px] h-[2px] bg-surface" />
            <div className="absolute left-[12px] top-[8px] w-[4px] h-[3px] bg-accent" />
            <div className="absolute left-[8px] top-[10px] w-[12px] h-[10px] bg-accent" />
            <div className="absolute left-[11px] top-[13px] w-[6px] h-[3px] bg-surface" />
            <div className="absolute left-[4px] top-[12px] w-[4px] h-[8px] bg-accent" />
            <div className="absolute left-[20px] top-[12px] w-[4px] h-[8px] bg-accent" />
            <div className="absolute left-[9px] top-[18px] w-[4px] h-[6px] bg-accent" />
            <div className="absolute left-[15px] top-[18px] w-[4px] h-[6px] bg-accent" />
            <div className="absolute left-[6px] top-[22px] w-[7px] h-[2px] bg-raised-surface" />
            <div className="absolute left-[15px] top-[22px] w-[7px] h-[2px] bg-raised-surface" />
          </div>
        </div>
      </div>

      {doorsGlitch && (
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center pointer-events-none overflow-hidden"
          style={{
            background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.85), rgba(0,0,0,0.85) 2px, transparent 2px, transparent 4px), repeating-linear-gradient(90deg, rgba(168,105,219,0.3), rgba(168,105,219,0.3) 2px, transparent 2px, transparent 4px)",
            backgroundColor: "rgba(10,7,16,0.96)",
            animation: "flee-glitch 0.12s infinite, flee-fade 0.9s forwards",
            cursor: "url('/cursors-doors/rush.ani'), url('/cursors-doors/rush-static.cur'), url('/cursor-pwned.svg'), auto",
          }}
        >
          <div
            className="absolute top-[8%] left-[5%] font-dm text-[min(8vw,110px)] text-accent mix-blend-screen tracking-tight"
            style={{ textShadow: "4px 4px 0px #DDBCF3, -4px -4px 0px #fff", animation: "doors-shake 0.06s infinite" }}
          >
            01010
          </div>
          <div
            className="absolute bottom-[10%] right-[5%] font-dm text-[min(7vw,90px)] text-accent-soft mix-blend-screen"
            style={{ textShadow: "3px 3px 0px #A869DB", animation: "doors-shake 0.08s infinite reverse" }}
          >
            10101
          </div>
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-dm text-[min(14vw,180px)] text-white tracking-widest mix-blend-difference"
            style={{ textShadow: "6px 6px 0px #A869DB, -6px -6px 0px #DDBCF3, 0 0 30px rgba(168,105,219,0.8)", animation: "doors-shake 0.04s infinite" }}
          >
            PWNED
          </div>
          <style>{`
            @keyframes flee-glitch {0%{filter:invert(0) hue-rotate(0deg) contrast(1)}20%{filter:invert(1) hue-rotate(90deg) contrast(2)}40%{filter:invert(0) hue-rotate(180deg) contrast(1.5)}60%{filter:invert(1) hue-rotate(270deg) contrast(3)}80%{filter:invert(0) hue-rotate(360deg) contrast(1)}100%{filter:invert(1) hue-rotate(45deg) contrast(2)}}
            @keyframes flee-fade{0%{opacity:0}5%{opacity:1}90%{opacity:1}100%{opacity:0}}
          `}</style>
        </div>
      )}
    </>
  );
}
