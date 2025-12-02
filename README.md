
MCQ Test Platform - Minimal End-to-End

Structure:
- backend/     -> Node.js + Express API. Endpoints:
    GET /questions        -> returns questions (no answers exposed)
    POST /submit          -> submit answers; returns score and records into scores.json
    GET /scores           -> get stored score records

- frontend/    -> Static site (index.html + app.js). Deploy on Vercel or any static host.

How to run locally:

1) Backend:
   cd backend
   npm install
   npm start
   (listens on port 3001)

2) Frontend:
   Serve frontend folder statically (open frontend/index.html in browser)
   Or use any static server: e.g. `npx serve frontend` or deploy to Vercel.

Deployment suggestions:
- Backend: Render.com (Create a new Web Service, connect repo, set start command `node index.js`, port is 3001 or use PORT env)
- Frontend: Vercel (Import project, set public folder to `frontend`), or any static host (Netlify, GitHub Pages).

Notes:
- Scores are stored in backend/scores.json as an array of records (normal JSON file).
- This is intentionally minimal for learning / lightweight use. For production, use authentication, database (Postgres/Mongo), validation, and rate-limiting.

Files included: backend (index.js, package.json, questions.json, scores.json), frontend (index.html, app.js, style.css)

