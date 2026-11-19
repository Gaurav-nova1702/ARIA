
import { useEffect, useRef } from 'react'

const PARTICLE_COUNT = 7
const SPRING = 0.16
const DAMPING = 0.70
const BASE_SIZE = 3.2
const DPR_LIMIT = 1.5
const SETTLE_THRESHOLD = 0.08

export default function CursorEffect() {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let rafId = null
    let initialized = false
    let visible = !document.hidden

    const mouse = { x: -100, y: -100 }

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: -100,
      y: -100,
      vx: 0,
      vy: 0,
    }))

    const resize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT)

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const scheduleAnimation = () => {
      if (rafId === null && visible) {
        rafId = requestAnimationFrame(animate)
      }
    }

    const handlePointerMove = (event) => {
      mouse.x = event.clientX
      mouse.y = event.clientY

      if (!initialized) {
        particles.forEach((particle) => {
          particle.x = mouse.x
          particle.y = mouse.y
        })

        initialized = true
      }

      scheduleAnimation()
    }

    const animate = () => {
      rafId = null

      if (!visible || !initialized) return

      const width = window.innerWidth
      const height = window.innerHeight

      ctx.clearRect(0, 0, width, height)

      const isLightMode =
        document.documentElement.classList.contains('light')

      const gold = isLightMode
        ? '178, 139, 76'
        : '218, 178, 105'

      let moving = false

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const particle = particles[i]
        const target = i === 0 ? mouse : particles[i - 1]

        const dx = target.x - particle.x
        const dy = target.y - particle.y

        particle.vx = (particle.vx + dx * SPRING) * DAMPING
        particle.vy = (particle.vy + dy * SPRING) * DAMPING

        particle.x += particle.vx
        particle.y += particle.vy

        if (
          Math.abs(dx) > SETTLE_THRESHOLD ||
          Math.abs(dy) > SETTLE_THRESHOLD ||
          Math.abs(particle.vx) > SETTLE_THRESHOLD ||
          Math.abs(particle.vy) > SETTLE_THRESHOLD
        ) {
          moving = true
        }

        const progress = i / PARTICLE_COUNT
        const size = BASE_SIZE * (1 - progress * 0.48)
        const opacity = (isLightMode ? 0.48 : 0.38) *
          (1 - progress * 0.78)

        ctx.beginPath()
        ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2)

        ctx.fillStyle = `rgba(${gold}, ${opacity})`
        ctx.shadowColor = `rgba(${gold}, ${opacity})`
        ctx.shadowBlur = 5

        ctx.fill()
      }

      ctx.shadowBlur = 0

      if (moving) {
        scheduleAnimation()
      } else {
        ctx.clearRect(0, 0, width, height)
      }
    }

    const handleVisibility = () => {
      visible = !document.hidden

      if (!visible && rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      } else if (visible && initialized) {
        scheduleAnimation()
      }
    }

    resize()

    window.addEventListener('resize', resize, { passive: true })

    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    })

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('visibilitychange', handleVisibility)

      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
        zIndex: 50,
        mixBlendMode: 'normal',
      }}
    />
  )
}
