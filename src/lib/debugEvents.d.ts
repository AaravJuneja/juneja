export {};
import type {RadioCommand,RadioState} from "./trainRadio";

declare global {
  interface WindowEventMap {
    "music:toggle": CustomEvent<void>;
    "music:request-state": CustomEvent<void>;
    "music:state": CustomEvent<RadioState>;
    "music:command": CustomEvent<RadioCommand>;
    "arcade:doors": CustomEvent<void>;
    "portrait:claimed": CustomEvent<void>;
    "portrait:cleared": CustomEvent<void>;
  }
}
