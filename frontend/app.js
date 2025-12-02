
const API_BASE = (window.API_BASE) ? window.API_BASE : "http://localhost:3001";

async function fetchQuestions() {
  const res = await fetch(API_BASE + "/questions");
  return res.json();
}

function el(q) { return document.querySelector(q); }
function create(tag, cls) { const t = document.createElement(tag); if (cls) t.className = cls; return t; }

async function start() {
  const name = el("#name").value.trim();
  const email = el("#email").value.trim();
  el("#userForm").classList.add("hidden");
  el("#quiz").classList.remove("hidden");
  const questions = await fetchQuestions();
  renderQuiz(questions, {name, email});
}

function renderQuiz(questions, user) {
  const quiz = el("#quiz");
  quiz.innerHTML = "";
  const form = create("div");
  questions.forEach((q, idx) => {
    const qDiv = create("div", "question");
    const h = create("div"); h.textContent = (idx+1)+". "+q.question;
    qDiv.appendChild(h);
    q.options.forEach((opt, i) => {
      const btn = create("button", "option");
      btn.textContent = opt;
      btn.onclick = () => {
        // toggle selection
        const siblings = qDiv.querySelectorAll(".option");
        siblings.forEach(s => s.classList.remove("selected"));
        btn.classList.add("selected");
        // store answer
        q._selected = i;
      };
      qDiv.appendChild(btn);
    });
    form.appendChild(qDiv);
  });
  const submitBtn = create("button"); submitBtn.textContent = "Submit";
  submitBtn.onclick = async () => {
    const answers = questions.map(q => ({id:q.id, choiceIndex: typeof q._selected === "number" ? q._selected : null}));
    const payload = { name: user.name, email: user.email, answers };
    const r = await fetch(API_BASE + "/submit", {
      method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)
    });
    const data = await r.json();
    showResult(data);
  };
  form.appendChild(submitBtn);
  quiz.appendChild(form);
}

function showResult(data) {
  el("#quiz").classList.add("hidden");
  const res = el("#result");
  res.classList.remove("hidden");
  res.innerHTML = `<h2>Score: ${data.score} / ${data.total}</h2><p>Record ID: ${data.recordId}</p>`;
  const share = el("#share");
  share.classList.remove("hidden");
  share.innerHTML = `<p>Share the test link with others. Frontend is static; point it to backend API (set window.API_BASE) if hosted elsewhere.</p>`;
}

document.getElementById("startBtn").addEventListener("click", start);
