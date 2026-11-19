
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('neuralmind_theme') || 'dark'

document.documentElement.classList.remove('dark', 'light')
document.documentElement.classList.add(savedTheme)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />

    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#0f1724',
          color: '#d8d4ce',
          border: '1px solid rgba(240,203,121,0.15)',
          borderRadius: '12px',
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: '13px',
        },
        success: {
          iconTheme: {
            primary: '#6366f1',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
        },
      }}
    />
  </React.StrictMode>,
)
