'use client'
import { useState, useEffect } from 'react'

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState(0) // 0=enter, 1=letters, 2=subtitle, 3=exit

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200)
    const t2 = setTimeout(() => setPhase(2), 1200)
    const t3 = setTimeout(() => setPhase(3), 2800)
    const t4 = setTimeout(() => onFinish(), 3600)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [onFinish])

  const title = 'LETTER BUILDER'

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 transition-opacity duration-700 ${phase >= 3 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      {/* Animated background grid */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(99,102,241,0.08) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />
        {/* Glow orbs */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full transition-all duration-[2000ms] ${phase >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 40%, transparent 70%)' }} />
        <div className={`absolute top-1/3 left-1/3 w-[300px] h-[300px] rounded-full transition-all duration-[2500ms] ${phase >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)' }} />
      </div>

      {/* Envelope icon animation */}
      <div className={`relative mb-8 transition-all duration-700 ${phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className="text-indigo-400">
          <rect x="2" y="4" width="20" height="16" rx="2" className={`transition-all duration-1000 ${phase >= 1 ? 'opacity-100' : 'opacity-0'}`} />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" className={`transition-all duration-1000 delay-300 ${phase >= 1 ? 'opacity-100' : 'opacity-0'}`} />
        </svg>
        {/* Sparkle particles */}
        {phase >= 1 && (
          <>
            <div className="absolute -top-2 -right-2 w-2 h-2 bg-indigo-400 rounded-full animate-ping" />
            <div className="absolute -bottom-1 -left-3 w-1.5 h-1.5 bg-violet-400 rounded-full animate-ping" style={{ animationDelay: '0.3s' }} />
            <div className="absolute top-0 -left-4 w-1 h-1 bg-blue-400 rounded-full animate-ping" style={{ animationDelay: '0.6s' }} />
          </>
        )}
      </div>

      {/* LETTER BUILDER — each letter animates in */}
      <div className="flex gap-[2px] mb-4 overflow-hidden">
        {title.split('').map((char, i) => (
          <span
            key={i}
            className={`text-4xl md:text-5xl font-black tracking-wider transition-all duration-500 ${
              phase >= 1 ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-12 blur-sm'
            } ${char === ' ' ? 'w-4' : ''}`}
            style={{
              transitionDelay: `${i * 50 + 100}ms`,
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: 'none',
            }}
          >
            {char}
          </span>
        ))}
      </div>

      {/* Brain Lead subtitle */}
      <div className={`transition-all duration-700 ${phase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <span className="text-lg md:text-xl font-light tracking-[0.3em] text-zinc-400">
          Brain Lead
        </span>
      </div>

      {/* Tagline */}
      <div className={`mt-6 transition-all duration-700 delay-300 ${phase >= 2 ? 'opacity-100' : 'opacity-0'}`}>
        <span className="text-xs text-zinc-600 tracking-widest uppercase">
          AI-Powered Email Builder
        </span>
      </div>

      {/* Loading bar */}
      <div className={`mt-10 w-48 h-0.5 bg-zinc-800 rounded-full overflow-hidden transition-opacity duration-500 ${phase >= 2 ? 'opacity-100' : 'opacity-0'}`}>
        <div className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 rounded-full animate-loading-bar" />
      </div>

      <style jsx>{`
        @keyframes loading-bar {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
        .animate-loading-bar {
          animation: loading-bar 1.5s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
