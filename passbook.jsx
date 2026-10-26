import { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { t } from "./src/i18n.js";

/* ────────────────────────────────────────────────────────────────
   Passbook — money, time deposits, P&L, and what to do next.
   HKD + USD + CNY deposits, a maturity ladder, and a rules-based coach.
   ──────────────────────────────────────────────────────────────── */

const KEY = "passbook:v2";

// Two palettes; the app follows the phone's light/dark setting.
const LIGHT = {
  paper: "#F2F4F1", card: "#FFFFFF", field: "#F7F9F7", ink: "#0F1A14", ink2: "#5B6A62", rule: "#E1E8E3",
  jade: "#0C8A60", jadeSoft: "#DCF3E8", onJade: "#FFFFFF", gold: "#B4730F", goldSoft: "#FCEFD6",
  red: "#D7373F", redSoft: "#FDE4E4", blue: "#2F6BEB", blueSoft: "#E2EBFD", pink: "#D9457F", pinkSoft: "#FCE4EE",
  violet: "#7C5CE0", track: "#E6ECE7", chip: "#EEF2EF", head: "#F6F8F6", soft: "#F3F6F4",
  glass: "rgba(255,255,255,.72)", scrim: "rgba(10,20,15,.32)", shadow: "0 10px 30px rgba(15,26,20,.12)",
  hero: "#0C8A60", heroInk: "#FFFFFF", heroInk2: "rgba(255,255,255,.78)", heroChip: "rgba(255,255,255,.16)",
};
const DARK = {
  paper: "#000000", card: "#141917", field: "#1D2421", ink: "#EEF4F0", ink2: "#97A69E", rule: "#26302B",
  jade: "#3DD597", jadeSoft: "#123A2A", onJade: "#03140C", gold: "#F2B54E", goldSoft: "#3A2C10",
  red: "#FF6B6E", redSoft: "#3D1A1C", blue: "#6EA8FF", blueSoft: "#15273F", pink: "#FF7AAE", pinkSoft: "#3B1828",
  violet: "#A48BFF", track: "#26302B", chip: "#1F2724", head: "#1A201D", soft: "#1A201D",
  glass: "rgba(28,34,31,.72)", scrim: "rgba(0,0,0,.55)", shadow: "0 10px 30px rgba(0,0,0,.5)",
  hero: "#0F5C42", heroInk: "#FFFFFF", heroInk2: "rgba(255,255,255,.74)", heroChip: "rgba(255,255,255,.12)",
};
const darkMQ = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const C = { ...(darkMQ?.matches ? DARK : LIGHT) };
const applyTheme = () => {
  const dark = !!darkMQ?.matches;
  Object.assign(C, dark ? DARK : LIGHT);
  if (typeof document !== "undefined") {
    document.body.style.background = C.paper;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", C.paper);
  }
  return dark;
};
const bankColor = (i) => [C.jade, C.blue, C.gold, C.violet, C.pink][i % 5];
// SF Pro Rounded on iPhone for every figure; tabular so columns line up.
const MONO = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, sans-serif';

/* ── helpers ─────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 9);
const n = (v) => (Number.isFinite(+v) ? +v : 0);
const money = (v, dp = 0) =>
  n(v).toLocaleString("en-HK", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const DAY = 86400000;
const validDate = (d) => { const dt = new Date(d); return Number.isNaN(dt.getTime()) ? null : dt; };
const startOfDay = (d) => { const dt = validDate(d); return dt ? new Date(dt.toDateString()) : null; };
const todayISO = () => new Date().toISOString().slice(0, 10);
const addMonths = (isoStr, m) => {
  const d = validDate(isoStr); if (!d) return null;
  const day = d.getDate();
  d.setMonth(d.getMonth() + m); if (d.getDate() < day) d.setDate(0);
  return d;
};
// Guards against "Invalid time value" — Date#toISOString throws on an
// invalid Date (e.g. while a deposit's date field is temporarily blank).
const iso = (d) => { const dt = validDate(d); return dt ? dt.toISOString().slice(0, 10) : ""; };
const daysBetween = (a, b) => {
  const sa = startOfDay(a), sb = startOfDay(b);
  return sa && sb ? Math.round((sb - sa) / DAY) : NaN;
};
const fmtDate = (d, lang = "zh") => { const dt = validDate(d); return dt ? dt.toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; };
const fmtShort = (d, lang = "zh") => { const dt = validDate(d); return dt ? dt.toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { day: "2-digit", month: "short" }) : "—"; };
const monthKey = (d) => String(d).slice(0, 7);
// Planned spends: months from this month up to and including the target month.
const planMonthsLeft = (date) => {
  if (!date) return 1;
  const [ty, tm] = String(date).split("-").map(Number);
  const now = new Date();
  return Math.max(1, (ty * 12 + tm) - (now.getFullYear() * 12 + now.getMonth() + 1) + 1);
};
const planInfo = (p, rates, txs) => {
  const target = toHKD(p.amount, p.ccy || "HKD", rates);
  const spent = txs.filter((t) => t.planId === p.id && t.kind === "expense").reduce((a, t) => a + toHKD(t.amount, t.ccy || "HKD", rates), 0);
  const remaining = Math.max(0, target - spent);
  const monthsLeft = planMonthsLeft(p.date);
  return { target, spent, remaining, monthsLeft, perMonth: remaining / monthsLeft, pct: target ? Math.min(100, (spent / target) * 100) : 0 };
};
const monthLabel = (k, lang = "zh") => new Date(k + "-01").toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { month: "short", year: "numeric" });
const CCYS = ["HKD", "USD", "CNY"];
const toHKD = (amt, ccy, rates) => n(amt) * (ccy === "HKD" ? 1 : n(rates?.[ccy]) || 1);
const ccySign = (c) => (c === "USD" ? "US$" : c === "CNY" ? "¥" : "HK$");

/* ── seed ────────────────────────────────────────────────────── */
const D = (bank, ccy, product, principal, rate, termMonths, startedDaysAgo, autoRenew, note) => ({
  id: uid(), bank, ccy, product, principal, rate, termMonths,
  start: iso(new Date(Date.now() - startedDaysAgo * DAY)), autoRenew, note, closed: false,
});

// Blank starting sheet for brand-new accounts (and the Reset button).
// Personal figures are never shipped with the app: each user enters their own.
const SEED = {
  v: 5,
  settings: { rates: { USD: 7.8, CNY: 1.09 }, inflation: 2.5, investReturn: 6.5, emergencyMonths: 6 },
  portfolio: { value: 0, monthly: 0, note: "" },
  cash: { balance: 0, note: "" },
  debts: [],
  subs: [],
  invest: { targetPct: 70, fundA: "SPYL", fundB: "IBTA", quarterly: 0, months: [1, 4, 7, 10], janExtra: 0, done: {} },
  snapshots: [],
  income: [],
  budget: [],
  tx: [],
  deposits: [],
  plans: [],
  goals: [],
};

/* ── storage ─────────────────────────────────────────────────── */
// Non-destructive: only ever fills in missing fields (currency defaults
// to HKD for pre-multi-currency records). Existing ids, amounts, dates,
// notes and unknown fields are never rewritten.
function migrate(s) {
  if (!s) return s;
  if (!s.settings) s.settings = {};
  if (!s.settings.rates) s.settings.rates = { USD: 7.8, CNY: 1.09 };
  if (!s.settings.rates.USD) s.settings.rates.USD = 7.8;
  if (!s.settings.rates.CNY) s.settings.rates.CNY = 1.09;
  if (!s.snapshots) s.snapshots = [];
  if (!s.cash) s.cash = { balance: 0, note: "" };
  if (!s.debts) s.debts = [];
  if (!s.subs) s.subs = [];
  if (!s.invest) s.invest = structuredClone(INVEST_DEFAULT);
  if (!s.invest.done) s.invest.done = {};
  if (!s.mpf) s.mpf = { history: [] };
  if (!s.ot) s.ot = {};
  if (!s.settings.otRate) s.settings.otRate = 45;
  if (!s.leave) s.leave = { perYear: 12, anchorDate: todayISO(), anchorBalance: 12, days: [] };
  if (!s.events) s.events = [];
  if (!s.plans) s.plans = [];
  if (!s.health) s.health = { heightCm: 0, goalBmi: 24, start: null, milestone: null, kcal: 0, protein: 0, weeklyMin: 250, plan: { swim: 2, strength: 2, cardio: 1 }, unit: "kg", weights: [], activities: [] };
  s.tx = (s.tx || []).map((t) => ({ ccy: "HKD", ...t }));
  s.income = (s.income || []).map((r) => ({ ccy: "HKD", ...r }));
  s.budget = (s.budget || []).map((r) => ({ ccy: "HKD", ...r }));
  s.debts = s.debts.map((r) => ({ ccy: "HKD", ...r }));
  s.v = 5;
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
function Num({ value, size = 15, weight = 650, color, prefix = "", wrap = false }) {
  color = color || C.ink;
  return (
    <span style={{
      fontFamily: MONO, fontSize: size, fontWeight: weight, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
      whiteSpace: wrap ? "normal" : "nowrap", overflowWrap: wrap ? "anywhere" : "normal",
    }}>
      {prefix}{value}
    </span>
  );
}
// Section title. Sentence case: small caps-tracked labels everywhere made
// every card shout the same way.
function Eyebrow({ children, color = C.ink }) {
  return <div style={{ fontSize: 16, letterSpacing: "-0.01em", color, fontWeight: 750, lineHeight: 1.3 }}>{children}</div>;
}
// Only cards that need attention (gold = act soon, red = overdue) carry the
// thick left stripe; everything else sits quietly on a hairline border.
function Card({ children, accent, className = "", pad = "p-4" }) {
  const flag = accent === C.gold || accent === C.red;
  return (
    <div className={`${pad} ${className}`}
      style={{ background: C.card, border: `1px solid ${flag ? accent : C.rule}`, borderRadius: 22, boxShadow: flag ? `0 0 0 3px ${accent === C.red ? C.redSoft : C.goldSoft}` : "none", overflow: "hidden" }}>
      {children}
    </div>
  );
}
function Chip({ children, tone = "jade" }) {
  const map = { jade: [C.jadeSoft, C.jade], gold: [C.goldSoft, C.gold], red: [C.redSoft, C.red], grey: [C.chip, C.ink2], blue: [C.blueSoft, C.blue] };
  const [bg, fg] = map[tone] || map.grey;
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>{children}</span>;
}
// Signed money: "−HK$13,700" rather than "HK$-13,700".
const hk = (v, dp = 0, sign = "HK$") => `${n(v) < 0 ? "−" : ""}${sign}${money(Math.abs(n(v)), dp)}`;
function TextIn({ value, onChange, placeholder, type = "text", right = false, w, step }) {
  return (
    <input type={type} step={step} value={value === 0 && type === "number" ? "" : value ?? ""} placeholder={placeholder}
      onChange={(e) => onChange(type === "number" ? (e.target.value === "" ? 0 : +e.target.value) : e.target.value)}
      className="pb-in"
      style={{ fontFamily: type === "number" ? MONO : "inherit", textAlign: right ? "right" : "left", width: w || "100%", fontVariantNumeric: "tabular-nums" }} />
  );
}
function CcySelect({ value, onChange, w = 96 }) {
  return (
    <select className="pb-in" style={{ width: w, fontFamily: MONO }} value={value || "HKD"} onChange={(e) => onChange(e.target.value)}>
      {CCYS.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}
function Btn({ children, onClick, tone = "quiet", size = "md" }) {
  const s = {
    solid: { background: C.jade, color: C.onJade, border: `1px solid ${C.jade}` },
    quiet: { background: C.chip, color: C.ink, border: `1px solid ${C.chip}` },
    danger: { background: C.redSoft, color: C.red, border: `1px solid ${C.redSoft}` },
    gold: { background: C.gold, color: C.onJade, border: `1px solid ${C.gold}` },
  }[tone];
  return <button onClick={onClick} className="pb-btn" style={{ ...s, fontSize: size === "sm" ? 13 : 14.5, padding: size === "sm" ? "6px 14px" : "10px 18px" }}>{children}</button>;
}
function RemoveBtn({ onClick, label = "Delete" }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="pb-btn"
      style={{ flexShrink: 0, width: 38, height: 38, background: C.chip, border: "none", color: C.ink2, fontSize: 18, lineHeight: 1, borderRadius: 19 }}>×</button>
  );
}
function Bar2({ pct, color = C.jade, h = 6 }) {
  return (
    <div style={{ background: C.track, height: h, borderRadius: h, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: color, transition: "width .5s ease" }} />
    </div>
  );
}
function Lbl({ t: label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12, color: C.ink2, fontWeight: 600 }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/* ── deposit maths ───────────────────────────────────────────── */
function depInfo(d, rates) {
  const mat = addMonths(d.start, n(d.termMonths));
  const termDays = mat ? Math.max(1, daysBetween(d.start, mat)) : NaN;
  const elapsed = Math.max(0, daysBetween(d.start, new Date()) || 0);
  const left = mat ? daysBetween(new Date(), mat) : NaN;
  const interest = n(d.principal) * (n(d.rate) / 100) * (termDays / 365);
  return {
    maturity: mat, maturityISO: iso(mat), termDays, left,
    pct: Math.max(0, Math.min(100, (elapsed / termDays) * 100 || 0)),
    interest, atMaturity: n(d.principal) + interest,
    hkd: toHKD(d.principal, d.ccy, rates), hkdInterest: toHKD(interest, d.ccy, rates),
    status: !mat || Number.isNaN(left) ? "unknown" : left <= 0 ? "matured" : left <= 14 ? "due" : "running",
  };
}

// What to do when a deposit comes due. A deposit's own `plan` text wins;
// otherwise a generic checklist that works for any deposit.
const DUE_DAYS = 14;
const depPlan = (x, lang) => (x.plan && String(x.plan).trim()) || (lang === "zh"
  ? "到期前：比較三間銀行當週的定存利率（新資金優惠通常較高），決定續存、轉走還是留在活期；處理好後在這裏按「續存」或「結束」，讓數字保持準確。"
  : "Before it matures: compare this week's rates at your banks (new-money offers are usually higher), decide whether to renew, move it or keep it in savings, then tap Renew or Close here so the figures stay right.");

/* ── subscription maths ──────────────────────────────────────── */
// A subscription, contract or warranty. The "act by" date is the notice
// deadline when there is one (e.g. return a SIM a month before the
// contract ends), otherwise the end date itself.
const SUB_KINDS = ["subscription", "contract", "warranty"];
const SUB_CYCLES = ["monthly", "yearly", "one-off"];
function subInfo(x, rates) {
  const cyc = x.cycle || "monthly";
  const amtHKD = toHKD(x.amount, x.ccy || "HKD", rates);
  const monthlyHKD = cyc === "monthly" ? amtHKD : cyc === "yearly" ? amtHKD / 12 : 0;
  const end = validDate(x.end) || (x.start && n(x.termMonths) ? addMonths(x.start, n(x.termMonths)) : null);
  const notice = end && n(x.noticeMonths) ? addMonths(iso(end), -n(x.noticeMonths)) : null;
  const actBy = notice || end;
  const remind = n(x.remindDays) || 30;
  const left = actBy ? daysBetween(new Date(), actBy) : NaN;
  const endLeft = end ? daysBetween(new Date(), end) : NaN;
  const status = !actBy ? "ongoing" : endLeft < 0 ? "ended" : left < 0 ? "late" : left <= remind ? "due" : "running";
  const remindFrom = actBy ? new Date(actBy.getTime() - remind * DAY) : null;
  return { monthlyHKD, end, endISO: iso(end), notice, actBy, actByISO: iso(actBy), remindFrom, left, endLeft, remind, status };
}

/* ── investment maths (IBKR snapshot + buy plan) ─────────────── */
// The snapshot is written once a day by a server-side sync from IBKR;
// the browser only reads it. `plan` is the user's own buy schedule.
const INVEST_DEFAULT = { targetPct: 70, fundA: "SPYL", fundB: "IBTA", quarterly: 0, months: [1, 4, 7, 10], janExtra: 0, done: {} };
const BUY_SOON_DAYS = 7;
const limitPrice = (p) => Math.ceil(n(p) * 1.003 * 100) / 100;

function nextBuy(plan, today = new Date()) {
  const months = (plan.months || []).map(Number).filter((m) => m >= 1 && m <= 12);
  if (!months.length || !n(plan.quarterly) && !n(plan.janExtra)) return null;
  for (let k = -1; k < 14; k++) {
    let mm = today.getMonth() + 1 + k, yy = today.getFullYear();
    while (mm > 12) { mm -= 12; yy += 1; }
    while (mm < 1) { mm += 12; yy -= 1; }
    if (!months.includes(mm)) continue;
    const key = `${yy}-${String(mm).padStart(2, "0")}`;
    if (plan.done?.[key]) continue;
    const start = new Date(yy, mm - 1, 1), end = new Date(yy, mm, 0);
    const left = daysBetween(today, start), endLeft = daysBetween(today, end);
    const status = endLeft < 0 ? "late" : left <= 0 ? "due" : left <= BUY_SOON_DAYS ? "soon" : "later";
    return { key, start, end, left, status, amountHKD: n(plan.quarterly) + (mm === 1 ? n(plan.janExtra) : 0) };
  }
  return null;
}

function investInfo(planIn, ibkr, rates) {
  const plan = { ...INVEST_DEFAULT, ...(planIn || {}) };
  const snap = ibkr?.snapshot || null;
  const data = snap?.data || {};
  const fx = n(data.fx_usd) || n(rates?.USD) || 7.8;
  const pos = (data.positions || []).map((p) => {
    const cost = n(p.qty) * n(p.avg), pnl = n(p.value) - cost;
    return { ...p, cost, pnl, pnlPct: cost ? (pnl / cost) * 100 : 0 };
  });
  const valueUSD = pos.reduce((a, p) => a + n(p.value), 0);
  const costUSD = pos.reduce((a, p) => a + p.cost, 0);
  const cashUSD = n(data.cash_usd) + n(data.cash_hkd) / fx;
  const navHKD = snap ? (n(data.nav_hkd) || (valueUSD + cashUSD) * fx) : 0;
  const pnlUSD = valueUSD - costUSD;
  const pnlPct = costUSD ? (pnlUSD / costUSD) * 100 : 0;
  const A = pos.find((p) => p.symbol === plan.fundA), B = pos.find((p) => p.symbol === plan.fundB);
  const aVal = n(A?.value), bVal = n(B?.value);
  const weightA = aVal + bVal ? (aVal / (aVal + bVal)) * 100 : 0;
  const ageDays = snap ? (Date.now() - new Date(snap.as_of).getTime()) / DAY : Infinity;

  const hist = (ibkr?.history || []).map((h) => {
    const v = n(h.value_usd), c = n(h.cost_usd);
    return { day: h.day, value: Math.round(v), cost: Math.round(c), pct: c ? +(((v - c) / c) * 100).toFixed(2) : 0 };
  });
  const lastH = hist[hist.length - 1], prevH = hist[hist.length - 2];
  const dayChange = lastH && prevH ? (lastH.value - lastH.cost) - (prevH.value - prevH.cost) : null;

  const nb = nextBuy(plan);
  let buy = null;
  if (nb) {
    // Spend the new money (plus idle USD cash, less ~US$5 for fees) so the
    // split moves toward the target without selling anything.
    const usd = Math.max(0, nb.amountHKD / fx + n(data.cash_usd) - 5);
    const p = n(plan.targetPct) / 100;
    const total = aVal + bVal + usd;
    const buyA = Math.min(usd, Math.max(0, total * p - aVal)), buyB = usd - buyA;
    const leg = (fund, amt) => {
      const price = n(fund?.price), lim = price ? limitPrice(price) : 0;
      const shares = lim ? Math.floor(amt / lim) : 0;
      return { amt, price, lim, shares, spend: shares * lim };
    };
    const la = leg(A, buyA), lb = leg(B, buyB);
    const afterA = aVal + la.shares * la.price, afterB = bVal + lb.shares * lb.price;
    buy = { ...nb, usd, a: la, b: lb, weightAfter: afterA + afterB ? (afterA / (afterA + afterB)) * 100 : 0 };
  }
  return { plan, snap, fx, pos, valueUSD, costUSD, cashUSD, navHKD, pnlUSD, pnlPct, A, B, weightA, ageDays, hist, dayChange, buy };
}

/* ── pay: gross salary, MPF, overtime ────────────────────────── */
// Mandatory employee MPF: 5% of relevant income (salary + OT), nothing
// below HK$7,100 a month, capped at HK$1,500 (relevant income HK$30,000).
const mpfEE = (relevant) => (n(relevant) < 7100 ? 0 : Math.min(n(relevant) * 0.05, 1500));
function payInfo(st, rates, otHours = 0) {
  const gross = st.income.reduce((a, b) => a + toHKD(b.amount, b.ccy || "HKD", rates), 0);
  const relevant = st.income.filter((b) => b.mpf).reduce((a, b) => a + toHKD(b.amount, b.ccy || "HKD", rates), 0);
  const otRate = n(st.settings.otRate) || 45;
  const ot = n(otHours) * otRate;
  const mpf = mpfEE(relevant + ot);
  return { gross, relevant, ot, otRate, mpf, net: gross + ot - mpf };
}

/* ── health: weight, BMI, workouts ───────────────────────────── */
const LB = 2.20462;
// Hong Kong Department of Health / WHO Asian cut-offs.
const bmiBand = (b) => (b < 18.5 ? ["過輕", "Underweight", "gold"] : b < 23 ? ["正常", "Healthy", "jade"] : b < 25 ? ["過重", "Overweight", "gold"] : ["肥胖", "Obese", "red"]);
// MET values (Compendium of Physical Activities, rounded) by intensity: light / moderate / vigorous.
const SPORTS = {
  swim: ["🏊 游水", "🏊 Swim", [4.8, 6, 9.8]], run: ["🏃 跑步", "🏃 Run", [6, 8.3, 11]], cycle: ["🚴 踩單車", "🚴 Cycle", [4, 6.8, 10]],
  gym: ["🏋️ 重量訓練", "🏋️ Strength", [3.5, 5, 6]], walk: ["🚶 行路", "🚶 Walk", [2.8, 3.5, 4.3]], hike: ["🥾 行山", "🥾 Hike", [5.3, 6, 7.8]],
  ball: ["🏸 球類", "🏸 Ball sports", [4.5, 6, 8]], dive: ["🤿 潛水", "🤿 Diving", [5, 7, 10]], other: ["✨ 其他", "✨ Other", [3, 5, 7]],
};
const kcalOf = (a, kg) => { const m = (SPORTS[a.type] || SPORTS.other)[2][Math.max(0, Math.min(2, n(a.intensity ?? 1)))]; return m * n(kg) * (n(a.minutes) / 60); };
const weekStart = (isoStr) => { const dt = new Date(isoStr + "T00:00:00"); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return isoLocal(dt); };
function healthInfo(h) {
  const weights = [...(h?.weights || [])].filter((w) => w.date && n(w.kg)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const acts = [...(h?.activities || [])].filter((a) => a.date).sort((a, b) => (a.date + (a.time || "") < b.date + (b.time || "") ? 1 : -1));
  const m = n(h?.heightCm) / 100;
  const last = weights[weights.length - 1] || null;
  const kgNow = last ? n(last.kg) : n(h?.start?.kg);
  const bmi = m && kgNow ? kgNow / (m * m) : 0;
  const goalKg = m ? +(n(h?.goalBmi || 24) * m * m).toFixed(1) : 0;
  const healthyKg = m ? +(22.9 * m * m).toFixed(1) : 0;
  // 7-day average smooths out day-to-day water swings.
  const avg7 = (() => { if (!last) return 0; const from = isoLocal(new Date(new Date(last.date + "T00:00:00").getTime() - 6 * DAY)); const xs = weights.filter((w) => w.date >= from); return xs.reduce((a, w) => a + n(w.kg), 0) / xs.length; })();
  const start = h?.start || (weights[0] ? { date: weights[0].date, kg: weights[0].kg } : null);
  const ms = h?.milestone || null;
  let pace = null;
  if (start && ms && ms.date > start.date) {
    const total = daysBetween(start.date, ms.date);
    const done = Math.max(0, Math.min(total, daysBetween(start.date, new Date())));
    const planNow = n(start.kg) - ((n(start.kg) - n(ms.kg)) * done) / total;
    const weeksLeft = Math.max(0, daysBetween(new Date(), ms.date)) / 7;
    const cur = avg7 || kgNow;
    pace = { planNow, weeksLeft, needPerWeek: weeksLeft > 0 ? (cur - n(ms.kg)) / weeksLeft : 0, ahead: planNow - cur, total };
  }
  const wk = weekStart(todayISO());
  const thisWeek = acts.filter((a) => a.date >= wk);
  const minutes = thisWeek.reduce((a, x) => a + n(x.minutes), 0);
  const kcal = thisWeek.reduce((a, x) => a + kcalOf(x, kgNow), 0);
  const count = (types) => thisWeek.filter((a) => types.includes(a.type)).length;
  return { weights, acts, last, kgNow, bmi, goalKg, healthyKg, avg7, start, ms, pace, thisWeek, minutes, kcal,
    sessions: { swim: count(["swim"]), strength: count(["gym"]), cardio: count(["run", "cycle", "hike", "ball", "dive"]) } };
}

/* ── Hong Kong general holidays (= bank holidays) ────────────── */
// Source: HKSAR Government gazette, via info.gov.hk (2026) and EDB (2027).
const HK_HOLIDAYS = {
  "2026-01-01": ["一月一日", "New Year's Day"], "2026-02-17": ["農曆年初一", "Lunar New Year's Day"],
  "2026-02-18": ["農曆年初二", "Second day of Lunar New Year"], "2026-02-19": ["農曆年初三", "Third day of Lunar New Year"],
  "2026-04-03": ["耶穌受難節", "Good Friday"], "2026-04-04": ["耶穌受難節翌日", "Day after Good Friday"],
  "2026-04-06": ["清明節翌日", "Day after Ching Ming"], "2026-04-07": ["復活節星期一翌日", "Day after Easter Monday"],
  "2026-05-01": ["勞動節", "Labour Day"], "2026-05-25": ["佛誕翌日", "Day after Buddha's Birthday"],
  "2026-06-19": ["端午節", "Tuen Ng Festival"], "2026-07-01": ["香港特別行政區成立紀念日", "HKSAR Establishment Day"],
  "2026-09-26": ["中秋節翌日", "Day after Mid-Autumn"], "2026-10-01": ["國慶日", "National Day"],
  "2026-10-19": ["重陽節翌日", "Day after Chung Yeung"], "2026-12-25": ["聖誕節", "Christmas Day"],
  "2026-12-26": ["聖誕節後第一個周日", "First weekday after Christmas"],
  "2027-01-01": ["一月一日", "New Year's Day"], "2027-02-06": ["農曆年初一", "Lunar New Year's Day"],
  "2027-02-08": ["農曆年初三", "Third day of Lunar New Year"], "2027-02-09": ["農曆年初四", "Fourth day of Lunar New Year"],
  "2027-03-26": ["耶穌受難節", "Good Friday"], "2027-03-27": ["耶穌受難節翌日", "Day after Good Friday"],
  "2027-03-29": ["復活節星期一", "Easter Monday"], "2027-04-05": ["清明節", "Ching Ming Festival"],
  "2027-05-01": ["勞動節", "Labour Day"], "2027-05-13": ["佛誕", "Buddha's Birthday"],
  "2027-06-09": ["端午節", "Tuen Ng Festival"], "2027-07-01": ["香港特別行政區成立紀念日", "HKSAR Establishment Day"],
  "2027-09-16": ["中秋節翌日", "Day after Mid-Autumn"], "2027-10-01": ["國慶日", "National Day"],
  "2027-10-08": ["重陽節", "Chung Yeung Festival"], "2027-12-25": ["聖誕節", "Christmas Day"],
  "2027-12-27": ["聖誕節後第一個周日", "First weekday after Christmas"],
};
const HOLIDAY_YEARS = [2026, 2027];
const isoLocal = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const dowOf = (isoStr) => new Date(isoStr + "T00:00:00").getDay();   // 0 Sun … 6 Sat
const isWorkday = (isoStr) => { const w = dowOf(isoStr); return w !== 0 && w !== 6 && !HK_HOLIDAYS[isoStr]; };
const eachDay = (a, b) => { const out = []; if (!a || !b || b < a) return out; const dt = new Date(a + "T00:00:00"); while (isoLocal(dt) <= b) { out.push(isoLocal(dt)); dt.setDate(dt.getDate() + 1); } return out; };

// Leave balance per calendar year. In the anchor year the balance the
// user gave (e.g. 7.5 on 26 Oct) already counts everything up to that
// date, so only leave after it is deducted.
function leaveInfo(lv, year) {
  const days = (lv?.days || []).filter((x) => String(x.date).startsWith(String(year)));
  const anchorYear = lv?.anchorDate ? +String(lv.anchorDate).slice(0, 4) : null;
  const today = todayISO();
  const counted = year === anchorYear ? days.filter((x) => x.date > lv.anchorDate) : days;
  const base = year === anchorYear ? n(lv.anchorBalance) : n(lv?.perYear) || 12;
  const used = counted.reduce((a, x) => a + n(x.amt), 0);
  const taken = counted.filter((x) => x.date <= today).reduce((a, x) => a + n(x.amt), 0);
  return { year, base, left: base - used, planned: used - taken, taken, days };
}
const leaveOn = (lv, date) => (lv?.days || []).find((x) => x.date === date);
// Workdays in an event's range that aren't already booked as leave.
const leaveNeeded = (lv, ev) => eachDay(ev.start, ev.end || ev.start).filter((x) => isWorkday(x) && !leaveOn(lv, x));

/* ── MPF maths ───────────────────────────────────────────────── */
// Mandatory contributions: 5% each side on relevant income, capped at
// HK$1,500 a month each (employee pays nothing below HK$7,100 a month).
const MPF_STALE_DAYS = 90;
function mpfInfo(m, salary) {
  const history = [...(m?.history || [])].filter((h) => h.date && n(h.balance)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const er = Math.min(n(salary) * 0.05, 1500);
  const ee = n(salary) < 7100 ? 0 : Math.min(n(salary) * 0.05, 1500);
  const monthly = n(m?.monthly) || ee + er;
  const first = history[0] || null, last = history[history.length - 1] || null;
  const monthsBetween = (a, b) => Math.max(0, Math.floor(daysBetween(a, b) / 30.44));
  const monthsSince = last ? monthsBetween(last.date, new Date()) : 0;
  const est = last ? n(last.balance) + monthsSince * monthly : 0;
  let gain = null, gainPct = 0;
  if (first && last && first !== last) {
    const contrib = monthsBetween(first.date, last.date) * monthly;
    gain = n(last.balance) - n(first.balance) - contrib;
    const base = n(first.balance) + contrib / 2;   // simple money-weighted approximation
    gainPct = base ? (gain / base) * 100 : 0;
  }
  const age = last ? daysBetween(last.date, new Date()) : Infinity;
  return { history, ee, er, monthly, first, last, monthsSince, est, gain, gainPct, age, stale: !!last && age > MPF_STALE_DAYS, empty: !last };
}

/* ── bank deposit rates (weekly server-side refresh) ─────────── */
const bestFor = (br, ccy, months) => ((br?.data?.rates) || [])
  .filter((r) => r.ccy === ccy && (!months || n(r.months) === months))
  .sort((a, b) => n(b.rate) - n(a.rate))[0] || null;
const bestLine = (br, ccy, lang) => {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const parts = [3, 6, 12].map((m) => [m, bestFor(br, ccy, m)]).filter(([, r]) => r)
    .map(([m, r]) => `${r.bank} ${m}${tr("個月", "M")} ${n(r.rate).toFixed(2)}%`);
  return parts.length ? tr(`今日最佳 ${ccy}：`, `Best ${ccy} today: `) + parts.join(" · ") : null;
};

/* ── FX: market mid-rates from IBKR (daily) ──────────────────── */
// `usd` = HKD per 1 USD, `cny` = HKD per 1 RMB (offshore CNH), from USDHKD / USDCNH.
const PEG_LO = 7.75, PEG_HI = 7.85;
function fxInfo(rows) {
  const by = {};
  for (const r of rows || []) { (by[r.day] ||= { day: r.day })[r.pair] = n(r.close); }
  const days = Object.values(by).filter((x) => x.USDHKD).sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((x) => ({ day: x.day, usd: x.USDHKD, cny: x.USDCNH ? +(x.USDHKD / x.USDCNH).toFixed(5) : null }));
  if (!days.length) return null;
  const stat = (key) => {
    const xs = days.map((x) => x[key]).filter((v) => v != null);
    if (!xs.length) return null;
    const last = xs[xs.length - 1];
    const ma = (k) => { const s = xs.slice(-k); return s.reduce((a, b) => a + b, 0) / s.length; };
    return { last, prev: xs[xs.length - 2] ?? last, first: xs[0], min: Math.min(...xs), max: Math.max(...xs),
      pct: (xs.filter((v) => v <= last).length / xs.length) * 100, ma1m: ma(22), ma3m: ma(65) };
  };
  return { days, usd: stat("usd"), cny: stat("cny"), asOf: days[days.length - 1].day };
}
// Market mid on (or just before) a date, for comparing a logged bank quote.
const fxMidOn = (fx, date, ccy) => {
  if (!fx) return null;
  let v = null;
  for (const x of fx.days) { if (x.day <= date && x[ccy] != null) v = x[ccy]; else if (x.day > date) break; }
  return v;
};

/* ════════════════════════════════════════════════════════════ */
/* ── QUICK ENTRY: log one spend in a few taps ────────────────── */
// Everyday categories, one tap each. [Chinese, English]
const QUICK_PRESETS = [["交通", "Transport"], ["超市", "Groceries"], ["午餐", "Lunch"], ["八達通", "Octopus top-up"]];
// Which budget line each quick pick belongs to (lunch and groceries are Catering, rides and Octopus are transport).
const QUICK_HOME = [/transport|交通/i, /catering|餐飲|飲食|grocer|food/i, /catering|餐飲|飲食|grocer|food/i, /transport|交通/i];
const CAT_EMOJI = [
  [/八達通|octopus/i, "💳"], [/交通|transport|mtr|taxi|uber/i, "🚇"], [/超市|grocer|supermarket/i, "🛒"],
  [/午餐|晚餐|早餐|餐|lunch|dinner|breakfast|food|catering|dining/i, "🍜"], [/rent|租/i, "🏠"],
  [/travel|trip|旅|機票|flight/i, "✈️"], [/book|course|書|課/i, "📚"], [/girlfriend|date|約會|女朋友/i, "💕"],
  [/subscri|訂閱|icloud|music/i, "🔁"], [/saving|儲蓄/i, "🐷"], [/utilit|水電|電費/i, "💡"], [/health|gym|運動|medical|醫/i, "💪"],
];
const catEmoji = (name) => { const hit = CAT_EMOJI.find(([re]) => re.test(name || "")); return hit ? hit[1] : "🏷️"; };
function QuickEntry({ st, up, lang, onClose, onSaved }) {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const [amount, setAmount] = useState("");
  const [ccy, setCcy] = useState("HKD");
  const [cat, setCat] = useState("");
  const [item, setItem] = useState("");
  const [date, setDate] = useState(todayISO());
  const [err, setErr] = useState("");
  const rates = st.settings.rates;
  const yest = iso(new Date(Date.now() - DAY));
  const chip = (sel, tone) => ({
    border: "none", borderRadius: 999, padding: "8px 13px", fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 38, whiteSpace: "nowrap", flexShrink: 0,
    background: sel ? (tone || C.jade) : C.chip, color: sel ? C.onJade : C.ink,
  });
  // With no budget lines yet (a fresh account) the quick picks act as categories. Otherwise they
  // are tags that fill in the item and jump to the budget line they belong to.
  const presets = QUICK_PRESETS.map(([zh, en], i) => ({ key: "x:" + i, zh, en, label: tr(zh, en) }))
    .filter(() => st.budget.length === 0);
  const homeOf = (i) => st.budget.find((b) => QUICK_HOME[i].test(b.name || ""));
  const save = () => {
    if (!n(amount)) { setErr(tr("請輸入金額", "Enter an amount")); return; }
    if (!cat) { setErr(tr("揀一個分類", "Pick a category")); return; }
    let name; let tag = {}; let note = "";
    if (cat === "sudden") {
      name = item.trim() || tr("突然購買", "Sudden purchase");
      tag = { oneOff: true };
    } else if (cat.startsWith("x:")) {
      const pr = presets.find((x) => x.key === cat);
      if (!pr) { setErr(tr("請重新揀分類", "Pick the category again")); return; }
      name = pr.label; note = item.trim();
    } else if (cat.startsWith("p:")) {
      const p = st.plans.find((x) => x.id === cat.slice(2));
      if (!p) { setErr(tr("找不到這個計劃", "That plan is gone")); return; }
      name = p.name || tr("計劃", "Plan"); tag = { planId: p.id }; note = item.trim();
    } else {
      const b = st.budget.find((x) => x.id === cat.slice(2));
      if (!b) { setErr(tr("找不到這個分類", "That category is gone")); return; }
      name = b.name; note = item.trim();
    }
    const amt = n(amount);
    up((s) => { s.tx.push({ id: uid(), date, name, kind: "expense", amount: amt, ccy, note, ...tag }); });
    onSaved(tr(`✅ 已記錄 ${ccySign(ccy)}${money(amt)} · ${name}`, `✅ Logged ${ccySign(ccy)}${money(amt)} · ${name}`));
    onClose();
  };
  return (
    <>
      <div className="pb-sheet-bg" onClick={onClose} />
      <div className="pb-sheet" role="dialog" aria-modal="true" aria-label={tr("記一筆", "Quick entry")} style={{ maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: C.rule, margin: "0 auto 12px" }} />
        <div className="flex justify-between items-center">
          <Eyebrow>{tr("記一筆", "Quick entry")}</Eyebrow>
          <button onClick={onClose} className="pb-tab" aria-label={tr("關閉", "Close")} style={{ background: C.chip, border: "none", borderRadius: 999, width: 32, height: 32, fontSize: 16, color: C.ink2, cursor: "pointer" }}>×</button>
        </div>
        <div className="flex gap-2 items-center mt-2">
          <input className="pb-in pb-amount" type="number" inputMode="decimal" autoFocus placeholder="0" value={amount}
            onChange={(e) => { setAmount(e.target.value); setErr(""); }}
            style={{ flex: 1, fontSize: 36, fontWeight: 800, fontFamily: MONO, padding: "8px 12px", textAlign: "right", minWidth: 0 }} />
          <CcySelect value={ccy} onChange={setCcy} />
        </div>
        {ccy !== "HKD" && n(amount) > 0 && <div style={{ fontSize: 13, color: C.ink2, textAlign: "right", marginTop: 4 }}>≈ HK${money(toHKD(amount, ccy, rates))}</div>}
        <div className="mt-3" style={{ fontSize: 12.5, color: C.ink2 }}>{tr("分類", "Category")}</div>
        <div className="flex flex-wrap gap-2 mt-1">
          {presets.map((p) => (
            <button key={p.key} className="pb-tab" onClick={() => { setCat(p.key); setErr(""); }} style={chip(cat === p.key)}>{catEmoji(p.label)} {p.label}</button>
          ))}
          <button className="pb-tab" onClick={() => { setCat("sudden"); setErr(""); }} style={chip(cat === "sudden", C.gold)}>⚡ {tr("突然購買", "Sudden")}</button>
          {st.plans.map((p) => (
            <button key={p.id} className="pb-tab" onClick={() => { setCat("p:" + p.id); setErr(""); }} style={chip(cat === "p:" + p.id, C.jade)}>🎯 {p.name || tr("未命名", "Untitled")}</button>
          ))}
          {st.budget.map((b) => (
            <button key={b.id} className="pb-tab" onClick={() => { setCat("b:" + b.id); setErr(""); }} style={chip(cat === "b:" + b.id)}>{catEmoji(b.name)} {b.name || tr("未命名", "Untitled")}</button>
          ))}
        </div>
        {st.budget.length === 0 && st.plans.length === 0 && (
          <div style={{ fontSize: 12, color: C.ink2, marginTop: 6 }}>{tr("想要自己的分類（例如 Catering、Rent），可以到計劃頁新增。", "Want your own categories, like Catering or Rent? Add them on the Plan tab.")}</div>
        )}
        {st.budget.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <span style={{ fontSize: 12.5, color: C.ink2 }}>{tr("常用", "Quick picks")}</span>
            {QUICK_PRESETS.map(([zh, en], i) => {
              const label = tr(zh, en);
              return (
                <button key={zh} className="pb-tab"
                  onClick={() => { setItem(label); setErr(""); const h = homeOf(i); if (!cat && h) setCat("b:" + h.id); }}
                  style={{ ...chip(item === label), minHeight: 32, padding: "5px 11px", fontSize: 13 }}>{catEmoji(label)} {label}</button>
              );
            })}
          </div>
        )}
        <input className="pb-in mt-3" style={{ width: "100%" }} placeholder={tr("買咗咩？（例如 Philips 牙刷 ×4）", "What was it? (e.g. Philips toothbrush x4)")} value={item} onChange={(e) => setItem(e.target.value)} />
        <div className="flex gap-2 mt-2 items-center">
          <TextIn type="date" value={date} onChange={setDate} />
          <button className="pb-tab" onClick={() => setDate(yest)} style={chip(date === yest)}>{tr("昨天", "Yesterday")}</button>
          <button className="pb-tab" onClick={() => setDate(todayISO())} style={chip(date === todayISO())}>{tr("今天", "Today")}</button>
        </div>
        {err && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{err}</div>}
        <button className="pb-tab" onClick={save} style={{ width: "100%", marginTop: 16, border: "none", borderRadius: 999, padding: "15px 0", fontSize: 17, fontWeight: 800, background: C.jade, color: C.onJade, cursor: "pointer" }}>{tr("記好佢 ✓", "Log it ✓")}</button>
      </div>
    </>
  );
}

export default function Passbook({ lang = "zh", onSignOut, onLang }) {
  const [st, setSt] = useState(null);
  const [tab, setTab] = useState("overview");
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [, setThemeTick] = useState(0);
  // Follow the phone's light/dark setting live.
  useEffect(() => {
    applyTheme();
    const f = () => { applyTheme(); setThemeTick((x) => x + 1); };
    darkMQ?.addEventListener?.("change", f);
    return () => darkMQ?.removeEventListener?.("change", f);
  }, []);
  const [flash, setFlash] = useState("");
  const first = useRef(true);
  const quickMsg = useRef("");   // quick-entry confirmation, shown once the save lands
  const L = (key) => t(lang, key);

  const [ibkr, setIbkr] = useState(null);
  const [mkt, setMkt] = useState(null);
  // Read-only public data: bank deposit rates (weekly) and market FX (daily).
  useEffect(() => { window.marketData?.().then(setMkt).catch(() => setMkt(null)); }, []);
  useEffect(() => { (async () => setSt((await load()) || SEED))(); }, []);
  // Read-only: IBKR prices come from the daily server-side sync, never saved back from here.
  useEffect(() => { window.ibkrData?.().then(setIbkr).catch(() => setIbkr(null)); }, []);
  useEffect(() => {
    if (!st) return;
    if (first.current) { first.current = false; return; }
    const tmr = setTimeout(async () => {
      const ok = await persist(st);
      setFlash(ok ? (quickMsg.current || L("Saved")) : L("Not saved — storage unavailable"));
      quickMsg.current = "";
      setTimeout(() => setFlash(""), 1600);
    }, 500);
    return () => clearTimeout(tmr);
  }, [st, lang]);

  const up = (fn) => setSt((s) => { const c = structuredClone(s); fn(c); return c; });

  const d = useMemo(() => {
    if (!st) return null;
    const rates = st.settings.rates || { USD: 7.8, CNY: 1.09 };
    const pay = payInfo(st, rates, n(st.settings.otPlanHours));
    const income = pay.net;   // take-home after the employee's 5% MPF, incl. the expected OT hours
    const suddenMonthly = n(st.settings.suddenMonthly);
    const plannedExp = st.budget.filter((b) => b.group !== "Savings").reduce((a, b) => a + toHKD(b.amount, b.ccy || "HKD", rates), 0) + suddenMonthly;
    const plannedSave = st.budget.filter((b) => b.group === "Savings").reduce((a, b) => a + toHKD(b.amount, b.ccy || "HKD", rates), 0);
    const essentials = st.budget.filter((b) => b.group === "Living").reduce((a, b) => a + toHKD(b.amount, b.ccy || "HKD", rates), 0);
    const months = [...new Set(st.tx.map((t) => monthKey(t.date)))].sort().reverse();
    const goalTarget = st.goals.reduce((a, g) => a + n(g.target), 0);
    const goalNow = st.goals.reduce((a, g) => a + n(g.current), 0);

    const live = st.deposits.filter((x) => !x.closed).map((x) => ({ ...x, i: depInfo(x, rates) }))
      .sort((a, b) => (a.i.left || 0) - (b.i.left || 0));
    const depHKD = live.reduce((a, x) => a + x.i.hkd, 0);
    const usdHKD = live.filter((x) => x.ccy === "USD").reduce((a, x) => a + x.i.hkd, 0);
    const cnyHKD = live.filter((x) => x.ccy === "CNY").reduce((a, x) => a + x.i.hkd, 0);
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

    const cashHKD = n(st.cash?.balance);
    const debtHKD = (st.debts || []).reduce((a, x) => a + toHKD(x.balance, x.ccy || "HKD", rates), 0);
    const inv = investInfo(st.invest, ibkr, rates);
    const investedHKD = n(st.portfolio.value) + inv.navHKD;
    const netWorth = depHKD + investedHKD + cashHKD - debtHKD;
    const emergencyTarget = plannedExp * n(st.settings.emergencyMonths);
    // Emergency money is what the "Contingency/Emergency" goal holds, not every
    // deposit — the wedding fund sits in deposits too and must not count.
    const eGoal = st.goals.find((g) => /contingen|emergenc|應急|預備/i.test(g.name || ""));
    const emergencyHKD = eGoal ? n(eGoal.current) : depHKD;
    const cover = plannedExp ? emergencyHKD / plannedExp : 0;

    const plansInfo = (st.plans || []).map((p) => ({ ...p, i: planInfo(p, rates, st.tx) }));
    const plansMonthly = plansInfo.reduce((a, p) => a + p.i.perMonth, 0);
    const subs = (st.subs || []).filter((x) => !x.closed).map((x) => ({ ...x, i: subInfo(x, rates) }))
      .sort((a, b) => (Number.isNaN(a.i.left) ? 1e9 : a.i.left) - (Number.isNaN(b.i.left) ? 1e9 : b.i.left));
    const subsMonthly = subs.filter((x) => x.i.status !== "ended").reduce((a, x) => a + x.i.monthlyHKD, 0);
    const dueDeps = live.filter((x) => !x.autoRenew && (x.i.status === "due" || x.i.status === "matured"));
    const dueSubs = subs.filter((x) => x.i.status === "due" || x.i.status === "late");

    return {
      income, plannedExp, plannedSave, essentials, suddenMonthly, plansInfo, plansMonthly, surplus: income - plannedExp - plannedSave - plansMonthly,
      months, goalTarget, goalNow, live, depHKD, usdHKD, cnyHKD, blended, idle, nextManual, due30,
      perBank, banks, avgSave, netWorth, emergencyTarget, cover, rates, cashHKD, debtHKD,
      subs, subsMonthly, dueDeps, dueSubs, inv, investedHKD,
      bankRates: mkt?.rates || null, fx: fxInfo(mkt?.fx || []),
      mpf: mpfInfo(st.mpf, pay.relevant), pay, emergencyHKD, eGoal,
      leaveNow: leaveInfo(st.leave, new Date().getFullYear()), leaveRaw: st.leave, events: st.events || [],
      health: healthInfo(st.health),
    };
  }, [st, ibkr, mkt]);

  if (!st || !d) return <div style={{ padding: 40, fontFamily: MONO, color: C.ink2, background: C.paper }}>{L("Opening Passbook…")}</div>;

  const tr = (zh, en) => (lang === "zh" ? zh : en);
  // Four everyday destinations in the tab bar; the rest live under More.
  const MAIN = [["overview", L("Overview"), "home"], ["deposits", L("Deposits"), "bank"], ["invest", L("Invest"), "chart"], ["fx", L("FX"), "swap"]];
  const MORE = [
    ["health", L("Health"), d.health.last ? tr(`體重及運動紀錄 · ${d.health.last.kg} kg · BMI ${d.health.bmi.toFixed(1)}`, `Weight & workouts · ${d.health.last.kg} kg · BMI ${d.health.bmi.toFixed(1)}`) : tr("體重及運動紀錄", "Weight & workouts"), "💪", C.jadeSoft],
    ["leave", L("Leave"), tr(`年假日曆、公眾假期、行程 · 今年剩 ${d.leaveNow.left} 日`, `Leave calendar, holidays, trips · ${d.leaveNow.left} days left`), "🗓️", C.blueSoft],
    ["subs", L("Subscriptions"), tr("訂閱、合約及保養到期", "Plans, contracts and warranties"), "🔁", C.pinkSoft],
    ["goals", L("Goals"), tr("應急錢、婚禮、旅行", "Emergency, wedding, travel"), "🎯", C.goldSoft],
    ["month", L("Month"), tr("記錄收支，對比預算", "Log spending against the budget"), "🧾", C.chip],
    ["budget", L("Plan"), tr("每月收入與預算", "Monthly income and budget"), "📊", C.blueSoft],
    ["grow", L("Grow"), tr("理財步驟與健康檢查", "Money steps and health check"), "🌱", C.jadeSoft],
  ];
  const title = [...MAIN, ...MORE].find((x) => x[0] === tab)?.[1] || L("Overview");
  const go = (k) => { setTab(k); setMoreOpen(false); window.scrollTo?.({ top: 0 }); };

  return (
    <div className="pb-root" style={{ background: C.paper, color: C.ink, minHeight: "100vh" }}>
      <style>{`
        .pb-root *{box-sizing:border-box}
        .pb-root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.45;-webkit-tap-highlight-color:transparent}
        .pb-in{background:${C.field};border:1px solid ${C.rule};border-radius:12px;padding:10px 12px;font-size:15px;color:${C.ink};outline:none;min-width:0;color-scheme:${C.paper === "#000000" ? "dark" : "light"}}
        @media (pointer:coarse){.pb-in{font-size:16px}}
        .pb-in::placeholder{color:${C.ink2};opacity:.7}
        .pb-in:focus{border-color:${C.jade};box-shadow:0 0 0 3px ${C.jadeSoft}}
        .pb-btn{border-radius:999px;font-weight:700;cursor:pointer;transition:transform .12s ease,opacity .15s;min-height:38px;white-space:nowrap;flex-shrink:0}
        .pb-btn:active,.pb-tab:active{transform:scale(.96)}
        .pb-btn:focus-visible,.pb-tab:focus-visible{outline:2px solid ${C.jade};outline-offset:2px}
        .pb-tab{transition:transform .12s ease}
        .pb-root button{color:inherit}
        .pb-row>.pb-tab:active{transform:scale(.99)}
        .pb-row{border-bottom:1px solid ${C.rule}}
        .pb-row:last-child{border-bottom:none}
        .pb-scroll::-webkit-scrollbar{height:6px}
        .pb-scroll::-webkit-scrollbar-thumb{background:${C.rule};border-radius:3px}
        .pb-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
        .pb-clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .pb-shrink0{flex-shrink:0}
        .pb-dock{position:fixed;left:12px;right:12px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:20;max-width:580px;margin:0 auto;display:flex;gap:8px;align-items:center}
        .pb-nav{flex:1;min-width:0;background:${C.glass};backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);border:1px solid ${C.rule};border-radius:30px;padding:6px;box-shadow:${C.shadow}}
        .pb-navbtn{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;background:none;border:none;padding:6px 0 5px;font-size:11px;font-weight:700;cursor:pointer;min-height:50px;border-radius:24px}
        @media (max-width:390px){.pb-navbtn{font-size:10.5px}}
        .pb-sheet-bg{position:fixed;inset:0;z-index:30;background:${C.scrim};animation:pbFade .2s ease}
        .pb-sheet{position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:31;background:${C.paper};border-radius:30px;padding:10px 12px 14px;max-width:560px;margin:0 auto;box-shadow:${C.shadow};animation:pbUp .28s cubic-bezier(.2,.9,.3,1.15)}
        .pb-amount::-webkit-outer-spin-button,.pb-amount::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .pb-amount{-moz-appearance:textfield;appearance:textfield}
        .pb-fab{flex:none;width:62px;height:62px;border-radius:50%;border:none;background:${C.jade};color:${C.onJade};font-size:32px;font-weight:600;line-height:1;cursor:pointer;box-shadow:${C.shadow};display:grid;place-items:center;transition:transform .12s ease}
        .pb-fab:active{transform:scale(.92)}
        .pb-toast{position:fixed;top:calc(10px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:40;background:${C.ink};color:${C.paper};font-size:13px;font-weight:700;padding:7px 14px;border-radius:999px;box-shadow:${C.shadow};animation:pbDrop .25s ease}
        .pb-pop{animation:pbPop .35s cubic-bezier(.2,.9,.3,1.2)}
        @keyframes pbUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
        @keyframes pbFade{from{opacity:0}to{opacity:1}}
        @keyframes pbDrop{from{transform:translate(-50%,-14px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
        @keyframes pbPop{from{transform:scale(.97);opacity:.6}to{transform:none;opacity:1}}
        @media (prefers-reduced-motion:reduce){.pb-root *{transition:none!important;animation:none!important}}
      `}</style>

      {flash && <div className="pb-toast" role="status">{flash}</div>}

      <header style={{ padding: "calc(18px + env(safe-area-inset-top)) 18px 4px", maxWidth: 780, margin: "0 auto" }}>
        <div style={{ fontSize: 14, color: C.ink2, fontWeight: 600 }}>
          {tab === "overview" ? greeting(lang) : L("Passbook")}
        </div>
        <h1 className="pb-ellipsis" style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.15 }}>{title}</h1>
      </header>

      <main key={tab} className="p-4 space-y-4 pb-pop" style={{ maxWidth: 780, margin: "0 auto", paddingBottom: "calc(110px + env(safe-area-inset-bottom))" }}>
        {tab === "overview" && <Overview st={st} d={d} go={go} lang={lang} />}
        {tab === "grow" && <Grow st={st} d={d} up={up} lang={lang} />}
        {tab === "deposits" && <Deposits st={st} d={d} up={up} lang={lang} />}
        {tab === "subs" && <Subs st={st} d={d} up={up} lang={lang} />}
        {tab === "invest" && <Invest st={st} d={d} up={up} lang={lang} />}
        {tab === "fx" && <Fx st={st} d={d} up={up} lang={lang} />}
        {tab === "leave" && <Leave st={st} d={d} up={up} lang={lang} />}
        {tab === "health" && <Health st={st} d={d} up={up} lang={lang} />}
        {tab === "month" && <Month st={st} d={d} up={up} lang={lang} />}
        {tab === "budget" && <Plan st={st} d={d} up={up} lang={lang} />}
        {tab === "goals" && <Goals st={st} d={d} up={up} lang={lang} />}

        <div className="pt-3 text-center" style={{ fontSize: 11.5, color: C.ink2 }}>
          {L("Synced to your account in the cloud. Rules of thumb, not licensed advice.")}
        </div>
      </main>

      <div className="pb-dock">
      <nav className="pb-nav" aria-label={tr("主要分頁", "Main sections")}>
        <div className="flex gap-1">
          {MAIN.map(([k, label, icon]) => (
            <button key={k} className="pb-navbtn pb-tab" onClick={() => go(k)} aria-current={tab === k ? "page" : undefined}
              style={{ color: tab === k ? C.jade : C.ink2, background: tab === k ? C.jadeSoft : "transparent" }}>
              <NavIcon name={icon} /><span>{label}</span>
            </button>
          ))}
          <button className="pb-navbtn pb-tab" onClick={() => setMoreOpen(true)} aria-haspopup="dialog"
            style={{ color: MORE.some((x) => x[0] === tab) || moreOpen ? C.jade : C.ink2, background: MORE.some((x) => x[0] === tab) ? C.jadeSoft : "transparent", position: "relative" }}>
            <NavIcon name="more" /><span>{tr("更多", "More")}</span>
            {d.dueSubs.length > 0 && <i style={{ position: "absolute", top: 7, right: "30%", width: 8, height: 8, borderRadius: 8, background: C.red }} />}
          </button>
        </div>
      </nav>
      <button className="pb-fab" onClick={() => setQuickOpen(true)} aria-label={tr("記一筆", "Quick entry")}>+</button>
      </div>
      {quickOpen && (
        <QuickEntry st={st} up={up} lang={lang} onClose={() => setQuickOpen(false)}
          onSaved={(msg) => { quickMsg.current = msg; setFlash(msg); setTimeout(() => setFlash(""), 1600); }} />
      )}

      {moreOpen && (
        <>
          <div className="pb-sheet-bg" onClick={() => setMoreOpen(false)} />
          <div className="pb-sheet" role="dialog" aria-modal="true" aria-label={tr("更多", "More")}>
            <div style={{ width: 40, height: 5, borderRadius: 3, background: C.rule, margin: "0 auto 12px" }} />
            <div style={{ background: C.card, borderRadius: 20, overflow: "hidden" }}>
              {MORE.map(([k, label, desc, emoji, tint]) => (
                <button key={k} className="pb-tab pb-row" onClick={() => go(k)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.rule}`, padding: "11px 14px", textAlign: "left", cursor: "pointer", color: C.ink }}>
                  <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 11, background: tint, display: "grid", placeItems: "center", fontSize: 19, flexShrink: 0 }}>{emoji}</span>
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: tab === k ? C.jade : C.ink }}>{label}</span>
                    <span className="pb-ellipsis" style={{ display: "block", fontSize: 12.5, color: C.ink2 }}>{desc}</span>
                  </span>
                  {k === "subs" && d.dueSubs.length > 0 ? <Chip tone="red">{d.dueSubs.length}</Chip> : <span aria-hidden="true" style={{ color: C.ink2, fontSize: 20 }}>›</span>}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3 flex-wrap items-center">
              {onLang && <Btn size="sm" onClick={() => { onLang(); setMoreOpen(false); }}>{lang === "zh" ? "English" : "繁體中文"}</Btn>}
              {onSignOut && <Btn size="sm" onClick={onSignOut}>{L("Sign out")}</Btn>}
              <button className="pb-tab" onClick={() => { if (confirm(L("Reset every figure back to the starting sheet?"))) { setSt(structuredClone(SEED)); setMoreOpen(false); } }}
                style={{ marginLeft: "auto", background: "none", border: "none", color: C.red, fontSize: 12.5, cursor: "pointer", padding: 8 }}>
                {tr("清除所有資料", "Erase all data")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Time-of-day hello for the Overview header.
function greeting(lang) {
  const h = new Date().getHours();
  const zh = h < 5 ? "夜深了" : h < 12 ? "早晨" : h < 18 ? "午安" : "晚安";
  const en = h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return lang === "zh" ? `${zh} 👋` : `${en} 👋`;
}

// Simple 1.6px-stroke glyphs for the tab bar.
function NavIcon({ name }) {
  const p = {
    home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
    bank: "M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18",
    chart: "M4 19h16M5 15l4.5-4.5 3.5 3L19 7.5M15 7.5h4v4",
    swap: "M7 7h12l-3.5-3.5M17 17H5l3.5 3.5",
    more: "M5 12h.01M12 12h.01M19 12h.01",
  }[name];
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={p} />
    </svg>
  );
}

/* ── OVERVIEW ────────────────────────────────────────────────── */
function Stat({ label, v, accent, sub, prefix = "HK$", icon, onClick }) {
  const body = (
    <>
      <div className="flex items-center gap-1" style={{ fontSize: 13, color: C.ink2, fontWeight: 650 }}>{icon && <span aria-hidden="true">{icon}</span>}{label}</div>
      <div className="mt-1"><Num value={typeof v === "string" ? v : money(v)} prefix={prefix} size={22} weight={800} color={accent === C.ink2 || !accent ? C.ink : accent} wrap /></div>
      {sub && <div style={{ fontSize: 12, color: C.ink2, marginTop: 1 }}>{sub}</div>}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="pb-tab p-3" style={{ display: "block", width: "100%", textAlign: "left", background: C.card, border: `1px solid ${C.rule}`, borderRadius: 22, cursor: "pointer", color: C.ink }}>{body}</button>
  ) : <Card pad="p-3">{body}</Card>;
}
// 12,345 → "12.3k", 1,234,567 → "1.23M" for compact chips.
const kfmt = (v) => { const x = Math.abs(n(v)); return (n(v) < 0 ? "−" : "") + (x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e4 ? (x / 1e3).toFixed(1) + "k" : money(x)); };

function Overview({ st, d, go, lang }) {
  const L = (key) => t(lang, key);
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const traj = useMemo(() => {
    const rows = [];
    for (let i = 0; i <= 24; i++) {
      rows.push({
        m: addMonths(todayISO(), i).toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { month: "short", year: "2-digit" }),
        Planned: Math.round(d.goalNow + d.plannedSave * i),
        Actual: d.avgSave ? Math.round(d.goalNow + d.avgSave * i) : null,
      });
    }
    return rows;
  }, [d, lang]);
  const hit = d.plannedSave > 0 ? addMonths(todayISO(), Math.ceil(Math.max(0, d.goalTarget - d.goalNow) / d.plannedSave)) : null;

  return (
    <div className="space-y-4">
      <div style={{ background: C.hero, color: C.heroInk, borderRadius: 28, padding: "20px 20px 18px" }}>
        <div style={{ fontSize: 14, color: C.heroInk2, fontWeight: 650 }}>{tr("淨資產", "Net worth")}</div>
        <div style={{ marginTop: 2 }}><Num value={money(d.netWorth)} prefix="HK$" size={38} weight={800} color={C.heroInk} /></div>
        {d.mpf.last && <div style={{ fontSize: 13, color: C.heroInk2, marginTop: 2 }}>{tr(`連強積金約 HK$${money(d.netWorth + d.mpf.est)}`, `≈ HK$${money(d.netWorth + d.mpf.est)} with MPF`)}</div>}
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 14 }}>
          {[
            [tr("定存", "Deposits"), d.depHKD, "deposits"],
            [tr("投資", "Invested"), d.investedHKD, "invest"],
            [tr("現金", "Cash"), d.cashHKD, null],
          ].map(([l, v, k]) => (
            <button key={l} className="pb-tab" onClick={() => k && go(k)}
              style={{ background: C.heroChip, color: C.heroInk, border: "none", borderRadius: 999, padding: "7px 12px", fontSize: 13, fontWeight: 650, cursor: k ? "pointer" : "default" }}>
              {l} <span style={{ fontFamily: MONO, fontWeight: 800 }}>{kfmt(v)}</span>
              {k === "invest" && d.inv.snap && (
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11.5, opacity: 0.85, marginLeft: 4 }}>
                  {d.inv.pnlPct >= 0 ? "▲" : "▼"}{Math.abs(d.inv.pnlPct).toFixed(1)}%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <ComingUp d={d} go={go} lang={lang} />

      <div className="grid grid-cols-2 gap-3">
        <Stat icon="💰" label={L("Blended yield")} v={`${d.blended.toFixed(2)}%`} prefix="" accent={C.gold} sub={tr(`${d.live.length} 筆定存`, `${d.live.length} deposits`)} onClick={() => go("deposits")} />
        <Stat icon="🐷" label={L("Kept per month")} v={d.plannedSave} accent={C.jade} sub={tr(`收入的 ${d.income ? ((d.plannedSave / d.income) * 100).toFixed(0) : 0}%`, `${d.income ? ((d.plannedSave / d.income) * 100).toFixed(0) : 0}% of income`)} onClick={() => go("budget")} />
        <Stat icon="🏖️" label={tr("年假剩", "Leave left")} v={`${d.leaveNow.left}`} prefix="" accent={C.blue} sub={tr(`${d.leaveNow.year} 年 · 日`, `days in ${d.leaveNow.year}`)} onClick={() => go("leave")} />
        <Stat icon="💪" label={tr("體重", "Weight")} v={d.health.kgNow ? `${d.health.kgNow} kg` : "—"} prefix="" accent={C.ink}
          sub={d.health.kgNow ? `BMI ${d.health.bmi.toFixed(1)}${d.health.ms ? tr(` · 目標 ${d.health.ms.kg}`, ` · goal ${d.health.ms.kg}`) : ""}` : tr("未記錄", "not logged")} onClick={() => go("health")} />
      </div>

      <Card>
        <div className="flex justify-between items-baseline">
          <Eyebrow>{L("Goal funding")}</Eyebrow>
          <span style={{ fontSize: 11, color: C.ink2 }}>{tr(`HK$${money(d.goalNow)}／HK$${money(d.goalTarget)}`, `HK$${money(d.goalNow)} of HK$${money(d.goalTarget)}`)}</span>
        </div>
        <div className="mt-2"><Bar2 pct={d.goalTarget ? (d.goalNow / d.goalTarget) * 100 : 0} h={8} /></div>
        <div className="mt-3" style={{ fontSize: 12.5, color: C.ink2 }}>
          {hit ? tr(<>以每月 HK${money(d.plannedSave)} 的速度，所有目標會在 <b style={{ color: C.ink }}>{fmtDate(hit, lang)}</b> 前達成。</>, <>At HK${money(d.plannedSave)} a month every goal is covered by <b style={{ color: C.ink }}>{fmtDate(hit, lang)}</b>.</>) : L("Set a monthly savings amount on the Plan tab.")}
        </div>
      </Card>

      <Card>
        <Eyebrow>{L("Savings line")}</Eyebrow>
        <div style={{ fontSize: 11.5, color: C.ink2, margin: "2px 0 8px" }}>
          {L("Goal progress carried forward 24 months.")}{d.avgSave ? L("Dashed line is your actual pace from the ledger.") : ""}
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={traj} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} interval={3} tickLine={false} axisLine={{ stroke: C.rule }} />
              <YAxis tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 12, fontFamily: MONO }} formatter={(v) => "HK$" + money(v)} />
              <ReferenceLine y={d.goalTarget} stroke={C.red} strokeDasharray="5 4" label={{ value: L("goal total"), position: "insideTopRight", fontSize: 10, fill: C.red }} />
              <Line type="monotone" dataKey="Planned" name={tr("計劃", "Planned")} stroke={C.jade} strokeWidth={2.5} dot={false} />
              {d.avgSave > 0 && <Line type="monotone" dataKey="Actual" name={tr("實際", "Actual")} stroke={C.gold} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Btn onClick={() => go("grow")}>{L("What to do next")}</Btn>
        <Btn onClick={() => go("month")}>{L("Log an entry")}</Btn>
      </div>
    </div>
  );
}

/* ── COMING UP: deposits and subscriptions that need a decision ── */
function ComingUp({ d, go, lang }) {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const rows = [
    ...d.dueDeps.map((x) => ({
      id: x.id, tab: "deposits", date: x.i.maturity, left: x.i.left,
      title: `${x.bank} · ${ccySign(x.ccy)}${money(x.principal)} ${tr("定存", "deposit")}`,
      what: depPlan(x, lang), late: x.i.left <= 0,
      extra: (() => { const b = bestFor(d.bankRates, x.ccy); return b ? tr(`今日最高：${b.bank} ${b.months} 個月 ${n(b.rate).toFixed(2)}%`, `Best today: ${b.bank} ${b.months}M at ${n(b.rate).toFixed(2)}%`) : null; })(),
    })),
    ...(d.mpf.stale || d.mpf.empty ? [{
      id: "mpf", tab: "invest",
      date: d.mpf.last ? new Date(new Date(d.mpf.last.date).getTime() + MPF_STALE_DAYS * DAY) : new Date(),
      left: d.mpf.last ? MPF_STALE_DAYS - d.mpf.age : 0, late: d.mpf.stale,
      title: tr("更新強積金結餘", "Update your MPF balance"),
      what: tr("打開 eMPF App，把總結餘抄到「投資 › 強積金」，或把截圖發給 Claude。", "Open the eMPF app and copy the total into Invest › MPF, or send Claude a screenshot."),
    }] : []),
    ...(d.events || []).filter((e) => { const k = daysBetween(new Date(), e.start); return k >= 0 && k <= 7; }).map((e) => ({
      id: "ev-" + e.id, tab: "leave", date: new Date(e.start + "T00:00:00"), left: daysBetween(new Date(), e.start), late: false,
      title: e.title, what: [e.time, e.note].filter(Boolean).join(" · ") || tr("行程", "Plan"),
      extra: (() => { const k = leaveNeeded(d.leaveRaw, e).length; return k ? tr(`需請 ${k} 日假`, `Needs ${k} day${k > 1 ? "s" : ""} of leave`) : null; })(),
    })),
    ...(d.health.start && (!d.health.last || daysBetween(d.health.last.date, new Date()) >= 7) ? [{
      id: "weigh-in", tab: "health", date: new Date(), left: 0, late: false,
      title: tr("量一量體重", "Weigh in"),
      what: tr("一星期未有記錄體重。早上起床、去完洗手間後量，記錄到「健康」。", "No weight logged for a week. Weigh in the morning after the bathroom, then log it under Health."),
    }] : []),
    ...(d.leaveNow.left > 0 && daysBetween(new Date(), `${d.leaveNow.year}-12-31`) <= 60 ? [{
      id: "leave-year-end", tab: "leave", date: new Date(`${d.leaveNow.year}-12-31T00:00:00`), left: daysBetween(new Date(), `${d.leaveNow.year}-12-31`), late: false,
      title: tr(`${d.leaveNow.year} 年假還有 ${d.leaveNow.left} 日`, `${d.leaveNow.left} days of ${d.leaveNow.year} leave left`),
      what: tr("年底前安排好，或確認公司是否容許帶到明年。", "Book them before year-end, or check whether your company lets you carry them over."),
    }] : []),
    ...d.dueSubs.map((x) => ({
      id: x.id, tab: "subs", date: x.i.actBy, left: x.i.left,
      title: x.name || tr("未命名", "Untitled"),
      what: (x.action && String(x.action).trim()) || tr("到了要處理的日子，打開「訂閱」看詳情。", "Time to act — open Subscriptions for the details."),
      late: x.i.left < 0,
    })),
    ...(d.inv.buy && ["soon", "due", "late"].includes(d.inv.buy.status) ? [(() => {
      const b = d.inv.buy, p = d.inv.plan;
      return {
        id: "invest-" + b.key, tab: "invest", date: b.start, left: b.left, late: b.status === "late",
        title: tr(`IBKR 季度買入 · HK$${money(b.amountHKD)}`, `IBKR quarterly buy · HK$${money(b.amountHKD)}`),
        what: tr(`轉 HK$${money(b.amountHKD)} 到 IBKR 並換成美元，然後買約 US$${money(b.a.spend)} ${p.fundA}、US$${money(b.b.spend)} ${p.fundB}。股數和限價見「投資」頁，買完按「已完成」。`,
          `Move HK$${money(b.amountHKD)} to IBKR and convert to USD, then buy about US$${money(b.a.spend)} of ${p.fundA} and US$${money(b.b.spend)} of ${p.fundB}. Shares and limit prices are on the Invest tab; tap Done when bought.`),
      };
    })()] : []),
  ].sort((a, b) => a.left - b.left);
  if (!rows.length) return null;
  const tabName = { deposits: tr("定存", "Deposits"), invest: tr("投資", "Invest"), subs: tr("訂閱", "Subscriptions"), leave: tr("假期", "Leave"), health: tr("健康", "Health") };
  const shown = all ? rows : rows.slice(0, 3);
  return (
    <Card accent={rows.some((r) => r.late) ? C.red : C.gold}>
      <div className="flex justify-between items-baseline gap-2">
        <Eyebrow color={C.ink}>{tr("即將要處理", "Coming up")}</Eyebrow>
        <span style={{ fontSize: 12, color: C.ink2 }}>{tr(`${rows.length} 項`, `${rows.length} item${rows.length > 1 ? "s" : ""}`)}</span>
      </div>
      {d.idle > 0 && (
        <div style={{ fontSize: 12.5, color: C.red, fontWeight: 600, marginTop: 4 }}>
          {tr(`有 HK$${money(d.idle)} 已到期未再存放，正在少賺利息。`, `HK$${money(d.idle)} has matured and isn't placed yet, so it's earning little.`)}
        </div>
      )}
      <div className="mt-1">
        {shown.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="pb-row">
              <button onClick={() => setOpen(isOpen ? null : r.id)} className="pb-tab" aria-expanded={isOpen}
                style={{ display: "block", width: "100%", background: "none", border: "none", padding: "11px 0", textAlign: "left", cursor: "pointer", color: C.ink }}>
                <div className="flex justify-between items-center gap-2">
                  <span className="pb-ellipsis" style={{ fontWeight: 700, fontSize: 14.5, flex: "1 1 auto" }}>{r.title}</span>
                  <span className="pb-shrink0"><Chip tone={r.late ? "red" : "gold"}>{r.left <= 0 ? (r.left === 0 ? tr("今日", "today") : tr(`過了 ${-r.left} 日`, `${-r.left}d ago`)) : tr(`${r.left} 日後`, `in ${r.left}d`)}</Chip></span>
                </div>
                <div className={isOpen ? "" : "pb-clamp2"} style={{ fontSize: 13, lineHeight: 1.5, marginTop: 3, color: C.ink2, whiteSpace: "pre-line" }}>{r.what}</div>
              </button>
              {isOpen && (
                <div className="flex justify-between items-center gap-2" style={{ paddingBottom: 11 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.jade }}>{r.extra || ""}</span>
                  <Btn size="sm" onClick={() => go(r.tab)}>{tr(`前往${tabName[r.tab] || ""}`, `Open ${tabName[r.tab] || ""}`)}</Btn>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {rows.length > 3 && (
        <button className="pb-tab" onClick={() => setAll(!all)}
          style={{ background: "none", border: "none", color: C.jade, fontWeight: 700, fontSize: 13, padding: "8px 0 0", cursor: "pointer" }}>
          {all ? tr("收起", "Show fewer") : tr(`顯示全部 ${rows.length} 項`, `Show all ${rows.length}`)}
        </button>
      )}
    </Card>
  );
}

/* ── GROW: the coach ─────────────────────────────────────────── */
function Grow({ st, d, up, lang }) {
  const L = (key) => t(lang, key);
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const rates = st.settings.rates;
  const s = st.settings;
  const invRate = n(s.investReturn);
  const monthlySave = d.plannedSave;
  const gapToEmergency = Math.max(0, d.emergencyTarget - d.emergencyHKD);

  const rate = d.income ? (monthlySave / d.income) * 100 : 0;
  const usdPct = d.depHKD ? (d.usdHKD / d.depHKD) * 100 : 0;
  const cnyPct = d.depHKD ? (d.cnyHKD / d.depHKD) * 100 : 0;
  const biggestBank = d.perBank[0];

  const checks = [
    {
      t: L("Savings rate"), s: rate >= 30 ? "good" : rate >= 15 ? "watch" : "act", v: `${rate.toFixed(0)}%`,
      l: rate >= 30 ? tr("遠高於一般人約 20% 的水平。這是你最大的優勢——先保護它，再考慮任何其他優化。", "Well above the 20% most people manage. This is your real advantage — protect it before optimising anything else.")
        : rate >= 15 ? tr("表現不錯。這裡每多一個百分點，都勝過追逐任何存款利率。", "Respectable. Every extra point here beats any rate you can chase.")
          : tr("低於 15%。先解決這個問題，再看這頁其他內容。", "Below 15%. Fix this before anything else on this page."),
    },
    {
      t: L("Emergency cushion"), s: d.cover >= 6 ? "good" : d.cover >= 3 ? "watch" : "act", v: `${d.cover.toFixed(1)} ${tr("個月", "mo")}`,
      l: d.cover >= 6 ? tr("已經足夠。新資金可以開始投入增長，不用再放在現金。", "Fully stocked. New money can go to work instead of sitting in cash.")
        : tr(`應急錢覆蓋了 ${d.cover.toFixed(1)} 個月的支出。在投資任何一塊錢之前，先補到 ${s.emergencyMonths} 個月（HK$${money(d.emergencyTarget)}）。`, `Emergency money covers ${d.cover.toFixed(1)} months of spending. Fill to ${s.emergencyMonths} months (HK$${money(d.emergencyTarget)}) before investing a dollar.`),
    },
    {
      t: L("Idle money"), s: d.idle > 0 ? "act" : "good", v: d.idle > 0 ? `HK$${money(d.idle)}` : tr("沒有", "None"),
      l: d.idle > 0 ? tr(`已到期但未再存放。以 ${d.blended.toFixed(2)}% 計算，每個月閒置大約損失 HK$${money((d.idle * d.blended / 100) / 12, 0)} 利息。`, `Matured and not re-placed. At ${d.blended.toFixed(2)}% that is about HK$${money((d.idle * d.blended / 100) / 12, 0)} of interest lost for every month it sits.`)
        : tr("沒有到期後被遺忘的資金——12 筆定存的階梯最容易出這個錯，繼續保持。", "Nothing matured and forgotten. Keep it that way — this is the one thing a 12-deposit ladder gets wrong."),
    },
    {
      t: L("Blended yield"), s: d.blended >= 3 ? "good" : d.blended >= 2.5 ? "watch" : "act", v: `${d.blended.toFixed(2)}%`,
      l: tr(`這是你目前所有定存按金額加權的平均年利率。以你設定的 ${s.inflation}% 通脹假設計算，你的實質回報是 ${(d.blended - n(s.inflation)).toFixed(2)}%——Passbook 沒有接入即時市場利率，續存前請自行比較銀行公佈的最新牌價，不要以這裡的數字為準。`, `This is the amount-weighted average rate across your current deposits. At your ${s.inflation}% inflation assumption, your real return is ${(d.blended - n(s.inflation)).toFixed(2)}% — Passbook has no live market-rate feed, so compare actual published bank rates yourself before renewing rather than relying on this figure.`),
    },
    {
      t: L("Currency mix"), s: cnyPct > 40 ? "act" : cnyPct > 15 ? "watch" : "good", v: tr(`${usdPct.toFixed(0)}% 美元 · ${cnyPct.toFixed(0)}% 人民幣`, `${usdPct.toFixed(0)}% USD · ${cnyPct.toFixed(0)}% CNY`),
      l: cnyPct > 15
        ? tr(`人民幣定存目前佔你定存總額的 ${cnyPct.toFixed(0)}%。人民幣沒有像港元兌美元那樣的掛鈎，在岸／離岸（CNH）匯價會自行波動，加上個人購匯額度限制，實際的匯率與流動性風險比美元大得多——${cnyPct > 40 ? "目前佔比偏高，值得評估是否要收窄。" : "留意額度與匯價，避免佔比再擴大。"}`, `CNY deposits are currently ${cnyPct.toFixed(0)}% of your total. Unlike the HKD/USD peg, CNY has no such anchor: onshore/offshore (CNH) rates move on their own, and personal conversion quotas apply, so it carries real FX and liquidity risk — ${cnyPct > 40 ? "worth reassessing whether this concentration is intentional." : "keep an eye on quotas and rates so it doesn't grow further."}`)
        : tr("港元與美元掛鈎在 7.75–7.85 區間，所以美元定存對你幾乎沒有匯率風險，但換匯價差會吃掉小額資金多賺的利息——只在存 6 個月或以上時才換幣，不要來回換。人民幣沒有這種掛鈎，往後若增持要留意在岸／離岸匯價波動與個人購匯額度。", "The HKD is pegged in a 7.75–7.85 band, so USD deposits carry little FX risk for you. But the conversion spread eats much of the extra yield on small sums — only switch currency for 6-month terms or longer, and don't convert back and forth. CNY has no such peg, so watch onshore/offshore rates and personal conversion quotas if you add more."),
    },
    {
      t: L("Per-bank exposure"), s: biggestBank && biggestBank.hkd > 800000 ? "act" : "good",
      v: biggestBank ? `HK$${money(biggestBank.hkd)}` : "—",
      l: tr(`存款保障計劃過去保障每個存戶每間銀行 HK$800,000（港元或外幣），定存年期五年內適用——保障金額由計劃公佈，並非即時數據，請以官方公告為準。你最大的一間是 ${biggestBank ? biggestBank.bank : "—"}——按此金額計算目前仍在保障範圍內。結構性或掛鈎存款不受保障，應避免。`, `The Deposit Protection Scheme has covered up to HK$800,000 per depositor per bank, HKD or foreign currency, on time deposits up to five years — this is a published scheme limit, not live data, so confirm the current figure officially. Your largest is ${biggestBank ? biggestBank.bank : "—"} — comfortably inside at that limit. Structured or currency-linked deposits are not covered, so avoid them.`),
    },
    {
      t: L("Money that compounds"), s: d.investedHKD > 0 ? "good" : "act",
      v: d.netWorth ? `${((d.investedHKD / d.netWorth) * 100).toFixed(0)}%` : "0%",
      l: d.investedHKD > 0 ? tr("部分資金正在增長，不只是賺利息。保持每月自動買入，不用理會價格波動。", "Some of your money is growing rather than just earning. Keep the monthly buying automatic and ignore the price.")
        : tr("目前全部是現金。定存能保護資金，但不能讓它增長。預備金補滿後，這是你能做的最大改變。", "Everything sits in cash. Deposits protect money; they don't grow it. Once the cushion is full, this is the single biggest change available to you."),
    },
  ];

  const topSpendRow = [...st.budget].filter((b) => b.group !== "Savings").sort((a, b) => toHKD(b.amount, b.ccy || "HKD", rates) - toHKD(a.amount, a.ccy || "HKD", rates))[0];
  const topSpendHKD = topSpendRow ? toHKD(topSpendRow.amount, topSpendRow.ccy || "HKD", rates) : 0;
  const levers = [
    { t: tr("加薪 10%，或轉工", "Get a 10% pay rise, or change job"), v: d.income * 12 * 0.1, how: tr("一次對話或一次轉職就能達成，而且往後每年都會複製一次，這裡沒有其他方法能比。", "One conversation or one move. Nothing else here comes close, and it repeats every year after.") },
    { t: tr("把新增儲蓄拿去投資，而不是存定存", "Invest new savings instead of depositing"), v: monthlySave * 12 * ((invRate - d.blended) / 100), how: tr(`每月 HK$${money(monthlySave)} 以 ${invRate}% 而非 ${d.blended.toFixed(2)}% 計算——只是第一年的差距，之後會持續複利增長。`, `HK$${money(monthlySave)} a month at ${invRate}% rather than ${d.blended.toFixed(2)}% — first-year gap only, and it compounds from there.`) },
    { t: tr(`削減「${topSpendRow ? topSpendRow.name : "最大一項支出"}」15%`, `Trim ${topSpendRow ? topSpendRow.name.toLowerCase() : "your biggest line"} by 15%`), v: topSpendHKD * 0.15, how: tr("一次性調整，之後每年持續生效，不需要市場配合。", "Permanent, repeats every year, needs no market to cooperate.") },
    { t: tr("把每筆定存都轉到最佳利率（+0.6%）", "Move every deposit to the best rate (+0.6%)"), v: d.depHKD * 0.006, how: tr("值得在續存時做——但跟上面幾項比，會發現差距很小。", "Worth doing at renewal — but notice how small it is next to the lines above.") },
    { t: tr("到期資金絕不閒置", "Never leave matured money idle"), v: (d.depHKD * d.blended / 100) / 365 * 14, how: tr("每次續存平均閒置兩星期，一年內所有到期日加起來就是這個數。", "Two weeks of drift per rollover, added up across a year of maturities.") },
  ].sort((a, b) => b.v - a.v);
  const maxLever = Math.max(...levers.map((x) => x.v), 1);

  const proj = useMemo(() => {
    const years = 20, rA = d.blended / 100 / 12, rB = invRate / 100 / 12;
    let a = d.depHKD, bDep = d.depHKD, bInv = d.investedHKD, gap = gapToEmergency;
    const rows = [{ y: tr("現在", "now"), Deposits: Math.round(a), Split: Math.round(bDep + bInv) }];
    for (let m = 1; m <= years * 12; m++) {
      a = a * (1 + rA) + monthlySave;
      bDep = bDep * (1 + rA); bInv = bInv * (1 + rB);
      if (gap > 0) { bDep += monthlySave; gap -= monthlySave; } else { bInv += monthlySave; }
      if (m % 12 === 0) rows.push({ y: `${m / 12}${tr("年", "y")}`, Deposits: Math.round(a), Split: Math.round(bDep + bInv) });
    }
    return rows;
  }, [d.blended, d.depHKD, invRate, monthlySave, gapToEmergency, d.investedHKD, lang]);
  const last = proj[proj.length - 1];
  const gap20 = last.Split - last.Deposits;
  const real20 = gap20 / Math.pow(1 + n(s.inflation) / 100, 20);

  // Goals due within 3 years that deposits alone can (or can't) still cover —
  // the one part of "money needed soon stays in deposits" this app can actually verify.
  const near3yShort = st.goals.reduce((a, g) => {
    const dl = daysBetween(new Date(), g.deadline);
    if (!Number.isFinite(dl) || dl <= 0 || dl / 365 > 3) return a;
    return a + Math.max(0, n(g.target) - n(g.current));
  }, 0);

  const cashBalance = n(st.cash?.balance);
  const cashShort = Math.max(0, d.plannedExp - cashBalance);
  const highInterestDebt = st.debts.reduce((a, x) => a + (n(x.rate) > 6 ? toHKD(x.balance, x.ccy || "HKD", rates) : 0), 0);

  const steps = [
    { n: 1, t: tr("一個月的開支保持流動", "One month of spending stays liquid"), amt: d.plannedExp, done: cashBalance >= d.plannedExp,
      l: cashBalance >= d.plannedExp
        ? tr(`活期戶口有 HK$${money(cashBalance)}，足夠覆蓋一個月 HK$${money(d.plannedExp)} 的開支，不鎖進任何定期。這樣遇到突發開支時，才不會被逼提早解約定存、損失利息。`, `HK$${money(cashBalance)} in the current account covers a full month's HK$${money(d.plannedExp)} of spending, none of it locked in a term. This is what stops an unexpected bill from forcing you to break a deposit early and forfeit the interest.`)
        : tr(`活期戶口目前 HK$${money(cashBalance)}，距離一個月 HK$${money(d.plannedExp)} 的開支還差 HK$${money(cashShort)}。先把這筆補到活期戶口，不鎖進任何定期。`, `The current account holds HK$${money(cashBalance)}, still HK$${money(cashShort)} short of a full month's HK$${money(d.plannedExp)} of spending. Build this up in the current account first, none of it locked in a term.`),
      extra: (
        <div className="mt-2" style={{ maxWidth: 220 }}>
          <Lbl t={tr("目前活期戶口餘額 HK$", "Current-account balance now, HK$")}>
            <TextIn type="number" right value={st.cash?.balance ?? 0} onChange={(v) => up((x) => { x.cash.balance = v; })} />
          </Lbl>
        </div>
      ) },
    { n: 2, t: tr(`${s.emergencyMonths} 個月的階梯式預備金`, `Cushion of ${s.emergencyMonths} months, laddered`), amt: d.emergencyTarget, done: gapToEmergency <= 0,
      l: gapToEmergency > 0 ? tr(`還差 HK$${money(gapToEmergency)}。繼續用 Mox 短期定存，讓每個月都有一筆到期——短期利率加上近乎即時的靈活性。`, `HK$${money(gapToEmergency)} still to build. Keep using short Mox terms so a rung matures every month — term rates with near-instant access.`)
        : tr("已經足夠。續存就好，不用再加碼——之後多出來的錢全部進第 5 步。", "Full. Roll it, don't grow it. Everything beyond this goes to step 5.") },
    { n: 3, t: tr("清還任何利率高於約 6% 的債務", "Clear anything costing more than about 6%"), amt: highInterestDebt || null, done: highInterestDebt <= 0,
      l: highInterestDebt > 0
        ? tr(`目前有 HK$${money(highInterestDebt)} 的負債利率高於 6%——卡數、分期、學費貸款之類。優先還清這筆，等於一個保證回報，沒有任何定存比得上。`, `HK$${money(highInterestDebt)} of debt is currently costing more than 6% — card balances, instalment plans, tuition financing and the like. Clear this first: it's a guaranteed return no deposit can match.`)
        : st.debts.length > 0
          ? tr("目前記錄的負債利率都不高於 6%，這一步不用優先處理。", "None of your recorded debts cost more than 6% — nothing urgent to clear here.")
          : tr("目前沒有記錄任何負債。如果有卡數、分期或學費貸款，加在下面。", "No debts recorded. If you have card balances, instalment plans, or tuition financing, add them below."),
      extra: (
        <div className="mt-2 space-y-2">
          {st.debts.map((deb, i) => (
            <div key={deb.id} style={{ background: C.field, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 10 }}>
              <div className="flex gap-2">
                <TextIn value={deb.name} onChange={(v) => up((x) => { x.debts[i].name = v; })} placeholder={tr("負債名稱（例如：信用卡）", "Debt name (e.g. credit card)")} />
                <Btn size="sm" tone="danger" onClick={() => up((x) => { x.debts.splice(i, 1); })}>×</Btn>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Lbl t={tr("結餘", "Balance")}><TextIn type="number" right value={deb.balance} onChange={(v) => up((x) => { x.debts[i].balance = v; })} /></Lbl>
                <Lbl t={L("Currency")}><CcySelect value={deb.ccy} onChange={(v) => up((x) => { x.debts[i].ccy = v; })} w="100%" /></Lbl>
                <Lbl t={L("Rate % p.a.")}><TextIn type="number" step="0.1" right value={deb.rate} onChange={(v) => up((x) => { x.debts[i].rate = v; })} /></Lbl>
              </div>
            </div>
          ))}
          <Btn size="sm" onClick={() => up((x) => { x.debts.push({ id: uid(), name: "", balance: 0, rate: 0, ccy: "HKD" }); })}>{tr("+ 新增負債", "+ Add a debt")}</Btn>
        </div>
      ) },
    { n: 4, t: tr("三年內要用的錢，繼續放定存", "Money needed within 3 years stays in deposits"), amt: near3yShort || null, done: near3yShort <= d.depHKD,
      l: near3yShort > d.depHKD
        ? tr(`三年內到期的目標還差 HK$${money(near3yShort)}，但你的定存總額只有 HK$${money(d.depHKD)}，不夠完全覆蓋。旅行、父母的手機、駕駛牌照——把定存年期對準用錢的日子，例如選一筆在付款前一星期到期的 6 個月定存。`, `Goals due within 3 years still need HK$${money(near3yShort)}, but your total deposits are only HK$${money(d.depHKD)} — not quite enough to cover them. Travel, parents' phone, the driving licence — match the term to the date you need it, a 6-month deposit maturing the week before you pay.`)
        : tr("三年內到期的目標，目前定存總額足以覆蓋。繼續把年期對準用錢的日子，例如選一筆在付款前一星期到期的 6 個月定存，而不是之後才到期。", "Your total deposits currently cover what's needed for goals due within 3 years. Keep matching the term to the date you need it — a 6-month deposit maturing the week before you pay, not the week after.") },
    { n: 5, t: tr("之後所有錢，每月定投一隻環球指數基金", "Everything after that buys a global index fund, monthly"), amt: monthlySave, done: d.investedHKD > 0,
      l: tr("每月同一天、同一金額，不擇時。以現行規則，香港不徵資本增值或股息稅，愛爾蘭註冊的 UCITS 基金一般適用 15% 美股股息預扣稅（而非 30%），也有助避開美股持倉的美國遺產稅風險——稅務規則會隨時間或個人情況變動，Passbook 沒有替你核實，投資前請自行確認最新規則或諮詢專業意見。", "Same day each month, same amount, no timing. Under current rules, Hong Kong charges no tax on capital gains or dividends, and an Irish-domiciled UCITS fund generally sees 15% US dividend withholding instead of 30%, which also helps avoid US estate-tax exposure on US-listed holdings — tax rules change over time and by individual circumstance, and Passbook hasn't verified any of this for you, so confirm the current rules yourself or get professional advice before investing.") },
    { n: 6, t: tr("然後專注提升收入，而非追逐利率", "Then push income, not yield"), amt: null, done: false,
      l: tr(`以你目前的餘額，多 1% 利率只值 HK$${money(d.depHKD * 0.01)} 一年，而加薪 10% 是 HK$${money(d.income * 12 * 0.1)}。把時間花在後者——這正是「書籍」和「課程」這兩項預算存在的原因。`, `At your balance +1% of yield is HK$${money(d.depHKD * 0.01)} a year. A 10% raise is HK$${money(d.income * 12 * 0.1)}. Spend your evenings on the second one — that's what the books and courses line is for.`) },
  ];

  return (
    <div className="space-y-4">
      <Card accent={C.blue}>
        <div className="flex justify-between items-start gap-2">
          <div>
            <Eyebrow color={C.blue}>{L("The order money should move")}</Eyebrow>
            <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 3 }}>{L("Finish each step before starting the next. Most money mistakes are steps taken out of order.")}</div>
          </div>
          <Chip tone="blue">{L("rule of thumb")}</Chip>
        </div>
        <ol className="mt-3 space-y-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {steps.map((x) => {
            const circleBg = x.done === true ? C.jadeSoft : x.done === false ? C.goldSoft : C.chip;
            const circleFg = x.done === true ? C.jade : x.done === false ? C.gold : C.ink2;
            return (
              <li key={x.n} className="flex gap-3">
                <div style={{ minWidth: 24, height: 24, borderRadius: 2, background: circleBg, color: circleFg, fontFamily: MONO, fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{x.n}</div>
                <div style={{ flex: 1 }}>
                  <div className="flex justify-between gap-2 items-baseline">
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{x.t}</span>
                    {x.amt != null && <Num value={money(x.amt)} prefix="HK$" size={12.5} color={C.ink2} />}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.5, marginTop: 2 }}>{x.l}</div>
                  {x.extra}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card>
        <Eyebrow>{L("What acceleration actually looks like")}</Eyebrow>
        <div style={{ fontSize: 12.5, color: C.ink2, margin: "3px 0 8px" }}>
          {tr(`同樣每月 HK$${money(monthlySave)}，兩個去處：全部放在定存，以你的平均 ${d.blended.toFixed(2)}% 計算；或是先補滿預備金，再以 ${invRate}% 投資環球指數基金。`, `The same HK$${money(monthlySave)} a month, two destinations: everything in deposits at your blended ${d.blended.toFixed(2)}%, or cushion first and then a world index fund at ${invRate}%.`)}
        </div>
        <div style={{ height: 215 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={proj} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="y" tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} interval={1} tickLine={false} axisLine={{ stroke: C.rule }} />
              <YAxis tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 12, fontFamily: MONO }} formatter={(v) => "HK$" + money(v)} />
              <Line type="monotone" dataKey="Deposits" name={tr("全部定存", "Deposits")} stroke={C.ink2} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Split" name={tr("預備金＋投資", "Split")} stroke={C.jade} strokeWidth={2.5} dot={false} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2" style={{ fontSize: 13, lineHeight: 1.55 }}>
          {tr(<>20 年後，分配策略領先 <Num value={money(gap20)} prefix="HK$" size={15} weight={800} color={C.jade} />——以今天的購買力計算大約是 HK${money(real20)}。</>, <>After 20 years the split path is ahead by <Num value={money(gap20)} prefix="HK$" size={15} weight={800} color={C.jade} /> — around HK${money(real20)} in today's money.</>)}
          <span style={{ color: C.ink2 }}> {tr(`市場不會用一直線的方式帶來 ${invRate}% 回報：其中三分之一可能會消失一兩年，之後才回來。這種波動正是差額的代價，也正因如此預備金必須先做好。`, `Markets don't pay ${invRate}% in a straight line: a third of that can vanish for a couple of years and come back. That volatility is the price of the difference, which is exactly why the cushion comes first.`)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Lbl t={L("Expected return %")}><TextIn type="number" step="0.1" right value={s.investReturn} onChange={(v) => up((x) => { x.settings.investReturn = v; })} /></Lbl>
          <Lbl t={L("Inflation %")}><TextIn type="number" step="0.1" right value={s.inflation} onChange={(v) => up((x) => { x.settings.inflation = v; })} /></Lbl>
          <Lbl t={L("Cushion months")}><TextIn type="number" right value={s.emergencyMonths} onChange={(v) => up((x) => { x.settings.emergencyMonths = v; })} /></Lbl>
        </div>
      </Card>

      <Card>
        <Eyebrow>{L("Biggest levers, by what each pays per year")}</Eyebrow>
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
        <Eyebrow color={C.blue}>{tr("其他投資（IBKR 以外）", "Other investments (outside IBKR)")}</Eyebrow>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Lbl t={L("Market value HK$")}><TextIn type="number" right value={st.portfolio.value} onChange={(v) => up((x) => { x.portfolio.value = v; })} /></Lbl>
          <Lbl t={L("Buying per month")}><TextIn type="number" right value={st.portfolio.monthly} onChange={(v) => up((x) => { x.portfolio.monthly = v; })} /></Lbl>
        </div>
        <input className="pb-in mt-2" style={{ width: "100%", fontSize: 12 }} placeholder={L("What you hold, and where")} value={st.portfolio.note || ""} onChange={(e) => up((x) => { x.portfolio.note = e.target.value; })} />
        <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 8, lineHeight: 1.5 }}>
          {tr("一隻廣泛、低成本、累積型的環球基金，對第一個投資組合已經足夠；再加更多基金大多只增加成本，分散效果有限。要不要為了扣稅而把錢鎖進強積金自願供款或年金，取決於你實際落在哪個稅階——Passbook 沒有你的報稅資料，無法替你核實，請自行對照稅務局最新的薪俸稅稅階，稅階越低，扣稅能省的通常越少，但資金被鎖住是確定的代價。任何結構性或掛鈎存款則不受存款保障計劃保障，應避免。", "One broad, cheap, accumulating world fund is enough for a first portfolio; extra funds mostly add cost, not diversification. Whether a tax-deductible MPF top-up or annuity is worth it depends on which tax band you actually sit in — Passbook doesn't have your tax filing details and can't verify this for you, so check the current salaries-tax bands yourself; the lower your band, the less the deduction typically saves, while the lock-up is certain either way. Any structured or currency-linked deposit isn't covered by deposit protection, so avoid those.")}
        </div>
      </Card>

      <Card pad="p-0">
        <div className="p-3"><Eyebrow>{L("Health check")}</Eyebrow></div>
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
function Deposits({ st, d, up, lang }) {
  const L = (key) => t(lang, key);
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const [open, setOpen] = useState(null);
  const [bankFilter, setBankFilter] = useState("All");

  const ladder = useMemo(() => {
    const keys = d.banks.slice(0, 5);
    const rows = [];
    for (let i = 0; i < 12; i++) {
      const mk = monthKey(iso(addMonths(todayISO(), i)));
      const row = { m: new Date(mk + "-01").toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { month: "short" }) };
      keys.forEach((b) => { row[b] = 0; });
      d.live.forEach((x) => {
        if (monthKey(x.i.maturityISO) === mk && keys.includes(x.bank)) row[x.bank] += Math.round(x.i.hkd);
      });
      rows.push(row);
    }
    return { rows, keys };
  }, [d, lang]);

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
        <Stat label={L("On deposit")} v={d.depHKD} accent={C.jade} sub={tr(`${d.live.length} 筆 · HKD 等值`, `${d.live.length} live · HKD equivalent`)} />
        <Stat label={L("Maturing in 30 days")} v={d.due30} accent={C.gold} sub={L("needs a decision")} />
      </div>

      <BestRates br={d.bankRates} lang={lang} />

      <Card accent={C.blue}>
        <div className="flex justify-between items-center gap-2">
          <Eyebrow color={C.blue}>{L("Maturity ladder · next 12 months")}</Eyebrow>
        </div>
        <div className="mt-3" style={{ height: 190 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ladder.rows} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickLine={false} axisLine={{ stroke: C.rule }} />
              <YAxis tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 12, fontFamily: MONO }} formatter={(v) => "HK$" + money(v)} />
              {ladder.keys.map((b, i) => <Bar key={b} dataKey={b} stackId="a" fill={bankColor(i)} />)}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>
          {tr("平坦的階梯代表每個月都有資金到期，不用解約定存。單一高柱代表大額資金集中在同一天、同一利率到期——續存時把它拆成兩筆不同年期。", "A flat ladder means money frees up every month without breaking a term. A tall single bar means a large sum lands on one day at one rate — when you renew that one, split it across two terms instead of matching it.")}
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap items-center">
        {["All", ...d.banks].map((b) => {
          const pb = d.perBank.find((p) => p.bank === b);
          return (
            <button key={b} onClick={() => setBankFilter(b)} className="pb-btn"
              style={{ background: bankFilter === b ? C.ink : "transparent", color: bankFilter === b ? C.paper : C.ink, border: `1px solid ${bankFilter === b ? C.ink : C.rule}`, fontSize: 11.5, padding: "5px 10px" }}>
              {b === "All" ? L("All") : b}{pb && <span style={{ opacity: .65 }}> · {money(pb.hkd)}</span>}
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
                  <span className="pb-ellipsis" style={{ fontWeight: 700, fontSize: 13.5, flex: "1 1 auto" }}>{x.bank} <span style={{ color: C.ink2, fontWeight: 500 }}>{x.product}</span></span>
                  <span className="pb-shrink0"><Num value={`${ccySign(x.ccy)}${money(x.principal)}`} size={13.5} weight={800} /></span>
                </div>
                <div className="flex justify-between items-center gap-2 mt-1">
                  <span className="pb-ellipsis" style={{ fontSize: 11.5, color: C.ink2, fontFamily: MONO, flex: "1 1 auto" }}>
                    {n(x.rate).toFixed(2)}% · {fmtShort(x.i.maturity, lang)}{x.ccy !== "HKD" ? ` · HK$${money(x.i.hkd)}` : ""}
                  </span>
                  <span className="flex gap-1 items-center pb-shrink0">
                    {x.autoRenew && <Chip tone="grey">{tr("自動續存", "auto")}</Chip>}
                    <Chip tone={x.i.status === "matured" ? "red" : x.i.status === "due" ? "gold" : "jade"}>{x.i.left <= 0 ? L("matured") : `${x.i.left}${tr("日", "d")}`}</Chip>
                  </span>
                </div>
                <div className="mt-2"><Bar2 pct={x.i.pct} color={tone} h={4} /></div>
                {!x.autoRenew && (x.i.status === "due" || x.i.status === "matured") && (
                  <div style={{ marginTop: 8, padding: "7px 9px", background: x.i.status === "matured" ? C.redSoft : C.goldSoft, borderRadius: 2, fontSize: 12, lineHeight: 1.5, color: C.ink, whiteSpace: "pre-line" }}>
                    <b style={{ color: x.i.status === "matured" ? C.red : C.gold }}>{tr("到期安排：", "At maturity: ")}</b>{depPlan(x, lang)}
                  </div>
                )}
              </button>

              {isOpen && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Lbl t={L("Bank")}><TextIn value={x.bank} onChange={(v) => up((s) => { s.deposits[i].bank = v; })} /></Lbl>
                    <Lbl t={L("Currency")}>
                      <select className="pb-in" style={{ width: "100%" }} value={x.ccy} onChange={(e) => up((s) => { s.deposits[i].ccy = e.target.value; })}>
                        {CCYS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Lbl>
                    <Lbl t={`${tr("本金", "Principal")} ${x.ccy}`}><TextIn type="number" right value={x.principal} onChange={(v) => up((s) => { s.deposits[i].principal = v; })} /></Lbl>
                    <Lbl t={L("Rate % p.a.")}><TextIn type="number" step="0.01" right value={x.rate} onChange={(v) => up((s) => { s.deposits[i].rate = v; })} /></Lbl>
                    <Lbl t={L("Term (months)")}><TextIn type="number" right value={x.termMonths} onChange={(v) => up((s) => { s.deposits[i].termMonths = v; })} /></Lbl>
                    <Lbl t={L("Placed on")}><TextIn type="date" value={x.start} onChange={(v) => up((s) => { s.deposits[i].start = v; })} /></Lbl>
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 gap-2" style={{ borderTop: `1px solid ${C.rule}` }}>
                    <div style={{ minWidth: 0 }}>
                      <Eyebrow>{L("Interest this term")}</Eyebrow>
                      <Num value={`${ccySign(x.ccy)}${money(x.i.interest, 2)}`} size={14} weight={800} color={C.gold} wrap />
                      <span style={{ fontSize: 11.5, color: C.ink2, marginLeft: 6 }}>→ {ccySign(x.ccy)}{money(x.i.atMaturity, 2)}</span>
                    </div>
                    <label className="flex items-center gap-2 pb-shrink0" style={{ fontSize: 12, color: C.ink2, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!x.autoRenew} onChange={(e) => up((s) => { s.deposits[i].autoRenew = e.target.checked; })} />
                      {L("Bank renews")}
                    </label>
                  </div>
                  <input className="pb-in mt-2" style={{ width: "100%", fontSize: 12 }} placeholder={L("Note")} value={x.note || ""} onChange={(e) => up((s) => { s.deposits[i].note = e.target.value; })} />
                  <div className="mt-2">
                    <Lbl t={tr(`到期安排（到期前 ${DUE_DAYS} 日開始顯示）`, `At maturity, do this (shown from ${DUE_DAYS} days before)`)}>
                      <textarea className="pb-in" rows={3} style={{ width: "100%", fontSize: 12, resize: "vertical", fontFamily: "inherit" }}
                        placeholder={depPlan({}, lang)} value={x.plan || ""} onChange={(e) => up((s) => { s.deposits[i].plan = e.target.value; })} />
                    </Lbl>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Btn size="sm" tone={x.i.status === "running" ? "quiet" : "gold"}
                      onClick={() => up((s) => { s.deposits[i].principal = Math.round((n(x.principal) + x.i.interest) * 100) / 100; s.deposits[i].start = x.i.maturityISO; })}>
                      {tr(`從 ${fmtShort(x.i.maturity, lang)} 續存`, `Renew from ${fmtShort(x.i.maturity, lang)}`)}
                    </Btn>
                    <Btn size="sm" onClick={() => dup(x)}>{L("Duplicate")}</Btn>
                    <Btn size="sm" tone="danger" onClick={() => up((s) => { s.deposits[i].closed = true; })}>{L("Close")}</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {shown.length === 0 && <div className="p-5 text-center" style={{ fontSize: 13, color: C.ink2 }}>{L("No deposits here yet.")}</div>}
      </Card>

      <div className="flex gap-2"><Btn onClick={addDep}>{L("+ Add a deposit")}</Btn></div>

      {st.deposits.some((x) => x.closed) && (
        <Card accent={C.rule}>
          <Eyebrow>{L("Closed")}</Eyebrow>
          {st.deposits.map((x, i) => x.closed && (
            <div key={x.id} className="flex justify-between items-center mt-2 gap-2" style={{ fontSize: 13 }}>
              <span className="pb-ellipsis" style={{ flex: "1 1 auto" }}>{x.bank}</span>
              <span className="pb-shrink0">{ccySign(x.ccy)}{money(x.principal)}</span>
              <div className="flex gap-2 pb-shrink0">
                <Btn size="sm" onClick={() => up((s) => { s.deposits[i].closed = false; })}>{L("Reopen")}</Btn>
                <Btn size="sm" tone="danger" onClick={() => up((s) => { s.deposits.splice(i, 1); })}>{L("Delete")}</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.5 }}>
        {tr("利息按單利計算——本金 × 年利率 × 天數 ÷ 365，這是香港銀行短期定存的慣常算法。美元及人民幣按上方設定的匯率折算；港元與美元的掛鈎維持在 7.75 至 7.85 之間，人民幣沒有這種掛鈎，匯率會自行波動。", "Interest is simple interest — principal × rate × days ÷ 365 — which is how HK banks quote short fixed terms. USD and CNY lines convert at the rates you set above; the HKD/USD peg holds between 7.75 and 7.85, while CNY has no such peg and moves on its own.")}
      </div>
    </div>
  );
}

/* ── MONTH: ledger + P&L + allocation ────────────────────────── */
function Month({ st, d, up, lang }) {
  const L = (key) => t(lang, key);
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const rates = st.settings.rates;
  const cur = monthKey(todayISO());
  const [m, setM] = useState(d.months.includes(cur) ? cur : d.months[0] || cur);
  const [trend, setTrend] = useState("month");
  const [f, setF] = useState({ date: todayISO(), name: "", kind: "expense", amount: 0, ccy: "HKD", note: "", link: "" });

  const rows = st.tx.map((t, i) => ({ t, i })).filter((x) => monthKey(x.t.date) === m).sort((a, b) => a.t.date.localeCompare(b.t.date));
  const extraIn = rows.filter((x) => x.t.kind === "income").reduce((a, x) => a + toHKD(x.t.amount, x.t.ccy || "HKD", rates), 0);
  const otLogged = st.ot?.[m] !== undefined && st.ot?.[m] !== "" && st.ot?.[m] !== null;
  const otHours = otLogged ? n(st.ot[m]) : n(st.settings.otPlanHours);
  const payM = payInfo(st, rates, otHours);
  const otNet = payM.net - payInfo(st, rates, 0).net;   // OT pay less the extra 5% MPF it attracts
  const inflow = payM.net + extraIn;
  let run = inflow;
  const withBal = rows.map((x) => { if (x.t.kind !== "income") run -= toHKD(x.t.amount, x.t.ccy || "HKD", rates); return { ...x, bal: run }; });

  const actExp = rows.filter((x) => x.t.kind === "expense").reduce((a, x) => a + toHKD(x.t.amount, x.t.ccy || "HKD", rates), 0);
  const actSav = rows.filter((x) => x.t.kind === "saving").reduce((a, x) => a + toHKD(x.t.amount, x.t.ccy || "HKD", rates), 0);
  const net = inflow - actExp - actSav;

  const byName = {};
  const shownName = {};
  rows.forEach((x) => { if (x.t.kind !== "income" && !x.t.oneOff && !x.t.planId) { const k = x.t.name.trim().toLowerCase(); shownName[k] = x.t.name.trim(); byName[k] = (byName[k] || 0) + toHKD(x.t.amount, x.t.ccy || "HKD", rates); } });
  const pnl = st.budget.map((b) => {
    const k = b.name.trim().toLowerCase(); const a = byName[k] || 0; delete byName[k];
    return { name: b.name, group: b.group, budget: toHKD(b.amount, b.ccy || "HKD", rates), actual: a, diff: toHKD(b.amount, b.ccy || "HKD", rates) - a };
  });
  const suddenAct = rows.filter((x) => x.t.oneOff).reduce((a, x) => a + toHKD(x.t.amount, x.t.ccy || "HKD", rates), 0);
  pnl.push({ name: tr("突然購買", "Sudden purchases"), group: "Sudden", budget: d.suddenMonthly, actual: suddenAct, diff: d.suddenMonthly - suddenAct, key: "sudden" });
  d.plansInfo.forEach((p) => {
    const act = rows.filter((x) => x.t.planId === p.id).reduce((a, x) => a + toHKD(x.t.amount, x.t.ccy || "HKD", rates), 0);
    if (act || p.i.perMonth) pnl.push({ name: p.name || tr("未命名計劃", "Untitled plan"), group: "Planned", budget: act + p.i.perMonth, actual: act, diff: p.i.perMonth, key: p.id });
  });
  Object.entries(byName).forEach(([k, v]) => pnl.push({ name: shownName[k] || k, group: "Unplanned", budget: 0, actual: v, diff: -v }));

  const gapToEmergency = Math.max(0, d.emergencyTarget - d.emergencyHKD);
  const keep = Math.max(0, net);
  const toCushion = Math.min(keep, gapToEmergency);
  const toInvest = keep - toCushion;

  // Spending by category across all months (expenses only, in HKD).
  const catStats = (() => {
    const groups = {};
    let total = 0;
    st.tx.forEach((x) => {
      if (x.kind !== "expense") return;
      const hkd = toHKD(x.amount, x.ccy || "HKD", rates);
      const plan = x.planId ? st.plans.find((p) => p.id === x.planId) : null;
      const key = x.oneOff ? "sudden" : plan ? "plan:" + plan.id : (x.name || "").trim().toLowerCase();
      const label = x.oneOff ? tr("突然購買", "Sudden purchases") : plan ? (plan.name || tr("計劃", "Plan")) : (x.name || "").trim();
      if (!groups[key]) groups[key] = { key, label, total: 0, count: 0, month: 0, group: x.oneOff ? "Sudden" : plan ? "Planned" : "" };
      groups[key].total += hkd;
      groups[key].count += 1;
      if (monthKey(x.date) === m) groups[key].month += hkd;
      total += hkd;
    });
    return { rows: Object.values(groups).sort((a, b) => b.total - a.total), total };
  })();

  // Daily spending trend (expenses only, HKD).
  const spendByDay = {};
  st.tx.forEach((x) => { if (x.kind === "expense") spendByDay[x.date] = (spendByDay[x.date] || 0) + toHKD(x.amount, x.ccy || "HKD", rates); });
  const dim = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate();
  const dkey = (k, day) => `${k}-${String(day).padStart(2, "0")}`;
  const todayK = todayISO();
  const dailyRows = (() => {
    let cum = 0;
    return Array.from({ length: dim(m) }, (_, i) => { const v = spendByDay[dkey(m, i + 1)] || 0; cum += v; return { d: i + 1, spend: Math.round(v), cum: Math.round(cum) }; });
  })();
  const dayTotal = dailyRows.reduce((a, r) => a + r.spend, 0);
  const elapsedDays = m === monthKey(todayK) ? Number(todayK.slice(8, 10)) : dim(m);
  const avgDay = elapsedDays ? dayTotal / elapsedDays : 0;
  const topDay = dailyRows.reduce((best, r) => (r.spend > (best ? best.spend : 0) ? r : best), null);
  const cmpMonths = [...new Set([cur, ...Object.keys(spendByDay).map((k) => k.slice(0, 7))])].sort().slice(-6);
  const cmpRows = (() => {
    const cums = Object.fromEntries(cmpMonths.map((k) => [k, 0]));
    return Array.from({ length: 31 }, (_, i) => {
      const row = { d: i + 1 };
      cmpMonths.forEach((k) => {
        if (i + 1 > dim(k) || dkey(k, i + 1) > todayK) { row[k] = null; return; }
        cums[k] += spendByDay[dkey(k, i + 1)] || 0;
        row[k] = Math.round(cums[k]);
      });
      return row;
    });
  })();
  const cmpPal = [C.ink2, C.violet, C.pink, C.gold, C.blue];
  const cmpPrev = cmpMonths.length > 1 ? cmpMonths[cmpMonths.length - 2] : null;
  const cmpDay = Math.min(Number(todayK.slice(8, 10)), 31);
  const cmpNow = cmpRows[cmpDay - 1]?.[cur];
  const cmpThen = cmpPrev ? cmpRows[cmpDay - 1]?.[cmpPrev] : null;
  const axisK = (v) => (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : String(v));
  const tipStyle = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 12, fontFamily: MONO };

  const add = () => {
    const plan = st.plans.find((p) => p.id === f.link);
    const name = f.name.trim() || (plan ? plan.name : "");
    if (!name || !n(f.amount)) return;
    const { link, ...rest } = f;
    const tag = f.kind === "expense" && link === "sudden" ? { oneOff: true } : f.kind === "expense" && plan ? { planId: plan.id } : {};
    up((s) => { s.tx.push({ ...rest, name, id: uid(), amount: n(f.amount), ...tag }); });
    setM(monthKey(f.date));
    setF({ date: f.date, name: "", kind: "expense", amount: 0, ccy: f.ccy, note: "", link: "" });
  };
  const monthList = [...new Set([cur, ...d.months])].sort().reverse();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select className="pb-in" style={{ width: 150, fontWeight: 700 }} value={m} onChange={(e) => setM(e.target.value)}>
          {monthList.map((k) => <option key={k} value={k}>{monthLabel(k, lang)}</option>)}
        </select>
        <div className="ml-auto text-right">
          <Eyebrow>{L("Kept this month")}</Eyebrow>
          <Num value={hk(net)} size={18} weight={800} color={net < 0 ? C.red : C.jade} wrap />
        </div>
      </div>

      <Card>
        <div className="flex justify-between items-center gap-3">
          <div style={{ minWidth: 0 }}>
            <Eyebrow>{tr("本月加班", "Overtime this month")}</Eyebrow>
            <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 2 }}>
              {otHours ? tr(`${otLogged ? "" : "預計 "}${otHours} 小時 × HK$${money(payM.otRate)} = HK$${money(payM.ot)}，扣強積金後 +HK$${money(otNet, 2)}`, `${otLogged ? "" : "Expected "}${otHours} h × HK$${money(payM.otRate)} = HK$${money(payM.ot)}, +HK$${money(otNet, 2)} after MPF`)
                : tr(`時薪 HK$${money(payM.otRate)}，輸入時數會加到本月收入`, `HK$${money(payM.otRate)} an hour; hours entered are added to this month's money in`)}
            </div>
          </div>
          <div className="flex items-center gap-1 pb-shrink0">
            <TextIn type="number" step="0.5" right w={74} value={otLogged ? st.ot[m] : ""} placeholder={String(n(st.settings.otPlanHours) || 0)} onChange={(v) => up((s) => { s.ot = { ...(s.ot || {}), [m]: v }; })} />
            <span style={{ fontSize: 13, color: C.ink2 }}>{tr("小時", "h")}</span>
          </div>
        </div>
        <div className="flex justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${C.rule}`, fontSize: 13 }}>
          <span style={{ color: C.ink2 }}>{tr("本月收入", "Money in this month")}</span>
          <Num value={hk(inflow)} weight={800} />
        </div>
      </Card>

      {keep > 0 && (
        <Card accent={C.blue}>
          <Eyebrow color={C.blue}>{L("Where this month's spare money goes")}</Eyebrow>
          <div className="mt-2" style={{ fontSize: 13.5 }}>
            <div className="flex justify-between pb-row" style={{ paddingBottom: 6 }}>
              <span>{tr(`補充預備金${gapToEmergency > 0 ? `（還差 HK$${money(gapToEmergency)}）` : "（已滿）"}`, `Top up the cushion ${gapToEmergency > 0 ? `(HK$${money(gapToEmergency)} short)` : "(full)"}`)}</span>
              <Num value={money(toCushion)} prefix="HK$" weight={800} color={C.jade} />
            </div>
            <div className="flex justify-between" style={{ paddingTop: 6 }}>
              <span>{gapToEmergency > 0 ? tr("暫時沒有可投資的錢", "Nothing to invest yet") : tr("買入指數基金", "Buy the index fund")}</span>
              <Num value={money(toInvest)} prefix="HK$" weight={800} color={toInvest ? C.blue : C.ink2} />
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 8 }}>
            {tr("按「成長」分頁的順序處理。發薪當天就撥出，不要等到下次出糧前一天。", "Following the order on the Grow tab. Move it the day you're paid, not the day before the next payday.")}
          </div>
        </Card>
      )}

      <Card accent={C.jade}>
        <Eyebrow>{L("Add an entry")}</Eyebrow>
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <TextIn type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} />
          <select className="pb-in" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="expense">{L("Spent")}</option><option value="saving">{L("Set aside")}</option><option value="income">{L("Extra money in")}</option>
          </select>
        </div>
        <input className="pb-in mt-2" style={{ width: "100%" }} list="cats" placeholder={L("Category")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <datalist id="cats">{[...(st.budget.length ? [] : QUICK_PRESETS.map(([zh, en]) => tr(zh, en))), ...st.budget.map((b) => b.name)].map((v) => <option key={v} value={v} />)}</datalist>
        {f.kind === "expense" && (
          <select className="pb-in mt-2" style={{ width: "100%" }} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })}>
            <option value="">{tr("計入預算分類", "Counts against a budget line")}</option>
            <option value="sudden">{tr("突然購買（不在預算內）", "Sudden purchase (not budgeted)")}</option>
            {st.plans.map((p) => <option key={p.id} value={p.id}>{tr("計劃：", "Plan: ")}{p.name || tr("未命名", "Untitled")}</option>)}
          </select>
        )}
        <div className="flex gap-2 mt-2">
          <TextIn type="number" right placeholder="0" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
          <CcySelect value={f.ccy} onChange={(v) => setF({ ...f, ccy: v })} />
        </div>
        <div className="flex gap-2 mt-2">
          <input className="pb-in" style={{ flex: 1 }} placeholder={L("Note (optional)")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <Btn tone="solid" onClick={add}>{L("Add")}</Btn>
        </div>
      </Card>

      <Card pad="p-0">
        <div className="p-3" style={{ borderBottom: `1px solid ${C.rule}` }}>
          <div className="flex justify-between items-baseline">
            <Eyebrow>{L("Ledger")} · {monthLabel(m, lang)}</Eyebrow>
            <span style={{ fontSize: 11, color: C.ink2 }}>{tr(`開始結餘 HK$${money(inflow)}`, `opening HK$${money(inflow)}`)}</span>
          </div>
        </div>
        {withBal.length === 0 ? (
          <div className="p-5 text-center" style={{ fontSize: 13, color: C.ink2 }}>{L("Nothing logged yet. Add your first entry above.")}</div>
        ) : (
          <div className="pb-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 460, fontSize: 13 }}>
              <thead><tr style={{ background: C.head }}>
                {[L("Date"), L("Category"), L("Amount"), L("Balance"), ""].map((h, i) => (
                  <th key={i} style={{ padding: "7px 10px", textAlign: i >= 2 && i < 4 ? "right" : "left", fontSize: 10.5, letterSpacing: 0, color: C.ink2 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {withBal.map(({ t: tx, i, bal }) => (
                  <tr key={tx.id} className="pb-row">
                    <td style={{ padding: "8px 10px", fontFamily: MONO, fontSize: 12, color: C.ink2, whiteSpace: "nowrap" }}>{tx.date.slice(5).replace("-", "/")}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {tx.name}
                      {tx.kind === "saving" && <span className="ml-2"><Chip tone="gold">{L("set aside")}</Chip></span>}
                      {tx.kind === "income" && <span className="ml-2"><Chip tone="jade">{L("in")}</Chip></span>}
                      {tx.oneOff && <span className="ml-2"><Chip tone="gold">{tr("突然", "sudden")}</Chip></span>}
                      {tx.planId && <span className="ml-2"><Chip tone="jade">{tr("計劃", "plan")}</Chip></span>}
                      {tx.note && <div style={{ fontSize: 11, color: C.ink2 }}>{tx.note}</div>}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}><Num value={`${ccySign(tx.ccy || "HKD")}${money(tx.amount)}`} color={tx.kind === "income" ? C.jade : tx.kind === "saving" ? C.gold : C.ink} /></td>
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

      <Card pad="p-0">
        <div className="p-3" style={{ borderBottom: `1px solid ${C.rule}` }}>
          <div className="flex justify-between items-baseline">
            <Eyebrow>📊 {tr("分類統計（全部月份）", "Spending by category (all months)")}</Eyebrow>
            <Num value={hk(catStats.total, 0)} size={15} weight={800} />
          </div>
        </div>
        {catStats.rows.length === 0 ? (
          <div className="p-5 text-center" style={{ fontSize: 13, color: C.ink2 }}>{tr("還沒有支出記錄。", "No spending logged yet.")}</div>
        ) : (
          <div className="p-3 space-y-3">
            {catStats.rows.map((r) => {
              const share = catStats.total ? (r.total / catStats.total) * 100 : 0;
              return (
                <div key={r.key}>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="pb-ellipsis" style={{ fontSize: 13.5, fontWeight: 700, minWidth: 0 }}>
                      {r.group === "Sudden" ? "⚡" : r.group === "Planned" ? "🎯" : catEmoji(r.label)} {r.label}
                      <span style={{ color: C.ink2, fontWeight: 500 }}> · {tr(`${r.count} 筆`, `${r.count} entries`)}</span>
                      {r.group === "Sudden" && <span className="ml-2"><Chip tone="gold">{tr("突然", "sudden")}</Chip></span>}
                      {r.group === "Planned" && <span className="ml-2"><Chip tone="jade">{tr("計劃", "plan")}</Chip></span>}
                    </span>
                    <span className="pb-shrink0" style={{ fontSize: 13.5 }}>
                      <Num value={hk(r.total, 0)} size={13.5} weight={800} />
                      <span style={{ color: C.ink2, fontSize: 12 }}> · {share.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="mt-1"><Bar2 pct={share} color={r.group === "Sudden" ? C.gold : r.group === "Planned" ? C.jade : C.blue} h={5} /></div>
                  <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 2 }}>{tr(`本月 ${hk(r.month, 0)}`, `This month ${hk(r.month, 0)}`)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <Eyebrow>📈 {tr("每日支出趨勢", "Daily spending trend")}</Eyebrow>
          <div className="flex gap-1">
            {[["month", tr("本月每日", "This month")], ["compare", tr("各月對比", "Compare months")]].map(([k, label]) => (
              <button key={k} className="pb-tab" onClick={() => setTrend(k)}
                style={{ border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: trend === k ? C.jade : C.chip, color: trend === k ? C.onJade : C.ink }}>{label}</button>
            ))}
          </div>
        </div>
        {trend === "month" ? (
          <>
            <div className="grid mt-3" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[[tr("總支出", "Total"), hk(dayTotal, 0)], [tr("每日平均", "Per day"), hk(avgDay, 0)], [tr("最高一日", "Peak day"), topDay && topDay.spend ? `${hk(topDay.spend, 0)} · ${topDay.d}${tr("日", "")}` : "—"]].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 11.5, color: C.ink2 }}>{l}</div>
                  <Num value={v} size={14} weight={800} wrap />
                </div>
              ))}
            </div>
            <div className="mt-3" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyRows} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.rule} vertical={false} />
                  <XAxis dataKey="d" ticks={[1, 5, 10, 15, 20, 25, 30]} tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickLine={false} axisLine={{ stroke: C.rule }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={axisK} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tipStyle} labelFormatter={(l) => tr(`${monthLabel(m, lang)} ${l} 日`, `${monthLabel(m, lang)} ${l}`)} formatter={(v) => ["HK$" + money(v), tr("支出", "Spent")]} />
                  <Bar dataKey="spend" fill={C.blue} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 6 }}>{tr(`${monthLabel(m, lang)}每日支出（港元）。換月份請用上面的月份選單。`, `Spending per day in ${monthLabel(m, lang)}, in HKD. Change month with the selector at the top.`)}</div>
          </>
        ) : (
          <>
            <div className="mt-3" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cmpRows} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.rule} vertical={false} />
                  <XAxis dataKey="d" ticks={[1, 5, 10, 15, 20, 25, 30]} tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickLine={false} axisLine={{ stroke: C.rule }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={axisK} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tipStyle} labelFormatter={(l) => tr(`每月 ${l} 日`, `Day ${l}`)} formatter={(v, name) => ["HK$" + money(v), name]} />
                  {cmpMonths.map((k, i) => {
                    const last = i === cmpMonths.length - 1;
                    return <Line key={k} type="monotone" dataKey={k} name={monthLabel(k, lang)} stroke={last ? C.jade : cmpPal[i % cmpPal.length]} strokeWidth={last ? 3 : 1.6} dot={false} connectNulls={false} />;
                  })}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 6 }}>
              {cmpPrev && cmpNow != null && cmpThen != null
                ? tr(`到 ${cmpDay} 日為止，本月累計 HK$${money(cmpNow)}，上個月同日 HK$${money(cmpThen)}（${cmpNow - cmpThen >= 0 ? "多" : "少"} HK$${money(Math.abs(cmpNow - cmpThen))}）。`, `By day ${cmpDay} this month is at HK$${money(cmpNow)}, against HK$${money(cmpThen)} last month (${cmpNow - cmpThen >= 0 ? "HK$" + money(cmpNow - cmpThen) + " more" : "HK$" + money(cmpThen - cmpNow) + " less"}).`)
                : tr("記滿兩個月之後，這裡會比較本月和上月的同日累計。", "Once you have two months logged, this compares this month with last month at the same day.")}
            </div>
            <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 4 }}>{tr("每條線是該月到每一日為止的累計支出，線越平越省。", "Each line is that month's running total by day. A flatter line means a slower month.")}</div>
          </>
        )}
      </Card>

      <Card pad="p-0">
        <div className="p-3"><Eyebrow>{L("Plan against actual")}</Eyebrow></div>
        <div className="pb-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 420, fontSize: 13 }}>
            <thead><tr style={{ background: C.head }}>
              {[L("Category"), L("Budget"), L("Actual"), L("Diff")].map((h, i) => (
                <th key={i} style={{ padding: "7px 10px", textAlign: i ? "right" : "left", fontSize: 10.5, letterSpacing: 0, color: C.ink2 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pnl.map((r) => (
                <tr key={r.key || r.name} className="pb-row">
                  <td style={{ padding: "7px 10px" }}>
                    {r.name}
                    {r.group === "Savings" && <span className="ml-2"><Chip tone="gold">{L("save")}</Chip></span>}
                    {r.group === "Unplanned" && <span className="ml-2"><Chip tone="red">{L("unplanned")}</Chip></span>}
                    {r.group === "Sudden" && <span className="ml-2"><Chip tone="gold">{tr("突然", "sudden")}</Chip></span>}
                    {r.group === "Planned" && <span className="ml-2"><Chip tone="jade">{tr("計劃", "plan")}</Chip></span>}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}><Num value={money(r.budget)} weight={500} color={C.ink2} /></td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}><Num value={money(r.actual)} /></td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}><Num value={(r.diff > 0 ? "+" : "") + hk(r.diff, 0, "")} color={r.diff < 0 ? C.red : C.jade} weight={700} /></td>
                </tr>
              ))}
              <tr style={{ background: C.head }}>
                <td style={{ padding: "9px 10px", fontWeight: 800 }}>{L("Kept")}</td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}><Num value={hk(d.surplus, 0, "")} weight={500} color={d.surplus < 0 ? C.red : C.ink2} /></td>
                <td style={{ padding: "9px 10px", textAlign: "right" }} colSpan={2}><Num value={money(net)} size={15} weight={800} color={net < 0 ? C.red : C.jade} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── PLAN ────────────────────────────────────────────────────── */
function Plan({ st, d, up, lang }) {
  const L = (key) => t(lang, key);
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const rates = st.settings.rates;
  const groups = [
    ["Living", L("Living")],
    ["People & learning", L("People & learning")],
    ["Savings", L("Savings")],
  ];
  return (
    <div className="space-y-4">
      <Card>
        <Eyebrow>{L("Money in each month")}</Eyebrow>
        {st.income.map((r, i) => (
          <div key={r.id} className="mt-2 pb-row" style={{ paddingBottom: 10 }}>
            <TextIn value={r.source} onChange={(v) => up((s) => { s.income[i].source = v; })} placeholder={L("Source")} />
            <div className="flex gap-2 mt-2 items-center">
              <TextIn type="number" right value={r.amount} onChange={(v) => up((s) => { s.income[i].amount = v; })} />
              <CcySelect value={r.ccy} onChange={(v) => up((s) => { s.income[i].ccy = v; })} />
              <RemoveBtn onClick={() => up((s) => { s.income.splice(i, 1); })} label={L("Delete")} />
            </div>
            <label className="flex items-center gap-2 mt-2" style={{ fontSize: 13, color: C.ink2, cursor: "pointer" }}>
              <input type="checkbox" checked={!!r.mpf} onChange={(e) => up((s) => { s.income[i].mpf = e.target.checked; })} style={{ width: 18, height: 18 }} />
              {lang === "zh" ? "未扣強積金的薪金（自動扣 5%）" : "Before MPF (deduct 5% automatically)"}
            </label>
          </div>
        ))}
        <Btn size="sm" onClick={() => up((s) => { s.income.push({ id: uid(), source: "", amount: 0, ccy: "HKD", mpf: false }); })}>{L("+ Add income")}</Btn>
        <table style={{ width: "100%", marginTop: 12, fontSize: 13.5 }}>
          <tbody>
            <tr className="pb-row"><td style={{ padding: "5px 0", color: C.ink2 }}>{lang === "zh" ? "總收入" : "Gross"}</td><td style={{ textAlign: "right" }}><Num value={hk(d.pay.gross, 2)} weight={600} /></td></tr>
            {d.pay.ot > 0 && <tr className="pb-row"><td style={{ padding: "5px 0", color: C.ink2 }}>{lang === "zh" ? `預計加班（${n(st.settings.otPlanHours)} 小時）` : `Expected OT (${n(st.settings.otPlanHours)} h)`}</td><td style={{ textAlign: "right" }}><Num value={"+" + hk(d.pay.ot, 2)} weight={600} /></td></tr>}
            <tr className="pb-row"><td style={{ padding: "5px 0", color: C.ink2 }}>{lang === "zh" ? "強積金（僱員 5%）" : "MPF (your 5%)"}</td><td style={{ textAlign: "right" }}><Num value={hk(-d.pay.mpf, 2)} weight={600} color={C.ink2} /></td></tr>
            <tr><td style={{ padding: "7px 0", fontWeight: 800 }}>{lang === "zh" ? "每月實收" : "Take-home"}</td><td style={{ textAlign: "right" }}><Num value={hk(d.income, 2)} size={17} weight={800} /></td></tr>
          </tbody>
        </table>
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Lbl t={lang === "zh" ? "加班時薪 HK$" : "Overtime per hour HK$"}><TextIn type="number" right value={st.settings.otRate} onChange={(v) => up((s) => { s.settings.otRate = v; })} /></Lbl>
          <Lbl t={lang === "zh" ? "預計每月加班（小時）" : "Expected OT a month (h)"}><TextIn type="number" step="0.5" right value={st.settings.otPlanHours} onChange={(v) => up((s) => { s.settings.otPlanHours = v; })} /></Lbl>
        </div>
        <div style={{ fontSize: 12, color: C.ink2, marginTop: 6 }}>{lang === "zh" ? "每月實際時數在「月度」輸入；未輸入時用預計數字。" : "Log actual hours on Month; until you do, the expected figure is used."}</div>
      </Card>

      <Card accent={C.gold}>
        <Eyebrow color={C.gold}>🛍️ {tr("突然購買與計劃支出", "Sudden & planned spending")}</Eyebrow>
        <div className="mt-2" style={{ fontSize: 12.5, color: C.ink2 }}>
          {tr("突然買的嘢（牙刷、臨時車票）每月預留一個數目。大項目（旅行、約會、蜜月）設定日期，之後每月自動預留。", "Unplanned buys (a toothbrush, a last-minute ticket) get a monthly allowance. Big items (a trip, a date, a honeymoon) get a date, and Passbook works out what to set aside each month.")}
        </div>
        <div className="mt-3"><Lbl t={tr("突然購買每月預留 HK$", "Sudden purchases a month, HK$")}><TextIn type="number" right value={st.settings.suddenMonthly ?? 0} onChange={(v) => up((s) => { s.settings.suddenMonthly = v; })} /></Lbl></div>
        <div className="mt-3 space-y-2">
          {d.plansInfo.map((p) => {
            const i = p.i; const idx = st.plans.findIndex((x) => x.id === p.id);
            return (
              <div key={p.id} className="pb-row" style={{ paddingBottom: 10 }}>
                <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <TextIn value={p.name} onChange={(v) => up((s) => { s.plans[idx].name = v; })} placeholder={tr("例如：馬爾代夫蜜月", "e.g. Maldives honeymoon")} />
                  <TextIn type="date" value={p.date || ""} onChange={(v) => up((s) => { s.plans[idx].date = v; })} />
                </div>
                <div className="flex gap-2 mt-2 items-center">
                  <TextIn type="number" right value={p.amount} onChange={(v) => up((s) => { s.plans[idx].amount = v; })} />
                  <CcySelect value={p.ccy || "HKD"} onChange={(v) => up((s) => { s.plans[idx].ccy = v; })} />
                  <RemoveBtn onClick={() => up((s) => { s.plans.splice(idx, 1); })} label={L("Delete")} />
                </div>
                {i.target > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: C.ink2, marginTop: 6 }}>
                      {tr(`已花 HK$${money(i.spent)}，目標 HK$${money(i.target)}`, `Spent HK$${money(i.spent)} of HK$${money(i.target)}`)}
                      {i.remaining > 0 ? tr(`，每月預留 HK$${money(i.perMonth)}（${i.monthsLeft} 個月）`, `, set aside HK$${money(i.perMonth)} a month for ${i.monthsLeft} month${i.monthsLeft === 1 ? "" : "s"}`) : tr("，已齊備", ", fully covered")}
                    </div>
                    <div className="mt-1"><Bar2 pct={i.pct} color={i.remaining > 0 ? C.gold : C.jade} h={5} /></div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2"><Btn size="sm" onClick={() => up((s) => { s.plans.push({ id: uid(), name: "", amount: 0, ccy: "HKD", date: "", note: "" }); })}>{tr("+ 新增計劃支出", "+ Add a planned spend")}</Btn></div>
        <div style={{ fontSize: 13, marginTop: 10 }}>{tr("計劃每月需預留 ", "Plans need ")}<Num value={hk(d.plansMonthly)} weight={800} />{tr(" / 月", " a month")}</div>
      </Card>

      {groups.map(([g, label]) => {
        const rows = st.budget.map((b, i) => ({ b, i })).filter((x) => x.b.group === g);
        const sum = rows.reduce((a, x) => a + toHKD(x.b.amount, x.b.ccy || "HKD", rates), 0);
        return (
          <Card key={g}>
            <div className="flex justify-between items-baseline">
              <Eyebrow color={g === "Savings" ? C.gold : C.ink2}>{label}</Eyebrow>
              <Num value={money(sum)} prefix="HK$" size={15} weight={800} />
            </div>
            <div className="mt-2 space-y-2">
              {rows.map(({ b, i }) => (
                <div key={b.id} className="pb-row" style={{ paddingBottom: 10 }}>
                  <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <TextIn value={b.name} onChange={(v) => up((s) => { s.budget[i].name = v; })} placeholder={L("Category")} />
                    <TextIn value={b.note || ""} onChange={(v) => up((s) => { s.budget[i].note = v; })} placeholder={L("Note")} />
                  </div>
                  <div className="flex gap-2 mt-2 items-center">
                    <TextIn type="number" right value={b.amount} onChange={(v) => up((s) => { s.budget[i].amount = v; })} />
                    <CcySelect value={b.ccy} onChange={(v) => up((s) => { s.budget[i].ccy = v; })} />
                    <RemoveBtn onClick={() => up((s) => { s.budget.splice(i, 1); })} label={L("Delete")} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2"><Btn size="sm" onClick={() => up((s) => { s.budget.push({ id: uid(), name: "", group: g, amount: 0, ccy: "HKD", note: "" }); })}>{L("+ Add line")}</Btn></div>
          </Card>
        );
      })}

      <Card accent={d.surplus < 0 ? C.red : C.jade}>
        <Eyebrow>{L("Does the plan balance?")}</Eyebrow>
        <table style={{ width: "100%", marginTop: 6 }}>
          <tbody style={{ fontSize: 13.5 }}>
            {[[lang === "zh" ? "實收（含預計加班，已扣強積金）" : "Take-home (incl. expected OT, after MPF)", d.income, C.jade], [L("Spending"), -d.plannedExp, C.ink], [L("Set aside"), -d.plannedSave, C.gold], [tr("計劃支出預留", "Planned spends"), -d.plansMonthly, C.gold]].map(([l, v, c]) => (
              <tr key={l} className="pb-row"><td style={{ padding: "6px 0", color: C.ink2 }}>{l}</td>
                <td style={{ textAlign: "right" }}><Num value={hk(v)} color={c} /></td></tr>
            ))}
            <tr><td style={{ padding: "8px 0", fontWeight: 800 }}>{L("Left over")}</td>
              <td style={{ textAlign: "right" }}><Num value={hk(d.surplus)} size={17} weight={800} color={d.surplus < 0 ? C.red : C.jade} /></td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: C.ink2, marginTop: 6 }}>
          {d.surplus === 0 ? L("Every dollar has a name, with nothing spare for surprises. A small buffer line is worth carving out.")
            : d.surplus < 0 ? L("The plan spends more than it earns. Trim a line or lower a savings target.")
              : L("Spare each month. Send it to a goal on the day you're paid, before it drifts.")}
        </div>
      </Card>
    </div>
  );
}

/* ── BEST DEPOSIT RATES (Deposits tab) ───────────────────────── */
function BestRates({ br, lang }) {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const [showPromos, setShowPromos] = useState(false);
  if (!br?.data?.rates?.length) return null;
  const rates = br.data.rates;
  const banks = [...new Set(rates.map((r) => r.bank))];
  const terms = [3, 6, 12];
  const asOf = new Date(br.as_of);
  const stale = (Date.now() - asOf.getTime()) / DAY > 10;
  const table = (ccy) => {
    const best = Object.fromEntries(terms.map((m) => [m, bestFor(br, ccy, m)]));
    return (
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums", marginTop: 6 }}>
        <thead>
          <tr style={{ color: C.ink2, fontSize: 10.5, letterSpacing: ".08em" }}>
            <th style={{ textAlign: "left", paddingBottom: 3 }}>{ccy}</th>
            {terms.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}{tr("個月", "M")}</th>)}
          </tr>
        </thead>
        <tbody style={{ fontFamily: MONO }}>
          {banks.map((b) => (
            <tr key={b} style={{ borderTop: `1px solid ${C.rule}` }}>
              <td style={{ padding: "5px 0", fontFamily: "inherit", fontWeight: 700 }}>{b}</td>
              {terms.map((m) => {
                const r = rates.find((x) => x.bank === b && x.ccy === ccy && n(x.months) === m);
                const top = r && best[m] && r.bank === best[m].bank && n(r.rate) === n(best[m].rate);
                return (
                  <td key={m} style={{ textAlign: "right", fontWeight: top ? 800 : 500, color: top ? C.jade : r ? C.ink : C.ink2 }}>
                    {r ? `${n(r.rate).toFixed(2)}%` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };
  const topUSD = bestFor(br, "USD"), topHKD = bestFor(br, "HKD");
  return (
    <Card accent={C.jade}>
      <div className="flex justify-between items-baseline gap-2">
        <Eyebrow color={C.jade}>{tr("三間銀行最新定存利率", "Best deposit rates at your banks")}</Eyebrow>
        <span style={{ fontSize: 11, color: stale ? C.red : C.ink2, whiteSpace: "nowrap" }}>{fmtShort(asOf, lang)}</span>
      </div>
      {topHKD && topUSD && (
        <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
          {tr(<>港元最高：<b>{topHKD.bank} {topHKD.months} 個月 {n(topHKD.rate).toFixed(2)}%</b>；美元最高：<b>{topUSD.bank} {topUSD.months} 個月 {n(topUSD.rate).toFixed(2)}%</b>。</>,
            <>Top HKD: <b>{topHKD.bank} {topHKD.months}M {n(topHKD.rate).toFixed(2)}%</b>. Top USD: <b>{topUSD.bank} {topUSD.months}M {n(topUSD.rate).toFixed(2)}%</b>.</>)}
        </div>
      )}
      {table("HKD")}
      {table("USD")}
      <div style={{ fontSize: 11, color: C.ink2, marginTop: 8, lineHeight: 1.5 }}>
        {tr("新資金利率：由另一間銀行轉入的錢才計。同一間銀行到期續存，利率可能較低，確認前先看銀行 App 顯示的利率。每週自動更新。",
          "New-funds rates: only money moved in from another bank qualifies. Renewing at the same bank may get less, so check the rate the bank app shows before confirming. Refreshed weekly.")}
        {stale && <b style={{ color: C.red }}> {tr("資料超過 10 日未更新。", "Data is over 10 days old.")}</b>}
      </div>
      {(br.data.promos || []).length > 0 && (
        <div className="mt-2">
          <button className="pb-btn" onClick={() => setShowPromos(!showPromos)}
            style={{ background: "transparent", border: `1px solid ${C.rule}`, color: C.ink2, fontSize: 11.5, padding: "4px 9px" }}>
            {showPromos ? tr("收起短期優惠", "Hide short-term offers") : tr(`短期換匯優惠（${br.data.promos.length}）`, `Short-term FX offers (${br.data.promos.length})`)}
          </button>
          {showPromos && br.data.promos.map((p, i) => (
            <div key={i} style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
              <b>{p.bank}</b> · {p.text}{" "}
              {p.src && <a href={p.src} target="_blank" rel="noreferrer" style={{ color: C.blue }}>{tr("來源", "source")}</a>}
            </div>
          ))}
          {showPromos && (
            <div style={{ fontSize: 11, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>
              {tr("這類 7 日／1 個月高息要先把港元換成外幣，換匯差價往往會吃掉大部分利息，只適合本來就要換的錢。",
                "These 7-day/1-month headline rates need you to convert HKD first; the FX spread often eats most of the interest, so they only make sense for money you were converting anyway.")}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── FX: HKD ↔ USD / RMB trend and timing ────────────────────── */
function Fx({ st, d, up, lang }) {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const fx = d.fx;
  const [range, setRange] = useState(65);
  const [q, setQ] = useState({ date: todayISO(), bank: "Hang Seng", ccy: "USD", buy: "", sell: "" });
  if (!fx) {
    return <Card accent={C.gold}><div style={{ fontSize: 13, color: C.ink2 }}>{tr("匯率資料載入中，或每日同步未運行。", "FX data is loading, or the daily sync hasn't run.")}</div></Card>;
  }
  const u = fx.usd, c = fx.cny;
  const series = fx.days.slice(-range);
  const quotes = (st.fxQuotes || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const lastQuote = (ccy) => quotes.find((x) => x.ccy === ccy && n(x.buy) && n(x.sell));
  const markup = (x) => {
    const mid = fxMidOn(fx, x.date, x.ccy === "USD" ? "usd" : "cny");
    return mid ? { mid, buy: ((mid - n(x.buy)) / mid) * 100, sell: ((n(x.sell) - mid) / mid) * 100 } : null;
  };
  const est = (ccy) => {
    const qq = lastQuote(ccy); const m = qq && markup(qq); const mid = ccy === "USD" ? u.last : c?.last;
    return m && mid ? { buy: mid * (1 - m.buy / 100), sell: mid * (1 + m.sell / 100), from: qq } : null;
  };
  const chg = (s) => ((s.last - s.first) / s.first) * 100;
  const bandPos = Math.max(0, Math.min(100, ((u.last - PEG_LO) / (PEG_HI - PEG_LO)) * 100));

  // Rules, not forecasts. USD: the peg caps the range, so position in the
  // band is what matters. RMB floats, so compare with its own past year.
  const usdAdvice = bandPos >= 80
    ? { tone: "gold",
        buy: tr("買美元：偏貴。港元貼近弱方 7.85，現在換美元已接近聯繫匯率下的最高成本（最多再貴約 0.1%）。定期買入（例如 IBKR 季度買入）照做即可，差距很小；大額又不急，可以等匯率回落。",
          "Buying USD: on the expensive side. HKD is near the weak end (7.85), so USD costs close to the most it can under the peg (at most ~0.1% more). For regular buys like your IBKR quarter, just go ahead — the difference is small; for a large, non-urgent amount, waiting for a dip can help."),
        sell: tr("賣美元換港元：好時機。現在每 1 美元換到的港元，已接近聯繫匯率下最多的水平。", "Selling USD for HKD: a good time. You're getting close to the most HKD per USD the peg allows.") }
    : bandPos <= 20
      ? { tone: "jade",
          buy: tr("買美元：好時機。港元貼近強方 7.75，美元接近聯繫匯率下最便宜的水平。", "Buying USD: a good time. HKD is near the strong end (7.75), so USD is close to the cheapest the peg allows."),
          sell: tr("賣美元：偏差。現在換港元會換得較少，不急就等。", "Selling USD: poor. You'd get fewer HKD; if it can wait, wait.") }
      : { tone: "grey",
          buy: tr("買美元：中性。匯率在聯繫匯率區間中段，按需要換即可。", "Buying USD: neutral. The rate is mid-band; convert as you need."),
          sell: tr("賣美元：中性。", "Selling USD: neutral.") };
  const cnyAdvice = !c ? null : c.pct >= 80
    ? { tone: "gold",
        buy: tr(`買人民幣：偏貴。現價比過去一年 ${c.pct.toFixed(0)}% 的日子都高。只換近期要用的錢，或分月換，不要一次過換大額。`,
          `Buying RMB: expensive. It's higher than on ${c.pct.toFixed(0)}% of days in the past year. Convert only what you need soon, or split it monthly rather than one big conversion.`),
        sell: tr("賣人民幣換港元：好時機，接近一年高位。", "Selling RMB for HKD: a good time, near the 1-year high.") }
    : c.pct <= 20
      ? { tone: "jade",
          buy: tr(`買人民幣：好時機。現價比過去一年 ${(100 - c.pct).toFixed(0)}% 的日子都低，可以預先換未來幾個月要用的錢。`,
            `Buying RMB: a good time. It's lower than on ${(100 - c.pct).toFixed(0)}% of days in the past year; consider converting what you'll need over the next few months.`),
          sell: tr("賣人民幣：偏差，不急就等。", "Selling RMB: poor; if it can wait, wait.") }
      : { tone: "grey",
          buy: tr("買人民幣：中性，處於一年區間中段。", "Buying RMB: neutral, mid-range for the past year."),
          sell: tr("賣人民幣：中性。", "Selling RMB: neutral.") };
  const trend = (s) => (s.ma1m > s.ma3m * 1.002 ? tr("近月走高", "rising lately") : s.ma1m < s.ma3m * 0.998 ? tr("近月走低", "falling lately") : tr("近月平穩", "flat lately"));

  const RangeBtns = () => (
    <div className="flex gap-1">
      {[[22, tr("1個月", "1M")], [65, tr("3個月", "3M")], [130, tr("6個月", "6M")], [400, tr("1年", "1Y")]].map(([k, l]) => (
        <button key={k} className="pb-btn" onClick={() => setRange(k)}
          style={{ background: range === k ? C.ink : "transparent", color: range === k ? C.paper : C.ink, border: `1px solid ${range === k ? C.ink : C.rule}`, fontSize: 11, padding: "3px 8px" }}>{l}</button>
      ))}
    </div>
  );
  const chart = (key, color, peg) => (
    <div style={{ height: 180, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.rule} vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={(x) => String(x).slice(5)} tickLine={false} axisLine={{ stroke: C.rule }} minTickGap={28} />
          <YAxis width={46} tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickLine={false} axisLine={false}
            domain={peg ? [PEG_LO - 0.005, PEG_HI + 0.005] : ["auto", "auto"]} tickFormatter={(x) => n(x).toFixed(peg ? 2 : 3)} />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 12, fontFamily: MONO }} formatter={(v) => [n(v).toFixed(4), "HKD"]} />
          {peg && <ReferenceLine y={PEG_HI} stroke={C.red} strokeDasharray="4 3" label={{ value: "7.85", position: "insideTopRight", fontSize: 10, fill: C.red }} />}
          {peg && <ReferenceLine y={PEG_LO} stroke={C.jade} strokeDasharray="4 3" label={{ value: "7.75", position: "insideBottomRight", fontSize: 10, fill: C.jade }} />}
          <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
  const advice = (a) => (
    <div style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 8 }}>
      <div style={{ padding: "7px 9px", background: a.tone === "gold" ? C.goldSoft : a.tone === "jade" ? C.jadeSoft : C.chip, borderRadius: 2 }}>{a.buy}</div>
      <div style={{ padding: "7px 9px", marginTop: 4, background: C.soft, borderRadius: 2 }}>{a.sell}</div>
    </div>
  );
  const estRow = (ccy) => {
    const e = est(ccy);
    return e ? (
      <div style={{ fontSize: 12, marginTop: 8, fontFamily: MONO }}>
        {tr(`${e.from.bank} 估算今日：買入 ${e.buy.toFixed(4)} · 賣出 ${e.sell.toFixed(4)}`, `${e.from.bank} est. today: buys ${e.buy.toFixed(4)} · sells ${e.sell.toFixed(4)}`)}
        <span style={{ fontFamily: "inherit", color: C.ink2 }}> {tr(`（按你 ${e.from.date} 記錄的差價推算）`, `(from the spread you logged on ${e.from.date})`)}</span>
      </div>
    ) : null;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card accent={C.blue} pad="p-3">
          <Eyebrow>{tr("1 美元", "US$1")}</Eyebrow>
          <div className="mt-1"><Num value={u.last.toFixed(4)} prefix="HK$" size={18} weight={800} /></div>
          <div style={{ fontSize: 11, color: C.ink2 }}>{tr(`一年 ${chg(u) >= 0 ? "+" : ""}${chg(u).toFixed(2)}% · ${trend(u)}`, `1y ${chg(u) >= 0 ? "+" : ""}${chg(u).toFixed(2)}% · ${trend(u)}`)}</div>
        </Card>
        {c && (
          <Card pad="p-3">
            <Eyebrow>{tr("1 人民幣", "¥1 RMB")}</Eyebrow>
            <div className="mt-1"><Num value={c.last.toFixed(4)} prefix="HK$" size={18} weight={800} /></div>
            <div style={{ fontSize: 11, color: C.ink2 }}>{tr(`一年 ${chg(c) >= 0 ? "+" : ""}${chg(c).toFixed(2)}% · ${trend(c)}`, `1y ${chg(c) >= 0 ? "+" : ""}${chg(c).toFixed(2)}% · ${trend(c)}`)}</div>
          </Card>
        )}
      </div>

      <Card accent={C.blue}>
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <Eyebrow>{tr("港元 ↔ 美元", "HKD ↔ USD")}</Eyebrow>
          <RangeBtns />
        </div>
        {chart("usd", C.blue, true)}
        <div style={{ fontSize: 12, color: C.ink2, marginTop: 4 }}>
          {tr(`聯繫匯率區間 7.75–7.85，現價位於區間 ${bandPos.toFixed(0)}% 位置（0% = 美元最便宜）。一年範圍 ${u.min.toFixed(4)}–${u.max.toFixed(4)}。`,
            `Peg band 7.75–7.85; today sits at ${bandPos.toFixed(0)}% of the band (0% = USD cheapest). 1-year range ${u.min.toFixed(4)}–${u.max.toFixed(4)}.`)}
        </div>
        {advice(usdAdvice)}
        {estRow("USD")}
      </Card>

      {c && cnyAdvice && (
        <Card>
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <Eyebrow>{tr("港元 ↔ 人民幣", "HKD ↔ RMB")}</Eyebrow>
            <RangeBtns />
          </div>
          {chart("cny", C.gold, false)}
          <div style={{ fontSize: 12, color: C.ink2, marginTop: 4 }}>
            {tr(`一年範圍 ${c.min.toFixed(4)}–${c.max.toFixed(4)}；現價高於過去一年 ${c.pct.toFixed(0)}% 的日子。`,
              `1-year range ${c.min.toFixed(4)}–${c.max.toFixed(4)}; today is higher than on ${c.pct.toFixed(0)}% of days in that year.`)}
          </div>
          {advice(cnyAdvice)}
          {estRow("CNY")}
        </Card>
      )}

      <Card>
        <Eyebrow>{tr("記錄銀行牌價", "Log a bank rate")}</Eyebrow>
        <div style={{ fontSize: 12, color: C.ink2, marginTop: 4, lineHeight: 1.5 }}>
          {tr("恒生的電匯牌價網頁用程式載入，無法自動讀取。換匯時把恒生 App 顯示的買入／賣出價記下，這裡會算出它比市場價差多少，並用來估算之後每日的恒生牌價。",
            "Hang Seng's rate page loads by script and can't be read automatically. When you convert, log the buy/sell the Hang Seng app shows; this works out its markup over the market rate and uses it to estimate Hang Seng's rate each day after.")}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Lbl t={tr("日期", "Date")}><TextIn type="date" value={q.date} onChange={(v) => setQ({ ...q, date: v })} /></Lbl>
          <Lbl t={tr("銀行", "Bank")}>
            <select className="pb-in" style={{ width: "100%" }} value={q.bank} onChange={(e) => setQ({ ...q, bank: e.target.value })}>
              {["Hang Seng", "BOCHK", "Mox"].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Lbl>
          <Lbl t={tr("貨幣（每 1 單位兌港元）", "Currency (HKD per 1)")}>
            <select className="pb-in" style={{ width: "100%" }} value={q.ccy} onChange={(e) => setQ({ ...q, ccy: e.target.value })}>
              <option value="USD">USD</option><option value="CNY">RMB</option>
            </select>
          </Lbl>
          <div />
          <Lbl t={tr("銀行買入價", "Bank buys at")}><TextIn type="number" step="0.0001" right value={q.buy} onChange={(v) => setQ({ ...q, buy: v })} /></Lbl>
          <Lbl t={tr("銀行賣出價", "Bank sells at")}><TextIn type="number" step="0.0001" right value={q.sell} onChange={(v) => setQ({ ...q, sell: v })} /></Lbl>
        </div>
        <div className="mt-2">
          <Btn size="sm" tone="solid" onClick={() => {
            if (!n(q.buy) || !n(q.sell)) return;
            up((s) => { s.fxQuotes = [...(s.fxQuotes || []), { id: uid(), ...q, buy: n(q.buy), sell: n(q.sell) }]; });
            setQ({ ...q, buy: "", sell: "" });
          }}>{tr("記錄", "Save")}</Btn>
        </div>
        {quotes.length > 0 && (
          <table className="mt-3" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: C.ink2, fontSize: 10.5, letterSpacing: ".06em" }}>
                <th style={{ textAlign: "left" }}>{tr("日期", "Date")}</th><th style={{ textAlign: "left" }}>{tr("銀行", "Bank")}</th>
                <th style={{ textAlign: "right" }}>{tr("買入／賣出", "Buy / sell")}</th><th style={{ textAlign: "right" }}>{tr("差價", "Markup")}</th><th />
              </tr>
            </thead>
            <tbody style={{ fontFamily: MONO }}>
              {quotes.slice(0, 8).map((x) => {
                const m = markup(x);
                return (
                  <tr key={x.id} style={{ borderTop: `1px solid ${C.rule}` }}>
                    <td style={{ padding: "5px 0" }}>{String(x.date).slice(5)}</td>
                    <td style={{ fontFamily: "inherit" }}>{x.bank} {x.ccy === "CNY" ? "RMB" : x.ccy}</td>
                    <td style={{ textAlign: "right" }}>{n(x.buy).toFixed(4)} / {n(x.sell).toFixed(4)}</td>
                    <td style={{ textAlign: "right" }}>{m ? `${m.buy.toFixed(2)}% / ${m.sell.toFixed(2)}%` : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="pb-btn" aria-label={tr("刪除", "Delete")} onClick={() => up((s) => { s.fxQuotes = (s.fxQuotes || []).filter((z) => z.id !== x.id); })}
                        style={{ background: "transparent", border: "none", color: C.red, fontSize: 12, padding: "0 0 0 6px" }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card accent={C.ink2}>
        <Eyebrow>{tr("App 內的換算匯率", "Rates the app converts with")}</Eyebrow>
        <div className="flex justify-between items-center gap-2 mt-2 flex-wrap" style={{ fontSize: 12.5 }}>
          <span style={{ fontFamily: MONO }}>
            {tr("目前：", "Now: ")}USD {n(st.settings.rates.USD).toFixed(4)} · RMB {n(st.settings.rates.CNY).toFixed(4)}
          </span>
          <Btn size="sm" onClick={() => up((s) => { s.settings.rates.USD = +u.last.toFixed(4); if (c) s.settings.rates.CNY = +c.last.toFixed(4); })}>
            {tr(`改用市場價 ${u.last.toFixed(4)} · ${c ? c.last.toFixed(4) : "—"}`, `Use market ${u.last.toFixed(4)} · ${c ? c.last.toFixed(4) : "—"}`)}
          </Btn>
        </div>
      </Card>

      <div style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.5 }}>
        {tr(`市場中間價來自 IBKR，每日早上更新（最新：${fx.asOf}）。人民幣用離岸人民幣（CNH），香港銀行的人民幣牌價以它為基準。建議只按過去一年的區間判斷，不是預測；銀行牌價差通常比每日波動大，所以在哪裏換往往比何時換更重要。`,
          `Market mid-rates come from IBKR and update each morning (latest: ${fx.asOf}). RMB uses offshore RMB (CNH), which HK banks price from. The advice only compares with the past year's range; it isn't a forecast. A bank's buy/sell spread is usually bigger than a day's move, so where you convert often matters more than when.`)}
      </div>
    </div>
  );
}

/* ── INVEST: IBKR holdings, return, and the next scheduled buy ── */
function Invest({ st, d, up, lang }) {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const v = d.inv, p = v.plan, b = v.buy;
  const sign = (x) => (x > 0 ? "+" : x < 0 ? "−" : "");
  const pnlTone = (x) => (x > 0 ? C.jade : x < 0 ? C.red : C.ink2);
  const usd = (x, dp = 2) => `${sign(x)}US$${money(Math.abs(x), dp)}`;
  const pct = (x) => `${sign(x)}${Math.abs(x).toFixed(2)}%`;
  const setPlan = (fn) => up((s) => { s.invest = { ...INVEST_DEFAULT, ...(s.invest || {}) }; fn(s.invest); });
  const doneKeys = Object.keys(p.done || {}).sort().reverse();
  const asOf = v.snap ? new Date(v.snap.as_of) : null;
  const stale = v.ageDays > 3;
  const offTarget = v.snap && Math.abs(v.weightA - n(p.targetPct)) > 5;

  if (!v.snap) {
    return (
      <div className="space-y-4">
        <Card accent={C.gold}>
          <Eyebrow color={C.gold}>{tr("未有 IBKR 數據", "No IBKR data yet")}</Eyebrow>
          <div style={{ fontSize: 13, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>
            {tr("每日同步會在早上把 IBKR 的持倉和價格寫進來。第一次同步後，這裡會顯示持倉、回報和下一次買入。", "A daily sync writes your IBKR holdings and prices here each morning. After the first one, this tab shows holdings, return and your next buy.")}
          </div>
        </Card>
        <Mpf st={st} d={d} up={up} lang={lang} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex justify-between items-start gap-3">
          <div style={{ minWidth: 0 }}>
            <Eyebrow>{tr("IBKR 帳戶總值", "IBKR account value")}</Eyebrow>
            <div className="mt-1"><Num value={money(v.navHKD)} prefix="HK$" size={24} weight={800} wrap /></div>
            <div style={{ fontSize: 11.5, color: C.ink2, fontFamily: MONO }}>≈ US${money(v.valueUSD + v.cashUSD, 2)}</div>
          </div>
          <div className="text-right pb-shrink0">
            <Eyebrow>{tr("總回報", "Total return")}</Eyebrow>
            <div className="mt-1"><Num value={pct(v.pnlPct)} size={22} weight={800} color={pnlTone(v.pnlUSD)} /></div>
            <div style={{ fontSize: 11.5, color: pnlTone(v.pnlUSD), fontFamily: MONO }}>{usd(v.pnlUSD)}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.rule}` }}>
          <div><Eyebrow>{tr("投入成本", "Cost")}</Eyebrow><Num value={`US$${money(v.costUSD)}`} size={13} weight={700} wrap /></div>
          <div><Eyebrow>{tr("持倉市值", "Holdings")}</Eyebrow><Num value={`US$${money(v.valueUSD)}`} size={13} weight={700} wrap /></div>
          <div><Eyebrow>{tr("較上次", "Since last")}</Eyebrow>
            {v.dayChange === null ? <span style={{ fontSize: 12, color: C.ink2 }}>—</span> : <Num value={usd(v.dayChange)} size={13} weight={700} color={pnlTone(v.dayChange)} wrap />}
          </div>
        </div>
        <div style={{ fontSize: 11, color: stale ? C.red : C.ink2, marginTop: 10, fontWeight: stale ? 700 : 400 }}>
          {stale
            ? tr(`IBKR 數據停在 ${fmtDate(asOf, lang)}——每日同步可能沒有運行。`, `IBKR data is from ${fmtDate(asOf, lang)} — the daily sync may not be running.`)
            : tr(`IBKR 價格 · 更新於 ${asOf.toLocaleString("zh-Hant", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · 每日自動更新`, `IBKR prices · updated ${asOf.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · refreshes daily`)}
        </div>
      </Card>

      <Card pad="p-0">
        <div className="p-3" style={{ paddingBottom: 4 }}><Eyebrow>{tr("持倉", "Holdings")}</Eyebrow></div>
        {v.pos.map((x) => (
          <div key={x.conid || x.symbol} className="pb-row" style={{ padding: "10px 12px" }}>
            <div className="flex justify-between items-baseline gap-2">
              <span style={{ fontWeight: 800, fontSize: 14 }}>{x.symbol} <span style={{ color: C.ink2, fontWeight: 500, fontSize: 12 }}>{n(x.qty)} {tr("股", "sh")}</span></span>
              <Num value={`US$${money(x.value, 2)}`} size={13.5} weight={800} />
            </div>
            <div className="flex justify-between items-baseline gap-2 mt-1">
              <span style={{ fontSize: 11.5, color: C.ink2, fontFamily: MONO }}>
                {tr("平均", "avg")} {n(x.avg).toFixed(3)} → {n(x.price).toFixed(3)}
              </span>
              <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: pnlTone(x.pnl), whiteSpace: "nowrap" }}>{usd(x.pnl)} · {pct(x.pnlPct)}</span>
            </div>
          </div>
        ))}
        {v.cashUSD > 0.5 && (
          <div className="flex justify-between p-3" style={{ fontSize: 12, color: C.ink2 }}>
            <span>{tr("現金", "Cash")}</span><span style={{ fontFamily: MONO }}>US${money(v.cashUSD, 2)}</span>
          </div>
        )}
      </Card>

      <Card accent={offTarget ? C.gold : C.blue}>
        <div className="flex justify-between items-baseline gap-2">
          <Eyebrow color={offTarget ? C.gold : C.blue}>{tr("比例", "Split")}</Eyebrow>
          <span style={{ fontSize: 12, color: C.ink2 }}>{tr(`目標 ${p.fundA} ${n(p.targetPct)}%`, `target ${p.fundA} ${n(p.targetPct)}%`)}</span>
        </div>
        <div className="flex mt-2" style={{ height: 10, borderRadius: 2, overflow: "hidden", background: C.track, position: "relative" }}>
          <div style={{ width: `${v.weightA}%`, background: C.jade }} />
          <div style={{ flex: 1, background: C.blue }} />
          <div style={{ position: "absolute", left: `${n(p.targetPct)}%`, top: -2, bottom: -2, width: 2, background: C.ink }} />
        </div>
        <div className="flex justify-between mt-1" style={{ fontSize: 12, fontFamily: MONO }}>
          <span style={{ color: C.jade, fontWeight: 700 }}>{p.fundA} {v.weightA.toFixed(1)}%</span>
          <span style={{ color: C.blue, fontWeight: 700 }}>{p.fundB} {(100 - v.weightA).toFixed(1)}%</span>
        </div>
        {offTarget && (
          <div style={{ fontSize: 12, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>
            {tr("偏離目標超過 5%。下一次買入會先補少了的一隻，不用賣出。", "More than 5 points off target. The next buy tops up the underweight fund first, so you don't need to sell.")}
          </div>
        )}
      </Card>

      {b && (
        <Card accent={b.status === "late" ? C.red : ["due", "soon"].includes(b.status) ? C.gold : C.jade}>
          <div className="flex justify-between items-start gap-2">
            <div style={{ minWidth: 0 }}>
              <Eyebrow color={b.status === "late" ? C.red : C.gold}>{tr("下一次買入", "Next buy")}</Eyebrow>
              <div className="mt-1" style={{ fontSize: 16, fontWeight: 800 }}>
                {new Date(b.start).toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { month: "long", year: "numeric" })} · HK${money(b.amountHKD)}
              </div>
              <div style={{ fontSize: 11.5, color: C.ink2, fontFamily: MONO }}>≈ US${money(b.usd, 2)} {tr("（已扣約 US$5 手續費，並計入戶口現金）", "(after ~US$5 fees, incl. idle cash)")}</div>
            </div>
            <span className="pb-shrink0">
              <Chip tone={b.status === "late" ? "red" : b.status === "later" ? "jade" : "gold"}>
                {b.status === "late" ? tr("逾期", "overdue") : b.status === "due" ? tr("本月", "this month") : `${b.left}${tr("日", "d")}`}
              </Chip>
            </span>
          </div>
          <table className="mt-3" style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: C.ink2, fontSize: 10.5, letterSpacing: ".08em" }}>
                <th style={{ textAlign: "left", paddingBottom: 4 }}>{tr("基金", "Fund")}</th>
                <th style={{ textAlign: "right" }}>{tr("金額", "Amount")}</th>
                <th style={{ textAlign: "right" }}>{tr("股數", "Shares")}</th>
                <th style={{ textAlign: "right" }}>{tr("限價", "Limit")}</th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: MONO }}>
              {[[p.fundA, b.a], [p.fundB, b.b]].map(([f, l]) => (
                <tr key={f} style={{ borderTop: `1px solid ${C.rule}` }}>
                  <td style={{ padding: "6px 0", fontWeight: 800, fontFamily: "inherit" }}>{f}</td>
                  <td style={{ textAlign: "right" }}>US${money(l.spend, 0)}</td>
                  <td style={{ textAlign: "right", fontWeight: 800 }}>{l.shares}</td>
                  <td style={{ textAlign: "right" }}>{l.lim ? l.lim.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: C.ink2, marginTop: 8, lineHeight: 1.55 }}>
            {tr(`買入後 ${p.fundA} 約佔 ${b.weightAfter.toFixed(0)}%。`, `After buying, ${p.fundA} is about ${b.weightAfter.toFixed(0)}%.`)}{" "}
            {tr("步驟：①由銀行轉港元到 IBKR；②在 IBKR 換成美元；③兩隻都落限價單（交易所 LSEETF、貨幣 USD、生效時間「天」），按預覽確認「交易後」不是負數才提交。股數按最新收市價計，下單前用當時價格再算一次。",
              "Steps: ① move the HKD from your bank to IBKR; ② convert it to USD in IBKR; ③ place both as limit orders (exchange LSEETF, currency USD, time-in-force Day), and check the preview's 'after' column isn't negative before submitting. Share counts use the last synced price, so recheck against the live price when you order.")}
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Btn size="sm" tone="solid" onClick={() => setPlan((x) => { x.done = { ...(x.done || {}), [b.key]: todayISO() }; })}>{tr("已完成這次買入", "Done — bought this one")}</Btn>
          </div>
        </Card>
      )}

      <Card>
        <Eyebrow>{tr("回報走勢", "Return over time")}</Eyebrow>
        {v.hist.length >= 2 ? (
          <>
            <div style={{ fontSize: 11.5, color: C.ink2, margin: "2px 0 8px" }}>{tr("持倉市值對比投入成本（美元），每日一點。", "Holdings value against what you paid (USD), one point a day.")}</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={v.hist} margin={{ top: 4, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.rule} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={(x) => String(x).slice(5)} tickLine={false} axisLine={{ stroke: C.rule }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickFormatter={(x) => money(x)} width={46} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 12, fontFamily: MONO }}
                    formatter={(val, name) => ["US$" + money(val), name]} labelFormatter={(l) => { const h = v.hist.find((r) => r.day === l); return `${l} · ${h ? pct(h.pct) : ""}`; }} />
                  <Line type="stepAfter" dataKey="cost" name={tr("投入成本", "Cost")} stroke={C.ink2} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="value" name={tr("市值", "Value")} stroke={C.jade} strokeWidth={2.5} dot={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 4, lineHeight: 1.5 }}>
            {tr(`由 ${v.hist[0]?.day || "今日"} 開始記錄，每日加一點。有兩日數據後就會顯示走勢圖。`, `Recording since ${v.hist[0]?.day || "today"}, one point a day. The chart appears once there are two days of data.`)}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.ink2, marginTop: 8, lineHeight: 1.5 }}>
          {tr("回報 =（市值 − 投入成本）÷ 投入成本，按 IBKR 的平均成本計算，未計已收取的股息（兩隻都是累積型，股息已滾存在價格內）。港元與美元掛鈎，所以不另計匯率盈虧。",
            "Return = (value − cost) ÷ cost, using IBKR's average cost. Both funds are accumulating, so dividends are already inside the price. HKD is pegged to USD, so no separate FX gain or loss is counted.")}
        </div>
      </Card>

      <Mpf st={st} d={d} up={up} lang={lang} />

      <Card accent={C.blue}>
        <Eyebrow color={C.blue}>{tr("買入計劃", "Buy plan")}</Eyebrow>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Lbl t={tr(`${p.fundA} 目標 %`, `${p.fundA} target %`)}><TextIn type="number" right value={p.targetPct} onChange={(x) => setPlan((s) => { s.targetPct = x; })} /></Lbl>
          <Lbl t={tr("每次買入 HK$", "Each buy HK$")}><TextIn type="number" right value={p.quarterly} onChange={(x) => setPlan((s) => { s.quarterly = x; })} /></Lbl>
          <Lbl t={tr("買入月份", "Buy months")}>
            <TextIn value={(p.months || []).join(", ")} placeholder="1, 4, 7, 10"
              onChange={(x) => setPlan((s) => { s.months = String(x).split(/[^0-9]+/).map(Number).filter((m) => m >= 1 && m <= 12); })} />
          </Lbl>
          <Lbl t={tr("一月額外（雙糧/花紅）HK$", "Extra in January HK$")}><TextIn type="number" right value={p.janExtra} onChange={(x) => setPlan((s) => { s.janExtra = x; })} /></Lbl>
        </div>
        {doneKeys.length > 0 && (
          <div className="mt-3" style={{ fontSize: 12, color: C.ink2 }}>
            {tr("已完成：", "Done: ")}
            {doneKeys.slice(0, 6).map((k) => (
              <button key={k} className="pb-btn" onClick={() => setPlan((s) => { const dn = { ...(s.done || {}) }; delete dn[k]; s.done = dn; })}
                title={tr("按一下撤銷", "Tap to undo")}
                style={{ background: "transparent", border: `1px solid ${C.rule}`, color: C.ink2, fontSize: 11, padding: "2px 7px", marginRight: 6, marginTop: 4 }}>
                {k} ✕
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── MPF: balance logged by hand from the eMPF app ───────────── */
function Mpf({ st, d, up, lang }) {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const m = d.mpf;
  const [form, setForm] = useState({ date: todayISO(), balance: "" });
  const add = () => {
    if (!n(form.balance)) return;
    up((s) => { s.mpf ||= { history: [] }; s.mpf.history = [...(s.mpf.history || []), { id: uid(), date: form.date, balance: n(form.balance) }]; });
    setForm({ date: todayISO(), balance: "" });
  };
  return (
    <Card accent={m.stale ? C.gold : C.blue}>
      <div className="flex justify-between items-baseline gap-2">
        <Eyebrow color={C.blue}>{tr("強積金", "MPF")}</Eyebrow>
        {m.last && <span style={{ fontSize: 11, color: m.stale ? C.red : C.ink2 }}>{tr(`${fmtDate(m.last.date, lang)} 更新`, `updated ${fmtDate(m.last.date, lang)}`)}</span>}
      </div>
      {m.last ? (
        <>
          <div className="flex justify-between items-end gap-3 mt-1">
            <div style={{ minWidth: 0 }}>
              <Num value={money(m.last.balance)} prefix="HK$" size={22} weight={800} wrap />
              <div style={{ fontSize: 11.5, color: C.ink2 }}>{tr("上次記錄的結餘", "last logged balance")}</div>
            </div>
            {m.monthsSince > 0 && (
              <div className="text-right pb-shrink0">
                <Num value={money(m.est)} prefix="≈ HK$" size={15} weight={700} color={C.ink2} />
                <div style={{ fontSize: 11, color: C.ink2 }}>{tr(`今日估算（+${m.monthsSince} 個月供款）`, `est. today (+${m.monthsSince} mo of contributions)`)}</div>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.ink2, marginTop: 8, lineHeight: 1.5 }}>
            {tr(`每月供款約 HK$${money(m.monthly)}：你 HK$${money(m.ee, 2)} + 公司 HK$${money(m.er, 2)}（各 5%，上限 HK$1,500）。`,
              `About HK$${money(m.monthly)} goes in each month: you HK$${money(m.ee, 2)} + employer HK$${money(m.er, 2)} (5% each, capped at HK$1,500).`)}
            {m.gain !== null
              ? tr(` 由 ${fmtDate(m.first.date, lang)} 起，扣除供款後的投資回報約 ${m.gain < 0 ? "−" : ""}HK$${money(Math.abs(m.gain))}（${m.gainPct >= 0 ? "+" : ""}${m.gainPct.toFixed(1)}%）。`,
                ` Since ${fmtDate(m.first.date, lang)}, investment return after contributions is about ${m.gain < 0 ? "−" : ""}HK$${money(Math.abs(m.gain))} (${m.gainPct >= 0 ? "+" : ""}${m.gainPct.toFixed(1)}%).`)
              : tr(" 下次再記錄一次結餘，就能算出扣除供款後的投資回報。", " Log the balance again next time to see the investment return after contributions.")}
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {tr(`連強積金計，淨資產約 HK$${money(d.netWorth + m.est)}。`, `Including MPF, net worth is about HK$${money(d.netWorth + m.est)}.`)}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 6 }}>{tr("還沒有記錄。", "Nothing logged yet.")}</div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Lbl t={tr("日期", "Date")}><TextIn type="date" value={form.date} onChange={(x) => setForm({ ...form, date: x })} /></Lbl>
        <Lbl t={tr("eMPF 總結餘 HK$", "eMPF total HK$")}><TextIn type="number" right value={form.balance} onChange={(x) => setForm({ ...form, balance: x })} /></Lbl>
      </div>
      <div className="mt-2"><Btn size="sm" tone="solid" onClick={add}>{tr("記錄結餘", "Log balance")}</Btn></div>
      {m.history.length > 0 && (
        <div className="mt-3" style={{ fontSize: 12, fontFamily: MONO }}>
          {m.history.slice().reverse().slice(0, 6).map((h) => (
            <div key={h.id || h.date} className="flex justify-between items-center gap-2" style={{ padding: "3px 0", borderTop: `1px solid ${C.rule}` }}>
              <span>{h.date}</span>
              <span className="flex items-center gap-2">HK${money(h.balance)}
                <button className="pb-btn" aria-label={tr("刪除", "Delete")} onClick={() => up((s) => { s.mpf.history = (s.mpf.history || []).filter((z) => (z.id || z.date) !== (h.id || h.date)); })}
                  style={{ background: "transparent", border: "none", color: C.red, fontSize: 12, padding: 0 }}>✕</button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: C.ink2, marginTop: 8, lineHeight: 1.5 }}>
        {tr("eMPF 要密碼加短訊／電郵驗證碼或「智方便」登入，也沒有提供匯出或第三方接口，所以無法自動讀取。每季打開 eMPF App 抄一次總結餘就夠；超過 90 日未更新，「即將要處理」會提醒你。也可以把 eMPF 截圖發給 Claude 代填。",
          "eMPF needs a password plus an SMS/email code, or iAM Smart, and offers no export or third-party access, so it can't be read automatically. Copying the total from the eMPF app once a quarter is enough; after 90 days without an update, Coming up reminds you. You can also send Claude an eMPF screenshot to fill it in.")}
      </div>
    </Card>
  );
}

/* ── HEALTH: weight, workouts and a plain-spoken coach ───────── */
function Health({ st, d, up, lang }) {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const h = st.health || {};
  const v = d.health;
  const lbMode = h.unit === "lb";
  const show = (kg, dp = 1) => (lbMode ? `${(n(kg) * LB).toFixed(dp === 1 ? 0 : dp)} lb` : `${n(kg).toFixed(dp)} kg`);
  const [wf, setWf] = useState({ date: todayISO(), val: "" });
  const [af, setAf] = useState({ date: todayISO(), time: "", type: "swim", minutes: 60, intensity: 1, km: "", note: "" });
  const setH = (fn) => up((s) => { s.health ||= {}; fn(s.health); });
  const band = bmiBand(v.bmi);
  const today = todayISO();

  const addWeight = () => {
    const kg = lbMode ? n(wf.val) / LB : n(wf.val);
    if (!kg) return;
    setH((x) => { x.weights = [...(x.weights || []).filter((w) => w.date !== wf.date), { id: uid(), date: wf.date, kg: +kg.toFixed(1) }]; });
    setWf({ ...wf, val: "" });
  };
  const addAct = () => {
    if (!n(af.minutes)) return;
    setH((x) => { x.activities = [...(x.activities || []), { id: uid(), ...af, minutes: n(af.minutes), km: af.km === "" ? null : n(af.km), intensity: n(af.intensity) }]; });
    setAf({ ...af, note: "", km: "" });
  };

  // Chart: logged weights, the straight-line plan to the checkpoint, and the goal.
  const chart = useMemo(() => {
    if (!v.start) return [];
    const days = new Set(v.weights.map((w) => w.date));
    days.add(v.start.date); if (v.ms) days.add(v.ms.date);
    return [...days].sort().map((date) => {
      const w = v.weights.find((x) => x.date === date);
      let plan = null;
      if (v.ms && date >= v.start.date && date <= v.ms.date) {
        const t = daysBetween(v.start.date, date) / Math.max(1, daysBetween(v.start.date, v.ms.date));
        plan = +(n(v.start.kg) - (n(v.start.kg) - n(v.ms.kg)) * t).toFixed(2);
      }
      const k = (x) => (x == null ? null : lbMode ? +(x * LB).toFixed(1) : x);
      return { date, ts: new Date(date + "T00:00:00").getTime(), kg: k(w ? n(w.kg) : null), plan: k(plan) };
    });
  }, [v, lbMode]);

  const target = (have, want) => (
    <span style={{ fontFamily: MONO, fontWeight: 700, color: have >= want ? C.jade : C.ink }}>{have}/{want}{have >= want ? " ✓" : ""}</span>
  );

  return (
    <div className="space-y-4">
      {!n(h.heightCm) || !v.start ? (
        <Card accent={C.gold}>
          <Eyebrow>{tr("先設定身高和起點", "Set your height and starting point")}</Eyebrow>
          <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Lbl t={tr("身高 cm", "Height cm")}><TextIn type="number" right value={h.heightCm} onChange={(x) => setH((s) => { s.heightCm = x; })} /></Lbl>
            <Lbl t={tr("目標 BMI", "Goal BMI")}><TextIn type="number" step="0.5" right value={h.goalBmi} onChange={(x) => setH((s) => { s.goalBmi = x; })} /></Lbl>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex justify-between items-start gap-3">
            <div style={{ minWidth: 0 }}>
              <Eyebrow>{tr("現在", "Now")}</Eyebrow>
              <div className="flex items-baseline gap-2 mt-1">
                <Num value={show(v.kgNow)} size={26} weight={800} />
                {v.avg7 && v.weights.length > 2 ? <span style={{ fontSize: 12, color: C.ink2 }}>{tr(`7 日平均 ${show(v.avg7)}`, `7-day avg ${show(v.avg7)}`)}</span> : null}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span style={{ fontSize: 13, color: C.ink2 }}>BMI {v.bmi.toFixed(1)}</span>
                <Chip tone={band[2]}>{tr(band[0], band[1])}</Chip>
              </div>
            </div>
            <div className="text-right pb-shrink0">
              <Eyebrow>{tr(`目標 BMI ${n(h.goalBmi)}`, `Goal BMI ${n(h.goalBmi)}`)}</Eyebrow>
              <div className="mt-1"><Num value={show(v.goalKg)} size={18} weight={800} color={C.jade} /></div>
              <div style={{ fontSize: 12, color: C.ink2 }}>{tr(`還差 ${show(Math.max(0, v.kgNow - v.goalKg))}`, `${show(Math.max(0, v.kgNow - v.goalKg))} to go`)}</div>
            </div>
          </div>
          <div className="mt-3"><Bar2 pct={((n(v.start.kg) - v.kgNow) / Math.max(0.1, n(v.start.kg) - v.goalKg)) * 100} h={8} /></div>
          <div className="flex justify-between mt-1" style={{ fontSize: 11.5, color: C.ink2, fontFamily: MONO }}>
            <span>{show(v.start.kg)}</span><span>{show(v.goalKg)}</span>
          </div>
          {v.ms && v.pace && (
            <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.rule}`, fontSize: 13.5, lineHeight: 1.55 }}>
              <div className="flex justify-between items-baseline gap-2">
                <b>{tr(`${fmtDate(v.ms.date, lang)} 目標 ${show(v.ms.kg)}`, `${show(v.ms.kg)} by ${fmtDate(v.ms.date, lang)}`)}</b>
                <Chip tone={v.pace.ahead >= -0.3 ? "jade" : "gold"}>{v.pace.ahead >= -0.3 ? tr("進度正常", "on track") : tr("落後", "behind")}</Chip>
              </div>
              <div style={{ color: C.ink2, marginTop: 2 }}>
                {v.pace.weeksLeft > 0
                  ? tr(`還有 ${v.pace.weeksLeft.toFixed(1)} 星期，每星期要減 ${Math.max(0, v.pace.needPerWeek).toFixed(2)} kg。按計劃今日應約 ${show(v.pace.planNow)}。`,
                    `${v.pace.weeksLeft.toFixed(1)} weeks left: ${Math.max(0, v.pace.needPerWeek).toFixed(2)} kg a week. The plan has you at about ${show(v.pace.planNow)} today.`)
                  : tr("檢查日已到。記錄體重，再定下一個目標。", "Checkpoint reached. Log your weight and set the next one.")}
                {v.pace.needPerWeek > 1 && <span style={{ color: C.red }}> {tr("每星期超過 1 kg 太急，容易流失肌肉和反彈，建議把日期延後。", "More than 1 kg a week is too fast and tends to cost muscle and rebound; push the date out.")}</span>}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="flex justify-between items-baseline gap-2">
          <Eyebrow>{tr("今個星期", "This week")}</Eyebrow>
          <span style={{ fontSize: 12, color: C.ink2 }}>{tr(`約消耗 ${money(v.kcal)} kcal`, `≈ ${money(v.kcal)} kcal burned`)}</span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <Num value={v.minutes} size={22} weight={800} color={v.minutes >= n(h.weeklyMin || 250) ? C.jade : C.ink} />
          <span style={{ fontSize: 13, color: C.ink2 }}>{tr(`／${n(h.weeklyMin || 250)} 分鐘運動`, `of ${n(h.weeklyMin || 250)} active minutes`)}</span>
        </div>
        <div className="mt-2"><Bar2 pct={(v.minutes / Math.max(1, n(h.weeklyMin || 250))) * 100} h={8} /></div>
        <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", fontSize: 12.5 }}>
          <div>{tr("游水", "Swim")}<br />{target(v.sessions.swim, n(h.plan?.swim ?? 2))}</div>
          <div>{tr("重量訓練", "Strength")}<br />{target(v.sessions.strength, n(h.plan?.strength ?? 2))}</div>
          <div>{tr("跑步／單車", "Run / cycle")}<br />{target(v.sessions.cardio, n(h.plan?.cardio ?? 1))}</div>
        </div>
      </Card>

      <Card>
        <Eyebrow>{tr("記錄運動", "Log a workout")}</Eyebrow>
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <select className="pb-in" value={af.type} onChange={(e) => setAf({ ...af, type: e.target.value })}>
            {Object.entries(SPORTS).map(([k, x]) => <option key={k} value={k}>{tr(x[0], x[1])}</option>)}
          </select>
          <select className="pb-in" value={af.intensity} onChange={(e) => setAf({ ...af, intensity: +e.target.value })}>
            <option value={0}>{tr("輕鬆", "Easy")}</option><option value={1}>{tr("中等", "Moderate")}</option><option value={2}>{tr("劇烈", "Hard")}</option>
          </select>
          <TextIn type="date" value={af.date} onChange={(x) => setAf({ ...af, date: x })} />
          <TextIn type="time" value={af.time} onChange={(x) => setAf({ ...af, time: x })} />
          <Lbl t={tr("分鐘", "Minutes")}><TextIn type="number" right value={af.minutes} onChange={(x) => setAf({ ...af, minutes: x })} /></Lbl>
          <Lbl t={tr("距離 km（可選）", "Distance km (optional)")}><TextIn type="number" step="0.1" right value={af.km} onChange={(x) => setAf({ ...af, km: x })} /></Lbl>
        </div>
        <div className="flex gap-2 mt-2">
          <input className="pb-in" style={{ flex: 1 }} placeholder={tr("備註（可選）", "Note (optional)")} value={af.note} onChange={(e) => setAf({ ...af, note: e.target.value })} />
          <Btn tone="solid" onClick={addAct}>{tr("記錄", "Log")}</Btn>
        </div>
        <div style={{ fontSize: 12, color: C.ink2, marginTop: 6 }}>
          {tr("中等＝會喘氣但仍可以說話；劇烈＝只能說幾個字。", "Moderate = breathing harder but can still talk; hard = only a few words at a time.")}
          {n(af.minutes) > 0 && v.kgNow > 0 && tr(` 估計消耗約 ${money(kcalOf(af, v.kgNow))} kcal。`, ` About ${money(kcalOf(af, v.kgNow))} kcal.`)}
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center gap-2">
          <Eyebrow>{tr("記錄體重", "Log weight")}</Eyebrow>
          <div className="flex gap-1">
            {["kg", "lb"].map((u) => (
              <button key={u} className="pb-btn" onClick={() => setH((s) => { s.unit = u; })}
                style={{ background: (h.unit || "kg") === u ? C.ink : "transparent", color: (h.unit || "kg") === u ? C.paper : C.ink, border: `1px solid ${(h.unit || "kg") === u ? C.ink : C.rule}`, fontSize: 12, padding: "3px 10px", minHeight: 30 }}>{u}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <TextIn type="date" value={wf.date} onChange={(x) => setWf({ ...wf, date: x })} />
          <TextIn type="number" step="0.1" right w={110} placeholder={lbMode ? "lb" : "kg"} value={wf.val} onChange={(x) => setWf({ ...wf, val: x })} />
          <Btn tone="solid" onClick={addWeight}>{tr("記錄", "Log")}</Btn>
        </div>
        <div style={{ fontSize: 12, color: C.ink2, marginTop: 6 }}>{tr("每星期量 2–3 次，同樣是早上起床、去完洗手間、未食嘢。看 7 日平均，不要看單日。", "Weigh 2–3 times a week, same conditions: morning, after the bathroom, before eating. Watch the 7-day average, not single days.")}</div>
        {chart.length > 1 && (
          <div style={{ height: 190, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.rule} vertical={false} />
                <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }}
                  tickFormatter={(x) => isoLocal(new Date(x)).slice(5)} tickLine={false} axisLine={{ stroke: C.rule }} minTickGap={24} />
                <YAxis width={40} tick={{ fontSize: 10, fill: C.ink2, fontFamily: MONO }} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(x) => n(x).toFixed(0)} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 6, fontSize: 12, fontFamily: MONO }} labelFormatter={(x) => isoLocal(new Date(x))} />
                <Line type="linear" dataKey="plan" name={tr("計劃", "Plan")} stroke={C.ink2} strokeDasharray="4 3" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="kg" name={tr("體重", "Weight")} stroke={C.jade} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card pad="p-0">
        <div className="p-3" style={{ paddingBottom: 4 }}><Eyebrow>{tr("最近運動", "Recent workouts")}</Eyebrow></div>
        {v.acts.length === 0 && <div className="px-3 pb-3" style={{ fontSize: 13, color: C.ink2 }}>{tr("未有紀錄。第一課：今個星期游兩次水。", "Nothing yet. First assignment: two swims this week.")}</div>}
        {v.acts.slice(0, 12).map((a) => (
          <div key={a.id} className="pb-row px-3 flex justify-between items-center gap-2" style={{ paddingTop: 9, paddingBottom: 9 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{tr((SPORTS[a.type] || SPORTS.other)[0], (SPORTS[a.type] || SPORTS.other)[1])} · {a.minutes} {tr("分鐘", "min")}{a.km ? ` · ${a.km} km` : ""}</div>
              <div style={{ fontSize: 12, color: C.ink2 }}>
                {new Date(a.date + "T00:00:00").toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { day: "numeric", month: "short", weekday: "short" })}{a.time ? ` ${a.time}` : ""}
                {` · ≈${money(kcalOf(a, v.kgNow))} kcal`}{a.note ? ` · ${a.note}` : ""}
              </div>
            </div>
            <RemoveBtn label={tr("刪除", "Delete")} onClick={() => setH((s) => { s.activities = (s.activities || []).filter((x) => x.id !== a.id); })} />
          </div>
        ))}
      </Card>

      <Card>
        <Eyebrow>{tr("教練計劃", "Coach's plan")}</Eyebrow>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 6 }}>
          <div>• {tr(`每日約 ${money(h.kcal)} kcal、蛋白質 ${money(h.protein)} g（每餐有一份手掌大的肉／魚／蛋／豆腐）。`, `About ${money(h.kcal)} kcal and ${money(h.protein)} g protein a day (a palm-sized portion of meat, fish, eggs or tofu at each meal).`)}</div>
          <div>• {tr(`每星期 ${n(h.plan?.swim ?? 2)} 次游水、${n(h.plan?.strength ?? 2)} 次重量訓練、${n(h.plan?.cardio ?? 1)} 次跑步或踩單車，合共最少 ${n(h.weeklyMin || 250)} 分鐘。`, `Each week: ${n(h.plan?.swim ?? 2)} swims, ${n(h.plan?.strength ?? 2)} strength sessions, ${n(h.plan?.cardio ?? 1)} run or ride — at least ${n(h.weeklyMin || 250)} minutes in all.`)}</div>
          <div>• {tr("每日行 8,000 步以上；飲品換走糖水和奶茶；每晚睡 7 小時。", "8,000+ steps a day; swap sugary drinks and milk tea; sleep 7 hours.")}</div>
          <div>• {tr("重量訓練是為了保住肌肉，減的才會是脂肪。", "Strength work keeps the muscle, so what you lose is fat.")}</div>
        </div>
        <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <Lbl t={tr("每日 kcal", "kcal a day")}><TextIn type="number" right value={h.kcal} onChange={(x) => setH((s) => { s.kcal = x; })} /></Lbl>
          <Lbl t={tr("蛋白質 g", "Protein g")}><TextIn type="number" right value={h.protein} onChange={(x) => setH((s) => { s.protein = x; })} /></Lbl>
          <Lbl t={tr("每週分鐘", "Min a week")}><TextIn type="number" right value={h.weeklyMin} onChange={(x) => setH((s) => { s.weeklyMin = x; })} /></Lbl>
          <Lbl t={tr("檢查日", "Check date")}><TextIn type="date" value={h.milestone?.date || ""} onChange={(x) => setH((s) => { s.milestone = { ...(s.milestone || {}), date: x }; })} /></Lbl>
          <Lbl t={tr("目標 kg", "Target kg")}><TextIn type="number" step="0.5" right value={h.milestone?.kg} onChange={(x) => setH((s) => { s.milestone = { ...(s.milestone || {}), kg: x }; })} /></Lbl>
          <Lbl t={tr("目標 BMI", "Goal BMI")}><TextIn type="number" step="0.5" right value={h.goalBmi} onChange={(x) => setH((s) => { s.goalBmi = x; })} /></Lbl>
        </div>
        <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 8, lineHeight: 1.5 }}>
          {tr(`BMI 按衞生署亞洲標準：23–24.9 屬過重，正常上限 22.9（你約 ${show(v.healthyKg)}）。消耗熱量是按運動強度估算。開始較大運動量前，如有心臟、血壓或關節問題，先問醫生。`,
            `BMI uses the Department of Health's Asian cut-offs: 23–24.9 is overweight; the healthy range tops out at 22.9 (about ${show(v.healthyKg)} for you). Calories burned are estimates from activity intensity. If you have heart, blood-pressure or joint issues, check with a doctor before stepping up training.`)}
        </div>
      </Card>
    </div>
  );
}

/* ── LEAVE: annual leave calendar, HK holidays, trips ────────── */
function Leave({ st, d, up, lang }) {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const today = todayISO();
  const [cursor, setCursor] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [form, setForm] = useState(null);   // event being added/edited
  const [editBal, setEditBal] = useState(false);
  const lv = st.leave || { perYear: 12, days: [] };
  const year = +cursor.slice(0, 4);
  const li = leaveInfo(lv, year);
  const thisYear = new Date().getFullYear();
  const events = (st.events || []).slice().sort((a, b) => (a.start < b.start ? -1 : 1));
  const upcoming = events.filter((e) => (e.end || e.start) >= today);
  const past = events.filter((e) => (e.end || e.start) < today).reverse();
  const evOn = (date) => events.filter((e) => date >= e.start && date <= (e.end || e.start));

  const [cy, cm] = cursor.split("-").map(Number);
  const first = new Date(cy, cm - 1, 1);
  const lead = (first.getDay() + 6) % 7;                     // Monday-first grid
  const daysIn = new Date(cy, cm, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => isoLocal(new Date(cy, cm - 1, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const shift = (k) => { const dt = new Date(cy, cm - 1 + k, 1); setCursor(isoLocal(dt).slice(0, 7)); };
  const monthName = first.toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { month: "long", year: "numeric" });
  const holidaysThisMonth = Object.entries(HK_HOLIDAYS).filter(([k]) => k.startsWith(cursor));
  const knownYear = HOLIDAY_YEARS.includes(year);

  const setLeave = (date, amt) => up((s) => {
    s.leave ||= { perYear: 12, days: [] };
    const rest = (s.leave.days || []).filter((x) => x.date !== date);
    s.leave.days = amt ? [...rest, { date, amt }] : rest;
  });
  const bookFor = (ev) => up((s) => {
    const need = leaveNeeded(s.leave, ev);
    s.leave.days = [...(s.leave.days || []), ...need.map((date) => ({ date, amt: 1, note: ev.title }))];
  });
  const saveEvent = () => {
    if (!form?.title?.trim() || !form.start) return;
    const ev = { ...form, end: form.end && form.end >= form.start ? form.end : form.start };
    up((s) => {
      s.events ||= [];
      const i = s.events.findIndex((x) => x.id === ev.id);
      if (i >= 0) s.events[i] = ev; else s.events.push({ ...ev, id: uid() });
    });
    setForm(null);
  };
  const fmtRange = (e) => {
    const a = new Date(e.start + "T00:00:00"), b = new Date((e.end || e.start) + "T00:00:00");
    const f = (x) => x.toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { day: "numeric", month: "short", weekday: "short" });
    return (e.end && e.end !== e.start ? `${f(a)} – ${f(b)}` : f(a)) + (e.time ? ` · ${e.time}` : "");
  };

  const selHol = HK_HOLIDAYS[sel];
  const selLeave = leaveOn(lv, sel);
  const selWork = isWorkday(sel);
  const selEvents = evOn(sel);
  const selCounted = sel.slice(0, 4) !== String(lv.anchorDate || "").slice(0, 4) || sel > (lv.anchorDate || "");

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex justify-between items-start gap-3">
          <div style={{ minWidth: 0 }}>
            <Eyebrow>{tr(`${year} 年假`, `${year} annual leave`)}</Eyebrow>
            <div className="flex items-baseline gap-2 mt-1">
              <Num value={li.left % 1 ? li.left.toFixed(1) : li.left} size={30} weight={800} color={li.left < 0 ? C.red : C.jade} />
              <span style={{ fontSize: 14, color: C.ink2 }}>{tr("日剩餘", li.left === 1 ? "day left" : "days left")}</span>
            </div>
          </div>
          <div className="text-right pb-shrink0" style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.6 }}>
            {li.planned > 0 && <div>{tr(`已計劃 ${li.planned} 日`, `${li.planned} planned`)}</div>}
            {li.taken > 0 && <div>{tr(`已放 ${li.taken} 日`, `${li.taken} taken`)}</div>}
            <div>{tr(`每年 ${n(lv.perYear) || 12} 日`, `${n(lv.perYear) || 12} a year`)}</div>
          </div>
        </div>
        <div className="mt-3"><Bar2 pct={(Math.max(0, li.left) / Math.max(li.base || 0, n(lv.perYear) || 12)) * 100} color={li.left < 2 ? C.gold : C.jade} h={8} /></div>
        {year === thisYear && li.left > 0 && (
          <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 8 }}>
            {tr(`今年還有 ${daysBetween(today, `${year}-12-31`)} 日。未用的年假能否帶到明年，要看公司規定。`, `${daysBetween(today, `${year}-12-31`)} days left in the year. Whether unused leave carries over depends on your company's policy.`)}
          </div>
        )}
        <div className="mt-2">
          {!editBal ? (
            <button className="pb-tab" onClick={() => setEditBal(true)} style={{ background: "none", border: "none", color: C.jade, fontWeight: 700, fontSize: 12.5, padding: 0, cursor: "pointer" }}>
              {tr("修改年假結餘", "Adjust balance")}
            </button>
          ) : (
            <div className="grid gap-2 mt-1" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <Lbl t={tr("每年日數", "Per year")}><TextIn type="number" right value={lv.perYear} onChange={(v) => up((s) => { s.leave.perYear = v; })} /></Lbl>
              <Lbl t={tr("截至日期", "As of")}><TextIn type="date" value={lv.anchorDate} onChange={(v) => up((s) => { s.leave.anchorDate = v; })} /></Lbl>
              <Lbl t={tr("當日剩餘", "Days left then")}><TextIn type="number" step="0.5" right value={lv.anchorBalance} onChange={(v) => up((s) => { s.leave.anchorBalance = v; })} /></Lbl>
            </div>
          )}
        </div>
      </Card>

      <Card pad="p-3">
        <div className="flex justify-between items-center">
          <button className="pb-btn" aria-label={tr("上個月", "Previous month")} onClick={() => shift(-1)} style={{ background: "none", border: `1px solid ${C.rule}`, width: 38, color: C.ink, fontSize: 16 }}>‹</button>
          <button className="pb-tab" onClick={() => { setCursor(today.slice(0, 7)); setSel(today); }} style={{ background: "none", border: "none", fontWeight: 800, fontSize: 16, color: C.ink, cursor: "pointer" }}>{monthName}</button>
          <button className="pb-btn" aria-label={tr("下個月", "Next month")} onClick={() => shift(1)} style={{ background: "none", border: `1px solid ${C.rule}`, width: 38, color: C.ink, fontSize: 16 }}>›</button>
        </div>
        <div className="grid mt-3" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }}>
          {(lang === "zh" ? ["一", "二", "三", "四", "五", "六", "日"] : ["M", "T", "W", "T", "F", "S", "S"]).map((w, i) => (
            <div key={i} className="text-center" style={{ fontSize: 11.5, color: i >= 5 ? C.red : C.ink2, fontWeight: 600, paddingBottom: 2 }}>{w}</div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const hol = HK_HOLIDAYS[date], lvd = leaveOn(lv, date), evs = evOn(date);
            const wkend = dowOf(date) === 0 || dowOf(date) === 6;
            const isSel = date === sel, isToday = date === today;
            const bg = lvd ? (n(lvd.amt) >= 1 ? C.jade : `linear-gradient(135deg, ${C.jade} 50%, ${C.jadeSoft} 50%)`) : isSel ? C.jadeSoft : "transparent";
            return (
              <button key={date} onClick={() => setSel(date)} className="pb-tab" aria-label={date + (hol ? " " + hol[lang === "zh" ? 0 : 1] : "") + (lvd ? " leave" : "")}
                style={{ position: "relative", height: 46, borderRadius: 8, border: isToday ? `2px solid ${C.ink}` : isSel ? `1px solid ${C.jade}` : "1px solid transparent", background: bg, cursor: "pointer", padding: 0,
                  color: lvd && n(lvd.amt) >= 1 ? C.onJade : hol || wkend ? C.red : C.ink, fontWeight: hol ? 800 : 600, fontSize: 15, fontFamily: MONO }}>
                {+date.slice(8)}
                <span style={{ position: "absolute", left: 0, right: 0, bottom: 4, display: "flex", justifyContent: "center", gap: 3 }}>
                  {hol && <i style={{ width: 5, height: 5, borderRadius: 5, background: C.red }} />}
                  {evs.some((e) => e.tag === "gf") && <i style={{ width: 5, height: 5, borderRadius: 5, background: C.pink }} />}
                  {evs.some((e) => e.tag !== "gf") && <i style={{ width: 5, height: 5, borderRadius: 5, background: C.gold }} />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-3 flex-wrap mt-3" style={{ fontSize: 11.5, color: C.ink2 }}>
          <span className="flex items-center gap-1"><i style={{ width: 8, height: 8, borderRadius: 8, background: C.red }} />{tr("公眾假期", "Public holiday")}</span>
          <span className="flex items-center gap-1"><i style={{ width: 12, height: 10, borderRadius: 3, background: C.jade }} />{tr("年假", "Leave")}</span>
          <span className="flex items-center gap-1"><i style={{ width: 8, height: 8, borderRadius: 8, background: C.pink }} />{tr("與她", "With her")}</span>
          <span className="flex items-center gap-1"><i style={{ width: 8, height: 8, borderRadius: 8, background: C.gold }} />{tr("其他行程", "Other plans")}</span>
        </div>
        {!knownYear && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{tr(`未有 ${year} 年公眾假期資料。`, `No ${year} holiday data yet.`)}</div>}
        {holidaysThisMonth.length > 0 && (
          <div className="mt-2" style={{ fontSize: 12.5, color: C.ink2 }}>
            {holidaysThisMonth.map(([k, v]) => <div key={k}><b style={{ color: C.red, fontFamily: MONO }}>{+k.slice(8)}</b> {v[lang === "zh" ? 0 : 1]}</div>)}
          </div>
        )}
      </Card>

      <Card>
        <Eyebrow>{new Date(sel + "T00:00:00").toLocaleDateString(lang === "zh" ? "zh-Hant" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}</Eyebrow>
        <div style={{ fontSize: 13, color: C.ink2, marginTop: 4 }}>
          {selHol ? <span style={{ color: C.red, fontWeight: 700 }}>{selHol[lang === "zh" ? 0 : 1]}（{tr("公眾假期", "public holiday")}）</span>
            : !selWork ? tr("週末", "Weekend")
              : selLeave ? tr(`已請${n(selLeave.amt) >= 1 ? "全日" : "半日"}假${selCounted ? "" : "（已計入你給的結餘）"}`, `${n(selLeave.amt) >= 1 ? "Full" : "Half"}-day leave${selCounted ? "" : " (already in the balance you gave)"}`)
                : tr("工作日", "Workday")}
        </div>
        {selEvents.map((e) => (
          <div key={e.id} style={{ fontSize: 13.5, marginTop: 6 }}><b style={{ color: e.tag === "gf" ? C.pink : C.gold }}>●</b> {e.title}{e.time && e.start === sel ? ` · ${e.time}` : ""}</div>
        ))}
        <div className="flex gap-2 mt-3 flex-wrap">
          {selWork && (
            <>
              <Btn size="sm" tone={selLeave && n(selLeave.amt) >= 1 ? "solid" : "quiet"} onClick={() => setLeave(sel, selLeave && n(selLeave.amt) >= 1 ? 0 : 1)}>{tr("全日假", "Full day")}</Btn>
              <Btn size="sm" tone={selLeave && n(selLeave.amt) < 1 ? "solid" : "quiet"} onClick={() => setLeave(sel, selLeave && n(selLeave.amt) < 1 ? 0 : 0.5)}>{tr("半日假", "Half day")}</Btn>
            </>
          )}
          <Btn size="sm" onClick={() => setForm({ title: "", start: sel, end: sel, time: "", note: "", tag: "gf" })}>{tr("＋ 新增行程", "+ Add a plan")}</Btn>
        </div>
      </Card>

      {form && (
        <Card accent={C.gold}>
          <Eyebrow>{form.id ? tr("修改行程", "Edit plan") : tr("新增行程", "New plan")}</Eyebrow>
          <div className="mt-2"><TextIn value={form.title} placeholder={tr("例如：接機、生日旅行", "e.g. Airport pickup, birthday trip")} onChange={(v) => setForm({ ...form, title: v })} /></div>
          <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Lbl t={tr("開始", "From")}><TextIn type="date" value={form.start} onChange={(v) => setForm({ ...form, start: v, end: form.end < v ? v : form.end })} /></Lbl>
            <Lbl t={tr("結束", "To")}><TextIn type="date" value={form.end} onChange={(v) => setForm({ ...form, end: v })} /></Lbl>
            <Lbl t={tr("時間（可選）", "Time (optional)")}><TextIn type="time" value={form.time} onChange={(v) => setForm({ ...form, time: v })} /></Lbl>
            <Lbl t={tr("類別", "Type")}>
              <select className="pb-in" style={{ width: "100%" }} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
                <option value="gf">{tr("與她", "With her")}</option><option value="other">{tr("其他", "Other")}</option>
              </select>
            </Lbl>
          </div>
          <div className="mt-2"><TextIn value={form.note} placeholder={tr("地點／備註（可選）", "Place / note (optional)")} onChange={(v) => setForm({ ...form, note: v })} /></div>
          <div className="flex gap-2 mt-3">
            <Btn size="sm" tone="solid" onClick={saveEvent}>{tr("儲存", "Save")}</Btn>
            <Btn size="sm" onClick={() => setForm(null)}>{tr("取消", "Cancel")}</Btn>
          </div>
        </Card>
      )}

      <Card pad="p-0">
        <div className="p-3" style={{ paddingBottom: 4 }}><Eyebrow>{tr("行程", "Plans")}</Eyebrow></div>
        {upcoming.length === 0 && <div className="px-3 pb-3" style={{ fontSize: 13, color: C.ink2 }}>{tr("未有行程。在日曆揀一日，再按「新增行程」。", "No plans yet. Pick a day on the calendar, then Add a plan.")}</div>}
        {upcoming.map((e) => {
          const need = leaveNeeded(lv, e).filter((x) => x >= today);
          const yr = +(need[0] || e.start).slice(0, 4);
          const leftThen = leaveInfo(lv, yr).left;
          const until = daysBetween(today, e.start);
          return (
            <div key={e.id} className="pb-row px-3" style={{ paddingTop: 10, paddingBottom: 12, borderLeft: `3px solid ${e.tag === "gf" ? C.pink : C.gold}` }}>
              <div className="flex justify-between items-baseline gap-2">
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{e.title}</span>
                <span className="pb-shrink0"><Chip tone={until <= 7 ? "gold" : "grey"}>{until <= 0 ? tr("進行中", "now") : tr(`${until} 日後`, `in ${until}d`)}</Chip></span>
              </div>
              <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 2 }}>{fmtRange(e)}{e.note ? ` · ${e.note}` : ""}</div>
              <div className="flex justify-between items-center gap-2 mt-2 flex-wrap">
                <span style={{ fontSize: 12.5, color: need.length > leftThen ? C.red : C.ink2 }}>
                  {need.length ? tr(`需請 ${need.length} 日假（${yr} 年剩 ${leftThen} 日）`, `Needs ${need.length} day${need.length > 1 ? "s" : ""} of leave (${leftThen} left in ${yr})`) : tr("不用請假", "No leave needed")}
                </span>
                <span className="flex gap-2">
                  {need.length > 0 && <Btn size="sm" tone="solid" onClick={() => bookFor({ ...e, start: e.start < today ? today : e.start })}>{tr(`請 ${need.length} 日假`, `Book ${need.length} day${need.length > 1 ? "s" : ""}`)}</Btn>}
                  <Btn size="sm" onClick={() => { setForm({ time: "", note: "", tag: "gf", ...e }); window.scrollTo?.({ top: 0 }); }}>{tr("修改", "Edit")}</Btn>
                  <RemoveBtn label={tr("刪除", "Delete")} onClick={() => up((s) => { s.events = (s.events || []).filter((x) => x.id !== e.id); })} />
                </span>
              </div>
            </div>
          );
        })}
        {past.length > 0 && (
          <div className="px-3 pb-3 pt-2" style={{ fontSize: 12.5, color: C.ink2 }}>
            {tr("過去：", "Past: ")}{past.slice(0, 3).map((e) => `${e.title}（${fmtRange(e)}）`).join("；")}
          </div>
        )}
      </Card>

      <div style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.5 }}>
        {tr("公眾假期即香港銀行假期，資料來自政府公布的 2026 及 2027 年一般假日。星期六日不計年假。",
          "Public holidays are Hong Kong's general holidays (bank holidays) for 2026 and 2027 as published by the government. Weekends don't use leave.")}
      </div>
    </div>
  );
}

/* ── SUBSCRIPTIONS: plans, contracts and warranties ──────────── */
function Subs({ st, d, up, lang }) {
  const tr = (zh, en) => (lang === "zh" ? zh : en);
  const [open, setOpen] = useState(null);
  const kindLabel = { subscription: tr("訂閱", "Subscription"), contract: tr("合約", "Contract"), warranty: tr("保養", "Warranty") };
  const cycleLabel = { monthly: tr("每月", "a month"), yearly: tr("每年", "a year"), "one-off": tr("一次過", "one-off") };
  const idx = (id) => (st.subs || []).findIndex((x) => x.id === id);
  const budgetLine = st.budget.find((b) => /subscription/i.test(b.name || ""));
  const budgetHKD = budgetLine ? toHKD(budgetLine.amount, budgetLine.ccy || "HKD", d.rates) : 0;
  const yearly = d.subsMonthly * 12;
  const ended = (st.subs || []).filter((x) => x.closed || subInfo(x, d.rates).status === "ended");

  const add = () => up((s) => {
    const id = uid();
    s.subs ||= [];
    s.subs.push({ id, name: "", kind: "subscription", amount: 0, ccy: "HKD", cycle: "monthly", start: todayISO(), termMonths: 0, end: "", noticeMonths: 0, remindDays: 30, action: "", note: "", closed: false });
    setOpen(id);
  });

  const statusChip = (x) => {
    const { status, left, endLeft } = x.i;
    if (status === "ongoing") return <Chip tone="grey">{tr("持續", "ongoing")}</Chip>;
    if (status === "ended") return <Chip tone="grey">{tr("已完結", "ended")}</Chip>;
    if (status === "late") return <Chip tone="red">{tr(`已過期限 ${-left} 日`, `deadline passed ${-left}d`)}</Chip>;
    if (status === "due") return <Chip tone="gold">{tr(`${left} 日內處理`, `act in ${left}d`)}</Chip>;
    return <Chip tone="jade">{`${Math.round((x.i.notice ? left : endLeft) / 30.44)}${tr(" 個月", " mo")}`}</Chip>;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label={tr("每月訂閱費", "Per month")} v={d.subsMonthly} accent={C.jade}
          sub={budgetLine ? tr(`計劃預留 HK$${money(budgetHKD)}`, `plan sets aside HK$${money(budgetHKD)}`) : tr(`一年約 HK$${money(yearly)}`, `≈ HK$${money(yearly)} a year`)} />
        <Stat label={tr("需要處理", "Needs action")} v={d.dueSubs.length} prefix="" accent={d.dueSubs.length ? C.gold : C.ink2}
          sub={tr("到了提醒時間", "inside reminder window")} />
      </div>
      {budgetLine && d.subsMonthly > budgetHKD && (
        <div style={{ fontSize: 12.5, color: C.red, fontWeight: 700 }}>
          {tr(`訂閱每月 HK$${money(d.subsMonthly)}，比計劃中「${budgetLine.name}」的 HK$${money(budgetHKD)} 多。到「計劃」調高預算，或取消一項。`,
            `Subscriptions cost HK$${money(d.subsMonthly)} a month, more than the HK$${money(budgetHKD)} on your "${budgetLine.name}" budget line. Raise it on the Plan tab or cancel one.`)}
        </div>
      )}

      <Card pad="p-0">
        {d.subs.filter((x) => x.i.status !== "ended").map((x) => {
          const i = idx(x.id);
          const isOpen = open === x.id;
          const tone = x.i.status === "late" ? C.red : x.i.status === "due" ? C.gold : x.i.status === "ongoing" ? C.blue : C.jade;
          const showAction = (x.i.status === "due" || x.i.status === "late") && x.action;
          return (
            <div key={x.id} className="pb-row" style={{ borderLeft: `3px solid ${tone}` }}>
              <button onClick={() => setOpen(isOpen ? null : x.id)} className="pb-tab"
                style={{ width: "100%", background: "none", border: "none", padding: "10px 12px", textAlign: "left", cursor: "pointer", color: C.ink }}>
                <div className="flex justify-between items-baseline gap-2">
                  <span className="pb-ellipsis" style={{ fontWeight: 700, fontSize: 13.5, flex: "1 1 auto" }}>
                    {x.name || tr("未命名", "Untitled")} <span style={{ color: C.ink2, fontWeight: 500 }}>{kindLabel[x.kind] || ""}</span>
                  </span>
                  <span className="pb-shrink0">
                    {n(x.amount) > 0 || x.cycle !== "one-off"
                      ? <Num value={`${ccySign(x.ccy)}${money(x.amount, n(x.amount) % 1 ? 2 : 0)}`} size={13.5} weight={800} />
                      : null}
                    {x.cycle !== "one-off" && n(x.amount) > 0 && <span style={{ fontSize: 11, color: C.ink2 }}> {cycleLabel[x.cycle]}</span>}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2 mt-1">
                  <span className="pb-ellipsis" style={{ fontSize: 11.5, color: C.ink2, fontFamily: MONO, flex: "1 1 auto" }}>
                    {x.i.notice
                      ? tr(`${fmtShort(x.i.notice, lang)} 前通知 · ${fmtDate(x.i.end, lang)} 完約`, `notice by ${fmtShort(x.i.notice, lang)} · ends ${fmtDate(x.i.end, lang)}`)
                      : x.i.end ? tr(`${fmtDate(x.i.end, lang)} 到期`, `ends ${fmtDate(x.i.end, lang)}`)
                        : x.ccy !== "HKD" && n(x.amount) ? `≈ HK$${money(x.i.monthlyHKD, 2)}${tr(" 每月", " a month")}` : tr("沒有完結日期", "no end date")}
                  </span>
                  <span className="pb-shrink0">{statusChip(x)}</span>
                </div>
                {showAction && (
                  <div style={{ marginTop: 8, padding: "7px 9px", background: x.i.status === "late" ? C.redSoft : C.goldSoft, borderRadius: 2, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-line" }}>
                    <b style={{ color: x.i.status === "late" ? C.red : C.gold }}>{tr("要做：", "To do: ")}</b>{x.action}
                  </div>
                )}
              </button>

              {isOpen && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Lbl t={tr("名稱", "Name")}><TextIn value={x.name} onChange={(v) => up((s) => { s.subs[i].name = v; })} /></Lbl>
                    <Lbl t={tr("類別", "Type")}>
                      <select className="pb-in" style={{ width: "100%" }} value={x.kind || "subscription"} onChange={(e) => up((s) => { s.subs[i].kind = e.target.value; })}>
                        {SUB_KINDS.map((k) => <option key={k} value={k}>{kindLabel[k]}</option>)}
                      </select>
                    </Lbl>
                    <Lbl t={`${tr("費用", "Cost")} ${x.ccy || "HKD"}`}>
                      <div className="flex gap-1">
                        <TextIn type="number" step="0.01" right value={x.amount} onChange={(v) => up((s) => { s.subs[i].amount = v; })} />
                        <CcySelect value={x.ccy} onChange={(v) => up((s) => { s.subs[i].ccy = v; })} />
                      </div>
                    </Lbl>
                    <Lbl t={tr("收費週期", "Billed")}>
                      <select className="pb-in" style={{ width: "100%" }} value={x.cycle || "monthly"} onChange={(e) => up((s) => { s.subs[i].cycle = e.target.value; })}>
                        {SUB_CYCLES.map((k) => <option key={k} value={k}>{cycleLabel[k]}</option>)}
                      </select>
                    </Lbl>
                    <Lbl t={tr("開始日期", "Started")}><TextIn type="date" value={x.start || ""} onChange={(v) => up((s) => { s.subs[i].start = v; })} /></Lbl>
                    <Lbl t={tr("合約期（月）", "Term (months)")}><TextIn type="number" right value={x.termMonths} onChange={(v) => up((s) => { s.subs[i].termMonths = v; })} /></Lbl>
                    <Lbl t={tr("完結日期（可直接填）", "Ends on (or set directly)")}><TextIn type="date" value={x.end || ""} onChange={(v) => up((s) => { s.subs[i].end = v; })} /></Lbl>
                    <Lbl t={tr("提前通知（月）", "Notice (months)")}><TextIn type="number" right value={x.noticeMonths} onChange={(v) => up((s) => { s.subs[i].noticeMonths = v; })} /></Lbl>
                    <Lbl t={tr("提前幾日提醒", "Remind me (days before)")}><TextIn type="number" right value={x.remindDays} onChange={(v) => up((s) => { s.subs[i].remindDays = v; })} /></Lbl>
                  </div>
                  {x.i.actBy && (
                    <div className="mt-2" style={{ fontSize: 12, color: C.ink2, lineHeight: 1.5 }}>
                      {x.i.notice
                        ? tr(`合約 ${fmtDate(x.i.end, lang)} 完結，最遲 ${fmtDate(x.i.notice, lang)} 要通知／退還；${fmtDate(x.i.remindFrom, lang)} 開始提醒。`,
                          `Ends ${fmtDate(x.i.end, lang)}; give notice by ${fmtDate(x.i.notice, lang)}. Reminders start ${fmtDate(x.i.remindFrom, lang)}.`)
                        : tr(`${fmtDate(x.i.end, lang)} 到期；${fmtDate(x.i.remindFrom, lang)} 開始提醒。`,
                          `Ends ${fmtDate(x.i.end, lang)}. Reminders start ${fmtDate(x.i.remindFrom, lang)}.`)}
                    </div>
                  )}
                  <div className="mt-2">
                    <Lbl t={tr("到時要做甚麼", "What to do when it's time")}>
                      <textarea className="pb-in" rows={5} style={{ width: "100%", fontSize: 12, resize: "vertical", fontFamily: "inherit" }}
                        value={x.action || ""} onChange={(e) => up((s) => { s.subs[i].action = e.target.value; })} />
                    </Lbl>
                  </div>
                  <input className="pb-in mt-2" style={{ width: "100%", fontSize: 12 }} placeholder={tr("備註", "Note")} value={x.note || ""} onChange={(e) => up((s) => { s.subs[i].note = e.target.value; })} />
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Btn size="sm" tone="danger" onClick={() => up((s) => { s.subs[i].closed = true; })}>{tr("已取消／完結", "Cancelled / done")}</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {d.subs.filter((x) => x.i.status !== "ended").length === 0 && <div className="p-5 text-center" style={{ fontSize: 13, color: C.ink2 }}>{tr("還沒有訂閱。", "No subscriptions yet.")}</div>}
      </Card>

      <div className="flex gap-2"><Btn onClick={add}>{tr("+ 新增訂閱", "+ Add a subscription")}</Btn></div>

      {ended.length > 0 && (
        <Card accent={C.rule}>
          <Eyebrow>{tr("已取消或完結", "Cancelled or ended")}</Eyebrow>
          {ended.map((x) => {
            const i = idx(x.id);
            return (
              <div key={x.id} className="flex justify-between items-center mt-2 gap-2" style={{ fontSize: 13 }}>
                <span className="pb-ellipsis" style={{ flex: "1 1 auto" }}>{x.name || tr("未命名", "Untitled")}</span>
                <div className="flex gap-2 pb-shrink0">
                  {x.closed && <Btn size="sm" onClick={() => up((s) => { s.subs[i].closed = false; })}>{tr("恢復", "Reopen")}</Btn>}
                  <Btn size="sm" tone="danger" onClick={() => up((s) => { s.subs.splice(i, 1); })}>{tr("刪除", "Delete")}</Btn>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <div style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.5 }}>
        {tr("有提前通知期的合約，提醒按通知期限計算，不是完約日。人民幣及美元收費按「定存」頁設定的匯率折算成港元。",
          "For contracts with a notice period, reminders count down to the notice deadline, not the end date. CNY and USD charges convert to HKD at the rates set on the Deposits tab.")}
      </div>
    </div>
  );
}

/* ── GOALS ───────────────────────────────────────────────────── */
function Goals({ st, d, up, lang }) {
  const L = (key) => t(lang, key);
  const tr = (zh, en) => (lang === "zh" ? zh : en);
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
              <TextIn value={g.name} onChange={(v) => up((s) => { s.goals[i].name = v; })} placeholder={L("Goal")} />
              {done ? <Chip tone="jade">{L("done")}</Chip> : late ? <Chip tone="red">{L("past date")}</Chip> : behind ? <Chip tone="gold">{L("short")}</Chip> : <Chip tone="jade">{L("on track")}</Chip>}
            </div>
            <div className="flex items-end justify-between mt-3">
              <Num value={money(g.current)} prefix="HK$" size={22} weight={800} color={tone} wrap />
              <span style={{ fontSize: 12.5, color: C.ink2 }}>{tr(`／HK$${money(g.target)} · ${pct.toFixed(0)}%`, `of HK$${money(g.target)} · ${pct.toFixed(0)}%`)}</span>
            </div>
            <div className="mt-2"><Bar2 pct={pct} color={tone} h={8} /></div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Lbl t={L("Saved so far")}><TextIn type="number" right value={g.current} onChange={(v) => up((s) => { s.goals[i].current = v; })} /></Lbl>
              <Lbl t={L("Target")}><TextIn type="number" right value={g.target} onChange={(v) => up((s) => { s.goals[i].target = v; })} /></Lbl>
              <Lbl t={L("Per month")}><TextIn type="number" right value={g.monthly} onChange={(v) => up((s) => { s.goals[i].monthly = v; })} /></Lbl>
              <Lbl t={L("Wanted by")}><TextIn type="date" value={g.deadline} onChange={(v) => up((s) => { s.goals[i].deadline = v; })} /></Lbl>
            </div>
            <div className="mt-3" style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}>
              {done ? tr("已達成目標。把資金撥去用途，或提高目標金額。", "Fully funded. Move the money to its purpose or raise the target.")
                : late ? tr(<>目標日期已過，還差 HK${money(left)}。請設定新的日期。</>, <>The date has passed with HK${money(left)} still to find. Pick a new one.</>)
                  : tr(<>還差 HK${money(left)}，剩 {Math.round(monthsLeft)} 個月——需要每月 <b style={{ color: tone }}>HK${money(Math.ceil(need))}</b>。{" "}
                    {behind ? `你目前每月投入 HK$${money(g.monthly)}，還差 HK$${money(Math.ceil(need - n(g.monthly)))}。` : `每月 HK$${money(g.monthly)} 就能達成。`}
                    {finish && <> 按目前速度，你會在 {fmtDate(finish, lang)} 完成。</>}
                    {monthsLeft <= 36 && <> 少於三年就要用到，所以這筆錢應該放在剛好在需要前到期的定存，而不是投資市場。</>}
                  </>, <>HK${money(left)} to go in {Math.round(monthsLeft)} months — that needs <b style={{ color: tone }}>HK${money(Math.ceil(need))}</b> a month.{" "}
                    {behind ? `You're putting in HK$${money(g.monthly)}, short by HK$${money(Math.ceil(need - n(g.monthly)))}.` : `HK$${money(g.monthly)} a month clears it.`}
                    {finish && <> At your current pace you finish {fmtDate(finish, lang)}.</>}
                    {monthsLeft <= 36 && <> Under three years away, so keep this money in a deposit maturing just before you need it — not in the market.</>}
                  </>)}
            </div>
            <div className="mt-3"><Btn size="sm" tone="danger" onClick={() => up((s) => { s.goals.splice(i, 1); })}>{L("Remove goal")}</Btn></div>
          </Card>
        );
      })}
      <Btn onClick={() => up((s) => { s.goals.push({ id: uid(), name: "", target: 0, current: 0, deadline: iso(addMonths(todayISO(), 12)), monthly: 0 }); })}>{L("+ Add a goal")}</Btn>
      <Card>
        <Eyebrow>{L("All goals together")}</Eyebrow>
        <div className="flex items-end justify-between mt-1">
          <Num value={money(d.goalNow)} prefix="HK$" size={20} weight={800} wrap />
          <span style={{ fontSize: 12.5, color: C.ink2 }}>{tr(`／HK$${money(d.goalTarget)}`, `of HK$${money(d.goalTarget)}`)}</span>
        </div>
        <div className="mt-2"><Bar2 pct={d.goalTarget ? (d.goalNow / d.goalTarget) * 100 : 0} color={C.gold} h={8} /></div>
        <div className="mt-2" style={{ fontSize: 12.5, color: C.ink2 }}>
          {tr(`目標合共需要每月 HK$${money(st.goals.reduce((a, g) => a + n(g.monthly), 0))}。你的計劃預留了 HK$${money(d.plannedSave)}。`, `Goals ask for HK$${money(st.goals.reduce((a, g) => a + n(g.monthly), 0))} a month. Your plan sets aside HK$${money(d.plannedSave)}.`)}
        </div>
      </Card>
    </div>
  );
}
