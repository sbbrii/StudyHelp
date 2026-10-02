import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Prevent SSR errors for browser-only modules
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      encoding: false,
    };

    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "onnxruntime-node": false,
        sharp: false,
      };
    }

    return config;
  },
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: {},
};

export default nextConfig;
