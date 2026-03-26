import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

const fontClass = 'font-sans';

export const metadata: Metadata = {
  title: 'Profitlymation Platform',
  description: 'Smart automation exclusively for Etsy sellers - Manage listings, sync orders, and grow your shop',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={fontClass}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
