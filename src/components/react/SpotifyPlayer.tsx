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

const FADE_IN: Record<string, number> = {
  "birthday-suit": 4.0,
  "do-it": 4.0,
  "release-me": 6.0,
  "rescue-you": 6.0,
  "appointment": 6.0,
  "x-ray": 4.0,
};

const shufflePool = (exclude: number) => {
  const base = POOL.filter((i) => i !== exclude);
  const list = base.length > 0 ? base : [...POOL];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  if (list.length > 1 && exclude >= 0 && list[0] === exclude) {
    [list[0], list[1]] = [list[1], list[0]];
  }
  return list;
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

const fadeInOf = (slug: string) => FADE_IN[slug] ?? 4.0;

export default function SpotifyPlayer({ covers }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);
  const [seen, setSeen] = useState(false);

  const deckRef = useRef<(HTMLAudioElement | null)[]>([null, null]);
  const activeRef = useRef(0);
  const fadeTimerRef = useRef<number | null>(null);
  const crossfadeRef = useRef<{ out: number; startTime: number } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const playRef = useRef(false);
  const stashRef = useRef<{ idx: number; time: number; playing: boolean } | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const queueRef = useRef<number[]>([]);
  const posRef = useRef(0);
  const nextIdxRef = useRef(-1);
  const initRef = useRef(false);
  const idxRef = useRef(0);
  idxRef.current = trackIdx;
  const track = TRACKS[trackIdx];

  const activeDeck = () => deckRef.current[activeRef.current] ?? null;
  const standbyDeck = () => deckRef.current[1 - activeRef.current] ?? null;

  const takeNext = (currentIdx: number) => {
    let q = queueRef.current;
    if (q.length === 0 || posRef.current >= q.length) {
      q = shufflePool(currentIdx);
      queueRef.current = q;
      posRef.current = 0;
    }
    const at = posRef.current;
    posRef.current = at + 1;
    return q[at];
  };

  const peekNext = () => {
    let q = queueRef.current;
    if (q.length === 0 || posRef.current >= q.length) {
      q = shufflePool(idxRef.current);
      queueRef.current = q;
      posRef.current = 0;
    }
    return q[posRef.current];
  };

  const setDeckSrc = (deck: HTMLAudioElement | null, slug: string) => {
    if (!deck || deck.dataset.slug === slug) return;
    deck.dataset.slug = slug;
    deck.dataset.fallback = "";
    deck.src = `/audio/${slug}.webm`;
    deck.load();
  };

  const cancelFade = () => {
    if (fadeTimerRef.current !== null) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    crossfadeRef.current = null;
    const a = activeDeck();
    const s = standbyDeck();
    if (a) a.volume = 1;
    if (s) {
      if (!s.paused) s.pause();
      s.volume = 0;
    }
  };

  const primeStandby = (nextIdx: number) => {
    const s = standbyDeck();
    if (!s || nextIdx < 0 || TRACKS[nextIdx]?.portrait) return;
    nextIdxRef.current = nextIdx;
    s.pause();
    s.volume = 0;
    s.currentTime = 0;
    s.preload = "auto";
    setDeckSrc(s, TRACKS[nextIdx].slug);
  };

  const fadeInActive = (deck: HTMLAudioElement, secs: number) => {
    const t0 = performance.now();
    const step = () => {
      if (deck !== activeDeck() || deck.paused) return;
      const p = Math.min(1, (performance.now() - t0) / (secs * 1000));
      deck.volume = Math.sin((p * Math.PI) / 2);
      if (p < 1) window.requestAnimationFrame(step);
      else if (deck === activeDeck()) deck.volume = 1;
    };
    window.requestAnimationFrame(step);
  };

  const finishFade = () => {
    if (fadeTimerRef.current !== null) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    const a = activeDeck();
    const s = standbyDeck();
    const finishedIdx = nextIdxRef.current;
    crossfadeRef.current = null;
    nextIdxRef.current = -1;
    if (finishedIdx < 0 || !s) return;
    if (a) {
      a.pause();
      a.volume = 1;
    }
    s.volume = 1;
    activeRef.current = 1 - activeRef.current;
    playRef.current = true;
    setPlaying(true);
    setCurrent(s.currentTime);
    setDuration(s.duration || 0);
    posRef.current += 1;
    setTrackIdx(finishedIdx);
    primeStandby(peekNext());
  };

  const startFade = () => {
    const a = activeDeck();
    const s = standbyDeck();
    const nextIdx = nextIdxRef.current;
    if (!a || !s || nextIdx < 0 || crossfadeRef.current) return;
    if (!s.duration || TRACKS[idxRef.current]?.portrait) return;
    const overlap = fadeInOf(TRACKS[nextIdx]?.slug || "");
    crossfadeRef.current = { out: overlap, startTime: a.currentTime };
    s.volume = 0;
    s.currentTime = 0;
    s.play().catch(() => {});
    fadeTimerRef.current = window.setInterval(() => {
      const cur = activeDeck();
      const nxt = standbyDeck();
      const fade = crossfadeRef.current;
      if (!cur || !nxt || !fade || cur !== a || nxt !== s) {
        if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
        return;
      }
      const elapsed = cur.currentTime - fade.startTime;
      const progress = Math.min(1, Math.max(0, elapsed / fade.out));
      cur.volume = Math.cos((progress * Math.PI) / 2);
      nxt.volume = Math.sin((progress * Math.PI) / 2);
      if (progress >= 1) finishFade();
    }, 50);
  };

  const advanceFrom = (fromIdx: number) => {
    cancelFade();
    const nxt = takeNext(fromIdx);
    const outgoing = activeDeck();
    const incoming = standbyDeck();
    if (!incoming) return;
    if (outgoing) {
      outgoing.pause();
      outgoing.volume = 1;
    }
    activeRef.current = 1 - activeRef.current;
    nextIdxRef.current = -1;
    incoming.volume = 0;
    incoming.currentTime = 0;
    incoming.preload = "auto";
    setDeckSrc(incoming, TRACKS[nxt].slug);
    setCurrent(0);
    setDuration(0);
    setTrackIdx(nxt);
    if (playRef.current) {
      incoming.play().then(() => fadeInActive(incoming, fadeInOf(TRACKS[nxt]?.slug || ""))).catch(() => {
        playRef.current = false;
        setPlaying(false);
      });
    }
    primeStandby(peekNext());
  };

  const restoreTrack = (idx: number) => {
    cancelFade();
    const a = activeDeck();
    if (!a) return;
    nextIdxRef.current = -1;
    a.volume = 1;
    a.preload = "auto";
    const same = a.dataset.slug === TRACKS[idx]?.slug && a.readyState >= 1;
    setDeckSrc(a, TRACKS[idx].slug);
    setCurrent(0);
    setDuration(a.duration || 0);
    setTrackIdx(idx);
    if (same) {
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
      if (playRef.current) {
        a.play().catch(() => {
          playRef.current = false;
          setPlaying(false);
        });
      }
    }
    primeStandby(peekNext());
  };

  const toggle = () => {
    const a = activeDeck();
    if (!a || audioError) return;
    if (playing) {
      cancelFade();
      playRef.current = false;
      a.pause();
    } else if (a.ended) {
      playRef.current = true;
      advanceFrom(idxRef.current);
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
    const a = activeDeck();
    const bar = barRef.current;
    if (!a || !bar || !duration) return;
    cancelFade();
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = pct * duration;
    setCurrent(pct * duration);
  };

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    seekTo(e.clientX);
  };

  const onSeekKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const a = activeDeck();
    if (!a || !duration) return;
    const step = e.key.startsWith("Page") ? 30 : 5;
    if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      cancelFade();
      a.currentTime = Math.min(duration, a.currentTime + step);
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      cancelFade();
      a.currentTime = Math.max(0, a.currentTime - step);
    }
    if (e.key === "Home") {
      e.preventDefault();
      cancelFade();
      a.currentTime = 0;
    }
    if (e.key === "End") {
      e.preventDefault();
      cancelFade();
      a.currentTime = duration;
    }
  };

  useEffect(() => {
    const decks = deckRef.current;
    if (!decks[0] || !decks[1] || initRef.current) return;
    initRef.current = true;

    const onTime = (e: Event) => {
      const el = e.currentTarget as HTMLAudioElement;
      if (el !== activeDeck()) return;
      setCurrent(el.currentTime);
      if (crossfadeRef.current || TRACKS[idxRef.current]?.portrait) return;
      const nxt = peekNext();
      if (nextIdxRef.current !== nxt) {
        primeStandby(nxt);
        return;
      }
      const s = standbyDeck();
      if (!s?.duration) return;
      const overlap = fadeInOf(TRACKS[nxt]?.slug || "");
      if (!el.duration) return;
      if (el.duration - el.currentTime <= overlap) startFade();
    };
    const onLoaded = (e: Event) => {
      const el = e.currentTarget as HTMLAudioElement;
      if (el !== activeDeck()) return;
      setDuration(el.duration || 0);
      if (pendingSeekRef.current !== null) {
        const t = Math.min(pendingSeekRef.current, (el.duration || 0) - 0.25);
        pendingSeekRef.current = null;
        if (t > 0) {
          try {
            el.currentTime = t;
          } catch {}
          setCurrent(t);
        }
      }
      if (playRef.current && el.paused) {
        el.play().catch(() => {
          playRef.current = false;
          setPlaying(false);
        });
      }
    };
    const onEnded = (e: Event) => {
      const el = e.currentTarget as HTMLAudioElement;
      if (el !== activeDeck()) return;
      setCurrent(0);
      if (TRACKS[idxRef.current]?.portrait) {
        delCookie("portrait");
        playRef.current = false;
        const stash = stashRef.current;
        stashRef.current = null;
        nextIdxRef.current = -1;
        setPlaying(false);
        if (stash) {
          pendingSeekRef.current = stash.time;
          if (stash.playing) playRef.current = true;
          restoreTrack(stash.idx);
        } else {
          advanceFrom(-1);
        }
        window.dispatchEvent(new CustomEvent("portrait:cleared"));
      } else if (crossfadeRef.current) {
        finishFade();
      } else {
        advanceFrom(idxRef.current);
      }
    };
    const onPlayState = (e: Event) => {
      const el = e.currentTarget as HTMLAudioElement;
      if (el !== activeDeck()) return;
      setPlaying(!el.paused);
    };
    const onDeckError = (e: Event) => {
      const el = e.currentTarget as HTMLAudioElement;
      const slug = el.dataset.slug || "";
      if (!slug || el.dataset.fallback) {
        if (el === activeDeck()) setAudioError(true);
        return;
      }
      el.dataset.fallback = "1";
      el.src = `/audio/${slug}.mp3`;
      el.load();
      if (el === activeDeck() && playRef.current) {
        el.play().catch(() => {
          playRef.current = false;
          setPlaying(false);
        });
      }
    };

    decks.forEach((d) => {
      d?.addEventListener("timeupdate", onTime);
      d?.addEventListener("loadedmetadata", onLoaded);
      d?.addEventListener("durationchange", onLoaded);
      d?.addEventListener("ended", onEnded);
      d?.addEventListener("play", onPlayState);
      d?.addEventListener("pause", onPlayState);
      d?.addEventListener("error", onDeckError);
    });

    const onClaimed = () => {
      if (PORTRAIT_IDX < 0) return;
      const cur = idxRef.current;
      if (!TRACKS[cur]?.portrait && !stashRef.current) {
        stashRef.current = {
          idx: cur,
          time: activeDeck()?.currentTime || 0,
          playing: playRef.current,
        };
      }
      cancelFade();
      playRef.current = false;
      activeDeck()?.pause();
      standbyDeck()?.pause();
      nextIdxRef.current = -1;
      setPlaying(false);
      setCurrent(0);
      const a = activeDeck();
      if (a) {
        a.volume = 1;
        a.preload = "auto";
        setDeckSrc(a, TRACKS[PORTRAIT_IDX].slug);
      }
      setTrackIdx(PORTRAIT_IDX);
    };
    window.addEventListener("portrait:claimed", onClaimed);

    const begin = () => {
      const a = activeDeck();
      if (!a) return;
      a.volume = 1;
      a.preload = "metadata";
      if (isClaimed() && PORTRAIT_IDX >= 0) {
        queueRef.current = shufflePool(-1);
        posRef.current = 0;
        setDeckSrc(a, TRACKS[PORTRAIT_IDX].slug);
        setTrackIdx(PORTRAIT_IDX);
      } else {
        const queue = shufflePool(-1);
        queueRef.current = queue;
        posRef.current = 1;
        setDeckSrc(a, TRACKS[queue[0]].slug);
        setTrackIdx(queue[0]);
        primeStandby(queue[1] ?? peekNext());
      }
    };
    if (document.readyState === "complete") {
      begin();
    } else {
      window.addEventListener("load", begin, { once: true });
    }
    return () => {
      window.removeEventListener("portrait:claimed", onClaimed);
      window.removeEventListener("load", begin);
      if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
      decks.forEach((d) => {
        d?.removeEventListener("timeupdate", onTime);
        d?.removeEventListener("loadedmetadata", onLoaded);
        d?.removeEventListener("durationchange", onLoaded);
        d?.removeEventListener("ended", onEnded);
        d?.removeEventListener("play", onPlayState);
        d?.removeEventListener("pause", onPlayState);
        d?.removeEventListener("error", onDeckError);
      });
    };
  }, []);

  const pct = duration ? (current / duration) * 100 : 0;

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
      style={{ width: expanded ? "min(340px, calc(100vw - 48px))" : "min(180px, calc(100vw - 48px))", height: 44, transition: "opacity 200ms ease, transform 200ms ease" }}
    >
      <button
        type="button"
        onClick={() => {
          setSeen(true);
          setExpanded((v) => !v);
        }}
        className="absolute inset-0 flex items-center gap-3 px-3 border border-line hover:border-line transition-opacity cursor-pointer text-left"
        style={{
          width: "min(180px, calc(100vw - 48px))",
          maxWidth: "100%",
          height: 44,
          borderRadius: expanded ? 12 : 9999,
          background: "#251a3a",
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? "none" : "auto",
          transition: "opacity 200ms ease",
        }}
      >
        <div className="w-7 h-7 rounded-full overflow-hidden border border-line shrink-0">
          <img src={covers[track.cover].collapsed} alt="Album Art" width={28} height={28} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="eager" decoding="async" fetchPriority="high" />
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
      <audio ref={(el) => { deckRef.current[0] = el; }} preload="none" style={{ display: "none" }} />
      <audio ref={(el) => { deckRef.current[1] = el; }} preload="none" style={{ display: "none" }} />
    </div>
  );
}
