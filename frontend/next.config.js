/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed 'standalone' output for simpler Azure deployment
  images: {
    domains: ['localhost'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
