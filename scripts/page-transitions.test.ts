import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";

const css=readFileSync(new URL("../src/styles/global.css",import.meta.url),"utf8");
const layout=readFileSync(new URL("../src/layouts/Layout.astro",import.meta.url),"utf8");

test("navigation never overlays the outgoing page snapshot on the destination",()=>{
  expect(css).toMatch(/::view-transition-old\(root\)\s*\{[^}]*display:\s*none;[^}]*animation:\s*none;/);
  expect(css).toMatch(/::view-transition-new\(root\)\s*\{[^}]*animation:\s*page-enter 400ms cubic-bezier\(0\.4, 0, 0\.2, 1\) both;[^}]*mix-blend-mode:\s*normal;/);
  expect(css).toMatch(/::view-transition-group\(root\)\s*\{[^}]*animation:\s*none;/);
  expect(css).not.toContain("vt-scale-in");
  expect(css).not.toContain("vt-scale-out");
});

test("incoming page reveals retain client routing and the persistent music player",()=>{
  expect(layout).toContain("<ClientRouter />");
  expect(layout).toContain('transition:persist="spotify-player"');
});

test("the incoming reveal respects reduced motion",()=>{
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*::view-transition-old\(root\),\s*::view-transition-new\(root\)\s*\{\s*animation: none;/);
});

test("the incoming view reveals along an opaque curve from the top-right corner",()=>{
  const keyframes=css.split("@keyframes page-enter {")[1]?.split("@keyframes")[0]??"";
  expect(keyframes).toContain("clip-path: circle(0% at 100% 0%);");
  expect(keyframes).toContain("clip-path: circle(150% at 100% 0%);");
  expect(keyframes).not.toContain("opacity:");
});

test("client swaps preserve reveal enhancement before the incoming page is painted",()=>{
  expect(layout).toMatch(/document\.addEventListener\("astro:before-swap",event=>\{\s*if\(document\.documentElement\.classList\.contains\("js"\)\)event\.newDocument\.documentElement\.classList\.add\("js"\);/);
});
