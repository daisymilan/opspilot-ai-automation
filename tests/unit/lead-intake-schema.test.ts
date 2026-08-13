import { describe, expect, it } from "vitest";
import { createLeadSchema } from "@/services/leads/schema";

describe("createLeadSchema (Phase 2: + message)", () => {
  it("accepts a lead with a message", () => {
    const result = createLeadSchema.safeParse({
      name: "John Smith",
      email: "john@abcrealty.com",
      company: "ABC Realty",
      message: "We are looking to automate our lead follow-up process.",
      source: "manual",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("We are looking to automate our lead follow-up process.");
    }
  });

  it("treats an empty-string message as absent", () => {
    const result = createLeadSchema.safeParse({ name: "John Smith", message: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBeUndefined();
    }
  });

  it("rejects a message over 2000 characters", () => {
    const result = createLeadSchema.safeParse({ name: "John Smith", message: "x".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("still rejects a missing name", () => {
    const result = createLeadSchema.safeParse({ message: "hello" });
    expect(result.success).toBe(false);
  });
});
