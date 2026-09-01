import { useState } from "react";

export default function SpotifyNowPlaying() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        width: expanded ? 352 : 40,
        height: expanded ? 152 : 40,
        borderRadius: expanded ? 8 : 4,
        background: expanded ? "rgba(33,23,44,0.6)" : "rgba(33,23,44,0.5)",
        border: `1px solid ${expanded ? "var(--accent-soft)" : "var(--accent)"}`,
        cursor: "pointer",
        transition: "all 200ms ease",
        overflow: "hidden",
      }}
    >
      {!expanded && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/images/spotify-icon.svg" alt="" width={18} height={18} style={{ width: 18, height: 18 }} loading="lazy" decoding="async" />
        </div>
      )}
      {expanded && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, width: "100%", height: "100%" }}>
          <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0, borderRadius: 4, overflow: "hidden", border: "1px solid var(--line)" }}>
            <img
              src="https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02a775614cbb5796d2ff1fa8ed"
              alt="Album Art"
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "rgba(168,105,219,0.15)", mixBlendMode: "multiply" }} />
          </div>
          <iframe
            src="https://open.spotify.com/embed/track/1oC5G4UmnsYSfvDrM4zOle"
            width="100%"
            height={44}
            style={{ borderRadius: 4, border: "1px solid var(--line)", background: "transparent" }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title="Spotify player"
          />
        </div>
      )}
    </div>
  );
}
