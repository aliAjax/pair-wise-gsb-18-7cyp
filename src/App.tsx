import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  BatchStatus,
  InstrumentBatch,
  Irrigant,
  LedgerState,
  STORAGE_KEY,
  TOOTH_POSITIONS,
  Treatment,
  TreatmentStatus,
  cancelTreatment,
  confirmTreatment,
  createTreatment,
  finishTreatment,
  loadState,
  persistState,
  releaseBatch,
  restockIrrigant,
  seedState,
} from "./domain";

const batchStatusLabel: Record<BatchStatus, string> = {
  pending: "待放行",
  released: "已放行",
  locked: "治疗锁定",
};

const batchStatusClass: Record<BatchStatus, string> = {
  pending: "badge warn",
  released: "badge ok",
  locked: "badge danger",
};

const treatmentStatusLabel: Record<TreatmentStatus, string> = {
  draft: "待确认",
  active: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

const treatmentStatusClass: Record<TreatmentStatus, string> = {
  draft: "badge info",
  active: "badge ok",
  completed: "badge muted",
  cancelled: "badge muted",
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function TreatmentCard({
  treatment,
  batch,
  irrigant,
  onConfirm,
  onFinish,
  onCancel,
}: {
  treatment: Treatment;
  batch?: InstrumentBatch;
  irrigant?: Irrigant;
  onConfirm: () => void;
  onFinish: (usedMl: number) => void;
  onCancel: () => void;
}) {
  const [usedMl, setUsedMl] = useState(treatment.plannedMl);

  return (
    <article className={`treatment-card st-${treatment.status}`}>
      <div className="treatment-head">
        <div>
          <h3>{treatment.tooth}</h3>
          <p className="diag">{treatment.diagnosis}</p>
        </div>
        <span className={treatmentStatusClass[treatment.status]}>
          {treatmentStatusLabel[treatment.status]}
        </span>
      </div>
      <dl className="treatment-meta">
        <div>
          <dt>器械批次</dt>
          <dd>
            {treatment.batchId}
            {batch ? ` · ${batch.kitName}` : ""}
          </dd>
        </div>
        <div>
          <dt>冲洗液</dt>
          <dd>
            {irrigant?.name ?? treatment.irrigantId} · 计划 {treatment.plannedMl}ml
            {treatment.usedMl !== undefined ? ` · 实耗 ${treatment.usedMl}ml` : ""}
          </dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd>
            创建 {treatment.createdAt}
            {treatment.startedAt ? ` · 开始 ${treatment.startedAt}` : ""}
            {treatment.endedAt ? ` · 结束 ${treatment.endedAt}` : ""}
          </dd>
        </div>
      </dl>
      {(treatment.status === "draft" || treatment.status === "active") && (
        <div className="card-actions">
          {treatment.status === "draft" && (
            <>
              <button className="primary-action" onClick={onConfirm}>
                确认并开始
              </button>
              <button onClick={onCancel}>取消</button>
            </>
          )}
          {treatment.status === "active" && (
            <>
              <label className="used-input">
                <span>实际用量 ml</span>
                <input
                  type="number"
                  min={0}
                  max={treatment.plannedMl}
                  value={usedMl}
                  onChange={(e) => setUsedMl(Number(e.target.value))}
                />
              </label>
              <button className="primary-action" onClick={() => onFinish(usedMl)}>
                结束并结算
              </button>
              <button onClick={onCancel}>取消</button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function App() {
  const [state, setState] = useState<LedgerState>(loadState);
  const [filter, setFilter] = useState<TreatmentStatus | "all">("all");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    tooth: "#36",
    diagnosis: "",
    batchId: "",
    irrigantId: "irr-naclo",
    plannedMl: 60,
  });

  // 任何状态变化整体落盘，保证重开后治疗、批次、库存、记录互相对应
  useEffect(() => {
    persistState(state);
  }, [state]);

  const metrics = useMemo(() => {
    const active = state.treatments.filter((t) => t.status === "active").length;
    const released = state.batches.filter((b) => b.status === "released").length;
    const stock = state.irrigants.reduce((sum, i) => sum + i.stockMl, 0);
    return [
      `${active} 台`,
      `${released}/${state.batches.length}`,
      `${stock} ml`,
      `${state.exceptions.length} 条`,
    ];
  }, [state]);

  const visibleTreatments = useMemo(
    () =>
      filter === "all"
        ? state.treatments
        : state.treatments.filter((t) => t.status === filter),
    [state.treatments, filter]
  );

  const submitCreate = () => {
    if (!form.batchId) {
      setFormError("请选择器械包消毒批次");
      return;
    }
    if (!form.irrigantId) {
      setFormError("请选择冲洗液");
      return;
    }
    if (!Number.isFinite(form.plannedMl) || form.plannedMl <= 0) {
      setFormError("冲洗液计划用量需大于 0ml");
      return;
    }
    setFormError("");
    setState((s) => createTreatment(s, form));
    setForm((f) => ({ ...f, diagnosis: "" }));
  };

  const resetDemo = () => {
    if (window.confirm("重置将清空当前全部台账并恢复演示数据，确定继续？")) {
      setState(seedState());
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-04 · port 5104</p>
          <h1>根管器械消毒与冲洗台账</h1>
          <p className="subtitle">
            按牙位创建治疗并绑定器械包消毒批次与冲洗液用量：批次未放行或冲洗液超库存时禁止确认；
            开始后锁定批次并预扣库存，取消或结束时释放未用器械、归还剩余冲洗液。
          </p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>React + Vite + TypeScript + CSS</strong>
          <span>数据持久化</span>
          <strong>localStorage · {STORAGE_KEY}</strong>
          <button onClick={resetDemo}>重置演示数据</button>
        </div>
      </section>

      <section className="metrics-grid">
        {["进行中治疗", "已放行批次", "冲洗液总库存", "异常记录"].map((label, index) => (
          <MetricCard key={label} label={label} value={metrics[index]} index={index} />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>新建治疗</h2>
          <div className="form-stack">
            <label>
              <span>牙位</span>
              <select
                value={form.tooth}
                onChange={(e) => setForm({ ...form, tooth: e.target.value })}
              >
                {TOOTH_POSITIONS.map((tooth) => (
                  <option key={tooth} value={tooth}>
                    {tooth}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>诊断</span>
              <input
                placeholder="如：慢性根尖周炎"
                value={form.diagnosis}
                onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
              />
            </label>
            <label>
              <span>器械包批次</span>
              <select
                value={form.batchId}
                onChange={(e) => setForm({ ...form, batchId: e.target.value })}
              >
                <option value="">选择消毒批次</option>
                {state.batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.kitName}（{batchStatusLabel[b.status]}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>冲洗液</span>
              <select
                value={form.irrigantId}
                onChange={(e) => setForm({ ...form, irrigantId: e.target.value })}
              >
                {state.irrigants.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}（库存 {i.stockMl}ml）
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>冲洗液计划用量 ml</span>
              <input
                type="number"
                min={0}
                step={10}
                value={form.plannedMl}
                onChange={(e) => setForm({ ...form, plannedMl: Number(e.target.value) })}
              />
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <button className="primary-action" onClick={submitCreate}>
              创建治疗
            </button>
            <p className="hint">
              创建仅登记计划；点击「确认并开始」时校验批次放行状态与冲洗液库存，通过后锁定批次并预扣用量。
            </p>
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>牙体牙髓</p>
              <h2>消毒批次与冲洗液库存</h2>
            </div>
          </div>
          <div className="batch-list">
            {state.batches.map((b) => {
              const lockedBy = b.lockedBy
                ? state.treatments.find((t) => t.id === b.lockedBy)
                : undefined;
              return (
                <div key={b.id} className="batch-row">
                  <div>
                    <strong>{b.id}</strong>
                    <span className="batch-sub">
                      {b.kitName} · {b.items} 件 · 灭菌 {b.sterilizedAt} · 有效期至 {b.expiresAt}
                      {b.status === "locked" && lockedBy
                        ? ` · 锁定于 ${lockedBy.tooth}`
                        : ""}
                    </span>
                  </div>
                  <span className={batchStatusClass[b.status]}>
                    {batchStatusLabel[b.status]}
                  </span>
                  {b.status === "pending" ? (
                    <button onClick={() => setState((s) => releaseBatch(s, b.id))}>
                      质控放行
                    </button>
                  ) : (
                    <span className="row-placeholder" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="stock-list">
            {state.irrigants.map((i) => (
              <div key={i.id} className="stock-row">
                <div className="stock-info">
                  <strong>{i.name}</strong>
                  <span>
                    {i.stockMl} / {i.capacityMl} ml
                  </span>
                </div>
                <div className="stock-bar">
                  <i style={{ width: `${Math.round((i.stockMl / i.capacityMl) * 100)}%` }} />
                </div>
                <button onClick={() => setState((s) => restockIrrigant(s, i.id, 200))}>
                  补液 +200ml
                </button>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="panel records">
        <div className="section-heading">
          <div>
            <p>治疗台账</p>
            <h2>按牙位的治疗记录</h2>
          </div>
          <div className="chips filter-chips">
            {(["all", "draft", "active", "completed", "cancelled"] as const).map((f) => (
              <button
                key={f}
                className={filter === f ? "active" : ""}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "全部" : treatmentStatusLabel[f]}
              </button>
            ))}
          </div>
        </div>
        <div className="treatment-list">
          {visibleTreatments.length === 0 && <p className="hint">当前筛选下暂无治疗记录。</p>}
          {visibleTreatments.map((t) => (
            <TreatmentCard
              key={t.id}
              treatment={t}
              batch={state.batches.find((b) => b.id === t.batchId)}
              irrigant={state.irrigants.find((i) => i.id === t.irrigantId)}
              onConfirm={() => setState((s) => confirmTreatment(s, t.id))}
              onFinish={(usedMl) => setState((s) => finishTreatment(s, t.id, usedMl))}
              onCancel={() => setState((s) => cancelTreatment(s, t.id))}
            />
          ))}
        </div>
      </section>

      <section className="workspace bottom">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>拦截与异常</p>
              <h2>异常记录</h2>
            </div>
          </div>
          <div className="exception-list">
            {state.exceptions.length === 0 && (
              <p className="hint">暂无异常。批次未放行或库存不足导致确认被拒时会在此列出。</p>
            )}
            {state.exceptions.map((ex) => (
              <article key={ex.id} className="exception-card">
                <div className="exception-head">
                  <strong>{ex.tooth}</strong>
                  <span>{ex.time}</span>
                </div>
                <dl>
                  <div>
                    <dt>批次</dt>
                    <dd>{ex.batchId}</dd>
                  </div>
                  <div>
                    <dt>缺口数量</dt>
                    <dd>{ex.shortage}</dd>
                  </div>
                  <div>
                    <dt>触发条件</dt>
                    <dd>{ex.trigger}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>审计</p>
              <h2>操作记录</h2>
            </div>
          </div>
          <div className="ledger-list">
            {state.ledger.map((entry) => (
              <div key={entry.id} className="ledger-item">
                <i className={`dot ${entry.kind}`} />
                <div>
                  <p>
                    <strong>{entry.tooth}</strong> · {entry.action}
                    <span className="ledger-time">{entry.time}</span>
                  </p>
                  <p className="ledger-detail">{entry.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
