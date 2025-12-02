// =========================
// CONFIG — SET YOUR BACKEND URL
// =========================
// Local development:
// const API_BASE = "http://localhost:3001";

// LIVE backend on Render:
const API_BASE = "https://mcq-platform.onrender.com";

// =========================
// HELPERS
// =========================
async function fetchQuestions() {
  const res = await fetch(API_BASE + "/questions");
  return res.json();
}

function el(q) {
  return document.querySelector(q);
}

function create(tag, cls) {
  const t = document.createElement(tag);
  if (cls) t.className = cls;
  return t;
}

// =========================
// START TEST
// =========================
async function start() {
  const name = el("#name").value.trim();
  const email = el("#email").value.trim();

  el("#userForm").classList.add("hidden");
  el("#quiz").classList.remove("hidden");

  const questions = await fetchQuestions();

  // store globally for result comparison
  window.__questions__ = questions;

  renderQuiz(questions, { name, email });
}

// =========================
// RENDER QUIZ UI
// =========================
function renderQuiz(questions, user) {
  const quiz = el("#quiz");
  quiz.innerHTML = "";

  const form = create("div");

  questions.forEach((q, idx) => {
    const qDiv = create("div", "question");

    const h = create("div");
    h.textContent = (idx + 1) + ". " + q.question;
    qDiv.appendChild(h);

    q.options.forEach((opt, i) => {
      const btn = create("button", "option");
      btn.textContent = opt;

      btn.onclick = () => {
        const siblings = qDiv.querySelectorAll(".option");
        siblings.forEach(s => s.classList.remove("selected"));
        btn.classList.add("selected");
        q._selected = i; // store answer
      };

      qDiv.appendChild(btn);
    });

    form.appendChild(qDiv);
  });

  // Submit button
  const submitBtn = create("button");
  submitBtn.textContent = "Submit Test";

  submitBtn.onclick = async () => {
    const answers = questions.map(q => ({
      id: q.id,
      choiceIndex: typeof q._selected === "number" ? q._selected : null
    }));

    const payload = { name: user.name, email: user.email, answers };

    const r = await fetch(API_BASE + "/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    // Add full question data for detailed results
    data.details.forEach(d => {
      const q = window.__questions__.find(x => x.id === d.id);
      d.question = q.question;
      d.options = q.options;
    });

    showResult(data);
  };

  form.appendChild(submitBtn);
  quiz.appendChild(form);
}

// =========================
// SHOW DETAILED RESULTS
// =========================
function showResult(data) {
  el("#quiz").classList.add("hidden");

  const res = el("#result");
  res.classList.remove("hidden");

  res.innerHTML = `<h2>Score: ${data.score} / ${data.total}</h2>`;

  const detailsBox = document.createElement("div");

  // Display each question with right/wrong indication
  data.details.forEach((d) => {
    const div = document.createElement("div");
    div.className = d.isCorrect ? "correct" : "wrong";

    div.innerHTML = `
      <p><strong>Q: ${d.question}</strong></p>
      <p>Your Answer: ${
        d.chosen === null ? "Not Attempted" : d.options[d.chosen]
      } ${d.isCorrect ? "✔" : "❌"}</p>
      ${
        !d.isCorrect
          ? `<p>Correct Answer: ${d.options[d.correct]} ✔</p>`
          : ""
      }
    `;

    detailsBox.appendChild(div);
  });

  res.appendChild(detailsBox);

  // Share box
  const share = el("#share");
  share.classList.remove("hidden");
  share.innerHTML = `<p>Share your result or retake the test anytime.</p>`;
}

// =========================
// EVENT LISTENER START
// =========================
document.getElementById("startBtn").addEventListener("click", start);
