// What the irrigation-config function tells a device (firmware/CONTRACT.md section 3).
// Pure, so it can be unit-tested against the firmware's own JSON parsing rules.
//
// The firmware does not parse JSON, it searches the text for `"key":` and reads what follows
// (extractJsonInt/Bool/String in firmware/src/main.cpp). So: compact JSON only (no spaces after
// the colon), and no quotes inside string values. JSON.stringify's default output satisfies both.

// The device keeps its last manual command only in RAM. After a reboot it treats the first
// manualCommandAt it sees as new, so a stale "on" would start the pump. An "on" therefore stops
// being advertised after this long; the device polls every 5 minutes, so 6 covers one poll.
export const MANUAL_COMMAND_TTL_MS = 6 * 60 * 1000;

export const DEFAULT_SCHEDULE = { hour1: 8, min1: 0, hour2: 18, min2: 0, durationMin: 5, enabled: true };

export type ConfigRow = {
  hour1: number; min1: number; hour2: number; min2: number;
  duration_min: number; enabled: boolean;
  manual_pump_on: boolean; manual_command_at: string | null;
};
export type FirmwareTarget = { version: string; url: string };

export function buildConfigResponse(row: ConfigRow | null, target: FirmwareTarget | null, now: number) {
  const out: Record<string, unknown> = row
    ? {
      hour1: row.hour1, min1: row.min1, hour2: row.hour2, min2: row.min2,
      durationMin: row.duration_min, enabled: row.enabled,
    }
    : { ...DEFAULT_SCHEDULE };

  const at = row?.manual_command_at ? Date.parse(row.manual_command_at) : NaN;
  const fresh = Number.isFinite(at) && now - at < MANUAL_COMMAND_TTL_MS;
  // Reports the *effective* state. manualCommandAt is sent as-is even when the command has
  // expired: the device only acts when it changes, so an unchanged stamp with "off" does nothing.
  out.manualPumpOn = !!row?.manual_pump_on && fresh;
  if (row?.manual_command_at) out.manualCommandAt = row.manual_command_at;

  // No target means no update is advertised; the firmware then keeps its own version.
  if (target) {
    out.firmwareVersion = target.version;
    out.firmwareUrl = target.url;
  }
  return out;
}
