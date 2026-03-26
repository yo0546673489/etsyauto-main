'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Copy, CheckCircle2, Loader2, X, Link as LinkIcon, AlertCircle } from 'lucide-react'
import { shopsApi } from '@/lib/api'
import { useLanguage } from '@/lib/language-context'

interface ConnectionStatusProps {
  title: string
  status: 'connected' | 'not_connected'
  shopName?: string
}

export function ConnectionStatus({ title, status, shopName }: ConnectionStatusProps) {
  const router = useRouter()
  const { t } = useLanguage()
  const isConnected = status === 'connected'
  const [creating, setCreating] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [connectUrl, setConnectUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const handleCreateLink = async () => {
    try {
      setCreating(true)
      const { connect_url } = await shopsApi.createConnectLink()
      setConnectUrl(connect_url)
      setShowLinkModal(true)
      setCopied(false)
    } catch {
      router.push('/settings?tab=shops')
    } finally {
      setCreating(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(connectUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 4000)
    } catch {
      // fallback: select the text
    }
  }

  return (
    <>
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
            <div className="flex items-center space-x-2">
              {isConnected ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                {isConnected ? t('common.connected') : t('common.notConnected')}
              </span>
            </div>
            {isConnected && shopName && (
              <div className="text-dark-muted text-xs mt-1">
                {shopName}
              </div>
            )}
          </div>

          {!isConnected && (
            <button
              onClick={handleCreateLink}
              disabled={creating}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <LinkIcon className="w-3 h-3" />}
              {creating ? t('connection.creating') : t('connection.createLink')}
            </button>
          )}
        </div>
      </div>

      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('connection.linkCreated')}</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {t('connection.shareLinkMessage')}
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={connectUrl}
                className="flex-1 px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm font-mono"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 flex-shrink-0"
              >
                {copied ? <><CheckCircle2 className="w-4 h-4" />{t('connection.copied')}</> : <><Copy className="w-4 h-4" />{t('connection.copyLink')}</>}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{t('connection.linkExpires')}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
