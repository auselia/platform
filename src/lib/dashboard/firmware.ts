// Small pure helpers for the Device settings (diagnostics display and the firmware upload checks).

export const FW_MIN_BYTES = 50_000;
export const FW_MAX_BYTES = 3_145_728;
// First byte of every ESP32 application image. Matches the check firmware-download makes before serving.
export const ESP_IMAGE_MAGIC = 0xe9;
export const FW_VERSION_PATTERN = /^[A-Za-z0-9._+-]{1,32}$/;

export type FirmwareProblem = "version" | "size" | "magic";

// Client-side sanity check before uploading. The server checks the same things again (and the
// download function refuses anything that fails), so this is for a fast, friendly error.
export function checkFirmwareFile(version: string, bytes: Uint8Array): FirmwareProblem | null {
  if (!FW_VERSION_PATTERN.test(version)) return "version";
  if (bytes.length < FW_MIN_BYTES || bytes.length > FW_MAX_BYTES) return "size";
  if (bytes[0] !== ESP_IMAGE_MAGIC) return "magic";
  return null;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const firmwarePath = (plantId: string, version: string) => `${plantId}/${version}.bin`;

export type WifiQuality = "excellent" | "good" | "fair" | "weak";

// Rough bands for an ESP32's RSSI in dBm.
export function wifiQuality(rssi: number): WifiQuality {
  if (rssi >= -55) return "excellent";
  if (rssi >= -67) return "good";
  if (rssi >= -75) return "fair";
  return "weak";
}

// "3 d 4 h", "5 h 12 min", "8 min": the two largest units, so it stays short.
export function formatUptime(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "<1 min";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
