import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/components/Journey.astro", import.meta.url), "utf8");
const script = new Bun.Transpiler({ loader: "ts" }).transformSync(source.match(/<script>([\s\S]*?)<\/script>/)![1]);

const setup = () => {
  class Input extends EventTarget {
    dataset: Record<string, string> = {};
    value = "";
  }
  class Details {
    open = false;
  }
  const input = new Input();
  const chapter = new Details();
  const state = { index: 2, scrollY: 360 };
  const timers = new Map<number, () => void>();
  const calls: { state: unknown; url: URL }[] = [];
  const window = Object.assign(new EventTarget(), {
    location: new URL("https://example.com/journey#2026-obscuri"),
    history: {
      state,
      replaceState: (value: unknown, _title: string, url: URL) => calls.push({ state: value, url }),
    },
    setTimeout: (callback: () => void) => {
      timers.set(1, callback);
      return 1;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const document = Object.assign(new EventTarget(), {
    getElementById: (id: string) => id === "journey-search" ? input : id === "2026-obscuri" ? chapter : null,
    querySelectorAll: () => [],
  });
  runInNewContext(script, { window, document, HTMLInputElement: Input, HTMLDetailsElement: Details, URL });
  return { input, chapter, window, document, state, timers, calls };
};

test("filter URL replacement preserves ClientRouter history state", () => {
  const state = setup();
  state.input.value = "dice";
  state.input.dispatchEvent(new Event("input"));
  state.timers.get(1)!();
  expect(state.calls[0].state).toBe(state.state);
  expect(state.calls[0].url.searchParams.get("q")).toBe("dice");
  expect(state.calls[0].url.hash).toBe("#2026-obscuri");
});

test("page swaps cancel pending filter URL replacements", () => {
  const state = setup();
  state.input.value = "dice";
  state.input.dispatchEvent(new Event("input"));
  expect(state.timers.size).toBe(1);
  state.document.dispatchEvent(new Event("astro:before-swap"));
  expect(state.timers.size).toBe(0);
  expect(state.calls).toEqual([]);
});

test("chapter hashes open initially and on every ClientRouter page load", () => {
  const state = setup();
  expect(state.chapter.open).toBe(true);
  state.chapter.open = false;
  state.document.dispatchEvent(new Event("astro:page-load"));
  expect(state.chapter.open).toBe(true);
});
