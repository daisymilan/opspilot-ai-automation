import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "@/services/auth/schema";

describe("signUpSchema", () => {
  it("accepts valid signup input", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ada Lovelace",
      organizationName: "Acme Ops",
      email: "ADA@Example.com",
      password: "supersecret1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ada@example.com");
    }
  });

  it("rejects a short password", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ada Lovelace",
      organizationName: "Acme Ops",
      email: "ada@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing organization name", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ada Lovelace",
      organizationName: "",
      email: "ada@example.com",
      password: "supersecret1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ada Lovelace",
      organizationName: "Acme Ops",
      email: "not-an-email",
      password: "supersecret1",
    });
    expect(result.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepts valid credentials", () => {
    const result = signInSchema.safeParse({ email: "ada@example.com", password: "anything" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = signInSchema.safeParse({ email: "ada@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});
