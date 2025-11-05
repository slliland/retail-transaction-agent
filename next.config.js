/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '/u/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Increase serverless function timeout for backend cold starts
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // API route timeout (Vercel Pro allows up to 60s, Free tier: 10s)
  // Note: This only works on Vercel Pro plan. On free tier, consider upgrading Render backend.
}

module.exports = nextConfig

