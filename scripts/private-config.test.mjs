import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,existsSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,extname} from "node:path";
import {gunzipSync} from "node:zlib";
import {test} from "node:test";

const root=fileURLToPath(new URL("../",import.meta.url));
const configKeys=["AVATAR_UNLOCK_CODE","AVATAR_SESSION_KEY","AVATAR_PRIVATE_LABEL","AVATAR_PRIVATE_SOURCE_ID","AVATAR_PRIVATE_PROFILE_URL"];
const scanned=[".ts",".tsx",".astro",".js",".mjs",".html",".svg",".json",".jsonc",".txt",".css",".xml",".glb",".gz"];

function privateValues() {
  const values={};
  for(const key of configKeys)if(process.env[key])values[key]=process.env[key];
  const local=resolve(root,".dev.vars");
  if(existsSync(local))for(const line of readFileSync(local,"utf8").split(/\r?\n/)) {
    const match=line.match(/^([A-Z_]+)\s*=\s*["']?(.*?)["']?\s*$/);
    if(match&&configKeys.includes(match[1])&&match[2])values[match[1]]=match[2];
  }
  return Object.entries(values).map(([key,value])=>({key,bytes:Buffer.from(value,"utf8"),folded:value.normalize("NFC").toLowerCase()}));
}

function leaks(data,secrets) {
  const text=data.toString("utf8").normalize("NFC").toLowerCase();
  return secrets.filter(secret=>data.includes(secret.bytes)||text.includes(secret.folded)).map(secret=>secret.key);
}

function publicationFiles() {
  const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{cwd:root,encoding:"utf8"}).split("\0").filter(Boolean);
  const visit=(directory)=>{
    if(!existsSync(resolve(root,directory)))return;
    for(const entry of readdirSync(resolve(root,directory),{withFileTypes:true})) {
      const file=`${directory}/${entry.name}`;
      if(entry.isDirectory())visit(file);
      else if(entry.isFile())files.push(file);
    }
  };
  visit("dist");
  return [...new Set(files)].filter(file=>scanned.includes(extname(file))&&existsSync(resolve(root,file)));
}

const secrets=privateValues();
const missing=configKeys.filter(key=>!secrets.some(secret=>secret.key===key));
const skipReason=secrets.length?false:`no private configuration found: set ${configKeys.join(", ")} in the environment or .dev.vars to run the leak scan`;
if(skipReason)console.warn(`private-config: SKIPPED, ${skipReason}`);
else if(missing.length)console.warn(`private-config: scanning ${secrets.length} of ${configKeys.length} values, missing ${missing.join(", ")}`);

test("local private configuration stays out of git",()=>{
  const tracked=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{cwd:root,encoding:"utf8"}).split("\0").filter(Boolean);
  assert.ok(!tracked.some(file=>file.startsWith(".dev.vars")),"Local private configuration must be gitignored");
});

test("the leak matcher compares UTF-8 bytes and folds case",()=>{
  const planted=[{key:"AVATAR_PRIVATE_LABEL",bytes:Buffer.from("Zoë Ångström","utf8"),folded:"zoë ångström"}];
  assert.deepEqual(leaks(Buffer.from("label: Zoë Ångström","utf8"),planted),["AVATAR_PRIVATE_LABEL"]);
  assert.deepEqual(leaks(Buffer.from("LABEL: ZOË ÅNGSTRÖM","utf8"),planted),["AVATAR_PRIVATE_LABEL"]);
  assert.deepEqual(leaks(Buffer.concat([Buffer.from([0xff,0xc3]),Buffer.from("Zoë Ångström","utf8"),Buffer.from([0x80])]),planted),["AVATAR_PRIVATE_LABEL"]);
  assert.deepEqual(leaks(Buffer.from("label: Zoe Angstrom","latin1"),planted),[]);
  assert.deepEqual(leaks(Buffer.from("Zo\u00eb \u00c5ngstr\u00f6m","latin1"),planted),[]);
});

test("private configuration values never appear in publication source or assets",{skip:skipReason},()=>{
  const files=publicationFiles();
  assert.ok(files.length>0,"No publication files were found to scan");
  assert.ok(files.some(file=>file.startsWith("src/")),"Source files were not scanned");
  assert.ok(files.some(file=>file.startsWith("public/")),"Public assets were not scanned");
  if(!existsSync(resolve(root,"dist")))console.warn("private-config: dist/ is absent, built output was not scanned");
  for(const file of files) {
    let data=readFileSync(resolve(root,file));
    if(extname(file)===".gz")data=gunzipSync(data);
    const leaked=leaks(data,secrets);
    assert.deepEqual(leaked,[],`Private configuration (${leaked.join(", ")}) leaked into ${file}`);
  }
});
