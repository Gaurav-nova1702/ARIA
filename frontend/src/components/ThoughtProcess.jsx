
import React, { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Brain,
  Globe,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'

const iconMap = {
  target: <Target className="w-3.5 h-3.5 text-blue-400" />,
  brain: <Brain className="w-3.5 h-3.5 text-gold-400" />,
  globe: <Globe className="w-3.5 h-3.5 text-emerald-400" />,
  'shield-check': <ShieldCheck className="w-3.5 h-3.5 text-gold-300" />,
  sparkles: <Sparkles className="w-3.5 h-3.5 text-gold-400" />,
}

export default function ThoughtProcess({ thoughts, latencyMs }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!thoughts || thoughts.length === 0) return null

  return (
    <div className="mb-2 rounded-xl glass border border-gold-400/20 overflow-hidden text-xs w-full transition-all shadow-inner">

      {/* Header / Expand Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full px-3 py-2 flex items-center justify-between text-[var(--text-secondary)] hover:text-gold-400 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-gold-400 animate-pulse" />

          <span className="font-display font-medium text-xs text-[var(--text-primary)]">
            Agent Reasoning
          </span>

          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-400/10 text-gold-400 border border-gold-400/20">
            {thoughts.length} steps · {latencyMs ? `${latencyMs}ms` : 'instant'}
          </span>
        </div>

        {isOpen ? (
          <ChevronUp size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      {/* Reasoning Steps */}
      {isOpen && (
        <div className="px-3.5 py-2.5 space-y-2 border-t border-[var(--glass-border)] bg-navy-950/40">
          {thoughts.map((step, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2.5 text-xs"
            >
              <div className="mt-0.5 p-1 rounded glass border border-gold-400/20">
                {iconMap[step.icon] || (
                  <Sparkles className="w-3.5 h-3.5 text-gold-400" />
                )}
              </div>

              <div className="flex-1">
                <span className="font-body font-semibold text-gold-400">
                  {step.stage}:
                </span>{' '}

                <span className="text-[var(--text-primary)] font-body opacity-90">
                  {step.detail}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
