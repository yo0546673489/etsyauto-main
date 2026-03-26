/**
 * Terms of Service Page
 */

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-2">
            Terms of Service
          </h1>
          <p className="text-[var(--text-muted)]">
            Last updated: December 7, 2024
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-slate max-w-none">
          <div className="space-y-8 text-[var(--text-primary)]">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                By accessing and using the Profitlymation Platform ("Service"), you accept and agree to be bound by the terms and provision of this agreement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Use License</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                Permission is granted to temporarily access the Service for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
              </p>
              <ul className="list-disc list-inside text-[var(--text-muted)] space-y-2 mt-3 ml-4">
                <li>Modify or copy the materials</li>
                <li>Use the materials for any commercial purpose</li>
                <li>Attempt to decompile or reverse engineer any software contained on the Service</li>
                <li>Remove any copyright or other proprietary notations from the materials</li>
                <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password. You agree not to disclose your password to any third party. You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Etsy Integration</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                This Service integrates with Etsy's API. You agree to comply with Etsy's Terms of Service and API Terms of Use when using our Service. We are not responsible for any actions taken by Etsy or changes to their API that may affect this Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Disclaimer</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                The materials on the Service are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Limitations</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                In no event shall the Profitlymation Platform or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Pricing and Payment</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                Certain features of the Service may require payment. You agree to provide current, complete, and accurate purchase and account information for all purchases made via the Service. Pricing is subject to change with notice.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Termination</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Changes to Terms</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                We reserve the right to update these Terms at any time. We will notify you of any changes by posting the new Terms on this page. You are advised to review these Terms periodically for any changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Contact Information</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                If you have any questions about these Terms, please contact us through the support channels provided in the application.
              </p>
            </section>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-12 pt-8 border-t border-[var(--border-color)]">
          <a
            href="/login"
            className="text-[var(--primary)] hover:underline"
          >
            ← Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}
