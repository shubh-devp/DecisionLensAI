import { useEffect, useRef, useState } from 'react'

// The bundled demo CSVs live in the project's demo_data/ folder and are inlined
// at build time, so a demo keeps working even without that folder being served.
import fullBusinessCsv from '../../demo_data/full_business.csv?raw'
import noDateCsv from '../../demo_data/no_date.csv?raw'
import revenueOnlyCsv from '../../demo_data/revenue_only.csv?raw'

// Base URL of the Flask backend.
//
// Local development falls back to the default below, so nothing changes when you
// run `npm run dev`. A production build sets VITE_API_BASE_URL (see
// frontend/.env.example) — either to the deployed backend's absolute URL, or to
// an empty value to call the backend on the frontend's own origin.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : 'http://127.0.0.1:5000'
).replace(/\/+$/, '')

// The three ideas the whole project is built on.
const principles = [
  {
    title: 'Calculate with code',
    text: 'Every number comes from Pandas and NumPy, never from the AI.',
  },
  {
    title: 'Explain with AI',
    text: 'The AI only narrates the facts that we already computed.',
  },
  {
    title: 'Verify with evidence',
    text: 'Each insight links back to the exact rows and columns behind it.',
  },
]

// Bundled datasets for the demo. Selecting one only fills the normal uploader —
// it never calls the API on its own.
const DEMO_DATASETS = [
  {
    id: 'full-business',
    name: 'Full business data',
    filename: 'full_business.csv',
    description: 'Revenue and cost across 8 months: clear trends plus a cost spike.',
    csv: fullBusinessCsv,
  },
  {
    id: 'revenue-only',
    name: 'Revenue only',
    filename: 'revenue_only.csv',
    description: 'Revenue with dates but no cost column, so profit is unavailable.',
    csv: revenueOnlyCsv,
  },
  {
    id: 'no-date',
    name: 'No date column',
    filename: 'no_date.csv',
    description: 'Revenue and cost per product, so there are no trends to compute.',
    csv: noDateCsv,
  },
]

// Arrow shown next to each trend direction.
const trendArrow = {
  increasing: '↑',
  decreasing: '↓',
  unchanged: '→',
}

// Colours used for each AI confidence level.
const confidenceStyles = {
  high: 'border-emerald-800 bg-emerald-950/50 text-emerald-300',
  medium: 'border-amber-800 bg-amber-950/50 text-amber-300',
  low: 'border-slate-700 bg-slate-800 text-slate-300',
}

// Colours used for each anomaly severity level.
const severityStyles = {
  high: 'border-rose-800 bg-rose-950/60 text-rose-300',
  medium: 'border-amber-800 bg-amber-950/60 text-amber-300',
  low: 'border-slate-700 bg-slate-800 text-slate-300',
}

// Show a number nicely, or a dash when the backend could not calculate it.
function formatNumber(value) {
  if (value === null || value === undefined) return '—'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatPercent(value) {
  if (value === null || value === undefined) return '—'
  return `${formatNumber(value)}%`
}

// Trend keys in the order used to break ties, so the "strongest trend" pick is
// deterministic when two metrics move by the same amount.
const TREND_PRIORITY = ['revenue', 'profit', 'cost']

const TREND_LABELS = {
  revenue: 'Revenue',
  cost: 'Cost',
  profit: 'Profit',
}

// Pick the trend with the largest absolute percentage change.
// Trends without a comparable percentage (a zero starting period) are skipped.
function pickStrongestTrend(trends) {
  if (!trends) return null

  let best = null

  for (const key of TREND_PRIORITY) {
    const trend = trends[key]
    if (!trend || trend.percent_change === null || trend.percent_change === undefined) {
      continue
    }

    const magnitude = Math.abs(trend.percent_change)
    if (best === null || magnitude > best.magnitude) {
      best = {
        key,
        trend,
        magnitude,
        label: TREND_LABELS[key],
        // Same convention the evidence bundle uses for trend evidence.
        evidenceId: `${key}_trend`,
      }
    }
  }

  return best
}

// Deterministic fallback takeaway, used when no validated AI insight is available.
// It only restates figures that were already computed by Pandas.
function buildKeyTakeaway(analysis, strongestTrend) {
  const { total_revenue, total_cost, total_profit, profit_margin_percent } =
    analysis.metrics

  const parts = []

  if (total_revenue !== null && total_profit !== null) {
    parts.push(
      `Profit is ${formatNumber(total_profit)} on revenue of ${formatNumber(
        total_revenue,
      )}` +
        (profit_margin_percent !== null
          ? ` (a ${formatPercent(profit_margin_percent)} margin).`
          : '.'),
    )
  } else if (total_revenue !== null) {
    parts.push(`Revenue is ${formatNumber(total_revenue)}.`)
  } else if (total_cost !== null) {
    parts.push(`Cost is ${formatNumber(total_cost)}.`)
  } else {
    parts.push('No revenue or cost column was detected in this file.')
  }

  if (strongestTrend) {
    parts.push(
      `${strongestTrend.label} shows the largest movement, ` +
        `${strongestTrend.trend.direction} ` +
        `${formatPercent(Math.abs(strongestTrend.trend.percent_change))}.`,
    )
  }

  return parts.join(' ')
}

// Small card used to show a single metric.
function MetricCard({ label, value, tone = 'default' }) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-400'
      : tone === 'negative'
        ? 'text-rose-400'
        : 'text-cyan-400'

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 transition hover:border-slate-700">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold sm:text-2xl ${toneClass}`}>{value}</p>
    </div>
  )
}

// Card showing how one metric moved from the first period to the last.
function TrendCard({ title, trend }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-slate-500">{title}</p>
      <p className="mt-1 text-xl font-bold text-cyan-400">
        {formatNumber(trend.first_period.value)}
        <span className="mx-2 text-slate-500">→</span>
        {formatNumber(trend.last_period.value)}
      </p>
      <p className="mt-1 text-xs text-slate-300">
        {trendArrow[trend.direction]} {trend.direction} &middot;{' '}
        {formatNumber(trend.change)} ({formatPercent(trend.percent_change)})
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {trend.first_period.date} → {trend.last_period.date} &middot;{' '}
        {trend.period_count} periods
      </p>
    </div>
  )
}

// Small inline "working on it" indicator, shown while an action is running.
function InlineStatus({ children }) {
  return (
    <p className="mt-4 flex items-center gap-2 text-sm text-cyan-300">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
      {children}
    </p>
  )
}

// A dependency-free line chart drawn with inline SVG.
// It scales to its container because the SVG uses a viewBox.
// Input is the verified "periods" array from /api/evidence.
function TrendLineChart({ title, points, color }) {
  const data = points || []

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs uppercase tracking-widest text-slate-500">{title}</p>
        <p className="mt-3 text-xs text-slate-500">No periods to plot.</p>
      </div>
    )
  }

  const width = 320
  const height = 140
  const padding = { top: 14, right: 12, bottom: 26, left: 48 }

  const values = data.map((point) => Number(point.value))
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)

  // A flat series (or a single period) would divide by zero, so widen the range.
  let low = rawMin
  let high = rawMax
  if (high === low) {
    const pad = Math.abs(high) > 0 ? Math.abs(high) * 0.5 : 1
    low -= pad
    high += pad
  }

  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const xAt = (index) =>
    padding.left +
    (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth)
  const yAt = (value) => padding.top + (1 - (value - low) / (high - low)) * plotHeight

  const linePoints = data
    .map(
      (point, index) =>
        `${xAt(index).toFixed(1)},${yAt(Number(point.value)).toFixed(1)}`,
    )
    .join(' ')

  // Only draw the zero line when zero is inside the visible range.
  const showZeroLine = low <= 0 && high >= 0
  const gridValues = [high, (high + low) / 2, low]
  const lastPoint = data[data.length - 1]

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">{title}</p>
        <p className="text-xs text-slate-500">{data.length} periods</p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 w-full"
        role="img"
        aria-label={`${title} line chart`}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              y1={yAt(value)}
              x2={width - padding.right}
              y2={yAt(value)}
              stroke="#1e293b"
              strokeWidth="1"
            />
            <text
              x={padding.left - 6}
              y={yAt(value) + 3}
              textAnchor="end"
              fontSize="9"
              fill="#64748b"
            >
              {formatNumber(value)}
            </text>
          </g>
        ))}

        {showZeroLine && (
          <line
            x1={padding.left}
            y1={yAt(0)}
            x2={width - padding.right}
            y2={yAt(0)}
            stroke="#475569"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        <polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={xAt(data.length - 1)}
          cy={yAt(Number(lastPoint.value))}
          r="3"
          fill={color}
        />
      </svg>

      <div className="mt-1 flex justify-between text-xs text-slate-600">
        <span>{data[0].date}</span>
        <span>{lastPoint.date}</span>
      </div>
    </div>
  )
}

// The three trend charts, drawn only for the metrics that have periods.
function TrendCharts({ trends }) {
  const available = [
    { key: 'revenue', title: 'Revenue over time', color: '#22d3ee' },
    { key: 'cost', title: 'Cost over time', color: '#fbbf24' },
    { key: 'profit', title: 'Profit over time', color: '#34d399' },
  ].filter((chart) => trends[chart.key])

  if (available.length === 0) return null

  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Trend charts
      </h3>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        {available.map((chart) => (
          <TrendLineChart
            key={chart.key}
            title={chart.title}
            color={chart.color}
            points={trends[chart.key].periods || []}
          />
        ))}
      </div>
    </div>
  )
}

// One auditable piece of evidence.
function EvidenceItem({ item }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-cyan-400">{item.metric}</p>
        <p className="text-sm font-semibold">{formatNumber(item.result)}</p>
      </div>
      <p className="mt-2 text-xs text-slate-400">Source: {item.source}</p>
      <p className="mt-1 text-xs text-slate-500">
        Calculation:{' '}
        <span className="font-mono text-slate-400">{item.calculation}</span>
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
          Supporting values
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-300">
          {JSON.stringify(item.values, null, 2)}
        </pre>
      </details>
    </div>
  )
}

// One detected anomaly. Detection is deterministic code, not the model.
function AnomalyCard({ item }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-cyan-400">
          {item.metric}
          <span className="mx-2 text-slate-600">&middot;</span>
          <span className="text-slate-300">{item.date}</span>
        </p>
        <span
          className={
            'rounded-full border px-2 py-0.5 text-xs font-semibold ' +
            (severityStyles[item.severity] || severityStyles.low)
          }
        >
          {item.severity} severity
        </span>
      </div>

      <p className="mt-2 text-lg font-bold text-cyan-400">
        {item.direction === 'up' ? '↑' : '↓'}{' '}
        {item.change_percent === null ? 'n/a' : formatPercent(item.change_percent)}
        <span className="ml-2 text-sm font-normal text-slate-500">
          {formatNumber(item.previous_value)} → {formatNumber(item.value)}
        </span>
      </p>

      <p className="mt-2 text-sm text-slate-300">{item.explanation}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-slate-500">
          Evidence
        </span>
        <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-xs text-slate-300">
          {item.evidence_id}
        </span>
      </div>
    </div>
  )
}

// One AI-generated insight, always tied back to evidence IDs.
function InsightCard({ item }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-cyan-400">{item.insight}</p>
        <span
          className={
            'rounded-full border px-2 py-0.5 text-xs font-semibold ' +
            (confidenceStyles[item.confidence] || confidenceStyles.low)
          }
        >
          {item.confidence} confidence
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-300">{item.explanation}</p>

      {item.evidence_ids.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-slate-500">
            Evidence
          </span>
          {item.evidence_ids.map((id) => (
            <span
              key={id}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-xs text-slate-300"
            >
              {id}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-amber-400">
          This insight did not cite any evidence.
        </p>
      )}

      {item.limitations && (
        <p className="mt-3 text-xs text-slate-500">Limitations: {item.limitations}</p>
      )}
    </div>
  )
}

// One evidence-grounded recommendation. Every card always carries at least one
// evidence id, because the backend discards recommendations without one.
function RecommendationCard({ item }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <p className="text-sm font-semibold text-cyan-400">{item.action}</p>
      <p className="mt-2 text-sm text-slate-300">{item.rationale}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-slate-500">
          Evidence
        </span>
        {item.evidence_ids.map((id) => (
          <span
            key={id}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-xs text-slate-300"
          >
            {id}
          </span>
        ))}
      </div>

      {item.limitations && (
        <p className="mt-3 text-xs text-slate-500">Limitations: {item.limitations}</p>
      )}
    </div>
  )
}

function Warnings({ warnings }) {
  if (!warnings || warnings.length === 0) return null

  return (
    <div className="mt-6 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
        Warnings
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-200">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  )
}

function App() {
  const [backendStatus, setBackendStatus] = useState('checking')

  // Upload state
  const [file, setFile] = useState(null)
  const [dataset, setDataset] = useState(null)
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  // Which bundled demo dataset is loaded, if any.
  const [selectedDemoId, setSelectedDemoId] = useState(null)
  const fileInputRef = useRef(null)

  // Synchronous guard against duplicate submissions. The buttons are disabled
  // while a request runs, but React state updates are asynchronous, so a fast
  // double-click can fire twice before the re-render happens. This ref closes
  // that window because it updates immediately.
  const inFlight = useRef(new Set())

  const beginRequest = (key) => {
    if (inFlight.current.has(key)) return false
    inFlight.current.add(key)
    return true
  }

  const endRequest = (key) => {
    inFlight.current.delete(key)
  }

  // Analysis state
  const [analysis, setAnalysis] = useState(null)
  const [analyzeError, setAnalyzeError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Evidence and trends state
  const [evidence, setEvidence] = useState(null)
  const [evidenceError, setEvidenceError] = useState('')
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false)

  // AI insights state
  const [insights, setInsights] = useState(null)
  const [insightsError, setInsightsError] = useState('')
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)

  // Recommendations state
  const [recommendations, setRecommendations] = useState(null)
  const [recommendationsError, setRecommendationsError] = useState('')
  const [isGeneratingRecommendations, setIsGeneratingRecommendations] = useState(false)

  // Ask Your Data state
  const [question, setQuestion] = useState('')
  const [askResult, setAskResult] = useState(null)
  const [askError, setAskError] = useState('')
  const [isAsking, setIsAsking] = useState(false)

  // Anomaly detection state
  const [anomalies, setAnomalies] = useState(null)
  const [anomaliesError, setAnomaliesError] = useState('')
  const [isDetectingAnomalies, setIsDetectingAnomalies] = useState(false)

  // Business context state. The form is what the user is typing; savedContext is
  // what the server confirmed it stored.
  const [contextForm, setContextForm] = useState({
    industry: '',
    objective: '',
    description: '',
  })
  const [savedContext, setSavedContext] = useState(null)
  const [contextStatus, setContextStatus] = useState('idle')
  const [contextError, setContextError] = useState('')

  // Ask the backend if it is alive. This proves the two halves can talk.
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/health`)
      .then((response) => response.json())
      .then((data) => {
        setBackendStatus(data.status === 'success' ? 'online' : 'offline')
      })
      .catch(() => setBackendStatus('offline'))
  }, [])

  // Load any context the server already holds. The context is optional, so a
  // failure here is not surfaced as an error.
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/context`)
      .then((response) => response.json())
      .then((data) => {
        if (!data.context) return
        setContextForm({
          industry: data.context.industry || '',
          objective: data.context.objective || '',
          description: data.context.description || '',
        })
        setSavedContext(data.context)
      })
      .catch(() => {})
  }, [])

  // Clear every result that belongs to the previous file.
  const resetResults = () => {
    setDataset(null)
    setError('')
    setAnalysis(null)
    setAnalyzeError('')
    setEvidence(null)
    setEvidenceError('')
    setInsights(null)
    setInsightsError('')
    setRecommendations(null)
    setRecommendationsError('')
    setQuestion('')
    setAskResult(null)
    setAskError('')
    setAnomalies(null)
    setAnomaliesError('')
  }

  const handleUpload = async (event) => {
    // Stop the browser from reloading the page when the form is submitted.
    event.preventDefault()

    if (!file) {
      setError('Please choose a CSV file first.')
      setDataset(null)
      return
    }

    if (!beginRequest('upload')) return

    // FormData builds the multipart/form-data body for us.
    const formData = new FormData()
    formData.append('file', file)

    setIsUploading(true)
    resetResults()

    try {
      // NOTE: we do not set a Content-Type header here. The browser adds it
      // automatically, including the multipart boundary that Flask needs.
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        // The backend rejected the file (see its "error" message).
        setError(data.error || `Upload failed (HTTP ${response.status}).`)
      } else {
        setDataset(data)
      }
    } catch {
      setError('Could not reach the backend. Is the Flask server running?')
    } finally {
      endRequest('upload')
      setIsUploading(false)
    }
  }

  // Load a bundled demo CSV into the normal uploader. It builds a File and hands
  // it to the same `file` state the picker uses, so the rest of the flow is
  // untouched — the user still clicks "Upload CSV", then "Analyze Data".
  const handleLoadDemo = (demo) => {
    const demoFile = new File([demo.csv], demo.filename, { type: 'text/csv' })

    // Mirror the choice into the real file input so the filename shows up there.
    if (fileInputRef.current) {
      const transfer = new DataTransfer()
      transfer.items.add(demoFile)
      fileInputRef.current.files = transfer.files
    }

    resetResults()
    setFile(demoFile)
    setSelectedDemoId(demo.id)
  }

  const handleAnalyze = async () => {
    if (!file) {
      setAnalyzeError('Please upload a CSV file first.')
      return
    }

    if (!beginRequest('analyze')) return

    const formData = new FormData()
    formData.append('file', file)

    setIsAnalyzing(true)
    setAnalyzeError('')
    setAnalysis(null)
    setEvidence(null)
    setEvidenceError('')
    setInsights(null)
    setInsightsError('')
    setRecommendations(null)
    setRecommendationsError('')
    setAskResult(null)
    setAskError('')
    setAnomalies(null)
    setAnomaliesError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setAnalyzeError(data.error || `Analysis failed (HTTP ${response.status}).`)
      } else {
        setAnalysis(data)
      }
    } catch {
      setAnalyzeError('Could not reach the backend. Is the Flask server running?')
    } finally {
      endRequest('analyze')
      setIsAnalyzing(false)
    }
  }

  const handleEvidence = async () => {
    if (!file) {
      setEvidenceError('Please upload a CSV file first.')
      return
    }

    if (!beginRequest('evidence')) return

    const formData = new FormData()
    formData.append('file', file)

    setIsLoadingEvidence(true)
    setEvidenceError('')
    setEvidence(null)
    setInsights(null)
    setInsightsError('')
    setRecommendations(null)
    setRecommendationsError('')
    setAskResult(null)
    setAskError('')
    setAnomalies(null)
    setAnomaliesError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/evidence`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setEvidenceError(data.error || `Evidence failed (HTTP ${response.status}).`)
      } else {
        setEvidence(data)
      }
    } catch {
      setEvidenceError('Could not reach the backend. Is the Flask server running?')
    } finally {
      endRequest('evidence')
      setIsLoadingEvidence(false)
    }
  }

  const handleInsights = async () => {
    if (!file) {
      setInsightsError('Please upload a CSV file first.')
      return
    }

    if (!beginRequest('insights')) return

    const formData = new FormData()
    formData.append('file', file)

    setIsGeneratingInsights(true)
    setInsightsError('')
    setInsights(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/insights`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setInsightsError(data.error || `Insights failed (HTTP ${response.status}).`)
      } else {
        setInsights(data)
      }
    } catch {
      setInsightsError('Could not reach the backend. Is the Flask server running?')
    } finally {
      endRequest('insights')
      setIsGeneratingInsights(false)
    }
  }

  const handleRecommendations = async () => {
    if (!file) {
      setRecommendationsError('Please upload a CSV file first.')
      return
    }

    if (!beginRequest('recommendations')) return

    const formData = new FormData()
    formData.append('file', file)

    setIsGeneratingRecommendations(true)
    setRecommendationsError('')
    setRecommendations(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/recommendations`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setRecommendationsError(
          data.error || `Recommendations failed (HTTP ${response.status}).`,
        )
      } else {
        setRecommendations(data)
      }
    } catch {
      setRecommendationsError(
        'Could not reach the backend. Is the Flask server running?',
      )
    } finally {
      endRequest('recommendations')
      setIsGeneratingRecommendations(false)
    }
  }

  const handleAsk = async () => {
    if (!file) {
      setAskError('Please upload a CSV file first.')
      return
    }

    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) {
      setAskError('Please type a question first.')
      return
    }

    if (!beginRequest('ask')) return

    const formData = new FormData()
    formData.append('file', file)
    // The question travels next to the CSV in the same multipart body.
    formData.append('question', trimmedQuestion)

    setIsAsking(true)
    setAskError('')
    setAskResult(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/ask`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setAskError(data.error || `Question failed (HTTP ${response.status}).`)
      } else {
        setAskResult(data)
      }
    } catch {
      setAskError('Could not reach the backend. Is the Flask server running?')
    } finally {
      endRequest('ask')
      setIsAsking(false)
    }
  }

  const handleDetectAnomalies = async () => {
    if (!file) {
      setAnomaliesError('Please upload a CSV file first.')
      return
    }

    if (!beginRequest('anomalies')) return

    const formData = new FormData()
    formData.append('file', file)

    setIsDetectingAnomalies(true)
    setAnomaliesError('')
    setAnomalies(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/anomalies`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setAnomaliesError(
          data.error || `Anomaly detection failed (HTTP ${response.status}).`,
        )
      } else {
        setAnomalies(data)
      }
    } catch {
      setAnomaliesError('Could not reach the backend. Is the Flask server running?')
    } finally {
      endRequest('anomalies')
      setIsDetectingAnomalies(false)
    }
  }

  const updateContextField = (field) => (event) => {
    setContextForm((current) => ({ ...current, [field]: event.target.value }))
    setContextStatus('idle')
    setContextError('')
  }

  const handleSaveContext = async () => {
    setContextStatus('saving')
    setContextError('')

    try {
      // This endpoint takes JSON, not multipart, so the header matters here.
      const response = await fetch(`${API_BASE_URL}/api/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contextForm),
      })

      const data = await response.json()

      if (!response.ok) {
        setContextError(data.error || `Could not save context (HTTP ${response.status}).`)
        setContextStatus('idle')
      } else {
        setSavedContext(data.context)
        setContextStatus('saved')
      }
    } catch {
      setContextError('Could not reach the backend. Is the Flask server running?')
      setContextStatus('idle')
    }
  }

  // Green for profit, red for loss.
  const profitTone =
    analysis && analysis.metrics.total_profit !== null
      ? analysis.metrics.total_profit >= 0
        ? 'positive'
        : 'negative'
      : 'default'

  const trendTitles = {
    revenue: 'Revenue trend',
    cost: 'Cost trend',
    profit: 'Profit trend',
  }

  // --- Executive summary inputs (all reused from existing state) -------------
  // Nothing here triggers a new request: it reads the analysis, evidence,
  // anomaly and insight results that the user has already produced.
  const strongestTrend = pickStrongestTrend(evidence ? evidence.trends : null)

  // The trend comparison comes from /api/evidence, so it is only loaded once the
  // user has run that step. Distinguish "not loaded yet" from "not available".
  const trendComparisonLoaded = Boolean(evidence)

  const topInsight =
    insights && insights.insights.length > 0 ? insights.insights[0] : null

  const summaryTakeaway = topInsight
    ? topInsight.insight
    : analysis
      ? buildKeyTakeaway(analysis, strongestTrend)
      : ''

  const takeawaySource = topInsight
    ? 'from the validated AI insight'
    : 'computed from verified metrics, no AI'

  const missingMetricNote = analysis
    ? [
        analysis.detected_columns.revenue ? null : 'revenue',
        analysis.detected_columns.cost ? null : 'cost',
      ].filter(Boolean)
    : []

  const hasSavedContext = savedContext
    ? Boolean(
        savedContext.industry || savedContext.objective || savedContext.description,
      )
    : false

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-4xl px-6 py-20">
        <header>
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
            AI Build Challenge 2026
          </p>
          <h1 className="mt-3 text-5xl font-bold tracking-tight">DecisionLens AI</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            An AI-powered business decision engine that turns CSV and Excel data into
            evidence-backed insights and recommendations.
          </p>
        </header>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          {principles.map((principle) => (
            <div
              key={principle.title}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5"
            >
              <h2 className="text-base font-semibold text-cyan-400">{principle.title}</h2>
              <p className="mt-2 text-sm text-slate-300">{principle.text}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Step 1 &mdash; Upload your data
          </h2>

          <form
            onSubmit={handleUpload}
            className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(event) => {
                setFile(event.target.files[0] || null)
                // Choosing a file by hand clears the demo selection highlight.
                setSelectedDemoId(null)
                resetResults()
              }}
              className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cyan-400 hover:file:bg-slate-700"
            />
            <button
              type="submit"
              disabled={isUploading}
              className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : 'Upload CSV'}
            </button>
          </form>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Try a demo dataset
              </p>
              <p className="text-xs text-slate-500">
                Loads the CSV into the uploader above. Nothing runs until you click
                Upload CSV.
              </p>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {DEMO_DATASETS.map((demo) => (
                <button
                  key={demo.id}
                  type="button"
                  onClick={() => handleLoadDemo(demo)}
                  className={
                    'rounded-lg border px-3 py-2 text-left transition ' +
                    (selectedDemoId === demo.id
                      ? 'border-cyan-600 bg-cyan-950/40'
                      : 'border-slate-800 bg-slate-900 hover:border-slate-700')
                  }
                >
                  <span className="block text-sm font-semibold text-cyan-400">
                    {demo.name}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {demo.description}
                  </span>
                </button>
              ))}
            </div>

            {selectedDemoId && (
              <p className="mt-3 text-xs text-slate-500">
                Loaded{' '}
                <span className="font-mono text-slate-300">
                  {DEMO_DATASETS.find((demo) => demo.id === selectedDemoId)?.filename}
                </span>
                . Click "Upload CSV" to continue.
              </p>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
              {error}
            </p>
          )}

          {dataset && (
            <div className="mt-6">
              <p className="flex items-center gap-2 text-sm">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Valid dataset: <span className="font-semibold">{dataset.filename}</span>
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <MetricCard label="Rows" value={formatNumber(dataset.rows)} />
                <MetricCard label="Columns" value={formatNumber(dataset.columns)} />
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase tracking-widest text-slate-400">
                      <th className="py-2 pr-4">Column</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Missing values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.column_names.map((name) => (
                      <tr key={name} className="border-b border-slate-900">
                        <td className="py-2 pr-4 font-medium">{name}</td>
                        <td className="py-2 pr-4 text-slate-400">{dataset.dtypes[name]}</td>
                        <td className="py-2 pr-4">{dataset.missing_values[name]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="mt-6 rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Data'}
              </button>
            </div>
          )}
        </section>

        {analysis && (
          <section className="mt-12 rounded-xl border border-cyan-900 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
              Executive Summary
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              A business-level view assembled entirely from the verified figures below.
              No extra AI call was made to produce it.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Revenue"
                value={formatNumber(analysis.metrics.total_revenue)}
              />
              <MetricCard
                label="Cost"
                value={formatNumber(analysis.metrics.total_cost)}
              />
              <MetricCard
                label="Profit"
                value={formatNumber(analysis.metrics.total_profit)}
                tone={profitTone}
              />
              <MetricCard
                label="Profit margin"
                value={formatPercent(analysis.metrics.profit_margin_percent)}
                tone={profitTone}
              />
              <MetricCard
                label="Anomalies"
                value={anomalies ? formatNumber(anomalies.count) : '—'}
              />
            </div>

            {missingMetricNote.length > 0 && (
              <p className="mt-3 text-xs text-amber-400">
                No {missingMetricNote.join(' or ')} column was detected, so those
                figures show a dash.
              </p>
            )}

            {!anomalies && (
              <p className="mt-2 text-xs text-slate-500">
                The anomaly count appears once you run "Detect Anomalies" in the
                Evidence &amp; Trends section below.
              </p>
            )}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  Strongest trend
                </p>
                {strongestTrend ? (
                  <>
                    <p className="mt-1 text-sm text-slate-200">
                      <span className="font-semibold text-cyan-400">
                        {strongestTrend.label}
                      </span>{' '}
                      {strongestTrend.trend.direction}{' '}
                      {formatPercent(Math.abs(strongestTrend.trend.percent_change))}{' '}
                      from {formatNumber(strongestTrend.trend.first_period.value)} to{' '}
                      {formatNumber(strongestTrend.trend.last_period.value)} across{' '}
                      {strongestTrend.trend.period_count} periods.
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {strongestTrend.trend.first_period.date} →{' '}
                      {strongestTrend.trend.last_period.date} &middot; evidence{' '}
                      <span className="font-mono">{strongestTrend.evidenceId}</span>
                    </p>
                  </>
                ) : trendComparisonLoaded ? (
                  <p className="mt-1 text-sm text-slate-400">
                    No comparable trend is available. This needs a date column and at
                    least two periods.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">
                    Run "Evidence &amp; Trends" below to load the verified trend
                    comparison.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-widest text-slate-500">
                    Key takeaway
                  </p>
                  <span className="text-xs text-slate-500">{takeawaySource}</span>
                </div>
                <p className="mt-1 text-sm text-slate-200">{summaryTakeaway}</p>
                {topInsight && topInsight.evidence_ids.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Evidence{' '}
                    <span className="font-mono">
                      {topInsight.evidence_ids.join(', ')}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                Business Context
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Optional. This only shapes how the AI words its answers &mdash; it never
                changes a calculated figure. Clear all fields and save to remove it.
              </p>
            </div>
            {hasSavedContext && (
              <span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                context saved
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-slate-500">
                Industry / business type
              </span>
              <input
                type="text"
                value={contextForm.industry}
                onChange={updateContextField('industry')}
                maxLength={120}
                placeholder="e.g. D2C food brand"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-widest text-slate-500">
                Business objective
              </span>
              <input
                type="text"
                value={contextForm.objective}
                onChange={updateContextField('objective')}
                maxLength={200}
                placeholder="e.g. Improve gross margin this quarter"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-widest text-slate-500">
              Business description (optional)
            </span>
            <textarea
              value={contextForm.description}
              onChange={updateContextField('description')}
              maxLength={1000}
              rows={3}
              placeholder="Anything else the analysis should keep in mind."
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveContext}
              disabled={contextStatus === 'saving'}
              className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {contextStatus === 'saving' ? 'Saving...' : 'Save Context'}
            </button>

            {contextStatus === 'saved' && (
              <span className="text-xs text-emerald-400">
                Saved. The AI steps below will use this context.
              </span>
            )}
          </div>

          {contextError && (
            <p className="mt-3 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
              {contextError}
            </p>
          )}
        </section>

        {(analysis || analyzeError || isAnalyzing) && (
          <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Step 2 &mdash; Analyze your data
            </h2>

            {isAnalyzing && <InlineStatus>Calculating metrics with Pandas...</InlineStatus>}

            {analyzeError && (
              <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
                {analyzeError}
              </p>
            )}

            {analysis && (
              <>
                <p className="mt-4 text-xs text-slate-500">
                  Detected revenue column:{' '}
                  <span className="text-slate-300">
                    {analysis.detected_columns.revenue ?? 'none found'}
                  </span>{' '}
                  &middot; cost column:{' '}
                  <span className="text-slate-300">
                    {analysis.detected_columns.cost ?? 'none found'}
                  </span>
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard
                    label="Total revenue"
                    value={formatNumber(analysis.metrics.total_revenue)}
                  />
                  <MetricCard
                    label="Total cost"
                    value={formatNumber(analysis.metrics.total_cost)}
                  />
                  <MetricCard
                    label="Total profit"
                    value={formatNumber(analysis.metrics.total_profit)}
                    tone={profitTone}
                  />
                  <MetricCard
                    label="Profit margin"
                    value={formatPercent(analysis.metrics.profit_margin_percent)}
                    tone={profitTone}
                  />
                  <MetricCard
                    label="Rows analysed"
                    value={formatNumber(analysis.row_count)}
                  />
                </div>

                <Warnings warnings={analysis.warnings} />

                {Object.keys(analysis.numeric_column_stats).length > 0 && (
                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-xs uppercase tracking-widest text-slate-400">
                          <th className="py-2 pr-4">Numeric column</th>
                          <th className="py-2 pr-4">Min</th>
                          <th className="py-2 pr-4">Max</th>
                          <th className="py-2 pr-4">Mean</th>
                          <th className="py-2 pr-4">Missing / invalid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(analysis.numeric_column_stats).map(
                          ([name, stats]) => (
                            <tr key={name} className="border-b border-slate-900">
                              <td className="py-2 pr-4 font-medium">{name}</td>
                              <td className="py-2 pr-4">{formatNumber(stats.min)}</td>
                              <td className="py-2 pr-4">{formatNumber(stats.max)}</td>
                              <td className="py-2 pr-4">{formatNumber(stats.mean)}</td>
                              <td className="py-2 pr-4">{stats.missing_or_invalid}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleEvidence}
                  disabled={isLoadingEvidence}
                  className="mt-6 rounded-lg bg-slate-700 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoadingEvidence ? 'Generating...' : 'Evidence & Trends'}
                </button>
              </>
            )}
          </section>
        )}

        {(evidence || evidenceError || isLoadingEvidence) && (
          <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Step 3 &mdash; Evidence &amp; Trends
            </h2>

            {isLoadingEvidence && (
              <InlineStatus>Calculating trends and evidence...</InlineStatus>
            )}

            {evidenceError && (
              <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
                {evidenceError}
              </p>
            )}

            {evidence && (
              <>
                <p className="mt-4 text-xs text-slate-500">
                  Date column:{' '}
                  <span className="text-slate-300">
                    {evidence.date_column ?? 'none found'}
                  </span>{' '}
                  &middot; periods:{' '}
                  <span className="text-slate-300">{evidence.period_count}</span>
                </p>

                {evidence.trends.revenue ||
                evidence.trends.cost ||
                evidence.trends.profit ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(evidence.trends).map(([key, trend]) =>
                      trend ? (
                        <TrendCard key={key} title={trendTitles[key]} trend={trend} />
                      ) : null,
                    )}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
                    No time-based trend could be calculated for this dataset, so there
                    are no charts to draw.
                  </p>
                )}

                <TrendCharts trends={evidence.trends} />

                <div className="mt-8 border-t border-slate-800 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Anomalies
                    </h3>
                    <button
                      type="button"
                      onClick={handleDetectAnomalies}
                      disabled={isDetectingAnomalies}
                      className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isDetectingAnomalies ? 'Detecting...' : 'Detect Anomalies'}
                    </button>
                  </div>

                  {isDetectingAnomalies && (
                    <InlineStatus>Comparing consecutive periods...</InlineStatus>
                  )}

                  {anomaliesError && (
                    <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
                      {anomaliesError}
                    </p>
                  )}

                  {anomalies && (
                    <>
                      <p className="mt-3 text-xs text-slate-500">
                        Deterministic threshold check, no AI: high &ge;{' '}
                        {anomalies.method.thresholds_percent.high}%, medium &ge;{' '}
                        {anomalies.method.thresholds_percent.medium}%, low &ge;{' '}
                        {anomalies.method.thresholds_percent.low}%.
                      </p>

                      {anomalies.anomalies.length === 0 ? (
                        anomalies.period_count < 2 || !anomalies.date_column ? (
                          <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
                            No anomalies to report: detection needs a usable date column
                            and at least two periods to compare.
                          </p>
                        ) : (
                          <p className="mt-3 rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
                            No anomalies detected: every period-to-period change stayed
                            below the {anomalies.method.thresholds_percent.low}%
                            threshold.
                          </p>
                        )
                      ) : (
                        <>
                          <div className="mt-3 space-y-3">
                            {anomalies.anomalies.map((item, index) => (
                              <AnomalyCard
                                key={`${item.metric}-${item.date}-${index}`}
                                item={item}
                              />
                            ))}
                          </div>
                          <p className="mt-3 text-xs text-slate-500">
                            {anomalies.count} anomalous change(s) found across{' '}
                            {anomalies.period_count} periods.
                          </p>
                        </>
                      )}
                    </>
                  )}
                </div>

                <Warnings warnings={evidence.warnings} />

                {evidence.evidence.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Supporting evidence
                    </h3>
                    <div className="mt-3 space-y-3">
                      {evidence.evidence.map((item) => (
                        <EvidenceItem key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleInsights}
                  disabled={isGeneratingInsights}
                  className="mt-6 rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGeneratingInsights ? 'Generating...' : 'Generate AI Insights'}
                </button>
              </>
            )}
          </section>
        )}

        {(insights || insightsError || isGeneratingInsights) && (
          <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Step 4 &mdash; AI Insights
            </h2>

            {isGeneratingInsights && (
              <InlineStatus>Asking the model to explain the evidence...</InlineStatus>
            )}

            {insightsError && (
              <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
                {insightsError}
              </p>
            )}

            {insights && (
              <>
                <p className="mt-4 text-xs text-slate-500">
                  Written by <span className="text-slate-300">{insights.model}</span>{' '}
                  from {insights.evidence_ids_available.length} verified evidence
                  item(s). The AI only explains numbers that were calculated with code
                  &mdash; it never does the maths itself.
                </p>

                <div className="mt-4 space-y-3">
                  {insights.insights.map((item, index) => (
                    <InsightCard key={`${item.insight}-${index}`} item={item} />
                  ))}
                </div>

                <Warnings warnings={insights.warnings} />
              </>
            )}
          </section>
        )}

        {(evidence || recommendations || recommendationsError || isGeneratingRecommendations) && (
          <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Step 5 &mdash; Recommendations
            </h2>

            {evidence && (
              <button
                type="button"
                onClick={handleRecommendations}
                disabled={isGeneratingRecommendations}
                className="mt-4 rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingRecommendations
                  ? 'Generating...'
                  : 'Generate Recommendations'}
              </button>
            )}

            {isGeneratingRecommendations && (
              <InlineStatus>Building recommendations from the evidence...</InlineStatus>
            )}

            {recommendationsError && (
              <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
                {recommendationsError}
              </p>
            )}

            {recommendations && (
              <>
                <p className="mt-4 text-xs text-slate-500">
                  Written by{' '}
                  <span className="text-slate-300">{recommendations.model}</span> from{' '}
                  {recommendations.evidence_ids_available.length} verified evidence
                  item(s) and {recommendations.insights_used.length} validated
                  insight(s). Every action below cites the evidence it is based on.
                </p>

                <div className="mt-4 space-y-3">
                  {recommendations.recommendations.map((item, index) => (
                    <RecommendationCard key={`${item.action}-${index}`} item={item} />
                  ))}
                </div>

                <Warnings warnings={recommendations.warnings} />
              </>
            )}
          </section>
        )}

        {(evidence || evidenceError) && (
          <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Step 6 &mdash; Ask Your Data
            </h2>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                handleAsk()
              }}
              className="mt-4 flex flex-col gap-4 sm:flex-row"
            >
              <input
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="e.g. How did profit change over time?"
                maxLength={500}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isAsking}
                className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAsking ? 'Asking...' : 'Ask Your Data'}
              </button>
            </form>

            <p className="mt-2 text-xs text-slate-500">
              Answers come only from the verified metrics, trends and evidence above.
            </p>

            {isAsking && <InlineStatus>Answering from the verified evidence...</InlineStatus>}

            {askError && (
              <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
                {askError}
              </p>
            )}

            {askResult && (
              <>
                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-500">
                    Question
                  </p>
                  <p className="mt-1 text-sm text-slate-400">{askResult.question}</p>

                  <p className="mt-4 text-xs uppercase tracking-widest text-slate-500">
                    Answer
                  </p>
                  <p className="mt-1 text-sm text-slate-200">{askResult.answer}</p>

                  {askResult.evidence_ids.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-widest text-slate-500">
                        Evidence
                      </span>
                      {askResult.evidence_ids.map((id) => (
                        <span
                          key={id}
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-xs text-slate-300"
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-amber-400">
                      This answer did not cite any evidence.
                    </p>
                  )}

                  {askResult.limitations && (
                    <p className="mt-3 text-xs text-slate-500">
                      Limitations: {askResult.limitations}
                    </p>
                  )}
                </div>

                <Warnings warnings={askResult.warnings} />
              </>
            )}
          </section>
        )}

        <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            System status
          </h2>
          <p className="mt-3 flex items-center gap-2 text-sm">
            <span
              className={
                'inline-block h-2.5 w-2.5 rounded-full ' +
                (backendStatus === 'online'
                  ? 'bg-emerald-400'
                  : backendStatus === 'offline'
                    ? 'bg-rose-400'
                    : 'bg-amber-400')
              }
            />
            Backend: {backendStatus}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            This calls GET {API_BASE_URL}/api/health to check the Flask server.
          </p>
        </section>
      </main>
    </div>
  )
}

export default App
