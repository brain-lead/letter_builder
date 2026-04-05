'use client'
import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { useEditorStore } from '@/store/editor'
import { Undo2, Redo2, Key, ExternalLink } from 'lucide-react'
import SplashScreen from '@/components/ui/SplashScreen'
import Disclaimer from '@/components/ui/Disclaimer'
import FirstTimePopup from '@/components/ui/FirstTimePopup'
import AuthGate from '@/components/ui/AuthGate'
import ToolbarPanel from '@/components/panels/ToolbarPanel'

const HtmlEditor = dynamic(() => import('@/components/panels/HtmlEditor'), { ssr: false })
const VisualEditor = dynamic(() => import('@/components/panels/VisualEditor'), { ssr: false })
const ChatPanel = dynamic(() => import('@/components/panels/ChatPanel'), { ssr: false })

export default function Home() {
  const [showSplash, setShowSplash] = useState(true)
  const [isTrial, setIsTrial] = useState(false)
  const [showLicenseInput, setShowLicenseInput] = useState(false)
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseStatus, setLicenseStatus] = useState('')
  const onSplashFinish = useCallback(() => setShowSplash(false), [])
  const { undo, redo, canUndo, canRedo, historyIdx, history } = useEditorStore()

  // Check trial status
  useEffect(() => {
    const checkTrial = async () => {
      const { isTrialUser } = await import('@/lib/auth')
      setIsTrial(isTrialUser())
    }
    checkTrial()
  }, [])

  const handleUpgrade = async () => {
    if (!licenseKey.trim()) return
    setLicenseStatus('Verifying...')
    try {
      const { getHWID, saveLicense } = await import('@/lib/auth')
      const hwid = await getHWID()
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hwid, licenseKey: licenseKey.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (data.authorized) {
        saveLicense(licenseKey.trim().toUpperCase(), `licence_braintools_${licenseKey.trim().toUpperCase()}`)
        setLicenseStatus('✅ Activated! Reloading...')
        setTimeout(() => window.location.reload(), 1000)
      } else {
        setLicenseStatus(`❌ ${data.message}`)
      }
    } catch (e: any) {
      setLicenseStatus(`❌ ${e.message}`)
    }
  }

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
    <AuthGate>
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

          {/* Trial upgrade button */}
          {isTrial && (
            <div className="flex items-center gap-1.5 ml-2">
              {!showLicenseInput ? (
                <button onClick={() => setShowLicenseInput(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-600/40 text-xs transition-colors">
                  <Key size={11} /> Trial — Upgrade
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <input type="text" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                    placeholder="LICENSE-KEY" className="bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 border border-zinc-600 w-36 font-mono"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUpgrade(); if (e.key === 'Escape') setShowLicenseInput(false) }} autoFocus />
                  <button onClick={handleUpgrade} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded">Activate</button>
                  <button onClick={() => setShowLicenseInput(false)} className="text-xs text-zinc-500 hover:text-zinc-300 px-1">✕</button>
                  {licenseStatus && <span className="text-[10px] text-zinc-400">{licenseStatus}</span>}
                </div>
              )}
              <a href="https://t.me/brain_lead" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-[10px] text-indigo-400 hover:text-indigo-300">
                Buy <ExternalLink size={9} />
              </a>
            </div>
          )}

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
    </AuthGate>
  )
}
