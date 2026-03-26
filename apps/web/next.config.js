/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'i.etsystatic.com'],
  },
  env: {
    // Empty = same-origin; requests go through Next.js proxy (rewrites below)
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? '',
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
  },
  async rewrites() {
    const target = process.env.API_INTERNAL_URL || 'http://api:8080';
    return [
      {
        source: '/api/:path*',
        destination: `${target}/api/:path*`,
        basePath: false,
      },
    ];
  },
}

module.exports = nextConfig
