import { useState } from "react";

export default function SpotifyNowPlaying() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onClick={() => setExpanded((v) => !v)}
      className="relative shrink-0"
      style={{ width: expanded ? 352 : 210, height: 44, transition: "all 200ms ease" }}
    >
      {/* Collapsed */}
      <div
        className="absolute inset-0 flex items-center gap-3 px-3 bg-surface border border-line hover:border-accent transition-colors cursor-pointer"
        style={{
          borderRadius: expanded ? 12 : 9999,
          background: expanded ? "rgba(33,23,44,0.95)" : "var(--surface)",
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? "none" : "auto",
          transition: "all 200ms ease",
        }}
      >
        <div className="w-7 h-7 rounded-full bg-[#1DB954] flex items-center justify-center shrink-0">
          <img src="/images/spotify-icon.svg" alt="" width={14} height={14} style={{ width: 14, height: 14, filter: "brightness(0) invert(1)" }} loading="eager" decoding="async" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-dm text-[11px] tracking-[0.08em] uppercase text-muted-text leading-none">Now Playing</span>
          <span className="font-geist font-medium text-[13px] text-text leading-none truncate">lofi · Spotify</span>
        </div>
        <span className="ml-auto w-2 h-2 rounded-full bg-[#1DB954] animate-pulse shrink-0" />
      </div>

      {/* Expanded */}
      <div
        className="absolute left-0 top-0 flex flex-col gap-2 p-2.5 bg-raised-surface border shadow-[8px_8px_0px_0px_#1DB954] overflow-hidden"
        style={{
          width: 352,
          height: 152,
          borderRadius: 12,
          borderColor: expanded ? "var(--accent-soft)" : "var(--line)",
          background: "rgba(33,23,44,0.97)",
          backdropFilter: "blur(8px)",
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? "auto" : "none",
          transform: expanded ? "translateY(0) scale(1)" : "translateY(4px) scale(0.98)",
          transition: "all 220ms cubic-bezier(0.16,1,0.3,1)",
          zIndex: 20,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-md overflow-hidden border border-line shrink-0 relative">
            <img
              src="https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02a775614cbb5796d2ff1fa8ed"
              alt="Album Art"
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-dm text-[11px] tracking-[0.08em] uppercase text-accent-soft">Spotify · Now Playing</span>
            <span className="font-geist font-medium text-[13px] text-text truncate">lofi beats · chillhop</span>
          </div>
          <span className="ml-auto w-2 h-2 rounded-full bg-[#1DB954] animate-pulse" />
        </div>
        <iframe
          src="https://open.spotify.com/embed/track/1oC5G4UmnsYSfvDrM4zOle?utm_source=generator&theme=0"
          width="100%"
          height={80}
          style={{ borderRadius: 8, border: "1px solid var(--line)", background: "transparent" }}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          title="Spotify player"
        />
      </div>
    </div>
  );
}
