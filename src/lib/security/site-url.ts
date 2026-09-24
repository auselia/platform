import { headers } from "next/headers";

// Links in emails must not be built from a request header an attacker can influence.
// NEXT_PUBLIC_SITE_URL is the canonical origin (e.g. https://auselia.com); the Origin
// header is only a fallback for local development.
export async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is not set");
  }
  return (await headers()).get("origin") ?? "http://localhost:3000";
}
