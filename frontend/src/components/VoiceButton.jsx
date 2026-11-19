import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff } from 'lucide-react'
import useVoice from '../hooks/useVoice'
import useChat from '../hooks/useChat'

const VoiceButton = () => {
  const { isListening, startListening, stopListening, isSupported } = useVoice()
  const { sendMessage } = useChat()

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 px-3 py-2 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <MicOff size={14} />
        <span>Voice not supported in this browser</span>
      </div>
    )
  }

  const handleToggle = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening((transcript) => {
        sendMessage(transcript)
      })
    }
  }

  return (
    <div className="relative flex items-center justify-center">
      {/* Pulsing ring when listening */}
      <AnimatePresence>
        {isListening && (
          <>
            <motion.span
              key="ring1"
              className="absolute inline-flex rounded-full bg-red-400 opacity-30"
              initial={{ width: 40, height: 40, opacity: 0.4 }}
              animate={{ width: 70, height: 70, opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.span
              key="ring2"
              className="absolute inline-flex rounded-full bg-red-400 opacity-20"
              initial={{ width: 40, height: 40, opacity: 0.3 }}
              animate={{ width: 90, height: 90, opacity: 0 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
            />
          </>
        )}
      </AnimatePresence>

      <button
        onClick={handleToggle}
        className={`relative z-10 flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
          isListening
            ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
            : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 hover:text-indigo-300'
        }`}
      >
        {isListening ? (
          <>
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              <MicOff size={16} />
            </motion.span>
            <span>Listening...</span>
          </>
        ) : (
          <>
            <Mic size={16} />
            <span>Voice Input</span>
          </>
        )}
      </button>
    </div>
  )
}

export default VoiceButton
