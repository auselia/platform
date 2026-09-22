import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createOrganization, logout } from "./actions";
import FarmDashboard from "@/components/dashboard/farm-dashboard";
import type { Org } from "@/lib/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS does the filtering: the orgs the user belongs to, plus the demo org.
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, is_demo")
    .order("is_demo", { ascending: true })
    .order("name");

  const list = (orgs ?? []) as Org[];
  const realOrgs = list.filter((o) => !o.is_demo);

  if (realOrgs.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
            Name your organization
          </h1>
          <p className="mt-1 text-sm text-ink2">One more step before you see your dashboard.</p>
          {error && (
            <p className="mt-4 rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink">
              {error}
            </p>
          )}
          <form action={createOrganization} className="mt-6 flex flex-col gap-3">
            <input
              name="orgName"
              type="text"
              placeholder="Organization name"
              required
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <button type="submit" className="rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-forest">
              Create
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <FarmDashboard
      orgs={list}
      initialOrgId={realOrgs[0].id}
      userEmail={user.email ?? ""}
      logoutAction={logout}
    />
  );
}
