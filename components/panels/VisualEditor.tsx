'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editor'
import {
  Undo2, Redo2, Type, PaintBucket, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Trash2, Copy, Eye, EyeOff,
  Minus, Plus, X, ImageIcon, Link,
} from 'lucide-react'

const COLORS = [
  '#000000','#1a1a1a','#333333','#666666','#999999','#cccccc','#ffffff',
  '#c0392b','#e74c3c','#e67e22','#f39c12','#f1c40f',
  '#27ae60','#2ecc71','#1abc9c','#2980b9','#3498db',
  '#8e44ad','#9b59b6','#34495e',
  '#4285f4','#0f9d58','#db4437','#f4b400',
  '#ff9900','#146eb4','#232f3e','#1877f2','#25d366','#0077b5',
]
const FONTS = ['Arial, Helvetica, sans-serif','Georgia, serif','Times New Roman, serif','Verdana, sans-serif','Tahoma, sans-serif','Courier New, monospace','Trebuchet MS, sans-serif']

export default function VisualEditor() {
  const { html, setHtml, pushHtml, undo, redo, canUndo, canRedo } = useEditorStore()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [selectedTag, setSelectedTag] = useState('')
  const [activePanel, setActivePanel] = useState<'textColor'|'bgColor'|null>(null)
  const [customColor, setCustomColor] = useState('#4285f4')
  const [fontSizeInput, setFontSizeInput] = useState('16')
  const [info, setInfo] = useState({ color:'', bg:'', fontSize:'16', fontFamily:'' })
  const [linkUrl, setLinkUrl] = useState('')
  const [imgTarget, setImgTarget] = useState<HTMLImageElement|null>(null)
  const [imgUrl, setImgUrl] = useState('')
  const imgFileRef = useRef<HTMLInputElement>(null)
  const [isLink, setIsLink] = useState(false)
  const [showOutlines, setShowOutlines] = useState(false)
  const syncTimer = useRef<ReturnType<typeof setTimeout>|null>(null)
  const isWriting = useRef(false)

  // Get iframe document
  const getDoc = () => iframeRef.current?.contentDocument || null
  const getWin = () => iframeRef.current?.contentWindow || null

  // Write HTML to iframe
  const ignoreNextSync = useRef(false)
  const writeToIframe = useCallback((h: string) => {
    const doc = getDoc()
    if (!doc) return
    isWriting.current = true
    ignoreNextSync.current = true
    doc.open()
    doc.write(`<!DOCTYPE html><html><head><style>
      body { margin: 0; padding: 0; }
      * { cursor: default; }
      a { cursor: pointer; }
      td[bgcolor], td[style*="background"], th[bgcolor], th[style*="background"] { cursor: pointer; }
      td[bgcolor]:hover, td[style*="background"]:hover, th[bgcolor]:hover, th[style*="background"]:hover,
      table[bgcolor]:hover, table[style*="background"]:hover,
      div[style*="background"]:hover { outline: 2px dashed rgba(99,102,241,0.5); outline-offset: -2px; }
      img { cursor: pointer; outline: none; transition: outline 0.1s; }
      img:hover { outline: 3px solid #6366f1; outline-offset: 2px; }
      ::selection { background: #b4d7ff; }
    </style></head><body>${h}</body></html>`)
    doc.close()
    doc.body.contentEditable = 'true'
    doc.body.style.outline = 'none'
    doc.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      const a = t.closest('a')
      if (a) e.preventDefault()
      if (t.tagName === 'IMG') {
        e.preventDefault()
        setImgTarget(t as HTMLImageElement)
        setImgUrl((t as HTMLImageElement).src.startsWith('data:') ? '' : (t as HTMLImageElement).src)
      }
      // Clear any box selection when clicking normally
      doc.querySelectorAll('[data-box-sel]').forEach(el => {
        (el as HTMLElement).style.outline = ''; el.removeAttribute('data-box-sel')
      })
      ;(doc as any)._selectedBox = null
    })
    // Right-click also selects the nearest colored container
    doc.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const t = e.target as HTMLElement
      const box = t.closest('td[bgcolor], td[style*="background"], th[bgcolor], table[bgcolor], table[style*="background"], div[style*="background"]') as HTMLElement
      if (box) {
        doc.querySelectorAll('[data-box-sel]').forEach(el => {
          (el as HTMLElement).style.outline = ''; el.removeAttribute('data-box-sel')
        })
        box.setAttribute('data-box-sel', '1')
        box.style.outline = '3px solid #6366f1'
        const bg = box.getAttribute('bgcolor') || box.style.backgroundColor || ''
        setSelectedTag(box.tagName.toLowerCase() + ' (box)')
        setInfo(prev => ({ ...prev, bg }))
        ;(doc as any)._selectedBox = box
      }
    })
    doc.addEventListener('input', () => {
      if (ignoreNextSync.current) { ignoreNextSync.current = false; return }
      syncFromIframe()
    })
    doc.addEventListener('selectionchange', () => updateInfo())
    doc.addEventListener('mouseup', () => updateInfo())
    doc.addEventListener('keyup', () => updateInfo())
    isWriting.current = false
    // Clear ignore flag after a short delay
    setTimeout(() => { ignoreNextSync.current = false }, 500)
  }, [])

  // Sync iframe content back to store (debounced) + commit to history
  const commitTimer = useRef<ReturnType<typeof setTimeout>|null>(null)
  const syncFromIframe = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      const doc = getDoc()
      if (!doc?.body || isWriting.current) return
      const content = doc.body.innerHTML
      lastWritten.current = content
      setHtml(content)
    }, 300)
    // Also commit to history after user stops typing for 1.5s
    if (commitTimer.current) clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(() => {
      const doc = getDoc()
      if (!doc?.body || isWriting.current) return
      pushHtml(doc.body.innerHTML)
    }, 1500)
  }, [setHtml, pushHtml])

  // Commit to undo history
  const commitHistory = useCallback(() => {
    const doc = getDoc()
    if (!doc?.body) return
    pushHtml(doc.body.innerHTML)
  }, [pushHtml])

  // Update info bar from current selection
  const updateInfo = () => {
    const doc = getDoc()
    if (!doc) return
    const sel = doc.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const node = sel.focusNode
    const el = node?.nodeType === 3 ? node.parentElement : node as HTMLElement
    if (!el) return
    const cs = getWin()!.getComputedStyle(el)
    setSelectedTag(el.tagName?.toLowerCase() || '')
    setInfo({
      color: cs.color,
      bg: cs.backgroundColor,
      fontSize: Math.round(parseFloat(cs.fontSize)).toString(),
      fontFamily: cs.fontFamily.split(',')[0].replace(/"/g, '').trim(),
    })
    setFontSizeInput(Math.round(parseFloat(cs.fontSize)).toString())
    const linkEl = el.closest('a')
    setIsLink(!!linkEl)
    setLinkUrl(linkEl ? linkEl.href : '')
  }

  // Execute command on iframe document
  const exec = (cmd: string, value?: string) => {
    const doc = getDoc()
    if (!doc) return
    // If changing bg color and a box is selected via right-click, change that box
    if ((cmd === 'hiliteColor' || cmd === 'backColor') && (doc as any)._selectedBox) {
      const box = (doc as any)._selectedBox as HTMLElement
      if (box.hasAttribute('bgcolor')) box.setAttribute('bgcolor', value || '')
      box.style.backgroundColor = value || ''
      box.style.outline = ''
      box.removeAttribute('data-box-sel')
      ;(doc as any)._selectedBox = null
      syncFromIframe()
      return
    }
    doc.execCommand(cmd, false, value)
    syncFromIframe()
  }

  // Re-render iframe when html changes from outside (upload, AI, undo)
  const lastWritten = useRef('')
  useEffect(() => {
    if (!iframeRef.current) return
    if (html === lastWritten.current) return
    lastWritten.current = html
    writeToIframe(html)
  }, [html, writeToIframe])

  // Force re-render on undo/redo by wrapping them
  const doUndo = () => { lastWritten.current = ''; undo() }
  const doRedo = () => { lastWritten.current = ''; redo() }

  // Initial load — only once
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    writeToIframe(html)
    lastWritten.current = html
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey||e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo() }
      if ((e.ctrlKey||e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); doRedo() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [undo, redo])

  // Commit history on blur (user stopped editing)
  useEffect(() => {
    const doc = getDoc()
    if (!doc) return
    const onBlur = () => commitHistory()
    doc.addEventListener('blur', onBlur)
    return () => doc.removeEventListener('blur', onBlur)
  }, [commitHistory])

  const applyFontSize = (size: number) => {
    const clamped = Math.max(8, Math.min(96, size))
    const doc = getDoc()
    if (!doc) return
    doc.execCommand('fontSize', false, '7')
    doc.querySelectorAll('font[size="7"]').forEach(f => {
      const s = doc.createElement('span')
      s.style.fontSize = `${clamped}px`
      s.innerHTML = f.innerHTML
      f.replaceWith(s)
    })
    setFontSizeInput(clamped.toString())
    syncFromIframe()
  }

  // Toolbar button — onMouseDown prevents iframe from losing focus
  const Btn = ({ onClick, title, disabled, active, children }: { onClick:()=>void; title:string; disabled?:boolean; active?:boolean; children:React.ReactNode }) => (
    <button onMouseDown={e => e.preventDefault()} onClick={e => { e.preventDefault(); onClick() }}
      title={title} disabled={disabled}
      className={`p-1.5 rounded transition-colors ${disabled?'opacity-30 cursor-not-allowed':active?'bg-indigo-600 text-white':'hover:bg-zinc-700 text-zinc-300'}`}>
      {children}
    </button>
  )

  const Sep = () => <div className="w-px h-5 bg-zinc-600 mx-0.5" />

  const ColorGrid = ({ type }: { type:'textColor'|'bgColor' }) => (
    <div className="absolute top-full left-0 mt-1 p-2 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl z-50 w-60">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {COLORS.map(c => <button key={c} onMouseDown={e=>e.preventDefault()} onClick={()=>{exec(type==='textColor'?'foreColor':'hiliteColor',c);setActivePanel(null)}} className="w-6 h-6 rounded border border-zinc-600 hover:scale-110 transition-transform" style={{backgroundColor:c}} title={c} />)}
      </div>
      <div className="flex gap-1 items-center">
        <input type="color" value={customColor} onChange={e=>setCustomColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
        <input type="text" value={customColor} onChange={e=>setCustomColor(e.target.value)} className="flex-1 bg-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 border border-zinc-600 font-mono" />
        <button onMouseDown={e=>e.preventDefault()} onClick={()=>{exec(type==='textColor'?'foreColor':'hiliteColor',customColor);setActivePanel(null)}} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded">Apply</button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 text-xs font-semibold text-zinc-400 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Visual Editor</span>
          {selectedTag && <span className="text-indigo-400 font-normal">• &lt;{selectedTag}&gt;</span>}
        </div>
        <span className="text-zinc-600 text-[10px]">Select text → toolbar • Right-click → change box color</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-zinc-800 border-b border-zinc-700 flex-wrap">
        <button onClick={()=>doUndo()} title="Undo" disabled={!canUndo()}
          className={`p-1.5 rounded transition-colors ${!canUndo()?'opacity-30 cursor-not-allowed':'hover:bg-zinc-700 text-zinc-300'}`}><Undo2 size={14}/></button>
        <button onClick={()=>doRedo()} title="Redo" disabled={!canRedo()}
          className={`p-1.5 rounded transition-colors ${!canRedo()?'opacity-30 cursor-not-allowed':'hover:bg-zinc-700 text-zinc-300'}`}><Redo2 size={14}/></button>
        <Sep/>
        <div className="relative">
          <Btn onClick={()=>setActivePanel(activePanel==='textColor'?null:'textColor')} title="Text Color">
            <div className="flex items-center gap-0.5"><Type size={14}/><div className="w-4 h-1.5 rounded-sm" style={{backgroundColor:info.color||'#000'}}/></div>
          </Btn>
          {activePanel==='textColor'&&<ColorGrid type="textColor"/>}
        </div>
        <div className="relative">
          <Btn onClick={()=>setActivePanel(activePanel==='bgColor'?null:'bgColor')} title="BG Color">
            <div className="flex items-center gap-0.5"><PaintBucket size={14}/><div className="w-4 h-1.5 rounded-sm border border-zinc-500" style={{backgroundColor:info.bg||'transparent'}}/></div>
          </Btn>
          {activePanel==='bgColor'&&<ColorGrid type="bgColor"/>}
        </div>
        <Sep/>
        <Btn onClick={()=>applyFontSize(parseInt(fontSizeInput)-1)} title="-"><Minus size={14}/></Btn>
        <select value={fontSizeInput}
          onChange={e=>{setFontSizeInput(e.target.value);applyFontSize(parseInt(e.target.value))}}
          onMouseDown={e=>e.stopPropagation()}
          className="bg-zinc-700 text-zinc-200 text-xs rounded px-1 py-1 border border-zinc-600 w-14">
          {[8,9,10,11,12,13,14,15,16,18,20,22,24,26,28,32,36,40,48,56,64,72].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <Btn onClick={()=>applyFontSize(parseInt(fontSizeInput)+1)} title="+"><Plus size={14}/></Btn>
        <Sep/>
        <select value={info.fontFamily} onChange={e=>exec('fontName',e.target.value)} onMouseDown={e=>e.stopPropagation()}
          className="bg-zinc-700 text-zinc-200 text-xs rounded px-1.5 py-1 border border-zinc-600 max-w-[110px]">
          <option value="">Font</option>
          {FONTS.map(f=><option key={f} value={f.split(',')[0].trim()}>{f.split(',')[0]}</option>)}
        </select>
        <Sep/>
        <Btn onClick={()=>exec('justifyLeft')} title="Left"><AlignLeft size={14}/></Btn>
        <Btn onClick={()=>exec('justifyCenter')} title="Center"><AlignCenter size={14}/></Btn>
        <Btn onClick={()=>exec('justifyRight')} title="Right"><AlignRight size={14}/></Btn>
        <Sep/>
        <Btn onClick={()=>exec('bold')} title="Bold"><Bold size={14}/></Btn>
        <Btn onClick={()=>exec('italic')} title="Italic"><Italic size={14}/></Btn>
        <Btn onClick={()=>exec('underline')} title="Underline"><Underline size={14}/></Btn>
        <Sep/>
        <Btn onClick={()=>setShowOutlines(!showOutlines)} title="Outlines" active={showOutlines}>{showOutlines?<Eye size={14}/>:<EyeOff size={14}/>}</Btn>
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-3 px-3 py-1 bg-zinc-800/50 border-b border-zinc-700 text-[10px] text-zinc-500">
        <span>Size: <span className="text-zinc-300">{info.fontSize}px</span></span>
        <span>Font: <span className="text-zinc-300">{info.fontFamily||'—'}</span></span>
        <span>Color: <span className="text-zinc-300">{info.color}</span></span>
        <span>BG: <span className="text-zinc-300">{info.bg}</span></span>
      </div>

      {/* Link editor */}
      {isLink&&<div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
        <Link size={12} className="text-indigo-400 shrink-0" />
        <input type="text" value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}
          onBlur={()=>{
            const doc = getDoc(); if (!doc) return
            const sel = doc.getSelection(); if (!sel?.focusNode) return
            const el = sel.focusNode.nodeType===3?sel.focusNode.parentElement:sel.focusNode as HTMLElement
            const a = el?.closest('a'); if (a) { a.href = linkUrl; syncFromIframe() }
          }}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();(e.target as HTMLInputElement).blur()}}}
          placeholder="https://..." className="flex-1 bg-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 border border-zinc-600 font-mono" />
        <span className="text-[9px] text-zinc-600 shrink-0">Enter to save</span>
      </div>}

      {/* Preview iframe */}
      <div className="flex-1 bg-zinc-200 overflow-hidden">
        <iframe
          ref={iframeRef}
          className="w-full h-full border-0"
          sandbox="allow-same-origin allow-scripts"
          title="Visual Editor"
        />
      
      {/* Image replace popup */}
      {imgTarget&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>{setImgTarget(null);setImgUrl('')}}>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-80 shadow-2xl" onClick={e=>e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3"><span className="text-sm font-semibold text-zinc-200 flex items-center gap-2"><ImageIcon size={14} className="text-indigo-400"/> Replace Image</span><button onClick={()=>{setImgTarget(null);setImgUrl('')}} className="p-1 hover:bg-zinc-700 rounded text-zinc-400"><X size={14}/></button></div>
          <div className="mb-2"><label className="text-[10px] text-zinc-500 mb-1 block">Image URL</label><div className="flex gap-1"><input type="text" value={imgUrl} onChange={e=>setImgUrl(e.target.value)} placeholder="https://..." className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 border border-zinc-600" onKeyDown={e=>{if(e.key==='Enter'){if(imgTarget&&imgUrl.trim()){imgTarget.src=imgUrl.trim();imgTarget.removeAttribute('srcset');setImgTarget(null);setImgUrl('');syncFromIframe();commitHistory()}}}}/><button onClick={()=>{if(imgTarget&&imgUrl.trim()){imgTarget.src=imgUrl.trim();imgTarget.removeAttribute('srcset');setImgTarget(null);setImgUrl('');syncFromIframe();commitHistory()}}} disabled={!imgUrl.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded">Apply</button></div></div>
          <div className="flex items-center gap-2 my-2"><div className="flex-1 h-px bg-zinc-700"/><span className="text-[10px] text-zinc-600">or</span><div className="flex-1 h-px bg-zinc-700"/></div>
          <button onClick={()=>imgFileRef.current?.click()} className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded border border-zinc-600 border-dashed"><ImageIcon size={12}/> Upload from computer</button>
          <input ref={imgFileRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(!f||!imgTarget)return;const r=new FileReader();r.onload=()=>{imgTarget.src=r.result as string;imgTarget.removeAttribute('srcset');setImgTarget(null);syncFromIframe();commitHistory()};r.readAsDataURL(f);e.target.value=''}} />
        </div>
      </div>}
    </div>
    </div>
  )
}
