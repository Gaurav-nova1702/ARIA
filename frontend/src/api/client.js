import axios from 'axios'
import supabase from '../lib/supabase'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.error('Unable to retrieve Supabase session:', error.message)
    }

    const token = data?.session?.access_token

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
    } else {
      config.headers.delete('Authorization')
    }

    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred'
    return Promise.reject(new Error(message))
  }
)

// Chat
export const sendMessage = (sessionId, message, searchWeb = false) =>
  api.post('/chat/', { session_id: sessionId, message, search_web: searchWeb })

export const getHistory = (sessionId) =>
  api.get(`/chat/history/${sessionId}`)

export const clearSession = (sessionId) =>
  api.delete(`/chat/session/${sessionId}`)

// Feedback
export const submitFeedback = (conversationId, rating, comment = '') =>
  api.post('/feedback/', { conversation_id: conversationId, rating, comment })

export const getFeedbackMetrics = () =>
  api.get('/feedback/metrics')

export const getFeedbackHistory = () =>
  api.get('/feedback/metrics/history')

// Knowledge Base
export const searchKnowledge = (query) =>
  api.get('/knowledge/search', { params: { query } })

export const getKnowledge = (page = 1, limit = 12) =>
  api.get('/knowledge/', {
    params: {
      limit,
      offset: (page - 1) * limit,
    },
  })

export const deleteKnowledge = (id) =>
  api.delete(`/knowledge/${id}`)

// Research / Web Search
export const searchWebApi = (query) =>
  api.post('/research/search', { query })

// Metrics
export const getMetrics = () =>
  api.get('/metrics')

// Upload Document to Knowledge Base
export const uploadDocument = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/knowledge/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export default api
