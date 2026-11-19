import {expect,test} from "bun:test";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";

const config=JSON.parse(readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8"));

test("Cloudflare serves the static site without a custom worker or server bindings",()=>{
  expect(config.assets).toEqual({directory:"./dist",not_found_handling:"404-page"});
  expect(config.main).toBeUndefined();
  expect(config.rules).toBeUndefined();
  expect(config.ratelimits).toBeUndefined();
});

test("local environment configuration and its variants stay out of git",()=>{
  const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8"}).split("\0").filter(Boolean);
  expect(files.some(file=>/(^|\/)\.(env|dev\.vars)(\.|$)/.test(file))).toBe(false);
  for(const path of [".env",".env.local",".env.production",".dev.vars",".dev.vars.production"]) {
    const ignored=execFileSync("git",["check-ignore",path],{encoding:"utf8"}).trim();
    expect(ignored).toBe(path);
  }
});

test("distributed fonts and icons retain their required license notices",()=>{
  const fonts=readFileSync(new URL("../public/fonts/OFL.txt",import.meta.url),"utf8");
  for(const name of ["Outfit","Anton","Archivo","Rye","Yatra"])expect(fonts).toContain(name);
  expect(fonts).toContain('Reserved Font Name "Rye"');
  expect(fonts).toContain("SIL OPEN FONT LICENSE Version 1.1");
  expect(fonts).toContain("OTHER DEALINGS IN THE FONT SOFTWARE.");
  const icons=readFileSync(new URL("../public/train/lucide-license.txt",import.meta.url),"utf8");
  expect(icons).toContain("Copyright (c) 2026 Lucide Icons and Contributors");
  expect(icons).toContain("Copyright (c) 2013-present Cole Bemis");
});
