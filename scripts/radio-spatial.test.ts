import {expect,test} from "bun:test";
import {createRadioSpatialAudio,radioProximity,type RadioSpatialFrame} from "../src/lib/radioSpatialAudio";

test("radio proximity stays full nearby, fades smoothly with distance and becomes silent far away",()=>{
  expect(radioProximity(0)).toBe(1);
  expect(radioProximity(1.4)).toBe(1);
  expect(radioProximity(2.8)).toBeCloseTo(.5);
  expect(radioProximity(24)).toBe(0);
  expect(radioProximity(100)).toBe(0);
  expect(radioProximity(NaN)).toBe(0);
  let previous=1;
  for(let distance=0;distance<=30;distance+=.1) {
    const gain=radioProximity(distance);
    expect(gain).toBeGreaterThanOrEqual(0);
    expect(gain).toBeLessThanOrEqual(previous);
    previous=gain;
  }
});

class Param {
  value=0;
  setTargetAtTime(value:number) {this.value=value;}
}
class Node {
  gain=new Param();frequency=new Param();Q=new Param();
  positionX=new Param();positionY=new Param();positionZ=new Param();
  connections:Node[]=[];disconnected=false;
  panningModel="";rolloffFactor=1;type="";buffer:unknown;
  connect(node:Node) {this.connections.push(node);return node;}
  disconnect() {this.disconnected=true;}
}
class Context {
  static instances:Context[]=[];
  sampleRate=1000;currentTime=0;state="suspended";
  destination=new Node();nodes:Node[]=[];sources:Node[]=[];
  listener={positionX:new Param(),positionY:new Param(),positionZ:new Param(),forwardX:new Param(),forwardY:new Param(),forwardZ:new Param(),upX:new Param(),upY:new Param(),upZ:new Param()};
  constructor(){Context.instances.push(this);}
  createGain(){const node=new Node();this.nodes.push(node);return node;}
  createPanner(){return this.createGain();}
  createBiquadFilter(){return this.createGain();}
  createConvolver(){return this.createGain();}
  createBuffer(channels:number,length:number){const data=Array.from({length:channels},()=>new Float32Array(length));return {getChannelData:(channel:number)=>data[channel]};}
  createMediaElementSource(){const node=new Node();this.sources.push(node);return node;}
  resume(){this.state="running";return Promise.resolve();}
  close(){this.state="closed";return Promise.resolve();}
}

test("the audio graph follows the listener, restores stereo away from the carriage and releases its resources",()=>{
  const previous=globalThis.AudioContext;
  globalThis.AudioContext=Context as unknown as typeof AudioContext;
  try {
    const start=Context.instances.length;
    const controller=createRadioSpatialAudio([{} as HTMLAudioElement,{} as HTMLAudioElement,{} as HTMLAudioElement],supported=>expect(supported).toBe(true));
    const frame:RadioSpatialFrame={position:{x:2.8,y:1,z:0},emitter:{x:0,y:1,z:0},forward:{x:0,y:0,z:-1},up:{x:0,y:1,z:0},indoors:true};
    controller.setFrame(frame);
    expect(Context.instances).toHaveLength(start);
    controller.unlock();controller.unlock();
    const context=Context.instances[start];
    const [input,flat,direct,wet,filter,panner]=context.nodes;
    expect(context.sources).toHaveLength(3);
    expect(context.state).toBe("running");
    expect(context.listener.positionX.value).toBe(2.8);
    expect(context.listener.forwardZ.value).toBe(-1);
    expect(panner.positionY.value).toBe(1);
    expect(panner.panningModel).toBe("HRTF");
    expect(flat.gain.value).toBe(0);
    expect(direct.gain.value).toBeCloseTo(.5);
    expect(wet.gain.value).toBeCloseTo(.055);
    expect(filter.frequency.value).toBe(8500);
    controller.setFrame({...frame,indoors:false});
    expect(wet.gain.value).toBeCloseTo(.0075);
    expect(filter.frequency.value).toBe(2400);
    controller.setEnabled(false);
    expect(flat.gain.value).toBe(1);
    expect(direct.gain.value).toBe(0);
    expect(wet.gain.value).toBe(0);
    controller.setEnabled(true);controller.setFrame(null);
    expect(flat.gain.value).toBe(1);
    expect(wet.gain.value).toBe(0);
    expect(input.connections).toHaveLength(2);
    controller.dispose();controller.dispose();controller.unlock();
    expect(context.state).toBe("closed");
    expect(context.nodes.every(node=>node.disconnected)).toBe(true);
    expect(context.sources.every(node=>node.disconnected)).toBe(true);
    expect(Context.instances).toHaveLength(start+1);
  } finally {globalThis.AudioContext=previous;}
});

test("starting far from the radio does not briefly play at full volume",()=>{
  const previous=globalThis.AudioContext;
  globalThis.AudioContext=Context as unknown as typeof AudioContext;
  try {
    const controller=createRadioSpatialAudio([{} as HTMLAudioElement],()=>{});
    controller.setFrame({position:{x:40,y:1,z:0},emitter:{x:0,y:1,z:0},forward:{x:0,y:0,z:-1},up:{x:0,y:1,z:0},indoors:false});
    controller.unlock();
    const [,flat,direct,wet]=Context.instances.at(-1)!.nodes;
    expect(flat.gain.value).toBe(0);expect(direct.gain.value).toBe(0);expect(wet.gain.value).toBe(0);
    controller.dispose();
  } finally {globalThis.AudioContext=previous;}
});

test("interrupted contexts resume on playback intent and rejected resumes report a recoverable playback block",async()=>{
  const previous=globalThis.AudioContext;
  globalThis.AudioContext=Context as unknown as typeof AudioContext;
  try {
    let blocked=0;
    const controller=createRadioSpatialAudio([{} as HTMLAudioElement],()=>{},()=>blocked++);
    controller.unlock();
    await Promise.resolve();
    const context=Context.instances.at(-1)!;
    context.state="interrupted";
    controller.unlock();
    expect(context.state).toBe("running");
    expect(context.sources).toHaveLength(1);
    await Promise.resolve();
    context.state="suspended";
    context.resume=()=>Promise.reject(new Error("gesture needed"));
    controller.unlock();
    await Promise.resolve();await Promise.resolve();
    expect(blocked).toBe(1);
    context.resume=()=>{context.state="running";return Promise.resolve();};
    controller.unlock();
    await Promise.resolve();
    expect(context.state).toBe("running");
    expect(context.sources).toHaveLength(1);
    controller.dispose();
  } finally {globalThis.AudioContext=previous;}
});
