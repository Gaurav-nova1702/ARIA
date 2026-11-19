
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { getHistory } from '../api/client'

// Each authenticated Supabase account has its own session key.
const sessionKeyForUser = (userId) =>
  `aria_session_${userId}`

const getStoredSessionId = (userId) => {
  if (!userId) return null

  const key = sessionKeyForUser(userId)
  const stored = localStorage.getItem(key)

  if (stored) return stored

  const newId = uuidv4()
  localStorage.setItem(key, newId)
  return newId
}

// Tracks changes to the authenticated account or selected session.
// This prevents old history requests from restoring stale messages.
let sessionGeneration = 0

const useAgentStore = create((set, get) => ({
  // Authentication and session
  userId: null,
  sessionId: null,
  sessionGeneration: 0,

  // Chat messages
  messages: [],

  // UI State
  activePanel: 'chat',
  isLoading: false,
  isListening: false,
  isSpeaking: false,

  // Feature toggles
  voiceEnabled: false,
  searchWeb: false,

  // Dark / Light Theme
  theme: localStorage.getItem('neuralmind_theme') || 'dark',

  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark'

    localStorage.setItem('neuralmind_theme', newTheme)

    document.documentElement.classList.toggle(
      'dark',
      newTheme === 'dark'
    )

    document.documentElement.classList.toggle(
      'light',
      newTheme === 'light'
    )

    set({ theme: newTheme })
  },

  // Bind the verified Supabase account to its own session.
  // This must be called by the authentication flow in App.jsx.
  bindUser: (userId) => {
    const nextUserId = userId || null

    if (get().userId === nextUserId) return

    sessionGeneration += 1
    set({ sessionGeneration })

    if (!nextUserId) {
      set({
        userId: null,
        sessionId: null,
        messages: [],
        activePanel: 'chat',
        isLoading: false,
        isListening: false,
        isSpeaking: false,
      })
      return
    }

    const sessionId = getStoredSessionId(nextUserId)

    set({
      userId: nextUserId,
      sessionId,
      messages: [],
      activePanel: 'chat',
      isLoading: false,
      isListening: false,
      isSpeaking: false,
    })
  },

  // Actions
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          sources: [],
          ...message,
        },
      ],
    })),

  // Existing streaming message functionality preserved
  updateLastMessage: (updates) =>
    set((state) => {
      const messages = [...state.messages]

      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          ...updates,
        }
      }

      return { messages }
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setActivePanel: (panel) => set({ activePanel: panel }),

  setListening: (isListening) => set({ isListening }),

  setSpeaking: (isSpeaking) => set({ isSpeaking }),

  toggleVoice: () =>
    set((state) => ({
      voiceEnabled: !state.voiceEnabled,
    })),

  toggleSearchWeb: () =>
    set((state) => ({
      searchWeb: !state.searchWeb,
    })),

  // New chat: never delete previous conversations.
  clearSession: () => {
    const { userId } = get()

    if (!userId) return

    sessionGeneration += 1
    set({ sessionGeneration })

    const newId = uuidv4()

    localStorage.setItem(
      sessionKeyForUser(userId),
      newId
    )

    set({
      sessionId: newId,
      messages: [],
      isLoading: false,
    })
  },

  setMessages: (messages) => set({ messages }),

  // Restore an archived session belonging to the current user.
  switchSession: async (newSessionId) => {
    if (!newSessionId) return

    const userId = get().userId
    if (!userId) return

    sessionGeneration += 1
    set({ sessionGeneration })
    const currentGeneration = sessionGeneration

    localStorage.setItem(
      sessionKeyForUser(userId),
      newSessionId
    )

    set({
      sessionId: newSessionId,
      messages: [],
      isLoading: true,
    })

    const isCurrentSession = () =>
      sessionGeneration === currentGeneration &&
      get().userId === userId &&
      get().sessionId === newSessionId

    try {
      const response = await getHistory(newSessionId)

      if (!isCurrentSession()) return

      // Support an array or existing API response wrappers.
      const history = Array.isArray(response)
        ? response
        : response.history ||
          response.messages ||
          response.conversations ||
          []

      const restoredMessages = history.flatMap((item) => {
        // Backends returning separate user/assistant messages.
        if (item.role && (item.content || item.message)) {
          return [{
            id: item.id || uuidv4(),
            role: item.role,
            content: item.content || item.message,
            timestamp: item.timestamp,
            sources: item.sources || [],
            conversationId:
              item.conversation_id ||
              item.conversationId ||
              null,
            thoughts: item.thoughts || [],
          }]
        }

        // ARIA conversations containing both messages.
        if (
          item.user_message !== undefined ||
          item.ai_response !== undefined
        ) {
          const messages = []

          if (item.user_message) {
            messages.push({
              id: uuidv4(),
              role: 'user',
              content: item.user_message,
              timestamp: item.timestamp,
              sources: [],
            })
          }

          if (item.ai_response) {
            messages.push({
              id: uuidv4(),
              role: 'assistant',
              content: item.ai_response,
              timestamp: item.timestamp,
              sources: item.sources || [],
              conversationId:
                item.conversation_id ||
                item.id ||
                null,
              thoughts: item.thoughts || [],
            })
          }

          return messages
        }

        return []
      })

      if (isCurrentSession()) {
        set({
          messages: restoredMessages,
          isLoading: false,
        })
      }
    } catch (error) {
      console.error('Failed to restore chat history:', error)

      if (isCurrentSession()) {
        set({
          messages: [],
          isLoading: false,
        })
      }
    }
  },
}))

export default useAgentStore
