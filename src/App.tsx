import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  computeIssues,
  createTreatment,
  endTreatment,
  fmtTime,
  getIrrigant,
  getPack,
  restockIrrigant,
  setPackStatus,
  startTreatment,
  toothBusy,
  validateConfirm,
} from "./clinic";
import { loadState, saveState } from "./store";
import type { ClinicState, LogType, Treatment } from "./types";

const TEETH: string[] = [];
for (const q of [1, 2, 3, 4]) {
  for (let n = 1; n <= 8; n++) TEETH.push(`#${q}${n}`);
}

const TREATMENT_STATUS: Record<Treatment["status"], string> = {
  draft: "待确认",
  active: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

const LOG_LABELS: Record<LogType, string> = {
  create: "创建",
  start: "开始",
  complete: "完成",
  cancel: "取消",
  restock: "入库",
  release: "放行",
  quarantine: "待放行",
  blocked: "拦截",
};

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  const colors = ["status-ok", "status-watch", "status-danger"];
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={colors[index % colors.length]} />
    </article>
  );
}

function App() {
  const [state, setState] = useState<ClinicState>(loadState);

  // 新建治疗表单
  const [tooth, setTooth] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [packId, setPackId] = useState("");
  const [irrigantId, setIrrigantId] = useState("");
  const [mlText, setMlText] = useState("50");
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // 完成治疗时登记实际用量
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [usedMlText, setUsedMlText] = useState("");

  // 冲洗液入库
  const [restockText, setRestockText] = useState<Record<string, string>>({});

  useEffect(() => {
    saveState(state);
  }, [state]);

  const irrigantMl = Number(mlText);
  const issues = useMemo(
    () => computeIssues(state, { tooth, packId, irrigantId, irrigantMl }),
    [state, tooth, packId, irrigantId, irrigantMl]
  );

  const activeCount = state.treatments.filter((t) => t.status === "active").length;
  const draftCount = state.treatments.filter((t) => t.status === "draft").length;
  const releasedCount = state.packs.filter((p) => p.status === "released").length;
  const totalStock = state.irrigants.reduce((sum, i) => sum + i.stockMl, 0);

  const metrics: Array<[string, string]> = [
    ["进行中治疗", String(activeCount)],
    ["待确认治疗", String(draftCount)],
    ["已放行批次", `${releasedCount} / ${state.packs.length}`],
    ["冲洗液库存", `${totalStock} mL`],
    ["当前异常", String(issues.length)],
  ];

  function handleCreate() {
    const errors = validateConfirm(state, { tooth, packId, irrigantId, irrigantMl });
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors([]);
    setState((s) => createTreatment(s, { tooth, diagnosis, packId, irrigantId, irrigantMl }));
    setTooth("");
    setDiagnosis("");
  }

  function handleStart(id: string) {
    setState((s) => startTreatment(s, id));
  }

  function handleCancel(t: Treatment) {
    if (t.status === "active") {
      const ok = window.confirm(
        `确认取消牙位 ${t.tooth} 的进行中治疗？将释放批次器械并归还全部冲洗液。`
      );
      if (!ok) return;
    }
    setState((s) => endTreatment(s, t.id, "cancelled"));
  }

  function handleComplete(id: string) {
    const used = Math.max(0, Number(usedMlText) || 0);
    setState((s) => endTreatment(s, id, "completed", used));
    setCompletingId(null);
    setUsedMlText("");
  }

  function handleRestock(id: string) {
    const ml = Number(restockText[id]);
    if (!Number.isFinite(ml) || ml <= 0) return;
    setState((s) => restockIrrigant(s, id, ml));
    setRestockText((r) => ({ ...r, [id]: "" }));
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-04 · port 5104</p>
          <h1>根管治疗 · 器械消毒与冲洗台账</h1>
          <p className="subtitle">
            按牙位创建治疗并绑定器械包批次与冲洗液用量；批次未放行或冲洗液超库存时无法确认，
            开始即锁定批次，取消或结束自动释放未用器械并归还剩余冲洗液。
          </p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>React + Vite + TypeScript + CSS</strong>
          <span>数据持久化于浏览器 localStorage，重开页面后治疗、批次、库存与操作记录保持对应。</span>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map(([label, value], index) => (
          <MetricCard key={label} label={label} value={value} index={index} />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>新建治疗</h2>
          <div className="form-stack">
            <label>
              <span>牙位</span>
              <select value={tooth} onChange={(e) => setTooth(e.target.value)}>
                <option value="">选择牙位</option>
                {TEETH.map((t) => (
                  <option key={t} value={t} disabled={toothBusy(state, t)}>
                    {t}
                    {toothBusy(state, t) ? "（治疗中）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>诊断</span>
              <input
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="如：慢性根尖周炎"
              />
            </label>
            <label>
              <span>器械包（批次）</span>
              <select value={packId} onChange={(e) => setPackId(e.target.value)}>
                <option value="">选择器械包</option>
                {state.packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.batchNo} · {p.status === "released" ? "已放行" : "待放行"} · 余
                    {p.available}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>冲洗液</span>
              <select value={irrigantId} onChange={(e) => setIrrigantId(e.target.value)}>
                <option value="">选择冲洗液</option>
                {state.irrigants.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · 库存 {i.stockMl} mL
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>冲洗液用量（mL）</span>
              <input
                type="number"
                min={1}
                value={mlText}
                onChange={(e) => setMlText(e.target.value)}
              />
            </label>
            {formErrors.length > 0 && (
              <ul className="form-errors">
                {formErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <button className="primary-action" onClick={handleCreate}>
              创建治疗
            </button>
            <p className="hint">创建后进入“待确认”，确认开始时才锁定批次并预扣冲洗液。</p>
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>牙体牙髓</p>
              <h2>治疗台账</h2>
            </div>
          </div>
          <div className="record-list">
            {state.treatments.length === 0 && (
              <p className="empty">暂无治疗记录，请在左侧创建。</p>
            )}
            {state.treatments.map((t) => {
              const pack = getPack(state, t.packId);
              const irrigant = getIrrigant(state, t.irrigantId);
              return (
                <article key={t.id} className={`record-card treatment-${t.status}`}>
                  <div className="record-index">{String(t.seq).padStart(2, "0")}</div>
                  <div className="treatment-body">
                    <div className="treatment-head">
                      <h3>
                        {t.tooth}
                        {t.diagnosis ? ` · ${t.diagnosis}` : ""}
                      </h3>
                      <span className={`tag tag-${t.status}`}>{TREATMENT_STATUS[t.status]}</span>
                    </div>
                    <p>
                      器械包：{pack?.name ?? "已删除"}（批次 {pack?.batchNo ?? "?"}） · 冲洗液：
                      {irrigant?.name ?? "已删除"} {t.irrigantMl} mL
                    </p>
                    <p className="treatment-times">
                      创建 {fmtTime(t.createdAt)}
                      {t.startedAt ? ` · 开始 ${fmtTime(t.startedAt)}` : ""}
                      {t.endedAt ? ` · 结束 ${fmtTime(t.endedAt)}` : ""}
                    </p>
                    <div className="treatment-actions">
                      {t.status === "draft" && (
                        <>
                          <button className="primary-action" onClick={() => handleStart(t.id)}>
                            确认开始
                          </button>
                          <button onClick={() => handleCancel(t)}>取消</button>
                        </>
                      )}
                      {t.status === "active" && completingId !== t.id && (
                        <>
                          <button
                            className="primary-action"
                            onClick={() => {
                              setCompletingId(t.id);
                              setUsedMlText(String(t.irrigantMl));
                            }}
                          >
                            完成
                          </button>
                          <button onClick={() => handleCancel(t)}>取消治疗</button>
                        </>
                      )}
                      {t.status === "active" && completingId === t.id && (
                        <span className="complete-inline">
                          <input
                            type="number"
                            min={0}
                            max={t.irrigantMl}
                            value={usedMlText}
                            onChange={(e) => setUsedMlText(e.target.value)}
                          />
                          <span>mL 实际使用，剩余归还库存</span>
                          <button className="primary-action" onClick={() => handleComplete(t.id)}>
                            确认完成
                          </button>
                          <button onClick={() => setCompletingId(null)}>返回</button>
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <section className="workspace">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>消毒供应</p>
              <h2>器械包批次</h2>
            </div>
          </div>
          <div className="record-list">
            {state.packs.map((p) => (
              <article key={p.id} className="record-card">
                <div className={`record-index ${p.status === "released" ? "" : "index-muted"}`}>
                  {p.available}/{p.total}
                </div>
                <div className="treatment-body">
                  <div className="treatment-head">
                    <h3>{p.name}</h3>
                    <span className={`tag ${p.status === "released" ? "tag-active" : "tag-draft"}`}>
                      {p.status === "released" ? "已放行" : "待放行"}
                    </span>
                  </div>
                  <p>
                    批次 {p.batchNo} · 灭菌 {p.sterilizedAt} · 失效 {p.expiresAt} · 可用{" "}
                    {p.available} / {p.total} 套
                  </p>
                  <div className="treatment-actions">
                    {p.status === "released" ? (
                      <button onClick={() => setState((s) => setPackStatus(s, p.id, "quarantined"))}>
                        退回待放行
                      </button>
                    ) : (
                      <button
                        className="primary-action"
                        onClick={() => setState((s) => setPackStatus(s, p.id, "released"))}
                      >
                        放行批次
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>冲洗液</p>
              <h2>库存台账</h2>
            </div>
          </div>
          <div className="record-list">
            {state.irrigants.map((i) => (
              <article key={i.id} className="record-card">
                <div className="record-index index-accent">{i.concentration}</div>
                <div className="treatment-body">
                  <div className="treatment-head">
                    <h3>{i.name}</h3>
                    <span className="tag tag-stock">
                      {i.stockMl} / {i.capacityMl} mL
                    </span>
                  </div>
                  <div className="stock-bar">
                    <i style={{ width: `${Math.min(100, (i.stockMl / i.capacityMl) * 100)}%` }} />
                  </div>
                  <div className="treatment-actions">
                    <input
                      className="restock-input"
                      type="number"
                      min={1}
                      placeholder="入库 mL"
                      value={restockText[i.id] ?? ""}
                      onChange={(e) =>
                        setRestockText((r) => ({ ...r, [i.id]: e.target.value }))
                      }
                    />
                    <button onClick={() => handleRestock(i.id)}>补充库存</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>拦截与缺口</p>
            <h2>异常清单</h2>
          </div>
        </div>
        {issues.length === 0 ? (
          <p className="empty">当前无异常：所有待确认治疗与表单选择均满足放行与库存条件。</p>
        ) : (
          <div className="issue-table">
            <div className="issue-row issue-head">
              <span>牙位</span>
              <span>批次</span>
              <span>缺口数量</span>
              <span>触发条件</span>
            </div>
            {issues.map((issue) => (
              <div key={issue.key} className="issue-row">
                <span>{issue.tooth}</span>
                <span>{issue.batchNo}</span>
                <span>
                  {issue.packGap > 0 && `器械包缺 ${issue.packGap} 套`}
                  {issue.packGap > 0 && issue.irrigantGapMl > 0 && "；"}
                  {issue.irrigantGapMl > 0 && `冲洗液缺 ${issue.irrigantGapMl} mL`}
                  {issue.packGap === 0 && issue.irrigantGapMl === 0 && "—"}
                </span>
                <span>{issue.triggers.join("；")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>审计</p>
            <h2>操作记录</h2>
          </div>
        </div>
        <div className="record-list">
          {state.logs.length === 0 && <p className="empty">暂无操作记录。</p>}
          {state.logs.map((log) => (
            <article key={log.id} className="log-row">
              <span className={`tag tag-log-${log.type}`}>{LOG_LABELS[log.type]}</span>
              <p>{log.message}</p>
              <time>{fmtTime(log.at)}</time>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
