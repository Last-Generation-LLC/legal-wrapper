// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

it.each(["localStorage", "sessionStorage"] as const)(
  "%s uses browser storage and survives restoring mocked globals",
  (key) => {
    const storage = window[key];
    expect(storage).toBeInstanceOf(Storage);
    expect(globalThis[key]).toBe(storage);
    const other = window[key === "localStorage" ? "sessionStorage" : "localStorage"];
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    try {
      storage.setItem("storage-regression", "saved");
      expect(setItem).toHaveBeenCalledWith("storage-regression", "saved");
      expect(storage.getItem("storage-regression")).toBe("saved");
      expect(other.getItem("storage-regression")).toBeNull();
      vi.stubGlobal(key, undefined);
      vi.unstubAllGlobals();
      expect(window[key]).toBe(storage);
    } finally {
      vi.unstubAllGlobals();
      storage.removeItem("storage-regression");
      setItem.mockRestore();
    }
  },
);
