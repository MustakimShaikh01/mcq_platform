// app.js
// Robust frontend for MCQ app — auto-detect backend (local or remote), try multiple endpoints,
// show clear errors, and keep admin-only scores panel protected by adminKey in URL.

// -------- Configuration --------
// Primary known remote backend (your Render / hosted backend)
const REMOTE_BACKEND = "https://mcq-platform.onrender.com";

// Candidate ports / hosts to try (in order)
const CANDIDATE_BASES = (() => {
  const bases = [];
  // 1) explicit remote host (likely production)
  bases.push(REMOTE_BACKEND.replace(/\/$/, ""));
  // 2) page origin (useful when UI & backend are same origin)
  try {
    if (window && window.location && window.location.origin) {
      bases.push(window.location.origin.replace(/\/$/, ""));
    }
  } catch (e) {}
  // 3) common local dev addresses/ports (change port if your backend runs on another port)
  bases.push("http://localhost:3001");
  bases.push("http://127.0.0.1:3001");
  // dedupe
  return Array.from(new Set(bases));
})();

// read adminKey from URL params (e.g. ?adminKey=MY_SECRET)
const urlParams = new URLSearchParams(window.location.search);
const ADMIN_KEY = urlParams.get("adminKey") || null;

// -------- Helpers & state --------
let _cachedWorking = {
  questionsBase: null, // base URL that worked for /questions
  scoresBase: null     // base URL that worked for /scores
};

// safe DOM helper
function el(sel) { return document.querySelector(sel); }
function create(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Generic request that returns { ok, status, contentType, text, json? }
async function rawFetch(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    let json;
    if (ct.includes("application/json")) {
      try { json = JSON.parse(text); } catch (e) { json = null; }
    }
    return { ok: res.ok, status: res.status, statusText: res.statusText, contentType: ct, text, json, url };
  } catch (err) {
    return { ok: false, networkError: true, error: err, url };
  }
}

// Try a single candidate URL and parse JSON if success
async function tryCandidate(fullUrl, opts = {}) {
  const r = await rawFetch(fullUrl, opts);
  if (r.ok) {
    // prefer parsed json if available
    if (r.json !== null) return { success: true, body: r.json, url: r.url };
    // if content-type isn't json but status ok, return text
    return { success: true, body: r.text, url: r.url };
  }
  // return failure with body (useful for debugging html 404)
  return { success: false, body: r.text || (r.error && String(r.error)), status: r.status, statusText: r.statusText, url: r.url, networkError: !!r.networkError };
}

// Try a list of candidate base URLs for a given path (e.g. "/questions" or "/scores" or "/api/scores")
// Returns first successful { baseUrl, fullUrl, body } or throws with debug info
async function findWorkingBase(path, keyQueryParam = null) {
  // If cached, try that base first
  const cacheKey = path.startsWith("/questions") ? "questionsBase" : "scoresBase";
  if (_cachedWorking[cacheKey]) {
    const base = _cachedWorking[cacheKey];
    const tryUrl = keyQueryParam ? `${base}${path}?key=${encodeURIComponent(keyQueryParam)}` : `${base}${path}`;
    const r = await tryCandidate(tryUrl, { method: "GET" });
    if (r.success) return { base, fullUrl: tryUrl, body: r.body };
    // cached base failed — drop cache and continue probing others
    _cachedWorking[cacheKey] = null;
  }

  const tried = [];
  // generate candidates (base + path) and also base + "/api" + path (common serverless prefix)
  for (const base of CANDIDATE_BASES) {
    const b = base.replace(/\/$/, "");
    const candidates = [ `${b}${path}`, `${b}/api${path}` ];
    for (const full of candidates) {
      const url = keyQueryParam && full.indexOf("?") === -1 ? `${full}?key=${encodeURIComponent(keyQueryParam)}` : full;
      tried.push(url);
      const r = await tryCandidate(url, { method: "GET" });
      if (r.success) {
        // cache base (without /api if used — store the actual base where path worked)
        const workingBase = full.startsWith(`${b}/api`) ? `${b}${full.startsWith(`${b}/api`) ? "/api" : ""}`.replace(/\/$/, "") : b;
        _cachedWorking[cacheKey] = b; // store the bare base (we'll use path concat later)
        return { base: b, fullUrl: url, body: r.body };
      } else {
        // log failure to console for debugging (includes HTML 404 body)
        console.warn(`[probe] ${r.url} => ${r.status || "network error"} ${r.statusText || ""}\nResponse (first 800 chars):\n`, String(r.body || "").slice(0, 800));
      }
    }
  }

  const err = new Error(`No working backend found for path ${path}. Tried:\n${tried.join("\n")}`);
  err.tried = tried;
  throw err;
}

// -------- API wrappers using findWorkingBase --------
async function fetchQuestions() {
  const path = "/questions";
  try {
    // if we already found questionsBase, use it directly (cachedWorking stores base)
    if (_cachedWorking.questionsBase) {
      const url = `${_cachedWorking.questionsBase}${path}`;
      const r = await tryCandidate(url, { method: "GET" });
      if (r.success) return r.body;
      // else fall through to discovery
      _cachedWorking.questionsBase = null;
    }
    const found = await findWorkingBase(path);
    return found.body;
  } catch (err) {
    console.error("fetchQuestions error:", err);
    throw err;
  }
}

async function fetchScores(key) {
  const path = "/scores";
  try {
    // if cached base exists try quickly
    if (_cachedWorking.scoresBase) {
      let url = `${_cachedWorking.scoresBase}${path}`;
      if (key) url += `?key=${encodeURIComponent(key)}`;
      const r = await tryCandidate(url, { method: "GET" });
      if (r.success) return r.body;
      _cachedWorking.scoresBase = null;
    }
    const found = await findWorkingBase(path, key);
    return found.body;
  } catch (err) {
    console.error("fetchScores error:", err);
    throw err;
  }
}

// submit answers (we'll try to use the discovered questionsBase or fallback candidate list)
async function submitAnswers(payload) {
  const path = "/submit";
  // try cached base first (use questionsBase as likely same host)
  const basesToTry = [];
  if (_cachedWorking.questionsBase) basesToTry.push(_cachedWorking.questionsBase);
  // then all candidate bases
  basesToTry.push(...CANDIDATE_BASES);

  for (const base of Array.from(new Set(basesToTry))) {
    const url = `${base.replace(/\/$/, "")}${path}`;
    try {
      const res = await rawFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        // parse JSON if available
        if (res.json !== null) return res.json;
        // if no JSON type, try parsing text
        try { return JSON.parse(res.text); } catch (e) { return res.text; }
      } else {
        console.warn(`[submit] ${url} -> ${res.status} ${res.statusText}\n${String(res.text).slice(0,600)}`);
      }
    } catch (e) {
      console.warn(`[submit] network error calling ${url}:`, e.message);
    }
  }

  throw new Error("Failed to submit answers to any candidate backend. Check console for attempted URLs.");
}

// -------- UI logic (quiz + scores) --------
async function start() {
  const nameInput = el("#name");
  const emailInput = el("#email");
  if (!nameInput || !emailInput) return alert("UI missing #name or #email");

  const name = nameInput.value;
  const email = emailInput.value;

  el("#userForm") && el("#userForm").classList.add("hidden");
  el("#quiz") && el("#quiz").classList.remove("hidden");
  if (el("#quiz")) el("#quiz").innerHTML = "<p>Loading questions...</p>";

  try {
    const questions = await fetchQuestions();
    if (!Array.isArray(questions)) throw new Error("Questions response invalid");
    window.__questions__ = questions;
    renderQuiz(questions, { name, email });
  } catch (err) {
    console.error("start() failed:", err);
    if (el("#quiz")) el("#quiz").classList.add("hidden");
    el("#userForm") && el("#userForm").classList.remove("hidden");
    // show helpful message in UI about what was tried
    const msg = err.tried ? `Tried: \n${err.tried.join("\n")}` : (err.message || String(err));
    alert("Failed to load questions. Check console for details.\n\n" + msg);
  }
}

function renderQuiz(questions, user) {
  const quiz = el("#quiz");
  if (!quiz) return alert("Quiz container not found");
  quiz.innerHTML = "";

  questions.forEach((q, idx) => {
    const qDiv = create("div", "question");
    const title = create("div");
    title.innerHTML = `<strong>${idx + 1}. ${escapeHtml(q.question)}</strong>`;
    qDiv.appendChild(title);

    (q.options || []).forEach((opt, i) => {
      const btn = create("button", "option");
      btn.textContent = opt;
      btn.dataset.index = i;
      btn.onclick = () => {
        if (q._locked) return;
        q._locked = true;
        q._selected = i;
        const all = Array.from(qDiv.querySelectorAll(".option"));
        all.forEach(x => { x.disabled = true; x.classList.add("opt-disabled"); });
        const correctIndex = Number(q.correctIndex);
        const correctBtn = qDiv.querySelector(`.option[data-index="${correctIndex}"]`);
        if (i === correctIndex) btn.classList.add("opt-correct");
        else { btn.classList.add("opt-wrong"); if (correctBtn) correctBtn.classList.add("opt-correct"); }
      };
      qDiv.appendChild(btn);
    });

    quiz.appendChild(qDiv);
  });

  const submitBtn = create("button");
  submitBtn.textContent = "Submit Test";
  submitBtn.id = "submitTestBtn";

  submitBtn.onclick = async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const answers = window.__questions__.map(q => ({ id: q.id, choiceIndex: q._selected ?? null }));
      const payload = { name: user.name, email: user.email, answers };
      const resp = await submitAnswers(payload);
      showResults(resp);
    } catch (err) {
      console.error("Submit failed:", err);
      alert("Failed to submit. See console for details.\n\n" + (err.message || String(err)));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Test";
    }
  };

  quiz.appendChild(submitBtn);
}

function showResults(data) {
  el("#quiz") && el("#quiz").classList.add("hidden");
  const res = el("#result");
  if (!res) return alert("Results container missing");
  res.classList.remove("hidden");
  res.innerHTML = `<h2>Your Score: ${data.score}/${data.total}</h2>`;

  (data.details || []).forEach(d => {
    const q = (window.__questions__ || []).find(x => x.id === d.id);
    const div = create("div", d.isCorrect ? "result-correct" : "result-wrong");
    div.innerHTML = `
      <p><strong>${q ? escapeHtml(q.question) : "Question not found"}</strong></p>
      <p>Your Answer: ${
        d.chosen !== null && q && q.options ? escapeHtml(q.options[d.chosen]) : "Not Attempted"
      } ${d.isCorrect ? "✔" : "❌"}</p>
      ${!d.isCorrect && q && q.options ? `<p>Correct Answer: ${escapeHtml(q.options[d.correct])} ✔</p>` : ""}
    `;
    res.appendChild(div);
  });
}

// Scores UI
function renderScoresTable(scores) {
  const container = el("#scoresContainer");
  if (!container) return console.warn("scoresContainer missing");
  container.innerHTML = "";

  const items = Array.isArray(scores) ? scores : (scores && scores.items) || [];

  if (!items || items.length === 0) { container.innerHTML = "<p>No submissions yet.</p>"; return; }

  const table = create("table");
  table.innerHTML = `
    <thead>
      <tr><th>#</th><th>Name</th><th>Email</th><th>Score</th><th>Total</th><th>Submitted At</th></tr>
    </thead>
  `;
  const tbody = create("tbody");
  items.forEach((s, idx) => {
    const tr = create("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(s.name || "")}</td>
      <td>${escapeHtml(s.email || "")}</td>
      <td>${s.score}</td>
      <td>${s.total}</td>
      <td class="small">${new Date(s.submittedAt).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

async function openScoresPanel() {
  const scoresPanel = el("#scores");
  if (!scoresPanel) return alert("No scores panel in DOM");
  scoresPanel.classList.remove("hidden");
  const container = el("#scoresContainer");
  if (container) container.innerHTML = "<p>Loading...</p>";

  try {
    const scores = await fetchScores(ADMIN_KEY);
    renderScoresTable(scores);
  } catch (err) {
    console.error("openScoresPanel error:", err);
    const msg = err && err.message ? err.message : "Unknown error";
    if (container) container.innerHTML = `<pre style="color:red; white-space:pre-wrap">${escapeHtml(msg)}</pre>`;
    else alert("Error loading scores: " + msg);
  }
}

function closeScoresPanel() { const s = el("#scores"); if (s) s.classList.add("hidden"); }

// CSV export
function downloadCSV(scores) {
  const items = Array.isArray(scores) ? scores : (scores && scores.items) || [];
  if (!items.length) return alert("No data to export");
  const headers = ["Name","Email","Score","Total","SubmittedAt"];
  const rows = items.map(s => [ (s.name||""), (s.email||""), s.score, s.total, s.submittedAt ]);
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `scores_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// Hook up DOM
const startBtn = el("#startBtn");
if (startBtn) startBtn.addEventListener("click", start);

(function initAdminControls() {
  if (!ADMIN_KEY) return;
  const userControls = el("#userControls");
  if (!userControls) {
    console.warn("userControls not found");
    return;
  }
  const viewBtn = create("button"); viewBtn.id = "viewScoresBtn"; viewBtn.type = "button"; viewBtn.textContent = "View Scores (admin)";
  userControls.appendChild(viewBtn);
  viewBtn.addEventListener("click", openScoresPanel);

  const refreshBtn = el("#refreshScores"); if (refreshBtn) refreshBtn.addEventListener("click", openScoresPanel);
  const closeBtn = el("#closeScores"); if (closeBtn) closeBtn.addEventListener("click", closeScoresPanel);
  const exportBtn = el("#exportCsv"); if (exportBtn) exportBtn.addEventListener("click", async () => {
    try { const s = await fetchScores(ADMIN_KEY); downloadCSV(s); } catch (e) { alert("Export failed: " + (e.message || e)); }
  });
})();

// Expose some helpers for debugging in console
window.__mcq_debug = {
  CANDIDATE_BASES,
  _cachedWorking,
  findWorkingBase,
  fetchQuestions,
  fetchScores,
  submitAnswers
};
