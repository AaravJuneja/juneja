export const hasPortraitCookie=(cookies:string)=>/(?:^|;)\s*portrait=claimed(?:;|$)/.test(cookies);

export function applyPortraitTheme(target:Document,claimed:boolean) {
  target.documentElement.toggleAttribute("data-portrait",claimed);
  target.querySelector('meta[name="theme-color"]')?.setAttribute("content",claimed?"#0d0906":"#0A0710");
}

let initialized=false;

export function initPortraitTheme() {
  if(initialized)return;
  initialized=true;
  let claimed=hasPortraitCookie(document.cookie);
  const update=()=>{
    const next=hasPortraitCookie(document.cookie);
    applyPortraitTheme(document,next);
    if(next===claimed)return;
    claimed=next;
    window.dispatchEvent(new CustomEvent(next?"portrait:claimed":"portrait:cleared"));
  };
  const fromEvent=()=>{claimed=hasPortraitCookie(document.cookie);applyPortraitTheme(document,claimed);};
  window.addEventListener("portrait:claimed",fromEvent);
  window.addEventListener("portrait:cleared",fromEvent);
  window.addEventListener("focus",update);
  window.addEventListener("pageshow",update);
  document.addEventListener("pointerdown",update,{capture:true});
  document.addEventListener("keydown",update,{capture:true});
  document.addEventListener("visibilitychange",update);
  document.addEventListener("astro:page-load",update);
  document.addEventListener("astro:before-swap",event=>{
    update();
    applyPortraitTheme(event.newDocument,hasPortraitCookie(document.cookie));
  });
  try {window.cookieStore?.addEventListener("change",update);} catch {}
  update();
}
