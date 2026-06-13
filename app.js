// ============================================================
// DEMO ACCOUNT
// Pre-loaded data used when someone clicks "Try demo account"
// ============================================================
// Demo account transactions are tuned so calcScore() returns exactly 65:
// income=22500, expense=10000 → savingsRate=0.5556 (×50 = 27.78pts)
// wants=3200,   expense=10000 → wantsRate=0.32   → (1-0.32)×40 = 27.2pts
// has a goal                  → goalBonus = 10pts →  total = 64.98 → rounds to 65
const DEMO = {
  name:"Tunde Adeyemi",
  email:"tunde@demo.com",
  password:"demo123",
  transactions:[
    {id:1,type:"income", amount:15000,category:"Allowance",   description:"Monthly allowance",  date:"2024-06-01",wantsNeeds:"needs"},
    {id:2,type:"expense",amount:2500, category:"Food",        description:"Lunch and snacks",   date:"2024-06-02",wantsNeeds:"needs"},
    {id:3,type:"expense",amount:1500, category:"Transport",   description:"Bus fare",           date:"2024-06-03",wantsNeeds:"needs"},
    {id:4,type:"expense",amount:2000, category:"Fun",         description:"Cinema outing",      date:"2024-06-04",wantsNeeds:"wants"},
    {id:5,type:"income", amount:7500, category:"Side hustle", description:"Graphic design job", date:"2024-06-05",wantsNeeds:"needs"},
    {id:6,type:"expense",amount:1500, category:"Data",        description:"Mobile data bundle", date:"2024-06-06",wantsNeeds:"needs"},
    {id:7,type:"expense",amount:1200, category:"Fun",         description:"Clothes shopping",   date:"2024-06-07",wantsNeeds:"wants"},
    {id:8,type:"expense",amount:800,  category:"School",      description:"Stationery",         date:"2024-06-08",wantsNeeds:"needs"},
    {id:9,type:"expense",amount:500,  category:"Food",        description:"Bread and groceries",date:"2024-06-10",wantsNeeds:"needs"},
  ],
  goals:[{id:1,name:"Buy AirPods",target:35000,saved:12000,deadline:"2024-08-01"}]
};

// ============================================================
// APP STATE
// Single object that holds everything the app needs at runtime.
// When state changes, render() is called to refresh the UI.
// ============================================================
let state = {
  user: null,         // the logged-in user object (null means not logged in)
  tab: "dashboard",   // which tab/page is currently visible
  prevTab: "dashboard", // the tab the user was on before opening profile
  transactions: [],   // array of all income and expense entries
  goals: [],          // array of savings goals
  aiMessages: [],     // chat history for the AI coach tab
  newGoalOpen: false, // whether the "add new goal" form is expanded
  _logType: "income", // selected type on the Log tab (income or expense)
  theme: "light"      // current colour theme (light or dark)
};


// ============================================================
// STORAGE HELPERS
// Wrap localStorage so the rest of the code doesn't have to
// deal with JSON parsing or try/catch every time.
// ============================================================

// Reads a value from localStorage and parses it as JSON.
// Returns null if the key doesn't exist or parsing fails.
function getStorage(key) {
  try { const d = localStorage.getItem("pw_" + key); return d ? JSON.parse(d) : null; }
  catch(e) { return null; }
}

// Saves a value to localStorage as a JSON string.
function setStorage(key, val) {
  try { localStorage.setItem("pw_" + key, JSON.stringify(val)); }
  catch(e) {}
}


// ============================================================
// THEME
// Supports light and dark mode. The chosen theme is saved to
// localStorage so it persists when the user comes back.
// ============================================================

// Applies a theme by setting the data-theme attribute on <html>,
// updates state, and saves the preference.
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  state.theme = t;
  setStorage("theme", t);
}

// Switches between light and dark, then re-renders the page.
function toggleTheme() {
  applyTheme(state.theme === "light" ? "dark" : "light");
  render();
}

// Runs immediately on page load to restore the user's saved theme.
(function initTheme() {
  const saved = getStorage("theme");
  applyTheme(saved || "light");
})();


// ============================================================
// AUTH — LOGIN / SIGNUP / LOGOUT
// ============================================================

// Sets the logged-in user in state, loads their saved data, then renders the app.
// Google OAuth users load from Firestore (cloud). Local/demo users load from localStorage.
async function loadUser(u) {
  state.user = u;

  if (u.isFirebase && typeof firebase !== "undefined") {
    try {
      const db = firebase.firestore();
      const doc = await db.collection("users").doc(u.uid).get();
      if (doc.exists) {
        const data = doc.data();
        state.transactions = data.transactions || [];
        state.goals = data.goals || [];
        if (data.name) state.user.name = data.name; // use name saved in-app if updated
        setStorage("google_" + u.email, true); // keep the marker fresh on every login
      } else {
        // First time this Google user has signed in — create their document
        state.transactions = [];
        state.goals = [];
        await db.collection("users").doc(u.uid).set({ name: u.name, email: u.email, transactions: [], goals: [] });
        // Mark this email as a Google account so email/password signup can't reuse it
        setStorage("google_" + u.email, true);
      }
    } catch(e) {
      console.error("Firestore load error:", e);
      state.transactions = [];
      state.goals = [];
    }
  } else if (u.email === DEMO.email) {
    // Demo account always starts fresh — never read from localStorage
    state.transactions = JSON.parse(JSON.stringify(DEMO.transactions));
    state.goals = JSON.parse(JSON.stringify(DEMO.goals));
  } else {
    // localStorage for regular email/password accounts
    const storageKey = u.uid || u.email;
    const txns = getStorage("txns_" + storageKey);
    const goals = getStorage("goals_" + storageKey);
    state.transactions = txns || u.transactions || [];
    state.goals = goals || u.goals || [];
  }

  state.aiMessages = [{
    role: "ai",
    text: "Hi " + u.name.split(" ")[0] + "! I am your PocketWise AI coach. Ask me anything about your finances. How can I help you save more, understand your spending, or reach your goals?"
  }];
  render();
}

// Saves the current user's transactions and goals.
// Google OAuth users save to Firestore. Local/demo users save to localStorage.
async function saveData() {
  if (!state.user) return;
  if (state.user.email === DEMO.email) return; // demo data is never persisted — always resets on logout
  if (state.user.isFirebase && typeof firebase !== "undefined") {
    try {
      const db = firebase.firestore();
      await db.collection("users").doc(state.user.uid).set(
        { transactions: state.transactions, goals: state.goals },
        { merge: true }
      );
    } catch(e) {
      console.error("Firestore save error:", e);
    }
  } else {
    const storageKey = state.user.uid || state.user.email;
    setStorage("txns_" + storageKey, state.transactions);
    setStorage("goals_" + storageKey, state.goals);
  }
}

// Switches the auth screen between "login" and "signup" views.
function showAuth(mode) {
  document.getElementById("app").innerHTML = renderAuth(mode);
}

// Handles the login or signup form submission.
// For signup: creates a new user and saves them.
// For login: checks credentials against stored data (or the demo account).
function handleAuth(mode) {
  const email = (document.getElementById("f-email") || {}).value || "";
  const pass = (document.getElementById("f-pass") || {}).value || "";
  const err = document.getElementById("auth-err");
  if (mode === "signup") {
    const name = (document.getElementById("f-name") || {}).value || "";
    if (!name || !email || !pass) { err.style.display = "block"; err.textContent = "Please fill in all fields."; return; }
    if (getStorage("google_" + email)) { err.style.display = "block"; err.textContent = "This email is linked to a Google account. Please use Continue with Google instead."; return; }
    if (getStorage("user_" + email)) { err.style.display = "block"; err.textContent = "An account with this email already exists. Please log in instead."; return; }
    const pwdErr = validatePassword(pass);
    if (pwdErr) { err.style.display = "block"; err.textContent = pwdErr; return; }
    const u = {name, email, password: pass, transactions: [], goals: []};
    setStorage("user_" + email, u);
    loadUser(u);
  } else {
    if (email === DEMO.email && pass === DEMO.password) { loadUser(JSON.parse(JSON.stringify(DEMO))); return; }
    const u = getStorage("user_" + email);
    if (!u || u.password !== pass) { err.style.display = "block"; err.textContent = "Invalid email or password."; return; }
    loadUser(u);
  }
}

// Loads the demo account with pre-filled sample data.
function handleDemo() {
  loadUser(JSON.parse(JSON.stringify(DEMO)));
}

// Opens the profile page, remembering which tab to return to.
function goToProfile() {
  state.prevTab = state.tab;
  state.tab = "profile";
  render();
}

// Signs the user out of Firebase (if applicable) and clears all state.
function logout() {
  if (typeof firebase !== "undefined") {
    firebase.auth().signOut();
  }
  state.user = null;
  state.tab = "dashboard";
  state.prevTab = "dashboard";
  state.transactions = [];
  state.goals = [];
  state.aiMessages = [];
  state.newGoalOpen = false;
  state._logType = "income";
  render();
}

// Signs in with a Google account via a popup window.
// onAuthStateChanged picks up the result and calls loadUser automatically.
async function signInWithGoogle() {
  const err = document.getElementById("auth-err");
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
  } catch(e) {
    if (err) { err.style.display = "block"; err.textContent = "Google sign-in failed. Please try again."; }
  }
}


// ============================================================
// HELPER FUNCTIONS
// Small utilities used across multiple parts of the app.
// ============================================================

// Calculates a financial health score from 0 to 100.
// Score is based on savings rate (50 pts), low wants spending (40 pts),
// and having at least one goal (10 pts bonus).
function calcScore() {
  const txns = state.transactions;
  if (!txns.length) return 50; // default score when there's no data yet
  const income = txns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const wants = txns.filter(t => t.type === "expense" && t.wantsNeeds === "wants").reduce((s, t) => s + t.amount, 0);
  const savingsRate = income > 0 ? Math.max(0, (income - expense) / income) : 0;
  const wantsRate = expense > 0 ? wants / expense : 0;
  const goalBonus = state.goals.length > 0 ? 10 : 0;
  const score = Math.round(savingsRate * 50 + (1 - wantsRate) * 40 + goalBonus);
  return Math.min(100, Math.max(0, score));
}

// Returns a text label for a given score number.
function getScoreLabel(s) {
  if (s >= 80) return "Excellent";
  if (s >= 60) return "Good";
  if (s >= 40) return "Fair";
  return "Needs work";
}

// Formats a number as a Naira amount, e.g. 5000 → "₦5,000"
function fmtAmt(n) { return "₦" + n.toLocaleString(); }

// Emoji icons for each spending/income category.
const CAT_ICONS = {
  Food:"🍛", Transport:"🚌", Fun:"🎉",
  Data:"📶", School:"📚", Other:"💳",
  Allowance:"💰", "Side hustle":"💼", Gift:"🎁"
};

// Returns the background colour for a category icon bubble.
// Uses lighter colours in light mode and darker ones in dark mode.
function catBg(cat) {
  const light = {Food:"#FFF4E5",Transport:"#E6F1FB",Fun:"#FAECE7",Data:"#FFF8E7",School:"#EEEDFE",Other:"#F0F0F0",Allowance:"#E1F5EE","Side hustle":"#E1F5EE",Gift:"#FBEAF0"};
  const dark  = {Food:"#3a2e1a",Transport:"#1a2e3a",Fun:"#3a201a",Data:"#3a321a",School:"#2a263a",Other:"#2a2a2a",Allowance:"#1a3a30","Side hustle":"#1a3a30",Gift:"#3a1a28"};
  return state.theme === "dark" ? (dark[cat] || "#2a2a2a") : (light[cat] || "#F0F0F0");
}

// Returns the text/bar colour for a given category (used in charts).
function catColor(cat) {
  const map = {Food:"#BA7517",Transport:"#378ADD",Fun:"#D85A30",Data:"#EF9F27",School:"#534AB7",Allowance:"#1D9E75","Side hustle":"#0F6E56",Gift:"#D4537E",Other:"#888780"};
  return map[cat] || "#888";
}

// Decides whether a category is a "want" or a "need".
// Fun, Other, and Gift are wants; everything else is a need.
function classifyWantsNeeds(cat) {
  return ["Fun", "Other", "Gift"].includes(cat) ? "wants" : "needs";
}


// ============================================================
// PASSWORD SECURITY
// ============================================================

// Returns an error message if the password is too weak, or null if it passes.
// Rules: min 8 chars, at least one uppercase, one lowercase, one number.
function validatePassword(pass) {
  if (pass.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pass)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(pass)) return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(pass)) return "Password must include at least one number.";
  return null;
}

// Updates the strength bar and hint text as the user types their password.
// Score is based on how many of the 5 criteria are met (including special chars as a bonus).
function checkPwdStrength(val, fillId, hintId) {
  const fill = document.getElementById(fillId);
  const hint = document.getElementById(hintId);
  if (!fill || !hint) return;
  const checks = [val.length >= 8, /[A-Z]/.test(val), /[a-z]/.test(val), /[0-9]/.test(val), /[^A-Za-z0-9]/.test(val)];
  const score = checks.filter(Boolean).length;
  const levels = [
    { pct: 0,   color: "",              label: "Min. 8 chars, uppercase, lowercase, number" },
    { pct: 20,  color: "#D85A30",       label: "Very weak" },
    { pct: 40,  color: "#EF9F27",       label: "Weak" },
    { pct: 60,  color: "#EF9F27",       label: "Fair" },
    { pct: 80,  color: "#1D9E75",       label: "Strong" },
    { pct: 100, color: "#1D9E75",       label: "Very strong" },
  ];
  const level = val.length > 0 ? levels[score] : levels[0];
  fill.style.width = level.pct + "%";
  fill.style.background = level.color;
  hint.textContent = level.label;
  hint.style.color = val.length > 0 && score < 4 ? "var(--danger)" : "var(--text-muted)";
}

// ============================================================
// RENDER: AUTH SCREEN
// Builds the login/signup page HTML.
// mode is either "login" or "signup".
// ============================================================
function renderAuth(mode) {
  return `<div class="auth">
    <div style="position:absolute;top:20px;right:20px">
      <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">${state.theme === "light" ? "🌙" : "☀️"}</button>
    </div>
    <div class="logo">Pocket<span>Wise</span></div>
    <div class="tagline">Your money. Your future.</div>
    <div class="auth-card">
      <div class="auth-tabs">
        <button class="auth-tab ${mode === "login" ? "active" : ""}" onclick="showAuth('login')">Log in</button>
        <button class="auth-tab ${mode === "signup" ? "active" : ""}" onclick="showAuth('signup')">Sign up</button>
      </div>
      <div id="auth-err" class="err"></div>
      <button class="btn-google" onclick="signInWithGoogle()">
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Continue with Google
      </button>
      <div class="auth-divider">or</div>
      ${mode === "signup" ? `<div class="fg"><label>Full name</label><input id="f-name" placeholder="e.g. Amara Okafor" /></div>` : ""}
      <div class="fg"><label>Email address</label><input id="f-email" placeholder="you@example.com" type="email" /></div>
      <div class="fg">
        <label>Password</label>
        <input id="f-pass" placeholder="Min. 8 chars, uppercase, lowercase, number" type="password" ${mode === "signup" ? `oninput="checkPwdStrength(this.value,'auth-pwd-fill','auth-pwd-hint')"` : ""} />
        ${mode === "signup" ? `<div class="pwd-strength"><div class="pwd-strength-fill" id="auth-pwd-fill"></div></div><div class="pwd-hint" id="auth-pwd-hint">Min. 8 chars, uppercase, lowercase, number</div>` : ""}
      </div>
      <button class="btn-primary" onclick="handleAuth('${mode}')">${mode === "login" ? "Log in" : "Create account"}</button>
      <button class="btn-demo" onclick="handleDemo()">✨ Try demo account</button>
    </div>
  </div>`;
}


// ============================================================
// RENDER: DASHBOARD
// The home tab. Shows health score, summary stats, a daily tip,
// and the 5 most recent transactions.
// ============================================================
function renderDashboard() {
  const score = calcScore();
  const income = state.transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = state.transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const recent = state.transactions.slice(-5).reverse(); // last 5, newest first

  // One tip is picked at random each time the dashboard loads
  const tips = [
    "Try saving at least 20% of every allowance.",
    "Label your expenses as wants or needs.",
    "Set a savings goal. Even ₦1,000 a week adds up.",
    "Review your spending every Sunday."
  ];
  const tip = tips[Math.floor(Math.random() * tips.length)];

  return `
    <div style="margin-bottom:16px">
      <div style="font-size:22px;font-weight:700;color:var(--text-primary)">Hello, ${state.user.name.split(" ")[0]}! 👋</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:2px">Here's your financial summary</div>
    </div>
    <div class="score-card">
      <div class="score-label">Financial health score</div>
      <div class="score-val">${score}</div>
      <div class="score-sub">${getScoreLabel(score)} — keep it up!</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total income</div><div class="stat-val income">${fmtAmt(income)}</div></div>
      <div class="stat-card"><div class="stat-label">Total spent</div><div class="stat-val expense">${fmtAmt(expense)}</div></div>
      <div class="stat-card"><div class="stat-label">Balance</div><div class="stat-val" style="color:${balance >= 0 ? "var(--accent)" : "var(--danger)"}">${fmtAmt(balance)}</div></div>
      <div class="stat-card"><div class="stat-label">Transactions</div><div class="stat-val">${state.transactions.length}</div></div>
    </div>
    <div class="section-title">Daily tip</div>
    <div class="tip-card">
      <div class="tip-icon">💡</div>
      <div class="tip-text">${tip}</div>
    </div>
    <div class="section-title">Recent transactions</div>
    ${recent.length ? `<div class="recent-list">${recent.map(t => `
      <div class="txn-item">
        <div class="txn-left">
          <div class="txn-icon" style="background:${catBg(t.category)}">${CAT_ICONS[t.category] || "💳"}</div>
          <div class="txn-info">
            <div class="txn-name">${t.description}</div>
            <div class="txn-meta">${t.category} · ${t.date}</div>
          </div>
        </div>
        <div class="txn-amt ${t.type === "income" ? "inc" : "exp"}">${t.type === "income" ? "+" : "-"}${fmtAmt(t.amount)}</div>
      </div>`).join("")}</div>` : `<div class="empty-state">No transactions yet. Start by logging your first one!</div>`}`;
}


// ============================================================
// RENDER: LOG TAB
// Shows the form to add a new transaction, plus a full list
// of all past transactions with their wants/needs badges.
// ============================================================
function renderLog() {
  const tp = state._logType || "income";
  // Category options change depending on whether it's income or expense
  const cats = tp === "income" ? ["Allowance","Side hustle","Gift","Other"] : ["Food","Transport","Fun","Data","School","Other"];
  return `
    <div class="log-form">
      <div class="section-title" style="margin-bottom:14px;margin-top:0">Log a transaction</div>
      <div class="type-toggle">
        <button class="type-btn income ${tp === "income" ? "active" : ""}" onclick="setLogType('income')">⬆ Income</button>
        <button class="type-btn expense ${tp === "expense" ? "active" : ""}" onclick="setLogType('expense')">⬇ Expense</button>
      </div>
      <div class="fg"><label>Description</label><input id="l-desc" placeholder="e.g. Weekly allowance" /></div>
      <div class="fg"><label>Amount (₦)</label><input id="l-amt" type="number" placeholder="e.g. 5000" /></div>
      <div class="fg"><label>Category</label>
        <select id="l-cat" class="select-field">${cats.map(c => `<option>${c}</option>`).join("")}</select>
      </div>
      <div class="fg"><label>Date</label><input id="l-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <button class="btn-primary" onclick="addTransaction()">Save transaction</button>
    </div>
    <div class="section-title">All transactions</div>
    ${state.transactions.length ? `<div class="recent-list">${[...state.transactions].reverse().map(t => `
      <div class="txn-item">
        <div class="txn-left">
          <div class="txn-icon" style="background:${catBg(t.category)}">${CAT_ICONS[t.category] || "💳"}</div>
          <div class="txn-info">
            <div class="txn-name">${t.description} ${t.type === "expense" ? `<span class="wants-badge ${t.wantsNeeds}">${t.wantsNeeds}</span>` : ""}</div>
            <div class="txn-meta">${t.category} · ${t.date}</div>
          </div>
        </div>
        <div class="txn-amt ${t.type === "income" ? "inc" : "exp"}">${t.type === "income" ? "+" : "-"}${fmtAmt(t.amount)}</div>
      </div>`).join("")}</div>` : `<div class="empty-state">No transactions yet.</div>`}`;
}

// Switches the log form between income and expense mode, then re-renders.
function setLogType(t) { state._logType = t; render(); }

// Reads the log form inputs, validates them, and adds a new transaction to state.
// Automatically classifies the category as a want or need before saving.
function addTransaction() {
  const desc = document.getElementById("l-desc").value.trim();
  const amt = parseFloat(document.getElementById("l-amt").value);
  const cat = document.getElementById("l-cat").value;
  const date = document.getElementById("l-date").value;
  if (!desc || !amt || !date) { alert("Please fill in all fields."); return; }
  state.transactions.push({
    id: Date.now(),
    type: state._logType || "income",
    amount: amt,
    category: cat,
    description: desc,
    date,
    wantsNeeds: classifyWantsNeeds(cat)
  });
  saveData();
  state._logType = "income"; // reset toggle back to income after saving
  render();
}


// ============================================================
// RENDER: WANTS VS NEEDS TAB
// Shows what percentage of spending is wants vs needs,
// and a bar chart of spending broken down by category.
// ============================================================
function renderWN() {
  const expenses = state.transactions.filter(t => t.type === "expense");
  const total = expenses.reduce((s, t) => s + t.amount, 0);
  const wants = expenses.filter(t => t.wantsNeeds === "wants").reduce((s, t) => s + t.amount, 0);
  const needs = total - wants;
  const wPct = total > 0 ? Math.round(wants / total * 100) : 0;
  const nPct = total > 0 ? 100 - wPct : 0;

  // Group expenses by category and sort highest to lowest for the bar chart
  const cats = {};
  expenses.forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount; });
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const max = sorted[0] ? sorted[0][1] : 1; // used to calculate bar widths as percentages

  return `
    <div class="section-title" style="margin-top:0">Wants vs needs</div>
    <div class="wn-summary">
      <div class="wn-card wants-card"><div class="wn-pct">${wPct}%</div><div class="wn-lbl">Wants</div><div class="wn-amt">${fmtAmt(wants)}</div></div>
      <div class="wn-card needs-card"><div class="wn-pct">${nPct}%</div><div class="wn-lbl">Needs</div><div class="wn-amt">${fmtAmt(needs)}</div></div>
    </div>
    ${wPct > 50 ? `<div class="tip-card"><div class="tip-icon" style="background:var(--danger-soft)">⚠️</div><div class="tip-text">You are spending <strong>${wPct}%</strong> on wants. Try to keep wants below 30% for a healthier balance.</div></div>` : wPct > 0 && wPct <= 30 ? `<div class="tip-card"><div class="tip-icon">🎉</div><div class="tip-text">Great balance! Your wants spending is under control at <strong>${wPct}%</strong>.</div></div>` : ""}
    <div class="section-title">Spending by category</div>
    ${sorted.length ? `<div class="chart-bar-wrap">${sorted.map(([cat, amt]) => `
      <div class="chart-row">
        <div class="chart-label">${cat}</div>
        <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${Math.round(amt / max * 100)}%;background:${catColor(cat)}"></div></div>
        <div class="chart-amt">${fmtAmt(amt)}</div>
      </div>`).join("")}</div>` : `<div class="empty-state">Log some expenses to see the breakdown.</div>`}`;
}


// ============================================================
// RENDER: GOALS TAB
// Displays all savings goals with progress bars.
// Also contains the form to add a new goal.
// ============================================================
function renderGoals() {
  return `
    <div class="section-title" style="margin-top:0">Savings goals</div>
    ${state.goals.length ? state.goals.map(g => {
      const pct = Math.min(100, Math.round(g.saved / g.target * 100)); // cap at 100%
      return `<div class="goal-card">
        <div class="goal-header"><div class="goal-name">🎯 ${g.name}</div><div class="goal-meta">Due ${g.deadline}</div></div>
        <div class="progress-bg"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="goal-footer"><span>${fmtAmt(g.saved)} saved</span><span>${pct}% of ${fmtAmt(g.target)}</span></div>
        <div class="topup-row">
          <input id="top-${g.id}" type="number" placeholder="Add ₦ amount" />
          <button onclick="topUpGoal(${g.id})">Add</button>
        </div>
      </div>`;
    }).join("") : `<div class="empty-state">No goals yet. Add one below!</div>`}
    <button class="btn-demo" style="margin-bottom:12px;margin-top:10px" onclick="toggleGoalForm()">${state.newGoalOpen ? "Cancel" : "+ Add new goal"}</button>
    ${state.newGoalOpen ? `<div class="log-form" style="margin-top:0">
      <div class="fg"><label>Goal name</label><input id="g-name" placeholder="e.g. Buy a new phone" /></div>
      <div class="form-row">
        <div class="fg"><label>Target (₦)</label><input id="g-target" type="number" placeholder="e.g. 20000" /></div>
        <div class="fg"><label>Deadline</label><input id="g-date" type="date" /></div>
      </div>
      <button class="btn-primary" onclick="addGoal()">Save goal</button>
    </div>` : ""}`;
}

// Shows or hides the "add new goal" form.
function toggleGoalForm() { state.newGoalOpen = !state.newGoalOpen; render(); }

// Adds a top-up amount to a specific goal's saved total.
// Will not exceed the target amount.
function topUpGoal(id) {
  const input = document.getElementById("top-" + id);
  const amt = parseFloat(input.value);
  if (!amt) return;
  const g = state.goals.find(g => g.id === id);
  if (g) { g.saved = Math.min(g.target, g.saved + amt); saveData(); render(); }
}

// Reads the new goal form and adds a goal to state.
function addGoal() {
  const name = document.getElementById("g-name").value.trim();
  const target = parseFloat(document.getElementById("g-target").value);
  const deadline = document.getElementById("g-date").value;
  if (!name || !target || !deadline) { alert("Please fill in all fields."); return; }
  state.goals.push({id: Date.now(), name, target, saved: 0, deadline});
  state.newGoalOpen = false;
  saveData();
  render();
}


// ============================================================
// RENDER: REPORTS TAB
// Shows a full financial summary: income, expenses, net balance,
// savings rate, and a category spending chart.
// ============================================================
function renderReports() {
  const income = state.transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = state.transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const savingsRate = income > 0 ? Math.round((income - expense) / income * 100) : 0;

  // Group expenses by category for the chart
  const cats = {};
  state.transactions.filter(t => t.type === "expense").forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount; });
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const max = sorted[0] ? sorted[0][1] : 1;

  return `
    <div class="section-title" style="margin-top:0">Monthly summary</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Income</div><div class="stat-val income">${fmtAmt(income)}</div></div>
      <div class="stat-card"><div class="stat-label">Expenses</div><div class="stat-val expense">${fmtAmt(expense)}</div></div>
      <div class="stat-card"><div class="stat-label">Net balance</div><div class="stat-val" style="color:${balance >= 0 ? "var(--accent)" : "var(--danger)"}">${fmtAmt(balance)}</div></div>
      <div class="stat-card"><div class="stat-label">Savings rate</div><div class="stat-val" style="color:${savingsRate >= 20 ? "var(--accent)" : "var(--danger)"}">${savingsRate}%</div></div>
    </div>
    <div class="section-title">Spending by category</div>
    ${sorted.length ? `<div class="chart-bar-wrap">${sorted.map(([cat, amt]) => `
      <div class="chart-row">
        <div class="chart-label">${cat}</div>
        <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${Math.round(amt / max * 100)}%;background:${catColor(cat)}"></div></div>
        <div class="chart-amt">${fmtAmt(amt)}</div>
      </div>`).join("")}</div>` : `<div class="empty-state">No expenses logged yet.</div>`}`;
}


// ============================================================
// RENDER: AI COACH TAB
// Builds the chat UI — message bubbles and the input box.
// ============================================================
function renderAI() {
  return `<div class="ai-wrap">
    <div class="ai-messages" id="ai-msgs">
      ${state.aiMessages.map(m => `<div class="msg ${m.role} ${m.thinking ? "thinking" : ""}">${m.text.replace(/\n/g, "<br>")}</div>`).join("")}
    </div>
    <div class="ai-input-row">
      <input id="ai-in" placeholder="Ask your AI coach anything..." onkeydown="if(event.key==='Enter')sendAI()" />
      <button class="ai-send" onclick="sendAI()">Send</button>
    </div>
  </div>`;
}

// ============================================================
// SMART COACH (offline fallback)
// Pattern-matches the user's question against keywords and
// returns a personalised reply using real data from state.
// This runs when the Claude API is unavailable or times out.
// ============================================================
function smartCoachReply(question) {
  const q = question.toLowerCase();
  const name = state.user.name.split(" ")[0];

  // Pre-calculate totals used across multiple reply branches
  const income = state.transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = state.transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const wants = state.transactions.filter(t => t.type === "expense" && t.wantsNeeds === "wants").reduce((s, t) => s + t.amount, 0);
  const wPct = expense > 0 ? Math.round(wants / expense * 100) : 0;
  const savingsRate = income > 0 ? Math.round((income - expense) / income * 100) : 0;
  const score = calcScore();

  // Build a per-category spending map for category-specific questions
  const cats = {};
  state.transactions.filter(t => t.type === "expense").forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount; });
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const topCat = sorted[0]; // the category with the highest spending

  // Goal-related questions
  if (/goal|airpod|save for|target|reach|buy/.test(q)) {
    if (state.goals.length === 0) return `Hi ${name}, you have not set any savings goals yet. Goals are powerful because they give your money a purpose. Go to the Goals tab and set one, even something small like saving ₦5,000 for new earphones. I can give you specific advice once you have a target.`;
    const g = state.goals[0];
    const left = g.target - g.saved;
    const pct = Math.round(g.saved / g.target * 100);
    if (pct >= 100) return `Amazing, ${name}! You have already reached your goal of ${g.name}. Time to set the next one. What is next on your wishlist?`;
    const weeklyNeeded = Math.ceil(left / 8);
    return `You are ${pct}% of the way to your "${g.name}" goal. You need ${fmtAmt(left)} more. If you save about ${fmtAmt(weeklyNeeded)} per week, you can hit it in 8 weeks. Tip: skip 2 cinema trips or pack lunch from home twice a week. Small swaps make big differences.`;
  }

  // Spending/wants questions
  if (/wants|too much|spending|spend|broke|finish/.test(q)) {
    if (wPct > 50) return `${name}, ${wPct}% of your spending is on wants. That is the main reason your balance feels tight. Your biggest expense is ${topCat ? topCat[0] + " at " + fmtAmt(topCat[1]) : "unclear yet"}. Try the 50/30/20 rule: 50% on needs, 30% on wants, 20% saved. Cut your "fun" category in half this week and watch the difference.`;
    if (wPct > 30) return `Your wants are at ${wPct}%, which is okay but not great. The ideal is under 30%. You spent the most on ${topCat ? topCat[0] : "various things"}. Pick one thing to cut next week and put the savings into a goal.`;
    return `Honestly ${name}, you are doing well. Only ${wPct}% of your spending is on wants. Keep it up. The trick now is to make your savings work harder. Set a bigger goal or save a fixed amount weekly.`;
  }

  // "How am I doing?" type questions
  if (/how am i|doing|status|going|progress|health|score/.test(q)) {
    const verdict = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "okay, but there is room to grow" : "struggling, but I can help";
    return `${name}, your financial health score is ${score}/100, which is ${verdict}. You earned ${fmtAmt(income)} and spent ${fmtAmt(expense)}, leaving ${fmtAmt(balance)}. Your savings rate is ${savingsRate}%. ${savingsRate < 20 ? "Try to save at least 20% of every Naira you receive." : "You are saving well. Keep that habit alive."}`;
  }

  // Tips and general advice questions
  if (/save|tip|advice|help|better|improve|how do i|how can i/.test(q)) {
    const tips = [
      `Pay yourself first. The moment you get your allowance, move 20% to a savings goal before spending anything.`,
      `Track every single Naira for one week. You cannot fix what you do not measure. The app makes this easy.`,
      `Cook at home or pack lunch. Buying food daily can eat up 40% of an allowance fast.`,
      `Use the 24-hour rule. Before any want purchase above ₦2,000, wait one day. Most cravings pass.`,
      `Find a small side hustle. Tutoring, graphic design, or selling snacks at school can double your monthly income.`,
      `Compare prices before buying data. MTN, Glo, Airtel all have different student bundles.`,
      `Avoid impulse buys at school. Carry only the cash you planned to spend that day.`,
    ];
    const pick = tips.sort(() => Math.random() - 0.5).slice(0, 3); // pick 3 random tips
    return `Here are 3 tips just for you, ${name}:\n\n1. ${pick[0]}\n\n2. ${pick[1]}\n\n3. ${pick[2]}`;
  }

  // Food-specific questions
  if (/food|chop|eat/.test(q)) {
    const foodSpend = cats["Food"] || 0;
    return foodSpend > 0 ? `You spent ${fmtAmt(foodSpend)} on food so far. That is ${Math.round(foodSpend / expense * 100)}% of your total spending. To reduce it: pack lunch 3 days a week, buy snacks in bulk from supermarkets instead of at school, and avoid bottled drinks.` : `You have not logged any food expenses yet. When you do, I can help you find ways to cut down.`;
  }

  // Data/internet questions
  if (/data|internet|mb|gb/.test(q)) {
    const dataSpend = cats["Data"] || 0;
    return dataSpend > 0 ? `You spent ${fmtAmt(dataSpend)} on data. Look into monthly bundles, they are usually cheaper than weekly. Also use WiFi at school or home whenever possible to save your mobile data for emergencies.` : `No data expenses logged yet. When you start tracking, I will give you ways to save.`;
  }

  // Transport questions
  if (/transport|bus|keke|uber|bolt/.test(q)) {
    const tSpend = cats["Transport"] || 0;
    return tSpend > 0 ? `You spent ${fmtAmt(tSpend)} on transport. To cut this: combine trips, walk for short distances, or share rides with classmates going the same way.` : `No transport costs logged yet.`;
  }

  // Greeting
  if (/^(hi|hello|hey|good)/.test(q)) {
    return `Hey ${name}! Glad you are here. Your current balance is ${fmtAmt(balance)} and your health score is ${score}/100. What would you like to talk about? You can ask things like "how am I doing", "give me tips", or "how do I reach my goal".`;
  }

  // Income / earning more questions
  if (/earn|income|make money|hustle|side/.test(q)) {
    return `Great mindset, ${name}. As an SSS student in Nigeria, you can earn from: graphic design on Canva, social media management for small businesses, tutoring junior students, selling snacks at school, content writing, or running errands in your community. Even ₦5,000 extra a month adds up to ₦60,000 a year.`;
  }

  // Default reply — gives a data snapshot if nothing else matched
  const advice = score >= 70 ? "You are doing great. Keep your habits steady." : wPct > 50 ? `Your biggest issue is wants spending at ${wPct}%. Cut that to 30% or less.` : savingsRate < 20 ? `Your savings rate is only ${savingsRate}%. Try to push it above 20%.` : `Stay consistent. You are on the right track.`;
  return `Here is a quick look at your money, ${name}:\n\n• Balance: ${fmtAmt(balance)}\n• Wants vs Needs: ${wPct}% wants\n• Savings rate: ${savingsRate}%\n• Top spending: ${topCat ? topCat[0] + " (" + fmtAmt(topCat[1]) + ")" : "none yet"}\n\n${advice}\n\nYou can also ask me about your goals, saving tips, or specific categories like food or data.`;
}

// ============================================================
// SEND AI MESSAGE
// Called when the user submits a chat message.
// First tries the Claude API; if that fails or times out (8s),
// falls back to smartCoachReply() which works fully offline.
// ============================================================
async function sendAI() {
  const input = document.getElementById("ai-in");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  // Add the user's message and a temporary "Thinking..." bubble
  state.aiMessages.push({role: "user", text});
  state.aiMessages.push({role: "ai", text: "Thinking...", thinking: true});
  render();
  scrollAI();

  // Build context to send to the API so it can give personalised advice
  const income = state.transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = state.transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const wants = state.transactions.filter(t => t.type === "expense" && t.wantsNeeds === "wants").reduce((s, t) => s + t.amount, 0);
  const score = calcScore();
  const txnSummary = state.transactions.slice(-10).map(t => `${t.date}: ${t.type} of ₦${t.amount.toLocaleString()} on ${t.description} (${t.category})`).join("\n");

  const systemPrompt = `You are PocketWise AI Coach, a friendly personal finance assistant for Nigerian secondary school students.
Student name: ${state.user.name}.
Snapshot: Income ₦${income.toLocaleString()}, Expenses ₦${expense.toLocaleString()}, Balance ₦${(income - expense).toLocaleString()}, Wants ₦${wants.toLocaleString()}, Score ${score}/100.
Goals: ${state.goals.map(g => `${g.name} (₦${g.saved.toLocaleString()} of ₦${g.target.toLocaleString()})`).join(", ") || "none yet"}
Recent transactions:
${txnSummary || "No transactions yet."}

Give short, practical, specific advice based on actual numbers. Use Nigerian context. Keep under 120 words. Conversational and relatable to teenagers. No em dashes.`;

  let replyText = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // abort if no response in 8 seconds
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: state.aiMessages.filter(m => !m.thinking).map(m => ({role: m.role === "ai" ? "assistant" : "user", content: m.text}))
      })
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      replyText = (data.content || []).map(c => c.text || "").filter(Boolean).join("\n");
    }
  } catch(e) { /* API failed or timed out — falls through to smart coach below */ }

  // Use the offline smart coach if the API gave nothing useful
  if (!replyText || replyText.length < 5) {
    replyText = smartCoachReply(text);
  }

  // Replace the "Thinking..." bubble with the real reply
  state.aiMessages = state.aiMessages.filter(m => !m.thinking);
  state.aiMessages.push({role: "ai", text: replyText});
  render();
  scrollAI();
}

// Scrolls the chat window to the latest message.
function scrollAI() {
  setTimeout(() => { const el = document.getElementById("ai-msgs"); if (el) el.scrollTop = el.scrollHeight; }, 50);
}


// ============================================================
// RENDER: PROFILE PAGE
// Accessible by clicking the avatar in the topbar.
// Lets the user update their display name and change their password.
// Email is shown but cannot be changed (it's the storage key).
// ============================================================
function renderProfile() {
  const initials = state.user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <button onclick="setTab(state.prevTab)" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-secondary);padding:4px;line-height:1">&#8592;</button>
      <div class="section-title" style="margin:0">My profile</div>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:24px">
      <div style="width:72px;height:72px;border-radius:50%;background:var(--accent-soft);color:var(--accent-soft-text);font-size:24px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:12px">${initials}</div>
      <div style="font-size:16px;font-weight:600;color:var(--text-primary)">${state.user.name}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${state.user.email}</div>
    </div>

    <div class="log-form" style="margin-bottom:14px">
      <div class="section-title" style="margin-top:0;margin-bottom:14px">Edit name</div>
      <div class="fg">
        <label>Full name</label>
        <input id="p-name" value="${state.user.name}" placeholder="Your full name" />
      </div>
      <div id="p-name-msg" style="font-size:12px;margin-bottom:10px;display:none"></div>
      <button class="btn-primary" style="margin-bottom:0" onclick="updateProfile()">Save name</button>
    </div>

    <div class="log-form">
      <div class="section-title" style="margin-top:0;margin-bottom:14px">Change password</div>
      <div class="fg">
        <label>Current password</label>
        <input id="p-old" type="password" placeholder="Enter current password" />
      </div>
      <div class="fg">
        <label>New password</label>
        <input id="p-new" type="password" placeholder="Min. 8 chars, uppercase, lowercase, number" oninput="checkPwdStrength(this.value,'prof-pwd-fill','prof-pwd-hint')" />
        <div class="pwd-strength"><div class="pwd-strength-fill" id="prof-pwd-fill"></div></div>
        <div class="pwd-hint" id="prof-pwd-hint">Min. 8 chars, uppercase, lowercase, number</div>
      </div>
      <div class="fg">
        <label>Confirm new password</label>
        <input id="p-confirm" type="password" placeholder="Repeat new password" />
      </div>
      <div id="p-pass-msg" style="font-size:12px;margin-bottom:10px;display:none"></div>
      <button class="btn-primary" style="margin-bottom:0" onclick="changePassword()">Update password</button>
    </div>`;
}

// Reads the name input on the profile page and saves the updated name.
function updateProfile() {
  const name = document.getElementById("p-name").value.trim();
  const msg = document.getElementById("p-name-msg");
  if (!name) {
    msg.style.display = "block";
    msg.style.color = "var(--danger)";
    msg.textContent = "Name cannot be empty.";
    return;
  }
  state.user.name = name;
  if (state.user.isFirebase && typeof firebase !== "undefined") {
    firebase.firestore().collection("users").doc(state.user.uid).update({ name });
  } else {
    setStorage("user_" + state.user.email, state.user);
  }
  msg.style.display = "block";
  msg.style.color = "var(--accent)";
  msg.textContent = "Name updated successfully!";
}

// Validates and saves a new password for the current user.
// Google users signed in via OAuth don't have a local password — show a message instead.
function changePassword() {
  const msg = document.getElementById("p-pass-msg");
  const showErr = (text) => { msg.style.display = "block"; msg.style.color = "var(--danger)"; msg.textContent = text; };

  if (state.user.isFirebase) {
    showErr("Password is managed by Google. Change it from your Google account settings.");
    return;
  }

  const oldPass = document.getElementById("p-old").value;
  const newPass = document.getElementById("p-new").value;
  const confirm = document.getElementById("p-confirm").value;

  if (oldPass !== state.user.password) { showErr("Current password is incorrect."); return; }
  const pwdErr = validatePassword(newPass);
  if (pwdErr) { showErr(pwdErr); return; }
  if (newPass !== confirm) { showErr("Passwords do not match."); return; }

  state.user.password = newPass;
  setStorage("user_" + state.user.email, state.user);
  msg.style.display = "block";
  msg.style.color = "var(--accent)";
  msg.textContent = "Password updated successfully!";
  document.getElementById("p-old").value = "";
  document.getElementById("p-new").value = "";
  document.getElementById("p-confirm").value = "";
}


// ============================================================
// MAIN RENDER
// The single function that redraws the entire app.
// Called after every state change.
// ============================================================

// Changes the active tab and re-renders.
function setTab(t) { state.tab = t; render(); }

// Renders the full app shell (topbar, nav, page content).
// If no user is logged in, renders the auth screen instead.
function render() {
  if (!state.user) {
    document.getElementById("app").innerHTML = renderAuth("login");
    return;
  }

  // Navigation tab definitions
  const tabs = [
    {id:"dashboard", icon:"🏠", label:"Home"},
    {id:"log",       icon:"➕", label:"Log"},
    {id:"wantsneeds",icon:"⚖️", label:"W vs N"},
    {id:"goals",     icon:"🎯", label:"Goals"},
    {id:"reports",   icon:"📊", label:"Reports"},
    {id:"ai",        icon:"🤖", label:"Coach"},
  ];

  // Map each tab id to its render function
  // "profile" is not in the nav tabs — it's accessed by clicking the avatar
  const pages = {
    dashboard: renderDashboard,
    log: renderLog,
    wantsneeds: renderWN,
    goals: renderGoals,
    reports: renderReports,
    ai: renderAI,
    profile: renderProfile
  };

  document.getElementById("app").innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="topbar-logo">Pocket<span>Wise</span></div>
        <div class="topbar-user">
          <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">${state.theme === "light" ? "🌙" : "☀️"}</button>
          <button class="avatar" onclick="goToProfile()" title="View profile" style="cursor:pointer;border:none">${state.user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}</button>
          <button class="logout" onclick="logout()">Log out</button>
        </div>
      </div>
      <div class="nav">
        ${tabs.map(t => `<button class="nav-btn ${state.tab === t.id ? "active" : ""}" onclick="setTab('${t.id}')"><span class="ic">${t.icon}</span>${t.label}</button>`).join("")}
      </div>
      <div class="page">${(pages[state.tab] || pages.dashboard)()}</div>
    </div>`;

  // Scroll the AI chat to the bottom whenever that tab is active
  if (state.tab === "ai") scrollAI();
}

// Kick off the app.
// If Firebase is available (i.e. the app is served via Firebase Hosting),
// wait for the auth state to resolve before rendering — this handles
// users who are already signed in from a previous session.
// Otherwise fall straight to render() (e.g. during local development).
if (typeof firebase !== "undefined") {
  firebase.auth().onAuthStateChanged(firebaseUser => {
    if (firebaseUser && !state.user) {
      // Google OAuth user — build a user object from their Google profile
      loadUser({
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email,
        email: firebaseUser.email,
        isFirebase: true,
        transactions: [],
        goals: []
      });
    } else if (!firebaseUser && !state.user) {
      render(); // no one signed in, show the auth screen
    }
  });
} else {
  render();
}
