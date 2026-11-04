import {expect,test} from "bun:test";
import {RADIO_STATIONS,defaultRadioSource,radioNotePhase,radioStation,radioVolume} from "../src/lib/trainRadio";
import {readFileSync} from "node:fs";

test("live station selection is allowlisted and defaults suit day and night",()=>{
  for(const station of RADIO_STATIONS) {
    expect(new URL(station.url).protocol).toBe("https:");
    expect(new URL(station.homepage).protocol).toBe("https:");
    expect(radioStation(station.id)).toBe(station);
  }
  expect(radioStation("https://untrusted.test/audio")).toBeUndefined();
  expect(radioStation("playlist")).toBeUndefined();
  expect(defaultRadioSource(false)).toBe("mellow");
  expect(defaultRadioSource(true)).toBe("jazz24");
});

test("radio volume is clamped and music note motion wraps without invalid values",()=>{
  expect(radioVolume(.35)).toBe(.35);
  expect(radioVolume(-1)).toBe(0);
  expect(radioVolume(2)).toBe(1);
  expect(radioVolume(NaN)).toBe(1);
  expect(radioVolume(Infinity)).toBe(1);
  for(const now of [0,500,10_000,1_000_000])for(let index=0;index<6;index++) {
    const phase=radioNotePhase(now,index);
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
  }
  expect(radioNotePhase(2200,0)).toBe(radioNotePhase(0,0));
});

test("the radio panel shares commands with the persistent player and exposes accessible controls",()=>{
  const view=readFileSync(new URL("../src/components/TrainCarriage.astro",import.meta.url),"utf8");
  expect(view).toContain('id="radio-panel"');
  expect(view).toContain('aria-label="Radio volume"');
  expect(view).toContain('new CustomEvent("music:command",{detail})');
  expect(view).toContain('window.addEventListener("music:state"');
  expect(view).toContain('openDialog(radioDialog)');
  const player=readFileSync(new URL("../src/components/react/SpotifyPlayer.tsx",import.meta.url),"utf8");
  expect(player).toContain('<audio ref={liveRef} preload="none"');
  expect(player).toContain('live.removeAttribute("src");live.load();');
  expect(player).toContain('gain*volumeRef.current');
  expect(player).toContain('live.getAttribute("src")!==station.url||live.error');
  expect(player).not.toContain('addEventListener("stalled",waiting)');
  expect(player).toContain('generation!==playlistGeneration.current');
});
