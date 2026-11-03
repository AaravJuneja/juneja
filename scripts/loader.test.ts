import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const layout = readFileSync(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8");
const script = [...layout.matchAll(/<script is:inline data-astro-rerun>([\s\S]*?)<\/script>/g)]
  .find((match) => match[1].includes("loader-seen"))![1];

const setup = ({ seen = false, reduced = false, storageFails = false } = {}) => {
  const attributes = new Set<string>();
  const timers = new Map<number, () => void>();
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: reduced }),
    setTimeout: (callback: () => void, delay: number) => {
      expect(delay).toBe(1500);
      timers.set(1, callback);
      return 1;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const document = Object.assign(new EventTarget(), {
    readyState: "loading",
    documentElement: {
      setAttribute: (key: string) => attributes.add(key),
      removeAttribute: (key: string) => attributes.delete(key),
    },
  });
  const sessionStorage = {
    getItem: () => {
      if (storageFails) throw new Error("Storage unavailable");
      return seen ? "1" : null;
    },
    setItem: () => {
      if (storageFails) throw new Error("Storage unavailable");
      seen = true;
    },
  };
  runInNewContext(script, { window, document, sessionStorage });
  return { attributes, timers, window, document, sessionStorage };
};

test("first visit activates before body paint and fails open without hydration or load", () => {
  const state = setup();
  expect(state.attributes.has("data-loader-active")).toBe(true);
  state.timers.get(1)!();
  expect(state.attributes.size).toBe(0);
  expect(state.timers.size).toBe(0);
  expect(state.sessionStorage.getItem()).toBe("1");
});

test("seen sessions and reduced motion do not activate the loader", () => {
  for (const options of [{ seen: true }, { reduced: true }]) {
    const state = setup(options);
    expect(state.attributes.size).toBe(0);
    expect(state.timers.size).toBe(0);
    expect(state.sessionStorage.getItem()).toBe("1");
  }
});

test("load and page swaps release the loader and cancel its deadline", () => {
  for (const event of ["load", "astro:before-swap"]) {
    const state = setup();
    (event === "load" ? state.window : state.document).dispatchEvent(new Event(event));
    expect(state.attributes.size).toBe(0);
    expect(state.timers.size).toBe(0);
  }
});

test("blocked session storage cannot prevent the fail-open deadline", () => {
  const state = setup({ storageFails: true });
  expect(state.attributes.size).toBe(1);
  expect(() => state.timers.get(1)!()).not.toThrow();
  expect(state.attributes.size).toBe(0);
});
