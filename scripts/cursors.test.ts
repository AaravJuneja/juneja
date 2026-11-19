import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";

const css=readFileSync(new URL("../src/styles/global.css",import.meta.url),"utf8");
const hero=readFileSync(new URL("../src/components/Hero.astro",import.meta.url),"utf8");
const train=readFileSync(new URL("../src/components/TrainCarriage.astro",import.meta.url),"utf8");

test("both themes leave the cursor native without overriding every element",()=>{
  expect(css).not.toMatch(/cursor:\s*url\(/);
  expect(css).not.toMatch(/html,\s*html\s*\*\s*\{/);
  expect(css).not.toMatch(/:root\[data-portrait\][^{]*\*\s*\{/);
  expect(css).toMatch(/button:not\(:disabled\),\s*summary,\s*\[role="button"\]\s*\{\s*cursor: pointer;/);
});

test("the mirror artwork and train drag cursors stay intact",()=>{
  expect(hero).toContain('id="night-refl"');
  expect(hero).toContain('src="/cursors/cursor-pixel.svg"');
  expect(train).toMatch(/canvas\)\s*\{[^}]*cursor: grab;/);
  expect(train).toMatch(/canvas:active\)\s*\{[^}]*cursor: grabbing;/);
});
