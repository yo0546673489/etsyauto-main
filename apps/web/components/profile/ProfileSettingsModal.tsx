'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Upload, Trash2, User, Save, Mail, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { onboardingApi } from '@/lib/api';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileSettingsModal({ isOpen, onClose }: ProfileSettingsModalProps) {
  const { user, setUser, uploadProfilePicture, deleteProfilePicture } = useAuth();
  const { showToast } = useToast();

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    shopName: user?.tenant_name || '',
  });

  // Update form when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        shopName: user.tenant_name || '',
      });
    }
  }, [user]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setError(null);
  };

  const handleUploadPicture = async () => {
    if (!fileInputRef.current?.files?.[0]) return;

    const file = fileInputRef.current.files[0];

    try {
      setIsUploading(true);
      setError(null);
      await uploadProfilePicture(file);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast('Profile picture uploaded successfully!', 'success');
    } catch (err: any) {
      const errorMsg = err.detail || 'Failed to upload profile picture';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePicture = async () => {
    try {
      setIsUploading(true);
      setError(null);
      await deleteProfilePicture();
      setPreview(null);
      showToast('Profile picture removed successfully!', 'success');
    } catch (err: any) {
      const errorMsg = err.detail || 'Failed to delete profile picture';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveChanges = async () => {
    try {
      setIsSaving(true);
      setError(null);

      // Update shop name if changed
      if (formData.shopName !== user?.tenant_name) {
        await onboardingApi.complete(formData.shopName, null);

        // Update user context
        if (setUser && user) {
          setUser({
            ...user,
            tenant_name: formData.shopName,
          });
        }
      }

      // Note: Username and email updates would require additional API endpoints
      // For now, we'll just show a success message for shop name
      showToast('Profile updated successfully!', 'success');
      onClose();
    } catch (err: any) {
      const errorMsg = err.detail || 'Failed to update profile';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isUploading && !isSaving) {
      setPreview(null);
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // Reset form to user values
      if (user) {
        setFormData({
          name: user.name || '',
          email: user.email || '',
          shopName: user.tenant_name || '',
        });
      }
      onClose();
    }
  };

  // Construct full image URL if it's a relative path
  const getImageUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    return `${baseUrl}${url}`;
  };

  const currentPicture = preview || getImageUrl(user?.profile_picture_url);
  const hasChanges = formData.shopName !== user?.tenant_name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Profile Settings</h2>
          <button
            onClick={handleClose}
            disabled={isUploading || isSaving}
            className="p-2 hover:bg-[var(--background)] rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger)]/30 rounded-lg">
            <p className="text-sm text-[var(--danger)]">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Profile Picture Section */}
          <div className="border-b border-[var(--border-color)] pb-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Profile Picture</h3>

            <div className="flex items-center gap-6">
              {/* Preview */}
              <div className="relative w-24 h-24 rounded-full bg-[var(--background)] border-2 border-[var(--border-color)] overflow-hidden flex items-center justify-center flex-shrink-0">
                {currentPicture ? (
                  <img
                    src={currentPicture}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-[var(--text-muted)]" />
                )}
              </div>

              {/* Actions */}
              <div className="flex-1 space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-dark)] text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    Choose Image
                  </button>

                  {preview && (
                    <button
                      onClick={handleUploadPicture}
                      disabled={isUploading || isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--success)] hover:bg-[var(--success)]/80 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {isUploading ? 'Uploading...' : 'Upload'}
                    </button>
                  )}

                  {user?.profile_picture_url && !preview && (
                    <button
                      onClick={handleDeletePicture}
                      disabled={isUploading || isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--danger)] hover:bg-[var(--danger)]/80 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  )}
                </div>

                <p className="text-xs text-[var(--text-muted)]">
                  Max size: 5MB • Formats: JPG, PNG, GIF, WebP
                </p>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Personal Information</h3>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Username
                </div>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled
                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Username changes coming soon
              </p>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Address
                </div>
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Email is verified and cannot be changed
              </p>
            </div>

            {/* Shop Name */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Shop Name
                </div>
              </label>
              <input
                type="text"
                value={formData.shopName}
                onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                disabled={isSaving || isUploading}
                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
                placeholder="Enter your shop name"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                This is your organization/tenant name
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 mt-8 pt-6 border-t border-[var(--border-color)]">
          <button
            onClick={handleClose}
            disabled={isUploading || isSaving}
            className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg font-medium hover:bg-[var(--card-bg-hover)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            onClick={handleSaveChanges}
            disabled={!hasChanges || isUploading || isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 gradient-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-[var(--primary)]/25"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
