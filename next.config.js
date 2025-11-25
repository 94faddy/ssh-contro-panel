/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'node-ssh', 'ssh2']
  },
  webpack: (config, { isServer }) => {
    // Handle native modules
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });

    if (!isServer) {
      // Don't bundle these for client-side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        dns: false,
        child_process: false,
        // ssh2 specific
        'cpu-features': false,
        './crypto/build/Release/sshcrypto.node': false,
      };

      // Ignore ssh2 native modules on client side
      config.resolve.alias = {
        ...config.resolve.alias,
        'cpu-features': false,
      };
    }

    // Ignore optional dependencies warnings
    config.ignoreWarnings = [
      { module: /ssh2/ },
      { module: /cpu-features/ },
      { module: /sshcrypto/ },
    ];

    return config;
  },
  
  env: {
    WS_PORT: process.env.WS_PORT || '3005',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || '',
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

  // Suppress specific warnings
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig