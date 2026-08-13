import { z } from "zod";

export const createLeadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  company: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  message: z
    .string()
    .trim()
    .max(2000, "Message must be 2000 characters or fewer")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  source: z.enum(["manual", "webhook", "api", "import"]).default("manual"),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
