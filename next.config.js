/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 14 : la clé correcte est experimental.serverComponentsExternalPackages
  // (serverExternalPackages, sans le préfixe experimental, n'arrive qu'en Next 15).
  experimental: {
    serverComponentsExternalPackages: ["firebase-admin"],
  },
};

module.exports = nextConfig;
