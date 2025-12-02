require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.options("*", cors());

app.use(bodyParser.json());

// Load files
const QUESTIONS_FILE = path.join(__dirname, process.env.QUESTIONS_FILE_PATH || "questions.json");
const SCORES_FILE = path.join(__dirname, process.env.SCORES_FILE_PATH || "scores.json");

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(SCORES_FILE)) writeJSON(SCORES_FILE, []);

// GET questions (now includes correctIndex for instant validation)
app.get("/questions", (req, res) => {
  const q = readJSON(QUESTIONS_FILE);
  if (!q) return res.status(500).json({ error: "Questions file missing" });
  res.json(q);
});

// Submit answers
app.post("/submit", (req, res) => {
  const { name, email, answers } = req.body;

  const questions = readJSON(QUESTIONS_FILE);
  if (!questions) return res.status(500).json({ error: "Questions missing" });

  let score = 0;
  const details = [];

  questions.forEach((q) => {
    const ans = answers.find(a => a.id === q.id);
    const chosen = ans ? ans.choiceIndex : null;
    const isCorrect = chosen === q.correctIndex;
    if (isCorrect) score++;

    details.push({
      id: q.id,
      chosen,
      correct: q.correctIndex,
      isCorrect
    });
  });

  const record = {
    id: Date.now(),
    name: name || "anonymous",
    email: email || "",
    score,
    total: questions.length,
    details,
    submittedAt: new Date().toISOString()
  };

  const scores = readJSON(SCORES_FILE) || [];
  scores.push(record);
  writeJSON(SCORES_FILE, scores);

  res.json(record);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
