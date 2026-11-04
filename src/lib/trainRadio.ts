export const RADIO_STATIONS=[
  {id:"mellow",name:"Radio Paradise Mellow Mix",description:"Mellow, eclectic music for the night carriage",url:"https://stream.radioparadise.com/mellow-128",homepage:"https://radioparadise.com/listen/stream-links",provider:"Radio Paradise"},
  {id:"jazz24",name:"Jazz24",description:"Jazz for a brighter journey",url:"https://knkx-live-a.edge.audiocdn.com/6285_128k",homepage:"https://www.jazz24.org/ways-to-listen/",provider:"Jazz24"},
  {id:"kexp",name:"KEXP",description:"Independent music and eclectic discoveries",url:"https://kexp.streamguys1.com/kexp160.aac",homepage:"https://www.kexp.org/streaming-urls/",provider:"KEXP"},
] as const;

export type RadioSource="playlist"|typeof RADIO_STATIONS[number]["id"];
export interface RadioState {playing:boolean;error:boolean;loading:boolean;volume:number;volumeSupported:boolean;source:RadioSource;title:string;spatialEnabled:boolean;spatialSupported:boolean;}
export interface RadioCommand {action?:"toggle"|"next";volume?:number;source?:RadioSource;spatial?:boolean;}
export function radioStation(source:string) {return RADIO_STATIONS.find(station=>station.id===source);}
export function radioVolume(value:number) {return Number.isFinite(value)?Math.min(1,Math.max(0,value)):1;}
export function defaultRadioSource(morning:boolean):RadioSource {return morning?"jazz24":"mellow";}
export function radioNotePhase(now:number,index:number) {return ((now/2200+index/6)%1+1)%1;}
