import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Les imports de données publiques peuvent être volumineux (CSV de plusieurs Mo).
  serverExternalPackages: [],
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
  },
};

export default nextConfig;
