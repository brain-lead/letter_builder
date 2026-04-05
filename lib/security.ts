// ============================================================
// OBFUSCATION — works at HTML source level, invisible to reader
// ============================================================

// Entity encode email addresses only (not visible text)
// This makes emails unreadable to scrapers but browsers render them fine
function entityEncodeStr(text: string): string {
  return text.split('').map((c) => {
    const r = Math.random()
    if (r < 0.4) return `&#${c.charCodeAt(0)};`
    if (r < 0.7) return `&#x${c.charCodeAt(0).toString(16)};`
    return c
  }).join('')
}

// Obfuscate email addresses in href and visible text
export function obfuscateEmailsInHtml(html: string): string {
  // Obfuscate mailto: links
  let result = html.replace(
    /href\s*=\s*["']mailto:([^"']+)["']/gi,
    (_, email: string) => `href="mailto:${entityEncodeStr(email)}"`
  )
  // Obfuscate visible email addresses in text content (between > and <)
  result = result.replace(
    />([^<]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[^<]*?)</g,
    (match, fullText: string, email: string) => {
      return match.replace(email, entityEncodeStr(email))
    }
  )
  return result
}

// Insert HTML comments between characters of email addresses (breaks regex scrapers)
export function commentSplitEmails(html: string): string {
  return html.replace(
    />([^<]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[^<]*?)</g,
    (match, _fullText: string, email: string) => {
      const split = email.split('').join('<!-- -->')
      return match.replace(email, split)
    }
  )
}

// Smart obfuscation — only touches emails and links, NOT body text
export function smartObfuscate(html: string, level: 'light' | 'medium' | 'heavy' = 'medium'): string {
  let result = html

  // All levels: entity-encode email addresses
  result = obfuscateEmailsInHtml(result)

  if (level === 'medium' || level === 'heavy') {
    // Add HTML comment splits to emails
    result = commentSplitEmails(result)
  }

  if (level === 'heavy') {
    // Insert invisible decoy emails in hidden spans (confuses harvesters)
    const decoys = [
      '<span style="display:none;font-size:0;max-height:0;overflow:hidden;mso-hide:all;">noreply@trap.invalid</span>',
      '<span style="display:none;font-size:0;max-height:0;overflow:hidden;mso-hide:all;">abuse@honeypot.invalid</span>',
    ]
    // Insert decoys after the first <body> or <table> tag
    const insertPoint = result.search(/<body[^>]*>|<table[^>]*>/i)
    if (insertPoint >= 0) {
      const tagEnd = result.indexOf('>', insertPoint) + 1
      result = result.slice(0, tagEnd) + decoys.join('') + result.slice(tagEnd)
    }
  }

  return result
}

// ============================================================
// PII REDACTION
// ============================================================

export function redactAllPII(html: string): string {
  let r = html
  // Redact emails in text
  r = r.replace(
    />([^<]*?)(([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))([^<]*?)</g,
    (match, before: string, _full: string, local: string, domain: string, after: string) => {
      const parts = domain.split('.')
      return `>${before}${local[0]}***@${parts[0][0]}***.${parts.slice(1).join('.')}${after}<`
    }
  )
  // Redact phones
  r = r.replace(
    /(\+?\d{1,3}[-.\s]?)(\d{3,4})([-.\s]?\d{3,4})([-.\s]?\d{2,4})/g,
    (_, prefix: string, _m: string, _m2: string, last: string) => `${prefix}***${last}`
  )
  return r
}

// ============================================================
// SANITIZATION
// ============================================================

export function removeTrackingPixels(html: string): string {
  let r = html
  r = r.replace(/<img[^>]*(?:width\s*=\s*["']?1["']?\s*height\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?\s*width\s*=\s*["']?1["']?)[^>]*\/?>/gi, '')
  const trackers = [/open\.gif/i, /track\.gif/i, /pixel\.gif/i, /beacon\./i, /tracking\./i, /mailtrack/i, /readnotify/i]
  trackers.forEach((p) => {
    r = r.replace(new RegExp(`<img[^>]*src=["'][^"']*${p.source}[^"']*["'][^>]*/?>`, 'gi'), '')
  })
  return r
}

export function stripExternalResources(html: string): string {
  let r = html
  r = r.replace(/<script[\s\S]*?<\/script>/gi, '')
  r = r.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  r = r.replace(/<object[\s\S]*?<\/object>/gi, '')
  r = r.replace(/<embed[^>]*\/?>/gi, '')
  r = r.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
  r = r.replace(/javascript\s*:/gi, '')
  return r
}

export function sanitizeEmail(html: string): { html: string; warnings: string[]; actions: string[] } {
  const actions: string[] = []
  const warnings: string[] = []
  let r = html
  const len1 = r.length
  r = stripExternalResources(r)
  if (r.length < len1) actions.push('Removed scripts/iframes/event handlers')
  const len2 = r.length
  r = removeTrackingPixels(r)
  if (r.length < len2) actions.push('Removed tracking pixels')
  // Sanitize links
  r = r.replace(/<a\s([^>]*href\s*=\s*["']([^"']*)["'][^>]*)>/gi, (match, attrs: string, url: string) => {
    if (url.match(/bit\.ly|tinyurl|t\.co|goo\.gl/i)) warnings.push(`Shortened URL: ${url}`)
    if (url.match(/xn--/i)) warnings.push(`Punycode domain: ${url}`)
    if (!attrs.includes('rel=')) attrs += ' rel="noopener noreferrer"'
    return `<a ${attrs}>`
  })
  if (warnings.length) actions.push('Flagged suspicious links')
  return { html: r, warnings, actions }
}
