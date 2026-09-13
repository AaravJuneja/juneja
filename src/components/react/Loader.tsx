import { useEffect, useRef, useState } from "react";

export default function Loader() {
  const [hidden, setHidden] = useState(false);
  const [gone, setGone] = useState(false);
  const hiddenRef = useRef(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("loader-seen") === "1") {
        setHidden(true);
        setGone(true);
        return;
      }
    } catch {}
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    const hide = () => {
      if (hiddenRef.current) return;
      hiddenRef.current = true;
      setHidden(true);
      root.style.overflow = prev;
      try {
        sessionStorage.setItem("loader-seen", "1");
      } catch {}
      window.setTimeout(() => setGone(true), 500);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      hide();
      return () => {
        root.style.overflow = prev;
      };
    }
    if (document.readyState === "complete") {
      hide();
    } else {
      const cap = window.setTimeout(hide, 1500);
      window.addEventListener("load", hide, { once: true });
      return () => {
        window.clearTimeout(cap);
        window.removeEventListener("load", hide);
        root.style.overflow = prev;
      };
    }
  }, []);
  if (gone) return null;
  return (
    <div className={`loader ${hidden ? "loader--hidden" : ""}`}>
      <div className="loader__inner">
        <svg className="loader__svg" width="100" height="100" viewBox="0 0 100 100">
          <defs>
            <mask id="loader-clipping">
              <polygon points="0,0 100,0 100,100 0,100" fill="black" />
              <polygon points="25,25 75,25 50,75" fill="white" />
              <polygon points="50,25 75,75 25,75" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
            </mask>
          </defs>
        </svg>
        <div className="loader__box" />
      </div>
    </div>
  );
}
