import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number; type: string; t: number };

export default function ArcadeRunnerLane() {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const runnerRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<Point | null>(null);
  const pointerActiveRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const visibleRef = useRef(true);
  const xRef = useRef(0);
  const vRef = useRef(0);
  const patrolDirRef = useRef<1 | -1>(1);
  const maxXRef = useRef(0);
  const lastWrapRef = useRef(0);
  const hoverStartRef = useRef<number | null>(null);
  const antRef = useRef(0);
  const isHoveringRef = useRef(false);
  const overdriveUntilRef = useRef(0);
  const overdriveDirectionRef = useRef<1 | -1>(1);
  const frameRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const lastTsRef = useRef(0);
  const hasDoorsGlitchedRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);

  const [doorsGlitch, setDoorsGlitch] = useState(false);
  const [hoverable, setHoverable] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(hover: none)").matches) {
      setHoverable(false);
      return;
    };
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReduced = () => (reducedMotionRef.current = mql.matches);
    updateReduced();
    mql.addEventListener?.("change", updateReduced);

    const writeRunner = (x: number, scale: number, filter: string) => {
      const runner = runnerRef.current;
      if (!runner) return;
      runner.style.transform = `translateX(${x}px) scale(${scale})`;
      runner.style.filter = filter;
    };

    const readBounds = () => {
      const lane = laneRef.current;
      const runner = runnerRef.current;
      if (!lane || !runner) return;
      const laneRect = lane.getBoundingClientRect();
      const runnerRect = runner.getBoundingClientRect();
      const maxX = Math.max(0, laneRect.width - runnerRect.width - 14);
      maxXRef.current = maxX;
      xRef.current = Math.max(0, Math.min(maxX, xRef.current));
    };

    const triggerDoorsGlitch = (ts: number) => {
      if (hasDoorsGlitchedRef.current) return;
      hasDoorsGlitchedRef.current = true;
      const runner = runnerRef.current;
      const runnerRect = runner?.getBoundingClientRect();
      const maxX = maxXRef.current;
      const pointer = pointerRef.current;
      setDoorsGlitch(true);
      if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = window.setTimeout(() => setDoorsGlitch(false), 900);
      const dur = reducedMotionRef.current ? 175 : 825;
      overdriveUntilRef.current = ts + dur;
      overdriveDirectionRef.current =
        pointer && runnerRect ? (pointer.x < runnerRect.left + runnerRect.width / 2 ? 1 : -1) : 1;
      hoverStartRef.current = null;
      if (reducedMotionRef.current) {
        const j = overdriveDirectionRef.current > 0 ? maxX : 0;
        xRef.current = j;
        writeRunner(j, 1, "drop-shadow(0 0 10px var(--color-accent))");
      }
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
      frameRef.current = null;
      const lane = laneRef.current;
      const runner = runnerRef.current;
      if (!lane || !runner) {
        if (visibleRef.current) frameRef.current = window.requestAnimationFrame(tick);
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
      const laneNear =
        hasPointer && pointer
          ? distanceToRect(pointer.x, pointer.y, laneRect) < 120 ||
            distanceToRect(pointer.x, pointer.y, runnerRect) < 180
          : false;
      const overdrive = ts < overdriveUntilRef.current;
      let targetVelocity = 0;
      const hovering = isHoveringRef.current;

      if (hovering && !overdrive && !hasDoorsGlitchedRef.current) {
        if (hoverStartRef.current === null) hoverStartRef.current = ts;
        if (hoverStartRef.current !== null && ts - hoverStartRef.current >= 350) {
          triggerDoorsGlitch(ts);
        }
      } else {
        hoverStartRef.current = null;
      }

      if (overdrive) {
        if (reducedMotionRef.current) {
          writeRunner(xRef.current, 1, "drop-shadow(0 0 10px var(--color-accent))");
        } else {
          const dir = overdriveDirectionRef.current;
          const targetX = dir > 0 ? maxX : 0;
          if (ts <= overdriveUntilRef.current - 100) {
            xRef.current += (targetX - xRef.current) * 0.35;
          }
          const pulse = 1 + Math.sin((overdriveUntilRef.current - ts) * 0.08) * 0.08;
          const scale = Math.max(1, pulse + 0.05);
          writeRunner(
            xRef.current,
            scale,
            `drop-shadow(${8 * dir}px 0 0 var(--color-accent)) drop-shadow(${16 * dir}px 0 0 color-mix(in srgb, var(--color-accent) 65%, transparent)) drop-shadow(0 0 12px var(--color-accent))`
          );
        }
      } else {
        let ant = 0;
        if (hovering && !hasDoorsGlitchedRef.current) {
          const start = hoverStartRef.current ?? ts;
          const raw = Math.max(0, Math.min(1, (ts - start) / 350));
          ant = raw * raw;
          antRef.current = ant;
        } else {
          ant = Math.max(0, antRef.current - dt / 0.15);
          antRef.current = ant;
        }
        const windup = reducedMotionRef.current ? 0 : ant;
        const windupScale = 1 + 0.3 * windup;
        const windupFilter =
          ant > 0.02
            ? `drop-shadow(0 0 ${(8 + 10 * ant).toFixed(1)}px var(--color-accent))`
            : "none";
        if (hovering) {
          targetVelocity = 0;
          writeRunner(xRef.current, windupScale, windupFilter);
        } else if (laneNear && hasPointer && pointer) {
          const centerX = runnerRect.left + runnerRect.width / 2;
          const dx = centerX - pointer.x;
          const direction: 1 | -1 = dx >= 0 ? 1 : -1;
          const distance = Math.abs(dx);
          const closeness = 1 - Math.min(distance, 240) / 240;
          const speed = reducedMotionRef.current ? 90 : 70 + closeness * 680;
          targetVelocity = speed * direction;
          const pushingEdge =
            (xRef.current <= 0.5 && direction < 0) || (xRef.current >= maxX - 0.5 && direction > 0);
          if (!reducedMotionRef.current && pushingEdge && closeness > 0.45 && ts - lastWrapRef.current > 280) {
            xRef.current = direction > 0 ? 0 : maxX;
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
          writeRunner(xRef.current, windupScale, windupFilter);
        } else {
          vRef.current += (targetVelocity - vRef.current) * 0.14;
          xRef.current += vRef.current * dt;
          xRef.current = Math.max(0, Math.min(maxX, xRef.current));
          writeRunner(xRef.current, windupScale, windupFilter);
        }
      }
      if (visibleRef.current) frameRef.current = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (frameRef.current === null) {
        lastTsRef.current = 0;
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };

    readBounds();
    roRef.current = new ResizeObserver(() => readBounds());
    if (laneRef.current) roRef.current.observe(laneRef.current);
    if (runnerRef.current) {
      roRef.current.observe(runnerRef.current);
      runnerRef.current.addEventListener("mouseenter", onEnter);
      runnerRef.current.addEventListener("mouseleave", onLeave);
    }
    ioRef.current = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries[0]?.isIntersecting ?? true;
        if (visibleRef.current) startLoop();
      },
      { threshold: 0 }
    );
    if (laneRef.current) ioRef.current.observe(laneRef.current);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("resize", readBounds);
    window.addEventListener("scroll", readBounds, true);
    const onDoors = () => triggerDoorsGlitch(performance.now());
    window.addEventListener("arcade:doors", onDoors);
    startLoop();
    return () => {
      mql.removeEventListener?.("change", updateReduced);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", readBounds);
      window.removeEventListener("scroll", readBounds, true);
      window.removeEventListener("arcade:doors", onDoors);
      if (runnerRef.current) {
        runnerRef.current.removeEventListener("mouseenter", onEnter);
        runnerRef.current.removeEventListener("mouseleave", onLeave);
      }
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (roRef.current) roRef.current.disconnect();
      if (ioRef.current) ioRef.current.disconnect();
      if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!doorsGlitch) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
        setDoorsGlitch(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doorsGlitch]);

  const activateFromInput = () => {
    if (hasDoorsGlitchedRef.current) return;
    window.dispatchEvent(new CustomEvent("arcade:doors"));
  };

  if (!hoverable) return null;

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
          role="button"
          tabIndex={0}
          aria-label="arcade runner"
          onClick={activateFromInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              activateFromInput();
            }
          }}
          style={{ willChange: "transform, filter" }}
          className="absolute left-0 top-0 w-[28px] h-[30px] select-none cursor-pointer outline-none"
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
        <div className="doors-overlay">
          <div className="doors-binary doors-binary-tl" aria-hidden="true">
            01010
          </div>
          <div className="doors-binary doors-binary-br" aria-hidden="true">
            10101
          </div>
          <div className="doors-bar doors-bar-a" aria-hidden="true" />
          <div className="doors-bar doors-bar-b" aria-hidden="true" />
          <div className="doors-ghost" aria-hidden="true">
            5Y5T3M_BR34CH
          </div>
          <div className="doors-word" data-text="PWNED" role="img" aria-label="PWNED">
            PWNED
          </div>
        </div>
      )}
    </>
  );
}
