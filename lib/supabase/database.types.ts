// Hand-written to mirror supabase/migrations/*.sql exactly. Once a local
// Supabase instance is available, regenerate with:
//   npx supabase gen types typescript --local > lib/supabase/database.types.ts
// and diff against this file before overwriting.
//
// Shape must satisfy @supabase/postgrest-js's GenericSchema (Tables/Views/
// Functions, each table with Row/Insert/Update/Relationships) or supabase-js
// silently collapses every query's row type to `never`.

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string;
          full_name: string;
          email: string;
          role: "owner" | "admin" | "member";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          full_name: string;
          email: string;
          role?: "owner" | "admin" | "member";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["profiles"]["Insert"], "id">>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          email: string | null;
          company: string | null;
          message: string | null;
          source: "manual" | "webhook" | "api" | "import";
          status: "new" | "contacted" | "qualified" | "disqualified" | "converted";
          owner_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          name: string;
          email?: string | null;
          company?: string | null;
          message?: string | null;
          source?: "manual" | "webhook" | "api" | "import";
          status?: "new" | "contacted" | "qualified" | "disqualified" | "converted";
          owner_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      workflow_executions: {
        Row: {
          id: string;
          organization_id: string;
          workflow_name: string;
          entity_type: string | null;
          entity_id: string | null;
          status: "pending" | "running" | "succeeded" | "failed" | "retrying" | "waiting_approval";
          started_at: string;
          completed_at: string | null;
          duration_ms: number | null;
          retry_count: number;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          workflow_name: string;
          entity_type?: string | null;
          entity_id?: string | null;
          status?: "pending" | "running" | "succeeded" | "failed" | "retrying" | "waiting_approval";
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
          retry_count?: number;
          error_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workflow_executions"]["Insert"]>;
        Relationships: [];
      };
      approvals: {
        Row: {
          id: string;
          organization_id: string;
          entity_type: string;
          entity_id: string;
          action_type: string;
          status: "pending" | "approved" | "rejected";
          requested_by: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          entity_type: string;
          entity_id: string;
          action_type: string;
          status?: "pending" | "approved" | "rejected";
          requested_by?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["approvals"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          actor_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          actor_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      lead_scores: {
        Row: {
          id: string;
          lead_id: string;
          organization_id: string;
          score: number;
          priority: "low" | "medium" | "high";
          intent: string;
          industry: string | null;
          confidence: number;
          recommended_action:
            "schedule_call" | "send_follow_up" | "assign_sales_owner" | "manual_review";
          reasoning_summary: string;
          model: string;
          prompt_version: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          organization_id?: string;
          score: number;
          priority: "low" | "medium" | "high";
          intent: string;
          industry?: string | null;
          confidence: number;
          recommended_action:
            "schedule_call" | "send_follow_up" | "assign_sales_owner" | "manual_review";
          reasoning_summary: string;
          model: string;
          prompt_version: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          organization_id: string;
          uploaded_by: string | null;
          file_path: string;
          file_name: string;
          mime_type: "application/pdf" | "image/png" | "image/jpeg";
          size_bytes: number;
          document_type: "invoice";
          status: "uploaded" | "analyzing" | "extracted" | "failed";
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          uploaded_by?: string | null;
          file_path: string;
          file_name: string;
          mime_type: "application/pdf" | "image/png" | "image/jpeg";
          size_bytes: number;
          document_type?: "invoice";
          status?: "uploaded" | "analyzing" | "extracted" | "failed";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      document_extractions: {
        Row: {
          id: string;
          document_id: string;
          organization_id: string;
          vendor_name: string | null;
          invoice_number: string | null;
          amount: number | null;
          currency: string | null;
          due_date: string | null;
          line_items: unknown[];
          confidence: number;
          model: string;
          prompt_version: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          organization_id?: string;
          vendor_name?: string | null;
          invoice_number?: string | null;
          amount?: number | null;
          currency?: string | null;
          due_date?: string | null;
          line_items?: unknown[];
          confidence: number;
          model: string;
          prompt_version: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
