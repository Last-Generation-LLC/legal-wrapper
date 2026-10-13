// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveClass, …)
// for Vitest. Harmless for node-env tests; required for component (jsdom) tests.
import "@testing-library/jest-dom/vitest";

// Unmount React trees between tests. RTL only auto-registers this when Vitest
// globals are enabled; this project uses explicit imports, so we wire it here.
// No-op for node-env tests (nothing was rendered into a DOM to clean up).
import { afterAll, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest 3 preserves pre-existing Node globals, including Node 26's storage
// globals. Browser tests must use the current jsdom window's in-memory storage
// and matching constructor, not Node's file-backed localStorage.
const dom = (globalThis as typeof globalThis & {
  jsdom?: { window: Pick<typeof window, "localStorage" | "sessionStorage" | "Storage"> };
}).jsdom;

if (dom) {
  for (const key of ["localStorage", "sessionStorage", "Storage"] as const) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: dom.window[key],
    });
    afterAll(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}

afterEach(() => {
  cleanup();
});
