import type { Status } from "@/lib/status";

export type DNode = {
  id: string; // plant id
  label: string;
  variety: string | null;
  area: number | null;
  path: string;
  status: Status;
  isLive: boolean;
  stress: number;
  sensorCount: number;
  mmPlan: number | null;
  mmDelta: number;
  ae: number[];
};

export type Severity = "critical" | "warning" | "good";

export type PanelTab = "env" | "cav" | "ae" | "events" | "settings";
