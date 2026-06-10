// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveClass, …)
// for Vitest. Harmless for node-env tests; required for component (jsdom) tests.
import "@testing-library/jest-dom/vitest";

// Unmount React trees between tests. RTL only auto-registers this when Vitest
// globals are enabled; this project uses explicit imports, so we wire it here.
// No-op for node-env tests (nothing was rendered into a DOM to clean up).
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
