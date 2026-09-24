import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // No Supabase auth cookie means nobody is signed in: skip the Auth API call entirely
  // (bots and crawlers never have one, and each call is billable traffic).
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!hasSession) {
    if (request.nextUrl.pathname.startsWith("/dashboard")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session if expired - required for Server Components,
  // which can't write cookies themselves.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

// Only the pages that read the session need it refreshed. Public pages (marketing, /demo,
// login, contact...) must never pay for an Auth round trip.
export const config = {
  matcher: ["/dashboard/:path*", "/reset-password", "/accept-invite"],
};
