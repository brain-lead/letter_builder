'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editor'
import {
  Undo2, Redo2, Type, PaintBucket, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Trash2, Copy, Eye, EyeOff,
  Minus, Plus, X, ImageIcon, Link,
} from 'lucide-react'

const COLORS = [
  '#000000', '#1a1a1a', '#333333', '#666666', '#999999', '#cccccc', '#ffffff',
  '#c0392b', '#e74c3c', '#e67e22', '#f39c12', '#f1c40f',
  '#27ae60', '#2ecc71', '#1abc9c', '#2980b9', '#3498db',
  '#8e44ad', '#9b59b6', '#34495e',
  '#4285f4', '#0f9d58', '#db4437', '#f4b400',
  '#ff9900', '#146eb4', '#232f3e',
  '#1877f2', '#25d366', '#0077b5',
]

const FONTS = [
  'Arial, Helvetica, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  'Courier New, monospace',
  'Trebuchet MS, sans-serif',
]

export default function VisualEditor() {
  const { html, setHtml, pushHtml, undo, redo, canUndo, canRedo } = useEditorStore()
  const previewRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLElement | null>(null)
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null)
  const [activePanel, setActivePanel] = useState<'textColor' | 'bgColor' | null>(null)
  const [customColor, setCustomColor] = useState('#4285f4')
  const [showOutlines, setShowOutlines] = useState(false)
  const [fontSizeInput, setFontSizeInput] = useState('16')
  const [info, setInfo] = useState({ tag: '', color: '', bg: '', fontSize: '16', fontFamily: '' })
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Image replace
  const [hoveredImg, setHoveredImg] = useState<{ el: HTMLImageElement; rect: DOMRect } | null>(null)
  const [imgReplaceTarget, setImgReplaceTarget] = useState<HTMLImageElement | null>(null)
  const [imgUrl, setImgUrl] = useState('')
  const imgFileRef = useRef<HTMLInputElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync DOM → store (debounced, doesn't trigger re-render of preview)
  const syncToStore = useCallback((immediate = false) => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    const doSync = () => {
      if (!previewRef.current) return
      const clone = previewRef.current.cloneNode(true) as HTMLElement
      clone.querySelectorAll('[data-sel]').forEach(el => {
        el.removeAttribute('data-sel');
        (el as HTMLElement).style.outline = ''
      })
      // Use setHtml (not pushHtml) to avoid triggering the useEffect that rewrites innerHTML
      setHtml(clone.innerHTML)
    }
    if (immediate) doSync()
    else syncTimer.current = setTimeout(doSync, 300)
  }, [setHtml])

  // Commit to history (on deselect or major action)
  const commitToHistory = useCallback(() => {
    if (!previewRef.current) return
    const clone = previewRef.current.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-sel]').forEach(el => {
      el.removeAttribute('data-sel');
      (el as HTMLElement).style.outline = ''
    })
    pushHtml(clone.innerHTML)
  }, [pushHtml])

  // Write HTML into preview ONLY when html changes from OUTSIDE (AI, upload, undo/redo)
  // NOT when we sync from DOM → store
  const lastSyncedHtml = useRef(html)
  useEffect(() => {
    if (!previewRef.current) return
    if (html === lastSyncedHtml.current) return // came from our own sync, skip
    lastSyncedHtml.current = html
    previewRef.current.innerHTML = html
    selectedRef.current = null
    setSelectedEl(null)
    setHoveredImg(null)
    attachImageListeners()
  }, [html])

  // Initial render
  useEffect(() => {
    if (!previewRef.current) return
    previewRef.current.innerHTML = html
    lastSyncedHtml.current = html
    attachImageListeners()
  }, [])

  const attachImageListeners = () => {
    if (!previewRef.current) return
    previewRef.current.querySelectorAll('img').forEach((img) => {
      img.addEventListener('mouseenter', () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        const rect = img.getBoundingClientRect()
        const containerRect = previewRef.current!.parentElement!.getBoundingClientRect()
        setHoveredImg({
          el: img as HTMLImageElement,
          rect: { top: rect.top - containerRect.top, left: rect.left - containerRect.left, width: rect.width, height: rect.height } as DOMRect
        })
      })
      img.addEventListener('mouseleave', () => {
        hoverTimer.current = setTimeout(() => setHoveredImg(null), 400)
      })
    })
  }

  // Read styles from element
  const readEl = (el: HTMLElement) => {
    const cs = window.getComputedStyle(el)
    const fs = parseFloat(el.style.fontSize || cs.fontSize) || 16
    const fsStr = Math.round(fs).toString()
    setInfo({
      tag: el.tagName.toLowerCase(),
      color: el.style.color || cs.color,
      bg: el.style.backgroundColor || cs.backgroundColor,
      fontSize: fsStr,
      fontFamily: (el.style.fontFamily || cs.fontFamily).split(',')[0].replace(/"/g, '').trim(),
    })
    setFontSizeInput(fsStr)
  }

  // Select element
  const selectEl = (el: HTMLElement) => {
    // Deselect previous
    if (selectedRef.current && selectedRef.current !== el) {
      selectedRef.current.style.outline = ''
      selectedRef.current.removeAttribute('data-sel')
    }
    el.setAttribute('data-sel', '1')
    el.style.outline = '2px solid #6366f1'
    selectedRef.current = el
    setSelectedEl(el)
    readEl(el)
    setActivePanel(null)
  }

  // Deselect
  const deselect = () => {
    if (selectedRef.current) {
      selectedRef.current.style.outline = ''
      selectedRef.current.removeAttribute('data-sel')
      selectedRef.current = null
      setSelectedEl(null)
    }
  }

  // Apply style directly to DOM element (no store sync yet)
  const applyStyle = (prop: string, value: string) => {
    const el = selectedRef.current
    if (!el) return
    ;(el.style as any)[prop] = value
    readEl(el)
    syncToStore()
  }

  // Apply color
  const applyColor = (color: string, type: 'textColor' | 'bgColor') => {
    const el = selectedRef.current
    if (!el) return
    if (type === 'textColor') el.style.color = color
    else el.style.backgroundColor = color
    readEl(el)
    syncToStore()
    setActivePanel(null)
  }

  // Font size — apply immediately, no re-render
  const applyFontSize = (size: number) => {
    const el = selectedRef.current
    if (!el) return
    const clamped = Math.max(8, Math.min(96, size))
    el.style.fontSize = `${clamped}px`
    setFontSizeInput(clamped.toString())
    setInfo(prev => ({ ...prev, fontSize: clamped.toString() }))
    syncToStore()
  }

  const handleFontSizeInput = (val: string) => {
    setFontSizeInput(val)
    const n = parseInt(val)
    if (!isNaN(n) && n >= 8 && n <= 96) applyFontSize(n)
  }

  // Track if we're in text-edit mode (after double-click)
  const editingEl = useRef<HTMLElement | null>(null)

  // Bold toggle — works on text selection OR whole element
  const toggleBold = () => {
    if (editingEl.current) {
      document.execCommand('bold')
      syncToStore()
      return
    }
    const el = selectedRef.current
    if (!el) return
    const fw = window.getComputedStyle(el).fontWeight
    const isBold = parseInt(fw) >= 600 || fw === 'bold'
    el.style.fontWeight = isBold ? 'normal' : 'bold'
    syncToStore()
  }

  // Italic toggle
  const toggleItalic = () => {
    if (editingEl.current) {
      document.execCommand('italic')
      syncToStore()
      return
    }
    const el = selectedRef.current
    if (!el) return
    const isItalic = window.getComputedStyle(el).fontStyle === 'italic'
    el.style.fontStyle = isItalic ? 'normal' : 'italic'
    syncToStore()
  }

  // Underline toggle
  const toggleUnderline = () => {
    if (editingEl.current) {
      document.execCommand('underline')
      syncToStore()
      return
    }
    const el = selectedRef.current
    if (!el) return
    const td = window.getComputedStyle(el).textDecorationLine || ''
    el.style.textDecoration = td.includes('underline') ? 'none' : 'underline'
    syncToStore()
  }

  // Delete selected
  const deleteSelected = () => {
    const el = selectedRef.current
    if (!el) return
    el.remove()
    selectedRef.current = null
    setSelectedEl(null)
    commitToHistory()
  }

  // Duplicate selected
  const duplicateSelected = () => {
    const el = selectedRef.current
    if (!el) return
    const clone = el.cloneNode(true) as HTMLElement
    clone.style.outline = ''
    clone.removeAttribute('data-sel')
    el.parentNode?.insertBefore(clone, el.nextSibling)
    commitToHistory()
  }

  // Click handler
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const target = e.target as HTMLElement
    if (!previewRef.current?.contains(target)) return
    selectEl(target)
  }, [])

  // Double-click to edit text
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!previewRef.current?.contains(target)) return

    const editable = (
      target.closest('[data-editable]') ||
      target.closest('td, p, h1, h2, h3, h4, h5, h6, li, span, a, div')
    ) as HTMLElement

    const el = editable || target
    if (!el || el === previewRef.current) return

    el.contentEditable = 'true'
    el.focus()
    el.style.outline = '2px solid #22c55e'
    editingEl.current = el

    // Place cursor at click position
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)

    const onBlur = () => {
      el.contentEditable = 'false'
      el.style.outline = selectedRef.current === el ? '2px solid #6366f1' : ''
      el.removeEventListener('blur', onBlur)
      el.removeEventListener('input', onInput)
      editingEl.current = null
      commitToHistory()
    }
    const onInput = () => syncToStore()
    el.addEventListener('blur', onBlur)
    el.addEventListener('input', onInput)
  }, [syncToStore, commitToHistory])

  // Image replace
  const replaceImageWithUrl = () => {
    if (!imgReplaceTarget || !imgUrl.trim()) return
    imgReplaceTarget.src = imgUrl.trim()
    imgReplaceTarget.removeAttribute('srcset')
    setImgReplaceTarget(null); setImgUrl(''); setHoveredImg(null)
    commitToHistory()
  }

  const replaceImageWithFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !imgReplaceTarget) return
    const reader = new FileReader()
    reader.onload = () => {
      imgReplaceTarget.src = reader.result as string
      imgReplaceTarget.removeAttribute('srcset')
      setImgReplaceTarget(null); setHoveredImg(null)
      commitToHistory()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if (e.key === 'Escape') deselect()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const Btn = ({ onClick, title, active, disabled, children }: { onClick: () => void; title: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) => (
    <button
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }} // prevent losing selection
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      title={title} disabled={disabled}
      className={`p-1.5 rounded transition-colors ${disabled ? 'opacity-30 cursor-not-allowed' : active ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-700 text-zinc-300'}`}>
      {children}
    </button>
  )

  const Sep = () => <div className="w-px h-5 bg-zinc-600 mx-0.5" />

  const ColorGrid = ({ type }: { type: 'textColor' | 'bgColor' }) => (
    <div className="absolute top-full left-0 mt-1 p-2 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl z-50 w-60">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {COLORS.map((c) => (
          <button key={c}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyColor(c, type)}
            className="w-6 h-6 rounded border border-zinc-600 hover:scale-110 transition-transform"
            style={{ backgroundColor: c }} title={c} />
        ))}
      </div>
      <div className="flex gap-1 items-center">
        <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
        <input type="text" value={customColor} onChange={(e) => setCustomColor(e.target.value)}
          className="flex-1 bg-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 border border-zinc-600 font-mono" />
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => applyColor(customColor, type)}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded">Apply</button>
      </div>
    </div>
  )

  const hasSelection = !!selectedEl

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-1.5 text-xs font-semibold text-zinc-400 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Visual Editor</span>
          {selectedEl && <span className="text-indigo-400 font-normal">• &lt;{info.tag}&gt;</span>}
        </div>
        <span className="text-zinc-600 text-[10px]">Click = select • Double-click = edit text • Esc = deselect</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-zinc-800 border-b border-zinc-700 flex-wrap">
        <Btn onClick={undo} title="Undo (Ctrl+Z)" disabled={!canUndo()}><Undo2 size={14} /></Btn>
        <Btn onClick={redo} title="Redo (Ctrl+Y)" disabled={!canRedo()}><Redo2 size={14} /></Btn>
        <Sep />

        {/* Text Color */}
        <div className="relative">
          <Btn onClick={() => setActivePanel(activePanel === 'textColor' ? null : 'textColor')} title="Text Color" disabled={!hasSelection}>
            <div className="flex items-center gap-0.5">
              <Type size={14} />
              <div className="w-4 h-1.5 rounded-sm" style={{ backgroundColor: info.color || '#000' }} />
            </div>
          </Btn>
          {activePanel === 'textColor' && hasSelection && <ColorGrid type="textColor" />}
        </div>

        {/* BG Color */}
        <div className="relative">
          <Btn onClick={() => setActivePanel(activePanel === 'bgColor' ? null : 'bgColor')} title="Background Color" disabled={!hasSelection}>
            <div className="flex items-center gap-0.5">
              <PaintBucket size={14} />
              <div className="w-4 h-1.5 rounded-sm border border-zinc-500" style={{ backgroundColor: info.bg || 'transparent' }} />
            </div>
          </Btn>
          {activePanel === 'bgColor' && hasSelection && <ColorGrid type="bgColor" />}
        </div>

        <Sep />

        {/* Font size */}
        <Btn onClick={() => applyFontSize(parseInt(fontSizeInput) - 1)} title="Decrease font size" disabled={!hasSelection}><Minus size={14} /></Btn>
        <input
          type="number"
          value={fontSizeInput}
          onChange={(e) => handleFontSizeInput(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          disabled={!hasSelection}
          className="w-12 text-center bg-zinc-700 text-zinc-200 text-xs rounded px-1 py-1 border border-zinc-600 disabled:opacity-30"
          min={8} max={96}
        />
        <Btn onClick={() => applyFontSize(parseInt(fontSizeInput) + 1)} title="Increase font size" disabled={!hasSelection}><Plus size={14} /></Btn>

        <Sep />

        {/* Font family */}
        <select
          value={info.fontFamily}
          onChange={(e) => applyStyle('fontFamily', e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={!hasSelection}
          className="bg-zinc-700 text-zinc-200 text-xs rounded px-1.5 py-1 border border-zinc-600 max-w-[110px] disabled:opacity-30"
        >
          <option value="">Font</option>
          {FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}
        </select>

        <Sep />

        {/* Alignment */}
        <Btn onClick={() => applyStyle('textAlign', 'left')} title="Align left" disabled={!hasSelection}><AlignLeft size={14} /></Btn>
        <Btn onClick={() => applyStyle('textAlign', 'center')} title="Center" disabled={!hasSelection}><AlignCenter size={14} /></Btn>
        <Btn onClick={() => applyStyle('textAlign', 'right')} title="Align right" disabled={!hasSelection}><AlignRight size={14} /></Btn>

        <Sep />

        {/* Bold / Italic / Underline */}
        <Btn onClick={toggleBold} title="Bold" disabled={!hasSelection}><Bold size={14} /></Btn>
        <Btn onClick={toggleItalic} title="Italic" disabled={!hasSelection}><Italic size={14} /></Btn>
        <Btn onClick={toggleUnderline} title="Underline" disabled={!hasSelection}><Underline size={14} /></Btn>

        <Sep />

        {/* Padding */}
        <span className="text-[10px] text-zinc-500">Pad:</span>
        {[0, 8, 16, 24, 40].map((v) => (
          <button key={v}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyStyle('padding', `${v}px`)}
            disabled={!hasSelection}
            className="text-[10px] px-1 py-0.5 rounded border border-zinc-600 hover:bg-zinc-700 text-zinc-400 disabled:opacity-30">
            {v}
          </button>
        ))}

        <Sep />

        <Btn onClick={duplicateSelected} title="Duplicate" disabled={!hasSelection}><Copy size={14} /></Btn>
        <Btn onClick={deleteSelected} title="Delete" disabled={!hasSelection}><Trash2 size={14} /></Btn>
        <Sep />
        <Btn onClick={() => setShowOutlines(!showOutlines)} title="Toggle outlines" active={showOutlines}>
          {showOutlines ? <Eye size={14} /> : <EyeOff size={14} />}
        </Btn>
        {hasSelection && (
          <>
            <Sep />
            <Btn onClick={deselect} title="Deselect (Esc)"><X size={14} /></Btn>
          </>
        )}
      </div>

      {/* Info bar */}
      {hasSelection && (
        <div className="flex items-center gap-3 px-3 py-1 bg-zinc-800/50 border-b border-zinc-700 text-[10px] text-zinc-500">
          <span>Size: <span className="text-zinc-300">{info.fontSize}px</span></span>
          <span>Font: <span className="text-zinc-300">{info.fontFamily || '—'}</span></span>
          <span>Color: <span className="text-zinc-300">{info.color}</span></span>
          <span>BG: <span className="text-zinc-300">{info.bg}</span></span>
        </div>
      )}

      {/* Preview */}
      <div className="flex-1 bg-zinc-200 overflow-auto relative"
        onClick={() => { deselect(); setActivePanel(null) }}>
        <input ref={imgFileRef} type="file" accept="image/*" className="hidden" onChange={replaceImageWithFile} />

        <div ref={previewRef} onClick={handleClick} onDoubleClick={handleDoubleClick} className="min-h-full" />

        {/* Image hover */}
        {hoveredImg && !imgReplaceTarget && (
          <div className="absolute z-20 flex items-center justify-center pointer-events-none"
            style={{ top: hoveredImg.rect.top, left: hoveredImg.rect.left, width: hoveredImg.rect.width, height: hoveredImg.rect.height }}>
            <button className="pointer-events-auto flex items-center gap-1 bg-black/70 hover:bg-black/90 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg border border-white/20"
              onClick={(e) => { e.stopPropagation(); setImgReplaceTarget(hoveredImg.el); setImgUrl(hoveredImg.el.src.startsWith('data:') ? '' : hoveredImg.el.src) }}
              onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }}>
              <ImageIcon size={12} /> Replace Image
            </button>
          </div>
        )}

        {/* Image replace popup */}
        {imgReplaceTarget && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40"
            onClick={() => { setImgReplaceTarget(null); setImgUrl('') }}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-zinc-200 flex items-center gap-2"><ImageIcon size={14} className="text-indigo-400" /> Replace Image</span>
                <button onClick={() => { setImgReplaceTarget(null); setImgUrl('') }} className="p-1 hover:bg-zinc-700 rounded text-zinc-400"><X size={14} /></button>
              </div>
              <div className="mb-2">
                <label className="text-[10px] text-zinc-500 mb-1 block flex items-center gap-1"><Link size={10} /> Image URL</label>
                <div className="flex gap-1">
                  <input type="text" value={imgUrl} onChange={(e) => setImgUrl(e.target.value)}
                    placeholder="https://example.com/image.png"
                    className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 border border-zinc-600"
                    onKeyDown={(e) => { if (e.key === 'Enter') replaceImageWithUrl() }} />
                  <button onClick={replaceImageWithUrl} disabled={!imgUrl.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded">Apply</button>
                </div>
              </div>
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-zinc-700" />
                <span className="text-[10px] text-zinc-600">or</span>
                <div className="flex-1 h-px bg-zinc-700" />
              </div>
              <button onClick={() => imgFileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded border border-zinc-600 border-dashed">
                <ImageIcon size={12} /> Upload from computer
              </button>
              <p className="text-[9px] text-zinc-600 mt-2 text-center">Uploaded images are embedded as base64</p>
            </div>
          </div>
        )}

        {showOutlines && (
          <style>{`
            #preview-root * { outline: 1px dashed rgba(99,102,241,0.15) !important; }
            #preview-root *:hover { outline: 1px dashed rgba(99,102,241,0.4) !important; }
          `}</style>
        )}
      </div>
    </div>
  )
}
