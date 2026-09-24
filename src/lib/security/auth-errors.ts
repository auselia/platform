// Error codes travel in the URL (?error=code); the copy lives here so a crafted link
// can never put arbitrary text on our pages, and Supabase's raw messages (which can
// reveal whether an account exists) are never reflected.
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  signup_failed: "We couldn't create your account. Check your details and try again.",
  weak_password: "Choose a password of at least 10 characters.",
  captcha: "Please complete the verification and try again.",
  expired_link: "That link expired or was already used.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  generic: "Something went wrong. Please try again.",
};

export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? MESSAGES.generic;
}

export function authErrorCode(error: { code?: string; status?: number } | null | undefined, fallback = "generic"): string {
  if (!error) return fallback;
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") return "rate_limited";
  if (error.code === "weak_password") return "weak_password";
  if (error.code === "captcha_failed") return "captcha";
  if (error.code === "invalid_credentials") return "invalid_credentials";
  return fallback;
}
