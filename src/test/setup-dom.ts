// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveClass, …)
// for Vitest. Harmless for node-env tests; required for component (jsdom) tests.
import "@testing-library/jest-dom/vitest";
