const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const DATA_DIR = __dirname;
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const SCORES_FILE = path.join(DATA_DIR, "scores.json");

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "null");
  } catch (e) {
    return null;
  }
}
function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

// Ensure scores file exists
if (!fs.existsSync(SCORES_FILE)) {
  writeJSON(SCORES_FILE, []);
}

// GET questions
app.get("/questions", (req, res) => {
  const q = readJSON(QUESTIONS_FILE);
  if (!q) return res.status(500).json({error: "Questions file not found"});
  // remove correctIndex from payload for clients (optional)
  const safe = q.map(({id,question,options}) => ({id,question,options}));
  res.json(safe);
});

// POST submit answers
app.post("/submit", (req, res) => {
  const { name, email, answers } = req.body;
  if (!Array.isArray(answers)) return res.status(400).json({error:"answers array required"});
  const questions = readJSON(QUESTIONS_FILE);
  if (!questions) return res.status(500).json({error:"questions not found"});
  const total = questions.length;
  let score = 0;
  const details = [];

  for (const q of questions) {
    const ans = answers.find(a => a.id === q.id);
    const chosen = ans ? ans.choiceIndex : null;
    const correct = q.correctIndex;
    const isCorrect = chosen === correct;
    if (isCorrect) score++;
    details.push({id:q.id, chosen, correct, isCorrect});
  }

  const record = {
    id: Date.now(),
    name: name || "anonymous",
    email: email || null,
    score,
    total,
    details,
    submittedAt: new Date().toISOString()
  };

  // append to scores file
  const scores = readJSON(SCORES_FILE) || [];
  scores.push(record);
  writeJSON(SCORES_FILE, scores);

  res.json({score, total, recordId: record.id});
});

// GET scores (admin use)
app.get("/scores", (req, res) => {
  const scores = readJSON(SCORES_FILE) || [];
  res.json(scores);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("MCQ backend running on port", PORT));