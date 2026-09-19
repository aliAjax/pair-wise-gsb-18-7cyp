// 器械消毒与冲洗台账：领域模型与状态迁移逻辑
// 所有函数均为纯函数：输入旧状态，返回新状态，异常与操作记录一并写入。

export type BatchStatus = "pending" | "released" | "locked";
export type TreatmentStatus = "draft" | "active" | "completed" | "cancelled";
export type LedgerKind = "info" | "ok" | "warn" | "error";

export interface InstrumentBatch {
  id: string; // 消毒批次号
  kitName: string; // 器械包名称
  items: number; // 包内器械件数
  status: BatchStatus; // pending 待放行 / released 已放行 / locked 治疗锁定
  sterilizedAt: string;
  expiresAt: string;
  lockedBy?: string; // 锁定该批次的治疗 ID
}

export interface Irrigant {
  id: string;
  name: string;
  stockMl: number; // 当前库存
  capacityMl: number; // 最大容量
}

export interface Treatment {
  id: string;
  tooth: string; // 牙位，如 #36
  diagnosis: string;
  batchId: string; // 所选器械包批次
  irrigantId: string; // 所选冲洗液
  plannedMl: number; // 计划冲洗液用量（确认时预扣）
  usedMl?: number; // 实际用量（结束时回填）
  status: TreatmentStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

export interface LedgerEntry {
  id: string;
  time: string;
  kind: LedgerKind;
  tooth: string;
  action: string;
  detail: string;
}

export interface ExceptionRecord {
  id: string;
  time: string;
  tooth: string; // 牙位
  batchId: string; // 涉及批次
  shortage: string; // 缺口数量
  trigger: string; // 触发条件
}

export interface LedgerState {
  version: 1;
  batches: InstrumentBatch[];
  irrigants: Irrigant[];
  treatments: Treatment[];
  ledger: LedgerEntry[];
  exceptions: ExceptionRecord[];
}

export const STORAGE_KEY = "hxwl04-sterilization-ledger-v1";

export const TOOTH_POSITIONS: string[] = [
  11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33,
  34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
].map((n) => "#" + n);

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function now(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function log(
  kind: LedgerKind,
  tooth: string,
  action: string,
  detail: string,
  time = now()
): LedgerEntry {
  return { id: uid("L"), time, kind, tooth, action, detail };
}

export function seedState(): LedgerState {
  return {
    version: 1,
    batches: [
      {
        id: "PK-0912-A",
        kitName: "根管预备器械包",
        items: 18,
        status: "locked",
        sterilizedAt: "2026-09-12",
        expiresAt: "2026-10-12",
        lockedBy: "seed-t1",
      },
      {
        id: "PK-0912-B",
        kitName: "根管充填器械包",
        items: 14,
        status: "pending",
        sterilizedAt: "2026-09-12",
        expiresAt: "2026-10-12",
      },
      {
        id: "PK-0915-C",
        kitName: "根管预备器械包",
        items: 18,
        status: "released",
        sterilizedAt: "2026-09-15",
        expiresAt: "2026-10-15",
      },
      {
        id: "PK-0918-D",
        kitName: "显微根管器械包",
        items: 22,
        status: "pending",
        sterilizedAt: "2026-09-18",
        expiresAt: "2026-10-18",
      },
    ],
    irrigants: [
      // 库存已反映种子治疗的预扣与归还：1000 - 120(进行中) - 90(已完成净耗) = 790
      { id: "irr-naclo", name: "3% 次氯酸钠", stockMl: 790, capacityMl: 1000 },
      { id: "irr-edta", name: "17% EDTA", stockMl: 320, capacityMl: 500 },
      { id: "irr-chx", name: "2% 氯己定", stockMl: 180, capacityMl: 500 },
    ],
    treatments: [
      {
        id: "seed-t1",
        tooth: "#36",
        diagnosis: "慢性根尖周炎",
        batchId: "PK-0912-A",
        irrigantId: "irr-naclo",
        plannedMl: 120,
        status: "active",
        createdAt: "2026-09-18 09:40",
        startedAt: "2026-09-18 09:52",
      },
      {
        id: "seed-t2",
        tooth: "#11",
        diagnosis: "外伤后变色",
        batchId: "PK-0915-C",
        irrigantId: "irr-edta",
        plannedMl: 60,
        status: "draft",
        createdAt: "2026-09-19 08:15",
      },
      {
        id: "seed-t3",
        tooth: "#46",
        diagnosis: "急性牙髓炎",
        batchId: "PK-0915-C",
        irrigantId: "irr-naclo",
        plannedMl: 100,
        usedMl: 90,
        status: "completed",
        createdAt: "2026-09-17 14:05",
        startedAt: "2026-09-17 14:20",
        endedAt: "2026-09-17 15:10",
      },
    ],
    ledger: [
      log("info", "#11", "创建治疗", "计划使用批次 PK-0915-C，17% EDTA 60ml", "2026-09-19 08:15"),
      log("info", "#36", "开始治疗", "锁定批次 PK-0912-A，预扣 3% 次氯酸钠 120ml", "2026-09-18 09:52"),
      log("ok", "#46", "结束结算", "实际冲洗 90ml，归还 10ml；释放批次 PK-0915-C 未用器械", "2026-09-17 15:10"),
      log("info", "#46", "开始治疗", "锁定批次 PK-0915-C，预扣 3% 次氯酸钠 100ml", "2026-09-17 14:20"),
    ],
    exceptions: [],
  };
}

export function loadState(): LedgerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as LedgerState;
    if (
      parsed &&
      parsed.version === 1 &&
      Array.isArray(parsed.batches) &&
      Array.isArray(parsed.irrigants) &&
      Array.isArray(parsed.treatments) &&
      Array.isArray(parsed.ledger) &&
      Array.isArray(parsed.exceptions)
    ) {
      return parsed;
    }
    return seedState();
  } catch {
    return seedState();
  }
}

export function persistState(state: LedgerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默失败，页面内状态仍然一致
  }
}

export interface CreateTreatmentInput {
  tooth: string;
  diagnosis: string;
  batchId: string;
  irrigantId: string;
  plannedMl: number;
}

/** 创建治疗（草稿）：仅记录计划，不锁定批次、不预扣库存 */
export function createTreatment(
  state: LedgerState,
  input: CreateTreatmentInput
): LedgerState {
  const batch = state.batches.find((b) => b.id === input.batchId);
  const irrigant = state.irrigants.find((i) => i.id === input.irrigantId);
  const t: Treatment = {
    id: uid("T"),
    tooth: input.tooth,
    diagnosis: input.diagnosis.trim() || "待补充诊断",
    batchId: input.batchId,
    irrigantId: input.irrigantId,
    plannedMl: input.plannedMl,
    status: "draft",
    createdAt: now(),
  };
  const entry = log(
    "info",
    t.tooth,
    "创建治疗",
    `计划使用批次 ${t.batchId}（${batch?.kitName ?? "未知器械包"}），${irrigant?.name ?? "未知冲洗液"} ${t.plannedMl}ml`
  );
  return {
    ...state,
    treatments: [t, ...state.treatments],
    ledger: [entry, ...state.ledger],
  };
}

/**
 * 确认并开始治疗：
 * - 批次未放行（或被他治疗锁定）→ 记录异常，禁止开始
 * - 冲洗液计划量超当前库存 → 记录异常，禁止开始
 * - 全部通过 → 锁定批次并预扣库存
 */
export function confirmTreatment(
  state: LedgerState,
  treatmentId: string
): LedgerState {
  const t = state.treatments.find((x) => x.id === treatmentId);
  if (!t || t.status !== "draft") return state;
  const time = now();
  const batch = state.batches.find((b) => b.id === t.batchId);
  const irrigant = state.irrigants.find((i) => i.id === t.irrigantId);
  const newExceptions: ExceptionRecord[] = [];
  const newLogs: LedgerEntry[] = [];

  if (!batch || batch.status !== "released") {
    const reason = !batch
      ? "批次不存在"
      : batch.status === "locked"
        ? "批次被其他治疗锁定"
        : "批次未放行";
    newExceptions.push({
      id: uid("X"),
      time,
      tooth: t.tooth,
      batchId: t.batchId,
      shortage: "器械包 1 个",
      trigger: `确认开始治疗：${reason}`,
    });
  }
  const stock = irrigant?.stockMl ?? 0;
  if (t.plannedMl > stock) {
    newExceptions.push({
      id: uid("X"),
      time,
      tooth: t.tooth,
      batchId: t.batchId,
      shortage: `冲洗液 ${t.plannedMl - stock} ml`,
      trigger: "确认开始治疗：冲洗液用量超过当前库存",
    });
  }

  if (newExceptions.length > 0) {
    for (const ex of newExceptions) {
      newLogs.push(log("error", ex.tooth, "确认被拒绝", `${ex.trigger}，缺口 ${ex.shortage}`, time));
    }
    return {
      ...state,
      exceptions: [...newExceptions, ...state.exceptions],
      ledger: [...newLogs, ...state.ledger],
    };
  }

  const batches = state.batches.map((b) =>
    b.id === t.batchId ? { ...b, status: "locked" as BatchStatus, lockedBy: t.id } : b
  );
  const irrigants = state.irrigants.map((i) =>
    i.id === t.irrigantId ? { ...i, stockMl: i.stockMl - t.plannedMl } : i
  );
  const treatments = state.treatments.map((x) =>
    x.id === t.id ? { ...x, status: "active" as TreatmentStatus, startedAt: time } : x
  );
  newLogs.push(
    log(
      "ok",
      t.tooth,
      "开始治疗",
      `锁定批次 ${t.batchId}，预扣 ${irrigant?.name ?? t.irrigantId} ${t.plannedMl}ml`,
      time
    )
  );
  return { ...state, batches, irrigants, treatments, ledger: [...newLogs, ...state.ledger] };
}

/** 结束治疗：按实际用量结算，归还剩余冲洗液，释放批次未用器械 */
export function finishTreatment(
  state: LedgerState,
  treatmentId: string,
  usedMl: number
): LedgerState {
  const t = state.treatments.find((x) => x.id === treatmentId);
  if (!t || t.status !== "active") return state;
  const time = now();
  const used = Math.max(0, Math.min(Math.round(usedMl), t.plannedMl));
  const returned = t.plannedMl - used;

  const batches = state.batches.map((b) => {
    if (b.id === t.batchId && b.lockedBy === t.id) {
      const { lockedBy, ...rest } = b;
      return { ...rest, status: "released" as BatchStatus };
    }
    return b;
  });
  const irrigants = state.irrigants.map((i) =>
    i.id === t.irrigantId
      ? { ...i, stockMl: Math.min(i.capacityMl, i.stockMl + returned) }
      : i
  );
  const treatments = state.treatments.map((x) =>
    x.id === t.id
      ? { ...x, status: "completed" as TreatmentStatus, usedMl: used, endedAt: time }
      : x
  );
  const entry = log(
    "ok",
    t.tooth,
    "结束结算",
    `实际冲洗 ${used}ml，归还剩余 ${returned}ml；释放批次 ${t.batchId} 未用器械`,
    time
  );
  return { ...state, batches, irrigants, treatments, ledger: [entry, ...state.ledger] };
}

/** 取消治疗：草稿直接取消；进行中则归还全部预扣冲洗液并释放批次 */
export function cancelTreatment(
  state: LedgerState,
  treatmentId: string
): LedgerState {
  const t = state.treatments.find((x) => x.id === treatmentId);
  if (!t || (t.status !== "draft" && t.status !== "active")) return state;
  const time = now();

  if (t.status === "draft") {
    const treatments = state.treatments.map((x) =>
      x.id === t.id ? { ...x, status: "cancelled" as TreatmentStatus, endedAt: time } : x
    );
    const entry = log("warn", t.tooth, "取消治疗", "草稿未锁定资源，直接取消", time);
    return { ...state, treatments, ledger: [entry, ...state.ledger] };
  }

  const batches = state.batches.map((b) => {
    if (b.id === t.batchId && b.lockedBy === t.id) {
      const { lockedBy, ...rest } = b;
      return { ...rest, status: "released" as BatchStatus };
    }
    return b;
  });
  const irrigants = state.irrigants.map((i) =>
    i.id === t.irrigantId
      ? { ...i, stockMl: Math.min(i.capacityMl, i.stockMl + t.plannedMl) }
      : i
  );
  const treatments = state.treatments.map((x) =>
    x.id === t.id ? { ...x, status: "cancelled" as TreatmentStatus, endedAt: time } : x
  );
  const entry = log(
    "warn",
    t.tooth,
    "取消治疗",
    `归还全部预扣 ${t.plannedMl}ml，释放批次 ${t.batchId} 未用器械`,
    time
  );
  return { ...state, batches, irrigants, treatments, ledger: [entry, ...state.ledger] };
}

/** 质控放行批次（仅待放行批次可操作） */
export function releaseBatch(state: LedgerState, batchId: string): LedgerState {
  const batch = state.batches.find((b) => b.id === batchId);
  if (!batch || batch.status !== "pending") return state;
  const batches = state.batches.map((b) =>
    b.id === batchId ? { ...b, status: "released" as BatchStatus } : b
  );
  const entry = log(
    "ok",
    "—",
    "批次放行",
    `质控放行批次 ${batch.id}（${batch.kitName}，${batch.items} 件）`
  );
  return { ...state, batches, ledger: [entry, ...state.ledger] };
}

/** 补充冲洗液库存 */
export function restockIrrigant(
  state: LedgerState,
  irrigantId: string,
  amountMl: number
): LedgerState {
  const irrigant = state.irrigants.find((i) => i.id === irrigantId);
  if (!irrigant || amountMl <= 0) return state;
  const added = Math.min(amountMl, irrigant.capacityMl - irrigant.stockMl);
  if (added <= 0) return state;
  const irrigants = state.irrigants.map((i) =>
    i.id === irrigantId ? { ...i, stockMl: i.stockMl + added } : i
  );
  const entry = log(
    "info",
    "—",
    "补充库存",
    `${irrigant.name} 入库 ${added}ml，现库存 ${irrigant.stockMl + added}ml`
  );
  return { ...state, irrigants, ledger: [entry, ...state.ledger] };
}
