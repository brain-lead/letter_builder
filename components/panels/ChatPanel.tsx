'use client'
import { useState, useRef, useEffect } from 'react'
import { useEditorStore } from '@/store/editor'
import { AIProvider, MODELS, bestVisionModel, bestModel, estimateTokens } from '@/types'
import { Loader2, Image, Settings, X, Brain, Trash2, Send, ImageIcon, Zap } from 'lucide-react'

function compressImage(dataUrl: string, maxSizeKB = 1500): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      const maxDim = 1600
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * ratio); height = Math.round(height * ratio)
      }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      let quality = 0.85
      let result = canvas.toDataURL('image/jpeg', quality)
      while (result.length > maxSizeKB * 1024 * 1.37 && quality > 0.3) { quality -= 0.1; result = canvas.toDataURL('image/jpeg', quality) }
      resolve(result)
    }
    img.src = dataUrl
  })
}

export default function ChatPanel() {
  const { html, pushHtml, undo, redo, aiProvider, aiModel, apiKeys, isGenerating, includeHtml, messages,
    setAiProvider, setAiModel, setApiKey, setIsGenerating, setIncludeHtml, addMessage, clearMessages, loadKeys, saveKey } = useEditorStore()

  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [attachedImage, setAttachedImage] = useState<{ base64: string; preview: string; name: string } | null>(null)
  const [transformImage, setTransformImage] = useState<{ base64: string; preview: string; name: string } | null>(null)
  const [transforming, setTransforming] = useState(false)
  const imageRef = useRef<HTMLInputElement>(null)
  const transformImgRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadKeys() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const currentModel = MODELS[aiProvider].find(m => m.id === aiModel) ?? MODELS[aiProvider][0]
  const usage = Math.min(100, Math.round(((includeHtml ? estimateTokens(html) : 0) + 500) / currentModel.contextWindow * 100))

  const handleTransformImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string, 1500)
      setTransformImage({ base64: compressed.split(',')[1], preview: compressed, name: file.name })
    }
    reader.readAsDataURL(file); e.target.value = ''
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string, 1500)
      setAttachedImage({ base64: compressed.split(',')[1], preview: compressed, name: file.name })
      const best = bestVisionModel(aiProvider)
      if (best && best.id !== aiModel) setAiModel(best.id)
    }
    reader.readAsDataURL(file); e.target.value = ''
  }

  const runTransform = async () => {
    if (!transformImage) return
    const key = apiKeys[aiProvider]
    if (!key) { setShowSettings(true); return }
    const best = bestVisionModel(aiProvider)
    const useModel = best?.id || aiModel
    addMessage({ role: 'user', content: `🔄 Transform to match: ${transformImage.name}`, isHtml: false })
    setTransforming(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: aiProvider, model: useModel, apiKey: key,
          prompt: 'Transform to match image', currentHtml: html, includeHtml: true,
          imageBase64: transformImage.base64, action: 'image-to-html',
          visionProvider: aiProvider, visionModel: useModel, visionApiKey: key }),
      })
      const data = await res.json()
      if (data.error) { addMessage({ role: 'assistant', content: `❌ ${data.error}`, isHtml: false }); return }
      pushHtml(data.html)
      let msg = '✅ Transform complete!'
      if (data.plan) msg += `\n\n📋 Plan:\n${data.plan}`
      addMessage({ role: 'assistant', content: msg, isHtml: true })
      setTransformImage(null)
    } catch (e: any) {
      addMessage({ role: 'assistant', content: `❌ ${e.message}`, isHtml: false })
    } finally { setTransforming(false) }
  }

  const send = async (overridePrompt?: string) => {
    const text = overridePrompt ?? input.trim()
    const hasImage = !!attachedImage
    if (!text && !hasImage) return

    const lower = text.toLowerCase().trim()

    // Local commands
    if (lower === 'undo') { undo(); addMessage({ role: 'user', content: text, isHtml: false }); addMessage({ role: 'assistant', content: '↩️ Undone.', isHtml: true }); if (!overridePrompt) setInput(''); return }
    if (lower === 'redo') { redo(); addMessage({ role: 'user', content: text, isHtml: false }); addMessage({ role: 'assistant', content: '↪️ Redone.', isHtml: true }); if (!overridePrompt) setInput(''); return }
    if (lower === 'clear' || lower === 'clear chat') { clearMessages(); if (!overridePrompt) setInput(''); return }

    const key = apiKeys[aiProvider]
    if (!key) {
      addMessage({ role: 'assistant', content: '⚠️ No API key. Click ⚙ Settings to add your Groq or Claude key.', isHtml: false })
      setShowSettings(true); return
    }

    if (hasImage) {
      const cur = MODELS[aiProvider].find(m => m.id === aiModel)
      if (!cur?.vision) { const best = bestVisionModel(aiProvider); if (best) setAiModel(best.id) }
    }

    addMessage({ role: 'user', content: text + (hasImage ? ' [📎 image]' : ''), isHtml: false })
    if (!overridePrompt) setInput('')
    setIsGenerating(true)

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const isBuildNew = /^(create|build|make|generate|design)\s/i.test(lower) && !hasImage
      const sendHtml = includeHtml && !isBuildNew

      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider, model: aiModel, apiKey: key,
          prompt: text, currentHtml: sendHtml ? html : undefined, includeHtml: sendHtml,
          imageBase64: hasImage ? attachedImage!.base64 : undefined,
          action: hasImage ? 'image-to-html' : undefined,
          conversationHistory: history.length ? history : undefined,
          visionProvider: aiProvider, visionModel: aiModel, visionApiKey: key,
        }),
      })
      const data = await res.json()

      if (data.error) {
        addMessage({ role: 'assistant', content: `❌ ${data.error}`, isHtml: false }); return
      }

      // editDescription = AI made a targeted edit (CASE 3)
      if (data.editDescription) {
        pushHtml(data.html)
        addMessage({ role: 'assistant', content: `✅ ${data.editDescription}`, isHtml: true })
        setAttachedImage(null); return
      }

      const response = data.html || ''
      const isHtml = (response.includes('<!DOCTYPE') || (response.includes('<html') && response.includes('</html>')) || (response.includes('<table') && response.includes('</table>'))) && response.length > 300

      if (isHtml) {
        pushHtml(response)
        addMessage({ role: 'assistant', content: '✅ Email updated.', isHtml: true })
      } else if (response.trim()) {
        let clean = response.replace(/```html?\s*/g, '').replace(/```/g, '')
        const tagRatio = (clean.match(/<[^>]+>/g) || []).length / Math.max(1, clean.split(' ').length)
        if (tagRatio > 0.3) clean = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        if (clean.length > 600) clean = clean.substring(0, 600) + '...'
        addMessage({ role: 'assistant', content: clean, isHtml: false })
      } else {
        addMessage({ role: 'assistant', content: 'No response.', isHtml: false })
      }
      setAttachedImage(null)
    } catch (e: any) {
      addMessage({ role: 'assistant', content: `❌ ${e.message}`, isHtml: false })
    } finally { setIsGenerating(false) }
  }

  const quickActions = [
    { label: '✨ Improve', prompt: 'Improve the visual design of this email.' },
    { label: '🔵 Blue button', prompt: 'Change the button color to blue.' },
    { label: '📱 Mobile', prompt: 'Make this email mobile-friendly.' },
    { label: '📝 Rewrite', prompt: 'Rewrite the email body to be more engaging.' },
    { label: '🏷 Header/Footer', prompt: 'Add a branded header and footer.' },
  ]

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <input ref={transformImgRef} type="file" accept="image/*" className="hidden" onChange={handleTransformImage} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700 shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-indigo-400" />
          <span className="text-xs font-semibold text-zinc-400">AI Chat</span>
          {messages.length > 0 && <span className="text-[10px] text-zinc-600">{messages.length}</span>}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 mr-2">
            <div className="w-16 h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${usage > 80 ? 'bg-red-500' : usage > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usage}%` }} />
            </div>
            <span className="text-[9px] text-zinc-600">{usage}%</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="p-1 hover:bg-zinc-700 rounded text-zinc-500"><Settings size={12} /></button>
          {messages.length > 0 && <button onClick={clearMessages} className="p-1 hover:bg-zinc-700 rounded text-zinc-500"><Trash2 size={12} /></button>}
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="flex gap-2 flex-wrap items-center p-2 border-b border-zinc-700 bg-zinc-800/50">
          <select value={aiProvider} onChange={e => setAiProvider(e.target.value as AIProvider)} className="bg-zinc-700 text-zinc-200 text-[11px] rounded px-2 py-1 border border-zinc-600">
            <option value="groq">Groq</option><option value="claude">Claude</option><option value="openai">ChatGPT</option>
          </select>
          <select value={aiModel} onChange={e => setAiModel(e.target.value)} className="bg-zinc-700 text-zinc-200 text-[11px] rounded px-2 py-1 border border-zinc-600">
            {MODELS[aiProvider].map(m => <option key={m.id} value={m.id}>{m.name}{m.vision ? ' 👁' : ''}</option>)}
          </select>
          <input type="password" placeholder={`${aiProvider} API Key`} value={apiKeys[aiProvider]}
            onChange={e => setApiKey(aiProvider, e.target.value)}
            className="bg-zinc-700 text-zinc-200 text-[11px] rounded px-2 py-1 border border-zinc-600 w-44" />
          <button onClick={() => saveKey(aiProvider)} className="text-[11px] bg-zinc-600 hover:bg-zinc-500 text-zinc-200 px-2 py-1 rounded">Save</button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <Brain size={28} className="text-zinc-700" />
            <p className="text-xs text-zinc-600 max-w-[220px]">Ask me to change anything in your email. I'll do it directly — no full rewrites.</p>
            <div className="flex flex-wrap gap-1 justify-center max-w-[280px]">
              {quickActions.map(a => (
                <button key={a.label} onClick={() => send(a.prompt)} disabled={isGenerating}
                  className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-2 py-1 rounded border border-zinc-700 disabled:opacity-50">{a.label}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user' ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30'
              : msg.isHtml ? 'bg-emerald-600/10 text-emerald-300 border border-emerald-500/20'
              : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              <div className="text-[9px] text-zinc-600 mt-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-400 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Thinking...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick actions */}
      {messages.length > 0 && (
        <div className="flex gap-1 px-3 py-1 flex-wrap border-t border-zinc-800">
          {quickActions.map(a => (
            <button key={a.label} onClick={() => send(a.prompt)} disabled={isGenerating}
              className="text-[9px] bg-zinc-800 hover:bg-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 disabled:opacity-50">{a.label}</button>
          ))}
        </div>
      )}

      {/* Attached image */}
      {attachedImage && (
        <div className="flex items-center gap-2 px-3 py-1 border-t border-zinc-800">
          <img src={attachedImage.preview} alt="" className="h-10 rounded border border-zinc-600 object-contain" />
          <span className="text-[10px] text-zinc-500 flex-1 truncate">{attachedImage.name}</span>
          <button onClick={() => { setAttachedImage(null); setAiModel(bestModel(aiProvider).id) }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500"><X size={12} /></button>
        </div>
      )}

      {/* Transform */}
      <div className="px-3 py-2 border-t border-zinc-700 shrink-0">
        <div className="flex items-center gap-1.5">
          <button onClick={() => transformImgRef.current?.click()}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border flex-1 transition-colors ${transformImage ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300' : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-600 text-zinc-400'}`}>
            {transformImage ? <><img src={transformImage.preview} alt="" className="h-4 w-4 rounded object-cover" /><span className="truncate">{transformImage.name}</span></> : <><ImageIcon size={12} /> Upload target image</>}
          </button>
          {transformImage && <button onClick={() => setTransformImage(null)} className="p-1 hover:bg-zinc-700 rounded text-zinc-500"><X size={11} /></button>}
          <button onClick={runTransform} disabled={!transformImage || transforming}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded font-medium text-xs shrink-0 ${transformImage ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'} disabled:opacity-50`}>
            {transforming ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Transform
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-zinc-700 shrink-0">
        <div className="flex items-center gap-1 mb-1.5">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={includeHtml} onChange={e => setIncludeHtml(e.target.checked)} className="w-3 h-3 rounded border-zinc-600 bg-zinc-700 text-indigo-500 cursor-pointer" />
            <span className="text-[10px] text-zinc-500">AI sees current HTML</span>
          </label>
          <span className="text-[9px] text-zinc-700 ml-1">{includeHtml ? `~${estimateTokens(html).toLocaleString()} tokens` : 'off'}</span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => imageRef.current?.click()}
            className={`p-2 rounded border shrink-0 ${attachedImage ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:bg-zinc-700'}`}>
            <Image size={14} />
          </button>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            placeholder="e.g. change button color to blue, replace X with Y, build a Google welcome email..."
            rows={1} className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded px-3 py-2 border border-zinc-600 resize-none"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button onClick={() => send()} disabled={isGenerating || (!input.trim() && !attachedImage)}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded shrink-0">
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
