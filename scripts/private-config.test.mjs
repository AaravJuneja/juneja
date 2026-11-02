import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,existsSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,extname} from "node:path";
import {gunzipSync} from "node:zlib";
import {test} from "node:test";

const root=fileURLToPath(new URL("../",import.meta.url));
const configKeys=["AVATAR_UNLOCK_CODE","AVATAR_SESSION_KEY","AVATAR_PRIVATE_LABEL","AVATAR_PRIVATE_SOURCE_ID","AVATAR_PRIVATE_PROFILE_URL"];

test("private configuration values never appear in publication source or assets",()=>{
  const values={...process.env};
  const local=resolve(root,".dev.vars");
  if(existsSync(local))for(const line of readFileSync(local,"utf8").split(/\r?\n/)) {
    const match=line.match(/^([A-Z_]+)\s*=\s*["']?(.*?)["']?\s*$/);
    if(match)values[match[1]]=match[2];
  }
  const secrets=configKeys.map(key=>values[key]).filter(Boolean).map(value=>value.toLowerCase());
  const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{cwd:root,encoding:"utf8"}).split("\0").filter(Boolean);
  assert.ok(!files.some(file=>file.startsWith(".dev.vars")),"Local private configuration must be gitignored");
  const visit=(directory)=>{
    if(!existsSync(resolve(root,directory)))return;
    for(const entry of readdirSync(resolve(root,directory),{withFileTypes:true})) {
      const file=`${directory}/${entry.name}`;
      if(entry.isDirectory())visit(file);
      else if(entry.isFile())files.push(file);
    }
  };
  visit("dist");
  for(const file of files) {
    const path=resolve(root,file);
    if(!existsSync(path))continue;
    if(![".ts",".tsx",".astro",".js",".mjs",".html",".svg",".json",".jsonc",".txt",".css",".glb",".gz"].includes(extname(file)))continue;
    let data=readFileSync(path);
    if(extname(file)===".gz")data=gunzipSync(data);
    const text=data.toString("latin1").toLowerCase();
    assert.ok(!secrets.some(value=>text.includes(value)),`Private configuration leaked into ${file}`);
  }
});
