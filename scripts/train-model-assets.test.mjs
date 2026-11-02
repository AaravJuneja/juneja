import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import {gunzipSync} from "node:zlib";

function glb(path) {
  const source=readFileSync(new URL(path,import.meta.url));
  const bytes=path.endsWith(".gz")?gunzipSync(source):source;
  assert.equal(bytes.toString("ascii",0,4),"glTF");
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12);
  const document=JSON.parse(bytes.toString("utf8",20,20+length));
  const binary=bytes.subarray(28+length);
  return {document,binary};
}

test("all published model metadata is stripped consistently",()=>{
  for(const path of ["../public/train/carriage.glb.gz","../public/train/flashlight.glb","../public/train/avatars/sniqr.glb","../private/train/avatar.glb"]) {
    const {document,binary}=glb(path);
    assert.equal(document.asset.generator,undefined);
    assert.equal(document.asset.copyright,undefined);
    assert.equal(JSON.stringify(document).includes('"extras":'),false);
    assert.ok(!document.extensionsUsed?.includes("KHR_xmp_json_ld"));
    for(const image of document.images??[]) {
      const view=document.bufferViews[image.bufferView];
      const raw=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
      if(raw.toString("hex",0,8)!=="89504e470d0a1a0a")continue;
      let offset=8;
      while(offset+12<=raw.length) {
        const length=raw.readUInt32BE(offset),kind=raw.toString("ascii",offset+4,offset+8);
        assert.ok(!["eXIf","tEXt","iTXt","zTXt"].includes(kind));
        offset+=length+12;
      }
    }
  }
});

for(const [name,path] of [["male","../public/train/avatars/sniqr.glb"],["private avatar","../private/train/avatar.glb"]]) {
  test(`${name} has complete embedded textures and seven skinned animation clips`,()=>{
    const {document}=glb(path);
    assert.equal(document.asset.generator,undefined);
    assert.equal(document.asset.copyright,undefined);
    assert.equal(JSON.stringify(document).includes('"extras":'),false);
    assert.equal(document.skins.length,1);
    assert.ok(document.skins[0].joints.length>=17);
    assert.deepEqual(document.animations.map(clip=>clip.name),["Idle","Walk","Run","Jump","Fall","Prone","Crawl"]);
    assert.ok(document.images.every(image=>Number.isInteger(image.bufferView)&&!image.uri));
    assert.ok(document.materials.every(material=>material.alphaMode!=="BLEND"));
    for(const clip of document.animations)for(const sampler of clip.samplers) {
      assert.equal(document.accessors[sampler.input].min[0],0);
      assert.ok(document.accessors[sampler.input].max[0]>0);
    }
  });
  test(`${name} vertex weights are finite and normalized`,()=>{
    const {document,binary}=glb(path);
    for(const mesh of document.meshes)for(const primitive of mesh.primitives) {
      const accessor=document.accessors[primitive.attributes.WEIGHTS_0];
      assert.equal(accessor.type,"VEC4");
      assert.equal(accessor.componentType,5126);
      const view=document.bufferViews[accessor.bufferView];
      for(let i=0;i<accessor.count;i++) {
        const offset=(view.byteOffset??0)+(accessor.byteOffset??0)+i*(view.byteStride??16);
        const weights=[0,1,2,3].map(n=>binary.readFloatLE(offset+n*4));
        assert.ok(weights.every(weight=>Number.isFinite(weight)&&weight>=0&&weight<=1));
        assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<.0001);
      }
    }
  });
}

test("torch is a separate compact model and no private model is in public assets",()=>{
  const {document}=glb("../public/train/flashlight.glb");
  assert.ok(document.meshes.length>=10);
  assert.ok(document.materials.some(material=>material.name==="TorchShell"));
  assert.equal(document.skins,undefined);
  assert.deepEqual(readdirSync(new URL("../public/train/avatars",import.meta.url)),["sniqr.glb"]);
  assert.deepEqual(readdirSync(new URL("../dist/train/avatars",import.meta.url)),["sniqr.glb"]);
});
