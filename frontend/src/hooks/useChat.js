
import { useCallback } from 'react'
import toast from 'react-hot-toast'
import useAgentStore from '../store/agentStore'
import { sendMessage as sendMessageApi } from '../api/client'
import useVoice from './useVoice'

const useChat = () => {
  const {
    sessionId,
    addMessage,
    setLoading,
    isLoading,
    voiceEnabled,
    searchWeb,
  } = useAgentStore()

  const { speak } = useVoice()

  const sendMessage = useCallback(
    async (text) => {
      if (!text || !text.trim() || isLoading) return

      // Capture the account and chat session before sending.
      const initialState = useAgentStore.getState()
      const requestUserId = initialState.userId
      const requestSessionId = initialState.sessionId
      const requestGeneration = initialState.sessionGeneration

      // Never submit a chat without an authenticated user.
      if (!requestUserId || !requestSessionId) {
        toast.error('Please sign in to continue.')
        return
      }

      // Ensure this response still belongs to the active account
      // and session before updating the interface.
      const isCurrentRequest = () => {
        const currentState = useAgentStore.getState()

        return (
          currentState.userId === requestUserId &&
          currentState.sessionId === requestSessionId&&
          currentState.sessionGeneration === requestGeneration
        )
      }

      const userMessage = {
        role: 'user',
        content: text.trim(),
      }

      addMessage(userMessage)
      setLoading(true)

      try {
        const response = await sendMessageApi(
          requestSessionId,
          text.trim(),
          searchWeb
        )

        // Ignore responses belonging to a previous user/session.
        if (!isCurrentRequest()) return

        const aiMessage = {
          role: 'assistant',
          content:
            response.response ||
            response.message ||
            'I could not generate a response.',
          sources: response.sources || [],
          conversationId:
            response.conversation_id ||
            response.id ||
            null,
          thoughts: response.thoughts || [],
          latency_ms: response.latency_ms || null,
        }

        addMessage(aiMessage)

        if (voiceEnabled && aiMessage.content) {
          speak(aiMessage.content)
        }
      } catch (err) {
        // Do not display an old request's error to another user.
        if (!isCurrentRequest()) return

        const errorMessage =
          err.message ||
          'Failed to reach the AI agent. Please try again.'

        toast.error(errorMessage)

        addMessage({
          role: 'assistant',
          content: `⚠️ **Error:** ${errorMessage}`,
          sources: [],
        })
      } finally {
        // Never clear another account/session's loading state.
        if (isCurrentRequest()) {
          setLoading(false)
        }
      }
    },
    [
      sessionId,
      addMessage,
      setLoading,
      isLoading,
      voiceEnabled,
      searchWeb,
      speak,
    ]
  )

  return { sendMessage, isLoading }
}

export default useChat
