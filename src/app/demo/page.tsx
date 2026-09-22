import { createClient } from "@/lib/supabase/server";
import FarmDashboard from "@/components/dashboard/farm-dashboard";
import type { Org } from "@/lib/types";

// Public, unauthenticated page. The demo org is readable by anyone per its
// RLS policy (is_demo = true bypasses the membership check).
export default async function DemoPage() {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, is_demo")
    .eq("is_demo", true)
    .maybeSingle();

  if (!org) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page px-4 text-ink">
        <p className="text-sm text-ink2">Demo isn&apos;t set up yet.</p>
      </main>
    );
  }

  return <FarmDashboard orgs={[org as Org]} initialOrgId={org.id} />;
}
