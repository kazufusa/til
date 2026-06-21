/** @type {import('next').NextConfig} */
const nextConfig = {
  // postgres / google-auth-library など Node ネイティブ依存をサーバ側へ外出し
  serverExternalPackages: ["postgres", "google-auth-library"],
};

export default nextConfig;
