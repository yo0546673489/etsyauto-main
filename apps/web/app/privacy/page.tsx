/**
 * Privacy Policy Page
 */

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-2">
            Privacy Policy
          </h1>
          <p className="text-[var(--text-muted)]">
            Last updated: December 7, 2024
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-slate max-w-none">
          <div className="space-y-8 text-[var(--text-primary)]">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
              <p className="text-[var(--text-muted)] leading-relaxed mb-4">
                We collect information that you provide directly to us, including:
              </p>
              <ul className="list-disc list-inside text-[var(--text-muted)] space-y-2 ml-4">
                <li>Account information (email, name, password)</li>
                <li>Profile information (business name, profile picture)</li>
                <li>Etsy shop data (products, listings, orders)</li>
                <li>Usage data (features used, time spent, actions taken)</li>
                <li>Payment information (processed securely through third-party providers)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
              <p className="text-[var(--text-muted)] leading-relaxed mb-4">
                We use the information we collect to:
              </p>
              <ul className="list-disc list-inside text-[var(--text-muted)] space-y-2 ml-4">
                <li>Provide, maintain, and improve our Service</li>
                <li>Process your Etsy data and automate your shop tasks</li>

                <li>Send you technical notices, updates, and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Monitor and analyze trends, usage, and activities</li>
                <li>Detect, prevent, and address technical issues</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Information Sharing</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                We do not sell, trade, or otherwise transfer your personal information to third parties except as described in this Privacy Policy:
              </p>
              <ul className="list-disc list-inside text-[var(--text-muted)] space-y-2 mt-3 ml-4">
                <li><strong>Etsy:</strong> We access your Etsy shop data through their API with your authorization</li>
                
                <li><strong>Service Providers:</strong> We may share data with trusted third parties who assist us in operating our Service</li>
                <li><strong>Legal Requirements:</strong> We may disclose information if required by law or to protect our rights</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Data Storage and Security</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                We use industry-standard security measures to protect your data:
              </p>
              <ul className="list-disc list-inside text-[var(--text-muted)] space-y-2 mt-3 ml-4">
                <li>Data encryption in transit (HTTPS/TLS)</li>
                <li>Secure database storage with access controls</li>
                <li>Password hashing using industry-standard algorithms</li>
                <li>Regular security audits and updates</li>
                <li>Limited employee access to personal data</li>
              </ul>
              <p className="text-[var(--text-muted)] leading-relaxed mt-4">
                However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Etsy Integration</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                When you connect your Etsy shop, we request limited access to your shop data through Etsy's OAuth system. We only access data necessary for the Service to function. You can revoke our access at any time through your Etsy account settings. We comply with Etsy's API Terms of Use and Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Cookies and Tracking</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                We use cookies and similar tracking technologies to:
              </p>
              <ul className="list-disc list-inside text-[var(--text-muted)] space-y-2 mt-3 ml-4">
                <li>Maintain your login session</li>
                <li>Remember your preferences</li>
                <li>Analyze usage patterns and improve the Service</li>
              </ul>
              <p className="text-[var(--text-muted)] leading-relaxed mt-4">
                You can control cookies through your browser settings, but some features may not function properly if cookies are disabled.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Your Rights</h2>
              <p className="text-[var(--text-muted)] leading-relaxed mb-4">
                You have the right to:
              </p>
              <ul className="list-disc list-inside text-[var(--text-muted)] space-y-2 ml-4">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Export your data</li>
                <li>Revoke Etsy integration permissions</li>
                <li>Opt out of marketing communications</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Data Retention</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                We retain your information for as long as your account is active or as needed to provide you services. If you delete your account, we will delete or anonymize your personal data within 30 days, except where we are required to retain it for legal or regulatory purposes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Children's Privacy</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                Our Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us with personal information, please contact us.
              </p>
            </section>


            <section>
              <h2 className="text-2xl font-semibold mb-4">10. International Data Transfers</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                Your information may be transferred to and maintained on computers located outside of your state, province, country, or other governmental jurisdiction where data protection laws may differ. By using the Service, you consent to this transfer.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">11. Changes to This Policy</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">12. Contact Us</h2>
              <p className="text-[var(--text-muted)] leading-relaxed">
                If you have any questions about this Privacy Policy, please contact us through the support channels provided in the application.
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
