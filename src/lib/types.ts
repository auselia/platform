export type Role = "owner" | "editor" | "viewer";

export type Org = { id: string; name: string; is_demo: boolean; role?: Role | null };

export type Plant = {
  id: string;
  org_id: string;
  name: string;
  variety: string | null;
};

export type Reading = {
  id: number;
  plant_id: string;
  ts: string;
  soil_pct: number | null;
  root_temp_c: number | null;
  air_temp_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  weight_g: number | null;
};

export type PlantIngestStatus = {
  plant_id: string;
  org_id: string;
  name: string;
  last_reading_at: string | null;
  is_stale: boolean;
  latest_soil_pct: number | null;
};

export type IrrigationConfig = {
  plant_id: string;
  hour1: number;
  min1: number;
  hour2: number;
  min2: number;
  duration_min: number;
  enabled: boolean;
  updated_at: string;
};

export type CavClass = "burst" | "spike" | "weak" | "other";

// A saved oscilloscope capture, without the trace (see CavitationTrace).
export type Cavitation = {
  id: number;
  plant_id: string;
  capture_key: string;
  ts: string;
  cls: CavClass;
  level_mv: number | null;
  peak_mv: number | null;
  snr: number | null;
  dur_us: number | null;
  swings: number | null;
  freq_khz: number | null;
  clipped: boolean;
  t0_us: number;
  t1_us: number;
  ev0_us: number | null;
  ev1_us: number | null;
  flagged: boolean;
  flag_note: string;
  full_path: string | null;
  scale: CavitationScale | null;
};

// What the browser needs to turn raw ADC counts into volts and seconds.
export type CavitationScale = {
  dtype: "u2" | "u1"; n: number;
  xinc: number; xorig: number; xref: number;
  yinc: number; yorig: number; yref: number;
};

// y is the min/max-decimated trace in units of 0.1 mV, evenly spread from t0_us to t1_us.
export type CavitationTrace = { id: number; y: number[] };

export type CavitationSummary = {
  plant_id: string;
  total: number;
  last_24h: number;
  last_7d: number;
  flagged: number;
  last_capture_at: string | null;
};
