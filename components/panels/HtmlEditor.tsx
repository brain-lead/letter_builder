'use client'
import Editor from '@monaco-editor/react'
import { useEditorStore } from '@/store/editor'
import { useRef } from 'react'

export default function HtmlEditor() {
  const { html, pushHtml } = useEditorStore()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = (value: string | undefined) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      pushHtml(value ?? '')
    }, 600)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 text-xs font-semibold text-zinc-400 bg-zinc-900 border-b border-zinc-700">
        HTML Source
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="html"
          theme="vs-dark"
          value={html}
          onChange={handleChange}
          options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', tabSize: 2 }}
        />
      </div>
    </div>
  )
}
