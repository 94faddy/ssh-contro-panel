/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'node-ssh']
  },
  webpack: (config, { isServer }) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }

    return config;
  },
  
  env: {
    WS_PORT: process.env.WS_PORT || '3126',
    DOMAIN: process.env.DOMAIN || 'contro-ssh.cryteksoft.cloud',
    CLOUDFLARE_PROXY: process.env.CLOUDFLARE_PROXY || 'true',
    FORCE_HTTPS: process.env.FORCE_HTTPS || 'true',
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          // เพิ่ม headers สำหรับ Cloudflare Proxy
          {
            key: 'X-Forwarded-Proto',
            value: 'https',
          },
          {
            key: 'CF-Connecting-IP',
            value: 'trusted',
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },

  // เพิ่มการกำหนดค่า server สำหรับ Cloudflare
  serverRuntimeConfig: {
    port: process.env.PORT || 3125,
    wsPort: process.env.WS_PORT || 3126,
  },

  publicRuntimeConfig: {
    domain: process.env.DOMAIN || 'contro-ssh.cryteksoft.cloud',
    wsPort: process.env.WS_PORT || 3126,
    cloudflareProxy: process.env.CLOUDFLARE_PROXY === 'true',
  },
}

module.exports = nextConfig