'use client'

import { useState, useRef } from 'react'
import { X, Upload, Trash2, User } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/lib/toast-context'

interface ProfilePictureModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ProfilePictureModal({ isOpen, onClose }: ProfilePictureModalProps) {
  const { user, uploadProfilePicture, deleteProfilePicture } = useAuth()
  const { showToast } = useToast()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB')
      return
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    setError(null)
  }

  const handleUpload = async () => {
    if (!fileInputRef.current?.files?.[0]) return

    const file = fileInputRef.current.files[0]

    try {
      setIsUploading(true)
      setError(null)
      await uploadProfilePicture(file)
      setPreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      showToast('Profile picture uploaded successfully!', 'success')
      onClose()
    } catch (err: any) {
      const errorMsg = err.detail || 'Failed to upload profile picture'
      setError(errorMsg)
      showToast(errorMsg, 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async () => {
    try {
      setIsUploading(true)
      setError(null)
      await deleteProfilePicture()
      setPreview(null)
      showToast('Profile picture removed successfully!', 'success')
      onClose()
    } catch (err: any) {
      const errorMsg = err.detail || 'Failed to delete profile picture'
      setError(errorMsg)
      showToast(errorMsg, 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (!isUploading) {
      setPreview(null)
      setError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onClose()
    }
  }

  // Construct full image URL if it's a relative path
  const getImageUrl = (url: string | null | undefined) => {
    if (!url) return null
    if (url.startsWith('http')) return url
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
    return `${baseUrl}${url}`
  }

  const currentPicture = preview || getImageUrl(user?.profile_picture_url)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Profile Picture</h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Preview */}
        <div className="mb-6 flex justify-center">
          <div className="relative w-40 h-40 rounded-full bg-slate-700 border-2 border-slate-600 overflow-hidden flex items-center justify-center">
            {currentPicture ? (
              <img
                src={currentPicture}
                alt="Profile"
                className="w-full h-full object-cover"
                onError={(e) => {
                  console.error('Failed to load image:', currentPicture)
                  e.currentTarget.onerror = null // Prevent infinite loop
                }}
              />
            ) : (
              <User className="w-20 h-20 text-slate-500" />
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* File Input */}
        <div className="mb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-5 h-5" />
            Choose Image
          </button>

          <p className="text-xs text-slate-400 mt-2 text-center">
            Max size: 5MB • Formats: JPG, PNG, GIF, WebP
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {preview && (
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          )}

          {user?.profile_picture_url && !preview && (
            <button
              onClick={handleDelete}
              disabled={isUploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Remove Picture
            </button>
          )}

          <button
            onClick={handleClose}
            disabled={isUploading}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
