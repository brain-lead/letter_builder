import { NextRequest, NextResponse } from 'next/server'
import { callGroq } from '@/lib/ai/groq'
import { callClaude } from '@/lib/ai/claude'
import { estimateTokens, getContextBudget, trimHtmlToFit } from '@/types'

const EDIT_SYSTEM = `You do ONE small find-and-replace edit on HTML.
RULES:
1. Output ONLY the edited HTML. No preamble. No markdown.
2. Make ONLY the ONE change described. Everything else BYTE-FOR-BYTE identical.
3. Keep ALL structure, styles, colors, bgcolor identical.
4. Do NOT truncate — output the COMPLETE content.
5. For questions: plain text only.`

const VISION_SYSTEM = `You read email screenshots. Extract ALL visible text and colors.

Output this EXACT format (fill in values from the image):
BRAND: [brand/company name]
HEADER_COLOR: [hex color of the header bar, e.g. #0078D4]
HEADER_LINK: [text of the top-right link if visible]
BODY:
[copy every line of body text exactly as shown, one line per line]
BUTTON: [button text]
BANNER:
[copy any banner/notice text below the button]
SECOND_BODY:
[copy any text below the button that is NOT the banner, or write EMPTY if none]

Be EXACT. Copy text word for word from the image.`

function splitHtml(html: string): { beforeBody: string; body: string; afterBody: string } | null {
  const bodyOpenMatch = html.match(/<body[^>]*>/i)
  const bodyCloseIdx = html.lastIndexOf('</body>')
  if (!bodyOpenMatch || bodyCloseIdx === -1) return null
  const bodyOpenEnd = html.indexOf(bodyOpenMatch[0]) + bodyOpenMatch[0].length
  return { beforeBody: html.substring(0, bodyOpenEnd), body: html.substring(bodyOpenEnd, bodyCloseIdx), afterBody: html.substring(bodyCloseIdx) }
}

function splitBodyAndFooter(body: string): { content: string; footer: string } {
  const markers = ['SoFi Bank, N.A.', 'Member FDIC', '© 20', '&copy;', 'unsubscribe', 'privacy policy', 'all rights reserved']
  const tableStarts: number[] = []
  let searchFrom = 0
  while (true) {
    const idx = body.indexOf('<table', searchFrom)
    if (idx === -1) break
    tableStarts.push(idx)
    let depth = 0, i = idx
    while (i < body.length) {
      if (body.substring(i, i + 6).toLowerCase() === '<table') depth++
      if (body.substring(i, i + 8).toLowerCase() === '</table>') { depth--; if (depth === 0) { searchFrom = i + 8; break } }
      i++
    }
    if (i >= body.length) break
  }
  for (let i = tableStarts.length - 1; i >= 0; i--) {
    const s = tableStarts[i]
    if (s < body.length * 0.3) break
    const chunk = body.substring(s, Math.min(s + 2000, body.length)).toLowerCase()
    const isFooter = markers.some(m => chunk.includes(m.toLowerCase()))
    if (!isFooter) {
      if (i + 1 < tableStarts.length) return { content: body.substring(0, tableStarts[i + 1]), footer: body.substring(tableStarts[i + 1]) }
      break
    }
    if (i === 0 || tableStarts[i - 1] < body.length * 0.3) return { content: body.substring(0, s), footer: body.substring(s) }
  }
  return { content: body, footer: '' }
}

function cleanAIOutput(result: string): string {
  let r = result.replace(/```html?\s*/g, '').replace(/```/g, '')
  const firstTag = r.search(/<(?:div|table|!--|img|span|a|p|br|td|tr|h[1-6])/i)
  if (firstTag > 0) r = r.substring(firstTag)
  r = r.replace(/<\/?body[^>]*>/gi, '').replace(/<\/?html>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '')
  const lastClose = r.lastIndexOf('>')
  if (lastClose > 0) { const after = r.substring(lastClose + 1).trim(); if (after.length > 0 && !after.startsWith('<')) r = r.substring(0, lastClose + 1) }
  return r
}

// Parse vision output into structured data
function parseVisionOutput(plan: string): {
  brand: string; headerColor: string; headerLink: string;
  bodyLines: string[]; buttonText: string; bannerText: string; secondBody: string;
} {
  // Normalize line endings
  const p = plan.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const get = (key: string) => {
    const m = p.match(new RegExp(`${key}:\s*(.+)`, 'i'))
    return m?.[1]?.trim() || ''
  }

  // Extract multi-line block between KEY: and next KEY: or end
  const getBlock = (key: string) => {
    const pattern = new RegExp(`${key}:\s*\n([\\s\\S]*?)(?=\n(?:BRAND|HEADER_COLOR|HEADER_LINK|BODY|BUTTON|BANNER|SECOND_BODY):|$)`, 'i')
    const m = p.match(pattern)
    if (m) return m[1].trim()
    // Fallback: try without requiring newline after key
    const pattern2 = new RegExp(`${key}:[\\s]*([\\s\\S]*?)(?=(?:BRAND|HEADER_COLOR|HEADER_LINK|BODY|BUTTON|BANNER|SECOND_BODY):|$)`, 'i')
    const m2 = p.match(pattern2)
    return m2?.[1]?.trim() || ''
  }

  // More robust: split by known keys
  const sections: Record<string, string> = {}
  const keys = ['BRAND', 'HEADER_COLOR', 'HEADER_LINK', 'BODY', 'BUTTON', 'BANNER', 'SECOND_BODY']
  for (const key of keys) {
    const idx = p.search(new RegExp(`^${key}:`, 'im'))
    if (idx >= 0) {
      const afterKey = p.substring(idx + key.length + 1) // skip "KEY:"
      // Find next key
      let endIdx = afterKey.length
      for (const nextKey of keys) {
        const nextIdx = afterKey.search(new RegExp(`^${nextKey}:`, 'im'))
        if (nextIdx > 0 && nextIdx < endIdx) endIdx = nextIdx
      }
      sections[key] = afterKey.substring(0, endIdx).trim()
    }
  }

  const bodyRaw = sections['BODY'] || ''
  const bodyLines = bodyRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  return {
    brand: sections['BRAND'] || get('BRAND'),
    headerColor: sections['HEADER_COLOR'] || get('HEADER_COLOR'),
    headerLink: sections['HEADER_LINK'] || get('HEADER_LINK'),
    bodyLines,
    buttonText: sections['BUTTON'] || get('BUTTON'),
    bannerText: sections['BANNER'] || '',
    secondBody: sections['SECOND_BODY'] || '',
  }
}

// Apply brand swap on FULL HTML (head + body) — no AI, no token limits
function codeBrandSwap(fullHtml: string, v: ReturnType<typeof parseVisionOutput>): string {
  let r = fullHtml

  // === HEAD changes ===
  if (v.brand) {
    // Title
    r = r.replace(/<title>[^<]*<\/title>/i, `<title>${v.brand}</title>`)
    // JSON-LD name
    r = r.replace(/("name":\s*")[^"]*(")/, `$1${v.brand}$2`)
  }

  // === HEADER BAR color ===
  if (v.headerColor && /^#[0-9a-f]{6}$/i.test(v.headerColor)) {
    // Find the first colored table after <body> (the header bar)
    // It's the first table with a non-gray, non-white bgcolor
    r = r.replace(
      /(<table\s+bgcolor=")#(?!EDF0F2|ffffff|FFFFFF|f4f4f4|F4F4F4)([0-9a-fA-F]{6})("[^>]*style="[^"]*background-color:\s*)#[0-9a-fA-F]{6}/i,
      `$1${v.headerColor}$3${v.headerColor}`
    )
  }

  // === LOGO alt text ===
  if (v.brand) {
    r = r.replace(/alt="[^"]{1,20}"/gi, (match) => {
      const val = match.slice(5, -1)
      if (val.match(/chat|phone|mobile|bubble|spacer/i)) return match
      return `alt="${v.brand}"`
    })
  }

  // === HEADER LINK text ===
  if (v.headerLink) {
    r = r.replace(/>Log in[^<]*</gi, `>${v.headerLink}<`)
    r = r.replace(/>Sign in[^<]*</gi, `>${v.headerLink}<`)
  }

  // === BODY TEXT (first 16px td) ===
  if (v.bodyLines.length > 0) {
    const newBody = ' \n            ' + v.bodyLines.join('<br>\n            <br>\n            ') + ' '
    r = r.replace(
      /(<td[^>]*style="[^"]*font-size:\s*16px[^"]*padding-top:\s*50px[^"]*"[^>]*>)[\s\S]*?(<\/td>)/i,
      `$1${newBody}$2`
    )
  }

  // === BUTTON TEXT ===
  if (v.buttonText) {
    r = r.replace(
      /(<a[^>]*style="[^"]*padding:\s*12px[^"]*text-decoration:\s*none[^"]*"[^>]*>)[\s\S]*?(<\/a>)/gi,
      `$1${v.buttonText}$2`
    )
    r = r.replace(/>View your statement</gi, `>${v.buttonText}<`)
    r = r.replace(/>Get Started</gi, `>${v.buttonText}<`)
  }

  // === SECOND BODY (clear if EMPTY) ===
  if (v.secondBody.toUpperCase() === 'EMPTY' || v.secondBody === '') {
    r = r.replace(
      /(<td[^>]*style="[^"]*font-size:\s*16px[^"]*padding-bottom:\s*50px[^"]*"[^>]*>)[\s\S]*?(<\/td>)/i,
      `$1 $2`
    )
  } else if (v.secondBody) {
    r = r.replace(
      /(<td[^>]*style="[^"]*font-size:\s*16px[^"]*padding-bottom:\s*50px[^"]*"[^>]*>)[\s\S]*?(<\/td>)/i,
      `$1 ${v.secondBody} $2`
    )
  }

  // === BANNER TEXT ===
  if (v.bannerText && v.bannerText.length > 20) {
    r = r.replace(
      /(<td[^>]*style="[^"]*font-size:\s*14px[^"]*font-weight:\s*400[^"]*"[^>]*align="center">)[\s\S]*?(<\/td>)/i,
      `$1${v.bannerText}$2`
    )
  }

  // === DARK FOOTER BAR color ===
  if (v.headerColor && /^#[0-9a-f]{6}$/i.test(v.headerColor)) {
    // The dark bar (usually #201747 or similar) — change to brand color
    r = r.replace(
      /bgcolor="#201747"/gi, `bgcolor="${v.headerColor}"`
    )
    r = r.replace(
      /background-color:\s*#201747/gi, `background-color: ${v.headerColor}`
    )
  }

  // === Brand name in remaining visible text ===
  if (v.brand) {
    r = r.replace(/The SoFi Team/gi, `The ${v.brand} Team`)
    r = r.replace(/SoFi mobile app/gi, `${v.brand} app`)
    r = r.replace(/SoFi login information/gi, `${v.brand} login information`)
  }

  return r
}

async function callAI(provider: string, model: string, apiKey: string, system: string, prompt: string, imageBase64?: string): Promise<string> {
  if (provider === 'groq') return callGroq(apiKey, model, system, prompt, imageBase64)
  if (provider === 'claude') return callClaude(apiKey, model, system, prompt, imageBase64)
  throw new Error('Unknown provider')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { provider, model, apiKey, prompt, currentHtml, imageBase64, action, includeHtml, conversationHistory,
      visionProvider, visionModel, visionApiKey } = body

    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 400 })

    const budget = getContextBudget(provider, model, estimateTokens(EDIT_SYSTEM))
    const htmlParts = (includeHtml && currentHtml) ? splitHtml(currentHtml) : null

    let historyText = ''
    if (conversationHistory?.length) {
      historyText = conversationHistory.slice(-4).map((m: any) => `${m.role}: ${m.content}`).join('\n')
    }

    // ============================================
    // CASE 1: Image + existing HTML = vision plan + code apply
    // ============================================
    if (action === 'image-to-html' && imageBase64 && htmlParts) {
      // ONLY AI call: vision reads image (small request, fits any TPM)
      const vProv = visionProvider || provider
      const vModel = visionModel || model
      const vKey = visionApiKey || apiKey

      let plan = ''
      try {
        plan = await callAI(vProv, vModel, vKey, VISION_SYSTEM,
          'Read this email screenshot. Extract brand, colors, all text. Use the exact output format.',
          imageBase64)
      } catch (e: any) {
        return NextResponse.json({ error: `Vision failed: ${e.message}` }, { status: 500 })
      }

      // Parse and apply ALL replacements in code on FULL HTML
      const v = parseVisionOutput(plan)
      const html = codeBrandSwap(currentHtml, v)

      return NextResponse.json({
        html,
        plan,
        steps: [
          `Vision: brand="${v.brand}", color="${v.headerColor}", button="${v.buttonText}"`,
          `Body: ${v.bodyLines.length} lines`,
          'Code: applied all replacements on full HTML',
        ],
      })
    }

    // ============================================
    // CASE 2: Image only, no existing HTML
    // ============================================
    if (action === 'image-to-html' && imageBase64) {
      const result = await callAI(provider, model, apiKey,
        'Build HTML emails from screenshots. Return FULL HTML, inline CSS, table-based.',
        `Build a complete HTML email matching this image.${prompt ? ` ${prompt}` : ''}`,
        imageBase64)
      let html = result.replace(/```html?\s*/g, '').replace(/```/g, '')
      const doc = html.match(/(<!DOCTYPE[\s\S]*<\/html>)/i)
      if (doc) html = doc[1]
      return NextResponse.json({ html })
    }

    // ============================================
    // CASE 3: Smart edit — AI outputs JSON instruction, code applies it
    // ============================================
    if (htmlParts) {
      // Direct hex replacement (no AI needed)
      const hexReplaceMatch = prompt?.match(/(#[0-9a-fA-F]{6})\s+to\s+(#[0-9a-fA-F]{6})/i)
      if (hexReplaceMatch) {
        const newHtml = currentHtml.replace(new RegExp(hexReplaceMatch[1], 'gi'), hexReplaceMatch[2])
        return NextResponse.json({ html: newHtml })
      }

      // AI understands the request and outputs a JSON instruction
      // This is MUCH smaller than sending the full HTML — just the instruction
      const SMART_EDIT_SYSTEM = `You are an HTML email editor assistant. The user wants to make a change to their email.
Analyze the request and output ONLY a JSON object describing what to change.
Output format:
{"action": "change_color", "target": "button|header|background|text", "value": "#hexcolor"}
or
{"action": "replace_text", "find": "exact text to find", "replace": "new text"}
or
{"action": "change_button_text", "value": "new button text"}
or
{"action": "unknown", "message": "explain what you cannot do"}

For colors, always output a valid hex color code.
Output ONLY the JSON object, nothing else.`

      let instruction: any = null
      try {
        const aiResponse = await callAI(provider, model, apiKey, SMART_EDIT_SYSTEM, `User request: ${prompt}`)
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
        if (jsonMatch) instruction = JSON.parse(jsonMatch[0])
      } catch {}

      if (instruction && instruction.action !== 'unknown') {
        let newHtml = currentHtml
        let changed = false
        let description = ''

        if (instruction.action === 'change_color' && instruction.value) {
          const hex = instruction.value
          const target = (instruction.target || '').toLowerCase()
          if (target.includes('button') || target.includes('cta')) {
            newHtml = newHtml.replace(
              /(<td\s[^>]*bgcolor=")([^"]+)("[^>]*>[\s\S]{0,500}?<a[^>]*padding[^>]*>)/gi,
              (_m: string, p1: string, _old: string, p2: string) => { changed = true; return p1 + hex + p2 })

            description = `Button color changed to ${hex}`
          } else if (target.includes('header') || target.includes('banner') || target.includes('top')) {
            let count = 0
            newHtml = newHtml.replace(/bgcolor="(#[0-9a-fA-F]{3,6})"/gi, (_m: string, c: string) => {
              if (count === 0 && c.toLowerCase() !== '#edf0f2' && c.toLowerCase() !== '#ffffff') {
                count++; changed = true; return `bgcolor="${hex}"`
              }
              return _m
            });
            description = `Header color changed to ${hex}`
          } else if (target.includes('background') || target.includes('bg') || target.includes('body')) {
            newHtml = newHtml
              .replace(/bgcolor="#EDF0F2"/gi, () => { changed = true; return `bgcolor="${hex}"` })
              .replace(/background-color:\s*#EDF0F2/gi, () => { changed = true; return `background-color: ${hex}` })
            description = `Background changed to ${hex}`
          } else {
            // Generic — try all color targets
            newHtml = newHtml.replace(new RegExp(instruction.value.replace('#', '#'), 'gi'), hex)
            changed = true
            description = `Color changed to ${hex}`
          }
        } else if (instruction.action === 'replace_text' && instruction.find && instruction.replace !== undefined) {
          if (newHtml.includes(instruction.find)) {
            newHtml = newHtml.split(instruction.find).join(instruction.replace)
            changed = true
            description = `Replaced "${instruction.find}" with "${instruction.replace}"`
          } else {
            const regex = new RegExp(instruction.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
            newHtml = newHtml.replace(regex, instruction.replace)
            changed = newHtml !== currentHtml
            description = changed ? `Replaced "${instruction.find}" with "${instruction.replace}"` : `"${instruction.find}" not found`
          }
        } else if (instruction.action === 'change_button_text' && instruction.value) {
          newHtml = newHtml.replace(
            /(<a[^>]*style="[^"]*padding:\s*12px[^"]*text-decoration:\s*none[^"]*"[^>]*>)([\s\S]*?)(<\/a>)/gi,
            (_m: string, open: string, _old: string, close: string) => { changed = true; return open + instruction.value + close })

          description = changed ? `Button text changed to "${instruction.value}"` : 'Could not find button'
        }

        if (changed) {
          return NextResponse.json({ html: newHtml, editDescription: description })
        } else {
          return NextResponse.json({ error: description || 'Could not apply the change. Try using the visual editor.' }, { status: 400 })
        }
      }

      // Fallback: AI couldn't parse — return helpful message
      const msg = instruction?.message || 'Could not understand the request. Try: "change button color to blue" or "replace X with Y"'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // ============================================
    // CASE 4: Fresh prompt
    // ============================================
    let userPrompt = historyText ? `Chat:\n${historyText}\n\n${prompt}` : prompt

    const BUILD_SYSTEM = `You are Letter Builder AI. You build professional HTML email letters.

For email building requests, return COMPLETE HTML that:
- Starts with <!DOCTYPE html> and ends with </html>
- Uses TABLE-BASED layout (not div) for email client compatibility
- Has an outer table: width="100%", bgcolor="#f4f4f4" (light gray background)
- Has an inner table: width="600", centered, bgcolor="#ffffff" (white card)
- Has a colored HEADER bar with brand name in white text
- Has BODY content with proper padding (40-50px sides)
- Has a CTA BUTTON using table-based button (td with bgcolor, a with padding)
- Has a FOOTER with small gray text, copyright, unsubscribe placeholder
- Uses INLINE CSS only (style attributes, no <style> tags)
- Uses web-safe fonts: Arial, Helvetica, sans-serif
- Uses the brand's real colors if known (Google=#4285f4, Amazon=#ff9900, etc)
- Marks editable sections with data-editable attributes
- Looks like a REAL email from that company

For questions: return plain text only, no HTML.`

    const result = await callAI(provider, model, apiKey, BUILD_SYSTEM, userPrompt)
    let html = result.replace(/```html?\s*/g, '').replace(/```/g, '')
    const doc = html.match(/(<!DOCTYPE[\s\S]*<\/html>)/i)
    if (doc) html = doc[1]
    return NextResponse.json({ html })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
