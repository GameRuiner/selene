import type { NextConfig } from 'next';

// Keep Selene's space deployable as plain files, with no server runtime.
const nextConfig: NextConfig = {
  output: 'export',
};

export default nextConfig;
