import { describe, expect, it } from "vitest";
import {
  MANUAL_COMMAND_TTL_MS, buildConfigResponse, type ConfigRow, type FirmwareTarget,
} from "../../supabase/functions/_shared/device-config";

// Ports of extractJsonInt / extractJsonBool / extractJsonString from firmware/src/main.cpp. The
// firmware does not parse JSON: it finds `"key":` in the text and reads what follows. If the
// backend's output ever stops matching these rules the device silently falls back to defaults.
const find = (json: string, key: string) => {
  const pattern = `"${key}":`;
  const i = json.indexOf(pattern);
  return i === -1 ? -1 : i + pattern.length;
};
const fwInt = (json: string, key: string, fb: number) => {
  const at = find(json, key);
  return at === -1 ? fb : (Number.parseInt(json.slice(at), 10) || 0);
};
const fwBool = (json: string, key: string, fb: boolean) => {
  const at = find(json, key);
  return at === -1 ? fb : json.slice(at).startsWith("true");
};
const fwString = (json: string, key: string, fb: string) => {
  const pattern = `"${key}":"`;
  const i = json.indexOf(pattern);
  if (i === -1) return fb;
  const start = i + pattern.length;
  const end = json.indexOf('"', start);
  return end === -1 ? fb : json.slice(start, end);
};

const NOW = Date.parse("2026-09-25T15:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const row = (over: Partial<ConfigRow> = {}): ConfigRow => ({
  hour1: 7, min1: 30, hour2: 19, min2: 5, duration_min: 12, enabled: true,
  manual_pump_on: false, manual_command_at: null, ...over,
});
const body = (r: ConfigRow | null, t: FirmwareTarget | null = null) => JSON.stringify(buildConfigResponse(r, t, NOW));

describe("what the firmware reads", () => {
  it("still finds the six schedule fields old firmware relies on", () => {
    const j = body(row());
    expect([fwInt(j, "hour1", -1), fwInt(j, "min1", -1), fwInt(j, "hour2", -1), fwInt(j, "min2", -1), fwInt(j, "durationMin", -1)])
      .toEqual([7, 30, 19, 5, 12]);
    expect(fwBool(j, "enabled", false)).toBe(true);
  });

  it("is compact JSON: no space after a colon, which the text search cannot skip", () => {
    const j = body(row({ manual_pump_on: true, manual_command_at: ago(1000) }), { version: "0.2.0", url: "https://x.supabase.co/functions/v1/firmware-download" });
    expect(j).not.toMatch(/":\s/);
  });

  it("carries a manual command with the stamp as a plain quote-free string", () => {
    const at = ago(60_000);
    const j = body(row({ manual_pump_on: true, manual_command_at: at }));
    expect(fwBool(j, "manualPumpOn", false)).toBe(true);
    expect(fwString(j, "manualCommandAt", "")).toBe(at);
  });

  it("carries the firmware version and URL, and omits them when nothing is rolled out", () => {
    const url = "https://abc.supabase.co/functions/v1/firmware-download";
    const j = body(row(), { version: "0.2.0", url });
    expect(fwString(j, "firmwareVersion", "fallback")).toBe("0.2.0");
    expect(fwString(j, "firmwareUrl", "")).toBe(url);
    const none = body(row());
    expect(fwString(none, "firmwareVersion", "fallback")).toBe("fallback"); // firmware keeps its own version
    expect(fwString(none, "firmwareUrl", "")).toBe("");
  });

  it("falls back to the default schedule when the plant has no row yet", () => {
    const j = body(null);
    expect([fwInt(j, "hour1", -1), fwInt(j, "hour2", -1), fwInt(j, "durationMin", -1)]).toEqual([8, 18, 5]);
    expect(fwBool(j, "manualPumpOn", true)).toBe(false);
    expect(fwString(j, "manualCommandAt", "none")).toBe("none");
  });
});

describe("manual command expiry", () => {
  it("serves an on command only while it is fresh", () => {
    const on = (msAgo: number) => buildConfigResponse(row({ manual_pump_on: true, manual_command_at: ago(msAgo) }), null, NOW).manualPumpOn;
    expect(on(0)).toBe(true);
    expect(on(MANUAL_COMMAND_TTL_MS - 1)).toBe(true);
    expect(on(MANUAL_COMMAND_TTL_MS)).toBe(false);
    expect(on(60 * 60 * 1000)).toBe(false);
  });

  it("treats an unreadable or missing stamp as not fresh", () => {
    expect(buildConfigResponse(row({ manual_pump_on: true, manual_command_at: "garbage" }), null, NOW).manualPumpOn).toBe(false);
    expect(buildConfigResponse(row({ manual_pump_on: true, manual_command_at: null }), null, NOW).manualPumpOn).toBe(false);
  });

  it("keeps the stamp unchanged after expiry so the device sees no new command", () => {
    const at = ago(20 * 60 * 1000);
    const r = buildConfigResponse(row({ manual_pump_on: true, manual_command_at: at }), null, NOW);
    expect(r.manualCommandAt).toBe(at);
    expect(r.manualPumpOn).toBe(false);
  });

  it("a rebooted device never starts the pump from a stale on command", () => {
    // Mirrors the firmware: lastManualCommandAt is "" after boot, so the first stamp it sees counts as new.
    const deviceStartsPump = (json: string) => {
      const last = "";
      const stamp = fwString(json, "manualCommandAt", last);
      return stamp !== last && fwBool(json, "manualPumpOn", false) && fwBool(json, "enabled", true);
    };
    const stale = body(row({ manual_pump_on: true, manual_command_at: ago(3 * 60 * 60 * 1000) }));
    expect(deviceStartsPump(stale)).toBe(false);
    // ...whereas a click a minute ago is delivered, which is the point of the toggle.
    const fresh = body(row({ manual_pump_on: true, manual_command_at: ago(60_000) }));
    expect(deviceStartsPump(fresh)).toBe(true);
  });
});
