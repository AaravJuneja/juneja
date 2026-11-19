import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { test } from "node:test";
import {gunzipSync} from "node:zlib";

const publicAvatar="../public/train/avatars/sniqr.glb.gz";
const publicAvatarLow="../public/train/avatars/sniqr-low.glb.gz";
const torch="../public/train/flashlight.glb.gz";
const publishedAvatars=["sniqr-low.glb.gz","sniqr.glb.gz"];

function glb(path) {
  const source=readFileSync(new URL(path,import.meta.url));
  if(path.endsWith(".gz"))assert.equal(source.readUInt16BE(0),0x1f8b,`${path} is not gzip`);
  const bytes=path.endsWith(".gz")?gunzipSync(source):source;
  assert.equal(bytes.toString("ascii",0,4),"glTF");
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12);
  const document=JSON.parse(bytes.toString("utf8",20,20+length));
  const binary=bytes.subarray(28+length);
  return {document,binary};
}

function imageBytes(document,binary,image) {
  const view=document.bufferViews[image.bufferView];
  return binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
}

function imageSize(raw) {
  if(raw.toString("hex",0,8)==="89504e470d0a1a0a")return {format:"png",width:raw.readUInt32BE(16),height:raw.readUInt32BE(20)};
  if(raw[0]===0xff&&raw[1]===0xd8) {
    let offset=2;
    while(offset+9<raw.length) {
      if(raw[offset]!==0xff) {offset++;continue;}
      const marker=raw[offset+1];
      if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)) {offset+=2;continue;}
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {format:"jpeg",width:raw.readUInt16BE(offset+7),height:raw.readUInt16BE(offset+5)};
      offset+=2+raw.readUInt16BE(offset+2);
    }
    assert.fail("JPEG has no frame header");
  }
  if(raw.toString("ascii",0,4)==="RIFF"&&raw.toString("ascii",8,12)==="WEBP") {
    const chunk=raw.toString("ascii",12,16);
    if(chunk==="VP8X")return {format:"webp",width:1+raw.readUIntLE(24,3),height:1+raw.readUIntLE(27,3)};
    if(chunk==="VP8L") {const bits=raw.readUInt32LE(21);return {format:"webp",width:1+(bits&0x3fff),height:1+((bits>>14)&0x3fff)};}
    if(chunk==="VP8 ")return {format:"webp",width:raw.readUInt16LE(26)&0x3fff,height:raw.readUInt16LE(28)&0x3fff};
  }
  if(raw.toString("hex",0,12)==="ab4b5458203230bb0d0a1a0a")return {format:"ktx2",width:raw.readUInt32LE(20),height:raw.readUInt32LE(24)};
  assert.fail(`Unsupported embedded image format ${raw.toString("hex",0,12)}`);
}

function embeddedImages(path) {
  const {document,binary}=glb(path);
  assert.ok((document.images??[]).length>0,`${path} has no embedded images`);
  return document.images.map(image=>{
    assert.ok(Number.isInteger(image.bufferView)&&!image.uri,`${path} references an external image`);
    const size=imageSize(imageBytes(document,binary,image));
    assert.ok(Number.isInteger(size.width)&&size.width>0&&Number.isInteger(size.height)&&size.height>0,`${path} has an empty ${size.format} image`);
    return size;
  });
}

test("all published model metadata is stripped consistently",()=>{
  for(const path of ["../public/train/carriage.glb.gz",torch,publicAvatar,publicAvatarLow]) {
    const {document,binary}=glb(path);
    assert.equal(document.asset.generator,undefined);
    assert.equal(document.asset.copyright,undefined);
    assert.equal(JSON.stringify(document).includes('"extras":'),false);
    assert.ok(!document.extensionsUsed?.includes("KHR_xmp_json_ld"));
    for(const image of document.images??[]) {
      const raw=imageBytes(document,binary,image);
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

for(const [name,path] of [["Sniqr",publicAvatar],["Sniqr low",publicAvatarLow]]) {
  test(`${name} has complete embedded textures and seven skinned animation clips`,()=>{
    const {document}=glb(path);
    assert.equal(document.asset.generator,undefined);
    assert.equal(document.asset.copyright,undefined);
    assert.equal(JSON.stringify(document).includes('"extras":'),false);
    assert.equal(document.skins.length,1);
    assert.ok(document.skins[0].joints.length>=17);
    assert.ok(document.animations.length>0);
    assert.deepEqual(document.animations.map(clip=>clip.name),["Idle","Walk","Run","Jump","Fall","Prone","Crawl"]);
    assert.ok(document.images.length>0);
    assert.ok(document.textures.length>0);
    assert.ok(document.textures.every(texture=>Number.isInteger(texture.source)&&document.images[texture.source]));
    assert.ok(document.materials.every(material=>material.alphaMode!=="BLEND"));
    for(const size of embeddedImages(path))assert.ok(size.width<=4096&&size.height<=4096);
    for(const clip of document.animations) {
      assert.ok(clip.channels.length>0&&clip.samplers.length>0);
      for(const sampler of clip.samplers) {
        assert.equal(document.accessors[sampler.input].min[0],0);
        assert.ok(document.accessors[sampler.input].max[0]>0);
      }
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

test("embedded image size parsing covers every supported format",()=>{
  const png=Buffer.alloc(24);Buffer.from("89504e470d0a1a0a","hex").copy(png);png.writeUInt32BE(300,16);png.writeUInt32BE(200,20);
  assert.deepEqual(imageSize(png),{format:"png",width:300,height:200});
  const jpeg=Buffer.from("ffd8ffe000104a46494600010100000100010000ffc0001108012c00c803012200021101031101","hex");
  assert.deepEqual(imageSize(jpeg),{format:"jpeg",width:200,height:300});
  const lossless=Buffer.alloc(30);lossless.write("RIFF",0,"ascii");lossless.write("WEBPVP8L",8,"ascii");lossless.writeUInt32LE((127)|(63<<14),21);
  assert.deepEqual(imageSize(lossless),{format:"webp",width:128,height:64});
  const extended=Buffer.alloc(30);extended.write("RIFF",0,"ascii");extended.write("WEBPVP8X",8,"ascii");extended.writeUIntLE(255,24,3);extended.writeUIntLE(511,27,3);
  assert.deepEqual(imageSize(extended),{format:"webp",width:256,height:512});
  const lossy=Buffer.alloc(30);lossy.write("RIFF",0,"ascii");lossy.write("WEBPVP8 ",8,"ascii");lossy.writeUInt16LE(640,26);lossy.writeUInt16LE(480,28);
  assert.deepEqual(imageSize(lossy),{format:"webp",width:640,height:480});
  const ktx=Buffer.alloc(28);Buffer.from("ab4b5458203230bb0d0a1a0a","hex").copy(ktx);ktx.writeUInt32LE(1024,20);ktx.writeUInt32LE(512,24);
  assert.deepEqual(imageSize(ktx),{format:"ktx2",width:1024,height:512});
  assert.throws(()=>imageSize(Buffer.from("47494638396101000100","hex")));
});

test("torch is a separate compact model and only one character is published",()=>{
  const {document}=glb(torch);
  assert.ok(document.meshes.length>=10);
  assert.ok(document.materials.some(material=>material.name==="TorchShell"));
  assert.equal(document.skins,undefined);
  assert.deepEqual(readdirSync(new URL("../public/train/avatars",import.meta.url)).sort(),publishedAvatars);
  const distAvatars=new URL("../dist/train/avatars",import.meta.url);
  if(existsSync(distAvatars))assert.deepEqual(readdirSync(distAvatars).sort(),publishedAvatars);
});

test("low-detail avatar variants downsample embedded textures without changing animation clips",()=>{
  for(const [highPath,lowPath] of [[publicAvatar,publicAvatarLow]]) {
    const {document:high}=glb(highPath);
    const {document:low}=glb(lowPath);
    assert.deepEqual(low.animations.map(clip=>clip.name),high.animations.map(clip=>clip.name));
    assert.equal(low.meshes.length,high.meshes.length);
    const highSizes=embeddedImages(highPath),lowSizes=embeddedImages(lowPath);
    assert.equal(lowSizes.length,highSizes.length);
    for(const size of lowSizes)assert.ok(size.width<=256&&size.height<=256,`${lowPath} has a ${size.width}x${size.height} ${size.format} texture`);
    assert.ok(highSizes.some(size=>size.width>256||size.height>256));
  }
});
