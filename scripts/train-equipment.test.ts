import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {DRAWER_DURATION,DRAWER_TRAVEL,drawerOffset,equipmentAction,equipmentInteractive} from "../src/lib/trainEquipment";

test("the drawer stays locked until the key is picked up",()=>{
  let state={hasKey:false,drawerOpen:false};
  expect(equipmentAction(state,"equipment:drawer")).toEqual({state,event:"locked"});
  expect(equipmentAction(state,"equipment:charm").event).toBe("none");
  ({state}=equipmentAction(state,"equipment:key"));
  expect(state.hasKey).toBe(true);
  expect(equipmentAction(state,"equipment:key").event).toBe("none");
  const opened=equipmentAction(state,"equipment:drawer");
  expect(opened.event).toBe("open");
  expect(equipmentAction(opened.state,"equipment:charm").event).toBe("charm");
  expect(equipmentAction(opened.state,"equipment:drawer")).toEqual({state:{hasKey:true,drawerOpen:false},event:"close"});
});

test("only reachable equipment is offered for interaction",()=>{
  expect(equipmentInteractive({hasKey:false,drawerOpen:false},"equipment:key")).toBe(true);
  expect(equipmentInteractive({hasKey:true,drawerOpen:false},"equipment:key")).toBe(false);
  expect(equipmentInteractive({hasKey:true,drawerOpen:false},"equipment:charm")).toBe(false);
  expect(equipmentInteractive({hasKey:true,drawerOpen:true},"equipment:charm")).toBe(true);
  expect(equipmentInteractive({hasKey:false,drawerOpen:false},"equipment:drawer-cavity")).toBe(false);
});

test("the drawer eases between its rest and open positions",()=>{
  expect(drawerOffset(0,DRAWER_TRAVEL,0)).toBe(0);
  expect(drawerOffset(0,DRAWER_TRAVEL,DRAWER_DURATION/2)).toBeCloseTo(DRAWER_TRAVEL/2);
  expect(drawerOffset(0,DRAWER_TRAVEL,DRAWER_DURATION*2)).toBe(DRAWER_TRAVEL);
  expect(drawerOffset(DRAWER_TRAVEL,0,-50)).toBe(DRAWER_TRAVEL);
});

test("the equipment model ships the named meshes the scene expects",()=>{
  const bytes=gunzipSync(readFileSync(new URL("../public/train/equipment.glb.gz",import.meta.url)));
  const length=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+length).toString("utf8")) as {nodes:{name:string;mesh?:number;children?:number[]}[];meshes:{primitives:{attributes:Record<string,number>}[]}[]};
  const names=json.nodes.map(node=>node.name);
  expect(names).toEqual(expect.arrayContaining(["key","drawer","drawer-cavity","charm"]));
  const drawer=json.nodes.find(node=>node.name==="drawer")!;
  expect(drawer.children?.map(index=>json.nodes[index].name)).toEqual(["charm"]);
  for(const mesh of json.meshes)expect(mesh.primitives[0].attributes.COLOR_0).toBeDefined();
  expect(bytes.byteLength).toBeLessThan(40_000);
});
