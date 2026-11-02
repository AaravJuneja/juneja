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

test("the keyboard guide describes controls without manual action toggles",()=>{
  const keys=dialog("keys-panel");
  for(const key of ["Shift","V","O","Space","Esc"])expect(keys).toContain(`<kbd>${key}</kbd>`);
  for(const key of ["Ctrl","C","Q"])expect(keys).not.toContain(`<kbd>${key}</kbd>`);
  expect(keys).not.toMatch(/<(?:input|select)\b/);
  expect(keys.match(/<button\b/g)).toHaveLength(1);
  expect(keys.match(/<dl\b/g)).toHaveLength(1);
  expect(keys).not.toContain("<h3");
  expect(keys).not.toMatch(/<kbd>[WASD↑↓←→]<\/kbd>/);
  expect(keys).toContain("<kbd>E</kbd></dt><dd>Interact</dd>");
  expect(keys.match(/<kbd>/g)).toHaveLength(6);
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

test("world objects have no overlay buttons or shortcut bypasses",()=>{
  expect(template).not.toContain("data-train-action");
  expect(scene).not.toMatch(/"Key[IRLPTF]"/);
  expect(scene).toContain('event.code === "KeyE"');
  expect(scene).toContain("if (click) {");
});
