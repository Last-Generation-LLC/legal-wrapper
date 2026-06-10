import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse and mammoth pull in heavy Node-only internals (pdf.js, native
  // bindings) that must not be processed by the bundler. Keeping them external
  // lets them load normally at runtime in the Node.js server.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
