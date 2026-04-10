/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  ...(isProd ? { output: 'export' } : {}),
  basePath: isProd ? '/site_audio_leitor' : '',
  assetPrefix: isProd ? '/site_audio_leitor' : '',
  allowedDevOrigins: ['localhost', '127.0.0.1', '192.168.0.104', '192.168.0.106'],
  async rewrites() {
    if (isProd) return [];
    return [
      { source: '/site_audio_leitor', destination: '/' },
      { source: '/site_audio_leitor/:path*', destination: '/:path*' },
    ];
  },
};

export default nextConfig;
