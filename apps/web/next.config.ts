import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  transpilePackages: ["@vinchi/shared", "@vinchi/sdk", "@vinchi/wallet-core"],
};

export default nextConfig;
