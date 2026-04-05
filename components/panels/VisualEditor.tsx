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
  const { html, setHtml, pushHtml, undo, redo, canUndo, canRedo, historyIdx, history } = useEditorStore()
  const previewRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<HTMLElement | null>(null)
  const [selectedInfo, setSelectedInfo] = useState<{ tag: string; editable: string | null; color: string; bg: string; fontSize: string; fontFamily: string }>({ tag: '', editable: null, color: '', bg: '', fontSize: '', fontFamily: '' })
  const [activePanel, setActivePanel] = useState<'textColor' | 'bgColor' | null>(null)
  const [customColor, setCustomColor] = useState('#4285f4')
  const [showOutlines, setShowOutlines] = useState(false)

  // Image replace state
  const [hoveredImg, setHoveredImg] = useState<{ el: HTMLImageElement; rect: DOMRect } | null>(null)
  const [imgReplaceTarget, setImgReplaceTarget] = useState<HTMLImageElement | null>(null)
  const [imgUrl, setImgUrl] = useState('')
  const imgFileRef = useRef<HTMLInputElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync preview HTML back to store (pushes to global history)
  const syncToStore = useCallback(() => {
    if (!previewRef.current) return
    // Clone, strip editor artifacts
    const clone = previewRef.current.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-editor-selected]').forEach((el) => {
      el.removeAttribute('data-editor-selected');
      (el as HTMLElement).style.outline = ''
    })
    const newHtml = clone.innerHTML
    pushHtml(newHtml)
  }, [pushHtml])

  // Write HTML into preview div + attach image hover listeners
  useEffect(() => {
    if (!previewRef.current) return
    previewRef.current.innerHTML = html
    setSelected(null)
    setSelectedInfo({ tag: '', editable: null, color: '', bg: '', fontSize: '', fontFamily: '' })
    setHoveredImg(null)

    // Attach mouseover/mouseout to all images
    const imgs = previewRef.current.querySelectorAll('img')
    imgs.forEach((img) => {
      img.addEventListener('mouseenter', () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        const rect = img.getBoundingClientRect()
        const containerRect = previewRef.current!.parentElement!.getBoundingClientRect()
        // Use position relative to the preview container
        const relRect = {
          top: rect.top - containerRect.top,
          left: rect.left - containerRect.left,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        } as DOMRect
        setHoveredImg({ el: img as HTMLImageElement, rect: relRect })
      })
      img.addEventListener('mouseleave', () => {
        hoverTimer.current = setTimeout(() => setHoveredImg(null), 400)
      })
    })
  }, [html])

  // Read computed style of element
  const readEl = (el: HTMLElement) => {
    const cs = window.getComputedStyle(el)
    setSelectedInfo({
      tag: el.tagName.toLowerCase(),
      editable: el.getAttribute('data-editable'),
      color: el.style.color || cs.color,
      bg: el.style.backgroundColor || cs.backgroundColor,
      fontSize: el.style.fontSize || cs.fontSize,
      fontFamily: (el.style.fontFamily || cs.fontFamily).split(',')[0].replace(/"/g, '').trim(),
    })
  }

  // Click handler on preview
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const target = e.target as HTMLElement
    if (!previewRef.current?.contains(target)) return

    // Deselect previous
    if (selected) {
      selected.removeAttribute('data-editor-selected')
      selected.style.outline = ''
    }

    // Select new
    target.setAttribute('data-editor-selected', 'true')
    target.style.outline = '2px solid #6366f1'
    setSelected(target)
    readEl(target)
    setActivePanel(null)
  }, [selected])

  // Make ANY element editable on double-click (not just data-editable)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!previewRef.current?.contains(target)) return

    // Find the best element to make editable:
    // 1. Try data-editable parent first
    // 2. Then try closest td, p, h1-h6, span, div, li, a
    // 3. Fall back to the target itself
    const editable = (
      target.closest('[data-editable]') ||
      target.closest('td, p, h1, h2, h3, h4, h5, h6, li, div, span, a')
    ) as HTMLElement

    const el = editable || target
    if (!el || el === previewRef.current) return

    el.contentEditable = 'true'
    el.focus()
    el.style.outline = '2px solid #6366f1'
    el.style.cursor = 'text'

    // Select all text in the element for easy replacement
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)

    const onBlur = () => {
      el.contentEditable = 'false'
      el.style.outline = ''
      el.style.cursor = ''
      el.removeEventListener('blur', onBlur)
      syncToStore()
    }
    el.addEventListener('blur', onBlur)

    // Also sync on Enter key (for single-line edits)
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        el.blur()
        ev.preventDefault()
      }
    }
    el.addEventListener('keydown', onKeyDown as any, { once: true })
  }, [syncToStore])

  // Replace image by URL
  const replaceImageWithUrl = () => {
    if (!imgReplaceTarget || !imgUrl.trim()) return
    imgReplaceTarget.src = imgUrl.trim()
    imgReplaceTarget.removeAttribute('srcset')
    setImgReplaceTarget(null)
    setImgUrl('')
    setHoveredImg(null)
    syncToStore()
  }

  // Replace image by file upload (base64)
  const replaceImageWithFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !imgReplaceTarget) return
    const reader = new FileReader()
    reader.onload = () => {
      imgReplaceTarget.src = reader.result as string
      imgReplaceTarget.removeAttribute('srcset')
      setImgReplaceTarget(null)
      setHoveredImg(null)
      syncToStore()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Apply style to selected element
  const applyStyle = (prop: string, value: string) => {
    if (!selected) return;
    (selected.style as any)[prop] = value
    readEl(selected)
    syncToStore()
  }

  const applyColor = (color: string, type: 'textColor' | 'bgColor') => {
    if (!selected) return
    if (type === 'textColor') selected.style.color = color
    else selected.style.backgroundColor = color
    readEl(selected)
    syncToStore()
    setActivePanel(null)
  }

  const deleteSelected = () => {
    if (!selected) return
    selected.remove()
    setSelected(null)
    syncToStore()
  }

  const duplicateSelected = () => {
    if (!selected) return
    const clone = selected.cloneNode(true) as HTMLElement
    clone.style.outline = ''
    clone.removeAttribute('data-editor-selected')
    selected.parentNode?.insertBefore(clone, selected.nextSibling)
    syncToStore()
  }

  const changeFontSize = (delta: number) => {
    if (!selected) return
    const current = parseInt(window.getComputedStyle(selected).fontSize) || 16
    applyStyle('fontSize', `${Math.max(8, Math.min(72, current + delta))}px`)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if (e.key === 'Escape' && selected) {
        selected.style.outline = ''
        selected.removeAttribute('data-editor-selected')
        setSelected(null)
      }
      if (e.key === 'Delete' && selected && document.activeElement === document.body) {
        deleteSelected()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selected])

  const Btn = ({ onClick, title, active, disabled, children }: { onClick: () => void; title: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) => (
    <button onClick={onClick} title={title} disabled={disabled}
      className={`p-1.5 rounded transition-colors ${disabled ? 'opacity-30 cursor-not-allowed' : active ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-700 text-zinc-300'}`}>
      {children}
    </button>
  )

  const Sep = () => <div className="w-px h-5 bg-zinc-600 mx-0.5" />

  const ColorGrid = ({ type }: { type: 'textColor' | 'bgColor' }) => (
    <div className="absolute top-full left-0 mt-1 p-2 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl z-50 w-60">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {COLORS.map((c) => (
          <button key={c} onClick={() => applyColor(c, type)}
            className="w-6 h-6 rounded border border-zinc-600 hover:scale-110 transition-transform"
            style={{ backgroundColor: c }} title={c} />
        ))}
      </div>
      <div className="flex gap-1 items-center">
        <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
        <input type="text" value={customColor} onChange={(e) => setCustomColor(e.target.value)}
          className="flex-1 bg-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 border border-zinc-600 font-mono" />
        <button onClick={() => applyColor(customColor, type)}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded">Apply</button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-1.5 text-xs font-semibold text-zinc-400 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Visual Editor</span>
          {selected && (
            <span className="text-indigo-400 font-normal">
              • &lt;{selectedInfo.tag}&gt;{selectedInfo.editable ? ` [${selectedInfo.editable}]` : ''}
            </span>
          )}
        </div>
        <span className="text-zinc-600 text-[10px]">Click to select • Double-click to edit text • Esc to deselect</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-zinc-800 border-b border-zinc-700 flex-wrap">
        <Btn onClick={undo} title="Undo (Ctrl+Z)" disabled={!canUndo()}><Undo2 size={14} /></Btn>
        <Btn onClick={redo} title="Redo (Ctrl+Y)" disabled={!canRedo()}><Redo2 size={14} /></Btn>
        <Sep />

        {/* Text color */}
        <div className="relative">
          <Btn onClick={() => setActivePanel(activePanel === 'textColor' ? null : 'textColor')} title="Text Color" disabled={!selected}>
            <div className="flex items-center gap-0.5">
              <Type size={14} />
              <div className="w-4 h-1.5 rounded-sm" style={{ backgroundColor: selectedInfo.color || '#000' }} />
            </div>
          </Btn>
          {activePanel === 'textColor' && selected && <ColorGrid type="textColor" />}
        </div>

        {/* Background color */}
        <div className="relative">
          <Btn onClick={() => setActivePanel(activePanel === 'bgColor' ? null : 'bgColor')} title="Background Color" disabled={!selected}>
            <div className="flex items-center gap-0.5">
              <PaintBucket size={14} />
              <div className="w-4 h-1.5 rounded-sm border border-zinc-500" style={{ backgroundColor: selectedInfo.bg || 'transparent' }} />
            </div>
          </Btn>
          {activePanel === 'bgColor' && selected && <ColorGrid type="bgColor" />}
        </div>

        <Sep />

        {/* Font size */}
        <Btn onClick={() => changeFontSize(-1)} title="Decrease font" disabled={!selected}><Minus size={14} /></Btn>
        <span className="text-xs text-zinc-400 w-8 text-center">{selected ? parseInt(selectedInfo.fontSize) || '?' : '-'}</span>
        <Btn onClick={() => changeFontSize(1)} title="Increase font" disabled={!selected}><Plus size={14} /></Btn>

        <Sep />

        {/* Font family */}
        <select
          value={selectedInfo.fontFamily || ''}
          onChange={(e) => applyStyle('fontFamily', e.target.value)}
          disabled={!selected}
          className="bg-zinc-700 text-zinc-200 text-xs rounded px-1.5 py-1 border border-zinc-600 max-w-[110px] disabled:opacity-30"
        >
          <option value="">Font</option>
          {FONTS.map((f) => (
            <option key={f} value={f}>{f.split(',')[0]}</option>
          ))}
        </select>

        <Sep />

        {/* Alignment */}
        <Btn onClick={() => applyStyle('textAlign', 'left')} title="Align left" disabled={!selected}><AlignLeft size={14} /></Btn>
        <Btn onClick={() => applyStyle('textAlign', 'center')} title="Center" disabled={!selected}><AlignCenter size={14} /></Btn>
        <Btn onClick={() => applyStyle('textAlign', 'right')} title="Align right" disabled={!selected}><AlignRight size={14} /></Btn>

        <Sep />

        {/* Bold/Italic/Underline — applies to selected element */}
        <Btn onClick={() => {
          if (!selected) return
          const fw = window.getComputedStyle(selected).fontWeight
          applyStyle('fontWeight', parseInt(fw) >= 700 ? 'normal' : 'bold')
        }} title="Bold" disabled={!selected}><Bold size={14} /></Btn>
        <Btn onClick={() => {
          if (!selected) return
          const fs = window.getComputedStyle(selected).fontStyle
          applyStyle('fontStyle', fs === 'italic' ? 'normal' : 'italic')
        }} title="Italic" disabled={!selected}><Italic size={14} /></Btn>
        <Btn onClick={() => {
          if (!selected) return
          const td = window.getComputedStyle(selected).textDecoration
          applyStyle('textDecoration', td.includes('underline') ? 'none' : 'underline')
        }} title="Underline" disabled={!selected}><Underline size={14} /></Btn>

        <Sep />

        {/* Padding quick adjust */}
        <span className="text-[10px] text-zinc-500">Pad:</span>
        {[0, 8, 16, 24, 40].map((v) => (
          <button key={v} onClick={() => applyStyle('padding', `${v}px`)} disabled={!selected}
            className="text-[10px] px-1 py-0.5 rounded border border-zinc-600 hover:bg-zinc-700 text-zinc-400 disabled:opacity-30">
            {v}
          </button>
        ))}

        <Sep />

        <Btn onClick={duplicateSelected} title="Duplicate" disabled={!selected}><Copy size={14} /></Btn>
        <Btn onClick={deleteSelected} title="Delete (Del)" disabled={!selected}><Trash2 size={14} /></Btn>
        <Sep />
        <Btn onClick={() => setShowOutlines(!showOutlines)} title="Toggle outlines" active={showOutlines}>
          {showOutlines ? <Eye size={14} /> : <EyeOff size={14} />}
        </Btn>

        {selected && (
          <>
            <Sep />
            <Btn onClick={() => {
              selected.style.outline = ''
              selected.removeAttribute('data-editor-selected')
              setSelected(null)
              setActivePanel(null)
            }} title="Deselect (Esc)"><X size={14} /></Btn>
          </>
        )}
      </div>

      {/* Selected element info bar */}
      {selected && (
        <div className="flex items-center gap-3 px-3 py-1 bg-zinc-800/50 border-b border-zinc-700 text-[10px] text-zinc-500">
          <span>Color: <span className="text-zinc-300">{selectedInfo.color}</span></span>
          <span>BG: <span className="text-zinc-300">{selectedInfo.bg}</span></span>
          <span>Size: <span className="text-zinc-300">{selectedInfo.fontSize}</span></span>
          <span>Font: <span className="text-zinc-300">{selectedInfo.fontFamily}</span></span>
        </div>
      )}

      {/* Preview area — click to select, double-click to edit */}
      <div className="flex-1 bg-zinc-200 overflow-auto relative" onClick={() => {
        if (selected) {
          selected.style.outline = ''
          selected.removeAttribute('data-editor-selected')
          setSelected(null)
          setActivePanel(null)
        }
      }}>
        <input ref={imgFileRef} type="file" accept="image/*" className="hidden" onChange={replaceImageWithFile} />

        <div
          ref={previewRef}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          className="min-h-full"
        />

        {/* Image hover overlay */}
        {hoveredImg && !imgReplaceTarget && (
          <div
            className="absolute z-20 flex items-center justify-center"
            style={{ top: hoveredImg.rect.top, left: hoveredImg.rect.left, width: hoveredImg.rect.width, height: hoveredImg.rect.height, pointerEvents: 'none' }}
          >
            <button
              className="pointer-events-auto flex items-center gap-1 bg-black/70 hover:bg-black/90 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg backdrop-blur-sm border border-white/20 transition-all"
              onClick={(e) => { e.stopPropagation(); setImgReplaceTarget(hoveredImg.el); setImgUrl(hoveredImg.el.src.startsWith('data:') ? '' : hoveredImg.el.src) }}
              onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }}
            >
              <ImageIcon size={12} /> Replace Image
            </button>
          </div>
        )}

        {/* Image replace popup */}
        {imgReplaceTarget && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40" onClick={() => { setImgReplaceTarget(null); setImgUrl('') }}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-zinc-200 flex items-center gap-2"><ImageIcon size={14} className="text-indigo-400" /> Replace Image</span>
                <button onClick={() => { setImgReplaceTarget(null); setImgUrl('') }} className="p-1 hover:bg-zinc-700 rounded text-zinc-400"><X size={14} /></button>
              </div>

              {/* Current image preview */}
              {imgReplaceTarget.src && !imgReplaceTarget.src.startsWith('data:') && (
                <div className="mb-3 bg-zinc-800 rounded-lg p-2 flex items-center justify-center">
                  <img src={imgReplaceTarget.src} alt="current" className="max-h-16 max-w-full object-contain rounded" />
                </div>
              )}

              {/* URL input */}
              <div className="mb-2">
                <label className="text-[10px] text-zinc-500 mb-1 block flex items-center gap-1"><Link size={10} /> Image URL</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={imgUrl}
                    onChange={(e) => setImgUrl(e.target.value)}
                    placeholder="https://example.com/image.png"
                    className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 border border-zinc-600"
                    onKeyDown={(e) => { if (e.key === 'Enter') replaceImageWithUrl() }}
                  />
                  <button onClick={replaceImageWithUrl} disabled={!imgUrl.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded">
                    Apply
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-zinc-700" />
                <span className="text-[10px] text-zinc-600">or</span>
                <div className="flex-1 h-px bg-zinc-700" />
              </div>

              {/* File upload */}
              <button
                onClick={() => imgFileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded border border-zinc-600 border-dashed"
              >
                <ImageIcon size={12} /> Upload from computer
              </button>

              <p className="text-[9px] text-zinc-600 mt-2 text-center">Uploaded images are embedded as base64</p>
            </div>
          </div>
        )}

        {showOutlines && (
          <style>{`
            [data-editable] { outline: 1px dashed rgba(99,102,241,0.3) !important; }
            [data-editable]:hover { outline: 1px dashed rgba(99,102,241,0.6) !important; }
          `}</style>
        )}
      </div>
    </div>
  )
}
