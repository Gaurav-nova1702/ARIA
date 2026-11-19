import { useState, useRef, useCallback, useEffect } from 'react'
import useAgentStore from '../store/agentStore'

const useVoice = () => {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const recognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const setStoreListening = useAgentStore((s) => s.setListening)
  const setStoreSpeaking = useAgentStore((s) => s.setSpeaking)

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null

  const isSupported = Boolean(SpeechRecognition && synthRef.current)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
      if (synthRef.current) {
        synthRef.current.cancel()
      }
    }
  }, [])

  const startListening = useCallback(
    (onResult) => {
      if (!SpeechRecognition) return

      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }

      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
        setStoreListening(true)
      }

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        if (onResult && transcript) {
          onResult(transcript)
        }
      }

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
        setStoreListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
        setStoreListening(false)
      }

      recognitionRef.current = recognition
      recognition.start()
    },
    [SpeechRecognition, setStoreListening]
  )

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setStoreListening(false)
  }, [setStoreListening])

  const speak = useCallback(
    (text) => {
      if (!synthRef.current) return

      // Cancel any ongoing speech
      synthRef.current.cancel()

      // Strip markdown for speech
      const cleanText = text
        .replace(/```[\s\S]*?```/g, 'code block')
        .replace(/`[^`]+`/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\s*[-*+]\s/gm, '')
        .replace(/\n+/g, '. ')
        .trim()

      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0

      // Pick a natural voice
      const voices = synthRef.current.getVoices()
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Neural'))
      )
      const fallback = voices.find((v) => v.lang.startsWith('en'))
      if (preferred || fallback) {
        utterance.voice = preferred || fallback
      }

      utterance.onstart = () => {
        setIsSpeaking(true)
        setStoreSpeaking(true)
      }

      utterance.onend = () => {
        setIsSpeaking(false)
        setStoreSpeaking(false)
      }

      utterance.onerror = () => {
        setIsSpeaking(false)
        setStoreSpeaking(false)
      }

      synthRef.current.speak(utterance)
    },
    [setStoreSpeaking]
  )

  const stopSpeaking = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel()
    }
    setIsSpeaking(false)
    setStoreSpeaking(false)
  }, [setStoreSpeaking])

  return {
    isListening,
    isSpeaking,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    isSupported,
  }
}

export default useVoice
