'use client'
import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { useEditorStore } from '@/store/editor'
import { Undo2, Redo2 } from 'lucide-react'
import SplashScreen from '@/components/ui/SplashScreen'
import Disclaimer from '@/components/ui/Disclaimer'
import FirstTimePopup from '@/components/ui/FirstTimePopup'
import ToolbarPanel from '@/components/panels/ToolbarPanel'

const HtmlEditor = dynamic(() => import('@/components/panels/HtmlEditor'), { ssr: false })
const VisualEditor = dynamic(() => import('@/components/panels/VisualEditor'), { ssr: false })
const ChatPanel = dynamic(() => import('@/components/panels/ChatPanel'), { ssr: false })

export default function Home() {
  const [showSplash, setShowSplash] = useState(true)
  const onSplashFinish = useCallback(() => setShowSplash(false), [])
  const { undo, redo, canUndo, canRedo, historyIdx, history } = useEditorStore()

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  return (
    <>
      {showSplash && <SplashScreen onFinish={onSplashFinish} />}
      {!showSplash && <FirstTimePopup />}

      <div className={`flex flex-col h-screen bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${showSplash ? 'opacity-0' : 'opacity-100'}`}>
        {/* Header with global undo/redo */}
        <header className="flex items-center gap-3 px-4 py-1.5 bg-zinc-900 border-b border-zinc-700 shrink-0">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              LETTER BUILDER
            </span>
            <span className="text-[10px] text-zinc-600 tracking-widest">by Brain Lead</span>
          </div>

          {/* Global Undo/Redo */}
          <div className="flex items-center gap-1 ml-4">
            <button onClick={undo} disabled={!canUndo()}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 border border-zinc-700 transition-colors"
              title="Undo (Ctrl+Z)">
              <Undo2 size={14} />
              <span className="text-xs">Undo</span>
            </button>
            <button onClick={redo} disabled={!canRedo()}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 border border-zinc-700 transition-colors"
              title="Redo (Ctrl+Y)">
              <Redo2 size={14} />
              <span className="text-xs">Redo</span>
            </button>
            <span className="text-[10px] text-zinc-600 ml-1">
              {historyIdx + 1}/{history.length}
            </span>
          </div>
        </header>

        {/* Main panels */}
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" className="h-full">
            <Panel defaultSize={30} minSize={15}>
              <HtmlEditor />
            </Panel>
            <PanelResizeHandle className="w-1 bg-zinc-700 hover:bg-indigo-500 transition-colors cursor-col-resize" />
            <Panel defaultSize={45} minSize={25}>
              <VisualEditor />
            </Panel>
            <PanelResizeHandle className="w-1 bg-zinc-700 hover:bg-indigo-500 transition-colors cursor-col-resize" />
            <Panel defaultSize={25} minSize={15}>
              <ChatPanel />
            </Panel>
          </PanelGroup>
        </div>

        {/* Bottom toolbar */}
        <div className="shrink-0">
          <ToolbarPanel />
        </div>

        <Disclaimer />
      </div>
    </>
  )
}
