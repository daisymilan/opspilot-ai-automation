import { createClient } from "@/lib/supabase/server";

export interface CurrentProfile {
  id: string;
  fullName: string;
  email: string;
  role: "owner" | "admin" | "member";
  organizationId: string;
  organizationName: string;
}

/**
 * Resolves the signed-in user's profile and organization, server-side.
 * Returns null if there's no session or the profile row doesn't exist yet
 * (e.g. auth user created outside the normal signup trigger).
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", profile.organization_id)
    .single();

  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    organizationId: profile.organization_id,
    organizationName: organization?.name ?? "",
  };
}
