import { describe, expect, it } from "vitest";
import {
  formatActionLabel,
  formatDuration,
  summarizeExecutions,
} from "@/services/executions/formatting";

describe("summarizeExecutions", () => {
  it("returns all-zero metrics for an empty list", () => {
    const result = summarizeExecutions([]);
    expect(result).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
      waitingApproval: 0,
      inProgress: 0,
      averageDurationMs: null,
    });
  });

  it("counts each status bucket correctly", () => {
    const result = summarizeExecutions([
      { status: "succeeded", duration_ms: 1000 },
      { status: "succeeded", duration_ms: 3000 },
      { status: "failed", duration_ms: 500 },
      { status: "waiting_approval", duration_ms: 2000 },
      { status: "running", duration_ms: null },
      { status: "pending", duration_ms: null },
    ]);

    expect(result.total).toBe(6);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.waitingApproval).toBe(1);
    expect(result.inProgress).toBe(2);
  });

  it("averages duration only over rows that have one", () => {
    const result = summarizeExecutions([
      { status: "succeeded", duration_ms: 1000 },
      { status: "succeeded", duration_ms: 3000 },
      { status: "running", duration_ms: null },
    ]);
    expect(result.averageDurationMs).toBe(2000);
  });

  it("returns null average when no row has a duration", () => {
    const result = summarizeExecutions([{ status: "running", duration_ms: null }]);
    expect(result.averageDurationMs).toBeNull();
  });
});

describe("formatDuration", () => {
  it("shows a dash for null/undefined", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });

  it("formats sub-second durations in ms", () => {
    expect(formatDuration(450)).toBe("450ms");
  });

  it("formats sub-minute durations in seconds", () => {
    expect(formatDuration(2140)).toBe("2.1s");
  });

  it("formats durations over a minute as m/s", () => {
    expect(formatDuration(75000)).toBe("1m 15s");
  });
});

describe("formatActionLabel", () => {
  it("replaces underscores with spaces", () => {
    expect(formatActionLabel("schedule_call")).toBe("schedule call");
    expect(formatActionLabel("send_follow_up")).toBe("send follow up");
  });
});
