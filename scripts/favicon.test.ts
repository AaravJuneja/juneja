import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";

const asset=(name:string)=>readFileSync(new URL(`../public/${name}`,import.meta.url));
const layout=readFileSync(new URL("../src/layouts/Layout.astro",import.meta.url),"utf8");

test("the favicon is a crisp crescent on a sixteen-pixel grid",()=>{
  const svg=asset("favicon.svg").toString();
  expect(svg).toContain('viewBox="0 0 16 16"');
  expect(svg).toContain('shape-rendering="crispEdges"');
  expect(svg).toContain('fill="#ddbcf3"');
  expect(svg.match(/<path /g)).toHaveLength(1);
});

test("the fallback is a real icon with sixteen and thirty-two pixel frames",()=>{
  const ico=asset("favicon.ico");
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(2);
  for(const [index,size] of [16,32].entries()) {
    const entry=6+index*16,offset=ico.readUInt32LE(entry+12),length=ico.readUInt32LE(entry+8);
    expect(ico[entry]).toBe(size);
    expect(ico[entry+1]).toBe(size);
    expect(ico.readUInt16LE(entry+6)).toBe(32);
    expect(ico.readUInt32LE(offset)).toBe(40);
    expect(ico.readInt32LE(offset+4)).toBe(size);
    expect(ico.readInt32LE(offset+8)).toBe(size*2);
    expect(offset+length).toBeLessThanOrEqual(ico.length);
  }
});

test("the touch icon has a full-size opaque square background",()=>{
  const png=asset("apple-touch-icon.png");
  expect(png.toString("hex",0,8)).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(180);
  expect(png.readUInt32BE(20)).toBe(180);
  expect(png[25]).toBe(2);
});

test("every icon link is versioned and declares its supported sizes",()=>{
  expect(layout).toContain('href="/favicon.svg?v=2" sizes="any"');
  expect(layout).toContain('href="/favicon.ico?v=2" sizes="16x16 32x32"');
  expect(layout).toContain('href="/apple-touch-icon.png?v=2" sizes="180x180"');
});
