import withPWA from "next-pwa";

const nextConfig = withPWA({
  reactStrictMode: true,
  output: "export",  // Ensures it works with static export
  basePath: "/Chords-Web",
  assetPrefix: "/Chords-Web",
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  pwa: {
    dest: "public",
    register: true,
    skipWaiting: true,
  },
});

export default nextConfig;

