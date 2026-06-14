// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { useUpload } from "./use-upload";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("useUpload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toasts the route's error message when the upload is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 415,
        json: async () => ({ error: "Scanned PDFs are not supported." }),
      }),
    );
    const { result } = renderHook(() => useUpload());
    await act(async () => {
      await result.current.upload(new File(["x"], "scan.pdf"));
    });
    expect(toast.error).toHaveBeenCalledWith("Scanned PDFs are not supported.");
  });

  it("falls back to a status message when the route gives no error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }),
    );
    const { result } = renderHook(() => useUpload());
    await act(async () => {
      await result.current.upload(new File(["x"], "doc.docx"));
    });
    expect(toast.error).toHaveBeenCalledWith("Upload failed (500).");
  });

  it("toasts a connection hint when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { result } = renderHook(() => useUpload());
    await act(async () => {
      await result.current.upload(new File(["x"], "doc.pdf"));
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/check your connection/i));
  });

  it("does not toast on a successful upload", async () => {
    const onUploaded = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "doc1" }) }),
    );
    const { result } = renderHook(() => useUpload(onUploaded));
    await act(async () => {
      await result.current.upload(new File(["x"], "doc.pdf"));
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(onUploaded).toHaveBeenCalledWith({ id: "doc1" });
  });
});
