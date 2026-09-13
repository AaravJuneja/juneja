import { useEffect } from "react";

export default function RevealWatcher() {
  useEffect(() => {
    document.documentElement.classList.add("js");
    let io: IntersectionObserver | null = null;
    const observe = () => {
      const els = document.querySelectorAll("[data-reveal]:not([data-in])");
      if (!("IntersectionObserver" in window)) {
        els.forEach((el) => el.setAttribute("data-in", ""));
        return;
      }
      if (!io) {
        io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              e.target.setAttribute("data-in", "");
              io?.unobserve(e.target);
            }
          },
          { rootMargin: "0px 0px -8% 0px" }
        );
      }
      els.forEach((el) => io?.observe(el));
    };
    observe();
    document.addEventListener("astro:page-load", observe);
    document.addEventListener("astro:after-swap", observe);
    return () => {
      io?.disconnect();
      document.removeEventListener("astro:page-load", observe);
      document.removeEventListener("astro:after-swap", observe);
    };
  }, []);
  return null;
}
