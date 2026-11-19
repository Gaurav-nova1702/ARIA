
import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart2,
  RefreshCw,
  MessageSquare,
  BookOpen,
  Star,
  Zap,
  TrendingUp,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import toast from 'react-hot-toast'
import { getMetrics, getFeedbackMetrics, getFeedbackHistory } from '../api/client'

const StatCard = ({ icon: Icon, label, value, sub, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-panel glass-hover rounded-xl p-5 flex items-center gap-4 transition-all duration-200"
  >
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
      <Icon size={22} />
    </div>

    <div className="min-w-0">
      <p className="text-xs text-secondary font-medium">{label}</p>
      <p className="text-2xl font-bold text-primary mt-0.5">{value ?? '—'}</p>
      {sub && <p className="text-xs text-secondary mt-0.5">{sub}</p>}
    </div>
  </motion.div>
)

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-primary mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}:{' '}
            <span className="font-semibold">
              {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
            </span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

const STAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#c49a50']

const MetricsPanel = () => {
  const [metrics, setMetrics] = useState(null)
  const [feedbackMetrics, setFeedbackMetrics] = useState(null)
  const [feedbackHistory, setFeedbackHistory] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const [m, fm, fh] = await Promise.allSettled([
        getMetrics(),
        getFeedbackMetrics(),
        getFeedbackHistory(),
      ])

      if (m.status === 'fulfilled') setMetrics(m.value)
      if (fm.status === 'fulfilled') setFeedbackMetrics(fm.value)

      if (fh.status === 'fulfilled') {
        const raw = fh.value?.history || fh.value || []

        setFeedbackHistory(
          Array.isArray(raw)
            ? raw.map((item) => ({
                ...item,
                avg_rating: item.avg_feedback,
              }))
            : []
        )
      }
    } catch {
      toast.error('Failed to load metrics.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const ratingDistribution = feedbackMetrics?.rating_distribution
    ? Object.entries(feedbackMetrics.rating_distribution).map(([star, count]) => ({
        star: `${star}★`,
        count,
      }))
    : [1, 2, 3, 4, 5].map((s) => ({ star: `${s}★`, count: 0 }))

  const avgScore =
    feedbackMetrics?.avg_rating != null
      ? feedbackMetrics.avg_rating.toFixed(1)
      : '—'

  const learningDelta =
    feedbackMetrics?.trend?.delta != null
      ? feedbackMetrics.trend.delta
      : null

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full px-4 py-6 overflow-y-auto scrollbar-hide">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
            <BarChart2 size={20} className="text-accent" />
            Metrics & Analytics
          </h2>
          <p className="text-sm text-secondary mt-1">
            Agent performance and learning insights
          </p>
        </div>

        <button
          onClick={fetchAll}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/60 hover:bg-secondary border border-glass text-primary text-sm font-medium transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={MessageSquare}
          label="Total Conversations"
          value={metrics?.total_conversations ?? '—'}
          sub="All time"
          color="bg-accent/15 text-accent"
        />

        <StatCard
          icon={BookOpen}
          label="Knowledge Entries"
          value={metrics?.total_knowledge_entries ?? '—'}
          sub="In database"
          color="bg-sky-500/15 text-sky-500"
        />

        <StatCard
          icon={Star}
          label="Avg Feedback Score"
          value={avgScore}
          sub="Out of 5.0"
          color="bg-amber-500/15 text-amber-500"
        />

        <StatCard
          icon={Zap}
          label="Today's Queries"
          value={metrics?.today_conversations ?? '—'}
          sub="Today"
          color="bg-emerald-500/15 text-emerald-500"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* Feedback Trend */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-primary mb-4">
            Feedback Score Trend
          </h3>

          {feedbackHistory.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-secondary text-sm">
              No feedback data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={feedbackHistory}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--glass-border)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 5]}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="avg_rating"
                  name="Avg Rating"
                  stroke="#c49a50"
                  strokeWidth={2.5}
                  dot={{ fill: '#c49a50', r: 3 }}
                  activeDot={{ r: 5, fill: '#d8b875' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Rating Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-primary mb-4">
            Rating Distribution
          </h3>

          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={ratingDistribution} barCategoryGap="30%">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--glass-border)"
              />
              <XAxis
                dataKey="star"
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                {ratingDistribution.map((_, i) => (
                  <Cell
                    key={i}
                    fill={STAR_COLORS[i] || '#c49a50'}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Learning Progress */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-panel rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-accent" />
          <h3 className="text-sm font-semibold text-primary">
            Learning Progress
          </h3>
        </div>

        {learningDelta !== null ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary">
                Score improvement (last 30 days)
              </span>

              <span
                className={`font-semibold ${
                  learningDelta >= 0 ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {learningDelta >= 0 ? '+' : ''}{learningDelta.toFixed(2)}
              </span>
            </div>

            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, Math.max(0, ((avgScore === '—' ? 0 : parseFloat(avgScore)) / 5) * 100))}%`,
                }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                className="h-full rounded-full bg-gradient-to-r from-[#a77b35] via-[#c49a50] to-[#d8b875]"
              />
            </div>

            <div className="flex justify-between text-xs text-secondary">
              <span>0</span>
              <span>Score: {avgScore}/5.0</span>
              <span>5.0</span>
            </div>
          </div>
        ) : (
          <p className="text-secondary text-sm text-center py-4">
            Start collecting feedback to track learning progress
          </p>
        )}
      </motion.div>
    </div>
  )
}

export default MetricsPanel
