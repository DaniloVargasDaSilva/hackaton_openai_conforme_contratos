import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O reset da demo lê a NF e as entregas de data/demo em runtime; sem isto a Vercel não os leva para a função.
  outputFileTracingIncludes: {
    "/api/demo/reset": ["./data/demo/*.xml", "./data/demo/*.csv"],
  },
};

export default nextConfig;
