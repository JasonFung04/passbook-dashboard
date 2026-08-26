import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import Passbook from "../passbook.jsx";
import "./styles.css";

const supabase = createClient(
  "https://kojswhijtpirxaigcwuo.supabase.co",
  "sb_publishable_T3wnT2GdTs0_oxbxhKClmg_hJg3X6mn"
);

const normalise = (state) => {
  if (!state) return state;
  state.settings ||= {};
  state.settings.rates ||= { USD: 7.8, CNY: 1.09 };
  state.settings.rates.CNY ||= 1.09;
  state.settings.fx ??= state.settings.rates.USD;
  state.snapshots ||= [];
  state.tx = (state.tx || []).map((item) => ({ ccy: "HKD", ...item }));
  return state;
};

globalThis.fx = 7.8;
window.storage = {
  async get() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Authentication required");
    const { data, error } = await supabase
      .from("passbook_state")
      .select("state")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    return data?.state ? { value: JSON.stringify(normalise(data.state)) } : null;
  },
  async set(_key, value) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Authentication required");
    const state = normalise(JSON.parse(value));
    const { error } = await supabase.from("passbook_state").upsert({
      user_id: session.user.id,
      state,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
};

function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (!result.data.session) setMessage("註冊成功。請到電郵完成驗證，然後回來登入。");
  };
  return <main className="auth-shell"><section className="auth-card"><p>PRIVATE FINANCE</p><h1>Passbook</h1><span>登入後可在手機和電腦同步你的資料。</span><form onSubmit={submit}><label>電郵<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>密碼<input type="password" minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button>{mode === "login" ? "登入" : "建立帳戶"}</button></form>{message && <em>{message}</em>}<button className="switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "沒有帳戶？立即註冊" : "已有帳戶？返回登入"}</button></section></main>;
}

function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <main className="loading">Opening Passbook…</main>;
  if (!session) return <Auth />;
  return <Passbook />;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);