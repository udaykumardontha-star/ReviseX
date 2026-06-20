import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for catching bugs early
  reactStrictMode: true,

  // TypeScript strict configuration
  typescript: {
    ignoreBuildErrors: false,
  },

  // ESLint — enforce during builds
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Experimental features for Next.js 15
  experimental: {
    // Server Actions are stable in Next.js 15
    serverActions: {
      bodySizeLimit: "50mb", // Allow large PDF uploads
    },
  },

  // Webpack configuration for better-sqlite3 (native module)
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize native Node.js modules that should not be bundled
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("better-sqlite3");
      }
    }

    // Handle .node native addon files
    config.module.rules.push({
      test: /\.node$/,
      use: "node-loader",
    });

    return config;
  },

  // Headers for PWA and security
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Service worker must be served from root
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
    ];
  },
};

export default nextConfig;
