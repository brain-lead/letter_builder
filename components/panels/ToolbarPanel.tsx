'use client'
import { useState, useRef } from 'react'
import { useEditorStore } from '@/store/editor'
import { FileText, Mail, Shield, ShieldAlert, EyeOff, Fingerprint, ChevronUp, ChevronDown, Sparkles, Loader2 } from 'lucide-react'
import { sanitizeEmail, redactAllPII, removeTrackingPixels, stripExternalResources, smartObfuscate, obfuscateEmailsInHtml } from '@/lib/security'
import { fullClean, isRawEml } from '@/lib/html-cleaner'

export default function ToolbarPanel() {
  const { html, pushHtml } = useEditorStore()
  const [collapsed, setCollapsed] = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [obfuscateLevel, setObfuscateLevel] = useState<'light' | 'medium' | 'heavy'>('medium')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadType, setUploadType] = useState<'html' | 'eml'>('html')

  const showStatus = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 5000) }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    if (uploadType === 'eml') {
      setLoading(true)
      try {
        const res = await fetch('/api/parse-eml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eml: text }) })
        const data = await res.json()
        if (data.error) { showStatus(`❌ ${data.error}`); return }
        pushHtml(fullClean(data.html))
        showStatus(`✅ EML loaded${data.meta?.subject ? `: "${data.meta.subject}"` : ''}`)
      } catch (err: any) { showStatus(`❌ ${err.message}`) }
      finally { setLoading(false) }
    } else { pushHtml(text); showStatus('✅ HTML loaded.') }
    e.target.value = ''
  }

  const triggerUpload = (type: 'html' | 'eml') => {
    setUploadType(type)
    if (fileRef.current) { fileRef.current.accept = type === 'html' ? '.html,.htm' : '.eml,.mhtml,.mht'; fileRef.current.click() }
  }

  const exportHtml = () => {
    const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'email.html'; a.click(); URL.revokeObjectURL(url)
  }

  const exportEml = () => {
    const eml = ['From: sender@example.com', 'To: recipient@example.com', 'Subject: Email', 'MIME-Version: 1.0', 'Content-Type: text/html; charset=utf-8', '', html].join('\r\n')
    const blob = new Blob([eml], { type: 'message/rfc822' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'email.eml'; a.click(); URL.revokeObjectURL(url)
  }

  const btn = "flex items-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded border border-zinc-600"

  return (
    <div className="bg-zinc-900 border-t border-zinc-700">
      <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />

      <button onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-center py-0.5 hover:bg-zinc-800 text-zinc-600">
        {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {!collapsed && (
        <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
          {loading && <Loader2 size={12} className="animate-spin text-indigo-400" />}

          <span className="text-[10px] text-zinc-500">Upload:</span>
          <button onClick={() => triggerUpload('html')} className={btn}><FileText size={11} /> HTML</button>
          <button onClick={() => triggerUpload('eml')} className={btn}><Mail size={11} /> EML</button>

          <div className="w-px h-4 bg-zinc-700" />

          <span className="text-[10px] text-zinc-500">Export:</span>
          <button onClick={exportHtml} className={btn}>.html</button>
          <button onClick={exportEml} className={btn}>.eml</button>
          <button onClick={() => { navigator.clipboard.writeText(html); showStatus('✅ Copied!') }} className={btn}>Copy</button>

          <div className="w-px h-4 bg-zinc-700" />

          <span className="text-[10px] text-zinc-500">Clean:</span>
          <button onClick={async () => {
            if (isRawEml(html)) {
              setLoading(true)
              try {
                const res = await fetch('/api/parse-eml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eml: html }) })
                const data = await res.json()
                if (data.error) { pushHtml(fullClean(html)); showStatus('⚠ Fallback.') }
                else { pushHtml(fullClean(data.html)); showStatus(`✅ EML→HTML`) }
              } catch { pushHtml(fullClean(html)); showStatus('⚠ Fallback.') }
              finally { setLoading(false) }
            } else { pushHtml(fullClean(html)); showStatus('✅ Cleaned.') }
          }} className="flex items-center gap-1 text-xs bg-emerald-700/40 hover:bg-emerald-600/40 text-emerald-300 px-2 py-1 rounded border border-emerald-600/30">
            <Sparkles size={11} /> Clean
          </button>

          <div className="w-px h-4 bg-zinc-700" />

          <span className="text-[10px] text-zinc-500">Security:</span>
          <button onClick={() => { const r = sanitizeEmail(html); pushHtml(r.html); showStatus(r.actions.length ? `✅ ${r.actions.join('. ')}` : 'Clean.') }} className={btn}><Shield size={11} /> Sanitize</button>
          <button onClick={() => { pushHtml(redactAllPII(html)); showStatus('✅ Redacted.') }} className={btn}><EyeOff size={11} /> Redact</button>
          <button onClick={() => { pushHtml(removeTrackingPixels(html)); showStatus('✅ Trackers.') }} className={btn}><Fingerprint size={11} /> Trackers</button>
          <button onClick={() => { pushHtml(stripExternalResources(html)); showStatus('✅ Scripts.') }} className={btn}><ShieldAlert size={11} /> Scripts</button>
          <button onClick={() => { pushHtml(obfuscateEmailsInHtml(html)); showStatus('✅ Obfuscated.') }} className={btn}><Mail size={11} /> Obfuscate</button>
          <select value={obfuscateLevel} onChange={(e) => setObfuscateLevel(e.target.value as any)}
            className="bg-zinc-700 text-zinc-200 text-[10px] rounded px-1 py-0.5 border border-zinc-600">
            <option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option>
          </select>
          <button onClick={() => { pushHtml(smartObfuscate(html, obfuscateLevel)); showStatus(`✅ Smart (${obfuscateLevel}).`) }}
            className="flex items-center gap-1 text-xs bg-amber-700/50 hover:bg-amber-600/50 text-amber-200 px-2 py-1 rounded border border-amber-600/40">
            <Shield size={11} /> Smart
          </button>

          {status && <span className="text-[10px] text-emerald-400 ml-1">{status}</span>}
        </div>
      )}
    </div>
  )
}
