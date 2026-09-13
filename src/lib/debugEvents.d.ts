export {};

declare global {
  interface WindowEventMap {
    "arcade:doors": CustomEvent<void>;
    "portrait:claimed": CustomEvent<void>;
    "portrait:cleared": CustomEvent<void>;
  }
}
