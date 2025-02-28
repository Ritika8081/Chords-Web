
import nextPwa from 'next-pwa';

/** @type {import('next').NextConfig} */
const withPWA = nextPwa({
  dest: 'public',
  register: true,
  skipWaiting: true,
  buildExcludes: [/manifest\.json$/],  // Prevent deletion during export
});

const config = {
  reactStrictMode: true,
  output: "export",  // Ensures it works with static export
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  ...withPWA,
};

export default config;
