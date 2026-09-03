import { useEffect, useRef } from "react";

const GRID = { cols: 3, rows: 1 };
const REPEL_RADIUS = 140;
const REPEL_STRENGTH = 5000;
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&";

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function ScrambleLink({ href, children }: { href: string; children: string }) {
  const elRef = useRef<HTMLAnchorElement | null>(null);
  const intervalRef = useRef<number | null>(null);

  const start = () => {
    let iter = 0;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      const next = children
        .split("")
        .map((c, i) => {
          if (c === " ") return " ";
          if (i < iter) return children[i];
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join("");
      if (elRef.current) elRef.current.textContent = next;
      iter += 1 / 3;
      if (iter >= children.length) {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        if (elRef.current) elRef.current.textContent = children;
      }
    }, 30);
  };

  const stop = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    if (elRef.current) elRef.current.textContent = children;
  };

  return (
    <a
      ref={elRef}
      href={href}
      onMouseEnter={start}
      onMouseLeave={stop}
      className="font-dm trim-caps text-[11px] tracking-[0.08em] uppercase text-accent hover:text-accent-soft transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent"
    >
      {children}
    </a>
  );
}

export default function NotFoundScatter() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cellsRef = useRef<HTMLDivElement[]>([]);
  const assembledRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const rand = seededRandom(1337);
    const cells = cellsRef.current;
    if (!cells.length) return;

    const scatter = cells.map(() => ({
      x: (rand() - 0.5) * 600,
      y: (rand() - 0.5) * 400,
      r: (rand() - 0.5) * 60,
    }));

    cells.forEach((el, i) => {
      el.style.transform = `translate(${scatter[i].x}px, ${scatter[i].y}px) rotate(${scatter[i].r}deg)`;
      el.style.opacity = "0";
    });

    const t = window.setTimeout(() => {
      cells.forEach((el) => {
        el.style.transition = "transform 0.9s cubic-bezier(0.34,1.56,0.64,1), opacity 0.6s ease";
        el.style.transform = "translate(0,0) rotate(0deg)";
        el.style.opacity = "1";
      });
      window.setTimeout(() => (assembledRef.current = true), 900);
    }, 80);

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onPointerMove as any, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const tick = () => {
      if (assembledRef.current && containerRef.current) {
        const pointer = pointerRef.current;
        cells.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = cx - pointer.x;
          const dy = cy - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < REPEL_RADIUS && dist > 0.1) {
            const force = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH / (dist * dist + 40);
            const ox = (dx / dist) * force * 0.08;
            const oy = (dy / dist) * force * 0.08;
            el.style.transform = `translate(${ox}px, ${oy}px) rotate(${ox * 0.3}deg)`;
          } else {
            el.style.transform = "translate(0,0) rotate(0deg)";
          }
        });
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      cells.forEach((el) => {
        el.style.transition = "none";
        el.style.transform = "none";
        el.style.opacity = "1";
      });
      assembledRef.current = false;
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    }

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointermove", onPointerMove as any);
      window.removeEventListener("mousemove", onMouseMove);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const letters = [["4", "Ø", "4"]];

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center justify-center gap-10 py-8 flex-1">
      <div className="grid gap-2 select-none" style={{ gridTemplateColumns: `repeat(${GRID.cols}, 96px)`, gridTemplateRows: `repeat(${GRID.rows}, 96px)` }}>
        {letters.flat().map((ch, i) => (
          <div
            key={i}
            ref={(el) => {
              if (el) cellsRef.current[i] = el;
            }}
            className="flex items-center justify-center font-dm trim-caps font-bold text-[48px] sm:text-[56px] leading-none border border-line bg-raised-surface text-text"
            style={{ opacity: 0, willChange: "transform, opacity" }}
          >
            {ch}
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="font-dm trim-caps font-bold text-[22px] sm:text-[26px] leading-none tracking-tight text-text uppercase">Everything is STILL AWESOME!</p>
        <p className="font-outfit text-[14px] leading-[1.5] text-muted-text max-w-[42ch] sm:max-w-none sm:whitespace-nowrap">Maybe the real website was the friends we made along the way.</p>
        <div className="flex items-center gap-6">
          <ScrambleLink href="/">RETURN HOME</ScrambleLink>
          <span className="text-line">/</span>
          <ScrambleLink href="/#writeups">VIEW WRITEUPS</ScrambleLink>
        </div>
      </div>
    </div>
  );
}
