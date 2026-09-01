import { useEffect, useRef, useState } from "react";

const KONAMI = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];

export default function KonamiPwned() {
  const [pwned, setPwned] = useState(false);
  const timerRef = useRef<number | null>(null);

  const trigger = () => {
    setPwned(true);
    try {
      localStorage.setItem("pwned", "1");
    } catch {}
  };

  useEffect(() => {
    if (!pwned) return;
    timerRef.current = window.setTimeout(() => {
      setPwned(false);
      try {
        localStorage.removeItem("pwned");
      } catch {}
    }, 5000);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [pwned]);

  useEffect(() => {
    (window as any).__triggerKonamiPwned = trigger;
    const pressed: number[] = [];
    const onKey = (e: KeyboardEvent) => {
      pressed.push(e.keyCode);
      if (pressed.length > KONAMI.length) pressed.shift();
      if (pressed.join(",") === KONAMI.join(",")) {
        if (!pwned) trigger();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      delete (window as any).__triggerKonamiPwned;
    };
  }, [pwned]);

  useEffect(() => {
    try {
      if (localStorage.getItem("pwned") === "1") setPwned(true);
    } catch {}
  }, []);

  if (!pwned) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 999998,
        fontFamily: '"DM Retrograde", monospace',
        fontSize: 14,
        color: "var(--accent-soft)",
        background: "rgba(10,7,16,0.9)",
        border: "1px solid var(--accent)",
        borderRadius: 12,
        padding: "12px 16px",
        lineHeight: 1.4,
        whiteSpace: "pre",
      }}
    >
      {`┌─────┐\n│ what did you expect ;-; │\n└─────┘`}
    </div>
  );
}
