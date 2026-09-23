export const INVITE_TTL_MS = 14 * 86400000;
export const RESEND_COOLDOWN_MS = 5 * 60000;

// No last_sent column: every send (create or resend) sets expires_at = now + TTL,
// so the last send time is recoverable from it.
export const sentAtFromExpiry = (expiresAt: string) => new Date(expiresAt).getTime() - INVITE_TTL_MS;
