import { describe, expect, it } from "vitest";
import { approveApprovalSchema, rejectApprovalSchema } from "@/services/approvals/schema";
import { nextExecutionStatusForApprovalDecision } from "@/services/approvals/statusTransitions";

describe("approveApprovalSchema", () => {
  it("accepts a valid approval id", () => {
    expect(
      approveApprovalSchema.safeParse({ approvalId: "4370f7aa-43a0-4a49-b2b3-a2ad37b332d7" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(approveApprovalSchema.safeParse({ approvalId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("rejectApprovalSchema", () => {
  const approvalId = "4370f7aa-43a0-4a49-b2b3-a2ad37b332d7";

  it("accepts a valid rejection reason", () => {
    const result = rejectApprovalSchema.safeParse({
      approvalId,
      rejectionReason: "Not enough budget signal in the message.",
    });
    expect(result.success).toBe(true);
  });

  it("requires a non-empty rejection reason", () => {
    expect(rejectApprovalSchema.safeParse({ approvalId, rejectionReason: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only rejection reason", () => {
    expect(rejectApprovalSchema.safeParse({ approvalId, rejectionReason: "   " }).success).toBe(
      false,
    );
  });

  it("rejects a reason over 1000 characters", () => {
    expect(
      rejectApprovalSchema.safeParse({ approvalId, rejectionReason: "x".repeat(1001) }).success,
    ).toBe(false);
  });
});

describe("nextExecutionStatusForApprovalDecision", () => {
  it("maps approved -> succeeded", () => {
    expect(nextExecutionStatusForApprovalDecision("approved")).toBe("succeeded");
  });

  it("maps rejected -> failed", () => {
    expect(nextExecutionStatusForApprovalDecision("rejected")).toBe("failed");
  });
});
