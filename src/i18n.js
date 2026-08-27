/* Passbook i18n — small dictionary of short, static UI strings.
   Lookup key is the English string itself; missing keys fall back to
   the key unchanged, so English always renders even if a translation
   is missing. Long, dynamic prose (the Grow-tab advice, composed
   sentences with numbers) is translated inline at the call site with
   a local `tr(zh, en)` helper instead of living here — see passbook.jsx. */

export const LANGS = ["zh", "en"];
export const DEFAULT_LANG = "zh";

const zh = {
  // shell / header / footer
  "Passbook": "Passbook",
  "Money · Deposits · P&L · Growth": "資金 · 定存 · 損益 · 成長",
  "net worth": "淨資產",
  "Synced to your account in the cloud. Rules of thumb, not licensed advice.":
    "資料已同步至你的雲端帳戶。以下內容僅供參考，並非持牌意見。",
  "Reset": "重設",
  "Reset every figure back to the starting sheet?": "要把所有數字重設回初始範本嗎？",
  "Saved": "已儲存",
  "Not saved — storage unavailable": "未能儲存 — 儲存服務不可用",

  // tabs
  "Overview": "總覽",
  "Grow": "成長",
  "Deposits": "定存",
  "Month": "月度",
  "Plan": "計劃",
  "Goals": "目標",

  // overview
  "Next manual re-deposit": "下一筆手動續存",
  "days idle": "日閒置",
  "days left": "日後到期",
  "On deposit": "定存總額",
  "Blended yield": "平均年利率",
  "% a year, weighted": "% 年利率（加權平均）",
  "Invested": "投資金額",
  "market value": "市值",
  "nothing compounding yet": "尚未有複利增長",
  "Kept per month": "每月儲蓄",
  "Goal funding": "目標資金",
  "Set a monthly savings amount on the Plan tab.": "請到「計劃」分頁設定每月儲蓄金額。",
  "Savings line": "儲蓄趨勢",
  "Goal progress carried forward 24 months.": "目標進度預測未來 24 個月。",
  "Dashed line is your actual pace from the ledger.": " 虛線是你帳本中的實際儲蓄速度。",
  "goal total": "目標總額",
  "What to do next": "下一步建議",
  "Log an entry": "記錄交易",

  // grow
  "The order money should move": "資金應該按這個順序運用",
  "Finish each step before starting the next. Most money mistakes are steps taken out of order.":
    "先完成上一步，再做下一步。大部分理財錯誤都是順序錯了。",
  "rule of thumb": "經驗法則",
  "What acceleration actually looks like": "加速累積實際上長怎樣",
  "Biggest levers, by what each pays per year": "最有效的槓桿，按每年帶來的金額排序",
  "Portfolio": "投資組合",
  "Health check": "健康檢查",
  "Savings rate": "儲蓄率",
  "Emergency cushion": "緊急預備金",
  "Idle money": "閒置資金",
  "Currency mix": "貨幣組合",
  "Per-bank exposure": "單一銀行風險",
  "Money that compounds": "正在複利增長的資金",
  "Expected return %": "預期回報 %",
  "Inflation %": "通脹 %",
  "Cushion months": "預備金月數",
  "Market value HK$": "市值 HK$",
  "Buying per month": "每月定投",
  "What you hold, and where": "持有什麼、放在哪裡",

  // deposits
  "Maturing in 30 days": "30 日內到期",
  "needs a decision": "需要決定去向",
  "Maturity ladder · next 12 months": "未來 12 個月到期階梯",
  "All": "全部",
  "No deposits here yet.": "這裡還沒有定存資料。",
  "matured": "已到期",
  "Bank": "銀行",
  "Currency": "幣種",
  "Rate % p.a.": "年利率 %",
  "Term (months)": "期數（月）",
  "Placed on": "起存日期",
  "Interest this term": "本期利息",
  "Bank renews": "銀行自動續存",
  "Note": "備註",
  "Duplicate": "複製",
  "Close": "結束",
  "Closed": "已結束",
  "Reopen": "重新開啟",
  "Delete": "刪除",
  "+ Add a deposit": "+ 新增定存",

  // month
  "Kept this month": "本月結餘",
  "Where this month's spare money goes": "本月剩餘資金的去向",
  "Add an entry": "新增交易",
  "Spent": "支出",
  "Set aside": "儲蓄",
  "Extra money in": "額外收入",
  "Category": "類別",
  "Amount": "金額",
  "Note (optional)": "備註（可省略）",
  "Add": "新增",
  "Ledger": "收支流水",
  "Nothing logged yet. Add your first entry above.": "尚未有任何紀錄，先在上面新增一筆吧。",
  "Date": "日期",
  "Balance": "結餘",
  "set aside": "儲蓄",
  "in": "收入",
  "Plan against actual": "預算與實際比較",
  "Budget": "預算",
  "Actual": "實際",
  "Diff": "差額",
  "unplanned": "計劃外",
  "Kept": "結餘",
  "save": "儲蓄",

  // plan
  "Money in each month": "每月收入",
  "Source": "來源",
  "+ Add income": "+ 新增收入",
  "Living": "生活",
  "People & learning": "人際與學習",
  "Savings": "儲蓄",
  "+ Add line": "+ 新增項目",
  "Does the plan balance?": "計劃是否平衡？",
  "Money in": "收入",
  "Spending": "支出",
  "Left over": "餘額",
  "Every dollar has a name, with nothing spare for surprises. A small buffer line is worth carving out.":
    "每一分錢都已經有去處，沒有預留意外開支的空間，值得留一小筆緩衝。",
  "The plan spends more than it earns. Trim a line or lower a savings target.":
    "計劃入不敷支，需要削減某項開支或調低儲蓄目標。",
  "Spare each month. Send it to a goal on the day you're paid, before it drifts.":
    "每月有結餘，發薪當天就撥去目標，不要讓它悄悄花掉。",

  // goals
  "Goal": "目標名稱",
  "done": "已達成",
  "past date": "已過期",
  "short": "進度落後",
  "on track": "進度正常",
  "Saved so far": "已儲金額",
  "Target": "目標金額",
  "Per month": "每月投入",
  "Wanted by": "目標日期",
  "Remove goal": "移除目標",
  "+ Add a goal": "+ 新增目標",
  "All goals together": "所有目標合計",

  // auth / shell (main.jsx)
  "PRIVATE FINANCE": "私人財務",
  "Log in after registering, and your data syncs across your phone and computer.":
    "登入後，你的資料會安全同步到手機和電腦。",
  "Email": "電郵",
  "Password": "密碼",
  "Log in": "登入",
  "Create account": "建立帳戶",
  "No account? Sign up": "沒有帳戶？立即註冊",
  "Already have an account? Log in": "已有帳戶？返回登入",
  "Sign-up successful. Please verify your email, then come back and log in.":
    "註冊成功。請到電郵完成驗證，然後回來登入。",
  "Opening Passbook…": "正在開啟 Passbook…",
  "PASSBOOK ERROR": "PASSBOOK 錯誤",
  "Page failed to open": "頁面未能開啟",
  "Unknown startup error": "未知的啟動錯誤",
  "Reload": "重新載入",
  "Sign out": "登出",
};

export function t(lang, key) {
  if (lang !== "zh") return key;
  return zh[key] ?? key;
}
