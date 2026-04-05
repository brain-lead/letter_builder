import { NextRequest, NextResponse } from 'next/server'

// Manual extraction as fallback
function manualExtract(eml: string): string | null {
  // Base64 HTML part
  const b64 = eml.match(
    /Content-Type:\s*text\/html[^\n]*\nContent-Transfer-Encoding:\s*base64\s*\n\s*\n([\s\S]*?)(?=\n--)/i
  )
  if (b64) {
    try {
      const cleaned = b64[1].replace(/\s/g, '')
      return Buffer.from(cleaned, 'base64').toString('utf-8')
    } catch {}
  }

  // Quoted-printable HTML part
  const qp = eml.match(
    /Content-Type:\s*text\/html[^\n]*\nContent-Transfer-Encoding:\s*quoted-printable\s*\n\s*\n([\s\S]*?)(?=\n--)/i
  )
  if (qp) {
    return qp[1]
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  }

  // 7bit/8bit HTML
  const plain = eml.match(
    /Content-Type:\s*text\/html[^\n]*\n(?:Content-Transfer-Encoding:\s*(?:7bit|8bit)[^\n]*\n)?\s*\n([\s\S]*?)(?=\n--)/i
  )
  if (plain) return plain[1].trim()

  // Raw <html> tags
  const tag = eml.match(/<html[\s\S]*<\/html>/i)
  if (tag) return tag[0]

  return null
}

export async function POST(req: NextRequest) {
  try {
    const { eml } = await req.json()
    if (!eml) return NextResponse.json({ error: 'No EML content' }, { status: 400 })

    let html = ''
    let meta = { from: '', to: '', subject: '', date: '', attachmentCount: 0 }

    // Try mailparser first
    try {
      const { simpleParser } = await import('mailparser')
      const parsed: any = await simpleParser(eml, {
        skipHtmlToText: true,
        skipTextToHtml: false,
        skipImageLinks: false,
      } as any)

      if (parsed.html && typeof parsed.html === 'string' && parsed.html.length > 50) {
        html = parsed.html
      }

      // Extract metadata
      meta.from = parsed.from?.text || ''
      const toRaw = parsed.to
      if (Array.isArray(toRaw)) {
        meta.to = toRaw.map((a: any) => a.text || '').join(', ')
      } else if (toRaw && typeof toRaw === 'object') {
        meta.to = (toRaw as any).text || ''
      }
      meta.subject = parsed.subject || ''
      meta.date = parsed.date?.toISOString() || ''
      meta.attachmentCount = parsed.attachments?.filter((a: any) => a.contentDisposition !== 'inline').length || 0

      // Embed inline images
      if (html && parsed.attachments?.length) {
        for (const att of parsed.attachments) {
          if (att.content && att.contentType?.startsWith('image/')) {
            const b64 = att.content.toString('base64')
            const dataUri = `data:${att.contentType};base64,${b64}`
            if (att.contentId) {
              const cid = att.contentId.replace(/[<>]/g, '')
              html = html.replace(new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), dataUri)
            }
            if (att.filename) {
              const escaped = att.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              html = html.replace(new RegExp(`src=["'][^"']*${escaped}["']`, 'gi'), `src="${dataUri}"`)
            }
          }
        }
      }

      // If mailparser gave us text but no HTML
      if (!html && parsed.text) {
        const escaped = parsed.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;">
<tr><td style="padding:40px;white-space:pre-wrap;font-size:14px;line-height:1.8;color:#333;">${escaped}</td></tr>
</table></td></tr></table></body></html>`
      }
    } catch {
      // mailparser failed, continue to manual extraction
    }

    // If mailparser didn't get good HTML, try manual extraction
    if (!html || html.length < 50) {
      const manual = manualExtract(eml)
      if (manual) {
        html = manual
      }
    }

    if (!html) {
      return NextResponse.json({ error: 'Could not extract HTML from this EML file.' }, { status: 400 })
    }

    // Clean QP artifacts
    html = html.replace(/=\r?\n/g, '')
    html = html.replace(/=3D/g, '=')

    // Extract subject from headers if metadata is empty
    if (!meta.subject) {
      const subMatch = eml.match(/^Subject:\s*(.+)$/mi)
      if (subMatch) meta.subject = subMatch[1].trim()
    }
    if (!meta.from) {
      const fromMatch = eml.match(/^From:\s*(.+)$/mi)
      if (fromMatch) meta.from = fromMatch[1].trim()
    }

    return NextResponse.json({ html, meta })
  } catch (e: any) {
    return NextResponse.json({ error: `EML parse failed: ${e.message}` }, { status: 500 })
  }
}
