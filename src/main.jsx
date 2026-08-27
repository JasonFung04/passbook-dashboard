import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Passbook from "../passbook.jsx";
import { supabase } from "./supabaseClient.js";
import { t, DEFAULT_LANG } from "./i18n.js";
import "./styles.css";

// Non-destructive: only fills in fields missing from older saved states
// (pre-multi-currency records default to HKD). Existing values are kept as-is.
const normalise = (state) => {
  if (!state) return state;
  state.settings ||= {};
  state.settings.rates ||= { USD: 7.8, CNY: 1.09 };
  state.settings.rates.USD ||= 7.8;
  state.settings.rates.CNY ||= 1.09;
  state.snapshots ||= [];
  state.tx = (state.tx || []).map((item) => ({ ccy: "HKD", ...item }));
  state.income = (state.income || []).map((item) => ({ ccy: "HKD", ...item }));
  state.budget = (state.budget || []).map((item) => ({ ccy: "HKD", ...item }));
  return state;
};

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
    const { error } = await supabase.from("passbook_state").upsert({
      user_id: session.user.id,
      state: normalise(JSON.parse(value)),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
};

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    const { lang } = this.props;
    return (
      <main className="error-shell">
        <section className="auth-card">
          <p>{t(lang, "PASSBOOK ERROR")}</p>
          <h1>{t(lang, "Page failed to open")}</h1>
          <span>{this.state.error.message || t(lang, "Unknown startup error")}</span>
          <button onClick={() => location.reload()}>{t(lang, "Reload")}</button>
        </section>
      </main>
    );
  }
}

function Auth({ lang }) {
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
    else if (!result.data.session) setMessage(t(lang, "Sign-up successful. Please verify your email, then come back and log in."));
  };
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p>{t(lang, "PRIVATE FINANCE")}</p>
        <h1>Passbook</h1>
        <span>{t(lang, "Log in after registering, and your data syncs across your phone and computer.")}</span>
        <form onSubmit={submit}>
          <label>{t(lang, "Email")}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>{t(lang, "Password")}<input type="password" minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          <button>{mode === "login" ? t(lang, "Log in") : t(lang, "Create account")}</button>
        </form>
        {message && <em>{message}</em>}
        <button className="switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
          {mode === "login" ? t(lang, "No account? Sign up") : t(lang, "Already have an account? Log in")}
        </button>
      </section>
    </main>
  );
}

function LangToggle({ lang, onChange }) {
  return (
    <div className="pb-langbar">
      <button type="button" className="pb-langbtn" onClick={() => onChange(lang === "zh" ? "en" : "zh")}>
        {lang === "zh" ? "English" : "繁中"}
      </button>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(undefined);
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("passbook-language") || DEFAULT_LANG; } catch { return DEFAULT_LANG; }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  const changeLang = (next) => {
    setLang(next);
    try { localStorage.setItem("passbook-language", next); } catch { /* storage may be unavailable */ }
  };

  return (
    <>
      <LangToggle lang={lang} onChange={changeLang} />
      {session === undefined ? (
        <main className="loading">{t(lang, "Opening Passbook…")}</main>
      ) : !session ? (
        <Auth lang={lang} />
      ) : (
        <ErrorBoundary lang={lang}>
          <Passbook lang={lang} onSignOut={() => supabase.auth.signOut()} />
        </ErrorBoundary>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
