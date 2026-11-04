export type TrainSound="torch"|"key"|"drawer-open"|"drawer-close"|"charm"|"tick"|"equip"|"step-1"|"step-2"|"step-3"|"step-4"|"locked";
export const STEP_SOUNDS=["step-1","step-2","step-3","step-4"] as const;
const FILES=["torch","key","drawer-open","drawer-close","charm","tick","equip","step-1","step-2","step-3","step-4","ambience"] as const;
type AudioFile=typeof FILES[number];
const LEVELS:Record<TrainSound,number>={torch:.55,key:.6,"drawer-open":.7,"drawer-close":.7,charm:.5,tick:.35,equip:.5,"step-1":.32,"step-2":.32,"step-3":.32,"step-4":.32,locked:.55};
export const AMBIENCE_LEVEL=.22;
export const SOUND_STORAGE_KEY="train-sound";

export interface StrideState {travelled:number;last:number;}
export function stepStride(state:StrideState,distance:number,sprinting:boolean,random:()=>number=Math.random):number|undefined {
  const stride=sprinting?.78:.62;
  state.travelled+=Math.max(0,distance);
  if(state.travelled<stride)return undefined;
  state.travelled%=stride;
  let next=Math.floor(random()*STEP_SOUNDS.length);
  if(next===state.last)next=(next+1)%STEP_SOUNDS.length;
  state.last=next;
  return next;
}

export function readSoundPreference(storage:Pick<Storage,"getItem">|undefined) {
  try {return storage?.getItem(SOUND_STORAGE_KEY)!=="off";} catch {return true;}
}

export function createTrainAudio(signal:AbortSignal) {
  let context:AudioContext|undefined;
  let master:GainNode|undefined;
  let ambienceGain:GainNode|undefined;
  let ambienceSource:AudioBufferSourceNode|undefined;
  let enabled=readSoundPreference(globalThis.localStorage);
  let ambienceWanted=false;
  let loading:Promise<void>|undefined;
  const buffers=new Map<AudioFile,AudioBuffer>();
  const opus=typeof Audio!=="undefined"&&new Audio().canPlayType('audio/webm; codecs="opus"')!=="";
  const decode=async(name:AudioFile)=>{
    if(!context)return;
    for(const ext of opus?["webm","mp3"]:["mp3"]) {
      try {
        const response=await fetch(`/train/audio/${name}.${ext}`,{signal});
        if(!response.ok)continue;
        buffers.set(name,await context.decodeAudioData(await response.arrayBuffer()));
        return;
      } catch(error) {if(signal.aborted)throw error;}
    }
  };
  const load=()=>loading??=(async()=>{
    await Promise.all(FILES.filter(name=>name!=="ambience").map(decode));
    await decode("ambience");
    syncAmbience();
  })().catch(()=>{});
  const fade=(gain:GainNode,value:number,seconds:number)=>{
    if(!context)return;
    const now=context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value,now);
    gain.gain.linearRampToValueAtTime(value,now+seconds);
  };
  const syncAmbience=()=>{
    if(!context||!ambienceGain)return;
    const buffer=buffers.get("ambience");
    const on=enabled&&ambienceWanted&&!!buffer;
    if(on&&!ambienceSource&&buffer) {
      ambienceSource=context.createBufferSource();
      ambienceSource.buffer=buffer;ambienceSource.loop=true;
      ambienceSource.connect(ambienceGain);
      ambienceSource.start(0,Math.random()*buffer.duration);
    }
    fade(ambienceGain,on?AMBIENCE_LEVEL:0,on?1.6:.5);
  };
  const dispose=()=>{
    try {ambienceSource?.stop();} catch {}
    ambienceSource=undefined;
    void context?.close().catch(()=>{});
    context=undefined;
  };
  signal.addEventListener("abort",dispose,{once:true});
  return {
    unlock() {
      if(signal.aborted||!enabled)return;
      if(!context) {
        const Context=globalThis.AudioContext??(globalThis as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
        if(!Context)return;
        context=new Context();
        master=context.createGain();master.connect(context.destination);
        ambienceGain=context.createGain();ambienceGain.gain.value=0;ambienceGain.connect(master);
      }
      if(context.state==="suspended")void context.resume().catch(()=>{});
      void load();
    },
    play(sound:TrainSound,{volume=1,rate=1}:{volume?:number;rate?:number}={}) {
      if(!enabled||!context||!master||context.state!=="running")return;
      const buffer=buffers.get(sound==="locked"?"drawer-close":sound);
      if(!buffer)return;
      const source=context.createBufferSource();
      const gain=context.createGain();
      source.buffer=buffer;
      source.playbackRate.value=sound==="locked"?1.6*rate:rate;
      gain.gain.value=LEVELS[sound]*volume*(sound==="locked"?.6:1);
      source.connect(gain).connect(master);
      source.start(0,sound==="locked"?.05:0,sound==="locked"?.18:undefined);
    },
    setAmbience(value:boolean) {ambienceWanted=value;syncAmbience();},
    setEnabled(value:boolean) {
      enabled=value;
      try {globalThis.localStorage?.setItem(SOUND_STORAGE_KEY,value?"on":"off");} catch {}
      if(value)this.unlock();
      syncAmbience();
    },
    isEnabled() {return enabled;},
    dispose,
  };
}
