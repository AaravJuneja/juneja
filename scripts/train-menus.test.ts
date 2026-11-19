import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";

const template=readFileSync(new URL("../src/components/TrainCarriage.astro",import.meta.url),"utf8");
const scene=readFileSync(new URL("../src/lib/trainScene.ts",import.meta.url),"utf8");
const dialog=(id:string)=>template.split(`<dialog id="${id}"`)[1]?.split("</dialog>")[0]??"";

test("the compact toolbar keeps labeled icon controls and persistent state indicators",()=>{
  const menu=template.split('<nav class="train-menu"')[1]?.split("</nav>")[0]??"";
  expect(menu.match(/train-icon-button/g)).toHaveLength(3);
  expect(menu.match(/<svg /g)).toHaveLength(4);
  for(const label of ["Graphics: Low. Switch to High","Sound","Simulation","Keyboard controls"])expect(menu).toContain(`aria-label="${label}"`);
  expect(menu).toContain(">Graphics: Low</button>");
  expect(menu).toContain(">Catalog</button>");
  expect(template).not.toContain("soundButton.textContent");
  expect(template).toContain("graphicsButton.textContent=label");
  expect(template).toContain('soundButton.setAttribute("aria-pressed",String(on))');
  expect(template).toContain('.train-menu .train-icon-button[hidden] { display:none; }');
});

test("lamp and playback actions use labeled icons without overwriting their SVGs",()=>{
  const lamps=dialog("lamp-panel"),radio=dialog("radio-panel");
  expect(lamps).toContain('data-train-lamp-on type="button" aria-label="Light" aria-pressed="true"');
  expect(lamps).not.toContain("Light on</label>");
  expect(template).toContain('lampOn.getAttribute("aria-pressed")==="true"');
  expect(template).toContain('lampOn.addEventListener("click"');
  expect(radio).toContain('data-train-radio-play data-playing="false" aria-label="Play"');
  expect(radio).toContain('data-train-radio-next aria-label="Next track"');
  expect(template).toContain('radioPlay.dataset.playing=String(playing)');
  expect(template).not.toContain("radioPlay.textContent");
  expect(radio.split('<div class="radio-transport">')[1]?.split('</div>')[0]).toContain("data-train-radio-volume");
});

test("the travel case shows every interest without an accordion",()=>{
  const travelCase=dialog("travel-case");
  expect(travelCase).toContain('<ul class="train-interests">');
  expect(travelCase).toContain("interest.description");
  expect(travelCase).not.toContain("<details");
  expect(travelCase).toContain('href="/team">Team</a>');
  expect(travelCase).toContain('<footer class="train-footer">');
});

test("notebooks show useful project metadata rather than sync implementation details",()=>{
  const notebooks=dialog("notebook-panel");
  expect(notebooks).toContain("My public GitHub projects, newest first");
  expect(notebooks).toContain("Updated <a");
  expect(notebooks).toContain("repo.commitHref ?? repo.commitsHref");
  expect(notebooks).not.toContain("usingPreviousCommit");
  expect(notebooks).not.toContain("No commits yet");
  expect(notebooks).toContain("All repositories on GitHub");
});

test("radio controls distinguish playlist playback from live broadcasts",()=>{
  expect(template).toContain("radioNext.hidden=live");
  expect(template).not.toContain('radioPlay.setAttribute("aria-pressed"');
  expect(template).toContain('live?"Live":"Playing"');
  expect(template).toContain('live?"Off":"Paused"');
  expect(template).toContain('if(statusElement.textContent!==status)statusElement.textContent=status');
  expect(template).not.toContain("data-train-radio-info");
  expect(template).not.toContain("Best with headphones");
  expect(dialog("radio-panel")).toContain("data-train-radio-spatial-unavailable hidden");
  expect(template).toContain('get("radio-spatial-unavailable").hidden=state.spatialSupported');
  expect(template).toContain("Stream provided by ${station.provider}");
  expect(template).not.toContain("Live audio uses your internet connection");
  expect(dialog("radio-panel")).not.toContain("<span>88</span>");
});

test("the catalog contains skins without gameplay or avatar controls",()=>{
  const catalog=dialog("catalog-panel");
  expect(catalog).toContain("data-train-skins");
  expect(catalog).toContain("Choose your torch finish");
  expect(template).not.toContain("Select a finish to equip it");
  expect(catalog).not.toMatch(/<(?:input|select|details)\b/);
  expect(catalog).not.toMatch(/data-train-(?:power|tool|posture|torch|shift-lock|avatar|perspective|camera)\b/);
  expect(catalog).not.toContain('role="tab"');
});

test("the train has one character without a redundant selection menu",()=>{
  expect(template).not.toContain("data-train-avatar");
  expect(template).not.toContain("data-train-settings");
  expect(scene).not.toContain("setAvatar(");
});

test("the keyboard guide keeps less obvious controls without repeating the on-screen hints",()=>{
  const keys=dialog("keys-panel");
  for(const [key,description] of [["Shift","Toggle shift lock"],["V","First or third person"],["O","Free orbit or character aim"],["Space","Jump; press again to double jump"],["E","Interact"],["Home","Return to your seat"],["Esc","Release mouse lock or close a menu"]]) {
    expect(keys).toContain(`<kbd>${key}</kbd></dt><dd>${description}</dd>`);
  }
  expect(keys).not.toMatch(/<(?:input|select)\b/);
  expect(keys.match(/<button\b/g)).toHaveLength(1);
  expect(keys.match(/<dl\b/g)).toHaveLength(1);
  expect(keys).not.toContain("<h3");
  expect(keys).not.toMatch(/<kbd>[WASD↑↓←→]<\/kbd>/);
  expect(keys).toContain("<kbd>E</kbd></dt><dd>Interact</dd>");
  for(const key of ["W A S D","Control","C","Q","M"])expect(keys).not.toContain(`<kbd>${key}</kbd>`);
  expect(keys.match(/<kbd>/g)).toHaveLength(7);
  expect(template).toContain("data-train-keys");
});

test("quick controls are non-interactive main-screen hints",()=>{
  const hints=template.split('<dl class="train-key-hints"')[1]?.split("</dl>")[0]??"";
  for(const key of ["C","Ctrl","Q"])expect(hints).toContain(`<kbd>${key}</kbd>`);
  expect(hints).not.toMatch(/<(?:button|input|a)\b/);
});

test("touch screens have a dedicated jump button without changing keyboard controls",()=>{
  expect(template).toContain('data-train-jump type="button" aria-label="Jump. Tap again in the air to double jump"');
  expect(template).toContain('@media (any-pointer:coarse)');
  expect(template).toContain('.train-jump { display:none; }');
  expect(template).toContain('jumpButton.addEventListener("pointerdown"');
  expect(template).toContain('event.preventDefault();session?.jump()');
  expect(template).toContain('if(event.detail===0)session?.jump()');
  expect(template).toContain('jumpButton.disabled=true');
  expect(template).toContain('jumpButton.disabled=false');
});

test("simulation controls expose a continuous world speed slider and hitboxes",()=>{
  const panel=dialog("simulation-panel");
  expect(template).toContain('data-train-simulation type="button"');
  expect(panel).toContain("World speed");expect(panel).toContain("Show hitboxes");
  expect(panel).toContain('data-train-world-speed type="range" min="0.25" max="3" step="any" value="1" aria-valuetext="1×"');
  expect(panel).toContain('data-train-world-speed-value aria-hidden="true">1×');
  expect(panel).toContain("Speed up or slow down the train, movement, jumps and stamina");
  expect(panel).not.toContain("Music stays at normal speed");
  expect(template).toContain('worldSpeed.addEventListener("input",syncWorldSpeed');
  expect(template).toContain('const label=`${Number(value.toFixed(2))}×`');
  expect(template).toContain('worldSpeedValue.textContent=label');
  expect(template).toContain('worldSpeed.setAttribute("aria-valuetext",label)');
  expect(template).toContain('session?.setWorldSpeed(value)');
  expect(template).toContain('hitboxes.addEventListener("change",()=>session?.setHitboxes(hitboxes.checked)');
  expect(scene).toContain("if(value&&!hitboxes)hitboxes=createTrainHitboxes");
});

test("catalog activation uses a normal click without hidden input or network checks",()=>{
  expect(template).toContain('catalogButton.addEventListener("click",()=>openDialog(catalogDialog)');
  expect(template).not.toContain('type="password"');
  expect(template).not.toContain("KeyU");
  expect(template).not.toContain("holdTimer");
  expect(template).not.toContain('fetch("/api/');
});

test("graphics start low and can be switched without adding gameplay controls",()=>{
  expect(template).toContain('data-train-graphics type="button"');
  expect(template).toContain('aria-label="Graphics: Low. Switch to High"');
  expect(template).toContain('aria-pressed="false" disabled');
  expect(scene).toContain('initialQuality:TrainGraphicsQuality="low"');
  expect(template).toContain("}, graphicsQuality);");
  expect(template).toMatch(/const stop = \(\) => \{[^}]*graphicsButton\.disabled=true;/);
  expect(scene).toContain('setGraphics(value:TrainGraphicsQuality)');
  expect(scene).toMatch(/const torch=createTrainTorch\(scene,renderer,signal\);\s*torch\.setQuality\(graphicsQuality\);/);
  expect(scene).toMatch(/const swapped=await swapRenderer\(value\);[\s\S]{0,80}if\(!swapped\) \{\s*desiredQuality=previous;/);
});

test("the train fallback reports the underlying error",()=>{
  expect(template).toContain('const fallback = (error:unknown) =>');
  expect(template).toContain('error instanceof Error?error.message:String(error)');
  expect(template).toContain('else fallback(error);');
  expect(scene).toContain('actions.failed(new Error("WebGL context was lost"))');
});

test("carriage objects have a visually hidden button list that shares the interaction path and shows on keyboard focus",()=>{
  const list=template.split("<ul ")[1]?.split("</ul>")[0]??"";
  expect(list).toStartWith('class="sr-only train-objects" aria-label="Carriage objects" data-train-objects>');
  expect(template).toMatch(/\.train-objects:focus-within \{[^}]*position:absolute;[^}]*width:auto;[^}]*clip:auto;/);
  for(const [object,label] of [["case","Travel case"],["notebooks","Notebooks"],["radio","Radio"],["cord","Light cord"],["lamps","Lamps"],["desk","Writing desk"],["luggage","Luggage racks"],["door","Front door"],["avatar","Torch catalog"]])expect(list).toContain(`["${object}","${label}",`);
  expect(list).not.toContain('["windows",');
  expect(template).not.toContain('object==="windows"');
  expect(list).toContain('<button type="button" data-train-object={object}');
  expect(template.match(/data-train-object=/g)).toHaveLength(1);
  expect(template).not.toMatch(/\.sr-only\s*\{/);
  expect(template).toContain("if(button?.dataset.trainObject)activate(button.dataset.trainObject);");
  for(const object of ["case","cord","radio","notebooks","lamps","desk","luggage","door","avatar"])expect(template).toContain(`object==="${object}"`);
  expect(template).not.toContain("data-train-action");
  expect(scene).not.toMatch(/"Key[IRLPTF]"/);
  expect(scene).toContain('event.code === "KeyE"');
  expect(scene).toContain("if (click) {");
});
