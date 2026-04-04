/** @type {import('next').NextConfig} */
const nextConfig = {
  // nse-bse-api uses Node.js modules — keep it server-side only
  experimental: {
    serverComponentsExternalPackages: ['nse-bse-api'],
  },
}

module.exports = nextConfig
