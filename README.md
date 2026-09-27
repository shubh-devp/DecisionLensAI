# DecisionLens AI

An AI-powered business decision engine that turns business **CSV** data into
**evidence-backed insights and recommendations**.

> **Calculate with code. Explain with AI. Verify with evidence.**

Pandas computes every number. The AI only *interprets* numbers that were already
calculated, and every AI statement must cite the evidence it came from.

**Links:** [GitHub](https://github.com/shubh-devp/DecisionLensAI) · **Live demo:** `<add your Render URL>`

---

## Key features

| Feature | Where |
| --- | --- |
| CSV upload + validation — rows, columns, dtypes, missing values | `POST /api/upload` |
| Business metrics — revenue, cost, profit, margin, per-column stats | `POST /api/analyze` |
| Trend analysis and structured evidence objects | `POST /api/evidence` |
| Deterministic anomaly detection — no AI, no API key needed | `POST /api/anomalies` |
| Grounded AI insights, each citing evidence IDs | `POST /api/insights` |
| Evidence-grounded recommendations | `POST /api/recommendations` |
| Ask Your Data — natural-language questions answered from evidence only | `POST /api/ask` |
| Business context (industry, objective) that shapes wording, never numbers | `GET`/`POST /api/context` |
| Executive summary, metric cards and dependency-free SVG trend charts | frontend |

Three bundled datasets in `demo_data/` cover the full flow, a missing-cost case
and a dataset with no usable date column.

## Tech stack

- **Backend** — Python, Flask, Pandas, Flask-Cors; served by **gunicorn** in production
- **Frontend** — React 19, Vite, Tailwind CSS v4; charts are hand-rolled SVG, no charting library
- **AI** — any OpenAI-compatible chat completions endpoint (OpenAI, Groq, …)

## How it works

```
Browser (React) ──multipart/form-data──▶ Flask API
                                            │
                                  build_evidence_bundle(df)   ← single source of truth
                                            │
      ┌──────────────┬─────────────┬────────┴────────┬──────────────────┐
      ▼              ▼             ▼                 ▼                  ▼
/api/evidence  /api/anomalies  /api/insights  /api/recommendations  /api/ask
               (arithmetic)    └─── AI narrates the verified bundle only ───┘
```

Every AI endpoint builds its payload from that one evidence bundle, which holds
only already-computed metrics, trends and evidence objects. **Raw CSV rows and
the raw per-period series are never sent to the model.**

Model output is treated as untrusted input: each item must cite an evidence ID
that exists in the bundle. Anything referencing unknown evidence is dropped
before it reaches the screen, so a fabricated citation cannot be displayed.

## Local setup

**Prerequisites:** Python 3.10+, Node.js 18+

**Backend**

```bash
cd backend
python -m venv venv
# Windows: .\venv\Scripts\Activate.ps1   |   macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
python app.py            # http://127.0.0.1:5000
```

**Frontend** — in a second terminal:

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

Open http://localhost:5173. The **System status** panel confirms the backend is
reachable. Production build: `npm run build`.

### Configuration

Only the AI steps need configuration. **Metrics, trends and anomalies work with
no key at all.** Set these before starting the backend:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_API_KEY` | *(none)* | Provider key. Without it the AI endpoints return `503`. |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `CORS_ALLOWED_ORIGINS` | local Vite origins | Comma-separated browser origin allowlist |

```powershell
$env:LLM_API_KEY = "sk-..."
```

Groq works too: set `LLM_BASE_URL=https://api.groq.com/openai/v1` and
`LLM_MODEL=llama-3.3-70b-versatile`.

On the frontend, `VITE_API_BASE_URL` sets the backend URL for a production build
(unset, it falls back to `http://127.0.0.1:5000`). See the `.env.example` files
for details. `LLM_API_KEY` belongs to the backend only — it is never sent to the
browser.

## Links

- **GitHub:** https://github.com/shubh-devp/DecisionLensAI
- **Live demo:** `<add your Render URL>`

Deployed as two Render services: a Python web service (`gunicorn wsgi:app`) and a
static site built from `frontend/`.
