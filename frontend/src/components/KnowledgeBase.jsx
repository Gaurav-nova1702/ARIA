
import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Trash2,
  BookOpen,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getKnowledge, searchKnowledge, deleteKnowledge } from '../api/client'

const ConfidenceBadge = ({ score }) => {
  const pct = Math.round((score || 0) * 100)

  const color =
    pct >= 80
      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25'
      : pct >= 50
      ? 'bg-amber-500/15 text-amber-500 border-amber-500/25'
      : 'bg-red-500/15 text-red-500 border-red-500/25'

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${color}`}>
      {pct}% confidence
    </span>
  )
}

const KnowledgeCard = ({ item, onDelete }) => {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }

    try {
      await onDelete(item.id)
      toast.success('Knowledge entry deleted.')
    } catch {
      toast.error('Could not delete entry.')
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass-panel glass-hover rounded-xl p-4 transition-all duration-200 group relative flex flex-col gap-2"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary line-clamp-2 leading-snug flex-1">
          {item.topic || item.title || 'Untitled'}
        </h3>

        <button
          onClick={handleDelete}
          className={`shrink-0 p-1.5 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100 ${
            confirmDelete
              ? 'bg-red-500/15 text-red-500 border border-red-500/25 opacity-100'
              : 'text-secondary hover:text-red-500 hover:bg-red-500/10'
          }`}
          title={confirmDelete ? 'Click again to confirm deletion' : 'Delete'}
        >
          {confirmDelete ? <AlertTriangle size={13} /> : <Trash2 size={13} />}
        </button>
      </div>

      {/* Content preview */}
      <p className="text-xs text-secondary line-clamp-3 leading-relaxed">
        {item.content || item.summary || 'No content preview.'}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          {item.confidence_score !== undefined && (
            <ConfidenceBadge score={item.confidence_score} />
          )}

          {item.access_count !== undefined && (
            <span className="text-xs text-secondary">
              Accessed {item.access_count}×
            </span>
          )}
        </div>

        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-accent hover:opacity-75 transition-colors"
          >
            <ExternalLink size={10} />
            Source
          </a>
        )}
      </div>
    </motion.div>
  )
}

const KnowledgeBase = () => {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const limit = 12

  const fetchKnowledge = useCallback(async (p = 1) => {
    setIsLoading(true)
    try {
      const data = await getKnowledge(p, limit)
      setItems(data.entries || [])
      setTotal(data.count || 0)
      setPage(p)
    } catch (err) {
      toast.error(err.message || 'Failed to load knowledge base.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKnowledge(1)
  }, [fetchKnowledge])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchKnowledge(1)
      return
    }

    setIsSearching(true)
    try {
      const data = await searchKnowledge(searchQuery.trim())
      setItems(data.results || data.items || [])
      setTotal(data.total || (data.results || []).length)
      setPage(1)
    } catch (err) {
      toast.error(err.message || 'Search failed.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearchKey = (e) => {
    if (e.key === 'Enter') handleSearch()

    if (e.key === 'Escape') {
      setSearchQuery('')
      fetchKnowledge(1)
    }
  }

  const handleDelete = async (id) => {
    await deleteKnowledge(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
    setTotal((prev) => Math.max(0, prev - 1))
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto w-full px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
            <BookOpen size={20} className="text-accent" />
            Knowledge Base
          </h2>

          <p className="text-sm text-secondary mt-1">
            {total} entr{total === 1 ? 'y' : 'ies'} stored
          </p>
        </div>

        {/* Search */}
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none"
            />

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Semantic search..."
              className="w-full bg-secondary/60 border border-glass rounded-xl pl-9 pr-4 py-2.5 text-sm text-primary placeholder:text-secondary outline-none focus:border-accent/60 transition-colors duration-200"
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors duration-200 flex items-center gap-1.5"
          >
            {isSearching ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            Search
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          <p className="text-secondary text-sm">Loading knowledge...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-center">
          <div className="text-5xl mb-4">📚</div>

          <p className="text-primary font-medium">
            {searchQuery
              ? `No results for "${searchQuery}"`
              : 'No knowledge stored yet'}
          </p>

          <p className="text-secondary text-sm mt-2">
            {searchQuery
              ? 'Try a different query.'
              : 'Start chatting to build the knowledge base!'}
          </p>

          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                fetchKnowledge(1)
              }}
              className="mt-4 text-sm text-accent hover:opacity-75 transition-colors"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <AnimatePresence mode="popLayout">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <KnowledgeCard
                    key={item.id}
                    item={item}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </AnimatePresence>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-6 mt-4 border-t border-glass">
              <button
                onClick={() => fetchKnowledge(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={16} />
                Prev
              </button>

              <span className="text-sm text-secondary">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => fetchKnowledge(page + 1)}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default KnowledgeBase
