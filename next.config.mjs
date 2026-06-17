/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for Docker: `.next/standalone` ships only the
  // traced runtime deps, so the production image stays small.
  output: "standalone",
  // Phase 1 is a local-first app. User-supplied images (battle maps, portraits)
  // can be arbitrary URLs or data: URLs, so feature code uses plain <img> and we
  // keep Next's image optimizer out of the way. Revisit in Phase 2 if we host art.
};

export default nextConfig;
