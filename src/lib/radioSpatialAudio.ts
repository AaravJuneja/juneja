export interface AudioPoint {x:number;y:number;z:number;}
export interface RadioSpatialFrame {position:AudioPoint;forward:AudioPoint;up:AudioPoint;emitter:AudioPoint;indoors:boolean;}

export function radioProximity(distance:number) {
  if(!Number.isFinite(distance))return 0;
  const near=1.4;
  return Math.min(1,near/Math.max(near,distance))*Math.max(0,Math.min(1,(24-distance)/8));
}

export function createRadioSpatialAudio(elements:HTMLMediaElement[],onSupport:(supported:boolean)=>void,onBlocked:()=>void=()=>{}) {
  let context:AudioContext|undefined;
  let flat:GainNode|undefined;
  let direct:GainNode|undefined;
  let wet:GainNode|undefined;
  let filter:BiquadFilterNode|undefined;
  let panner:PannerNode|undefined;
  let input:GainNode|undefined;
  let disposed=false;
  let initialized=false;
  let enabled=true;
  let frame:RadioSpatialFrame|null=null;
  const sources:MediaElementAudioSourceNode[]=[];
  const nodes:AudioNode[]=[];
  const smooth=(param:AudioParam,value:number)=>{
    if(!context)return;
    if(initialized)param.setTargetAtTime(value,context.currentTime,.06);
    else param.value=value;
  };
  const point=(target:{positionX:AudioParam;positionY:AudioParam;positionZ:AudioParam},value:AudioPoint)=>{
    smooth(target.positionX,value.x);smooth(target.positionY,value.y);smooth(target.positionZ,value.z);
  };
  const update=()=>{
    if(!context||!flat||!direct||!wet||!filter||!panner)return;
    const spatial=enabled&&frame!==null;
    smooth(flat.gain,spatial?0:1);
    if(!spatial||!frame) {smooth(direct.gain,0);smooth(wet.gain,0);return;}
    const distance=Math.hypot(frame.position.x-frame.emitter.x,frame.position.y-frame.emitter.y,frame.position.z-frame.emitter.z);
    const gain=radioProximity(distance);
    smooth(direct.gain,gain);
    smooth(wet.gain,gain*(frame.indoors?.11:.015));
    smooth(filter.frequency,frame.indoors?8500:2400);
    const listener=context.listener;
    point(listener,frame.position);
    smooth(listener.forwardX,frame.forward.x);smooth(listener.forwardY,frame.forward.y);smooth(listener.forwardZ,frame.forward.z);
    smooth(listener.upX,frame.up.x);smooth(listener.upY,frame.up.y);smooth(listener.upZ,frame.up.z);
    point(panner,frame.emitter);
  };
  return {
    unlock() {
      if(disposed)return;
      if(!context) {
        const Context=globalThis.AudioContext??(globalThis as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
        if(!Context) {onSupport(false);return;}
        try {
          context=new Context();
          input=context.createGain();flat=context.createGain();direct=context.createGain();wet=context.createGain();filter=context.createBiquadFilter();panner=context.createPanner();
          if(!context.listener.positionX||!panner.positionX)throw new Error("Spatial audio is unsupported");
          panner.panningModel="HRTF";panner.rolloffFactor=0;
          filter.type="lowpass";filter.Q.value=.5;filter.channelCount=1;filter.channelCountMode="explicit";
          direct.gain.value=0;wet.gain.value=0;
          const reverb=context.createConvolver();
          const impulse=context.createBuffer(2,Math.round(context.sampleRate*.85),context.sampleRate);
          let seed=39241;
          for(let channel=0;channel<2;channel++) {
            const data=impulse.getChannelData(channel);
            for(let index=0;index<data.length;index++) {
              seed=(seed*16807)%2147483647;
              const t=index/data.length;
              data[index]=t<.025?0:(seed/2147483647*2-1)*Math.pow(1-t,3);
            }
          }
          reverb.buffer=impulse;
          input.connect(flat).connect(context.destination);
          input.connect(filter).connect(panner);
          panner.connect(direct).connect(context.destination);
          panner.connect(reverb).connect(wet).connect(context.destination);
          nodes.push(input,flat,direct,wet,filter,panner,reverb);
          update();
          for(const element of elements) {
            const source=context.createMediaElementSource(element);
            source.connect(input);sources.push(source);
          }
          initialized=true;onSupport(true);
        } catch {
          enabled=false;
          if(flat)flat.gain.value=1;
          if(direct)direct.gain.value=0;
          if(wet)wet.gain.value=0;
          onSupport(false);
        }
      }
      if(context&&context.state!=="running") {
        const pending=context;
        void pending.resume().then(()=>{if(!disposed&&pending.state!=="running")onBlocked();}).catch(()=>{if(!disposed)onBlocked();});
      }
    },
    setFrame(value:RadioSpatialFrame|null) {frame=value;update();},
    setEnabled(value:boolean) {enabled=value;update();},
    dispose() {
      if(disposed)return;
      disposed=true;
      for(const source of sources)source.disconnect();
      for(const node of nodes)node.disconnect();
      void context?.close().catch(()=>{});
    },
  };
}
