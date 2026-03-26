/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/admin/:path*',
        destination: `${process.env.API_INTERNAL_URL || 'http://api:8080'}/api/admin/:path*`,
      },
    ]
  },
}
module.exports = nextConfig
