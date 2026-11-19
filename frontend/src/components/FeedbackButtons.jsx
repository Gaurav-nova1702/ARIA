import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThumbsUp, ThumbsDown, Star, MessageSquare, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { submitFeedback } from '../api/client'

const FeedbackButtons = ({ conversationId }) => {
  const [submitted, setSubmitted] = useState(false)
  const [vote, setVote] = useState(null) // 'up' | 'down'
  const [stars, setStars] = useState(0)
  const [hoverStar, setHoverStar] = useState(0)
  const [showComment, setShowComment] = useState(false)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!conversationId) return null

  const handleSubmit = async () => {
    if (!vote && !stars) return

    // Map vote to rating if stars not set
    const rating = stars || (vote === 'up' ? 5 : 1)

    setIsSubmitting(true)
    try {
      await submitFeedback(conversationId, rating, comment)
      setSubmitted(true)
      toast.success('Thanks for the feedback! 🙏')
    } catch {
      toast.error('Could not save feedback. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-1.5 mt-2 text-xs text-emerald-400"
      >
        <Check size={12} />
        <span>Feedback recorded</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="mt-2"
    >
      <div className="flex items-center gap-2 flex-wrap">
        {/* Thumbs */}
        <button
          onClick={() => setVote(vote === 'up' ? null : 'up')}
          className={`p-1.5 rounded-lg transition-all duration-150 ${
            vote === 'up'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'
          }`}
          title="Good response"
        >
          <ThumbsUp size={12} />
        </button>

        <button
          onClick={() => setVote(vote === 'down' ? null : 'down')}
          className={`p-1.5 rounded-lg transition-all duration-150 ${
            vote === 'down'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
          }`}
          title="Bad response"
        >
          <ThumbsDown size={12} />
        </button>

        {/* Stars */}
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => setStars(s === stars ? 0 : s)}
              onMouseEnter={() => setHoverStar(s)}
              onMouseLeave={() => setHoverStar(0)}
              className="transition-colors duration-100"
            >
              <Star
                size={12}
                className={
                  s <= (hoverStar || stars)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-600 hover:text-amber-400'
                }
              />
            </button>
          ))}
        </div>

        {/* Comment toggle */}
        <button
          onClick={() => setShowComment(!showComment)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all duration-150"
          title="Add comment"
        >
          <MessageSquare size={12} />
        </button>

        {/* Submit */}
        {(vote || stars > 0) && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="text-xs px-2 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors duration-150 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Send'}
          </motion.button>
        )}
      </div>

      {/* Comment box */}
      <AnimatePresence>
        {showComment && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 overflow-hidden"
          >
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What could be improved? (optional)"
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/60 resize-none"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default FeedbackButtons
