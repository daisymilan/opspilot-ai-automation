import { z } from "zod";

export const approveApprovalSchema = z.object({
  approvalId: z.string().uuid(),
});

export const rejectApprovalSchema = z.object({
  approvalId: z.string().uuid(),
  rejectionReason: z.string().trim().min(1, "A rejection reason is required").max(1000),
});

export type ApproveApprovalInput = z.infer<typeof approveApprovalSchema>;
export type RejectApprovalInput = z.infer<typeof rejectApprovalSchema>;
