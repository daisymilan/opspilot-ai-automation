import { describe, expect, it } from "vitest";
import { canRetryExecution, computeNextRetryCount } from "@/services/executions/retryRules";

describe("canRetryExecution", () => {
  it("allows retry only for failed executions", () => {
    expect(canRetryExecution({ status: "failed" })).toBe(true);
  });

  it.each(["succeeded", "waiting_approval", "running", "pending", "retrying"])(
    "does not allow retry for %s executions",
    (status) => {
      expect(canRetryExecution({ status })).toBe(false);
    },
  );
});

describe("computeNextRetryCount", () => {
  it("increments from the previous count", () => {
    expect(computeNextRetryCount(0)).toBe(1);
    expect(computeNextRetryCount(3)).toBe(4);
  });
});
