'use client'
import { useState, useRef, useEffect } from 'react'
import { useEditorStore } from '@/store/editor'
import { AIProvider, MODELS, bestVisionModel, bestModel, estimateTokens } from '@/types'
import { Loader2, Wand2, Image, Settings, X, Brain, Trash2, Send, ChevronDown, ChevronUp, ImageIcon, FileText, Zap } from 'lucide-react'

function compressImage(dataUrl: string, maxSizeKB: number = 1500): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      const maxDim = 1600
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      let quality = 0.85
      let result = canvas.toDataURL('image/jpeg', quality)
      while (result.length > maxSizeKB * 1024 * 1.37 && quality > 0.3) {
        quality -= 0.1
        result = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(result)
    }
    img.src = dataUrl
  })
}

export default function ChatPanel() {
  const {
    html, pushHtml, undo, redo, aiProvider, aiModel, apiKeys, isGenerating, includeHtml, messages,
    setAiProvider, setAiModel, setApiKey, setIsGenerating, setIncludeHtml,
    addMessage, clearMessages, loadKeys, saveKey,
  } = useEditorStore()

  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [attachedImage, setAttachedImage] = useState<{ base64: string; preview: string; name: string } | null>(null)
  const [transformImage, setTransformImage] = useState<{ base64: string; preview: string; name: string } | null>(null)
  const [transforming, setTransforming] = useState(false)
  const imageRef = useRef<HTMLInputElement>(null)
  const transformImgRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { loadKeys() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const currentModel = MODELS[aiProvider].find((m) => m.id === aiModel) ?? MODELS[aiProvider][0]
  const htmlTokens = includeHtml ? estimateTokens(html) : 0
  const historyTokens = estimateTokens(messages.map((m) => m.content).join(' '))
  const totalEstimate = htmlTokens + historyTokens + 500
  const usage = Math.min(100, Math.round((totalEstimate / currentModel.contextWindow) * 100))

  // Transform image upload
  const handleTransformImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string, 1500)
      setTransformImage({ base64: compressed.split(',')[1], preview: compressed, name: file.name })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // One-click Transform
  const runTransform = async () => {
    if (!transformImage) return
    const key = apiKeys[aiProvider]
    if (!key) { setShowSettings(true); addMessage({ role: 'assistant', content: '⚠️ Add API key in settings first.', isHtml: false }); return }

    // Auto-switch to vision model
    const best = bestVisionModel(aiProvider)
    if (best) setAiModel(best.id)

    addMessage({ role: 'user', content: `🔄 Transform letter to match image: ${transformImage.name}`, isHtml: false })
    setTransforming(true)

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider, model: best?.id || aiModel, apiKey: key,
          prompt: 'Transform to match image',
          currentHtml: html, includeHtml: true,
          imageBase64: transformImage.base64, action: 'image-to-html',
          visionProvider: aiProvider, visionModel: best?.id || aiModel, visionApiKey: key,
        }),
      })
      const data = await res.json()
      if (data.error) { addMessage({ role: 'assistant', content: `❌ ${data.error}`, isHtml: false }); return }

      pushHtml(data.html)

      // Show the plan in chat
      let msg = '✅ Transform complete!'
      if (data.plan) msg += `\n\n📋 Plan used:\n${data.plan}`
      if (data.steps) msg += `\n\n${data.steps.join('\n')}`
      addMessage({ role: 'assistant', content: msg, isHtml: true })
      setTransformImage(null)
    } catch (e: any) {
      addMessage({ role: 'assistant', content: `❌ ${e.message}`, isHtml: false })
    } finally {
      setTransforming(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string, 1500)
      setAttachedImage({ base64: compressed.split(',')[1], preview: compressed, name: file.name })
      const best = bestVisionModel(aiProvider)
      if (best && best.id !== aiModel) setAiModel(best.id)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const send = async (overridePrompt?: string) => {
    const text = overridePrompt ?? input.trim()
    const hasImage = !!attachedImage
    if (!text && !hasImage) return

    // Handle local commands before sending to AI
    const lower = text.toLowerCase().trim()
    if (lower === 'undo') {
      undo()
      addMessage({ role: 'user', content: text, isHtml: false })
      addMessage({ role: 'assistant', content: '↩️ Undone.', isHtml: true })
      if (!overridePrompt) setInput('')
      return
    }
    if (lower === 'redo') {
      redo()
      addMessage({ role: 'user', content: text, isHtml: false })
      addMessage({ role: 'assistant', content: '↪️ Redone.', isHtml: true })
      if (!overridePrompt) setInput('')
      return
    }
    if (lower === 'clear' || lower === 'clear chat') {
      clearMessages()
      if (!overridePrompt) setInput('')
      return
    }

    // Detect simple find-and-replace commands — do in code, not AI
    const replaceMatch = text.match(/(?:change|replace|swap)\s+(?:all\s+)?["']?([^"']+?)["']?\s+(?:to|with|into|for)\s+["']?([^"']+?)["']?\s*$/i)
    if (replaceMatch && !hasImage) {
      const find = replaceMatch[1].trim()
      const replace = replaceMatch[2].trim()
      if (find && replace && html.includes(find)) {
        const newHtml = html.split(find).join(replace)
        const count = (html.match(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        pushHtml(newHtml)
        addMessage({ role: 'user', content: text, isHtml: false })
        addMessage({ role: 'assistant', content: `✅ Replaced ${count} occurrence${count !== 1 ? 's' : ''} of "${find}" with "${replace}".`, isHtml: true })
        if (!overridePrompt) setInput('')
        return
      }
      // Also try case-insensitive
      const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      if (regex.test(html)) {
        const newHtml = html.replace(regex, replace)
        const count = (html.match(regex) || []).length
        pushHtml(newHtml)
        addMessage({ role: 'user', content: text, isHtml: false })
        addMessage({ role: 'assistant', content: `✅ Replaced ${count} occurrence${count !== 1 ? 's' : ''} of "${find}" with "${replace}" (case-insensitive).`, isHtml: true })
        if (!overridePrompt) setInput('')
        return
      }
    }

    const key = apiKeys[aiProvider]
    if (!key) {
      addMessage({ role: 'assistant', content: '⚠️ No API key set. Click ⚙ Settings above to add your Groq or Claude API key.', isHtml: false })
      setShowSettings(true)
      return
    }

    // Auto-switch to vision model if image
    if (hasImage) {
      const cur = MODELS[aiProvider].find((m) => m.id === aiModel)
      if (!cur?.vision) {
        const best = bestVisionModel(aiProvider)
        if (best) setAiModel(best.id)
      }
    }

    addMessage({ role: 'user', content: text + (hasImage ? ' [📎 image attached]' : ''), isHtml: false })
    if (!overridePrompt) setInput('')
    setIsGenerating(true)

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }))

      // Detect if user wants to build NEW (don't send current HTML as context)
      const isBuildNew = /^(create|build|make|generate|design)\s/i.test(lower) && !hasImage
      const sendHtml = includeHtml && !isBuildNew

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider, model: aiModel, apiKey: key,
          prompt: text || undefined,
          currentHtml: sendHtml ? html : undefined,
          includeHtml: sendHtml,
          imageBase64: hasImage ? attachedImage.base64 : undefined,
          action: hasImage ? 'image-to-html' : undefined,
          conversationHistory: history.length ? history : undefined,
          visionProvider: aiProvider,
          visionModel: aiModel,
          visionApiKey: key,
        }),
      })
      const data = await res.json()

      if (data.error) {
        addMessage({ role: 'assistant', content: `❌ Error: ${data.error}`, isHtml: false })
        return
      }

      const response = data.html || ''

      // Detect if response is actual HTML email
      // Must have real email structure AND be substantial
      const looksLikeFullHtml = (
        response.includes('<!DOCTYPE') ||
        (response.includes('<html') && response.includes('</html>')) ||
        (response.includes('<body') && response.includes('</body>'))
      )
      const hasEmailStructure = (
        response.includes('<table') && response.includes('</table>')
      )
      const isHtmlResponse = (looksLikeFullHtml || hasEmailStructure) && response.length > 300

      // Also catch: if response contains @import, @font-face, raw CSS — it's broken HTML, still apply it
      const isBrokenHtml = response.includes('@font-face') || response.includes('@import') || response.includes('<style')

      if (isHtmlResponse || (isBrokenHtml && response.length > 300)) {
        pushHtml(response)
        addMessage({ role: 'assistant', content: '✅ Email updated. Check the preview.', isHtml: true })
      } else if (response.trim()) {
        // Text answer — clean up for display
        let cleanText = response
          .replace(/```html?\s*/g, '').replace(/```/g, '')
        // If it's mostly HTML tags, summarize instead of dumping raw
        const tagRatio = (cleanText.match(/<[^>]+>/g) || []).length / Math.max(1, cleanText.split(' ').length)
        if (tagRatio > 0.3) {
          cleanText = cleanText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          if (cleanText.length > 500) cleanText = cleanText.substring(0, 500) + '...'
        }
        addMessage({ role: 'assistant', content: cleanText || 'Response was empty.', isHtml: false })
      } else {
        addMessage({ role: 'assistant', content: 'No response received.', isHtml: false })
      }

      setAttachedImage(null)
    } catch (e: any) {
      addMessage({ role: 'assistant', content: `❌ ${e.message}`, isHtml: false })
    } finally {
      setIsGenerating(false)
    }
  }

  const quickActions = [
    { label: '🎨 Match image', prompt: 'Edit the body content and brand colors to match the attached image. Keep the footer untouched.' },
    { label: '✨ Improve look', prompt: 'Make this email look more professional and polished. Keep the same content.' },
    { label: '🔄 Change brand', prompt: 'Change the brand name and colors. Tell me what brand you want.' },
    { label: '📱 Mobile fix', prompt: 'Make this email look good on mobile phones.' },
    { label: '📝 Better text', prompt: 'Rewrite the email text to be more engaging. Keep the same meaning.' },
    { label: '🔘 Add button', prompt: 'Add a call-to-action button to this email.' },
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
          {messages.length > 0 && (
            <span className="text-[10px] text-zinc-600">{messages.length} msgs</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Token bar */}
          <div className="flex items-center gap-1 mr-2">
            <div className="w-16 h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${usage > 80 ? 'bg-red-500' : usage > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${usage}%` }} />
            </div>
            <span className="text-[9px] text-zinc-600">{usage}%</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="p-1 hover:bg-zinc-700 rounded text-zinc-500">
            <Settings size={12} />
          </button>
          {messages.length > 0 && (
            <button onClick={clearMessages} className="p-1 hover:bg-zinc-700 rounded text-zinc-500" title="Clear chat">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="flex gap-2 flex-wrap items-center p-2 border-b border-zinc-700 bg-zinc-800/50">
          <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value as AIProvider)}
            className="bg-zinc-700 text-zinc-200 text-[11px] rounded px-2 py-1 border border-zinc-600">
            <option value="groq">Groq</option>
            <option value="claude">Claude</option>
          </select>
          <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}
            className="bg-zinc-700 text-zinc-200 text-[11px] rounded px-2 py-1 border border-zinc-600">
            {MODELS[aiProvider].map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.vision ? ' 👁' : ''}</option>
            ))}
          </select>
          <input type="password" placeholder={`${aiProvider} API Key`}
            value={apiKeys[aiProvider]}
            onChange={(e) => setApiKey(aiProvider, e.target.value)}
            className="bg-zinc-700 text-zinc-200 text-[11px] rounded px-2 py-1 border border-zinc-600 w-44" />
          <button onClick={() => saveKey(aiProvider)}
            className="text-[11px] bg-zinc-600 hover:bg-zinc-500 text-zinc-200 px-2 py-1 rounded">Save</button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <Brain size={28} className="text-zinc-700" />
            <p className="text-xs text-zinc-600 max-w-[220px]">
              Ask anything about your email, or tell me what to build. I can see your current HTML when the checkbox is on.
            </p>
            <div className="flex flex-wrap gap-1 justify-center max-w-[280px]">
              {quickActions.map((a) => (
                <button key={a.label} onClick={() => send(a.prompt)} disabled={isGenerating}
                  className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-2 py-1 rounded border border-zinc-700 disabled:opacity-50">
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30'
                : msg.isHtml
                  ? 'bg-emerald-600/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
            }`}>
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              <div className="text-[9px] text-zinc-600 mt-1">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
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

      {/* Quick actions (show after first message) */}
      {messages.length > 0 && (
        <div className="flex gap-1 px-3 py-1 flex-wrap border-t border-zinc-800">
          {quickActions.map((a) => (
            <button key={a.label} onClick={() => send(a.prompt)} disabled={isGenerating}
              className="text-[9px] bg-zinc-800 hover:bg-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 disabled:opacity-50">
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Image preview */}
      {attachedImage && (
        <div className="flex items-center gap-2 px-3 py-1 border-t border-zinc-800">
          <img src={attachedImage.preview} alt="" className="h-10 rounded border border-zinc-600 object-contain" />
          <span className="text-[10px] text-zinc-500 flex-1 truncate">{attachedImage.name}</span>
          <button onClick={() => { setAttachedImage(null); const b = bestModel(aiProvider); setAiModel(b.id) }}
            className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500"><X size={12} /></button>
        </div>
      )}

      {/* ─── TRANSFORM SECTION ─── */}
      <div className="px-3 py-2 border-t border-zinc-700 shrink-0">
        <div className="flex items-center gap-1.5 mb-2">
          <button onClick={() => transformImgRef.current?.click()}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border flex-1 transition-colors ${
              transformImage
                ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-600 text-zinc-400'
            }`}>
            {transformImage
              ? <><img src={transformImage.preview} alt="" className="h-4 w-4 rounded object-cover" /><span className="truncate">{transformImage.name}</span></>
              : <><ImageIcon size={12} /> Upload target image</>
            }
          </button>
          {transformImage && (
            <button onClick={() => setTransformImage(null)} className="p-1 hover:bg-zinc-700 rounded text-zinc-500"><X size={11} /></button>
          )}
          <button onClick={runTransform} disabled={!transformImage || transforming}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded font-medium text-xs transition-all shrink-0 ${
              transformImage
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            } disabled:opacity-50`}>
            {transforming ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Transform
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-zinc-700 shrink-0">
        <div className="flex items-center gap-1 mb-1.5">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={includeHtml} onChange={(e) => setIncludeHtml(e.target.checked)}
              className="w-3 h-3 rounded border-zinc-600 bg-zinc-700 text-indigo-500 cursor-pointer" />
            <span className="text-[10px] text-zinc-500">AI sees current HTML</span>
          </label>
          <span className="text-[9px] text-zinc-700 ml-1">
            {includeHtml ? `~${estimateTokens(html).toLocaleString()} tokens` : 'off'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => imageRef.current?.click()}
            className={`p-2 rounded border shrink-0 ${attachedImage ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:bg-zinc-700'}`}
            title="Attach image">
            <Image size={14} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type what you want to change, or attach an image and click 🎨 Match image"
            rows={1}
            className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded px-3 py-2 border border-zinc-600 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
          />
          <button onClick={() => send()} disabled={isGenerating || (!input.trim() && !attachedImage)}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded shrink-0">
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
