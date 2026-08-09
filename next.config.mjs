/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["mongoose"],
  experimental: {
    // Keep server-only modules out of any client bundle.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
