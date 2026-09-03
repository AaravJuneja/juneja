import { useEffect, useRef, useState } from "react";

const KONAMI_CODES = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "KeyB", "KeyA",
];

export default function KonamiPwned() {
  const [pwned, setPwned] = useState(false);
  const timerRef = useRef<number | null>(null);

  const trigger = () => {
    setPwned(true);
    try {
      localStorage.setItem("pwned", "1");
    } catch {}
    window.dispatchEvent(new CustomEvent("konami:pwned"));
    window.dispatchEvent(new CustomEvent("arcade:doors"));
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
    const pressed: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      pressed.push(e.code);
      if (pressed.length > KONAMI_CODES.length) pressed.shift();
      if (pressed.join(",") === KONAMI_CODES.join(",")) {
        if (!pwned) trigger();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
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
