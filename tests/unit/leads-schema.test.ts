import { describe, expect, it } from "vitest";
import { createLeadSchema } from "@/services/leads/schema";

describe("createLeadSchema", () => {
  it("accepts a minimal valid lead", () => {
    const result = createLeadSchema.safeParse({ name: "Ada Lovelace" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Ada Lovelace");
      expect(result.data.source).toBe("manual");
      expect(result.data.email).toBeUndefined();
    }
  });

  it("accepts a fully populated lead", () => {
    const result = createLeadSchema.safeParse({
      name: "  Grace Hopper  ",
      email: "GRACE@Example.com",
      company: "Bletchley Analytics",
      source: "webhook",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Grace Hopper");
      expect(result.data.email).toBe("grace@example.com");
    }
  });

  it("rejects a missing name", () => {
    const result = createLeadSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a name that is only whitespace", () => {
    const result = createLeadSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = createLeadSchema.safeParse({ name: "Alan Turing", email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("treats an empty-string email as absent rather than invalid", () => {
    const result = createLeadSchema.safeParse({ name: "Alan Turing", email: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeUndefined();
    }
  });

  it("rejects an unknown source", () => {
    const result = createLeadSchema.safeParse({ name: "Alan Turing", source: "carrier-pigeon" });
    expect(result.success).toBe(false);
  });
});
