import type {
  ClinicState,
  InstrumentPack,
  Irrigant,
  Issue,
  LogEntry,
  LogType,
  Treatment,
} from "./types";

export const MAX_LOGS = 200;

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function fmtTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function makeLog(partial: Omit<LogEntry, "id" | "at"> & { at?: number }): LogEntry {
  return { id: uid(), at: Date.now(), ...partial };
}

export function pushLog(state: ClinicState, entry: LogEntry): ClinicState {
  return { ...state, logs: [entry, ...state.logs].slice(0, MAX_LOGS) };
}

export function getPack(state: ClinicState, id: string): InstrumentPack | undefined {
  return state.packs.find((p) => p.id === id);
}

export function getIrrigant(state: ClinicState, id: string): Irrigant | undefined {
  return state.irrigants.find((i) => i.id === id);
}

export function getTreatment(state: ClinicState, id: string): Treatment | undefined {
  return state.treatments.find((t) => t.id === id);
}

/** 牙位是否已被未结束的治疗占用（草稿或进行中） */
export function toothBusy(state: ClinicState, tooth: string): boolean {
  return state.treatments.some(
    (t) => t.tooth === tooth && (t.status === "draft" || t.status === "active")
  );
}

/** 确认（开始）治疗前的校验，返回错误信息列表；空数组表示可确认 */
export function validateConfirm(
  state: ClinicState,
  input: { tooth: string; packId: string; irrigantId: string; irrigantMl: number }
): string[] {
  const errors: string[] = [];
  const pack = getPack(state, input.packId);
  const irrigant = getIrrigant(state, input.irrigantId);

  if (!input.tooth) errors.push("请选择牙位");
  if (input.tooth && toothBusy(state, input.tooth)) {
    errors.push(`牙位 ${input.tooth} 已有未结束的治疗`);
  }
  if (!pack) {
    errors.push("请选择器械包");
  } else {
    if (pack.status !== "released") errors.push(`批次 ${pack.batchNo} 未放行`);
    if (pack.available < 1) errors.push(`批次 ${pack.batchNo} 无可用器械包`);
  }
  if (!irrigant) {
    errors.push("请选择冲洗液");
  }
  if (!Number.isFinite(input.irrigantMl) || input.irrigantMl <= 0) {
    errors.push("冲洗液用量需大于 0 mL");
  } else if (irrigant && input.irrigantMl > irrigant.stockMl) {
    errors.push(
      `冲洗液超出库存：需要 ${input.irrigantMl} mL，当前库存 ${irrigant.stockMl} mL，缺口 ${
        input.irrigantMl - irrigant.stockMl
      } mL`
    );
  }
  return errors;
}

/** 创建治疗草稿：仅记录选择，不占用资源 */
export function createTreatment(
  state: ClinicState,
  input: { tooth: string; diagnosis: string; packId: string; irrigantId: string; irrigantMl: number }
): ClinicState {
  const seq = state.seq + 1;
  const pack = getPack(state, input.packId);
  const irrigant = getIrrigant(state, input.irrigantId);
  const treatment: Treatment = {
    id: uid(),
    seq,
    tooth: input.tooth,
    diagnosis: input.diagnosis.trim(),
    packId: input.packId,
    irrigantId: input.irrigantId,
    irrigantMl: input.irrigantMl,
    status: "draft",
    createdAt: Date.now(),
  };
  const log = makeLog({
    type: "create",
    tooth: input.tooth,
    packId: input.packId,
    batchNo: pack?.batchNo,
    irrigantId: input.irrigantId,
    amountMl: input.irrigantMl,
    message: `创建治疗 #${seq}：牙位 ${input.tooth}，选择 ${pack?.name ?? "?"}（批次 ${
      pack?.batchNo ?? "?"
    }）+ ${irrigant?.name ?? "?"} ${input.irrigantMl} mL（待确认）`,
  });
  return pushLog({ ...state, seq, treatments: [treatment, ...state.treatments] }, log);
}

/** 确认并开始治疗：锁定批次（占用 1 套器械包 + 扣除冲洗液） */
export function startTreatment(state: ClinicState, id: string): ClinicState {
  const t = getTreatment(state, id);
  if (!t || t.status !== "draft") return state;
  const pack = getPack(state, t.packId);
  const irrigant = getIrrigant(state, t.irrigantId);
  if (!pack || !irrigant) return state;

  const errors: string[] = [];
  if (pack.status !== "released") errors.push(`批次 ${pack.batchNo} 未放行`);
  if (pack.available < 1) errors.push(`批次 ${pack.batchNo} 无可用器械包`);
  if (t.irrigantMl > irrigant.stockMl) {
    errors.push(
      `冲洗液缺口 ${t.irrigantMl - irrigant.stockMl} mL（需要 ${t.irrigantMl} mL / 库存 ${irrigant.stockMl} mL）`
    );
  }
  if (errors.length > 0) {
    return pushLog(
      state,
      makeLog({
        type: "blocked",
        tooth: t.tooth,
        packId: pack.id,
        batchNo: pack.batchNo,
        irrigantId: irrigant.id,
        amountMl: t.irrigantMl,
        message: `确认被拦截：牙位 ${t.tooth} / 批次 ${pack.batchNo} — ${errors.join("；")}`,
      })
    );
  }

  const started: Treatment = { ...t, status: "active", startedAt: Date.now() };
  const next: ClinicState = {
    ...state,
    packs: state.packs.map((p) =>
      p.id === pack.id ? { ...p, available: p.available - 1 } : p
    ),
    irrigants: state.irrigants.map((i) =>
      i.id === irrigant.id ? { ...i, stockMl: i.stockMl - t.irrigantMl } : i
    ),
    treatments: state.treatments.map((x) => (x.id === id ? started : x)),
  };
  return pushLog(
    next,
    makeLog({
      type: "start",
      tooth: t.tooth,
      packId: pack.id,
      batchNo: pack.batchNo,
      irrigantId: irrigant.id,
      amountMl: t.irrigantMl,
      message: `治疗 #${t.seq} 开始：牙位 ${t.tooth}，锁定批次 ${pack.batchNo}（占用 1 套），预扣 ${irrigant.name} ${t.irrigantMl} mL`,
    })
  );
}

/** 结束或取消治疗：释放未用器械包并归还剩余冲洗液 */
export function endTreatment(
  state: ClinicState,
  id: string,
  outcome: "completed" | "cancelled",
  usedMl = 0
): ClinicState {
  const t = getTreatment(state, id);
  if (!t) return state;
  const pack = getPack(state, t.packId);
  const irrigant = getIrrigant(state, t.irrigantId);
  const label = outcome === "completed" ? "完成" : "取消";

  let next: ClinicState = {
    ...state,
    treatments: state.treatments.map((x) =>
      x.id === id
        ? { ...x, status: outcome, endedAt: Date.now(), endReason: outcome }
        : x
    ),
  };

  if (t.status === "active") {
    // 进行中的治疗：归还 1 套未使用器械包
    if (pack) {
      next = {
        ...next,
        packs: next.packs.map((p) =>
          p.id === pack.id ? { ...p, available: Math.min(p.total, p.available + 1) } : p
        ),
      };
    }
    // 归还剩余冲洗液（完成时可登记实际用量，取消时全额归还）
    const returnedMl =
      outcome === "completed"
        ? Math.max(0, Math.min(t.irrigantMl, t.irrigantMl - Math.max(0, usedMl)))
        : t.irrigantMl;
    if (irrigant && returnedMl > 0) {
      next = {
        ...next,
        irrigants: next.irrigants.map((i) =>
          i.id === irrigant.id
            ? { ...i, stockMl: Math.min(i.capacityMl, i.stockMl + returnedMl) }
            : i
        ),
      };
    }
    const usedPart =
      outcome === "completed" && usedMl > 0 ? `，实际使用 ${usedMl} mL` : "";
    return pushLog(
      next,
      makeLog({
        type: outcome === "completed" ? "complete" : "cancel",
        tooth: t.tooth,
        packId: pack?.id,
        batchNo: pack?.batchNo,
        irrigantId: irrigant?.id,
        amountMl: returnedMl,
        message: `治疗 #${t.seq} ${label}：牙位 ${t.tooth}，释放批次 ${
          pack?.batchNo ?? "?"
        } 未用器械 1 套，归还剩余冲洗液 ${returnedMl} mL${usedPart}`,
      })
    );
  }

  // 草稿直接取消：从未占用资源，无需释放
  return pushLog(
    next,
    makeLog({
      type: "cancel",
      tooth: t.tooth,
      packId: pack?.id,
      batchNo: pack?.batchNo,
      message: `治疗 #${t.seq} 取消（未开始）：牙位 ${t.tooth}，未占用资源`,
    })
  );
}

/** 补充冲洗液库存 */
export function restockIrrigant(state: ClinicState, irrigantId: string, ml: number): ClinicState {
  const irrigant = getIrrigant(state, irrigantId);
  if (!irrigant || !Number.isFinite(ml) || ml <= 0) return state;
  const next: ClinicState = {
    ...state,
    irrigants: state.irrigants.map((i) =>
      i.id === irrigantId
        ? { ...i, stockMl: Math.min(i.capacityMl, i.stockMl + ml) }
        : i
    ),
  };
  return pushLog(
    next,
    makeLog({
      type: "restock",
      irrigantId,
      amountMl: ml,
      message: `冲洗液入库：${irrigant.name} +${ml} mL`,
    })
  );
}

/** 器械包批次放行 / 退回待放行 */
export function setPackStatus(
  state: ClinicState,
  packId: string,
  status: "released" | "quarantined"
): ClinicState {
  const pack = getPack(state, packId);
  if (!pack || pack.status === status) return state;
  const next: ClinicState = {
    ...state,
    packs: state.packs.map((p) => (p.id === packId ? { ...p, status } : p)),
  };
  return pushLog(
    next,
    makeLog({
      type: status === "released" ? "release" : "quarantine",
      packId,
      batchNo: pack.batchNo,
      message:
        status === "released"
          ? `批次放行：${pack.name}（${pack.batchNo}）可用于治疗`
          : `批次退回待放行：${pack.name}（${pack.batchNo}）暂停使用`,
    })
  );
}

const TRIGGER_LABELS: Record<string, string> = {
  "pack-quarantined": "器械包批次未放行",
  "pack-out": "器械包无可用库存",
  "irrigant-short": "冲洗液库存不足",
  "tooth-missing": "未选择牙位",
  "tooth-busy": "牙位已有未结束治疗",
  "pack-missing": "未选择器械包",
  "irrigant-missing": "未选择冲洗液",
  "ml-invalid": "冲洗液用量无效",
};

/** 汇总当前异常：草稿治疗 + 表单当前选择，列出牙位、批次、缺口与触发条件 */
export function computeIssues(
  state: ClinicState,
  form: { tooth: string; packId: string; irrigantId: string; irrigantMl: number }
): Issue[] {
  const map = new Map<string, Issue>();

  const add = (
    key: string,
    base: { tooth: string; batchNo: string; irrigantName: string },
    trigger: string,
    packGap = 0,
    irrigantGapMl = 0
  ) => {
    let issue = map.get(key);
    if (!issue) {
      issue = { key, ...base, packGap: 0, irrigantGapMl: 0, triggers: [] };
      map.set(key, issue);
    }
    if (!issue.triggers.includes(TRIGGER_LABELS[trigger])) {
      issue.triggers.push(TRIGGER_LABELS[trigger]);
    }
    issue.packGap = Math.max(issue.packGap, packGap);
    issue.irrigantGapMl = Math.max(issue.irrigantGapMl, irrigantGapMl);
  };

  const check = (
    key: string,
    tooth: string,
    packId: string,
    irrigantId: string,
    ml: number
  ) => {
    const pack = getPack(state, packId);
    const irrigant = getIrrigant(state, irrigantId);
    const base = {
      tooth: tooth || "—",
      batchNo: pack?.batchNo ?? "—",
      irrigantName: irrigant?.name ?? "—",
    };
    if (!tooth) add(key, base, "tooth-missing");
    if (!packId) add(key, base, "pack-missing");
    if (!irrigantId) add(key, base, "irrigant-missing");
    if (!Number.isFinite(ml) || ml <= 0) add(key, base, "ml-invalid");
    if (pack) {
      if (pack.status !== "released") add(key, base, "pack-quarantined");
      if (pack.available < 1) add(key, base, "pack-out", 1, 0);
    }
    if (irrigant && ml > irrigant.stockMl) {
      add(key, base, "irrigant-short", 0, ml - irrigant.stockMl);
    }
  };

  for (const t of state.treatments) {
    if (t.status === "draft") {
      check(`t:${t.id}`, t.tooth, t.packId, t.irrigantId, t.irrigantMl);
    }
  }
  check("form", form.tooth, form.packId, form.irrigantId, form.irrigantMl);

  return [...map.values()];
}
