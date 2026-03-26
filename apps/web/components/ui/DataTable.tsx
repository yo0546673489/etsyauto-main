'use client'

/**
 * Reusable Data Table Component - Vuexy Style
 */

import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search, Download, Plus, MoreVertical, Eye, Trash2, Edit } from 'lucide-react'
import { cn } from '@/lib/utils'

// Stats Card for table headers
interface StatsCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  change?: { value: number; trend: 'up' | 'down' }
}

export function TableStatsCard({ title, value, icon, change }: StatsCardProps) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-5 flex items-center justify-between">
      <div>
        <p className="text-[var(--text-muted)] text-sm mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
          {change && (
            <span className={cn(
              'text-sm font-medium px-2 py-0.5 rounded-full',
              change.trend === 'up' 
                ? 'text-[var(--success)] bg-[var(--success-bg)]' 
                : 'text-[var(--danger)] bg-[var(--danger-bg)]'
            )}>
              {change.trend === 'up' ? '+' : ''}{change.value}%
            </span>
          )}
        </div>
      </div>
      <div className="w-12 h-12 rounded-lg bg-[var(--background)] flex items-center justify-center text-[var(--text-muted)]">
        {icon}
      </div>
    </div>
  )
}

// Filter Dropdown
interface FilterDropdownProps {
  label: string
  options: { value: string; label: string }[]
  value?: string
  onChange?: (value: string) => void
}

export function FilterDropdown({ label, options, value, onChange }: FilterDropdownProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="appearance-none w-full px-4 py-3 pr-10 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition cursor-pointer"
      >
        <option value="">{label}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] pointer-events-none" />
    </div>
  )
}

// Search Input
interface SearchInputProps {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
}

export function SearchInput({ placeholder = 'Search...', value, onChange }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full pl-12 pr-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition"
      />
    </div>
  )
}

// Page Size Dropdown
interface PageSizeDropdownProps {
  value: number
  onChange?: (value: number) => void
  options?: number[]
}

export function PageSizeDropdown({ value, onChange, options = [7, 10, 25, 50] }: PageSizeDropdownProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className="appearance-none px-4 py-3 pr-10 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] pointer-events-none" />
    </div>
  )
}

// Export Button
export function ExportButton({ onClick }: { onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--card-bg-hover)] transition"
    >
      <Download className="w-4 h-4" />
      <span>Export</span>
      <ChevronDown className="w-4 h-4" />
    </button>
  )
}

// Add Button
interface AddButtonProps {
  label: string
  onClick?: () => void
}

export function AddButton({ label, onClick }: AddButtonProps) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 px-5 py-2.5 gradient-primary text-white rounded-lg font-medium hover:opacity-90 transition shadow-lg shadow-[var(--primary)]/25"
    >
      <Plus className="w-4 h-4" />
      <span>{label}</span>
    </button>
  )
}

// Table / Row Actions
interface TableActionsMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface TableActionsProps {
  onView?: () => void
  onEdit?: () => void
  onDelete?: () => void
  menuItems?: TableActionsMenuItem[]
}

export function TableActions({ onView, onEdit, onDelete, menuItems }: TableActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const hasMenu = !!menuItems && menuItems.length > 0

  useEffect(() => {
    if (!menuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div className="relative flex items-center justify-end gap-1">
      {onView && (
        <button
          onClick={onView}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text-primary)] transition"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}
      {onEdit && (
        <button
          onClick={onEdit}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--primary-bg)] hover:text-[var(--primary)] transition"
        >
          <Edit className="w-4 h-4" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      {hasMenu && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text-primary)] transition"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-lg z-20">
              <div className="py-1">
                {menuItems!.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      item.onClick()
                      setMenuOpen(false)
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs transition-colors',
                      item.danger
                        ? 'text-[var(--danger)] hover:bg-[var(--danger-bg)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Status Badge
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'delivered' | 'cancelled' | 'paid' | 'failed' | 'refunded' | 'published' | 'draft'
  children?: React.ReactNode
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const styles = {
    active: 'bg-[var(--success-bg)] text-[var(--success)]',
    inactive: 'bg-[var(--danger-bg)] text-[var(--danger)]',
    pending: 'bg-[var(--warning-bg)] text-[var(--warning)]',
    delivered: 'bg-[var(--success-bg)] text-[var(--success)]',
    cancelled: 'bg-[var(--text-muted)]/20 text-[var(--text-muted)]',
    paid: 'bg-[var(--success-bg)] text-[var(--success)]',
    failed: 'bg-[var(--danger-bg)] text-[var(--danger)]',
    refunded: 'bg-[var(--info-bg)] text-[var(--info)]',
    published: 'bg-[var(--success-bg)] text-[var(--success)]',
    draft: 'bg-[var(--text-muted)]/20 text-[var(--text-muted)]',
  }

  const labels = {
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    paid: 'Paid',
    failed: 'Failed',
    refunded: 'Refunded',
    published: 'Published',
    draft: 'Draft',
  }

  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium', styles[status])}>
      {children || labels[status]}
    </span>
  )
}

// Stock Status Indicator
interface StockIndicatorProps {
  inStock: boolean
}

export function StockIndicator({ inStock }: StockIndicatorProps) {
  return (
    <div className={cn(
      'w-3 h-3 rounded-full',
      inStock ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]'
    )} />
  )
}

// Pagination
interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange?: (page: number) => void
}

export function Pagination({ currentPage, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  const pages = []
  for (let i = 1; i <= Math.min(5, totalPages); i++) {
    pages.push(i)
  }
  if (totalPages > 5) {
    pages.push(-1) // Ellipsis
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center justify-between p-4 border-t border-[var(--border-color)]">
      <p className="text-sm text-[var(--text-muted)]">
        Showing {startItem} to {endItem} of {totalItems} entries
      </p>
      <div className="flex items-center gap-1">
        <button 
          onClick={() => onPageChange?.(1)}
          disabled={currentPage === 1}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          «
        </button>
        <button 
          onClick={() => onPageChange?.(currentPage - 1)}
          disabled={currentPage === 1}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          ‹
        </button>
        {pages.map((page, i) => (
          page === -1 ? (
            <span key={`ellipsis-${i}`} className="w-9 h-9 flex items-center justify-center text-[var(--text-muted)]">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange?.(page)}
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center transition',
                currentPage === page 
                  ? 'bg-[var(--primary)] text-white' 
                  : 'text-[var(--text-muted)] hover:bg-[var(--background)]'
              )}
            >
              {page}
            </button>
          )
        ))}
        <button 
          onClick={() => onPageChange?.(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          ›
        </button>
        <button 
          onClick={() => onPageChange?.(totalPages)}
          disabled={currentPage === totalPages}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          »
        </button>
      </div>
    </div>
  )
}

// Checkbox for table rows
interface TableCheckboxProps {
  checked?: boolean
  onChange?: (checked: boolean) => void
  indeterminate?: boolean
}

export function TableCheckbox({ checked, onChange, indeterminate }: TableCheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange?.(e.target.checked)}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate || false
      }}
      className="w-4 h-4 rounded border-[var(--border-color)] bg-[var(--background)] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 cursor-pointer"
    />
  )
}

// Category Badge with icon
interface CategoryBadgeProps {
  name: string
  color?: string
  icon?: React.ReactNode
}

export function CategoryBadge({ name, color = 'var(--primary)', icon }: CategoryBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      {icon && (
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </div>
      )}
      <span className="text-[var(--text-primary)]">{name}</span>
    </div>
  )
}

