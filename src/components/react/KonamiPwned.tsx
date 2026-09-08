import { useEffect, useRef, useState } from "react";

const KONAMI_CODES = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "KeyB", "KeyA",
];

export default function KonamiPwned() {
  const [pwned, setPwned] = useState(false);
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const trigger = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setPwned(true);
    window.dispatchEvent(new CustomEvent("konami:pwned"));
  };

  useEffect(() => {
    if (!pwned) return;
    timerRef.current = window.setTimeout(() => {
      setPwned(false);
    }, 7000);
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

  if (!pwned) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[999998] w-[290px] bg-background/95 border border-accent rounded-xl p-4 flex flex-col gap-2.5 shadow-[6px_6px_0px_0px_var(--color-accent)]">
      <div className="flex items-center gap-2">
        <img src="/images/trophy.svg" alt="" width="16" height="16" className="w-4 h-4 theme-icon" loading="lazy" decoding="async" />
        <p className="font-dm trim-caps text-[11px] tracking-[0.08em] uppercase text-accent">CHEAT ACCEPTED</p>
        <span className="ml-auto font-dm trim-caps text-[11px] tracking-[0.08em] uppercase text-background bg-accent px-2 py-0.5">+9 LIVES</span>
      </div>
      <p className="font-outfit text-[14px] leading-snug text-text tracking-[-0.003em]">
        congrats on getting free lives! no clue what you'll do with these but they're yours now. try not to waste them.
      </p>
    </div>
  );
}
