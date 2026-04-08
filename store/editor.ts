import { create } from 'zustand'
import { AIProvider } from '@/types'

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td data-editable="header" style="background-color:#4285f4;padding:24px 40px;text-align:center;">
              <span style="color:#ffffff;font-size:22px;font-weight:bold;">Your Company</span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 data-editable="title" style="margin:0 0 16px;font-size:24px;color:#202124;">Welcome to Your Service</h1>
              <p data-editable="body" style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5f6368;">
                Thank you for signing up. We're excited to have you on board. Click the button below to get started with your account.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td data-editable="button" style="background-color:#4285f4;border-radius:4px;padding:12px 32px;text-align:center;">
                    <a href="#" style="color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Get Started</a>
                  </td>
                </tr>
              </table>
              <p data-editable="secondary" style="margin:0;font-size:13px;line-height:1.6;color:#5f6368;">
                If you didn't create this account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td data-editable="footer" style="background-color:#f8f9fa;padding:24px 40px;text-align:center;border-top:1px solid #e8eaed;">
              <p style="margin:0 0 8px;font-size:12px;color:#9aa0a6;">© 2025 Your Company. All rights reserved.</p>
              <p style="margin:0;font-size:12px;color:#9aa0a6;">123 Street, City, Country</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

const MAX_HISTORY = 80

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isHtml?: boolean // true if this message generated/modified HTML
}

type Store = {
  // HTML + history
  html: string
  history: string[]
  historyIdx: number
  // AI
  aiProvider: AIProvider
  aiModel: string
  apiKeys: Record<AIProvider, string>
  isGenerating: boolean
  includeHtml: boolean
  // Chat
  messages: ChatMessage[]

  // Actions
  setHtml: (html: string) => void       // sets html WITHOUT pushing history (for internal sync)
  pushHtml: (html: string) => void      // sets html AND pushes to history (for user/AI actions)
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  setAiProvider: (p: AIProvider) => void
  setAiModel: (m: string) => void
  setApiKey: (provider: AIProvider, key: string) => void
  setIsGenerating: (v: boolean) => void
  setIncludeHtml: (v: boolean) => void
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  clearMessages: () => void
  loadKeys: () => void
  saveKey: (provider: AIProvider) => void
}

let msgCounter = 0

export const useEditorStore = create<Store>((set, get) => ({
  html: DEFAULT_HTML,
  history: [DEFAULT_HTML],
  historyIdx: 0,
  aiProvider: 'groq',
  aiModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
  apiKeys: { groq: '', claude: '', openai: '' },
  isGenerating: false,
  includeHtml: true,
  messages: [],

  setHtml: (html) => {
    set({ html })
    try { localStorage.setItem('lb_html', html) } catch {}
  },

  pushHtml: (html) => {
    const { history, historyIdx } = get()
    const trimmed = history.slice(0, historyIdx + 1)
    const next = [...trimmed, html]
    if (next.length > MAX_HISTORY) next.shift()
    set({ html, history: next, historyIdx: next.length - 1 })
    try { localStorage.setItem('lb_html', html) } catch {}
  },

  undo: () => {
    const { history, historyIdx } = get()
    if (historyIdx <= 0) return
    const newIdx = historyIdx - 1
    const html = history[newIdx]
    set({ html, historyIdx: newIdx })
    try { localStorage.setItem('lb_html', html) } catch {}
  },

  redo: () => {
    const { history, historyIdx } = get()
    if (historyIdx >= history.length - 1) return
    const newIdx = historyIdx + 1
    const html = history[newIdx]
    set({ html, historyIdx: newIdx })
    try { localStorage.setItem('lb_html', html) } catch {}
  },

  canUndo: () => get().historyIdx > 0,
  canRedo: () => get().historyIdx < get().history.length - 1,

  setAiProvider: (aiProvider) => {
    const defaults: Record<string, string> = { groq: 'meta-llama/llama-4-scout-17b-16e-instruct', claude: 'claude-sonnet-4-6', openai: 'gpt-4o' }
    set({ aiProvider, aiModel: defaults[aiProvider] || 'gpt-4o' })
  },
  setAiModel: (aiModel) => set({ aiModel }),
  setApiKey: (provider, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setIncludeHtml: (includeHtml) => set({ includeHtml }),

  addMessage: (msg) => {
    msgCounter++
    set((s) => ({
      messages: [...s.messages, { ...msg, id: `msg-${msgCounter}-${Date.now()}`, timestamp: Date.now() }],
    }))
  },

  clearMessages: () => set({ messages: [] }),

  loadKeys: () => {
    const groq = localStorage.getItem('apikey_groq') ?? ''
    const claude = localStorage.getItem('apikey_claude') ?? ''
    const openai = localStorage.getItem('apikey_openai') ?? ''
    const savedHtml = localStorage.getItem('lb_html')
    if (savedHtml) {
      set({ apiKeys: { groq, claude, openai }, html: savedHtml, history: [savedHtml], historyIdx: 0 })
    } else {
      set({ apiKeys: { groq, claude, openai } })
    }
  },

  saveKey: (provider) => {
    localStorage.setItem(`apikey_${provider}`, get().apiKeys[provider])
  },
}))
