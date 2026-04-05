'use client'
import { useState, useEffect } from 'react'
import { AlertTriangle, Key, ExternalLink } from 'lucide-react'

export default function FirstTimePopup() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('lb_terms_seen')
    if (!seen) setShow(true)
  }, [])

  const dismiss = () => {
    localStorage.setItem('lb_terms_seen', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={dismiss}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              ✉ LETTER BUILDER
            </span>
            <span className="text-xs text-zinc-600">by Brain Lead</span>
          </div>
          <p className="text-xs text-zinc-500">AI-powered HTML email builder</p>
        </div>

        {/* API Key Setup */}
        <div className="px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-3">
            <Key size={14} className="text-indigo-400" />
            <span className="text-sm font-semibold text-zinc-200">Setup: Get Your AI API Keys</span>
          </div>
          <p className="text-xs text-zinc-400 mb-3">
            Letter Builder uses AI to edit emails. You need a free API key from at least one provider:
          </p>

          <div className="space-y-3">
            {/* Groq */}
            <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-zinc-200">Groq (Recommended — Free)</span>
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300">
                  Get Key <ExternalLink size={10} />
                </a>
              </div>
              <ol className="text-[11px] text-zinc-400 space-y-0.5 list-decimal list-inside">
                <li>Go to <span className="text-zinc-300">console.groq.com</span> → Sign up (free)</li>
                <li>Click <span className="text-zinc-300">API Keys</span> → Create API Key</li>
                <li>Copy the key → Paste in Settings (⚙) in the chat panel</li>
              </ol>
            </div>

            {/* Claude */}
            <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-zinc-200">Claude Sonnet 4 (Best for images)</span>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300">
                  Get Key <ExternalLink size={10} />
                </a>
              </div>
              <ol className="text-[11px] text-zinc-400 space-y-0.5 list-decimal list-inside">
                <li>Go to <span className="text-zinc-300">console.anthropic.com</span> → Sign up</li>
                <li>Add billing (pay-as-you-go, very cheap)</li>
                <li>Go to <span className="text-zinc-300">API Keys</span> → Create Key → Paste in Settings</li>
              </ol>
              <p className="text-[10px] text-amber-500 mt-1.5">
                ⚠ Free tier: 5 requests/min, 4K output tokens. Add billing for higher limits.
              </p>
            </div>
          </div>

          <p className="text-[10px] text-zinc-600 mt-2">
            Keys are stored locally in your browser only. Never sent to any server except the AI provider.
          </p>
        </div>

        {/* Terms */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <span className="text-sm font-semibold text-zinc-200">Terms of Use</span>
          </div>
          <div className="text-[10px] text-zinc-500 space-y-2">
            <p>
              This tool is for <span className="text-zinc-300">lawful purposes only</span>: legitimate business emails,
              marketing with consent, transactional notifications, and email template design.
            </p>
            <p>
              <span className="text-red-400 font-semibold">PROHIBITED:</span> Phishing, impersonation, malware distribution,
              spam, social engineering, fraudulent correspondence, or any activity violating CAN-SPAM, GDPR, or applicable laws.
            </p>
            <p>
              Violations may result in reporting to law enforcement (FBI IC3, FTC), civil liability,
              and criminal prosecution with penalties up to $250,000 and/or 20 years imprisonment.
            </p>
            <p className="text-zinc-600 italic">
              By using Letter Builder, you agree to these terms. Click anywhere outside this popup or press OK to continue.
            </p>
          </div>

          <button onClick={dismiss}
            className="w-full mt-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
            OK, I understand
          </button>
        </div>
      </div>
    </div>
  )
}
