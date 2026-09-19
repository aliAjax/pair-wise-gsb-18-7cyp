import type { ClinicState } from "./types";

export const STORAGE_KEY = "hxwl04-sterile-ledger-v1";

export function seedState(): ClinicState {
  return {
    seq: 0,
    packs: [
      {
        id: "pack-a",
        name: "根管治疗包 A（机用）",
        batchNo: "RC-20260910-A",
        status: "released",
        total: 6,
        available: 4,
        sterilizedAt: "2026-09-10",
        expiresAt: "2026-10-10",
      },
      {
        id: "pack-b",
        name: "根管治疗包 B（手用）",
        batchNo: "RC-20260912-B",
        status: "quarantined",
        total: 4,
        available: 4,
        sterilizedAt: "2026-09-12",
        expiresAt: "2026-10-12",
      },
      {
        id: "pack-c",
        name: "根管再治疗包 C",
        batchNo: "RC-20260915-C",
        status: "released",
        total: 3,
        available: 0,
        sterilizedAt: "2026-09-15",
        expiresAt: "2026-10-15",
      },
    ],
    irrigants: [
      { id: "irr-nacl", name: "0.9% 生理盐水", concentration: "0.9%", stockMl: 500, capacityMl: 1000 },
      { id: "irr-naclo", name: "次氯酸钠 3%", concentration: "3%", stockMl: 120, capacityMl: 500 },
      { id: "irr-edta", name: "EDTA 17%", concentration: "17%", stockMl: 60, capacityMl: 250 },
    ],
    treatments: [],
    logs: [],
  };
}

function isState(value: unknown): value is ClinicState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.packs) &&
    Array.isArray(v.irrigants) &&
    Array.isArray(v.treatments) &&
    Array.isArray(v.logs) &&
    typeof v.seq === "number"
  );
}

export function loadState(): ClinicState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed: unknown = JSON.parse(raw);
    if (!isState(parsed)) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

export function saveState(state: ClinicState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默失败，页面内状态仍可用
  }
}
