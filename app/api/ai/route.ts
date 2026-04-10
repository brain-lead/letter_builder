import { NextRequest, NextResponse } from 'next/server'
import { estimateTokens, trimHtmlToFit, getContextBudget, AIProvider, MODELS } from '@/types'

async function callAI(provider: string, model: string, apiKey: string, system: string, prompt: string, imageBase64?: string): Promise<string> {
  const modelInfo = MODELS[provider as AIProvider]?.find(m => m.id === model)
  const maxTokens = Math.min(modelInfo?.maxOutput ?? 16384, 16384)
  if (provider === 'groq') return (await import('@/lib/ai/groq')).callGroq(apiKey, model, system, prompt, maxTokens, imageBase64)
  if (provider === 'claude') return (await import('@/lib/ai/claude')).callClaude(apiKey, model, system, prompt, maxTokens, imageBase64)
  if (provider === 'openai') return (await import('@/lib/ai/openai')).callOpenAI(apiKey, model, system, prompt, maxTokens, imageBase64)
  throw new Error('Unknown provider: ' + provider)
}

// Vision system for Transform feature
const VISION_SYSTEM = `You read email screenshots. Extract ALL visible text and colors.
Output this EXACT format:
BRAND: [brand name]
HEADER_COLOR: [hex color of header/top bar]
BUTTON_COLOR: [hex color of the main CTA button]
BG_COLOR: [hex color of the page background behind the email, or SAME if white/light gray]
BODY:
[every line of body text above the button]
BUTTON: [button text]
SECOND_BODY:
[text below the button but still in the white area, or EMPTY if none]
BANNER:
[text in a colored/gray bar between the main content and footer - often a notice, disclaimer, or promo. EMPTY if none]
Be EXACT. Copy text word for word. For colors, output ONLY the hex code like #0078D4.`

function splitHtml(html: string) {
  const m = html.match(/<body[^>]*>/i)
  const ci = html.lastIndexOf('</body>')
  if (!m || ci === -1) return null
  const bi = html.indexOf(m[0]) + m[0].length
  return { before: html.substring(0, bi), body: html.substring(bi, ci), after: html.substring(ci) }
}

function parseVision(plan: string) {
  const p = plan.replace(/\r\n/g, '\n')
  const sections: Record<string, string> = {}
  const keys = ['BRAND', 'HEADER_COLOR', 'BUTTON_COLOR', 'BG_COLOR', 'HEADER_LINK', 'BODY', 'BUTTON', 'BANNER', 'SECOND_BODY']
  for (const key of keys) {
    const idx = p.search(new RegExp(`^${key}:`, 'im'))
    if (idx >= 0) {
      const after = p.substring(idx + key.length + 1)
      let end = after.length
      for (const nk of keys) { const ni = after.search(new RegExp(`^${nk}:`, 'im')); if (ni > 0 && ni < end) end = ni }
      sections[key] = after.substring(0, end).trim()
    }
  }
  const result = {
    brand: sections['BRAND'] || '', headerColor: (sections['HEADER_COLOR'] || '').match(/#[0-9a-fA-F]{6}/)?.[0] || '',
    buttonColor: (sections['BUTTON_COLOR'] || '').match(/#[0-9a-fA-F]{6}/)?.[0] || '',
    bgColor: (sections['BG_COLOR'] || '').match(/#[0-9a-fA-F]{6}/)?.[0] || '',
    bodyLines: (sections['BODY'] || '').split('\n').map(l => l.trim()).filter(l => l.length > 0),
    buttonText: sections['BUTTON'] || '', bannerText: sections['BANNER'] || '',
    secondBody: sections['SECOND_BODY'] || '', headerLink: sections['HEADER_LINK'] || '',
  }
  // Fix common AI mistake: long disclaimer in SECOND_BODY is actually the BANNER
  if (!result.bannerText && result.secondBody.length > 100 && /confidential|disclaimer|prohibited|privacy|notice/i.test(result.secondBody)) {
    result.bannerText = result.secondBody
    result.secondBody = 'EMPTY'
  }
  return result
}

function brandSwap(html: string, v: ReturnType<typeof parseVision>): string {
  let r = html
  if (v.brand) {
    r = r.replace(/<title>[^<]*<\/title>/i, `<title>${v.brand}</title>`)
    r = r.replace(/("name":\s*")[^"]*(")/,`$1${v.brand}$2`)
    r = r.replace(/alt="[^"]{1,20}"/gi, m => m.match(/chat|phone|mobile|bubble|spacer/i) ? m : `alt="${v.brand}"`)
  }
  if (v.headerColor && /^#[0-9a-f]{6}$/i.test(v.headerColor)) {
    r = r.replace(/(<table\s+bgcolor=")#(?!EDF0F2|ffffff|f4f4f4)([0-9a-fA-F]{6})("[^>]*style="[^"]*background-color:\s*)#[0-9a-fA-F]{6}/i, `$1${v.headerColor}$3${v.headerColor}`)
    r = r.replace(/bgcolor="#201747"/gi, `bgcolor="${v.headerColor}"`).replace(/background-color:\s*#201747/gi, `background-color: ${v.headerColor}`)
  }
  if (v.buttonColor && /^#[0-9a-f]{6}$/i.test(v.buttonColor)) {
    r = r.replace(/bgcolor="#00A9CE"/gi, `bgcolor="${v.buttonColor}"`).replace(/background-color:\s*#00A9CE/gi, `background-color: ${v.buttonColor}`)
    r = r.replace(/(border:\s*0\s+solid\s+)#00A9CE/gi, `$1${v.buttonColor}`)
  }
  if (v.bgColor && /^#[0-9a-f]{6}$/i.test(v.bgColor)) {
    r = r.replace(/bgcolor="#EDF0F2"/gi, `bgcolor="${v.bgColor}"`).replace(/background-color:\s*#EDF0F2/gi, `background-color: ${v.bgColor}`)
  }
  if (v.headerLink) { r = r.replace(/>Log in[^<]*</gi, `>${v.headerLink}<`); r = r.replace(/>Sign in[^<]*</gi, `>${v.headerLink}<`) }
  if (v.bodyLines.length > 0) {
    const nb = ' \n            ' + v.bodyLines.join('<br>\n            <br>\n            ') + ' '
    r = r.replace(/(<td[^>]*style="[^"]*font-size:\s*16px[^"]*padding-top:\s*50px[^"]*"[^>]*>)[\s\S]*?(<\/td>)/i, `$1${nb}$2`)
  }
  if (v.buttonText) {
    r = r.replace(/(<a[^>]*style="[^"]*padding:\s*12px[^"]*text-decoration:\s*none[^"]*"[^>]*>)[\s\S]*?(<\/a>)/gi, `$1${v.buttonText}$2`)
    r = r.replace(/>View your statement</gi, `>${v.buttonText}<`).replace(/>Get Started</gi, `>${v.buttonText}<`)
  }
  if (!v.secondBody || v.secondBody.toUpperCase() === 'EMPTY') {
    r = r.replace(/(<td[^>]*style="[^"]*font-size:\s*16px[^"]*padding-bottom:\s*50px[^"]*"[^>]*>)[\s\S]*?(<\/td>)/i, `$1 $2`)
  }
  if (v.bannerText && v.bannerText.length > 20) {
    r = r.replace(/(<td[^>]*style="[^"]*font-size:\s*14px[^"]*font-weight:\s*400[^"]*"[^>]*align="center">)[\s\S]*?(<\/td>)/i, `$1${v.bannerText}$2`)
  }
  if (v.brand) { r = r.replace(/The SoFi Team/gi, `The ${v.brand} Team`); r = r.replace(/SoFi mobile app/gi, `${v.brand} app`) }
  return r
}

export async function POST(req: NextRequest) {
  try {
    const { provider, model, apiKey, prompt, currentHtml, imageBase64, action, includeHtml,
      conversationHistory, visionProvider, visionModel, visionApiKey } = await req.json()

    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 400 })

    // ── TRANSFORM: image + existing HTML ──
    if (action === 'image-to-html' && imageBase64 && includeHtml && currentHtml) {
      const vp = visionProvider || provider, vm = visionModel || model, vk = visionApiKey || apiKey
      let plan = ''
      try { plan = await callAI(vp, vm, vk, VISION_SYSTEM, 'Read this email. Extract brand, colors, all text.', imageBase64) }
      catch (e: any) { return NextResponse.json({ error: `Vision: ${e.message}` }, { status: 500 }) }
      const v = parseVision(plan)
      return NextResponse.json({ html: brandSwap(currentHtml, v), plan, editDescription: `Transformed: brand=${v.brand}` })
    }

    // ── IMAGE ONLY: build from scratch ──
    if (action === 'image-to-html' && imageBase64) {
      const r = await callAI(provider, model, apiKey, 'Build a professional HTML email from this screenshot. Table-based, inline CSS, 600px width.', prompt || 'Build this email.', imageBase64)
      let h = r.replace(/```html?\s*/g, '').replace(/```/g, '')
      const d = h.match(/(<!DOCTYPE[\s\S]*<\/html>)/i); if (d) h = d[1]
      return NextResponse.json({ html: h })
    }

    // ── SMART EDIT: try JSON instruction first (small AI call, no HTML sent) ──
    if (includeHtml && currentHtml && /change|replace|swap|color|font|size|button|header|background|text to|with |rename|update/i.test(prompt || '')) {
      const SYS = `OUTPUT ONLY JSON. Parse the user request into a JSON edit instruction.
Examples:
"change button color to blue" -> {"action":"change_color","target":"button","value":"#0078D4"}
"make header red" -> {"action":"change_color","target":"header","value":"#e74c3c"}
"change background to yellow" -> {"action":"change_color","target":"background","value":"#f1c40f"}
"replace Hello with Hi" -> {"action":"replace_text","find":"Hello","replace":"Hi"}
"change button text to Sign Up" -> {"action":"change_button_text","value":"Sign Up"}
JSON ONLY.`
      let inst: any = null
      try {
        const r = await callAI(provider, model, apiKey, SYS, prompt || '')
        const j = r.match(/\{[\s\S]*?\}/); if (j) inst = JSON.parse(j[0])
      } catch {}

      // Fallback: parse color from text directly
      if (!inst) {
        const cm = (prompt || '').match(/(?:to|as)\s+(blue|red|green|yellow|orange|purple|pink|black|white|gray|teal|navy|cyan|#[0-9a-f]{3,6})/i)
        const tm = (prompt || '').match(/(button|header|background|banner|body)/i)
        const colors: Record<string,string> = {blue:'#0078D4',red:'#e74c3c',green:'#27ae60',yellow:'#f1c40f',orange:'#e67e22',purple:'#8e44ad',pink:'#e91e63',black:'#000',white:'#fff',gray:'#666',teal:'#1abc9c',navy:'#2c3e50',cyan:'#00bcd4'}
        if (cm) { const hex = colors[cm[1].toLowerCase()] || (cm[1].startsWith('#') ? cm[1] : null); if (hex) inst = {action:'change_color',target:tm?.[1]||'button',value:hex} }
      }

      if (inst && inst.action === 'change_color' && inst.value) {
        let h = currentHtml, ok = false
        const hex = inst.value, t = (inst.target||'').toLowerCase()
        if (t.includes('button')||t.includes('cta')) { h = h.replace(/(<td\s[^>]*bgcolor=")([^"]+)("[^>]*>[\s\S]{0,500}?<a[^>]*padding)/gi, (_:string,a:string,__:string,b:string)=>{ok=true;return a+hex+b}) }
        else if (t.includes('header')||t.includes('banner')||t.includes('top')) { let c=0; h = h.replace(/bgcolor="(#[0-9a-fA-F]{3,6})"/gi, (_:string,v:string)=>{if(c===0&&v.toLowerCase()!=='#edf0f2'&&v.toLowerCase()!=='#ffffff'){c++;ok=true;return`bgcolor="${hex}"`}return _}) }
        else if (t.includes('background')||t.includes('bg')||t.includes('body')) { h=h.replace(/bgcolor="#EDF0F2"/gi,()=>{ok=true;return`bgcolor="${hex}"`}).replace(/background-color:\s*#EDF0F2/gi,()=>{ok=true;return`background-color: ${hex}`}) }
        if (ok) return NextResponse.json({ html: h, editDescription: `${t} color → ${hex}` })
      }
      if (inst && inst.action === 'replace_text' && inst.find) {
        let h = currentHtml
        if (h.includes(inst.find)) { h = h.split(inst.find).join(inst.replace||''); return NextResponse.json({ html: h, editDescription: `Replaced "${inst.find}"` }) }
        const re = new RegExp(inst.find.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi')
        if (re.test(h)) { h = h.replace(re, inst.replace||''); return NextResponse.json({ html: h, editDescription: `Replaced "${inst.find}"` }) }
      }
      if (inst && inst.action === 'change_button_text' && inst.value) {
        let h = currentHtml, ok = false
        h = h.replace(/(<a[^>]*style="[^"]*padding:\s*12px[^"]*text-decoration:\s*none[^"]*"[^>]*>)([\s\S]*?)(<\/a>)/gi, (_:string,a:string,__:string,b:string)=>{ok=true;return a+inst.value+b})
        if (ok) return NextResponse.json({ html: h, editDescription: `Button text → "${inst.value}"` })
      }
      // If JSON instruction didn't work, fall through to general AI below
    }

    // ── GENERAL AI: chat, build, edit, anything ──
    const SYS = `You are Letter Builder AI. You help build and edit HTML email letters.

WHEN EDITING existing HTML: The user's current email HTML is provided. Make the requested changes and return the COMPLETE modified HTML. Do NOT explain — just return the HTML.

WHEN BUILDING new emails: Return complete table-based HTML email (<!DOCTYPE to </html>), inline CSS, 600px width, proper header/body/button/footer.

WHEN ANSWERING questions: Return plain text.

NEVER give tutorials or code snippets. Either return the full modified/new HTML, or answer the question.`

    let userMsg = prompt || ''
    if (includeHtml && currentHtml) {
      const { availableForInput } = getContextBudget(provider as AIProvider, model, 500)
      // Reserve space for prompt + response; use up to 60% of available input for HTML
      const htmlBudget = Math.max(4000, Math.floor(availableForInput * 0.6))
      const tokens = estimateTokens(currentHtml)
      if (tokens > htmlBudget) {
        const trimmed = trimHtmlToFit(currentHtml, htmlBudget)
        userMsg = `My current email HTML (trimmed to fit):\n${trimmed}\n\nRequest: ${prompt}\n\nReturn the COMPLETE modified HTML.`
      } else {
        userMsg = `My current email HTML:\n${currentHtml}\n\nRequest: ${prompt}`
      }
    }

    if (conversationHistory?.length) {
      const hist = conversationHistory.slice(-4).map((m: any) => `${m.role}: ${m.content}`).join('\n')
      userMsg = `Chat history:\n${hist}\n\n${userMsg}`
    }

    const result = await callAI(provider, model, apiKey, SYS, userMsg, imageBase64)
    let html = result.replace(/```html?\s*/g, '').replace(/```/g, '')
    const doc = html.match(/(<!DOCTYPE[\s\S]*<\/html>)/i)
    if (doc) html = doc[1]

    // Detect if response is HTML or text
    const isHtml = (html.includes('<table') || html.includes('<html') || html.includes('<body')) && html.length > 200
    if (isHtml) return NextResponse.json({ html, editDescription: 'Changes applied' })
    return NextResponse.json({ html: result }) // text response

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
