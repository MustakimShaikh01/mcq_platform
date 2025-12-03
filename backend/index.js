// server.js
require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

// CORS - allow from your frontend origin or '*' during dev
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.options("*", cors());

app.use(bodyParser.json());

// Files
const QUESTIONS_FILE = path.join(__dirname, process.env.QUESTIONS_FILE_PATH || "questions.json");
const SCORES_FILE = path.join(__dirname, process.env.SCORES_FILE_PATH || "scores.json");

// Secret key for accessing scores
// Add in your .env: SCORES_KEY=some-strong-secret
const SCORES_KEY = process.env.SCORES_KEY || ""; // if empty, scores endpoint will be disabled

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

// GET questions (no protection)
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

/**
 * GET /scores
 * Protected using a query param `key` which must match process.env.SCORES_KEY
 * Example: GET /scores?key=MY_SECRET
 */
app.get("/scores", (req, res) => {
  const providedKey = req.query.key || "";
  if (!SCORES_KEY) {
    return res.status(403).json({ error: "Scores endpoint is disabled on this server (SCORES_KEY not set)." });
  }
  if (!providedKey || providedKey !== SCORES_KEY) {
    return res.status(403).json({ error: "Forbidden - invalid or missing key" });
  }

  const scores = readJSON(SCORES_FILE);
  if (!scores) return res.status(500).json({ error: "Scores file missing" });

  // Optionally, support simple pagination via ?limit=50&offset=0
  const limit = parseInt(req.query.limit || "0", 10) || 0;
  const offset = parseInt(req.query.offset || "0", 10) || 0;

  // sort newest first
  const sorted = scores.slice().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  if (limit > 0) {
    return res.json({
      total: sorted.length,
      items: sorted.slice(offset, offset + limit)
    });
  }

  res.json(sorted);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
