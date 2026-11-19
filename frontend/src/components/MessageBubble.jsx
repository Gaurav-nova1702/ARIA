
import React from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ExternalLink } from 'lucide-react'
import FeedbackButtons from './FeedbackButtons'
import ThoughtProcess from './ThoughtProcess'

const formatTimestamp = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '')

  return !inline && match ? (
    <SyntaxHighlighter
      style={vscDarkPlus}
      language={match[1]}
      PreTag="div"
      customStyle={{
        borderRadius: '10px',
        margin: '12px 0',
        fontSize: '12px',
        background: '#090e18',
        border: '1px solid rgba(240,203,121,0.15)',
      }}
      {...props}
    >
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  ) : (
    <code
      className="bg-navy-900 text-gold-300 px-1.5 py-0.5 rounded text-xs font-mono"
      {...props}
    >
      {children}
    </code>
  )
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`flex items-start gap-3 group my-2 ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* ARIA Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-transparent shrink-0">
          <img
            src="/images/gemini-svg.svg"
            alt="ARIA"
            className="w-7 h-7 object-contain"
          />
        </div>
      )}

      <div
        className={`flex flex-col max-w-[85%] ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Thought Process (XAI) */}
        {!isUser && message.thoughts && message.thoughts.length > 0 && (
          <div className="w-full">
            <ThoughtProcess
              thoughts={message.thoughts}
              latencyMs={message.latency_ms}
            />
          </div>
        )}

        {/* Message Content Bubble */}
        <div
          className={`rounded-2xl px-5 py-3.5 text-sm leading-relaxed transition-all ${
            isUser
              ? 'bg-gradient-to-br from-[#f0cb79] to-[#d4a24d] text-navy-950 font-body font-medium shadow-gold-sm rounded-tr-sm'
              : 'glass text-[var(--text-primary)] rounded-tl-sm border border-[var(--glass-border)]'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="font-elegant text-base leading-relaxed tracking-wide space-y-2">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code: CodeBlock,

                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold-400 hover:text-gold-300 underline underline-offset-4"
                    >
                      {children}
                    </a>
                  ),

                  table: ({ children }) => (
                    <div className="overflow-x-auto my-3">
                      <table className="w-full text-xs border-collapse border border-[var(--glass-border)]">
                        {children}
                      </table>
                    </div>
                  ),

                  th: ({ children }) => (
                    <th className="border border-[var(--glass-border)] px-2 py-1 bg-[var(--glow-color)] text-left font-medium">
                      {children}
                    </th>
                  ),

                  td: ({ children }) => (
                    <td className="border border-[var(--glass-border)] px-2 py-1">
                      {children}
                    </td>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Citations / Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.sources.map((src, i) => (
              <a
                key={i}
                href={src.url || src}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-body text-gold-400 glass px-2.5 py-1 rounded-lg hover:border-gold-400/40 transition-colors"
              >
                <ExternalLink size={10} />
                <span>{src.title || src.url || src}</span>
              </a>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-xs text-[var(--text-secondary)] mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {formatTimestamp(message.timestamp)}
        </span>

        {/* Feedback (AI messages only) */}
        {!isUser && message.conversationId && (
          <FeedbackButtons conversationId={message.conversationId} />
        )}
      </div>
    </motion.div>
  )
}
