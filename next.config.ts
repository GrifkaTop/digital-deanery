import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone", poweredByHeader: false, serverExternalPackages: ["pdfkit"],
  experimental: { cpus: 2 },
  outputFileTracingIncludes: { "/api/v1/requests/*/document": ["./assets/pdf/**/*"] } };
export default config;
