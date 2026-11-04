import { useEffect, useRef, useState } from "react";
import {radioStation,radioVolume,type RadioSource} from "../../lib/trainRadio";
import {createRadioSpatialAudio} from "../../lib/radioSpatialAudio";

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
  const [source,setSource]=useState<RadioSource>("playlist");
  const [volume,setVolume]=useState(1);
  const [livePlaying,setLivePlaying]=useState(false);
  const [liveLoading,setLiveLoading]=useState(false);
  const [liveError,setLiveError]=useState(false);
  const [volumeSupported,setVolumeSupported]=useState(true);
  const [spatialEnabled,setSpatialEnabled]=useState(true);
  const [spatialSupported,setSpatialSupported]=useState(true);
  const spatialAudio=useRef<ReturnType<typeof createRadioSpatialAudio>|null>(null);
  const sourceRef=useRef<RadioSource>("playlist");
  const volumeRef=useRef(1);
  const liveRef=useRef<HTMLAudioElement|null>(null);
  const liveWanted=useRef(false);
  const portraitRadioStash=useRef<{source:RadioSource;playing:boolean}|null>(null);
  const sourceGeneration=useRef(0);
  const liveTimeout=useRef<number|undefined>(undefined);
  const playlistGeneration=useRef(0);
  const gains=useRef(new WeakMap<HTMLAudioElement,number>());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef(false);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    if (expanded && document.activeElement === triggerRef.current) playButtonRef.current?.focus();
    else if (!expanded && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [expanded]);

  const deckRef = useRef<(HTMLAudioElement | null)[]>([null, null]);
  const activeRef = useRef(0);
  const fadeTimerRef = useRef<number | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const fadeGeneration=useRef(0);
  const fadePending=useRef(false);
  const volLockedRef = useRef(false);
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
  const toggleRef = useRef<() => void>(() => {});
  const advanceRef = useRef<(from: number) => void>(() => {});
  useEffect(() => {
    toggleRef.current = toggle;
    advanceRef.current = advanceFrom;
  });
  const track = TRACKS[trackIdx];

  const activeDeck = () => deckRef.current[activeRef.current] ?? null;
  const standbyDeck = () => deckRef.current[1 - activeRef.current] ?? null;
  const selectTrack = (idx:number) => {idxRef.current=idx;setTrackIdx(idx);};
  const deckVolume=(deck:HTMLAudioElement,gain:number)=>{
    gains.current.set(deck,gain);
    deck.volume=gain*volumeRef.current;
    deck.muted=volumeRef.current===0;
  };
  const changeVolume=(value:number)=>{
    const next=radioVolume(value);
    volumeRef.current=next;setVolume(next);
    for(const deck of deckRef.current)if(deck)deckVolume(deck,gains.current.get(deck)??(deck===activeDeck()?1:0));
    if(liveRef.current) {liveRef.current.volume=next;liveRef.current.muted=next===0;}
    try {sessionStorage.setItem("radio-volume",String(next));} catch {}
  };
  const playLive=()=>{
    const live=liveRef.current;
    const station=radioStation(sourceRef.current);
    if(!live||!station)return;
    spatialAudio.current?.unlock();
    const generation=++sourceGeneration.current;
    liveWanted.current=true;
    setLiveError(false);setLiveLoading(true);
    window.clearTimeout(liveTimeout.current);
    liveTimeout.current=window.setTimeout(()=>{
      if(generation!==sourceGeneration.current||!liveWanted.current)return;
      stopLive();setLiveError(true);
    },15000);
    if(live.getAttribute("src")!==station.url||live.error) {live.src=station.url;live.load();}
    live.volume=volumeRef.current;live.muted=volumeRef.current===0;
    void live.play().catch((error:unknown)=>{
      if(generation!==sourceGeneration.current||!liveWanted.current)return;
      window.clearTimeout(liveTimeout.current);
      liveWanted.current=false;setLiveLoading(false);setLivePlaying(false);
      if(!(error instanceof DOMException&&error.name==="AbortError"))setLiveError(true);
    });
  };
  const stopLive=()=>{
    window.clearTimeout(liveTimeout.current);
    sourceGeneration.current++;liveWanted.current=false;
    const live=liveRef.current;
    if(live) {live.pause();live.removeAttribute("src");live.load();}
    setLivePlaying(false);setLiveLoading(false);
  };
  const changeSource=(next:RadioSource)=>{
    if(next!=="playlist"&&!document.querySelector("[data-train]"))return;
    if(next===sourceRef.current||next!=="playlist"&&!radioStation(next))return;
    if(isClaimed()&&next!=="playlist")portraitRadioStash.current=null;
    const resume=sourceRef.current==="playlist"?playRef.current:liveWanted.current;
    cancelFade();playRef.current=false;activeDeck()?.pause();
    stopLive();sourceRef.current=next;setSource(next);setLiveError(false);
    if(resume) {
      if(next==="playlist")toggleRef.current();
      else playLive();
    }
  };
  const playPlaylist=(deck:HTMLAudioElement,started?:()=>void)=>{
    spatialAudio.current?.unlock();
    const generation=++playlistGeneration.current;
    void deck.play().then(()=>{
      if(generation===playlistGeneration.current&&playRef.current&&deck===activeDeck()&&sourceRef.current==="playlist")started?.();
    }).catch((error:unknown)=>{
      if(generation!==playlistGeneration.current||!playRef.current||deck!==activeDeck()||sourceRef.current!=="playlist"||error instanceof DOMException&&error.name==="AbortError")return;
      playRef.current=false;setPlaying(false);setAudioError(true);
    });
  };

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

  const canOpus = (deck: HTMLAudioElement) => {
    try {
      const r = deck.canPlayType('audio/webm; codecs="opus"');
      return r === "probably" || r === "maybe";
    } catch {
      return true;
    }
  };

  const setDeckSrc = (deck: HTMLAudioElement | null, slug: string) => {
    if (!deck) return;
    const ext = canOpus(deck) ? "webm" : "mp3";
    if (deck.dataset.slug === slug && deck.dataset.ext === ext && deck.getAttribute("src")) return;
    deck.dataset.slug = slug;
    deck.dataset.ext = ext;
    deck.dataset.fallback = "";
    deck.src = `/audio/${slug}.${ext}`;
    deck.load();
  };

  const cancelFade = () => {
    playlistGeneration.current++;
    fadeGeneration.current++;fadePending.current=false;
    if (fadeTimerRef.current !== null) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (fadeRafRef.current !== null) {
      window.cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }
    crossfadeRef.current = null;
    const a = activeDeck();
    const s = standbyDeck();
    if (a) deckVolume(a,1);
    if (s) {
      if (!s.paused) s.pause();
      deckVolume(s,0);
    }
  };

  const primeStandby = (nextIdx: number) => {
    const s = standbyDeck();
    if (!s || sourceRef.current!=="playlist" || !hasPlayedRef.current || nextIdx < 0 || TRACKS[nextIdx]?.portrait) return;
    nextIdxRef.current = nextIdx;
    s.pause();
    deckVolume(s,0);
    s.preload = "auto";
    setDeckSrc(s, TRACKS[nextIdx].slug);
  };

  const fadeInActive = (deck: HTMLAudioElement, secs: number) => {
    const t0 = performance.now();
    const step = () => {
      fadeRafRef.current = null;
      if (deck !== activeDeck() || deck.paused) return;
      const p = Math.min(1, (performance.now() - t0) / (secs * 1000));
      deckVolume(deck,Math.sin((p * Math.PI) / 2));
      if (p < 1) fadeRafRef.current = window.requestAnimationFrame(step);
      else if (deck === activeDeck()) deckVolume(deck,1);
    };
    if (fadeRafRef.current !== null) window.cancelAnimationFrame(fadeRafRef.current);
    fadeRafRef.current = window.requestAnimationFrame(step);
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
    if (finishedIdx < 0 || !s || s.paused) return;
    if (a) {
      a.pause();
      deckVolume(a,1);
    }
    deckVolume(s,1);
    activeRef.current = 1 - activeRef.current;
    playRef.current = true;
    setPlaying(true);
    setCurrent(s.currentTime);
    setDuration(s.duration || 0);
    posRef.current += 1;
    selectTrack(finishedIdx);
    primeStandby(peekNext());
  };

  const startFade = () => {
    const a = activeDeck();
    const s = standbyDeck();
    const nextIdx = nextIdxRef.current;
    if (!a || !s || nextIdx < 0 || crossfadeRef.current || fadePending.current || sourceRef.current!=="playlist") return;
    if (!s.duration || TRACKS[idxRef.current]?.portrait) return;
    const overlap = fadeInOf(TRACKS[nextIdx]?.slug || "");
    const generation=++fadeGeneration.current;
    fadePending.current=true;
    if(volLockedRef.current)a.pause();
    deckVolume(s,volLockedRef.current?1:0);
    s.currentTime = 0;
    void s.play().then(()=>{
      if(generation!==fadeGeneration.current||sourceRef.current!=="playlist"||s!==standbyDeck())return;
      fadePending.current=false;
      if(volLockedRef.current) {finishFade();return;}
      crossfadeRef.current = { out: overlap, startTime: a.currentTime };
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
      deckVolume(cur,Math.cos((progress * Math.PI) / 2));
      deckVolume(nxt,Math.sin((progress * Math.PI) / 2));
      if (progress >= 1) finishFade();
    }, 50);
    }).catch(()=>{
      if(generation!==fadeGeneration.current)return;
      fadePending.current=false;crossfadeRef.current=null;
      s.pause();deckVolume(s,0);
      if(volLockedRef.current&&playRef.current)playPlaylist(a);
    });
  };

  const advanceFrom = (fromIdx: number) => {
    if(sourceRef.current!=="playlist")return;
    if(TRACKS[fromIdx]?.portrait&&isClaimed())return;
    cancelFade();
    setAudioError(false);
    const nxt = takeNext(fromIdx);
    const outgoing = activeDeck();
    const incoming = standbyDeck();
    if (!incoming) return;
    if (outgoing) {
      outgoing.pause();
      deckVolume(outgoing,1);
    }
    activeRef.current = 1 - activeRef.current;
    nextIdxRef.current = -1;
    deckVolume(incoming,0);
    incoming.preload = "auto";
    const same=incoming.dataset.slug===TRACKS[nxt].slug&&incoming.readyState>=1;
    setDeckSrc(incoming, TRACKS[nxt].slug);
    if(same)incoming.currentTime=0;
    setCurrent(0);
    setDuration(0);
    selectTrack(nxt);
    if (playRef.current) {
      playPlaylist(incoming,()=>fadeInActive(incoming, fadeInOf(TRACKS[nxt]?.slug || "")));
    }
    primeStandby(peekNext());
  };

  const restoreTrack = (idx: number) => {
    cancelFade();
    setAudioError(false);
    const a = activeDeck();
    if (!a) return;
    nextIdxRef.current = -1;
    deckVolume(a,1);
    a.preload = "auto";
    const same = a.dataset.slug === TRACKS[idx]?.slug && a.readyState >= 1;
    setDeckSrc(a, TRACKS[idx].slug);
    setCurrent(0);
    setDuration(a.duration || 0);
    selectTrack(idx);
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
        playPlaylist(a);
      }
    }
    primeStandby(peekNext());
  };

  const toggle = () => {
    if(sourceRef.current!=="playlist") {
      if(liveWanted.current)stopLive();else playLive();
      return;
    }
    const a = activeDeck();
    if (!a) return;
    if (!a.paused || crossfadeRef.current || fadePending.current || playRef.current) {
      cancelFade();
      playRef.current = false;
      a.pause();
    } else if (a.ended) {
      playRef.current = true;
      advanceFrom(idxRef.current);
    } else {
      playRef.current = true;
      if (!crossfadeRef.current) deckVolume(a,1);
      setAudioError(false);
      if(a.error) {a.dataset.fallback="";a.load();}
      playRef.current = true;
      playPlaylist(a);
    }
  };

  useEffect(() => {
    window.addEventListener("music:toggle", toggle);
    const command=(event:WindowEventMap["music:command"])=>{
      const {source,volume,action,spatial}=event.detail;
      if(source&&(source==="playlist"||document.querySelector("[data-train]")))changeSource(source);
      if(typeof volume==="number")changeVolume(volume);
      if(typeof spatial==="boolean") {
        setSpatialEnabled(spatial);spatialAudio.current?.setEnabled(spatial);
        try {sessionStorage.setItem("radio-spatial",spatial?"on":"off");} catch {}
      }
      if(action==="toggle")toggle();
      if(action==="next"&&sourceRef.current==="playlist")advanceFrom(idxRef.current);
    };
    const leaveCarriage=()=>{if(!document.querySelector("[data-train]")) {portraitRadioStash.current=null;spatialAudio.current?.setFrame(null);changeSource("playlist");}};
    window.addEventListener("music:command",command);
    document.addEventListener("astro:after-swap",leaveCarriage);
    return () => {window.removeEventListener("music:toggle", toggle);window.removeEventListener("music:command",command);document.removeEventListener("astro:after-swap",leaveCarriage);};
  }, [toggle]);

  useEffect(() => {
    const live=source!=="playlist";
    const report = () => window.dispatchEvent(new CustomEvent("music:state",{detail:{playing:live?livePlaying:playing&&!audioError,error:live?liveError:audioError,loading:live&&liveLoading,volume,volumeSupported,source,title:live?radioStation(source)?.name??"Live radio":track.title,spatialEnabled:spatialEnabled&&spatialSupported,spatialSupported}}));
    window.addEventListener("music:request-state",report);
    report();
    return () => window.removeEventListener("music:request-state",report);
  },[playing,audioError,trackIdx,source,livePlaying,liveLoading,liveError,volume,volumeSupported,spatialEnabled,spatialSupported]);

  useEffect(()=>{
    const elements=[...deckRef.current,liveRef.current].filter((element):element is HTMLAudioElement=>element!==null);
    const controller=createRadioSpatialAudio(elements,setSpatialSupported,()=>{
      playRef.current=false;cancelFade();activeDeck()?.pause();stopLive();
      setAudioError(true);setLiveError(true);
    });
    spatialAudio.current=controller;
    try {
      const enabled=sessionStorage.getItem("radio-spatial")!=="off";
      setSpatialEnabled(enabled);controller.setEnabled(enabled);
    } catch {}
    const update=(event:WindowEventMap["music:spatial"])=>controller.setFrame(event.detail);
    window.addEventListener("music:spatial",update);
    window.dispatchEvent(new CustomEvent("music:request-spatial"));
    return ()=>{window.removeEventListener("music:spatial",update);controller.dispose();spatialAudio.current=null;};
  },[]);

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const seekTo = (clientX: number) => {
    const a = activeDeck();
    const bar = barRef.current;
    const live = a?.duration || 0;
    if (!a || !bar || !isFinite(live) || !live) return;
    cancelFade();
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = pct * live;
    setDuration(live);
    setCurrent(pct * live);
  };

  const onSeekKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const a = activeDeck();
    const live = a?.duration || duration;
    if (!a || !isFinite(live) || !live) return;
    const step = e.key.startsWith("Page") ? 30 : 5;
    if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      cancelFade();
      a.currentTime = Math.min(live, a.currentTime + step);
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
      a.currentTime = live;
    }
  };

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const station=radioStation(source);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station?.name??track.title,
        artist: station?station.provider:track.portrait ? "LSPLASH" : "The Noise",
        album: station?"Live radio":track.portrait ? "DOORS Original Game Soundtrack" : "The Noise",
        artwork: station?[]:[{ src: covers[track.cover].expanded, sizes: "88x88", type: "image/webp" }],
      });
      navigator.mediaSession.setActionHandler("play", () => {if(sourceRef.current!=="playlist"?!liveWanted.current:!playRef.current)toggleRef.current();});
      navigator.mediaSession.setActionHandler("pause", () => {if(sourceRef.current!=="playlist"?liveWanted.current:playRef.current)toggleRef.current();});
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if(TRACKS[idxRef.current]?.portrait&&isClaimed())return;
        playRef.current = true;
        advanceRef.current(idxRef.current);
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if(TRACKS[idxRef.current]?.portrait&&isClaimed())return;
        playRef.current = true;
        advanceRef.current(idxRef.current);
      });
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if(sourceRef.current!=="playlist")return;
        const t = (d as MediaSessionActionDetails).seekTime;
        const a = activeDeck();
        if (typeof t === "number" && a && isFinite(a.duration) && a.duration) {
          cancelFade();
          a.currentTime = Math.max(0, Math.min(a.duration, t));
        }
      });
    } catch {}
  }, [trackIdx,source]);

  useEffect(()=>{
    if(!("mediaSession" in navigator))return;
    try {navigator.mediaSession.playbackState=(source==="playlist"?playing:livePlaying)?"playing":"paused";} catch {}
  },[playing,livePlaying,source]);

  useEffect(()=>{
    const live=liveRef.current;
    if(!live)return;
    const playing=()=>{if(liveWanted.current) {window.clearTimeout(liveTimeout.current);setLivePlaying(true);setLiveLoading(false);setLiveError(false);}};
    const waiting=()=>{if(liveWanted.current) {setLiveLoading(true);setLivePlaying(false);}};
    const stopped=()=>{
      if(!live.paused)return;
      if(liveWanted.current) {
        window.clearTimeout(liveTimeout.current);
        sourceGeneration.current++;liveWanted.current=false;
        live.removeAttribute("src");live.load();
      }
      setLivePlaying(false);setLiveLoading(false);
    };
    const failed=()=>{if(liveWanted.current&&(live.error||live.ended)) {stopLive();setLiveError(true);}};
    live.addEventListener("playing",playing);live.addEventListener("waiting",waiting);live.addEventListener("pause",stopped);live.addEventListener("error",failed);live.addEventListener("ended",failed);
    try {const saved=sessionStorage.getItem("radio-volume");if(saved!==null)changeVolume(Number(saved));} catch {}
    return ()=>{
      live.removeEventListener("playing",playing);live.removeEventListener("waiting",waiting);live.removeEventListener("pause",stopped);live.removeEventListener("error",failed);live.removeEventListener("ended",failed);
      window.clearTimeout(liveTimeout.current);liveWanted.current=false;sourceGeneration.current++;live.pause();live.removeAttribute("src");live.load();
    };
  },[]);

  useEffect(() => {
    const decks = deckRef.current;
    if (!decks[0] || !decks[1] || initRef.current) return;
    initRef.current = true;

    const onTime = (e: Event) => {
      const el = e.currentTarget as HTMLAudioElement;
      if (el !== activeDeck()) return;
      setCurrent(el.currentTime);
      if (sourceRef.current!=="playlist" || el.paused || crossfadeRef.current || fadePending.current || TRACKS[idxRef.current]?.portrait) return;
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
      setAudioError(false);
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
      if (sourceRef.current==="playlist" && playRef.current && el.paused) {
        playPlaylist(el);
      }
    };
    const onEnded = (e: Event) => {
      const el = e.currentTarget as HTMLAudioElement;
      if (el !== activeDeck()) return;
      setCurrent(0);
      if (el.dataset.slug===TRACKS[PORTRAIT_IDX]?.slug) {
        delCookie("portrait");
        window.dispatchEvent(new CustomEvent("portrait:cleared"));
      } else if (crossfadeRef.current) {
        finishFade();
      } else {
        advanceFrom(idxRef.current);
      }
    };
    const onPlayState = (e: Event) => {
      const el = e.currentTarget as HTMLAudioElement;
      if (el !== activeDeck()) {
        if(e.type==="pause"&&el===standbyDeck()&&el.paused&&!el.ended&&crossfadeRef.current) {
          playRef.current=false;cancelFade();activeDeck()?.pause();setPlaying(false);
        }
        return;
      }
      if(el.paused) {
        if(e.type==="pause"&&el.readyState>=1&&!el.ended&&!fadePending.current) {
          playRef.current=false;
          cancelFade();
        }
        setPlaying(false);
      }
    };
    const onPlaying = (e: Event) => {
      if (e.currentTarget !== activeDeck()) return;
      if(sourceRef.current!=="playlist") {activeDeck()?.pause();return;}
      setPlaying(true);
      hasPlayedRef.current = true;
      if (!TRACKS[idxRef.current]?.portrait && nextIdxRef.current < 0) primeStandby(peekNext());
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
        playPlaylist(el);
      }
    };

    decks.forEach((d) => {
      d?.addEventListener("timeupdate", onTime);
      d?.addEventListener("loadedmetadata", onLoaded);
      d?.addEventListener("durationchange", onLoaded);
      d?.addEventListener("ended", onEnded);
      d?.addEventListener("play", onPlayState);
      d?.addEventListener("playing", onPlaying);
      d?.addEventListener("pause", onPlayState);
      d?.addEventListener("error", onDeckError);
    });

    const onClaimed = () => {
      if (PORTRAIT_IDX < 0) return;
      if(sourceRef.current!=="playlist") {
        portraitRadioStash.current={source:sourceRef.current,playing:liveWanted.current};
        changeSource("playlist");
      }
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
        deckVolume(a,1);
        a.preload = "auto";
        setDeckSrc(a, TRACKS[PORTRAIT_IDX].slug);
      }
      selectTrack(PORTRAIT_IDX);
    };
    const onCleared = () => {
      const active=activeDeck();
      if(isClaimed()||!active||active.dataset.slug!==TRACKS[PORTRAIT_IDX]?.slug)return;
      const continuing=!active.paused||active.ended;
      cancelFade();
      active.pause();
      const stash=stashRef.current;
      stashRef.current=null;
      nextIdxRef.current=-1;
      playRef.current=stash?.playing??continuing;
      setPlaying(false);
      setCurrent(0);
      if(stash) {pendingSeekRef.current=stash.time;restoreTrack(stash.idx);}
      else restoreTrack(takeNext(-1));
      const radioStash=portraitRadioStash.current;
      portraitRadioStash.current=null;
      if(radioStash) {playRef.current=radioStash.playing;changeSource(radioStash.source);}
    };
    window.addEventListener("portrait:claimed", onClaimed);
    window.addEventListener("portrait:cleared", onCleared);

    const begin = () => {
      const a = activeDeck();
      if (!a) return;
      try {
        const v = a.volume;
        a.volume = 0.5;
        volLockedRef.current = a.volume !== 0.5;
        a.volume = v;
      } catch {
        volLockedRef.current = true;
      }
      deckVolume(a,1);
      setVolumeSupported(!volLockedRef.current);
      a.preload = "metadata";
      if (isClaimed() && PORTRAIT_IDX >= 0) {
        queueRef.current = shufflePool(-1);
        posRef.current = 0;
        setDeckSrc(a, TRACKS[PORTRAIT_IDX].slug);
        selectTrack(PORTRAIT_IDX);
      } else {
        const queue = shufflePool(-1);
        queueRef.current = queue;
        posRef.current = 1;
        setDeckSrc(a, TRACKS[queue[0]].slug);
        selectTrack(queue[0]);
      }
    };
    if (document.readyState === "complete") {
      begin();
    } else {
      window.addEventListener("load", begin, { once: true });
    }
    return () => {
      window.removeEventListener("portrait:claimed", onClaimed);
      window.removeEventListener("portrait:cleared", onCleared);
      window.removeEventListener("load", begin);
      if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
      if (fadeRafRef.current !== null) window.cancelAnimationFrame(fadeRafRef.current);
      decks.forEach((d) => {
        d?.removeEventListener("timeupdate", onTime);
        d?.removeEventListener("loadedmetadata", onLoaded);
        d?.removeEventListener("durationchange", onLoaded);
        d?.removeEventListener("ended", onEnded);
        d?.removeEventListener("play", onPlayState);
        d?.removeEventListener("playing", onPlaying);
        d?.removeEventListener("pause", onPlayState);
        d?.removeEventListener("error", onDeckError);
      });
    };
  }, []);

  const station=radioStation(source);
  const displayTitle=station?.name??track.title;
  const displayPlaying=station?livePlaying:playing;
  const displayError=station?liveError:audioError;
  const radioArtwork=<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="m6 9 15-5M5 10h18v14H5z" stroke="currentColor" strokeWidth="1.5"/><circle cx="11" cy="17" r="3" stroke="currentColor"/><path d="M17 15h3m-3 3h3m-3 3h3" stroke="currentColor"/></svg>;
  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div
      onMouseEnter={() => {
        setExpanded(true);
        setSeen(true);
      }}
      onMouseLeave={(e) => {
        if (!e.currentTarget.contains(document.activeElement)) setExpanded(false);
      }}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        setExpanded(false);
      }}
      className="relative shrink-0 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
      style={{ width: expanded ? "min(340px, calc(100vw - 48px))" : "min(180px, calc(100vw - 48px))", height: 44 }}
    >
      <span className="sr-only" aria-live="polite">{displayTitle}{displayError?". Playback unavailable. Try again.":""}</span>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={expanded}
        aria-controls="spotify-panel"
        inert={expanded}
        onClick={() => {
          setSeen(true);
          setExpanded((v) => !v);
        }}
        className="absolute inset-0 flex items-center gap-3 px-3 border border-line hover:border-line transition-opacity duration-200 motion-reduce:transition-none cursor-pointer text-left"
        style={{
          width: "min(180px, calc(100vw - 48px))",
          maxWidth: "100%",
          height: 44,
          borderRadius: expanded ? 12 : 9999,
          background: "var(--player-surface)",
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? "none" : "auto",
        }}
      >
        <div className="w-7 h-7 rounded-full overflow-hidden border border-line shrink-0">
          {station?radioArtwork:<img src={covers[track.cover].collapsed} draggable={false} alt="Album Art" width={28} height={28} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" decoding="async" />}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-dm trim-caps text-[12px] tracking-[0.08em] uppercase text-muted-text leading-none">{station?"Live radio":displayPlaying?"Now playing":"Paused"}</span>
          <span className="font-outfit font-medium text-[14px] text-text leading-none truncate tracking-[-0.003em]">{displayTitle}</span>
        </div>
      </button>

      <div
        id="spotify-panel"
        hidden={!seen}
        inert={!expanded}
        aria-hidden={!expanded}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            restoreFocusRef.current = true;
            setExpanded(false);
          }
        }}
        className="absolute right-0 bottom-0 flex flex-col gap-3 p-3 border border-line overflow-hidden transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{
          width: "min(340px, calc(100vw - 48px))",
          height: "auto",
          minHeight: 110,
          borderRadius: 12,
          background: "var(--player-surface)",
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? "auto" : "none",
          transform: expanded ? "translateY(0) scale(1)" : "translateY(4px) scale(0.98)",
          zIndex: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-md overflow-hidden border border-line shrink-0 relative">
            {station?<span className="flex h-full items-center justify-center text-accent-soft">{radioArtwork}</span>:<img
              src={covers[track.cover].expanded}
              alt="Album Art"
              draggable={false}
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />}
            <div className="absolute inset-0 bg-accent/10 mix-blend-overlay" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-dm trim-caps text-[12px] tracking-[0.08em] uppercase text-accent-soft">{liveLoading?"Tuning in…":station?"Live radio":displayPlaying?"Now playing":"Paused"}</span>
            <span className="font-outfit font-medium text-[14px] text-text truncate tracking-[-0.003em]">{displayTitle}</span>
          </div>
          <div className="flex items-end gap-0.5 h-3 ml-1 shrink-0" aria-hidden="true">
            <span className={`w-0.5 bg-accent rounded-full origin-bottom ${displayPlaying ? "animate-bar-1 h-3" : ""}`} style={!displayPlaying ? { height: 6 } : undefined} />
            <span className={`w-0.5 bg-accent rounded-full origin-bottom ${displayPlaying ? "animate-bar-2 h-3" : ""}`} style={!displayPlaying ? { height: 10 } : undefined} />
            <span className={`w-0.5 bg-accent rounded-full origin-bottom ${displayPlaying ? "animate-bar-3 h-3" : ""}`} style={!displayPlaying ? { height: 7 } : undefined} />
          </div>
          {!station&&!track.portrait&&<button type="button" onClick={()=>advanceFrom(idxRef.current)} aria-label="Next track" className="ml-auto min-h-11 min-w-8 text-accent-soft">▸▏</button>}
          <button
            ref={playButtonRef}
            onClick={toggle}
            aria-label={station&&liveWanted.current||displayPlaying ? "Pause" : "Play"}
            aria-pressed={displayPlaying}
            className="ml-auto w-9 h-9 rounded-full bg-accent text-background flex items-center justify-center hover:brightness-110 active:scale-95 transition-all shrink-0"
          >
            {displayPlaying||liveLoading ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="3" width="3" height="8" rx="1" fill="currentColor"/><rect x="8" y="3" width="3" height="8" rx="1" fill="currentColor"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-0.5"><path d="M4 3L10 7L4 11V3Z" fill="currentColor"/></svg>
            )}
          </button>
        </div>

        {!station&&<div className="flex flex-col gap-1.5">
          <div
            ref={barRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekTo(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.buttons & 1) seekTo(e.clientX);
            }}
            onKeyDown={onSeekKey}
            tabIndex={0}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            aria-valuetext={`${fmt(current)} of ${fmt(duration)}`}
            className="relative w-full h-6 flex items-center cursor-pointer group focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-full"
          >
            <div
              className="relative w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: "color-mix(in srgb, var(--color-line) 60%, transparent)" }}
            >
              <div className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-75" style={{ width: `${pct}%` }} />
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent-soft rounded-full shadow border border-background transition-all opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" style={{ left: `calc(${pct}% - 6px)` }} />
          </div>
          <div className="flex items-center justify-between font-outfit text-[12px] tracking-[0.02em] text-muted-text tabular-nums">
          <span>{fmt(current)}</span>
          <span>{fmt(duration)}</span>
        </div>
        </div>}
        <label className="flex items-center gap-3 text-sm text-muted-text">Volume
          <input aria-label="Music volume" type="range" min="0" max="100" value={Math.round(volume*100)} disabled={!volumeSupported} onChange={event=>changeVolume(Number(event.target.value)/100)} className="h-11 min-w-0 flex-1 accent-accent" />
          <span className="w-9 text-right tabular-nums">{Math.round(volume*100)}%</span>
        </label>
        {!volumeSupported&&<p className="text-xs text-muted-text">Use your device volume buttons.</p>}
        {station&&<a href={station.homepage} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-soft underline">Stream provided by {station.provider}</a>}
        {displayError&&<p role="status" className="text-xs text-muted-text">Could not play. Press play to retry, or choose another source.</p>}
      </div>
      <audio ref={(el) => { deckRef.current[0] = el; }} crossOrigin="anonymous" preload="metadata" style={{ display: "none" }} />
      <audio ref={(el) => { deckRef.current[1] = el; }} crossOrigin="anonymous" preload="metadata" style={{ display: "none" }} />
      <audio ref={liveRef} crossOrigin="anonymous" preload="none" style={{display:"none"}} />
    </div>
  );
}
