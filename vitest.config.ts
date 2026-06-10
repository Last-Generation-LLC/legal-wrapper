import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    // Mirror the tsconfig "@/*" -> "src/*" path alias so tests import the same
    // way the app does.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
