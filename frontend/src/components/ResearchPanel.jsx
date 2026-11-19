
import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Search,
  ExternalLink,
  BookmarkPlus,
  Loader2,
  Globe,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { searchWebApi } from '../api/client'

const ResultCard = ({ result, onSave }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-xl p-4 border transition-all duration-200 hover:-translate-y-0.5"
    style={{
      background: 'var(--glass-bg)',
      borderColor: 'var(--glass-border)',
      boxShadow: 'var(--glass-shadow)',
    }}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium line-clamp-1 flex items-center gap-1 transition-colors"
          style={{ color: 'var(--accent)' }}
        >
          {result.title || 'Untitled'}
          <ExternalLink size={11} className="shrink-0" />
        </a>

        <p
          className="text-xs mt-1 line-clamp-3 leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {result.snippet || result.description || 'No description available.'}
        </p>

        <span
          className="text-xs mt-2 block truncate"
          style={{ color: 'var(--text-secondary)', opacity: 0.75 }}
        >
          {result.url}
        </span>
      </div>

      <button
        onClick={() => onSave(result)}
        className="shrink-0 p-2 rounded-lg transition-all duration-200 hover:brightness-110"
        style={{
          color: 'var(--accent)',
          background: 'var(--hover-glow)',
        }}
        title="Save to Knowledge Base"
      >
        <BookmarkPlus size={15} />
      </button>
    </div>
  </motion.div>
)

const ResearchPanel = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [savedIds, setSavedIds] = useState(new Set())

  const handleSearch = async () => {
    if (!query.trim() || isLoading) return

    setIsLoading(true)
    setHasSearched(true)
    setResults([])
    setSummary('')

    try {
      const data = await searchWebApi(query.trim())
      setResults(data.results || [])
      setSummary(data.summary || '')
    } catch (err) {
      toast.error(err.message || 'Search failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleSave = (result) => {
    setSavedIds((prev) => new Set([...prev, result.url]))
    toast.success('Saved to Knowledge Base!')
  }

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full px-4 py-6">

      {/* Header */}
      <div className="mb-6">
        <h2
          className="text-xl font-semibold flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <Globe size={20} style={{ color: 'var(--accent)' }} />
          Web Research
        </h2>

        <p
          className="text-sm mt-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          Search the web and save results to the knowledge base
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-secondary)' }}
          />

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search the web..."
            className="w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none border transition-all duration-200"
            style={{
              background: 'var(--glass-bg)',
              borderColor: 'var(--glass-border)',
              color: 'var(--text-primary)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--glass-border)'
            }}
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={!query.trim() || isLoading}
          className="px-5 py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-110"
          style={{
            background: 'var(--accent)',
            color: '#17212b',
          }}
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Search size={16} />
          )}
          Search
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div
              className="w-12 h-12 rounded-full border-2 animate-spin"
              style={{
                borderColor: 'var(--glass-border)',
                borderTopColor: 'var(--accent)',
              }}
            />
          </div>

          <p
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            Searching the web...
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !hasSearched && (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-center">
          <div className="text-5xl mb-4">🔍</div>

          <p
            className="font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Search the web and I'll learn from the results
          </p>

          <p
            className="text-sm mt-2 max-w-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            Results can be saved to the knowledge base for future reference
          </p>
        </div>
      )}

      {/* No Results */}
      {!isLoading && hasSearched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center">
          <div className="text-4xl mb-3">😕</div>

          <p
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            No results found for "{query}"
          </p>
        </div>
      )}

      {/* Results */}
      {!isLoading && results.length > 0 && (
        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4">

          {/* Summary */}
          {summary && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl p-4 border"
              style={{
                background: 'var(--hover-glow)',
                borderColor: 'var(--glass-border)',
              }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1"
                style={{ color: 'var(--accent)' }}
              >
                <span>✨</span> AI Summary
              </h3>

              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-primary)' }}
              >
                {summary}
              </p>
            </motion.div>
          )}

          {/* Result Cards */}
          <div className="grid gap-3">
            {results.map((result, i) => (
              <motion.div
                key={result.url || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <ResultCard
                  result={result}
                  onSave={handleSave}
                />

                {savedIds.has(result.url) && (
                  <p className="text-xs text-emerald-500 mt-1 ml-1">
                    ✓ Saved to knowledge base
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ResearchPanel
