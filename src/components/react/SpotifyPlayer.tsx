import { useEffect, useRef, useState } from "react";

type Props = {
  artSrcCollapsed: string;
  artSrcExpanded: string;
  title: string;
};

export default function SpotifyPlayer({ artSrcCollapsed, artSrcExpanded, title }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(294);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const toggle = () => {
    const a = audioRef.current;
    if (!a || audioError) return;
    if (playing) {
      a.pause();
    } else {
      a.play().catch(() => setAudioError(true));
    }
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    const bar = barRef.current;
    if (!a || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    a.currentTime = pct * duration;
    setCurrent(pct * duration);
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const preloadAudio = () => {
      a.preload = "metadata";
      a.load();
    };
    if (document.readyState === "complete") {
      preloadAudio();
    } else {
      window.addEventListener("load", preloadAudio, { once: true });
      return () => window.removeEventListener("load", preloadAudio);
    }
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onLoaded = () => setDuration(a.duration || 0);
    const onEnded = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => setAudioError(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("ended", onEnded);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("error", onError);
    if (a.duration) setDuration(a.duration);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("error", onError);
    };
  }, []);

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="relative shrink-0"
      style={{ width: expanded ? 352 : 180, height: 44, transition: "all 200ms ease" }}
    >
      <div
        className="absolute inset-0 flex items-center gap-3 px-3 border hover:border-accent transition-colors cursor-pointer"
        style={{
          width: 180,
          height: 44,
          borderRadius: expanded ? 12 : 9999,
          background: "#251a3a",
          borderColor: "rgba(168,105,219,0.35)",
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? "none" : "auto",
          transition: "all 200ms ease",
        }}
      >
        <div className="w-7 h-7 rounded-full overflow-hidden border border-line shrink-0">
          <img src={artSrcCollapsed} alt="Album Art" width={28} height={28} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="eager" decoding="async" fetchPriority="high" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-dm text-[11px] tracking-[0.08em] uppercase text-muted-text leading-none">Now Playing</span>
          <span className="font-outfit font-medium text-[14px] text-text leading-none truncate tracking-[-0.003em]">{title}</span>
        </div>
      </div>

      <div
        className="absolute right-0 top-0 flex flex-col gap-3 p-3 border overflow-hidden"
        style={{
          width: 352,
          height: "auto",
          minHeight: 110,
          borderRadius: 12,
          borderColor: expanded ? "var(--accent-soft)" : "rgba(168,105,219,0.35)",
          background: "#251a3a",
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? "auto" : "none",
          transform: expanded ? "translateY(0) scale(1)" : "translateY(4px) scale(0.98)",
          transition: "all 220ms cubic-bezier(0.16,1,0.3,1)",
          zIndex: 20,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-md overflow-hidden border border-accent/30 shrink-0 relative">
            <img
              src={artSrcExpanded}
              alt="Album Art"
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div className="absolute inset-0 bg-accent/10 mix-blend-overlay" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-dm text-[11px] tracking-[0.08em] uppercase text-accent-soft">Now Playing</span>
            <span className="font-outfit font-medium text-[14px] text-text truncate tracking-[-0.003em]">{title}</span>
          </div>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="ml-auto w-9 h-9 rounded-full bg-accent text-background flex items-center justify-center hover:brightness-110 active:scale-95 transition-all shrink-0 shadow-[0_2px_8px_rgba(168,105,219,0.4)]"
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="3" width="3" height="8" rx="1" fill="currentColor"/><rect x="8" y="3" width="3" height="8" rx="1" fill="currentColor"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-0.5"><path d="M4 3L10 7L4 11V3Z" fill="currentColor"/></svg>
            )}
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <div ref={barRef} onClick={onSeek} className="relative w-full h-1.5 rounded-full overflow-hidden cursor-pointer group" style={{ background: "rgba(58,43,70,0.6)" }}>
            <div className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-75" style={{ width: `${pct}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent-soft rounded-full shadow border border-background transition-all opacity-0 group-hover:opacity-100" style={{ left: `calc(${pct}% - 6px)` }} />
          </div>
          <div className="flex items-center justify-between font-outfit text-[12px] tracking-[0.02em] text-muted-text">
            <span>{fmt(current)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        <audio ref={audioRef} preload="none" style={{ display: "none" }}>
          <source src="/thenoise.webm" type="audio/webm" />
          <source src="/thenoise.mp3" type="audio/mpeg" />
        </audio>
      </div>
    </div>
  );
}
