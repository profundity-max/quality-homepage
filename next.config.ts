import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@electric-sql/pglite"],
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      // TPL-06：模板单文件上限 500 MB，Server Action 请求体限制同步放宽
      bodySizeLimit: "512mb",
    },
  },
};

export default nextConfig;
