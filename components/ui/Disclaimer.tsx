'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

export default function Disclaimer() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-zinc-950 border-t border-zinc-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-2 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <AlertTriangle size={10} />
        <span>Terms of Use & Legal Disclaimer</span>
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {expanded && (
        <div className="px-6 pb-4 text-[10px] leading-relaxed text-zinc-600 max-w-4xl mx-auto space-y-3">
          <div className="border-t border-zinc-800 pt-3">
            <p className="font-bold text-zinc-400 text-[11px] mb-2 flex items-center gap-1">
              <AlertTriangle size={12} className="text-amber-500" />
              TERMS OF USE — READ CAREFULLY
            </p>

            <p>
              <span className="text-zinc-400 font-semibold">1. LAWFUL USE ONLY.</span>{' '}
              Letter Builder ("the Tool") is provided exclusively for lawful purposes including but not limited to:
              legitimate business correspondence, marketing emails with proper consent, transactional notifications,
              internal communications, and email template design. Any use of this Tool for unlawful, fraudulent,
              deceptive, or malicious purposes is strictly prohibited.
            </p>

            <p>
              <span className="text-zinc-400 font-semibold">2. PROHIBITED ACTIVITIES.</span>{' '}
              You shall NOT use this Tool to: (a) create phishing emails or any communication designed to deceive
              recipients into revealing personal information, credentials, or financial data; (b) impersonate any
              person, company, or entity without explicit authorization; (c) distribute malware, ransomware, or
              any malicious code; (d) send unsolicited bulk emails (spam) in violation of CAN-SPAM Act, GDPR,
              CASL, or any applicable anti-spam legislation; (e) engage in social engineering attacks; (f) create
              fraudulent invoices, fake notifications, or deceptive correspondence; (g) violate any local, state,
              national, or international law or regulation.
            </p>

            <p>
              <span className="text-zinc-400 font-semibold">3. LEGAL CONSEQUENCES.</span>{' '}
              Violation of these terms may result in: (a) immediate termination of access without notice;
              (b) reporting to relevant law enforcement agencies including but not limited to the FBI (IC3),
              Interpol, local cybercrime units, and the Federal Trade Commission; (c) civil liability for damages
              caused by misuse; (d) criminal prosecution under applicable laws including the Computer Fraud and
              Abuse Act (CFAA), Wire Fraud statutes (18 U.S.C. § 1343), CAN-SPAM Act violations (up to $46,517
              per email), and equivalent international legislation; (e) penalties of up to $250,000 in fines
              and/or imprisonment of up to 20 years for wire fraud convictions.
            </p>

            <p>
              <span className="text-zinc-400 font-semibold">4. USER RESPONSIBILITY.</span>{' '}
              You are solely responsible for all content created using this Tool. You acknowledge that email
              communications are subject to various laws and regulations in different jurisdictions. You agree
              to comply with all applicable laws including but not limited to: CAN-SPAM Act (USA), GDPR (EU),
              CASL (Canada), PECR (UK), Spam Act 2003 (Australia), and any other relevant legislation in your
              jurisdiction.
            </p>

            <p>
              <span className="text-zinc-400 font-semibold">5. MONITORING & LOGGING.</span>{' '}
              Usage patterns may be monitored for security purposes. We reserve the right to investigate
              suspected violations and cooperate fully with law enforcement authorities. AI-generated content
              is processed through third-party providers (Groq, Anthropic) subject to their respective terms
              of service and acceptable use policies.
            </p>

            <p>
              <span className="text-zinc-400 font-semibold">6. NO WARRANTY.</span>{' '}
              This Tool is provided "AS IS" without warranty of any kind. Brain Lead shall not be liable for
              any damages arising from the use or inability to use this Tool, including but not limited to
              direct, indirect, incidental, consequential, or punitive damages.
            </p>

            <p>
              <span className="text-zinc-400 font-semibold">7. INDEMNIFICATION.</span>{' '}
              You agree to indemnify, defend, and hold harmless Brain Lead, its developers, affiliates, and
              contributors from any claims, damages, losses, or expenses arising from your use of this Tool
              or violation of these terms.
            </p>

            <p className="text-zinc-500 italic pt-2 border-t border-zinc-800">
              By using Letter Builder, you acknowledge that you have read, understood, and agree to be bound
              by these terms. If you do not agree, you must immediately cease all use of this Tool.
            </p>

            <p className="text-zinc-700 text-[9px] pt-1">
              © {new Date().getFullYear()} Brain Lead. All rights reserved. Letter Builder is an open-source
              tool for legitimate email development purposes only.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
