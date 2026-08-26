import { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

/* ────────────────────────────────────────────────────────────────
   Passbook — money, time deposits, P&L, and what to do next.
   HKD + USD deposits, a maturity ladder, and a rules-based coach.
   ──────────────────────────────────────────────────────────────── */

const KEY = "passbook:v2";

const C = {
  paper: "#EAEFE9", card: "#FBFCFA", ink: "#15241E", ink2: "#4A6058",
  rule: "#CBD6CD", jade: "#0F7A5A", jadeSoft: "#DCEAE2", gold: "#9A7318",
  goldSoft: "#F1E7CC", red: "#A5202C", redSoft: "#F5DEDE", blue: "#27556E",
};
const BANKC = [C.jade, C.blue, C.gold, "#6B4E8A", "#8A5A3C"];
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/* ── helpers ─────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 9);
const n = (v) => (Number.isFinite(+v) ? +v : 0);
const money = (v, dp = 0) =>
  n(v).toLocaleString("en-HK", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const DAY = 86400000;
const startOfDay = (d) => new Date(new Date(d).toDateString());
const todayISO = () => new Date().toISOString().slice(0, 10);
const addMonths = (isoStr, m) => {
  const d = new Date(isoStr); const day = d.getDate();
  d.setMonth(d.getMonth() + m); if (d.getDate() < day) d.setDate(0);
  return d;
};
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fmtShort = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const monthKey = (d) => String(d).slice(0, 7);
const monthLabel = (k) => new Date(k + "-01").toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const CCYS = ["HKD", "USD", "CNY"];
const toHKD = (amt, ccy, rates) => n(amt) * (ccy === "HKD" ? 1 : n(rates?.[ccy]) || 1);
const ccySign = (c) => (c === "USD" ? "US$" : c === "CNY" ? "¥" : "HK$");

/* ── seed ────────────────────────────────────────────────────── */
const D = (bank, ccy, product, principal, rate, termMonths, startedDaysAgo, autoRenew, note) => ({
  id: uid(), bank, ccy, product, principal, rate, termMonths,
  start: iso(new Date(Date.now() - startedDaysAgo * DAY)), autoRenew, note, closed: false,
});

const SEED = {
  v: 3,
  settings: { rates: { USD: 7.8, CNY: 1.09 }, inflation: 2.5, investReturn: 6.5, emergencyMonths: 6 },
  portfolio: { value: 0, monthly: 0, note: "" },
  snapshots: [],
  income: [{ id: uid(), source: "Monthly salary", amount: 18000 }],
  budget: [
    { id: uid(), name: "Catering", group: "Living", amount: 3500, note: "≈ HK$116 a day" },
    { id: uid(), name: "Rent", group: "Living", amount: 4200, note: "Basic rent" },
    { id: uid(), name: "Subscriptions", group: "Living", amount: 200, note: "iCloud, Apple Music" },
    { id: uid(), name: "Utilities", group: "Living", amount: 100, note: "Included in rent" },
    { id: uid(), name: "Girlfriend", group: "People & learning", amount: 1800, note: "Monthly" },
    { id: uid(), name: "Social dining & transport", group: "People & learning", amount: 1200, note: "" },
    { id: uid(), name: "Books", group: "People & learning", amount: 300, note: "" },
    { id: uid(), name: "Courses", group: "People & learning", amount: 400, note: "" },
    { id: uid(), name: "Shenzhen trips", group: "People & learning", amount: 0, note: "Set a monthly cap in HKD" },
    { id: uid(), name: "General savings", group: "Savings", amount: 4500, note: "Mox time deposit" },
    { id: uid(), name: "Travel savings", group: "Savings", amount: 1800, note: "Hang Seng" },
  ],
  tx: [
    { id: uid(), date: "2025-07-01", name: "Living cost", kind: "expense", amount: 4500, note: "" },
    { id: uid(), date: "2025-07-07", name: "General savings", kind: "saving", amount: 4500, note: "" },
    { id: uid(), date: "2025-07-07", name: "Travel savings", kind: "saving", amount: 1800, note: "" },
    { id: uid(), date: "2025-07-07", name: "Master fee", kind: "expense", amount: 1800, note: "" },
    { id: uid(), date: "2025-07-14", name: "Driving licence", kind: "expense", amount: 510, note: "" },
    { id: uid(), date: "2025-09-01", name: "Driving lesson", kind: "expense", amount: 550, note: "" },
  ],
  deposits: [
    D("Mox", "HKD", "3-month", 3000, 3.2, 3, 96, false, "Ladder rung 1"),
    D("Mox", "HKD", "3-month", 3000, 3.1, 3, 70, false, "Ladder rung 2"),
    D("Mox", "HKD", "3-month", 3000, 3.05, 3, 60, false, "Ladder rung 3"),
    D("Mox", "HKD", "3-month", 3000, 3.0, 3, 45, false, "Ladder rung 4"),
    D("Mox", "HKD", "6-month", 3000, 2.95, 6, 150, false, ""),
    D("Mox", "USD", "3-month", 400, 3.8, 3, 50, false, ""),
    D("Mox", "USD", "6-month", 400, 3.75, 6, 120, false, ""),
    D("Mox", "HKD", "1-month", 2000, 2.9, 1, 20, true, ""),
    D("Mox", "HKD", "6-month", 2000, 3.0, 6, 30, false, ""),
    D("Mox", "HKD", "12-month", 4000, 3.1, 12, 200, false, ""),
    D("Hang Seng", "HKD", "6-month", 12000, 2.4, 6, 100, false, "Travel fund"),
    D("BOCHK", "USD", "3-month", 1000, 3.9, 3, 30, false, "New fund rate"),
  ],
  goals: [
    { id: uid(), name: "Contingency fund", target: 48000, current: 30000, deadline: "2026-12-31", monthly: 4500 },
    { id: uid(), name: "Parents' phone", target: 8700, current: 0, deadline: "2026-11-10", monthly: 1000 },
    { id: uid(), name: "Driving licence", target: 10000, current: 0, deadline: "2027-01-01", monthly: 2000 },
  ],
};

/* ── storage ─────────────────────────────────────────────────── */
function migrate(s) {
  if (!s) return s;
  if (!s.settings.rates) s.settings.rates = { USD: n(s.settings.fx) || 7.8, CNY: 1.09 };
  if (!s.settings.rates.CNY) s.settings.rates.CNY = 1.09;
  if (!s.snapshots) s.snapshots = [];
  s.tx = (s.tx || []).map((t) => ({ ccy: "HKD", ...t }));
  s.v = 3;
  return s;
}
async function load() {
  try { const r = await window.storage.get(KEY); return r && r.value ? migrate(JSON.parse(r.value)) : null; }
  catch { return null; }
}
async function persist(state) {
  try { await window.storage.set(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

/* ── atoms ───────────────────────────────────────────────────── */
function Num({ value, size = 15, weight = 600, color = C.ink, prefix = "" }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: size, fontWeight: weight, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
      {prefix}{value}
    </span>
  );
}
function Eyebrow({ children, color = C.ink2 }) {
  return <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color, fontWeight: 700 }}>{children}</div>;
}
function Card({ children, accent = C.jade, className = "", pad = "p-4" }) {
  return <div className={`${pad} ${className}`} style={{ background: C.card, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${accent}`, borderRadius: 3 }}>{children}</div>;
}
function Chip({ children, tone = "jade" }) {
  const map = { jade: [C.jadeSoft, C.jade], gold: [C.goldSoft, C.gold], red: [C.redSoft, C.red], grey: ["#E4E9E4", C.ink2], blue: ["#DCE6EC", C.blue] };
  const [bg, fg] = map[tone] || map.grey;
  return <span style={{ background: bg, color: fg, fontSize: 10, fontWeight: 800, letterSpacing: ".06em", padding: "3px 6px", borderRadius: 2, textTransform: "uppercase", whiteSpace: "nowrap" }}>{children}</span>;
}
function TextIn({ value, onChange, placeholder, type = "text", right = false, w, step }) {
  return (
    <input type={type} step={step} value={value === 0 && type === "number" ? "" : value ?? ""} placeholder={placeholder}
      onChange={(e) => onChange(type === "number" ? (e.target.value === "" ? 0 : +e.target.value) : e.target.value)}
      className="pb-in"
      style={{ fontFamily: type === "number" ? MONO : "inherit", textAlign: right ? "right" : "left", width: w || "100%", fontVariantNumeric: "tabular-nums" }} />
  );
}
function Btn({ children, onClick, tone = "quiet", size = "md" }) {
  const s = {
    solid: { background: C.jade, color: "#fff", border: `1px solid ${C.jade}` },
    quiet: { background: "transparent", color: C.ink, border: `1px solid ${C.rule}` },
    danger: { background: "transparent", color: C.red, border: `1px solid ${C.redSoft}` },
    gold: { background: C.gold, color: "#fff", border: `1px solid ${C.gold}` },
  }[tone];
  return <button onClick={onClick} className="pb-btn" style={{ ...s, fontSize: size === "sm" ? 11.5 : 13, padding: size === "sm" ? "5px 9px" : "8px 13px" }}>{children}</button>;
}
function Bar2({ pct, color = C.jade, h = 6 }) {
  return (
    <div style={{ background: "#DFE6DF", height: h, borderRadius: 1, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: color, transition: "width .5s ease" }} />
    </div>
  );
}
function Lbl({ t, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C.ink2, fontWeight: 700 }}>{t}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/* ── deposit maths ───────────────────────────────────────────── */
function depInfo(d, rates) {
  const mat = addMonths(d.start, n(d.termMonths));
  const termDays = Math.max(1, daysBetween(d.start, mat));
  const elapsed = Math.max(0, daysBetween(d.start, new Date()));
  const left = daysBetween(new Date(), mat);
  const interest = n(d.principal) * (n(d.rate) / 100) * (termDays / 365);
  return {
    maturity: mat, maturityISO: iso(mat), termDays, left,
    pct: Math.max(0, Math.min(100, (elapsed / termDays) * 100)),
    interest, atMaturity: n(d.principal) + interest,
    hkd: toHKD(d.principal, d.ccy, rates), hkdInterest: toHKD(interest, d.ccy, rates),
    status: left <= 0 ? "matured" : left <= 14 ? "due" : "running",
  };
}

/* ════════════════════════════════════════════════════════════ */
export default function Passbook() {
  const [st, setSt] = useState(null);
  const [tab, setTab] = useState("overview");
  const [flash, setFlash] = useState("");
  const first = useRef(true);

  useEffect(() => { (async () => setSt((await load()) || SEED))(); }, []);
  useEffect(() => {
    if (!st) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      const ok = await persist(st);
      setFlash(ok ? "Saved" : "Not saved — storage unavailable");
      setTimeout(() => setFlash(""), 1400);
    }, 500);
    return () => clearTimeout(t);
  }, [st]);

  const up = (fn) => setSt((s) => { const c = structuredClone(s); fn(c); return c; });

  const d = useMemo(() => {
    if (!st) return null;
    const rates = st.settings.rates || { USD: 7.8, CNY: 1.09 };
    const income = st.income.reduce((a, b) => a + n(b.amount), 0);
    const plannedExp = st.budget.filter((b) => b.group !== "Savings").reduce((a, b) => a + n(b.amount), 0);
    const plannedSave = st.budget.filter((b) => b.group === "Savings").reduce((a, b) => a + n(b.amount), 0);
    const essentials = st.budget.filter((b) => b.group === "Living").reduce((a, b) => a + n(b.amount), 0);
    const months = [...new Set(st.tx.map((t) => monthKey(t.date)))].sort().reverse();
    const goalTarget = st.goals.reduce((a, g) => a + n(g.target), 0);
    const goalNow = st.goals.reduce((a, g) => a + n(g.current), 0);

    const live = st.deposits.filter((x) => !x.closed).map((x) => ({ ...x, i: depInfo(x, rates) }))
      .sort((a, b) => a.i.left - b.i.left);
    const depHKD = live.reduce((a, x) => a + x.i.hkd, 0);
    const usdHKD = live.filter((x) => x.ccy === "USD").reduce((a, x) => a + x.i.hkd, 0);
    const blended = depHKD ? live.reduce((a, x) => a + x.i.hkd * n(x.rate), 0) / depHKD : 0;
    const idle = live.filter((x) => x.i.left <= 0 && !x.autoRenew).reduce((a, x) => a + x.i.hkd, 0);
    const nextManual = live.find((x) => !x.autoRenew) || null;
    const due30 = live.filter((x) => x.i.left > 0 && x.i.left <= 30).reduce((a, x) => a + x.i.hkd, 0);
    const banks = [...new Set(live.map((x) => x.bank || "—"))];
    const perBank = banks.map((b) => ({ bank: b, hkd: live.filter((x) => (x.bank || "—") === b).reduce((a, x) => a + x.i.hkd, 0) }))
      .sort((a, b) => b.hkd - a.hkd);

    const savByMonth = {};
    st.tx.forEach((t) => { if (t.kind === "saving") savByMonth[monthKey(t.date)] = (savByMonth[monthKey(t.date)] || 0) + toHKD(t.amount, t.ccy || "HKD", rates); });
    const sm = Object.values(savByMonth);
    const avgSave = sm.length ? sm.reduce((a, b) => a + b, 0) / sm.length : 0;

    const netWorth = depHKD + n(st.portfolio.value);
    const emergencyTarget = plannedExp * n(st.settings.emergencyMonths);
    const cover = plannedExp ? depHKD / plannedExp : 0;

    return {
      fx, income, plannedExp, plannedSave, essentials, surplus: income - plannedExp - plannedSave,
      months, goalTarget, goalNow, live, depHKD, usdHKD, blended, idle, nextManual, due30,
      perBank, banks, avgSave, netWorth, emergencyTarget, cover,
    };
  }, [st]);

  if (!st || !d) return <div style={{ padding: 40, fontFamily: MONO, color: C.ink2, background: C.paper }}>Opening passbook…</div>;

  const TABS = [["overview", "Overview"], ["grow", "Grow"], ["deposits", "Deposits"], ["month", "Month"], ["budget", "Plan"], ["goals", "Goals"]];

  return (
    <div className="pb-root" style={{ background: C.paper, color: C.ink, minHeight: "100vh" }}>
      <style>{`
        .pb-root *{box-sizing:border-box}
        .pb-root{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
        .pb-in{background:#fff;border:1px solid ${C.rule};border-radius:2px;padding:7px 8px;font-size:13.5px;color:${C.ink};outline:none;min-width:0}
        .pb-in:focus{border-color:${C.jade};box-shadow:0 0 0 2px ${C.jadeSoft}}
        .pb-btn{border-radius:2px;font-weight:700;letter-spacing:.02em;cursor:pointer;transition:opacity .15s}
        .pb-btn:hover{opacity:.82}
        .pb-btn:focus-visible,.pb-tab:focus-visible{outline:2px solid ${C.jade};outline-offset:2px}
        .pb-row{border-bottom:1px solid ${C.rule}}
        .pb-scroll::-webkit-scrollbar{height:6px}
        .pb-scroll::-webkit-scrollbar-thumb{background:${C.rule};border-radius:3px}
        @media (prefers-reduced-motion:reduce){.pb-root *{transition:none!important}}
      `}</style>

      <header style={{ background: C.ink, color: "#EAEFE9", padding: "16px 16px 0" }}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>Passbook</div>
            <div style={{ fontSize: 11, color: "#8CA79B", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700 }}>Money · Deposits · P&amp;L · Growth</div>
          </div>
          <div className="text-right">
            <Num value={money(d.netWorth)} prefix="HK$" size={19} weight={800} color="#7FD8AE" />
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: flash ? "#7FD8AE" : "#67827A" }}>{flash || "net worth"}</div>
          </div>
        </div>
        <nav className="flex gap-1 mt-4 pb-scroll" style={{ overflowX: "auto" }}>
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className="pb-tab"
              style={{ background: tab === k ? C.paper : "transparent", color: tab === k ? C.ink : "#9FB6AC", border: "none", borderRadius: "3px 3px 0 0", padding: "9px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="p-4 space-y-4" style={{ maxWidth: 780, margin: "0 auto" }}>
        {tab === "overview" && <Overview st={st} d={d} go={setTab} />}
        {tab === "grow" && <Grow st={st} d={d} up={up} />}
        {tab === "deposits" && <Deposits st={st} d={d} up={up} />}
        {tab === "month" && <Month st={st} d={d} up={up} />}
        {tab === "budget" && <Plan st={st} d={d} up={up} />}
        {tab === "goals" && <Goals st={st} d={d} up={up} />}

        <div className="flex items-center justify-between pt-2 gap-3" style={{ borderTop: `1px solid ${C.rule}` }}>
          <span style={{ fontSize: 11, color: C.ink2 }}>Saved on this device only. Rules of thumb, not licensed advice.</span>
          <Btn size="sm" tone="danger" onClick={() => { if (confirm("Reset every figure back to the starting sheet?")) setSt(structuredClone(SEED)); }}>Reset</Btn>
        </div>
      </main>
    </div>
  );
}

/* ── OVERVIEW ────────────────────────────────────────────────── */
function Stat({ label, v, accent, sub, prefix = "HK$" }) {
  return (
    <Card accent={accent} pad="p-3">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1"><Num value={money(v)} prefix={prefix} size={18} weight={800} color={accent === C.ink2 ? C.ink : accent} /></div>
      {sub && <div style={{ fontSize: 11, color: C.ink2, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function Overview({ st, d, go }) {
  const nm = d.nextManual;
  const traj = useMemo(() => {
    const rows = [];
    for (let i = 0; i <= 24; i++) {
      rows.push({
        m: addMonths(todayISO(), i).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        Planned: Math.round(d.goalNow + d.plannedSave * i),
        Actual: d.avgSave ? Math.round(d.goalNow + d.avgSave * i) : null,
      });
    }
    return rows;
  }, [d]);
  const hit = d.plannedSave > 0 ? addMonths(todayISO(), Math.ceil(Math.max(0, d.goalTarget - d.goalNow) / d.plannedSave)) : null;

  return (
    <div className="space-y-4">
      {nm && (
        <Card accent={nm.i.status === "running" ? C.gold : C.red}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Eyebrow color={nm.i.status === "running" ? C.gold : C.red}>Next manual re-deposit</Eyebrow>
              <div className="mt-1" style={{ fontSize: 16, fontWeight: 800 }}>{nm.bank} · {nm.product} · {nm.ccy}</div>
              <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 2 }}>
                {fmtDate(nm.i.maturity)} · {ccySign(nm.ccy)}{money(nm.i.atMaturity, 2)} comes back
              </div>
            </div>
            <div className="text-right">
              <Num value={Math.abs(nm.i.left)} size={30} weight={800} color={nm.i.left <= 0 ? C.red : C.gold} />
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.ink2 }}>{nm.i.left <= 0 ? "days idle" : "days left"}</div>
            </div>
          </div>
          <div className="mt-3"><Bar2 pct={nm.i.pct} color={nm.i.left <= 0 ? C.red : C.gold} h={7} /></div>
          {d.idle > 0 && (
            <div className="mt-3" style={{ fontSize: 12.5, color: C.red, fontWeight: 700 }}>
              HK${money(d.idle)} has matured and is earning close to nothing. Place it again today.
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="On deposit" v={d.depHKD} accent={C.jade} sub={`${d.live.length} live · ${d.banks.length} banks`} />
        <Stat label="Blended yield" v={d.blended.toFixed(2)} prefix="" accent={C.gold} sub="% a year, weighted" />
        <Stat label="Invested" v={st.portfolio.value} accent={n(st.portfolio.value) ? C.blue : C.red} sub={n(st.portfolio.value) ? "market value" : "nothing compounding yet"} />
        <Stat label="Kept per month" v={d.plannedSave} accent={C.jade} sub={`${d.income ? ((d.plannedSave / d.income) * 100).toFixed(0) : 0}% of income`} />
      </div>

      <Card>
        <div className="flex justify-between items-baseline">
          <Eyebrow>Goal funding</Eyebrow>
          <span style={{ fontSize: 11, color: C.ink2 }}>HK${money(d.goalNow)} of HK${money(d.goalTarget)}</span>
        </div>
        <div className="mt-2"><Bar2 pct={d.goalTarget ? (d.goalNow / d.goalTarget) * 100 : 0} h={8} /></div>
        <div className="mt-3" style={{ fontSize: 12.5, color: C.ink2 }}>
          {hit ? <>At HK${money(d.plannedSave)} a month every goal is covered by <b style={{ color: C.ink }}>{fmtDate(hit)}</b>.</> : "Set a monthly savings amount on the Plan tab."}
        </div>
      </Card>

      <Card accent={C.gold}>
        <Eyebrow>Savings line</Eyebrow>
        <div style={{ fontSize: 11.5, color: C.ink2, margin: "2px 0 8px" }}>
          Goal progress carried forward 24 months.{d.avgSave ? " Dashed line is your actual pace from the ledger." : ""}
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={traj} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} interval={3} tickLine={false} axisLine={{ stroke: C.rule }} />
              <YAxis tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 12, fontFamily: MONO }} formatter={(v) => "HK$" + money(v)} />
              <ReferenceLine y={d.goalTarget} stroke={C.red} strokeDasharray="5 4" label={{ value: "goal total", position: "insideTopRight", fontSize: 10, fill: C.red }} />
              <Line type="monotone" dataKey="Planned" stroke={C.jade} strokeWidth={2.5} dot={false} />
              {d.avgSave > 0 && <Line type="monotone" dataKey="Actual" stroke={C.gold} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Btn tone="solid" onClick={() => go("grow")}>What to do next</Btn>
        <Btn onClick={() => go("deposits")}>Deposits</Btn>
        <Btn onClick={() => go("month")}>Log an entry</Btn>
      </div>
    </div>
  );
}

/* ── GROW: the coach ─────────────────────────────────────────── */
function Grow({ st, d, up }) {
  const s = st.settings;
  const invRate = n(s.investReturn);
  const monthlySave = d.plannedSave;
  const gapToEmergency = Math.max(0, d.emergencyTarget - d.depHKD);

  const rate = d.income ? (monthlySave / d.income) * 100 : 0;
  const usdPct = d.depHKD ? (d.usdHKD / d.depHKD) * 100 : 0;
  const biggestBank = d.perBank[0];

  const checks = [
    {
      t: "Savings rate", s: rate >= 30 ? "good" : rate >= 15 ? "watch" : "act", v: `${rate.toFixed(0)}%`,
      l: rate >= 30 ? "Well above the 20% most people manage. This is your real advantage — protect it before optimising anything else."
        : rate >= 15 ? "Respectable. Every extra point here beats any rate you can chase."
          : "Below 15%. Fix this before anything else on this page.",
    },
    {
      t: "Emergency cushion", s: d.cover >= 6 ? "good" : d.cover >= 3 ? "watch" : "act", v: `${d.cover.toFixed(1)} mo`,
      l: d.cover >= 6 ? "Fully stocked. New money can go to work instead of sitting in cash."
        : `Deposits cover ${d.cover.toFixed(1)} months of spending. Fill to ${s.emergencyMonths} months (HK$${money(d.emergencyTarget)}) before investing a dollar.`,
    },
    {
      t: "Idle money", s: d.idle > 0 ? "act" : "good", v: d.idle > 0 ? `HK$${money(d.idle)}` : "None",
      l: d.idle > 0 ? `Matured and not re-placed. At ${d.blended.toFixed(2)}% that is about HK$${money((d.idle * d.blended / 100) / 12, 0)} of interest lost for every month it sits.`
        : "Nothing matured and forgotten. Keep it that way — this is the one thing a 12-deposit ladder gets wrong.",
    },
    {
      t: "Blended yield", s: d.blended >= 3 ? "good" : d.blended >= 2.5 ? "watch" : "act", v: `${d.blended.toFixed(2)}%`,
      l: `Mid-August 2026 in HK: 3-month HKD sits near 2.4% at the note-issuing banks and closer to 2.8–2.9% at the sharper ones, with virtual banks around 3%. USD terms pay more. After ${s.inflation}% inflation your real return is ${(d.blended - n(s.inflation)).toFixed(2)}%.`,
    },
    {
      t: "Currency mix", s: "good", v: `${usdPct.toFixed(0)}% USD`,
      l: "The HKD is pegged in a 7.75–7.85 band, so USD deposits carry little FX risk for you. But the conversion spread eats much of the extra yield on small sums — only switch currency for 6-month terms or longer, and don't convert back and forth.",
    },
    {
      t: "Per-bank exposure", s: biggestBank && biggestBank.hkd > 800000 ? "act" : "good",
      v: biggestBank ? `HK$${money(biggestBank.hkd)}` : "—",
      l: `Deposit protection covers HK$800,000 per depositor per bank, HKD or foreign currency, on time deposits up to five years. Your largest is ${biggestBank ? biggestBank.bank : "—"} — comfortably inside. Structured or currency-linked deposits are not covered, so avoid them.`,
    },
    {
      t: "Money that compounds", s: n(st.portfolio.value) > 0 ? "good" : "act",
      v: d.netWorth ? `${((n(st.portfolio.value) / d.netWorth) * 100).toFixed(0)}%` : "0%",
      l: n(st.portfolio.value) > 0 ? "Some of your money is growing rather than just earning. Keep the monthly buying automatic and ignore the price."
        : "Everything sits in cash. Deposits protect money; they don't grow it. Once the cushion is full, this is the single biggest change available to you.",
    },
  ];

  const topSpend = st.budget.filter((b) => b.group !== "Savings").sort((a, b) => n(b.amount) - n(a.amount))[0];
  const levers = [
    { t: "Get a 10% pay rise, or change job", v: d.income * 12 * 0.1, how: "One conversation or one move. Nothing else here comes close, and it repeats every year after." },
    { t: "Invest new savings instead of depositing", v: monthlySave * 12 * ((invRate - d.blended) / 100), how: `HK$${money(monthlySave)} a month at ${invRate}% rather than ${d.blended.toFixed(2)}% — first-year gap only, and it compounds from there.` },
    { t: `Trim ${topSpend ? topSpend.name.toLowerCase() : "your biggest line"} by 15%`, v: topSpend ? n(topSpend.amount) * 12 * 0.15 : 0, how: "Permanent, repeats every year, needs no market to cooperate." },
    { t: "Move every deposit to the best rate (+0.6%)", v: d.depHKD * 0.006, how: "Worth doing at renewal — but notice how small it is next to the lines above." },
    { t: "Never leave matured money idle", v: (d.depHKD * d.blended / 100) / 365 * 14, how: "Two weeks of drift per rollover, added up across a year of maturities." },
  ].sort((a, b) => b.v - a.v);
  const maxLever = Math.max(...levers.map((x) => x.v), 1);

  const proj = useMemo(() => {
    const years = 20, rA = d.blended / 100 / 12, rB = invRate / 100 / 12;
    let a = d.depHKD, bDep = d.depHKD, bInv = n(st.portfolio.value), gap = gapToEmergency;
    const rows = [{ y: "now", Deposits: Math.round(a), Split: Math.round(bDep + bInv) }];
    for (let m = 1; m <= years * 12; m++) {
      a = a * (1 + rA) + monthlySave;
      bDep = bDep * (1 + rA); bInv = bInv * (1 + rB);
      if (gap > 0) { bDep += monthlySave; gap -= monthlySave; } else { bInv += monthlySave; }
      if (m % 12 === 0) rows.push({ y: `${m / 12}y`, Deposits: Math.round(a), Split: Math.round(bDep + bInv) });
    }
    return rows;
  }, [d.blended, d.depHKD, invRate, monthlySave, gapToEmergency, st.portfolio.value]);
  const last = proj[proj.length - 1];
  const gap20 = last.Split - last.Deposits;
  const real20 = gap20 / Math.pow(1 + n(s.inflation) / 100, 20);

  const steps = [
    { n: 1, t: "One month of spending stays liquid", amt: d.plannedExp, done: true,
      l: `HK$${money(d.plannedExp)} in the current account, never locked in a term. This is what stops a HK$550 driving lesson from breaking a deposit early and forfeiting the interest.` },
    { n: 2, t: `Cushion of ${s.emergencyMonths} months, laddered`, amt: d.emergencyTarget, done: gapToEmergency <= 0,
      l: gapToEmergency > 0 ? `HK$${money(gapToEmergency)} still to build. Keep using short Mox terms so a rung matures every month — term rates with near-instant access.`
        : "Full. Roll it, don't grow it. Everything beyond this goes to step 5." },
    { n: 3, t: "Clear anything costing more than about 6%", amt: null, done: true,
      l: "Card balances, instalment plans, tuition financing. Paying one off is a guaranteed return no deposit can match. Skip if you have none." },
    { n: 4, t: "Money needed within 3 years stays in deposits", amt: null, done: true,
      l: "Travel, parents' phone, the driving licence. Match the term to the date you need it — a 6-month deposit maturing the week before you pay, not the week after." },
    { n: 5, t: "Everything after that buys a global index fund, monthly", amt: monthlySave, done: n(st.portfolio.value) > 0,
      l: "Same day each month, same amount, no timing. Hong Kong charges no tax on capital gains or dividends, so a plain accumulating world tracker is about as simple as it gets. An Irish-domiciled UCITS fund faces 15% US dividend withholding instead of 30%, and keeps you clear of US estate-tax exposure on US-listed holdings." },
    { n: 6, t: "Then push income, not yield", amt: null, done: false,
      l: `At your balance +1% of yield is HK$${money(d.depHKD * 0.01)} a year. A 10% raise is HK$${money(d.income * 12 * 0.1)}. Spend your evenings on the second one — that's what the books and courses line is for.` },
  ];

  return (
    <div className="space-y-4">
      <Card accent={C.blue}>
        <div className="flex justify-between items-start gap-2">
          <div>
            <Eyebrow color={C.blue}>The order money should move</Eyebrow>
            <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 3 }}>Finish each step before starting the next. Most money mistakes are steps taken out of order.</div>
          </div>
          <Chip tone="blue">rule of thumb</Chip>
        </div>
        <ol className="mt-3 space-y-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {steps.map((x) => (
            <li key={x.n} className="flex gap-3">
              <div style={{ minWidth: 24, height: 24, borderRadius: 2, background: x.done ? C.jadeSoft : C.goldSoft, color: x.done ? C.jade : C.gold, fontFamily: MONO, fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{x.n}</div>
              <div style={{ flex: 1 }}>
                <div className="flex justify-between gap-2 items-baseline">
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{x.t}</span>
                  {x.amt != null && <Num value={money(x.amt)} prefix="HK$" size={12.5} color={C.ink2} />}
                </div>
                <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.5, marginTop: 2 }}>{x.l}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card accent={C.gold}>
        <Eyebrow color={C.gold}>What acceleration actually looks like</Eyebrow>
        <div style={{ fontSize: 12.5, color: C.ink2, margin: "3px 0 8px" }}>
          The same HK${money(monthlySave)} a month, two destinations: everything in deposits at your blended {d.blended.toFixed(2)}%, or cushion first and then a world index fund at {invRate}%.
        </div>
        <div style={{ height: 215 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={proj} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="y" tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} interval={1} tickLine={false} axisLine={{ stroke: C.rule }} />
              <YAxis tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 12, fontFamily: MONO }} formatter={(v) => "HK$" + money(v)} />
              <Line type="monotone" dataKey="Deposits" stroke={C.ink2} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Split" stroke={C.jade} strokeWidth={2.5} dot={false} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2" style={{ fontSize: 13, lineHeight: 1.55 }}>
          After 20 years the split path is ahead by <Num value={money(gap20)} prefix="HK$" size={15} weight={800} color={C.jade} /> — around HK${money(real20)} in today's money.
          <span style={{ color: C.ink2 }}> Markets don't pay {invRate}% in a straight line: a third of that can vanish for a couple of years and come back. That volatility is the price of the difference, which is exactly why the cushion comes first.</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Lbl t="Expected return %"><TextIn type="number" step="0.1" right value={s.investReturn} onChange={(v) => up((x) => { x.settings.investReturn = v; })} /></Lbl>
          <Lbl t="Inflation %"><TextIn type="number" step="0.1" right value={s.inflation} onChange={(v) => up((x) => { x.settings.inflation = v; })} /></Lbl>
          <Lbl t="Cushion months"><TextIn type="number" right value={s.emergencyMonths} onChange={(v) => up((x) => { x.settings.emergencyMonths = v; })} /></Lbl>
        </div>
      </Card>

      <Card>
        <Eyebrow>Biggest levers, by what each pays per year</Eyebrow>
        <div className="mt-3 space-y-3">
          {levers.map((x) => (
            <div key={x.t}>
              <div className="flex justify-between items-baseline gap-2">
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{x.t}</span>
                <Num value={money(Math.round(x.v))} prefix="HK$" size={13.5} weight={800} color={x.v >= maxLever * 0.5 ? C.jade : C.ink2} />
              </div>
              <div className="mt-1"><Bar2 pct={(x.v / maxLever) * 100} color={x.v >= maxLever * 0.5 ? C.jade : C.rule} h={5} /></div>
              <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 3 }}>{x.how}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card accent={C.blue}>
        <Eyebrow color={C.blue}>Portfolio</Eyebrow>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Lbl t="Market value HK$"><TextIn type="number" right value={st.portfolio.value} onChange={(v) => up((x) => { x.portfolio.value = v; })} /></Lbl>
          <Lbl t="Buying per month"><TextIn type="number" right value={st.portfolio.monthly} onChange={(v) => up((x) => { x.portfolio.monthly = v; })} /></Lbl>
        </div>
        <input className="pb-in mt-2" style={{ width: "100%", fontSize: 12 }} placeholder="What you hold, and where" value={st.portfolio.note || ""} onChange={(e) => up((x) => { x.portfolio.note = e.target.value; })} />
        <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 8, lineHeight: 1.5 }}>
          One broad, cheap, accumulating world fund is enough for a first portfolio; extra funds mostly add cost, not diversification. Two things to skip at your income: locking money into a tax-deductible MPF top-up or an annuity for the salaries-tax break — on roughly HK$216,000 a year you sit in the lowest band, so the deduction saves you very little while the lock-up is real; and any structured or currency-linked deposit, which is not covered by deposit protection.
        </div>
      </Card>

      <Card pad="p-0">
        <div className="p-3"><Eyebrow>Health check</Eyebrow></div>
        {checks.map((c) => {
          const tone = c.s === "good" ? C.jade : c.s === "watch" ? C.gold : C.red;
          return (
            <div key={c.t} className="p-3 pb-row" style={{ borderLeft: `3px solid ${tone}` }}>
              <div className="flex justify-between items-baseline gap-2">
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{c.t}</span>
                <Num value={c.v} size={13.5} weight={800} color={tone} />
              </div>
              <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 3, lineHeight: 1.5 }}>{c.l}</div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/* ── DEPOSITS ────────────────────────────────────────────────── */
function Deposits({ st, d, up }) {
  const [open, setOpen] = useState(null);
  const [bankFilter, setBankFilter] = useState("All");

  const ladder = useMemo(() => {
    const keys = d.banks.slice(0, 5);
    const rows = [];
    for (let i = 0; i < 12; i++) {
      const mk = monthKey(iso(addMonths(todayISO(), i)));
      const row = { m: new Date(mk + "-01").toLocaleDateString("en-GB", { month: "short" }) };
      keys.forEach((b) => { row[b] = 0; });
      d.live.forEach((x) => {
        if (monthKey(x.i.maturityISO) === mk && keys.includes(x.bank)) row[x.bank] += Math.round(x.i.hkd);
      });
      rows.push(row);
    }
    return { rows, keys };
  }, [d]);

  const shown = d.live.filter((x) => bankFilter === "All" || x.bank === bankFilter);
  const idx = (id) => st.deposits.findIndex((x) => x.id === id);

  const addDep = () => up((s) => {
    s.deposits.push({ id: uid(), bank: d.banks[0] || "Mox", ccy: "HKD", product: "3-month", principal: 0, rate: 0, termMonths: 3, start: todayISO(), autoRenew: false, note: "", closed: false });
  });
  const dup = (x) => up((s) => {
    const copy = { ...structuredClone(x), id: uid(), start: todayISO(), note: "" };
    delete copy.i;
    s.deposits.push(copy);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="On deposit" v={d.depHKD} accent={C.jade} sub={`${d.live.length} live · HKD equivalent`} />
        <Stat label="Maturing in 30 days" v={d.due30} accent={C.gold} sub="needs a decision" />
      </div>

      <Card accent={C.blue}>
        <div className="flex justify-between items-center gap-2">
          <Eyebrow color={C.blue}>Maturity ladder · next 12 months</Eyebrow>
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 11, color: C.ink2 }}>US$1 =</span>
            <TextIn type="number" step="0.01" right w={62} value={st.settings.fx} onChange={(v) => up((s) => { s.settings.fx = v; })} />
          </div>
        </div>
        <div className="mt-3" style={{ height: 190 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ladder.rows} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickLine={false} axisLine={{ stroke: C.rule }} />
              <YAxis tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 12, fontFamily: MONO }} formatter={(v) => "HK$" + money(v)} />
              {ladder.keys.map((b, i) => <Bar key={b} dataKey={b} stackId="a" fill={BANKC[i % BANKC.length]} />)}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>
          A flat ladder means money frees up every month without breaking a term. A tall single bar means a large sum lands on one day at one rate — when you renew that one, split it across two terms instead of matching it.
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap items-center">
        {["All", ...d.banks].map((b) => {
          const pb = d.perBank.find((p) => p.bank === b);
          return (
            <button key={b} onClick={() => setBankFilter(b)} className="pb-btn"
              style={{ background: bankFilter === b ? C.ink : "transparent", color: bankFilter === b ? "#fff" : C.ink, border: `1px solid ${bankFilter === b ? C.ink : C.rule}`, fontSize: 11.5, padding: "5px 10px" }}>
              {b}{pb && <span style={{ opacity: .65 }}> · {money(pb.hkd)}</span>}
            </button>
          );
        })}
      </div>

      <Card pad="p-0">
        {shown.map((x) => {
          const i = idx(x.id);
          const tone = x.i.status === "matured" ? C.red : x.i.status === "due" ? C.gold : C.jade;
          const isOpen = open === x.id;
          return (
            <div key={x.id} className="pb-row" style={{ borderLeft: `3px solid ${tone}` }}>
              <button onClick={() => setOpen(isOpen ? null : x.id)} className="pb-tab"
                style={{ width: "100%", background: "none", border: "none", padding: "10px 12px", textAlign: "left", cursor: "pointer" }}>
                <div className="flex justify-between items-baseline gap-2">
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{x.bank} <span style={{ color: C.ink2, fontWeight: 500 }}>{x.product}</span></span>
                  <Num value={`${ccySign(x.ccy)}${money(x.principal)}`} size={13.5} weight={800} />
                </div>
                <div className="flex justify-between items-center gap-2 mt-1">
                  <span style={{ fontSize: 11.5, color: C.ink2, fontFamily: MONO }}>
                    {n(x.rate).toFixed(2)}% · {fmtShort(x.i.maturity)}{x.ccy === "USD" ? ` · HK$${money(x.i.hkd)}` : ""}
                  </span>
                  <span className="flex gap-1 items-center">
                    {x.autoRenew && <Chip tone="grey">auto</Chip>}
                    <Chip tone={x.i.status === "matured" ? "red" : x.i.status === "due" ? "gold" : "jade"}>{x.i.left <= 0 ? "matured" : `${x.i.left}d`}</Chip>
                  </span>
                </div>
                <div className="mt-2"><Bar2 pct={x.i.pct} color={tone} h={4} /></div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Lbl t="Bank"><TextIn value={x.bank} onChange={(v) => up((s) => { s.deposits[i].bank = v; })} /></Lbl>
                    <Lbl t="Currency">
                      <select className="pb-in" style={{ width: "100%" }} value={x.ccy} onChange={(e) => up((s) => { s.deposits[i].ccy = e.target.value; })}>
                        <option value="HKD">HKD</option><option value="USD">USD</option>
                      </select>
                    </Lbl>
                    <Lbl t={`Principal ${x.ccy}`}><TextIn type="number" right value={x.principal} onChange={(v) => up((s) => { s.deposits[i].principal = v; })} /></Lbl>
                    <Lbl t="Rate % p.a."><TextIn type="number" step="0.01" right value={x.rate} onChange={(v) => up((s) => { s.deposits[i].rate = v; })} /></Lbl>
                    <Lbl t="Term (months)"><TextIn type="number" right value={x.termMonths} onChange={(v) => up((s) => { s.deposits[i].termMonths = v; })} /></Lbl>
                    <Lbl t="Placed on"><TextIn type="date" value={x.start} onChange={(v) => up((s) => { s.deposits[i].start = v; })} /></Lbl>
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 gap-2" style={{ borderTop: `1px solid ${C.rule}` }}>
                    <div>
                      <Eyebrow>Interest this term</Eyebrow>
                      <Num value={`${ccySign(x.ccy)}${money(x.i.interest, 2)}`} size={14} weight={800} color={C.gold} />
                      <span style={{ fontSize: 11.5, color: C.ink2, marginLeft: 6 }}>→ {ccySign(x.ccy)}{money(x.i.atMaturity, 2)}</span>
                    </div>
                    <label className="flex items-center gap-2" style={{ fontSize: 12, color: C.ink2, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!x.autoRenew} onChange={(e) => up((s) => { s.deposits[i].autoRenew = e.target.checked; })} />
                      Bank renews
                    </label>
                  </div>
                  <input className="pb-in mt-2" style={{ width: "100%", fontSize: 12 }} placeholder="Note" value={x.note || ""} onChange={(e) => up((s) => { s.deposits[i].note = e.target.value; })} />
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Btn size="sm" tone={x.i.status === "running" ? "quiet" : "gold"}
                      onClick={() => up((s) => { s.deposits[i].principal = Math.round((n(x.principal) + x.i.interest) * 100) / 100; s.deposits[i].start = x.i.maturityISO; })}>
                      Renew from {fmtShort(x.i.maturity)}
                    </Btn>
                    <Btn size="sm" onClick={() => dup(x)}>Duplicate</Btn>
                    <Btn size="sm" tone="danger" onClick={() => up((s) => { s.deposits[i].closed = true; })}>Close</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {shown.length === 0 && <div className="p-5 text-center" style={{ fontSize: 13, color: C.ink2 }}>No deposits here yet.</div>}
      </Card>

      <div className="flex gap-2"><Btn onClick={addDep}>+ Add a deposit</Btn></div>

      {st.deposits.some((x) => x.closed) && (
        <Card accent={C.rule}>
          <Eyebrow>Closed</Eyebrow>
          {st.deposits.map((x, i) => x.closed && (
            <div key={x.id} className="flex justify-between items-center mt-2 gap-2" style={{ fontSize: 13 }}>
              <span>{x.bank} · {ccySign(x.ccy)}{money(x.principal)}</span>
              <div className="flex gap-2">
                <Btn size="sm" onClick={() => up((s) => { s.deposits[i].closed = false; })}>Reopen</Btn>
                <Btn size="sm" tone="danger" onClick={() => up((s) => { s.deposits.splice(i, 1); })}>Delete</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.5 }}>
        Interest is simple interest — principal × rate × days ÷ 365 — which is how HK banks quote short fixed terms. USD lines convert at the rate you set above; the peg holds the market rate between 7.75 and 7.85.
      </div>
    </div>
  );
}

/* ── MONTH: ledger + P&L + allocation ────────────────────────── */
function Month({ st, d, up }) {
  const cur = monthKey(todayISO());
  const [m, setM] = useState(d.months.includes(cur) ? cur : d.months[0] || cur);
  const [f, setF] = useState({ date: todayISO(), name: "", kind: "expense", amount: 0, note: "" });

  const rows = st.tx.map((t, i) => ({ t, i })).filter((x) => monthKey(x.t.date) === m).sort((a, b) => a.t.date.localeCompare(b.t.date));
  const extraIn = rows.filter((x) => x.t.kind === "income").reduce((a, x) => a + n(x.t.amount), 0);
  const inflow = d.income + extraIn;
  let run = inflow;
  const withBal = rows.map((x) => { if (x.t.kind !== "income") run -= n(x.t.amount); return { ...x, bal: run }; });

  const actExp = rows.filter((x) => x.t.kind === "expense").reduce((a, x) => a + n(x.t.amount), 0);
  const actSav = rows.filter((x) => x.t.kind === "saving").reduce((a, x) => a + n(x.t.amount), 0);
  const net = inflow - actExp - actSav;

  const byName = {};
  rows.forEach((x) => { if (x.t.kind !== "income") { const k = x.t.name.trim().toLowerCase(); byName[k] = (byName[k] || 0) + n(x.t.amount); } });
  const pnl = st.budget.map((b) => {
    const k = b.name.trim().toLowerCase(); const a = byName[k] || 0; delete byName[k];
    return { name: b.name, group: b.group, budget: n(b.amount), actual: a, diff: n(b.amount) - a };
  });
  Object.entries(byName).forEach(([k, v]) => pnl.push({ name: k, group: "Unplanned", budget: 0, actual: v, diff: -v }));
  const chart = pnl.filter((r) => r.budget || r.actual).slice(0, 12)
    .map((r) => ({ name: r.name.length > 11 ? r.name.slice(0, 10) + "…" : r.name, Plan: r.budget, Actual: r.actual }));

  const gapToEmergency = Math.max(0, d.emergencyTarget - d.depHKD);
  const keep = Math.max(0, net);
  const toCushion = Math.min(keep, gapToEmergency);
  const toInvest = keep - toCushion;

  const add = () => {
    if (!f.name.trim() || !n(f.amount)) return;
    up((s) => { s.tx.push({ ...f, id: uid(), amount: n(f.amount) }); });
    setM(monthKey(f.date));
    setF({ date: f.date, name: "", kind: "expense", amount: 0, note: "" });
  };
  const monthList = [...new Set([cur, ...d.months])].sort().reverse();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select className="pb-in" style={{ width: 150, fontWeight: 700 }} value={m} onChange={(e) => setM(e.target.value)}>
          {monthList.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
        </select>
        <div className="ml-auto text-right">
          <Eyebrow>Kept this month</Eyebrow>
          <Num value={money(net)} prefix="HK$" size={18} weight={800} color={net < 0 ? C.red : C.jade} />
        </div>
      </div>

      {keep > 0 && (
        <Card accent={C.blue}>
          <Eyebrow color={C.blue}>Where this month's spare money goes</Eyebrow>
          <div className="mt-2" style={{ fontSize: 13.5 }}>
            <div className="flex justify-between pb-row" style={{ paddingBottom: 6 }}>
              <span>Top up the cushion {gapToEmergency > 0 ? `(HK$${money(gapToEmergency)} short)` : "(full)"}</span>
              <Num value={money(toCushion)} prefix="HK$" weight={800} color={C.jade} />
            </div>
            <div className="flex justify-between" style={{ paddingTop: 6 }}>
              <span>{gapToEmergency > 0 ? "Nothing to invest yet" : "Buy the index fund"}</span>
              <Num value={money(toInvest)} prefix="HK$" weight={800} color={toInvest ? C.blue : C.ink2} />
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 8 }}>
            Following the order on the Grow tab. Move it the day you're paid, not the day before the next payday.
          </div>
        </Card>
      )}

      <Card accent={C.jade}>
        <Eyebrow>Add an entry</Eyebrow>
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <TextIn type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} />
          <select className="pb-in" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="expense">Spent</option><option value="saving">Set aside</option><option value="income">Extra money in</option>
          </select>
          <input className="pb-in" list="cats" placeholder="Category" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <datalist id="cats">{st.budget.map((b) => <option key={b.id} value={b.name} />)}</datalist>
          <TextIn type="number" right placeholder="0" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        </div>
        <div className="flex gap-2 mt-2">
          <input className="pb-in" style={{ flex: 1 }} placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <Btn tone="solid" onClick={add}>Add</Btn>
        </div>
      </Card>

      <Card pad="p-0">
        <div className="p-3" style={{ borderBottom: `1px solid ${C.rule}` }}>
          <div className="flex justify-between items-baseline">
            <Eyebrow>Ledger · {monthLabel(m)}</Eyebrow>
            <span style={{ fontSize: 11, color: C.ink2 }}>opening HK${money(inflow)}</span>
          </div>
        </div>
        {withBal.length === 0 ? (
          <div className="p-5 text-center" style={{ fontSize: 13, color: C.ink2 }}>Nothing logged yet. Add your first entry above.</div>
        ) : (
          <div className="pb-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 460, fontSize: 13 }}>
              <thead><tr style={{ background: "#F2F5F1" }}>
                {["Date", "Category", "Amount", "Balance", ""].map((h, i) => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: i >= 2 && i < 4 ? "right" : "left", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.ink2 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {withBal.map(({ t, i, bal }) => (
                  <tr key={t.id} className="pb-row">
                    <td style={{ padding: "8px 10px", fontFamily: MONO, fontSize: 12, color: C.ink2, whiteSpace: "nowrap" }}>{t.date.slice(5).replace("-", "/")}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {t.name}
                      {t.kind === "saving" && <span className="ml-2"><Chip tone="gold">set aside</Chip></span>}
                      {t.kind === "income" && <span className="ml-2"><Chip tone="jade">in</Chip></span>}
                      {t.note && <div style={{ fontSize: 11, color: C.ink2 }}>{t.note}</div>}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}><Num value={money(t.amount)} color={t.kind === "income" ? C.jade : t.kind === "saving" ? C.gold : C.ink} /></td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}><Num value={money(bal)} weight={500} color={bal < 0 ? C.red : C.ink2} /></td>
                    <td style={{ padding: "8px 6px" }}>
                      <button onClick={() => up((s) => { s.tx.splice(i, 1); })} style={{ background: "none", border: "none", color: C.ink2, cursor: "pointer", fontSize: 15 }} aria-label="Delete entry">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card accent={C.gold} pad="p-0">
        <div className="p-3"><Eyebrow>Plan against actual</Eyebrow></div>
        <div className="pb-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 420, fontSize: 13 }}>
            <thead><tr style={{ background: "#F2F5F1" }}>
              {["Category", "Plan", "Actual", "Diff"].map((h, i) => (
                <th key={h} style={{ padding: "7px 10px", textAlign: i ? "right" : "left", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.ink2 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pnl.map((r) => (
                <tr key={r.name} className="pb-row">
                  <td style={{ padding: "7px 10px" }}>
                    {r.name}
                    {r.group === "Savings" && <span className="ml-2"><Chip tone="gold">save</Chip></span>}
                    {r.group === "Unplanned" && <span className="ml-2"><Chip tone="red">unplanned</Chip></span>}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}><Num value={money(r.budget)} weight={500} color={C.ink2} /></td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}><Num value={money(r.actual)} /></td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}><Num value={(r.diff >= 0 ? "+" : "") + money(r.diff)} color={r.diff < 0 ? C.red : C.jade} weight={700} /></td>
                </tr>
              ))}
              <tr style={{ background: "#F2F5F1" }}>
                <td style={{ padding: "9px 10px", fontWeight: 800 }}>Kept</td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}><Num value={money(d.surplus)} weight={500} color={C.ink2} /></td>
                <td style={{ padding: "9px 10px", textAlign: "right" }} colSpan={2}><Num value={money(net)} size={15} weight={800} color={net < 0 ? C.red : C.jade} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        {chart.length > 0 && (
          <div className="p-3" style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 4, left: -18, bottom: 24 }}>
                <CartesianGrid stroke={C.rule} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: C.ink2 }} angle={-35} textAnchor="end" interval={0} tickLine={false} axisLine={{ stroke: C.rule }} />
                <YAxis tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 12, fontFamily: MONO }} formatter={(v) => "HK$" + money(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Plan" fill={C.rule} /><Bar dataKey="Actual" fill={C.jade} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── PLAN ────────────────────────────────────────────────────── */
function Plan({ st, d, up }) {
  const groups = ["Living", "People & learning", "Savings"];
  return (
    <div className="space-y-4">
      <Card>
        <Eyebrow>Money in each month</Eyebrow>
        {st.income.map((r, i) => (
          <div key={r.id} className="flex gap-2 mt-2">
            <TextIn value={r.source} onChange={(v) => up((s) => { s.income[i].source = v; })} placeholder="Source" />
            <TextIn type="number" right w={110} value={r.amount} onChange={(v) => up((s) => { s.income[i].amount = v; })} />
            <Btn size="sm" tone="danger" onClick={() => up((s) => { s.income.splice(i, 1); })}>×</Btn>
          </div>
        ))}
        <div className="flex justify-between items-center mt-3">
          <Btn size="sm" onClick={() => up((s) => { s.income.push({ id: uid(), source: "", amount: 0 }); })}>+ Add income</Btn>
          <Num value={money(d.income)} prefix="HK$" size={17} weight={800} />
        </div>
      </Card>

      {groups.map((g) => {
        const rows = st.budget.map((b, i) => ({ b, i })).filter((x) => x.b.group === g);
        const sum = rows.reduce((a, x) => a + n(x.b.amount), 0);
        return (
          <Card key={g} accent={g === "Savings" ? C.gold : C.jade}>
            <div className="flex justify-between items-baseline">
              <Eyebrow color={g === "Savings" ? C.gold : C.ink2}>{g}</Eyebrow>
              <Num value={money(sum)} prefix="HK$" size={15} weight={800} />
            </div>
            <div className="mt-2 space-y-2">
              {rows.map(({ b, i }) => (
                <div key={b.id} className="grid gap-2" style={{ gridTemplateColumns: "1fr 96px 34px" }}>
                  <div>
                    <TextIn value={b.name} onChange={(v) => up((s) => { s.budget[i].name = v; })} placeholder="Category" />
                    <input className="pb-in mt-1" style={{ width: "100%", fontSize: 11.5, color: C.ink2, padding: "4px 8px" }} value={b.note || ""} placeholder="note"
                      onChange={(e) => up((s) => { s.budget[i].note = e.target.value; })} />
                  </div>
                  <TextIn type="number" right value={b.amount} onChange={(v) => up((s) => { s.budget[i].amount = v; })} />
                  <Btn size="sm" tone="danger" onClick={() => up((s) => { s.budget.splice(i, 1); })}>×</Btn>
                </div>
              ))}
            </div>
            <div className="mt-2"><Btn size="sm" onClick={() => up((s) => { s.budget.push({ id: uid(), name: "", group: g, amount: 0, note: "" }); })}>+ Add line</Btn></div>
          </Card>
        );
      })}

      <Card accent={d.surplus < 0 ? C.red : C.jade}>
        <Eyebrow>Does the plan balance?</Eyebrow>
        <table style={{ width: "100%", marginTop: 6 }}>
          <tbody style={{ fontSize: 13.5 }}>
            {[["Money in", d.income, C.jade], ["Spending", -d.plannedExp, C.ink], ["Set aside", -d.plannedSave, C.gold]].map(([l, v, c]) => (
              <tr key={l} className="pb-row"><td style={{ padding: "6px 0", color: C.ink2 }}>{l}</td>
                <td style={{ textAlign: "right" }}><Num value={money(v)} prefix="HK$" color={c} /></td></tr>
            ))}
            <tr><td style={{ padding: "8px 0", fontWeight: 800 }}>Left over</td>
              <td style={{ textAlign: "right" }}><Num value={money(d.surplus)} prefix="HK$" size={17} weight={800} color={d.surplus < 0 ? C.red : C.jade} /></td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: C.ink2, marginTop: 6 }}>
          {d.surplus === 0 ? "Every dollar has a name, with nothing spare for surprises. A small buffer line is worth carving out."
            : d.surplus < 0 ? "The plan spends more than it earns. Trim a line or lower a savings target."
              : "Spare each month. Send it to a goal on the day you're paid, before it drifts."}
        </div>
      </Card>
    </div>
  );
}

/* ── GOALS ───────────────────────────────────────────────────── */
function Goals({ st, d, up }) {
  return (
    <div className="space-y-4">
      {st.goals.map((g, i) => {
        const left = Math.max(0, n(g.target) - n(g.current));
        const pct = n(g.target) ? (n(g.current) / n(g.target)) * 100 : 0;
        const daysLeft = daysBetween(new Date(), g.deadline);
        const monthsLeft = daysLeft / 30.44;
        const need = monthsLeft > 0 ? left / monthsLeft : Infinity;
        const done = left <= 0, late = !done && daysLeft <= 0, behind = !done && !late && n(g.monthly) < need;
        const finish = n(g.monthly) > 0 ? addMonths(todayISO(), Math.ceil(left / n(g.monthly))) : null;
        const tone = done ? C.jade : late ? C.red : behind ? C.gold : C.jade;
        return (
          <Card key={g.id} accent={tone}>
            <div className="flex gap-2 items-center">
              <TextIn value={g.name} onChange={(v) => up((s) => { s.goals[i].name = v; })} placeholder="Goal" />
              {done ? <Chip tone="jade">done</Chip> : late ? <Chip tone="red">past date</Chip> : behind ? <Chip tone="gold">short</Chip> : <Chip tone="jade">on track</Chip>}
            </div>
            <div className="flex items-end justify-between mt-3">
              <Num value={money(g.current)} prefix="HK$" size={22} weight={800} color={tone} />
              <span style={{ fontSize: 12.5, color: C.ink2 }}>of HK${money(g.target)} · {pct.toFixed(0)}%</span>
            </div>
            <div className="mt-2"><Bar2 pct={pct} color={tone} h={8} /></div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Lbl t="Saved so far"><TextIn type="number" right value={g.current} onChange={(v) => up((s) => { s.goals[i].current = v; })} /></Lbl>
              <Lbl t="Target"><TextIn type="number" right value={g.target} onChange={(v) => up((s) => { s.goals[i].target = v; })} /></Lbl>
              <Lbl t="Per month"><TextIn type="number" right value={g.monthly} onChange={(v) => up((s) => { s.goals[i].monthly = v; })} /></Lbl>
              <Lbl t="Wanted by"><TextIn type="date" value={g.deadline} onChange={(v) => up((s) => { s.goals[i].deadline = v; })} /></Lbl>
            </div>
            <div className="mt-3" style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}>
              {done ? "Fully funded. Move the money to its purpose or raise the target."
                : late ? <>The date has passed with HK${money(left)} still to find. Pick a new one.</>
                  : <>HK${money(left)} to go in {Math.round(monthsLeft)} months — that needs <b style={{ color: tone }}>HK${money(Math.ceil(need))}</b> a month.{" "}
                    {behind ? `You're putting in HK$${money(g.monthly)}, short by HK$${money(Math.ceil(need - n(g.monthly)))}.` : `HK$${money(g.monthly)} a month clears it.`}
                    {finish && <> At your current pace you finish {fmtDate(finish)}.</>}
                    {monthsLeft <= 36 && <> Under three years away, so keep this money in a deposit maturing just before you need it — not in the market.</>}
                  </>}
            </div>
            <div className="mt-3"><Btn size="sm" tone="danger" onClick={() => up((s) => { s.goals.splice(i, 1); })}>Remove goal</Btn></div>
          </Card>
        );
      })}
      <Btn onClick={() => up((s) => { s.goals.push({ id: uid(), name: "", target: 0, current: 0, deadline: iso(addMonths(todayISO(), 12)), monthly: 0 }); })}>+ Add a goal</Btn>
      <Card accent={C.gold}>
        <Eyebrow>All goals together</Eyebrow>
        <div className="flex items-end justify-between mt-1">
          <Num value={money(d.goalNow)} prefix="HK$" size={20} weight={800} />
          <span style={{ fontSize: 12.5, color: C.ink2 }}>of HK${money(d.goalTarget)}</span>
        </div>
        <div className="mt-2"><Bar2 pct={d.goalTarget ? (d.goalNow / d.goalTarget) * 100 : 0} color={C.gold} h={8} /></div>
        <div className="mt-2" style={{ fontSize: 12.5, color: C.ink2 }}>
          Goals ask for HK${money(st.goals.reduce((a, g) => a + n(g.monthly), 0))} a month. Your plan sets aside HK${money(d.plannedSave)}.
        </div>
      </Card>
    </div>
  );
}
