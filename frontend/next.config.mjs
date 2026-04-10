/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/site_audio_leitor',
  assetPrefix: '/site_audio_leitor',
  allowedDevOrigins: ['localhost', '127.0.0.1', '192.168.0.104', '192.168.0.106'],
};

export default nextConfig;
