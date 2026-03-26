'use client';

/**
 * Documentation Page
 */

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { Book, Package, ShoppingCart, Settings, Users } from 'lucide-react';

function DocSection({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-[var(--primary-bg)] text-[var(--primary)] flex items-center justify-center">
          <Icon className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">{title}</h2>
      </div>
      <div className="text-[var(--text-muted)] space-y-3">
        {children}
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <DashboardLayout>
      <div className="max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Book className="w-8 h-8 text-[var(--primary)]" />
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Documentation</h1>
            <p className="text-[var(--text-muted)] mt-1">
              Learn how to use the Profitlymation Platform
            </p>
          </div>
        </div>

        {/* Quick Start */}
        <DashboardCard title="Quick Start">
          <ol className="list-decimal list-inside space-y-3 text-[var(--text-muted)]">
            <li className="leading-relaxed">
              <strong className="text-[var(--text-primary)]">Connect Your Etsy Shop:</strong> Go to Settings → Etsy Connection and click "Connect Etsy Shop" to authorize the platform to access your shop data.
            </li>
            <li className="leading-relaxed">
              <strong className="text-[var(--text-primary)]">Import Products:</strong> Navigate to the Products page and use the "Import CSV" button to bulk upload your product data, or click "Add Product" to add individual items.
            </li>
            <li className="leading-relaxed">
              <strong className="text-[var(--text-primary)]">Publish to Etsy:</strong> Go to the Listings page to create and manage your Etsy listings.
            </li>
          </ol>
        </DashboardCard>

        {/* Main Content */}
        <DashboardCard>
          <div className="space-y-8">
            <DocSection icon={Package} title="Products">
              <p>
                The Products page is your central hub for managing product inventory. You can import products via CSV, add individual products manually, or sync from your Etsy shop.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">CSV Import Format:</strong> Your CSV file should include columns for SKU, title, description, price, and quantity. Download the sample CSV template for reference.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Product Details:</strong> Click on any product to view full details, including images, variants, pricing, and metadata. You can also delete products or edit details from the detail page.
              </p>
            </DocSection>

            <DocSection icon={ShoppingCart} title="Orders">
              <p>
                Track and manage all your Etsy orders in one place. The Orders page syncs with your Etsy shop to show order details, customer information, and payment status.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Features:</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Real-time order statistics (pending, completed, refunded, failed)</li>
                <li>Search orders by order ID, customer name, or email</li>
                <li>View detailed order information including shipping address and items</li>
                <li>Filter by payment and delivery status</li>
              </ul>
            </DocSection>

            <DocSection icon={Users} title="Team Management">
              <p>
                Collaborate with your team by inviting members and assigning roles. Manage team access from the Settings page.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Roles:</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Owner:</strong> Full access to all features and settings</li>
                <li><strong>Admin:</strong> Manage products and team members</li>
                <li><strong>Viewer:</strong> Read-only access to products and orders</li>
              </ul>
            </DocSection>

            <DocSection icon={Settings} title="Settings & Configuration">
              <p>
                Configure your platform settings, manage Etsy connections, and customize preferences from the Settings page.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Key Settings:</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Etsy Connection:</strong> Connect or disconnect your Etsy shop</li>
                <li><strong>Team Management:</strong> Invite members and manage roles</li>
                <li><strong>Notifications:</strong> Configure notification preferences (coming soon)</li>
                <li><strong>Profile:</strong> Update your profile information and picture</li>
              </ul>
            </DocSection>
          </div>
        </DashboardCard>

        {/* Support */}
        <DashboardCard title="Need Help?">
          <p className="text-[var(--text-muted)]">
            If you have questions or need assistance, please contact support through the chat widget in the bottom-right corner or email us at{' '}
            <a href="mailto:support@example.com" className="text-[var(--primary)] hover:underline">
              support@example.com
            </a>
          </p>
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}
