
import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

export default function GlowBackground() {
  const glowRef = useRef(null)

  useEffect(() => {
    const glow = glowRef.current
    if (!glow) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    let rafId = null
    let visible = !document.hidden

    const target = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }

    const current = { ...target }

    const handlePointerMove = (event) => {
      target.x = event.clientX
      target.y = event.clientY

      glow.style.opacity = '1'

      if (rafId === null && visible) {
        rafId = requestAnimationFrame(animate)
      }
    }

    const animate = () => {
      rafId = null

      if (!visible) return

      current.x += (target.x - current.x) * 0.14
      current.y += (target.y - current.y) * 0.14

      glow.style.transform =
        `translate3d(${current.x - 350}px, ${current.y - 350}px, 0)`

      const distance =
        Math.abs(target.x - current.x) +
        Math.abs(target.y - current.y)

      if (distance > 0.15) {
        rafId = requestAnimationFrame(animate)
      }
    }

    const handleVisibility = () => {
      visible = !document.hidden

      if (!visible && rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      } else if (visible) {
        current.x = target.x
        current.y = target.y
      }
    }

    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    })

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('visibilitychange', handleVisibility)

      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [])

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {/* Cursor-following ambient glow */}
      <div
        ref={glowRef}
        className="absolute top-0 left-0 rounded-full pointer-events-none"
        style={{
          width: 700,
          height: 700,
          opacity: 0,
          willChange: 'transform',
          background: `
            radial-gradient(
              circle,
              var(--glow-color) 0%,
              transparent 68%
            )
          `,
        }}
      />

      {/* Ambient background orb 1 */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 650,
          height: 650,
          top: '-18%',
          left: '-12%',
          background:
            'radial-gradient(circle, rgba(196,154,80,0.09), transparent 70%)',
          filter: 'blur(55px)',
        }}
        animate={{
          x: [0, 45, 15, 0],
          y: [0, 35, 65, 0],
          scale: [1, 1.08, 0.96, 1],
        }}
        transition={{
          duration: 24,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Ambient background orb 2 */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 540,
          height: 540,
          bottom: '-20%',
          right: '-10%',
          background:
            'radial-gradient(circle, rgba(109,147,171,0.10), transparent 70%)',
          filter: 'blur(65px)',
        }}
        animate={{
          x: [0, -40, -15, 0],
          y: [0, -45, -15, 0],
          scale: [1, 0.94, 1.07, 1],
        }}
        transition={{
          duration: 29,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Ambient background orb 3 */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 320,
          height: 320,
          top: '35%',
          left: '42%',
          background:
            'radial-gradient(circle, rgba(196,154,80,0.065), transparent 70%)',
          filter: 'blur(45px)',
        }}
        animate={{
          x: [0, 35, -25, 0],
          y: [0, -30, 25, 0],
        }}
        transition={{
          duration: 21,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  )
}
