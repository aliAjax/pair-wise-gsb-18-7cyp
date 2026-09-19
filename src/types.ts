export type PackStatus = "released" | "quarantined";

export type TreatmentStatus = "draft" | "active" | "completed" | "cancelled";

export interface InstrumentPack {
  id: string;
  name: string;
  batchNo: string;
  status: PackStatus;
  total: number;
  available: number;
  sterilizedAt: string;
  expiresAt: string;
}

export interface Irrigant {
  id: string;
  name: string;
  concentration: string;
  stockMl: number;
  capacityMl: number;
}

export interface Treatment {
  id: string;
  seq: number;
  tooth: string;
  diagnosis: string;
  packId: string;
  irrigantId: string;
  irrigantMl: number;
  status: TreatmentStatus;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  endReason?: "completed" | "cancelled";
}

export type LogType =
  | "create"
  | "start"
  | "complete"
  | "cancel"
  | "restock"
  | "release"
  | "quarantine"
  | "blocked";

export interface LogEntry {
  id: string;
  at: number;
  type: LogType;
  message: string;
  tooth?: string;
  packId?: string;
  batchNo?: string;
  irrigantId?: string;
  amountMl?: number;
}

export interface Issue {
  key: string;
  tooth: string;
  batchNo: string;
  irrigantName: string;
  packGap: number;
  irrigantGapMl: number;
  triggers: string[];
}

export interface ClinicState {
  packs: InstrumentPack[];
  irrigants: Irrigant[];
  treatments: Treatment[];
  logs: LogEntry[];
  seq: number;
}
