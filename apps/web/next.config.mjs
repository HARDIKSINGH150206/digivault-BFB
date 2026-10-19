/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@digivault/crypto-core"],
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
    // src/instrumentation.ts: starts the audit-head anchor schedule.
    instrumentationHook: true,
  },
};

export default nextConfig;
