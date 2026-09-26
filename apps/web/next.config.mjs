/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@digivault/crypto-core"],
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
  },
};

export default nextConfig;
