import { useEffect, useRef, useState } from "react";

type Props = {
  covers: {
    default: { collapsed: string; expanded: string };
    doors: { collapsed: string; expanded: string };
  };
};

type Track = {
  slug: string;
  title: string;
  cover: "default" | "doors";
  portrait?: boolean;
};

const TRACKS: Track[] = [
  { slug: "rescue-you", title: "Rescue You", cover: "default" },
  { slug: "do-it", title: "Do It", cover: "default" },
  { slug: "release-me", title: "Release Me", cover: "default" },
  { slug: "birthday-suit", title: "Birthday Suit", cover: "default" },
  { slug: "x-ray", title: "X-Ray", cover: "default" },
  { slug: "appointment", title: "Appointment", cover: "default" },
  { slug: "elevator-jam", title: "Elevator Jam", cover: "doors", portrait: true },
];

const POOL = TRACKS.map((t, i) => (t.portrait ? -1 : i)).filter((i) => i >= 0);
const PORTRAIT_IDX = TRACKS.findIndex((t) => t.portrait);

const CROSSFADE: Record<string, { in: number; out: number }> = {
  "birthday-suit": { in: 0.35, out: 4.75 },
  "do-it": { in: 0.35, out: 6.25 },
  "release-me": { in: 0.45, out: 6.0 },
  "rescue-you": { in: 0.45, out: 6.5 },
  "appointment": { in: 0.4, out: 2.5 },
  "x-ray": { in: 0.4, out: 7.0 },
};

const pick = (exclude: number) => {
  const options = POOL.filter((i) => i !== exclude);
  const list = options.length > 0 ? options : POOL;
  return list[Math.floor(Math.random() * list.length)];
};

const getCookie = (n: string) =>
  (typeof document !== "undefined" &&
    document.cookie.match(new RegExp("(?:^|;)\\s*" + n + "=([^;]*)"))?.[1]) ||
  undefined;
const delCookie = (n: string) => {
  try {
    document.cookie = `${n}=; max-age=0; path=/; SameSite=Lax`;
  } catch {}
};

const isClaimed = () => getCookie("portrait") === "claimed";

export default function SpotifyPlayer({ covers }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const crossfadeRef = useRef<{ outgoing: number; incoming: number; startTime: number } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const playRef = useRef(false);
  const stashRef = useRef<{ idx: number; time: number; playing: boolean } | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const idxRef = useRef(0);
  idxRef.current = trackIdx;
  const track = TRACKS[trackIdx];
  const crossfade = CROSSFADE[track.slug] || { in: 0.35, out: 5.0 };

  const toggle = () => {
    const a = audioRef.current;
    if (!a || audioError) return;
    if (playing) {
      playRef.current = false;
      a.pause();
    } else {
      playRef.current = true;
      a.play().catch(() => {
        playRef.current = false;
        setAudioError(true);
      });
    }
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const seekTo = (clientX: number) => {
    const a = audioRef.current;
    const bar = barRef.current;
    if (!a || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = pct * duration;
    setCurrent(pct * duration);
  };

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    seekTo(e.clientX);
  };

  const onSeekKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const step = e.key.startsWith("Page") ? 30 : 5;
    if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      a.currentTime = Math.min(duration, a.currentTime + step);
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      a.currentTime = Math.max(0, a.currentTime - step);
    }
    if (e.key === "Home") {
      e.preventDefault();
      a.currentTime = 0;
    }
    if (e.key === "End") {
      e.preventDefault();
      a.currentTime = duration;
    }
  };

  useEffect(() => {
    if (isClaimed() && PORTRAIT_IDX >= 0) {
      setTrackIdx(PORTRAIT_IDX);
    } else {
      setTrackIdx(pick(-1));
    }
    const onClaimed = () => {
      if (PORTRAIT_IDX < 0) return;
      const cur = idxRef.current;
      if (!TRACKS[cur]?.portrait && !stashRef.current) {
        stashRef.current = {
          idx: cur,
          time: audioRef.current?.currentTime || 0,
          playing: playRef.current,
        };
      }
      playRef.current = false;
      if (nextAudioRef.current) {
        nextAudioRef.current.pause();
        nextAudioRef.current = null;
      }
      audioRef.current?.pause();
      setPlaying(false);
      setCurrent(0);
      setTrackIdx(PORTRAIT_IDX);
    };
    window.addEventListener("portrait:claimed", onClaimed);
    return () => window.removeEventListener("portrait:claimed", onClaimed);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    setCurrent(0);
    setDuration(0);

    if (nextAudioRef.current) {
      nextAudioRef.current.pause();
      nextAudioRef.current = null;
    }
    crossfadeRef.current = null;

    const currentTrack = TRACKS[trackIdx];
    const isPortrait = currentTrack?.portrait;
    const cf = isPortrait ? { in: 0, out: 0 } : (CROSSFADE[currentTrack?.slug || ""] || { in: 0.35, out: 5.0 });

    const preloadAudio = () => {
      a.preload = "metadata";
      a.load();
      if (playRef.current) {
        a.play().catch(() => {
          playRef.current = false;
          setPlaying(false);
        });
      }

      if (!isPortrait) {
        const nextIdx = pick(trackIdx);
        const nextTrack = TRACKS[nextIdx];
        if (nextTrack && !nextTrack.portrait) {
          const nextAudio = new Audio();
          nextAudio.preload = "metadata";
          nextAudio.src = `/audio/${nextTrack.slug}.webm`;
          nextAudio.addEventListener("error", () => {
            nextAudio.src = `/audio/${nextTrack.slug}.mp3`;
            nextAudio.load();
          });
          nextAudio.load();
          nextAudioRef.current = nextAudio;
        }
      }
    };

    if (document.readyState === "complete") {
      preloadAudio();
    } else {
      window.addEventListener("load", preloadAudio, { once: true });
      return () => window.removeEventListener("load", preloadAudio);
    }
  }, [trackIdx]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const currentTrack = TRACKS[trackIdx];
    const isPortrait = currentTrack?.portrait;
    const cf = isPortrait ? { in: 0, out: 0 } : (CROSSFADE[currentTrack?.slug || ""] || { in: 0.35, out: 5.0 });

    let crossfadeTimer: number | null = null;

    const onTime = () => {
      setCurrent(a.currentTime);

      if (!isPortrait && crossfadeRef.current === null && nextAudioRef.current && a.duration) {
        const remaining = a.duration - a.currentTime;
        if (remaining <= cf.out) {
          crossfadeRef.current = { outgoing: cf.out, incoming: cf.in, startTime: a.currentTime };
          const next = nextAudioRef.current;
          next.volume = 0;
          next.currentTime = 0;
          next.play().catch(() => {});

          crossfadeTimer = window.setInterval(() => {
            if (!audioRef.current || audioRef.current !== a) {
              if (crossfadeTimer) window.clearInterval(crossfadeTimer);
              return;
            }
            const elapsed = audioRef.current.currentTime - (crossfadeRef.current?.startTime || 0);
            const progress = Math.min(1, elapsed / cf.out);
            const fadeOut = Math.cos(progress * Math.PI / 2);
            const fadeIn = Math.sin(progress * Math.PI / 2);
            audioRef.current.volume = fadeOut;
            if (nextAudioRef.current) nextAudioRef.current.volume = fadeIn;

            if (progress >= 1) {
              window.clearInterval(crossfadeTimer!);
              crossfadeTimer = null;
              if (audioRef.current) audioRef.current.pause();
              const next = nextAudioRef.current;
              audioRef.current = next;
              nextAudioRef.current = null;
              crossfadeRef.current = null;
              if (next) setDuration(next.duration || 0);
            }
          }, 50);
        }
      }
    };
    const onLoaded = () => {
      setDuration(a.duration || 0);
      if (pendingSeekRef.current !== null) {
        const t = Math.min(pendingSeekRef.current, (a.duration || 0) - 0.25);
        pendingSeekRef.current = null;
        if (t > 0) {
          try {
            a.currentTime = t;
          } catch {}
          setCurrent(t);
        }
      }
    };
    const onEnded = () => {
      setCurrent(0);
      if (TRACKS[trackIdx]?.portrait) {
        delCookie("portrait");
        playRef.current = false;
        const stash = stashRef.current;
        stashRef.current = null;
        if (stash) {
          pendingSeekRef.current = stash.time;
          if (stash.playing) playRef.current = true;
          setTrackIdx(stash.idx);
        } else {
          setTrackIdx(pick(-1));
        }
        window.dispatchEvent(new CustomEvent("portrait:cleared"));
      } else {
        setTrackIdx((i) => pick(i));
      }
    };
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
      if (crossfadeTimer) window.clearInterval(crossfadeTimer);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("error", onError);
    };
  }, [trackIdx]);

  const pct = duration ? (current / duration) * 100 : 0;

  const [seen, setSeen] = useState(false);

  return (
    <div
      onMouseEnter={() => {
        setExpanded(true);
        setSeen(true);
      }}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => {
        setExpanded(true);
        setSeen(true);
      }}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        setExpanded(false);
      }}
      className="relative shrink-0"
      style={{ width: expanded ? "min(340px, calc(100vw - 48px))" : 180, height: 44, transition: "opacity 200ms ease, transform 200ms ease" }}
    >
      <button
        type="button"
        onClick={() => {
          setSeen(true);
          setExpanded((v) => !v);
        }}
        className="absolute inset-0 flex items-center gap-3 px-3 border border-line hover:border-line transition-opacity cursor-pointer text-left"
        style={{
          width: 180,
          height: 44,
          borderRadius: expanded ? 12 : 9999,
          background: "#251a3a",
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? "none" : "auto",
          transition: "opacity 200ms ease",
        }}
      >
        <div className="w-7 h-7 rounded-full overflow-hidden border border-line shrink-0">
          <img src={covers[track.cover].collapsed} alt="Album Art" width={28} height={28} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="eager" decoding="async" fetchPriority="low" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-dm trim-caps text-[12px] tracking-[0.08em] uppercase text-muted-text leading-none">Now Playing</span>
          <span className="font-outfit font-medium text-[14px] text-text leading-none truncate tracking-[-0.003em]">{track.title}</span>
        </div>
      </button>

      {seen && (
      <div
        id="spotify-panel"
        onKeyDown={(e) => {
          if (e.key === "Escape") setExpanded(false);
        }}
        className="absolute right-0 top-0 flex flex-col gap-3 p-3 border border-line overflow-hidden"
        style={{
          width: "min(340px, calc(100vw - 48px))",
          height: "auto",
          minHeight: 110,
          borderRadius: 12,
          background: "#251a3a",
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? "auto" : "none",
          transform: expanded ? "translateY(0) scale(1)" : "translateY(4px) scale(0.98)",
          transition: "opacity 220ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)",
          zIndex: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-md overflow-hidden border border-line shrink-0 relative">
            <img
              src={covers[track.cover].expanded}
              alt="Album Art"
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div className="absolute inset-0 bg-accent/10 mix-blend-overlay" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-dm trim-caps text-[12px] tracking-[0.08em] uppercase text-accent-soft">Now Playing</span>
            <span className="font-outfit font-medium text-[14px] text-text truncate tracking-[-0.003em]">{track.title}</span>
          </div>
          <div className="flex items-end gap-0.5 h-3 ml-1 shrink-0" aria-hidden="true">
            <span className={`w-0.5 bg-accent rounded-full origin-bottom ${playing ? "animate-bar-1 h-3" : ""}`} style={!playing ? { height: 6 } : undefined} />
            <span className={`w-0.5 bg-accent rounded-full origin-bottom ${playing ? "animate-bar-2 h-3" : ""}`} style={!playing ? { height: 10 } : undefined} />
            <span className={`w-0.5 bg-accent rounded-full origin-bottom ${playing ? "animate-bar-3 h-3" : ""}`} style={!playing ? { height: 7 } : undefined} />
          </div>
          <button
            onClick={toggle}
            className="ml-auto w-9 h-9 rounded-full bg-accent text-background flex items-center justify-center hover:brightness-110 active:scale-95 transition-all shrink-0"
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="3" width="3" height="8" rx="1" fill="currentColor"/><rect x="8" y="3" width="3" height="8" rx="1" fill="currentColor"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-0.5"><path d="M4 3L10 7L4 11V3Z" fill="currentColor"/></svg>
            )}
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <div
            ref={barRef}
            onClick={onSeek}
            onPointerDown={(e) => seekTo(e.clientX)}
            onKeyDown={onSeekKey}
            className="relative w-full h-1.5 rounded-full overflow-hidden cursor-pointer group"
            style={{ background: "color-mix(in srgb, var(--color-line) 60%, transparent)" }}
          >
            <div className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-75" style={{ width: `${pct}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent-soft rounded-full shadow border border-background transition-all opacity-0 group-hover:opacity-100" style={{ left: `calc(${pct}% - 6px)` }} />
          </div>
          <div className="flex items-center justify-between font-outfit text-[12px] tracking-[0.02em] text-muted-text tabular-nums">
          <span>{fmt(current)}</span>
          <span>{fmt(duration)}</span>
        </div>
        </div>
      </div>
      )}
      <audio key={track.slug} ref={audioRef} preload="none" style={{ display: "none" }}>
        <source src={`/audio/${track.slug}.webm`} type="audio/webm" />
        <source src={`/audio/${track.slug}.mp3`} type="audio/mpeg" />
      </audio>
    </div>
  );
}
