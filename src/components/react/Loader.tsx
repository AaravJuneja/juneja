import { useEffect, useState } from "react";

export default function Loader() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    const hide = () => {
      setHidden(true);
      root.style.overflow = prev;
    };
    if (document.readyState === "complete") {
      hide();
    } else {
      window.addEventListener("load", hide, { once: true });
      return () => {
        window.removeEventListener("load", hide);
        root.style.overflow = prev;
      };
    }
  }, []);
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
