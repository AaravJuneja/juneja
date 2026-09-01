export {};

declare global {
  interface WindowEventMap {
    "arcade:doors": CustomEvent<void>;
    "konami:pwned": CustomEvent<void>;
  }
}
