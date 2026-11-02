export {};

declare global {
  interface WindowEventMap {
    "music:toggle": CustomEvent<void>;
    "music:request-state": CustomEvent<void>;
    "music:state": CustomEvent<{playing:boolean;error:boolean}>;
    "arcade:doors": CustomEvent<void>;
    "portrait:claimed": CustomEvent<void>;
    "portrait:cleared": CustomEvent<void>;
  }
}
