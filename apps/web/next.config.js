/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    const backendUrl = process.env.DEMOFORGE_BACKEND_URL || 'http://localhost:8004';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
