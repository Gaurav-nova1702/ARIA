
import React, { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import supabase from '../lib/supabase'
import api from '../api/client'
import { motion } from 'framer-motion'
import {
  MessageSquare,
  Search,
  BookOpen,
  BarChart2,
  PlusCircle,
  Volume2,
  VolumeX,
  X,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import useAgentStore from '../store/agentStore'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  { id: 'chat', label: 'Consult', icon: MessageSquare, desc: 'Interactive session' },
  { id: 'research', label: 'Deep Research', icon: Search, desc: 'Web & citations' },
  { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen, desc: 'Retrieved memories' },
  { id: 'metrics', label: 'Analytics', icon: BarChart2, desc: 'Performance & learning' },
]

export default function Sidebar({ onClose }) {
  const {
    activePanel,
    setActivePanel,
    sessionId,
    clearSession,
    switchSession,
    voiceEnabled,
    toggleVoice,
    theme,
    toggleTheme,
  } = useAgentStore()

  const [sessions, setSessions] = useState([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    api.get('/chat/sessions')
      .then((data) => setSessions(data.sessions || []))
      .catch(() => {})
  }, [sessionId])

  const handleNewChat = () => {
    // Create a new session without deleting previous conversations
    clearSession()

    setActivePanel('chat')

    toast.success('New session initialized')

    onClose?.()
  }

  const handleNav = (id) => {
    setActivePanel(id)
    onClose?.()
  }

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()

      if (error) throw error

      window.location.replace('/login/')
    } catch (error) {
      console.error('Logout failed:', error)
      toast.error('Unable to log out. Please try again.')
    }
  }

  const showLabels = !collapsed || Boolean(onClose)

  return (
    <motion.div
      animate={{ width: showLabels ? 256 : 72 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col h-full glass !rounded-none shrink-0 border-r-0 overflow-hidden"
    >
      
      {/* Brand Header */}
      <div
        className={`min-h-[82px] px-3 py-5 border-b border-[var(--glass-border)] flex items-center ${
          showLabels ? 'justify-between' : 'justify-center'
        }`}
      >
        {/* ARIA Branding */}
        <div
          className={`flex items-center ${
            showLabels ? 'w-full justify-center' : 'justify-center'
          }`}
        >
          {/* Collapsed sidebar: Logo only */}
          {!showLabels && (
            <img
              src="/images/gemini-svg.svg"
              alt="ARIA Logo"
              className="w-10 h-10 object-contain aria-chat-logo"
            />
          )}

          {/* Expanded sidebar: ARIA wordmark and subtitle only */}
          {showLabels && (
            <div className="w-full flex flex-col items-center justify-center min-w-0">
              <img
                src="/images/gemini-svg-2.svg"
                alt="ARIA"
                className="w-full max-w-[210px] h-auto object-contain aria-wordmark"
              />

              <p className="font-elegant italic text-[var(--text-secondary)] text-[10px] mt-1 tracking-wider whitespace-nowrap text-center">
                Adaptive Reasoning & Intelligent Agent - G 
              </p>
            </div>
          )}
        </div>

        {/* Mobile Sidebar Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="text-slate-400 hover:text-gold-400 lg:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>


      {/* Collapse / Expand */}
      {!onClose && (
        <div className={`px-3 pt-3 flex ${showLabels ? 'justify-end' : 'justify-center'}`}>
          <button
            onClick={() => setCollapsed((previous) => !previous)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-gold-400 hover:bg-[var(--glow-color)] transition-colors"
          >
            {collapsed
              ? <PanelLeftOpen size={18} />
              : <PanelLeftClose size={18} />}
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto scrollbar-hide">
        {NAV_ITEMS.map(({ id, label, icon: Icon, desc }) => {
          const isActive = activePanel === id

          return (
            <button
              key={id}
              onClick={() => handleNav(id)}
              title={!showLabels ? label : undefined}
              aria-label={label}
              className={`relative w-full flex items-center ${
                showLabels ? 'gap-3 px-3' : 'justify-center px-2'
              } py-3 rounded-xl text-left transition-all duration-300 group ${
                isActive
                  ? 'border-l-2 border-gold-400 text-gold-400 bg-[var(--glow-color)] shadow-sm'
                  : 'text-[var(--text-primary)] hover:text-gold-400 hover:bg-[var(--glow-color)]'
              }`}
            >
              <Icon
                size={18}
                className={`shrink-0 ${
                  isActive
                    ? 'text-gold-400'
                    : 'text-[var(--text-secondary)] group-hover:text-gold-400 transition-colors'
                }`}
              />

              {showLabels && (
                <div className="min-w-0">
                  <p className="text-sm font-body font-medium leading-none whitespace-nowrap">
                    {label}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 truncate font-elegant">
                    {desc}
                  </p>
                </div>
              )}

              {isActive && showLabels && (
                <motion.div
                  layoutId="sidebar-active-dot"
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-gold-400 shadow-[0_0_8px_#f0cb79]"
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* Past Chat Sessions */}
      {sessions.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--glass-border)]">
          {showLabels ? (
            <>
              <p className="px-3 text-[10px] font-display font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">
                Archived Dialogues
              </p>

              <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-hide">
                {sessions.map((s) => (
                  <button
                    key={s.session_id}
                    onClick={() => {
                      switchSession(s.session_id)
                      setActivePanel('chat')
                      onClose?.()
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs truncate transition-all duration-200 ${
                      s.session_id === sessionId
                        ? 'bg-[var(--glow-color)] text-gold-400 font-medium'
                        : 'text-[var(--text-primary)] hover:text-gold-400 hover:bg-[var(--glow-color)]'
                    }`}
                  >
                    💬 {s.last_message || `Session ${s.session_id.slice(0, 8)}`}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button
              onClick={() => setActivePanel('chat')}
              title="Archived Dialogues"
              aria-label="Archived Dialogues"
              className="w-full flex justify-center py-2 text-[var(--text-secondary)] hover:text-gold-400"
            >
              <MessageSquare size={18} />
            </button>
          )}
        </div>
      )}

      {/* Bottom Actions */}
      <div className="px-3 py-4 border-t border-[var(--glass-border)] space-y-2.5">

        {/* Voice Toggle */}
        <div className={`flex items-center ${
          showLabels ? 'justify-between px-3' : 'justify-center'
        } py-2 rounded-xl hover:bg-[var(--glow-color)] transition-colors`}>
          {showLabels && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              {voiceEnabled ? (
                <Volume2 size={16} className="text-gold-400" />
              ) : (
                <VolumeX size={16} className="text-[var(--text-secondary)]" />
              )}
              <span className="font-body text-xs whitespace-nowrap">
                Vocal Synthesis
              </span>
            </div>
          )}

          <button
            onClick={toggleVoice}
            title={`Voice ${voiceEnabled ? 'on' : 'off'}`}
            aria-label={`Turn voice ${voiceEnabled ? 'off' : 'on'}`}
            className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
              voiceEnabled ? 'bg-gold-400' : 'bg-bronze-500'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-navy-950 shadow transition-transform ${
                voiceEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className={`w-full flex items-center ${
            showLabels ? 'gap-2 px-3' : 'justify-center'
          } py-2 rounded-xl text-[var(--text-primary)] hover:text-gold-400 hover:bg-[var(--glow-color)] text-xs font-body transition-colors`}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}

          {showLabels && (
            <span className="whitespace-nowrap">
              {theme === 'dark'
                ? 'Switch to Light Theme'
                : 'Switch to Dark Theme'}
            </span>
          )}
        </button>


        {/* Logout Button */}
        <button
          onClick={handleLogout}
          title="Logout"
          aria-label="Logout"
          className={`w-full flex items-center ${
            showLabels ? 'gap-2 px-3' : 'justify-center'
          } py-2.5 rounded-xl text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 text-xs font-body transition-colors`}
        >
          <LogOut size={17} className="shrink-0" />

          {showLabels && (
            <span className="whitespace-nowrap">
              Logout
            </span>
          )}
        </button>


        {/* New Session Button */}
        <button
          onClick={handleNewChat}
          title={!showLabels ? 'New Session' : undefined}
          className={`w-full flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl border border-gold-400/40 text-gold-400 hover:bg-gold-400 hover:text-navy-950 text-xs font-display font-semibold tracking-wider uppercase transition-all duration-300 hover:shadow-gold-sm`}
        >
          <PlusCircle size={16} className="shrink-0" />
          {showLabels && <span>New Session</span>}
        </button>

        {/* Version */}
        {showLabels && (
          <div className="text-center pt-1">
            <span className="text-xs text-[var(--text-secondary)] bg-[var(--glow-color)] px-2 py-1 rounded-full">
              v1.0.0
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
