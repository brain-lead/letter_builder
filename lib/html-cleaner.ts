// Detect if content is raw EML (has MIME headers)
export function isRawEml(text: string): boolean {
  const first500 = text.substring(0, 500)
  return /^(From:|Received:|MIME-Version:|Content-Type:|Subject:|Date:|Message-ID:|Return-Path:|Delivered-To:)/mi.test(first500)
}

// Client-side EML extraction (best effort — for paste scenarios)
// For proper parsing, use the /api/parse-eml server route
export function extractHtmlFromEml(eml: string): string {
  // Try to find HTML part in multipart message
  // Look for Content-Type: text/html followed by the HTML content

  // First, try to find base64 encoded HTML part
  const base64HtmlMatch = eml.match(
    /Content-Type:\s*text\/html[^\n]*\nContent-Transfer-Encoding:\s*base64\s*\n\s*\n([\s\S]*?)(?=\n--|\n\.\n|$)/i
  )
  if (base64HtmlMatch) {
    try {
      const cleaned = base64HtmlMatch[1].replace(/\s/g, '')
      return atob(cleaned)
    } catch {}
  }

  // Try quoted-printable HTML part
  const qpHtmlMatch = eml.match(
    /Content-Type:\s*text\/html[^\n]*\nContent-Transfer-Encoding:\s*quoted-printable\s*\n\s*\n([\s\S]*?)(?=\n--|\n\.\n|$)/i
  )
  if (qpHtmlMatch) {
    return decodeQuotedPrintable(qpHtmlMatch[1])
  }

  // Try 7bit/8bit HTML part (no encoding)
  const plainHtmlMatch = eml.match(
    /Content-Type:\s*text\/html[^\n]*\n(?:Content-Transfer-Encoding:\s*(?:7bit|8bit)[^\n]*\n)?\s*\n([\s\S]*?)(?=\n--|\n\.\n|$)/i
  )
  if (plainHtmlMatch) {
    return plainHtmlMatch[1].trim()
  }

  // Fallback: just find anything between <html> and </html>
  const htmlTagMatch = eml.match(/<html[\s\S]*<\/html>/i)
  if (htmlTagMatch) return htmlTagMatch[0]

  // Fallback: find anything between <body> and </body>
  const bodyMatch = eml.match(/<body[\s\S]*<\/body>/i)
  if (bodyMatch) return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>${bodyMatch[0]}</html>`

  // Last resort: try plain text part
  const textMatch = eml.match(
    /Content-Type:\s*text\/plain[^\n]*\n(?:Content-Transfer-Encoding:[^\n]*\n)?\s*\n([\s\S]*?)(?=\n--|\n\.\n|$)/i
  )
  if (textMatch) {
    const text = textMatch[1].trim()
    return wrapPlainText(text)
  }

  // Absolute last resort: strip headers and wrap whatever is left
  const headerEnd = eml.indexOf('\n\n')
  if (headerEnd > 0) {
    const body = eml.substring(headerEnd + 2).trim()
    if (body.includes('<')) return body
    return wrapPlainText(body)
  }

  return wrapPlainText(eml)
}

function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, '') // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

function wrapPlainText(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;">
<tr><td style="padding:40px;white-space:pre-wrap;font-size:14px;line-height:1.8;color:#333333;">
${escaped}
</td></tr></table></td></tr></table></body></html>`
}

// Clean messy HTML
export function cleanHtml(html: string): string {
  let r = html

  // Decode double-encoded entities
  r = r.replace(/&amp;nbsp;/gi, '&nbsp;')
  r = r.replace(/&amp;#(\d+);/g, '&#$1;')
  r = r.replace(/&amp;(\w+);/g, '&$1;')

  // Decode quoted-printable artifacts
  r = decodeQuotedPrintable(r)

  // Remove HTML comments
  r = r.replace(/<!--[\s\S]*?-->/g, '')

  // Remove MS Office conditional comments
  r = r.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')

  // Remove XML processing instructions
  r = r.replace(/<\?xml[\s\S]*?\?>/gi, '')

  // Remove mso-* styles
  r = r.replace(/mso-[^;:"']+:[^;:"']+;?/gi, '')

  // Remove class attributes
  r = r.replace(/\s+class\s*=\s*["'][^"']*["']/gi, '')

  // Remove empty style attributes
  r = r.replace(/\s+style\s*=\s*["']\s*["']/gi, '')

  // Remove <o:p> tags (Outlook)
  r = r.replace(/<\/?o:[^>]*>/gi, '')

  // Remove <v:*> tags (VML)
  r = r.replace(/<\/?v:[^>]*>/gi, '')

  // Remove xmlns attributes
  r = r.replace(/\s+xmlns[^=]*=\s*["'][^"']*["']/gi, '')

  // Collapse blank lines
  r = r.replace(/\n{3,}/g, '\n\n')

  return r.trim()
}

// Full clean — detects EML vs HTML automatically
export function fullClean(input: string): string {
  // If it's raw EML, extract HTML first
  if (isRawEml(input)) {
    const extracted = extractHtmlFromEml(input)
    return cleanHtml(extracted)
  }
  // Otherwise just clean the HTML
  return cleanHtml(input)
}
