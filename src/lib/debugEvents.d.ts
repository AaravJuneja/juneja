export {};
import type {RadioCommand,RadioState} from "./trainRadio";
import type {RadioSpatialFrame} from "./radioSpatialAudio";

declare global {
  interface WindowEventMap {
    "music:toggle": CustomEvent<void>;
    "music:request-state": CustomEvent<void>;
    "music:state": CustomEvent<RadioState>;
    "music:command": CustomEvent<RadioCommand>;
    "music:spatial": CustomEvent<RadioSpatialFrame|null>;
    "music:request-spatial": CustomEvent<void>;
    "arcade:doors": CustomEvent<void>;
    "portrait:claimed": CustomEvent<void>;
    "portrait:cleared": CustomEvent<void>;
  }
}
