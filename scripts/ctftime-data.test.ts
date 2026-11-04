import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {achievements2026Obscuri,achievements2026Syndication,allAchievements,ctftime2026Obscuri} from "../src/data";

const results=[
  [3113,156,"12.859"],[3041,49,"30.214"],[3205,50,"10.586"],[3195,48,"45.148"],
  [3153,12,"52.127"],[2937,130,"30.643"],[3197,82,"12.725"],[2983,29,"17.307"],
  [3095,11,"83.149"],[3105,76,"12.872"],[3166,42,"8.220"],[3133,18,"37.156"],
  [3110,17,"91.429"],[3043,50,"9.638"],[3127,7,"20.986"],[3092,48,"6.527"],
  [3098,11,"20.405"],[3122,10,"24.598"],[3086,133,"7.480"],[3081,8,"16.441"],
  [3066,29,"20.242"],[3015,46,"33.362"],[3058,42,"0.823"],[2767,8,"27.000"],
  [3083,13,"15.486"],[3024,6,"22.490"],[3053,7,"25.383"],[2986,149,"0.000"],
  [2969,9,"19.546"],
] as const;

test("Sudocrypt is recorded as a Syndication win without treating CTF points as rating points",()=>{
  const result=achievements2026Syndication.find(result=>result.href==="https://ctftime.org/event/3443");
  expect(result).toEqual({rating:"4,069 points",source:"CTFtime",title:"Sudocrypt v16.0",href:"https://ctftime.org/event/3443",team:"Syndication",dates:"27 Oct 2026 - 28 Oct 2026",scope:"International",organizer:"Exun Clan, DPS RK Puram",finish:"Finished 1st."});
  expect(achievements2026Syndication).toHaveLength(5);
  expect(allAchievements).toContain(result!);
});

test("the 2026 Obscuri snapshot matches its checked CTFtime team rating",()=>{
  expect(ctftime2026Obscuri).toEqual({href:"https://ctftime.org/team/370140/",checkedAt:"2026-11-05",ratingPoints:477.647,countryPlace:6,overallPlace:58});
  for(const file of ["TeamStory.astro","Journey.astro"]) {
    const source=readFileSync(new URL(`../src/components/${file}`,import.meta.url),"utf8");
    expect(source).toContain("ctftime2026Obscuri.ratingPoints");
    expect(source).toContain("ctftime2026Obscuri.countryPlace");
    expect(source).not.toContain("455.576");
  }
});

test("all 29 published 2026 CTFtime results retain their event places and current rating points",()=>{
  const rated=achievements2026Obscuri.filter(result=>result.source==="CTFtime");
  expect(rated).toHaveLength(results.length);
  expect(new Set(rated.map(result=>result.href)).size).toBe(results.length);
  for(const [id,place,rating] of results) {
    const result=rated.find(result=>result.href===`https://ctftime.org/event/${id}`)!;
    expect(result).toBeDefined();
    expect(result.team).toBe("0bscuri7y");expect(result.rating).toBe(`${rating} RP`);
    expect(result.finish).toMatch(new RegExp(`^Finished ${place}(?:st|nd|rd|th) among `));
    expect(result.dates).toContain("2026");expect(result.organizer.length).toBeGreaterThan(0);
  }
  const ratings=rated.map(result=>Number.parseFloat(result.rating));
  expect(ratings).toEqual([...ratings].sort((a,b)=>b-a));
});

test("new event totals are sourced and the non-CTFtime Redfox result remains",()=>{
  for(const [id,total] of [[3113,925],[3197,517],[3105,756],[3086,461],[3058,892],[2986,686]]) {
    expect(achievements2026Obscuri.find(result=>result.href===`https://ctftime.org/event/${id}`)?.finish).toEndWith(`among ${total} teams.`);
  }
  const redfox=achievements2026Obscuri.find(result=>result.title==="Redfox CTF 2026")!;
  expect(redfox.source).toBe("");expect(redfox.finish).toBe("Finished 2nd, earning $500.");
  expect(allAchievements).toContain(redfox);expect(achievements2026Obscuri).toHaveLength(30);
});
