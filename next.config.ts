import type { NextConfig } from 'next';

// Keep Moonwalk deployable as plain files, with no server runtime.
const nextConfig: NextConfig = {
  output: 'export',
};

export default nextConfig;
