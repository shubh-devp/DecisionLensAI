# DecisionLens AI

An AI-powered business decision engine that turns business **CSV** data into
**evidence-backed insights**.

> **Calculate with code. Explain with AI. Verify with evidence.**

Pandas computes every number. The AI only *interprets* numbers that were already
computed, and every AI statement must cite the evidence it came from.

---

## What works today (Milestones 1–10)

| # | Milestone | What it does |
| --- | --- | --- |
| 1 | Project skeleton | Flask + React + Tailwind, `/api/health`, CORS |
| 2 | CSV upload + validation | `POST /api/upload` — structure report (rows, columns, dtypes, missing values) |
| 3 | Business metrics | `POST /api/analyze` — revenue, cost, profit, profit margin, per-column min/max/mean |
| 4 | Trends + evidence | `POST /api/evidence` — date detection, revenue/cost/profit trends, structured evidence |
| 5 | Grounded AI insights | `POST /api/insights` — LLM narrates the verified evidence only |
| 6 | Grounded recommendations | `POST /api/recommendations` — actions derived from evidence + validated insights |
| 7 | Ask Your Data | `POST /api/ask` — natural-language questions answered from evidence only |
| 8 | Visual analytics | Dependency-free SVG trend charts + loading/empty/error states (frontend only) |
| 9 | Anomaly detection | `POST /api/anomalies` — deterministic threshold check on consecutive periods (no AI) |
| 10 | Executive Summary | A business-level view between Step 1 and Step 2, assembled from existing results (frontend only) |

---

## 1. Architecture and data flow

Two separate applications that talk over HTTP:

```
Browser (React + Tailwind, port 5173)
   │
   │  multipart/form-data  (the CSV file, re-sent on each step)
   ▼
Flask API (port 5000)
   │
   ├── load_csv_from_request()          validate + parse CSV in memory
   │
   ├── /api/upload      → structure summary
   ├── /api/analyze     → metrics
   │
   ├── build_evidence_bundle(df)   ← THE SINGLE SOURCE OF TRUTH
   │        │
   │        ├── detect_business_columns()   find revenue / cost columns
   │        ├── compute_totals()            sums, profit, margin
   │        ├── find_date_column()          find a usable date column
   │        ├── summarise_trend()           first vs last period, % change
   │        └── build_evidence()            {id, metric, source, values,
   │                                         calculation, result}
   │        │
   │        ├── /api/evidence         → shows the bundle to the user
   │        ├── /api/anomalies        → deterministic period-to-period check
   │        │                              (no LLM, no API key needed)
   │        ├── /api/insights         → build_llm_payload() → LLM
   │        │                              └── parse_llm_json()
   │        │                                  validate_insights()
   │        ├── /api/recommendations  → bundle + validated insights → LLM
   │        │                              └── parse_llm_json()
   │        │                                  validate_recommendations()
   │        └── /api/ask              → bundle + question → LLM
   │                                       └── parse_llm_json()
   │                                           validate_answer()
   ▼
React renders: executive summary (derived from the rest) → metrics → trends
               → charts → anomalies → insights → recommendations → answers
```

**The key rule:** the LLM sits *downstream* of the calculation. No number
produced by the model can flow back into the analytics.

### Frontend flow

```
Step 1  Upload CSV              → /api/upload
        Executive Summary       (assembled from the results below; no request of its own)
Step 2  Analyze Data            → /api/analyze
Step 3  Evidence & Trends       → /api/evidence   (trend cards + 3 SVG charts)
                                   /api/anomalies  (the "Detect Anomalies" button)
Step 4  Generate AI Insights    → /api/insights
Step 5  Generate Recommendations→ /api/recommendations
Step 6  Ask Your Data           → /api/ask
```

### Executive Summary

Between Step 1 and Step 2 the dashboard shows a compact **Executive Summary**. It
is a pure view: it issues **no request of its own** and makes **no AI call** —
every value is read from results the user has already produced. It adds no
endpoint and no dependency.

Five cards, each sourced from an existing response:

| Card | Source |
| --- | --- |
| Revenue | `analysis.metrics.total_revenue` |
| Cost | `analysis.metrics.total_cost` |
| Profit | `analysis.metrics.total_profit` |
| Profit margin | `analysis.metrics.profit_margin_percent` |
| Anomalies | `anomalies.count` |

Missing values render as an em-dash rather than `0` or `NaN`, and an amber note
names the missing column.

**Strongest trend.** Below the cards, the summary names the metric with the largest
`|percent_change|` among the revenue, cost and profit trends returned by
`/api/evidence`. Ties break in the order revenue → profit → cost and the comparison
is a strict `>`, so the choice is deterministic. A trend whose starting period was
zero has no comparable percentage and is skipped.

**Key takeaway.** If the user has already run *Generate AI Insights*, the summary
reuses the **first validated insight** as its one-line takeaway — the model is not
asked again. The label at the right of the panel states which path was taken:

| Label | Meaning |
| --- | --- |
| `from the validated AI insight` | Reused the first insight already returned by `/api/insights` |
| `computed from verified metrics, no AI` | Deterministic fallback sentence built from the metrics |

The fallback restates only Pandas-computed figures — for example *"Profit is 36,800
on revenue of 92,500 (a 39.78% margin)."* — and appends a trend clause only when
one is available.

**States it handles**

| Situation | What the summary shows |
| --- | --- |
| Cost or revenue column missing | Em-dash on the affected cards + an amber note naming the column; the takeaway falls back to whichever metric does exist |
| Evidence not loaded yet (Step 3 not run) | Trend panel: *Run "Evidence & Trends" below to load the verified trend comparison.* |
| Evidence loaded, but no date column or fewer than 2 periods | Trend panel: *No comparable trend is available. This needs a date column and at least two periods.* |
| Anomalies not run yet | Anomalies card shows an em-dash, plus: *The anomaly count appears once you run "Detect Anomalies" in the Evidence & Trends section below.* |
| Anomalies run and none found | Anomalies card shows `0` |
| AI insight unavailable (not generated, or the call failed) | Deterministic takeaway, labelled `computed from verified metrics, no AI` |

The anomaly count deliberately stays an **em-dash** — not `0` — until
*Detect Anomalies* has actually run, because showing `0` would imply the data was
checked and found clean. The same reasoning separates "trend not loaded yet" from
"trend genuinely unavailable" in the trend panel.

### Dashboard and charts

The trend charts are drawn from `trends.<metric>.periods` — the same verified,
already-calculated numbers that `/api/evidence` returns. The charts are
hand-written inline SVG, with **no charting library installed**.

That is deliberate. Recharts was in the original plan, but adding a charting
dependency for three static line charts was not worth the bundle size, so the
charts are **dependency-free SVG with zero added packages** — `frontend/package.json`
still lists only React, React DOM, Vite, the React plugin and Tailwind.

| Chart | Source | Colour |
| --- | --- | --- |
| Revenue over time | `trends.revenue.periods` | cyan |
| Cost over time | `trends.cost.periods` | amber |
| Profit over time | `trends.profit.periods` | emerald |

A chart is rendered **only for a metric that actually has periods**. If revenue
trends exist but cost does not, you get one chart rather than three with two
empty. When no metric has periods, the whole "Trend charts" block is not rendered
at all.

### Responsive SVG implementation

- Each chart is one `<svg viewBox="0 0 320 140">` with `className="w-full"`, so it
  scales to its container with **no JavaScript measurement and no resize listener**.
- Every chart draws 3 horizontal gridlines (`high`, midpoint, `low`) with their
  values via the shared `formatNumber()` helper, plus one `<polyline>` for the
  line and a `<circle>` marking the final period.
- The awkward cases are handled explicitly:
  - **Empty** `periods` array → a "No periods to plot." placeholder.
  - **Single period** → plotted at the horizontal centre as a dot, because a
    one-point polyline would be invisible.
  - **Flat series** (every value equal) → the range is widened artificially so the
    scale never divides by zero.
  - **Negative values** → the dashed zero line is drawn only when 0 falls inside
    the visible range.
- The charts sit in a `lg:grid-cols-3` grid: side by side on desktop, stacked on
  narrow screens.

### Anomalies section

Below the trend charts, the **Anomalies** block has a "Detect Anomalies" button
that calls `POST /api/anomalies`. Each result card shows the metric and date, a
severity badge, the percentage change alongside the `previous → value` figures,
the explanation sentence, and the evidence ID it cites. A caption above the list
spells out the rule currently in force, e.g.:

> Deterministic threshold check, no AI: high ≥ 40%, medium ≥ 20%, low ≥ 10%.

The empty state deliberately distinguishes two very different situations:

| Situation | Panel |
| --- | --- |
| The data **was** checked and is clean | Green: "No anomalies detected: every period-to-period change stayed below the 10% threshold." |
| **Nothing could be checked** (no date column, or fewer than two periods) | Grey: "No anomalies to report: detection needs a usable date column and at least two periods to compare." |

Reporting "all clear" when there was no date column to compare would be actively
misleading, which is why the two cases look different.

### Loading, empty and error states

Every action exposes all three states:

| State | How it appears |
| --- | --- |
| **Loading** | The button label changes (`Uploading...`, `Analyzing...`, `Generating...`, `Asking...`) **and** the section appears immediately with a pulsing inline indicator, e.g. "Calculating trends and evidence...". Steps 2–6 all do this, so the page never looks frozen during a model call. |
| **Empty** | An explicit message instead of a blank area, e.g. "No time-based trend could be calculated for this dataset, so there are no charts to draw." |
| **Error** | A rose-bordered panel carrying the backend's own message, or a "could not reach the backend" note when Flask is not running. |

---

## 2. Project structure

```
DecisionLensAI/            <- project root (this folder)
├── backend/
│   ├── app.py             <- Flask app, all endpoints, analytics + LLM layer
│   ├── requirements.txt   <- Python dependencies
│   └── venv/              <- local virtual environment (not committed)
├── frontend/
│   ├── index.html         <- HTML shell loaded by Vite
│   ├── package.json       <- frontend dependencies and npm scripts
│   ├── vite.config.js     <- Vite + React + Tailwind configuration
│   ├── src/
│   │   ├── main.jsx       <- React entry point (mounts the app)
│   │   ├── App.jsx        <- dashboard: upload, metrics, trends, SVG charts, insights
│   │   └── index.css      <- Tailwind import
│   ├── node_modules/      <- installed packages (not committed)
│   └── dist/              <- production build output (not committed)
├── .gitignore             <- ignores venv, node_modules, dist, .env
└── README.md
```

---

## 3. Prerequisites

- **Python 3.10+**
- **Node.js 18+** (includes `npm`)

---

## 4. Install

### Backend

```bash
cd backend
python -m venv venv
```

Activate the virtual environment:

- **Windows (PowerShell):** `.\venv\Scripts\Activate.ps1`
- **macOS / Linux:** `source venv/bin/activate`

Then:

```bash
pip install -r requirements.txt
```

Installs `Flask`, `Flask-Cors` and `pandas` (which pulls in `numpy`).

### Frontend

```bash
cd frontend
npm install
```

Installs React, React DOM, Vite, the React plugin and Tailwind — nothing else.
No charting library is pulled in.

---

## 5. Environment variables (only needed for Step 4)

`/api/insights` needs an LLM API key. **Everything else works without one.**

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `LLM_API_KEY` | Yes, for `/api/insights` | *(none)* | Secret key for the provider |
| `LLM_MODEL` | No | `gpt-4o-mini` | Model name to call |
| `LLM_BASE_URL` | No | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |

If `LLM_API_KEY` is missing, `/api/insights` returns **HTTP 503** with a clear
message. `/api/health`, `/api/upload`, `/api/analyze` and `/api/evidence` keep
working normally.

### OpenAI (default)

**Windows (PowerShell):**
```powershell
$env:LLM_API_KEY  = "sk-..."
$env:LLM_MODEL    = "gpt-4o-mini"
$env:LLM_BASE_URL = "https://api.openai.com/v1"
```

**macOS / Linux:**
```bash
export LLM_API_KEY="sk-..."
export LLM_MODEL="gpt-4o-mini"
export LLM_BASE_URL="https://api.openai.com/v1"
```

### Groq example

Groq is free-tier friendly and fast, and speaks the same API shape:

```powershell
$env:LLM_API_KEY  = "gsk_..."
$env:LLM_BASE_URL = "https://api.groq.com/openai/v1"
$env:LLM_MODEL    = "llama-3.3-70b-versatile"
```

Set these **before** starting the backend, in the same terminal.

---

## 6. Run

**Terminal 1 — backend** (from `backend/`, with the venv active):

```bash
python app.py
```

Starts on **http://127.0.0.1:5000**.

**Terminal 2 — frontend** (from `frontend/`):

```bash
npm run dev
```

Open **http://localhost:5173**. The **System status** panel shows whether the
backend is reachable.

Production build: `npm run build` · preview it with `npm run preview`.

---

## 7. API endpoints

All seven `POST` endpoints accept **`multipart/form-data`** with the CSV in a
field named **`file`**. Maximum file size is **10 MB**. `/api/ask` also needs a
**`question`** text field in the same body.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Is the backend alive? |
| `POST` | `/api/upload` | Validate the CSV and report its structure |
| `POST` | `/api/analyze` | Business metrics (revenue, cost, profit, margin, stats) |
| `POST` | `/api/evidence` | Trends + structured, auditable evidence |
| `POST` | `/api/insights` | AI narration of the verified evidence |
| `POST` | `/api/recommendations` | Evidence-grounded actions, each citing evidence IDs |
| `POST` | `/api/ask` | Natural-language question answered from evidence only |
| `POST` | `/api/anomalies` | Deterministic detection of unusual period-to-period changes (no AI) |

### `GET /api/health`

```json
{ "status": "success", "message": "DecisionLens AI backend is running",
  "service": "decisionlens-ai-backend" }
```

### `POST /api/upload`

```json
{
  "valid": true,
  "filename": "sales.csv",
  "rows": 4,
  "columns": 3,
  "column_names": ["region", "sales", "cost"],
  "dtypes": { "region": "str", "sales": "int64", "cost": "int64" },
  "missing_values": { "region": 0, "sales": 0, "cost": 0 }
}
```

### `POST /api/analyze`

```json
{
  "valid": true,
  "filename": "sales.csv",
  "row_count": 4,
  "column_count": 3,
  "detected_columns": { "revenue": "sales", "cost": "cost" },
  "metrics": {
    "total_revenue": 3400.0,
    "total_cost": 950.0,
    "total_profit": 2450.0,
    "profit_margin_percent": 72.06
  },
  "numeric_column_stats": {
    "sales": { "min": 900.0, "max": 1500.0, "mean": 1133.33,
               "missing_or_invalid": 1 }
  },
  "warnings": ["1 value(s) in 'sales' were missing or non-numeric and were ignored."]
}
```

### `POST /api/evidence`

```json
{
  "valid": true,
  "filename": "up.csv",
  "row_count": 3,
  "metrics": { "total_revenue": 4500.0, "total_cost": 1500.0,
               "total_profit": 3000.0, "profit_margin_percent": 66.67 },
  "date_column": "order_date",
  "period_count": 3,
  "trends": {
    "revenue": {
      "metric": "revenue", "column": "sales", "direction": "increasing",
      "period_count": 3,
      "first_period": { "date": "2024-01-01", "value": 1000.0 },
      "last_period":  { "date": "2024-03-01", "value": 2000.0 },
      "change": 1000.0, "percent_change": 100.0
    },
    "cost": null,
    "profit": null
  },
  "evidence": [
    {
      "id": "revenue_trend",
      "metric": "Revenue trend",
      "source": "column 'sales' grouped by 'order_date' (3 periods)",
      "values": { "period_count": 3 },
      "calculation": "percent_change = (last_period - first_period) / abs(first_period) * 100",
      "result": 100.0
    }
  ],
  "warnings": []
}
```

### `POST /api/insights`

```json
{
  "valid": true,
  "filename": "up.csv",
  "model": "gpt-4o-mini",
  "insights": [
    {
      "insight": "Revenue rose in every period",
      "explanation": "Revenue increased from 1000 in the first period to 2000 in the last, a 100.0% change.",
      "evidence_ids": ["revenue_trend", "total_revenue"],
      "confidence": "high",
      "limitations": "The data does not explain why revenue increased."
    }
  ],
  "evidence_ids_available": ["total_revenue", "total_cost", "total_profit",
                             "profit_margin", "revenue_trend", "cost_trend",
                             "profit_trend"],
  "warnings": []
}
```

### `POST /api/recommendations`

Turns the verified evidence into concrete actions. Internally this makes **two**
model calls: it first generates and validates insights (same pipeline as
`/api/insights`), then asks for recommendations using the bundle **plus** those
already-validated insights. The insights that were actually used are returned in
`insights_used` so you can audit the chain.

```json
{
  "valid": true,
  "filename": "up.csv",
  "model": "gpt-4o-mini",
  "recommendations": [
    {
      "action": "Review the cost base",
      "rationale": "Cost rose to 600 in the last period, per the cost trend.",
      "evidence_ids": ["cost_trend", "total_cost"],
      "limitations": "The data does not show which cost lines changed."
    }
  ],
  "insights_used": [
    {
      "insight": "Revenue rose over the period",
      "explanation": "Revenue moved from 1000 to 2000, a 100.0% change.",
      "evidence_ids": ["revenue_trend"],
      "confidence": "high",
      "limitations": "The data does not explain why."
    }
  ],
  "evidence_ids_available": ["total_revenue", "total_cost", "total_profit",
                             "profit_margin", "revenue_trend", "cost_trend",
                             "profit_trend"],
  "warnings": []
}
```

Every recommendation always carries **at least one** `evidence_ids` entry — the
backend discards any recommendation that cannot be traced to real evidence.

### `POST /api/ask`

Answers a free-text business question. Send the CSV as `file` **and** the question
as a `question` text field, in the same `multipart/form-data` body.

Makes **one** model call. The question is validated before anything is sent to the
provider: it must be non-empty after trimming and at most **500 characters**.
A missing, blank or over-length question returns `400`.

```json
{
  "valid": true,
  "filename": "up.csv",
  "model": "gpt-4o-mini",
  "question": "How did profit change over time?",
  "answer": "Profit rose over the period, reaching 1400 in the last period.",
  "evidence_ids": ["revenue_trend", "total_profit"],
  "limitations": "The data does not explain why profit changed.",
  "evidence_ids_available": ["total_revenue", "total_cost", "total_profit",
                             "profit_margin", "revenue_trend", "cost_trend",
                             "profit_trend"],
  "warnings": []
}
```

An answer that cites no evidence is still returned — an honest "the evidence does
not cover that" legitimately cites nothing — but it comes back with
`evidence_ids: []` and an explicit warning. See section 8.

### `POST /api/anomalies`

Deterministic anomaly detection. **No API key is required and no model is called.**
It reuses the same verified periods as the trend charts; the rule is documented in
[section 8](#deterministic-anomaly-detection). Results are ordered by severity
first, then metric, then date.

The example below is trimmed to 2 of the 6 anomalies found in the sample CSV:

```json
{
  "valid": true,
  "filename": "sales.csv",
  "row_count": 3,
  "date_column": "order_date",
  "period_count": 3,
  "method": {
    "description": "Each period is compared with the period before it. A change is reported when its absolute percentage change reaches a threshold.",
    "thresholds_percent": { "high": 40.0, "medium": 20.0, "low": 10.0 },
    "note": "A change away from a zero base has no percentage and is always reported as high severity."
  },
  "count": 6,
  "anomalies": [
    {
      "metric": "cost",
      "date": "2024-02-01",
      "value": 400.0,
      "previous_value": 100.0,
      "change": 300.0,
      "change_percent": 300.0,
      "direction": "up",
      "severity": "high",
      "evidence_id": "cost_trend",
      "explanation": "Cost rose 300.0% between 2024-01-01 and 2024-02-01 (100.0 to 400.0)."
    },
    {
      "metric": "profit",
      "date": "2024-03-01",
      "value": -200.0,
      "previous_value": 200.0,
      "change": -400.0,
      "change_percent": -200.0,
      "direction": "down",
      "severity": "high",
      "evidence_id": "profit_trend",
      "explanation": "Profit fell 200.0% between 2024-02-01 and 2024-03-01 (200.0 to -200.0)."
    }
  ],
  "warnings": []
}
```

### Status codes

| Code | Meaning |
| --- | --- |
| `200` | Success |
| `400` | Bad request — missing file, wrong type, empty, malformed CSV. On `/api/ask` also a missing, blank or over-500-character `question` |
| `413` | File larger than 10 MB |
| `422` | No evidence to explain, base recommendations on, or answer questions from (`/api/insights`, `/api/recommendations`, `/api/ask`) |
| `502` | The AI provider failed, or its output failed validation (`/api/insights`, `/api/recommendations`, `/api/ask`) |
| `503` | `LLM_API_KEY` is not configured (`/api/insights`, `/api/recommendations`, `/api/ask`) |
| `504` | The AI provider timed out (`/api/insights`, `/api/recommendations`, `/api/ask`) |

`/api/anomalies` is deterministic and calls no model, so it only ever returns
`200`, `400` or `413` — never `422`, `502`, `503` or `504`. It keeps working when
`LLM_API_KEY` is unset.

---

## 8. How it stays grounded

**Pandas calculates.** Every number comes from deterministic code:

- revenue/cost columns are found by case-insensitive name matching
  (`sales`, `revenue`, `cost`, `expense`, …)
- missing and non-numeric values become `NaN` and are skipped, never treated as 0
- profit `= revenue - cost`; margin `= profit / revenue × 100`
- trends group rows by date and compare the first period with the last

### Deterministic anomaly detection

`POST /api/anomalies` is **not** an AI feature. It is plain arithmetic over the
verified periods from `build_evidence_bundle()`, and it needs no API key.

Each period is compared with the one before it, for revenue, cost and profit:

```
change_percent = (current_value - previous_value) / abs(previous_value) * 100
```

| Absolute change | Severity |
| --- | --- |
| ≥ 40% | `high` |
| ≥ 20% | `medium` |
| ≥ 10% | `low` |
| < 10% | not reported |

Two edge cases are resolved before severity is considered:

- **No movement at all** (`change == 0`) is skipped, so a `0 → 0` pair is never
  misread as an anomaly.
- **Zero previous value** makes the percentage undefined, so `change_percent` is
  `null` and the severity is forced to `high` — a move off zero is always material.

Results are sorted by severity, then metric, then date, so the list is stable.
Because every step is arithmetic over already-verified values, the same CSV always
produces **byte-identical output** (checked across repeated runs).

**Evidence IDs.** Each anomaly cites `"<metric>_trend"` — `revenue_trend`,
`cost_trend` or `profit_trend` — derived from the metric name rather than an array
position, so the ID is stable. The endpoint only emits an anomaly when that ID is
present in the bundle's evidence list, so an anomaly can never reference evidence
that does not exist.

**Auditable rule.** The thresholds, the description and the zero-base rule are all
returned under `method` in the response, so the detection logic can be read off
the API rather than dug out of the source.

**Handled safely.** A missing date column, a single period, or empty trend data
returns `200` with `count: 0` plus a warning explaining that detection was not
possible — the endpoint never fails on sparse data.

**The LLM only interprets.** All three prompts (`/api/insights`,
`/api/recommendations`, `/api/ask`) forbid estimating, extrapolating or using
outside knowledge, forbid stating a cause as fact, and require every item to cite
evidence IDs. The `/api/ask` prompt additionally tells the model to ignore any
instruction found inside the question itself, since the question is free text
supplied by the user.

**What reaches the model.** Every AI endpoint builds its payload from
`build_llm_payload(bundle)`. That payload contains only:

| Sent | Never sent |
| --- | --- |
| `metrics` — totals already calculated | raw CSV rows or cell values |
| `trends` — first/last period, change, % | the raw per-period series (`periods`) |
| `evidence[]` — id, source, values, calculation, result | any column's data |
| `warnings`, `row_count`, `date_column`, `period_count` | the uploaded file itself |

`/api/ask` adds the user's `question` to that payload and nothing else. The
DataFrame is consumed by `build_evidence_bundle()` and never serialised, so there
is no code path that puts raw rows in front of the model, and removing `periods`
leaves it with no series it could calculate from.

For recommendations, the payload is the same verified bundle **plus** the insights
that already passed validation, so no unverified text can reach that second prompt.

**The reply is treated as untrusted.** Whatever the model returns must survive:

1. JSON parsing (markdown code fences are stripped first)
2. a shape check (`insights` / `recommendations` must be a list of objects with text)
3. the **evidence-ID allow-list** — see below
4. `confidence` normalised to `high` / `medium` / `low` (insights only)

If any check fails the endpoint returns `502` rather than displaying something
unverifiable.

### The evidence-ID allow-list

Before calling the model, the endpoint builds the list of evidence IDs it
actually produced (`total_revenue`, `cost_trend`, …). The model's citations are
then filtered against that list:

| Situation | What happens |
| --- | --- |
| A cited ID exists | Kept |
| A cited ID does not exist | Removed, and reported in `warnings` |
| An insight cites no valid ID | Kept, but the card says "did not cite any evidence" |
| An **answer** cites no valid ID | Kept, with an "unsupported" warning |
| A **recommendation** cites no valid ID | **Discarded entirely**, and reported in `warnings` |

The three types differ on purpose:

- **Insights and answers** are *descriptive*, so an uncited one can still be shown
  with a visible caveat. Rejecting uncited answers outright would also make it
  impossible for the model to obey the required rule "if the evidence is
  insufficient, say so" — the honest reply to an unanswerable question cites
  nothing.
- **Recommendations** are *prescriptive*, so an action that no number supports is
  dropped rather than displayed. If every recommendation is discarded, the
  endpoint returns `502`.

This is why every recommendation card always shows at least one evidence ID.

### Graceful fallback (recommendations only)

`/api/recommendations` makes two model calls. If the **first** one (insights)
fails — malformed JSON, wrong shape, or a provider error — the endpoint does not
fail. It drops to **evidence-only** mode: it adds a warning, returns
`insights_used: []`, and still produces recommendations from the numeric bundle.

> "AI insights could not be generated for this request, so the recommendations
> were based on the numeric evidence only. Reason: …"

A missing API key is the one exception: that is checked **before** any model call,
so it still returns a clear `503`.

---

## 9. API key safety

- The key is read from the environment at call time — never hard-coded.
- It is used only in the outgoing `Authorization: Bearer` header.
- It is **never** returned in any API response, and never sent to React (there
  is no `VITE_*` / `REACT_APP_*` variable anywhere).
- Provider error messages are sanitised so the key cannot leak back through them.
- **`.env` must never be committed.** It is already listed in `.gitignore`.
  Set the variables in your shell, or keep them in a local `.env` that is not
  tracked. If you ever commit a key by accident, revoke it at the provider.

---

## 10. Current limitations

- **CSV only.** Despite the "CSV/Excel" framing, only `.csv` files are accepted;
  `.xlsx` is not supported yet.
- **One period = one distinct date.** A file with a year of daily rows produces
  ~365 thin periods. Weekly or monthly bucketing is not implemented.
- **Text month columns are ignored.** A `Month` column holding `Jan`/`Feb` is
  not detected, so those files fall back to "no usable date column".
- **Loose column matching.** After an exact-name pass, a substring pass runs, so
  an ID-like column (`cost_center`) could be mistaken for the cost column when no
  exact match exists. Exact matches always win.
- **No retry, no caching.** One malformed model reply returns `502`, and neither
  AI result is cached — clicking a button again makes another API call.
- **`/api/recommendations` makes two model calls** (insights, then
  recommendations), so it costs roughly twice the latency and tokens of
  `/api/insights`.
- **Recommendations have no `confidence` field** — only insights do, because the
  original spec for recommendations listed `action`, `rationale`, `evidence_ids`
  and `limitations` only.
- **No insight-to-recommendation link.** Recommendations cite evidence IDs but do
  not say which specific insight they came from.
- **Recommendations are model judgement, not a verified optimum.** Unlike the
  metrics, the actions themselves are not computed or ranked by code — only the
  numbers they cite are.
- **`/api/ask` has no conversation memory.** Each question is independent: no
  history, no follow-up context, no clarification round. One question per request.
- **Questions are capped at 500 characters** (`MAX_QUESTION_LENGTH`).
- **Uncited answers are surfaced, not blocked.** An answer citing no valid
  evidence ID is returned with a warning rather than refused, so a hallucinated
  answer is visible but not impossible.
- **Charts are static.** No tooltips, hover values, zoom or pan, and no way to
  export the plotted data. Each chart is a single `<polyline>`.
- **Charts have no accessible data-table alternative.** They expose `role="img"`
  and an `aria-label` naming the chart, but a screen-reader user cannot read the
  underlying values from the chart itself.
- **Charts plot the same periods as the trend cards**, so the "one period = one
  distinct date" limitation above applies to them too.
- **Anomaly detection is a fixed threshold, not a statistical test.** There is no
  z-score, no rolling window and no seasonality handling, so a predictable monthly
  spike will be reported as an anomaly, and a slow multi-period drift below 10%
  per step will not.
- **Only consecutive periods are compared** — the current value against the one
  immediately before it. No trend, level-shift or change-point detection.
- **A large percentage on a tiny base is still reported.** There is no guard on the
  absolute size of the change, so `1 → 3` is flagged as `+200%` `high` even if the
  amounts are trivial for the business.
- **Anomalies carry no direction-of-good judgement.** Severity measures magnitude
  only; a 40% rise in cost and a 40% rise in revenue score the same. The UI
  deliberately colours the change value neutrally to avoid implying otherwise.
- **Only revenue, cost and profit are inspected.** Other numeric columns are not
  scanned for anomalies.
- **Thresholds are fixed in code** (40/20/10) and are not configurable per dataset.
- **The Executive Summary only reports what has been run.** Its trend panel stays
  empty until *Evidence & Trends* has run, and its anomaly count stays an em-dash
  until *Detect Anomalies* has run. It deliberately never guesses those values.
- **The Key Takeaway reuses only the first AI insight.** When several insights
  exist, the summary shows the first one rather than combining them.
- **The strongest trend is ranked by percentage change alone**, ignoring both the
  absolute size of the move and how many periods it spans — so a short series with
  a big percentage can outrank a longer, larger movement.
- **The Executive Summary is a view, not a report.** Nothing can be exported or
  downloaded.
- **Nothing is persisted.** No database, so the CSV is re-uploaded on every step.
- **No token or cost logging** for the AI calls.
- **Not built yet:** database, authentication, Docker.

---

## 11. Quick verification

```bash
# health
curl http://127.0.0.1:5000/api/health

# upload / analyze / evidence (any CSV with revenue + cost columns)
curl -F "file=@sales.csv" http://127.0.0.1:5000/api/upload
curl -F "file=@sales.csv" http://127.0.0.1:5000/api/analyze
curl -F "file=@sales.csv" http://127.0.0.1:5000/api/evidence

# anomaly detection (deterministic, no API key needed)
curl -F "file=@sales.csv" http://127.0.0.1:5000/api/anomalies

# AI insights (requires LLM_API_KEY to be set before starting the server)
curl -F "file=@sales.csv" http://127.0.0.1:5000/api/insights
curl -F "file=@sales.csv" http://127.0.0.1:5000/api/recommendations

# Ask a question (the 'question' field is required, max 500 characters)
curl -F "file=@sales.csv" -F "question=How did profit change over time?" http://127.0.0.1:5000/api/ask
```
