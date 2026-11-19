
import React, { useState, useRef, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Send, Globe, Mic, MicOff, Download, UploadCloud } from 'lucide-react'
import { uploadDocument } from '../api/client'
import toast from 'react-hot-toast'
import useAgentStore from '../store/agentStore'
import useChat from '../hooks/useChat'
import useVoice from '../hooks/useVoice'
import MessageBubble from './MessageBubble'

// -----------------------------------------------------------------------------
// Loading Animation
// -----------------------------------------------------------------------------

const LoadingDots = () => (
  <div className="flex items-center gap-1 px-4 py-3">
    <div className="w-8 h-8 rounded-full glass border border-gold-400/30 flex items-center justify-center text-sm mr-2 shrink-0">
      <div className="aria-logo-emboss">
        <img
          src="/images/gemini-svg.svg"
          alt="ARIA"
          className="aria-chat-logo w-20 h-20 object-contain"
        />
      </div>
    </div>

    <div className="flex items-center gap-1 glass rounded-2xl rounded-tl-sm px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 bg-gold-400 rounded-full inline-block"
          style={{
            animation: 'bounce-dots 1.4s infinite ease-in-out both',
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  </div>
)

// -----------------------------------------------------------------------------
// Empty Chat Screen
// -----------------------------------------------------------------------------

const EmptyState = () => {
  const { sendMessage } = useChat()

  const suggestions = [
    'Explain quantum computing fundamentals',
    'Draft a high-frequency trading strategy',
    'Explore modern neural architectures',
    'Synthesize current AI agent breakthroughs',
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
      <div className="text-6xl mb-4 select-none drop-shadow-[0_0_20px_rgba(240,203,121,0.25)]">
        <img
        src="/images/gemini-svg.svg"
        alt="ARIA Logo"
        className="w-20 h-20 object-contain mx-auto aria-chat-logo"
      />
      </div>

      <h2 className="font-display text-3xl font-extrabold text-gradient-gold mb-2 tracking-tight">
        What shall we explore?
      </h2>

      <p className="font-elegant italic text-[var(--text-secondary)] max-w-sm text-base leading-relaxed">
        I retain previous dialogues and refine responses with every interaction.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => sendMessage(suggestion)}
            className="text-left px-4 py-3 rounded-xl glass hover:border-gold-400/50 text-[var(--text-primary)] font-body text-xs transition-all duration-300 hover:text-gold-400 hover:-translate-y-0.5"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main Chat Window
// -----------------------------------------------------------------------------

export default function ChatWindow() {
  const {
    messages,
    isLoading,
    searchWeb,
    toggleSearchWeb,
    voiceEnabled,
  } = useAgentStore()

  const { sendMessage } = useChat()

  const {
    isListening,
    startListening,
    stopListening,
    isSupported,
  } = useVoice()

  const [input, setInput] = useState('')

  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  // ---------------------------------------------------------------------------
  // Export conversation as academic Markdown report
  // ---------------------------------------------------------------------------

  const handleExportReport = () => {
    if (messages.length === 0) {
      toast.error('No conversation to export')
      return
    }

    let report = `# 🎓 Academic Research & Interaction Report\n\n`

    report += `**System:** ARIA - Adaptive Reasoning & Intelligent Agent\n`
    report += `**Date:** ${new Date().toLocaleString()}\n`
    report += `**Total Exchanges:** ${messages.length}\n\n---\n\n`

    messages.forEach((m) => {
      const timestamp = m.timestamp
        ? new Date(m.timestamp).toLocaleTimeString()
        : 'Time unavailable'

      report += `### ${m.role === 'user' ? '👤 User Query' : '𝓐 ARIA Response'} [${timestamp}]\n\n`
      report += `${m.content}\n\n`

      if (m.sources && m.sources.length > 0) {
        report += `**References / Citations:**\n`

        m.sources.forEach((s) => {
          report += `- [${s.title || s.url}](${s.url})\n`
        })

        report += `\n`
      }

      report += `---\n\n`
    })

    const blob = new Blob([report], {
      type: 'text/markdown;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url
    a.download = `aria-academic-report-${Date.now()}.md`
    a.click()

    URL.revokeObjectURL(url)

    toast.success('Academic Report exported as Markdown!')
  }

  // ---------------------------------------------------------------------------
  // Upload document into Knowledge Base
  // -----------------------------------------------------------------------------

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]

    if (!file) return

    const toastId = toast.loading(
      `Ingesting ${file.name} into Knowledge Base...`
    )

    try {
      const res = await uploadDocument(file)

      if (res.success) {
        toast.success(
          `Ingested ${res.total_chunks} chunks into Knowledge Base!`,
          { id: toastId }
        )
      } else {
        toast.error(
          res.error || 'Failed to ingest document',
          { id: toastId }
        )
      }
    } catch (err) {
      toast.error(
        err.message || 'Upload failed',
        { id: toastId }
      )
    }

    e.target.value = ''
  }

  // ---------------------------------------------------------------------------
  // Auto-scroll when messages arrive
  // ---------------------------------------------------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages, isLoading])

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const handleSend = () => {
    if (!input.trim() || isLoading) return

    sendMessage(input)

    setInput('')

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ---------------------------------------------------------------------------
  // Voice input
  // ---------------------------------------------------------------------------

  const handleVoiceToggle = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening((transcript) => {
        // Show recognized speech in the input box only.
        setInput(transcript)

        // Focus the input so the user can edit or send it.
        requestAnimationFrame(() => {
          textareaRef.current?.focus()
        })
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Textarea auto-resize
  // ---------------------------------------------------------------------------

  const handleTextareaChange = (e) => {
    setInput(e.target.value)

    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">

      {/* Scrollable Messages */}

      <div className="flex-1 overflow-y-auto scrollbar-hide px-2">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-3xl mx-auto py-6 space-y-2">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                />
              ))}
            </AnimatePresence>

            {isLoading && <LoadingDots />}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}

      <div className="bg-[var(--bg-primary)]/80 backdrop-blur-md p-3.5">

        <div className="max-w-3xl mx-auto">

          {/* Controls Bar */}

          <div className="flex items-center justify-between mb-2 px-1">

            {/* Web Intelligence Toggle */}

            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={toggleSearchWeb}
                role="switch"
                aria-checked={searchWeb}
                className={`relative w-8 h-4 rounded-full transition-colors ${
                  searchWeb ? 'bg-gold-400' : 'bg-bronze-500'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-navy-950 shadow transition-transform ${
                    searchWeb ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>

              <Globe
                size={13}
                className={
                  searchWeb
                    ? 'text-gold-400'
                    : 'text-[var(--text-secondary)]'
                }
              />

              <span
                className={`text-xs font-body ${
                  searchWeb
                    ? 'text-gold-400'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Web Intelligence
              </span>
            </label>

            {/* Export Report */}

            {messages.length > 0 && (
              <button
                onClick={handleExportReport}
                title="Download conversation as an academic report"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass text-xs text-gold-400 hover:border-gold-400/40 transition-colors"
              >
                <Download size={12} />
                <span className="font-body">Export Report</span>
              </button>
            )}
          </div>

          {/* Message Input Container */}

          <div className="flex items-end gap-2.5 glass rounded-2xl px-4 py-2.5 focus-within:border-gold-400/60 transition-all">

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything or request research..."
              rows={1}
              className="flex-1 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] font-body resize-none outline-none text-sm leading-relaxed"
              style={{ maxHeight: '160px' }}
              disabled={isLoading}
            />

            <div className="flex items-center gap-1.5 shrink-0">

              {/* Document Upload */}

              <label
                className="p-2 rounded-xl glass text-[var(--text-secondary)] hover:text-gold-400 cursor-pointer transition-colors"
                title="Upload PDF, TXT or Markdown file"
              >
                <UploadCloud size={17} />

                <input
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isLoading}
                />
              </label>

              {/* Voice Input */}

              {isSupported && voiceEnabled && (
                <button
                  onClick={handleVoiceToggle}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                  className={`p-2 rounded-xl transition-colors ${
                    isListening
                      ? 'bg-red-500/20 text-red-400'
                      : 'glass text-gold-400 hover:border-gold-400/40'
                  }`}
                >
                  {isListening ? (
                    <MicOff size={17} />
                  ) : (
                    <Mic size={17} />
                  )}
                </button>
              )}

              {/* Send Message */}

              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                title="Send message (Enter)"
                className="p-2 rounded-xl bg-gold-400 hover:bg-gold-300 disabled:opacity-40 text-navy-950 transition-all font-semibold disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </div>
          </div>

          <p className="text-center text-[var(--text-secondary)] opacity-70 text-xs mt-2">
            Press{' '}
            <kbd className="px-1 py-0.5 rounded glass text-gold-400 font-mono text-xs">
              Enter
            </kbd>{' '}
            to send,{' '}
            <kbd className="px-1 py-0.5 rounded glass text-gold-400 font-mono text-xs">
              Shift+Enter
            </kbd>{' '}
            for newline
          </p>

        </div>
      </div>
    </div>
  )
}
