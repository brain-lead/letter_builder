const COLOR_NAMES: Record<string, string> = {
  red: '#e74c3c', blue: '#0078D4', green: '#27ae60', yellow: '#f1c40f',
  orange: '#e67e22', purple: '#8e44ad', pink: '#e91e63', black: '#000000',
  white: '#ffffff', gray: '#666666', grey: '#666666', teal: '#1abc9c',
  navy: '#2c3e50', cyan: '#00bcd4', indigo: '#3f51b5', brown: '#795548',
  darkblue: '#003087', lightblue: '#5bc0de', darkgreen: '#1a7a1a',
  gold: '#ffd700', silver: '#c0c0c0', maroon: '#800000',
}

function resolveColor(val: string): string | null {
  if (!val) return null
  const lower = val.toLowerCase().trim()
  if (COLOR_NAMES[lower]) return COLOR_NAMES[lower]
  if (/^#[0-9a-f]{3,6}$/i.test(val)) return val
  if (/^[0-9a-f]{6}$/i.test(val)) return '#' + val
  return null
}

export type EditResult = {
  html: string
  changed: boolean
  description: string
}

function changeButtonColor(html: string, color: string): EditResult {
  const hex = resolveColor(color)
  if (!hex) return { html, changed: false, description: `Unknown color: ${color}` }
  let changed = false
  // Find td with bgcolor that contains an <a> with padding (CTA button)
  const result = html.replace(
    /(<td\s[^>]*bgcolor=")([^"]+)("[^>]*>[\s\S]{0,500}?<a[^>]*padding[^>]*>)/gi,
    (_m, p1, _old, p2) => { changed = true; return p1 + hex + p2 }
  )
  return {
    html: result,
    changed,
    description: changed
      ? `Button color changed to ${hex}`
      : 'Could not find button — try clicking the button in the visual editor and using the color picker',
  }
}

function changeHeaderColor(html: string, color: string): EditResult {
  const hex = resolveColor(color)
  if (!hex) return { html, changed: false, description: `Unknown color: ${color}` }
  let changed = false
  let count = 0
  const result = html.replace(/bgcolor="(#[0-9a-fA-F]{3,6})"/gi, (_m, c) => {
    if (count === 0 && c.toLowerCase() !== '#edf0f2' && c.toLowerCase() !== '#ffffff' && c.toLowerCase() !== '#f4f4f4') {
      count++; changed = true
      return `bgcolor="${hex}"`
    }
    return _m
  })
  return { html: result, changed, description: changed ? `Header color changed to ${hex}` : 'Could not find header' }
}

function changeBackgroundColor(html: string, color: string): EditResult {
  const hex = resolveColor(color)
  if (!hex) return { html, changed: false, description: `Unknown color: ${color}` }
  let changed = false
  const result = html
    .replace(/bgcolor="#EDF0F2"/gi, () => { changed = true; return `bgcolor="${hex}"` })
    .replace(/background-color:\s*#EDF0F2/gi, () => { changed = true; return `background-color: ${hex}` })
  return { html: result, changed, description: changed ? `Background changed to ${hex}` : 'Could not find background' }
}

function changeButtonText(html: string, newText: string): EditResult {
  let changed = false
  const result = html.replace(
    /(<a[^>]*style="[^"]*padding:\s*12px[^"]*text-decoration:\s*none[^"]*"[^>]*>)([\s\S]*?)(<\/a>)/gi,
    (_m, open, _old, close) => { changed = true; return open + newText + close }
  )
  return { html: result, changed, description: changed ? `Button text changed to "${newText}"` : 'Could not find button' }
}

function findAndReplace(html: string, find: string, replace: string): EditResult {
  if (html.includes(find)) {
    const result = html.split(find).join(replace)
    const count = html.split(find).length - 1
    return { html: result, changed: true, description: `Replaced ${count} occurrence${count !== 1 ? 's' : ''} of "${find}" with "${replace}"` }
  }
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'gi')
  if (regex.test(html)) {
    const result = html.replace(new RegExp(escaped, 'gi'), replace)
    return { html: result, changed: true, description: `Replaced "${find}" with "${replace}"` }
  }
  return { html, changed: false, description: `"${find}" not found in HTML` }
}

export function trySurgicalEdit(text: string, html: string): EditResult | null {
  const lower = text.toLowerCase().trim()

  // change/make/set X color to Y
  const colorMatch = lower.match(
    /(?:help\s+me\s+)?(?:change|make|set|update|turn)\s+(?:the\s+)?(.+?)\s+(?:color|colour|background|bg)?\s*(?:to|as|into)\s+([#a-z0-9]+)/i
  )
  if (colorMatch) {
    const target = colorMatch[1].toLowerCase().trim()
    const colorVal = colorMatch[2].trim()
    const hex = resolveColor(colorVal)
    if (hex) {
      if (target.includes('button') || target.includes('cta')) return changeButtonColor(html, colorVal)
      if (target.includes('header') || target.includes('banner') || target.includes('top') || target.includes('nav')) return changeHeaderColor(html, colorVal)
      if (target.includes('background') || target.includes('bg') || target.includes('body') || target.includes('outer')) return changeBackgroundColor(html, colorVal)
      // Generic — try button first, then header
      const btn = changeButtonColor(html, colorVal)
      if (btn.changed) return btn
      return changeHeaderColor(html, colorVal)
    }
  }

  // change button text to X
  const btnTextMatch = text.match(/change\s+(?:the\s+)?button\s+(?:text|label)\s+to\s+["']?(.+?)["']?\s*$/i)
  if (btnTextMatch) return changeButtonText(html, btnTextMatch[1].trim())

  // replace X with Y / change X to Y
  const replaceMatch = text.match(
    /(?:replace|change|swap)\s+(?:all\s+)?["']?([^"']+?)["']?\s+(?:to|with|into|for)\s+["']?([^"']+?)["']?\s*$/i
  )
  if (replaceMatch) {
    const find = replaceMatch[1].trim()
    const replace = replaceMatch[2].trim()
    if (find && replace) return findAndReplace(html, find, replace)
  }

  // direct hex: #XXXXXX to #YYYYYY
  const hexMatch = text.match(/(#[0-9a-fA-F]{6})\s+to\s+(#[0-9a-fA-F]{6})/i)
  if (hexMatch) {
    const result = html.split(hexMatch[1]).join(hexMatch[2])
    const changed = result !== html
    return { html: result, changed, description: changed ? `Replaced ${hexMatch[1]} with ${hexMatch[2]}` : `${hexMatch[1]} not found` }
  }

  return null
}
