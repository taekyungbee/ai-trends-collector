import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack 설정 (Next.js 16+)
  turbopack: {},
  // standalone 모드 (로컬 서버용)
  output: "standalone",
};

export default nextConfig;
