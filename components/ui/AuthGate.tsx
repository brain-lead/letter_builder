'use client'
import { useState, useEffect } from 'react'
import { getHWID, loadLicense, saveLicense, clearLicense } from '@/lib/auth'
import { BUY_LICENSE_URL, DEVELOPER_TELEGRAM, APP_VERSION } from '@/lib/app-config'
import { Key, ExternalLink, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'authorized' | 'needsLicense' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [licenseInput, setLicenseInput] = useState('')
  const [checking, setChecking] = useState(false)

  const checkAuth = async (licenseKey?: string) => {
    setChecking(true)
    try {
      const hwid = await getHWID()
      const saved = loadLicense()
      const key = licenseKey || saved?.licenseKey || undefined

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hwid, licenseKey: key, computerUsername: `web_${hwid.substring(0, 12)}` }),
      })
      const data = await res.json()

      if (data.authorized) {
        if (key) saveLicense(key, `licence_braintools_${key}`)
        setStatus('authorized')
        setMessage(data.message)
      } else {
        setStatus('needsLicense')
        setMessage(data.message || 'License required')
      }
    } catch (e: any) {
      setStatus('error')
      setMessage(e.message || 'Connection failed')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => { checkAuth() }, [])

  const handleActivate = () => {
    const key = licenseInput.trim().toUpperCase()
    if (!key) return
    checkAuth(key)
  }

  if (status === 'authorized') return <>{children}</>

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950">
      {/* Background grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(99,102,241,0.06) 1px, transparent 0)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl max-w-md w-full mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <span className="font-bold text-white text-lg">LETTER BUILDER</span>
          </div>
          <p className="text-indigo-200 text-xs mt-1">by Brain Lead • v{APP_VERSION}</p>
        </div>

        <div className="px-6 py-5">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-indigo-400" />
              <p className="text-zinc-400 text-sm">Verifying license...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={18} />
                <span className="text-sm font-semibold">Connection Error</span>
              </div>
              <p className="text-zinc-400 text-xs">{message}</p>
              <button onClick={() => checkAuth()} disabled={checking}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg font-medium disabled:opacity-50">
                {checking ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          )}

          {status === 'needsLicense' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-amber-400" />
                <span className="text-zinc-200 text-sm font-semibold">License Required</span>
              </div>

              {message && (
                <p className="text-zinc-500 text-xs bg-zinc-800 rounded-lg px-3 py-2">{message}</p>
              )}

              <div>
                <label className="text-zinc-400 text-xs block mb-1">License Key</label>
                <input
                  type="text"
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="w-full bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2.5 border border-zinc-600 font-mono tracking-wider placeholder:text-zinc-600"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleActivate() }}
                  autoFocus
                />
              </div>

              <button onClick={handleActivate} disabled={checking || !licenseInput.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm rounded-lg font-medium flex items-center justify-center gap-2">
                {checking ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                {checking ? 'Verifying...' : 'Activate License'}
              </button>

              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <a href="https://t.me/brain_lead" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-indigo-400 hover:text-indigo-300 text-xs font-medium">
                  <ExternalLink size={11} /> Purchase a license (@brain_lead)
                </a>
                <a href={`https://t.me/${DEVELOPER_TELEGRAM.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-zinc-500 hover:text-zinc-400 text-xs">
                  Contact: {DEVELOPER_TELEGRAM}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
