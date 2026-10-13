import { describe, expect, it } from "vitest";
import { estimateReviewCost } from "./pricing";

describe("Review subset estimates", () => {
  it("prices only supplied cells using the selected model and stated cold-cache assumptions", () => {
    // (5,000 doc + 1,000 overhead) * $3/M * 1.25 + 1 prompt token * $3/M + 512 output * $15/M.
    expect(estimateReviewCost([{ tokenCount: 5000 }], [{ prompt: "test" }], "claude-sonnet-4-6")).toBe("$0.0302");
    expect(estimateReviewCost([{ tokenCount: 5000 }], [{ prompt: "test" }, { prompt: "test" }], "claude-sonnet-4-6")).toBe("$0.0604");
    expect(estimateReviewCost([{ tokenCount: 5000 }], [{ prompt: "test" }], "claude-haiku-5-5")).toBe("$0.0010");
    expect(estimateReviewCost([], [{ prompt: "test" }], "claude-sonnet-4-6")).toBe("$0.00");
    expect(estimateReviewCost([{ tokenCount: 5000 }], [], "claude-sonnet-4-6")).toBe("$0.00");
    expect(estimateReviewCost([{ tokenCount: 5000 }], [{ prompt: "test" }], "unknown")).toBeUndefined();
  });
});
