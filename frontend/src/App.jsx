
import React, { useState, useEffect } from 'react'
import supabase from './lib/supabase'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, Sun, Moon } from 'lucide-react'

import CursorEffect from './components/CursorEffect'
import GlowBackground from './components/GlowBackground'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import ResearchPanel from './components/ResearchPanel'
import KnowledgeBase from './components/KnowledgeBase'
import MetricsPanel from './components/MetricsPanel'
import useAgentStore from './store/agentStore'

// Existing panel mapping preserved
const PANELS = {
  chat: ChatWindow,
  research: ResearchPanel,
  knowledge: KnowledgeBase,
  metrics: MetricsPanel,
}

// Existing panel titles preserved
const PANEL_TITLES = {
  chat: 'Chat',
  research: 'Web Research',
  knowledge: 'Knowledge Base',
  metrics: 'Metrics',
}

// New panel animation settings
const panelVariants = {
  initial: {
    opacity: 0,
    y: 15,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
    },
  },
}

const App = () => {
  const activePanel = useAgentStore((s) => s.activePanel)
  const theme = useAgentStore((s) => s.theme)
  const toggleTheme = useAgentStore((s) => s.toggleTheme)
  const userId = useAgentStore((s) => s.userId)
  const bindUser = useAgentStore((s) => s.bindUser)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)

  useEffect(() => {
    let active = true
    console.log('ARIA AUTH GUARD RUNNING')

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        console.log('ARIA SESSION CHECK:', {
          hasSession: !!data?.session,
          error: error?.message
        })

        if (!active) return

        if (error || !data.session?.user || data.session.user.is_anonymous) {
          bindUser(null)
          window.location.replace('/login/')
          return
        }
        bindUser(data.session.user.id)
        setAuthChecking(false)
      } catch (error) {
        console.error('Authentication check failed:', error)
        if (active) window.location.replace('/login/')
      }
    }

    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return

        if (event === 'SIGNED_OUT') {
          bindUser(null)
          setAuthChecking(true)
          window.location.replace('/login/')
          return
        }

        if (event === 'SIGNED_IN') {
          if (!session?.user || session.user.is_anonymous) {
            bindUser(null)
            setAuthChecking(true)
            window.location.replace('/login/')
            return
          }

          bindUser(session.user.id)
          setAuthChecking(false)
        }
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Existing dynamic panel rendering preserved
  const ActiveComponent = PANELS[activePanel] || ChatWindow

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <div className="flex flex-col items-center gap-4">
          <img
            src="/images/gemini-svg.svg"
            alt="ARIA"
            className="w-16 h-16 object-contain"
          />
          <p className="text-sm text-[var(--text-secondary)]">
            Verifying your ARIA session...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div 
      key={userId}
      className="min-h-screen font-body relative overflow-hidden"
    >

      {/* New background effects */}
      <GlowBackground />
      <CursorEffect />

      <div className="flex h-screen overflow-hidden relative z-10">

        {/* Desktop Sidebar */}
        <div className="hidden lg:flex shrink-0 relative z-20">
          <Sidebar />
        </div>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />

              {/* Sidebar drawer */}
              <motion.div
                key="drawer"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{
                  type: 'spring',
                  damping: 25,
                  stiffness: 220,
                }}
                className="fixed inset-y-0 left-0 z-50 lg:hidden"
              >
                <Sidebar onClose={() => setSidebarOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Top Bar - Existing status indicator preserved */}
          <header className="flex items-center gap-3 px-4 py-3 glass shrink-0 !rounded-none border-0">
            {/* Hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-gold-400 hover:bg-white/5 transition-colors"
            >
              <Menu size={20} />
            </button>

            {/* Panel title */}
            <div className="flex items-center gap-2">
              <span className="text-lg select-none lg:hidden">🧠</span>

              <h1 className="text-sm font-semibold text-gradient-gold">
                {PANEL_TITLES[activePanel] || 'ARIA'}
              </h1>
            </div>

            {/* Existing AI status indicator preserved */}
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              <span className="hidden sm:inline">
                AI Agent Online
              </span>
            </div>

            {/* New Dark / Light Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-gold-400 hover:bg-white/5 transition-colors"
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun size={19} />
              ) : (
                <Moon size={19} />
              )}
            </button>

          </header>

          {/* Main Panel */}
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">

            <AnimatePresence mode="wait">
              <motion.div
                key={activePanel}
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex-1 min-h-0"
              >
                <ActiveComponent />
              </motion.div>
            </AnimatePresence>

          </main>

        </div>
      </div>
    </div>
  )
}

export default App
