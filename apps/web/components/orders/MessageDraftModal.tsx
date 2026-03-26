'use client'

import { useState } from 'react'
import { X, Send, Mail } from 'lucide-react'

interface MessageDraftModalProps {
  isOpen: boolean
  onClose: () => void
  customerName: string
  orderId: string
}

export function MessageDraftModal({ isOpen, onClose, customerName, orderId }: MessageDraftModalProps) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      setError('Please fill in both subject and message')
      return
    }

    try {
      setIsSending(true)
      setError(null)

      // TODO: Replace with actual API call to send message
      await new Promise(resolve => setTimeout(resolve, 1500)) // Simulate API call

      setSuccess(true)

      // Auto-close after showing success
      setTimeout(() => {
        handleClose()
      }, 2000)
    } catch (err: any) {
      setError(err.detail || 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  const handleClose = () => {
    if (!isSending) {
      setSubject('')
      setMessage('')
      setError(null)
      setSuccess(false)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-teal-400" />
              Draft Message
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              To: <span className="text-white font-medium">{customerName}</span> • Order: {orderId}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSending}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-sm text-green-400 font-medium">
              Message sent successfully!
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Subject Input */}
        <div className="mb-4">
          <label htmlFor="subject" className="block text-sm font-medium text-slate-300 mb-2">
            Subject
          </label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., Thank you for your order!"
            disabled={isSending || success}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Message Textarea */}
        <div className="mb-6">
          <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
            Message
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message to the customer..."
            rows={8}
            disabled={isSending || success}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-slate-400 mt-2">
            This message will be sent via Etsy's messaging system
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSend}
            disabled={isSending || success || !subject.trim() || !message.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {isSending ? 'Sending...' : 'Send Message'}
          </button>

          <button
            onClick={handleClose}
            disabled={isSending}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
