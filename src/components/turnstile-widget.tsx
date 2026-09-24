"use client";

import Script from "next/script";

// Renders nothing when no site key is configured. The widget injects a hidden
// `cf-turnstile-response` input into the enclosing form.
export default function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      <div className="cf-turnstile" data-sitekey={siteKey} />
    </>
  );
}
