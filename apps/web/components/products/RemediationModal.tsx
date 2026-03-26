/**
 * Remediation Modal
 * Allows users to fix policy violations by updating content
 */

import { useState } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';

interface RemediationModalProps {
  productId: number;
  generationId: number;
  currentTitle: string;
  currentDescription: string;
  currentTags: string[];
  policyFlags: string[];
  onClose: () => void;
  onSave: (title: string, description: string, tags: string[]) => Promise<void>;
}

export function RemediationModal({
  productId,
  generationId,
  currentTitle,
  currentDescription,
  currentTags,
  policyFlags,
  onClose,
  onSave
}: RemediationModalProps) {
  const [title, setTitle] = useState(currentTitle);
  const [description, setDescription] = useState(currentDescription);
  const [tags, setTags] = useState(currentTags.join(', '));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const tagArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      await onSave(title, description, tagArray);
      onClose();
    } catch (error) {
      console.error('Failed to save remediation:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const getGuidanceForFlag = (flag: string): string => {
    const guidance: Record<string, string> = {
      'title_prohibited_terms': 'Remove prohibited terms from the title',
      'title_too_long': 'Shorten the title to 140 characters or less',
      'title_promotional_language': 'Remove promotional language (sale, discount, etc.)',
      'description_prohibited_terms': 'Remove prohibited terms from the description',
      'description_too_short': 'Expand the description to at least 200 characters',
      'description_prohibited_claims': 'Remove medical/health claims (cure, treat, etc.)',
      'tags_too_many': 'Reduce tags to 13 or fewer',
      'tags_prohibited_terms': 'Remove prohibited terms from tags',
      'tags_too_long': 'Shorten individual tags to 20 characters or less',
      'handmade_no_handmade_indication': 'Add "handmade" or similar term to indicate item is handcrafted',
      'required_missing_fields': 'Fill in all required fields (title, description, price, quantity)',
    };
    
    return guidance[flag] || 'Review and fix this issue';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Fix Policy Violations</h3>
              <p className="text-sm text-gray-600 mt-1">Update content to resolve policy issues</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Policy Violations */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
              <div className="flex-1">
                <h4 className="font-semibold text-red-900 mb-2">Policy Issues to Fix:</h4>
                <ul className="space-y-2">
                  {policyFlags.map((flag, index) => (
                    <li key={index} className="text-sm text-red-800">
                      <span className="font-medium">{formatPolicyFlag(flag)}:</span>{' '}
                      <span className="text-red-700">{getGuidanceForFlag(flag)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title <span className="text-red-600">*</span>
              <span className="text-xs text-gray-500 ml-2">(Max 140 characters)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">{title.length}/140 characters</p>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description <span className="text-red-600">*</span>
              <span className="text-xs text-gray-500 ml-2">(Recommended: 200+ characters)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">{description.length} characters</p>
          </div>

          {/* Tags */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags
              <span className="text-xs text-gray-500 ml-2">(Comma-separated, max 13 tags, 20 chars each)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="handmade, jewelry, necklace"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              {tags.split(',').filter(t => t.trim()).length} tags
            </p>
          </div>

          {/* Guidelines */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">💡 Etsy Policy Guidelines</h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Include "handmade" or similar terms if item is handcrafted</li>
              <li>• Avoid prohibited terms (replica, counterfeit, etc.)</li>
              <li>• No medical/health claims (cure, treat, heal)</li>
              <li>• No promotional language in title (sale, discount)</li>
              <li>• Title: 1-140 characters, Description: 200+ recommended</li>
              <li>• Tags: Max 13 tags, 20 characters each</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-200 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving & Re-checking...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save & Re-check Policy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPolicyFlag(flag: string): string {
  return flag.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

