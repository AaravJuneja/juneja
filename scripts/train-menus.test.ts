import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";

const template=readFileSync(new URL("../src/components/TrainCarriage.astro",import.meta.url),"utf8");
const scene=readFileSync(new URL("../src/lib/trainScene.ts",import.meta.url),"utf8");
const dialog=(id:string)=>template.split(`<dialog id="${id}"`)[1]?.split("</dialog>")[0]??"";

test("the catalog contains skins without gameplay or avatar controls",()=>{
  const catalog=dialog("catalog-panel");
  expect(catalog).toContain("data-train-skins");
  expect(catalog).not.toMatch(/<(?:input|select|details)\b/);
  expect(catalog).not.toMatch(/data-train-(?:power|tool|posture|torch|shift-lock|avatar|perspective|camera)\b/);
  expect(catalog).not.toContain('role="tab"');
});

test("avatar selection has its own settings menu",()=>{
  const settings=dialog("settings-panel");
  expect(settings).toContain("data-train-avatar");
  expect(settings).not.toContain("data-train-skins");
  expect(settings).not.toMatch(/<input\b/);
  expect(template).toContain("data-train-settings");
});

test("the keyboard guide documents movement and gameplay controls without manual action toggles",()=>{
  const keys=dialog("keys-panel");
  for(const [key,description] of [["W A S D","Walk"],["Control","Sprint"],["C","Crawl or stand"],["Shift","Toggle shift lock"],["V","First or third person"],["O","Free orbit or character aim"],["Space","Jump; press again to double jump"],["E","Interact"],["Esc","Release mouse lock or close a menu"]]) {
    expect(keys).toContain(`<kbd>${key}</kbd></dt><dd>${description}</dd>`);
  }
  expect(keys).not.toContain("<kbd>Q</kbd>");
  expect(keys).not.toMatch(/<(?:input|select)\b/);
  expect(keys.match(/<button\b/g)).toHaveLength(1);
  expect(keys.match(/<dl\b/g)).toHaveLength(1);
  expect(keys).not.toContain("<h3");
  expect(keys).not.toMatch(/<kbd>[WASD↑↓←→]<\/kbd>/);
  expect(keys).toContain("<kbd>E</kbd></dt><dd>Interact</dd>");
  expect(keys.match(/<kbd>/g)).toHaveLength(9);
  expect(template).toContain("data-train-keys");
});

test("quick controls are non-interactive main-screen hints",()=>{
  const hints=template.split('<dl class="train-key-hints"')[1]?.split("</dl>")[0]??"";
  for(const key of ["C","Ctrl","Q"])expect(hints).toContain(`<kbd>${key}</kbd>`);
  expect(hints).not.toMatch(/<(?:button|input|a)\b/);
  expect(template).toMatch(/data-train-settings[^>]*\bhidden>/);
  expect(template).toContain("settingsButton.hidden=!unlocked");
});

test("private entry has no visible unlock dialog or public instructions",()=>{
  expect(template).not.toContain('id="unlock-panel"');
  expect(template).not.toContain("Unlock avatar");
  expect(template).not.toContain("Verify code");
  expect(template).toContain("data-train-private-input");
  expect(dialog("keys-panel")).not.toContain("KeyU");
  expect(template).toContain('event.key==="Enter"');
  expect(template).toContain('event.key==="Escape"');
});

test("graphics start low and can be switched without adding gameplay controls",()=>{
  expect(template).toContain('data-train-graphics type="button"');
  expect(template).toContain('aria-label="Switch to high graphics"');
  expect(template).toContain('aria-pressed="false" disabled');
  expect(scene).toContain('initialQuality:TrainGraphicsQuality="low"');
  expect(template).toContain("}, graphicsQuality);");
  expect(template).toMatch(/const stop = \(\) => \{[^}]*graphicsButton\.disabled=true;/);
  expect(scene).toContain('setGraphics(value:TrainGraphicsQuality)');
  expect(scene).toMatch(/const torch=createTrainTorch\(scene,renderer,signal\);\s*torch\.setQuality\(graphicsQuality\);/);
  expect(scene).toMatch(/const swapped=await swapRenderer\(value\);[\s\S]{0,80}if\(!swapped\) \{\s*desired\.quality=previous;/);
});

test("carriage objects have a visually hidden button list that shares the interaction path and shows on keyboard focus",()=>{
  const list=template.split("<ul ")[1]?.split("</ul>")[0]??"";
  expect(list).toStartWith('class="sr-only train-objects" aria-label="Carriage objects" data-train-objects>');
  expect(template).toMatch(/\.train-objects:focus-within \{[^}]*position:absolute;[^}]*width:auto;[^}]*clip:auto;/);
  for(const [object,label] of [["case","Travel case"],["notebooks","Notebooks"],["radio","Radio"],["cord","Light cord"],["lamps","Lamps"],["avatar","Torch catalog"]])expect(list).toContain(`["${object}","${label}",`);
  expect(list).toContain('<button type="button" data-train-object={object}');
  expect(template.match(/data-train-object=/g)).toHaveLength(1);
  expect(template).not.toMatch(/\.sr-only\s*\{/);
  expect(template).toContain("if(button?.dataset.trainObject)activate(button.dataset.trainObject);");
  for(const object of ["case","cord","radio","notebooks","lamps","avatar"])expect(template).toContain(`object==="${object}"`);
  expect(template).not.toContain("data-train-action");
  expect(scene).not.toMatch(/"Key[IRLPTF]"/);
  expect(scene).toContain('event.code === "KeyE"');
  expect(scene).toContain("if (click) {");
});
