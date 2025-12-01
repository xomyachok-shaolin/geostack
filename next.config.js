const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  webpack: (config, { isServer, dev }) => {
    if (!isServer) {
      // Копируем статические файлы Cesium только в dev режиме
      // В production они уже должны быть в public/cesium
      if (dev) {
        config.plugins.push(
          new CopyWebpackPlugin({
            patterns: [
              {
                from: path.join(__dirname, 'node_modules/cesium/Build/Cesium/Workers'),
                to: '../public/cesium/Workers',
              },
              {
                from: path.join(__dirname, 'node_modules/cesium/Build/Cesium/ThirdParty'),
                to: '../public/cesium/ThirdParty',
              },
              {
                from: path.join(__dirname, 'node_modules/cesium/Build/Cesium/Assets'),
                to: '../public/cesium/Assets',
              },
              {
                from: path.join(__dirname, 'node_modules/cesium/Build/Cesium/Widgets'),
                to: '../public/cesium/Widgets',
              },
            ],
          })
        );
      }

      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        http: false,
        https: false,
        zlib: false,
      };
    }

    return config;
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tile.openstreetmap.org',
      },
      {
        protocol: 'https',
        hostname: 'mt1.google.com',
      },
      {
        protocol: 'https',
        hostname: 'server.arcgisonline.com',
      },
    ],
  },
};

module.exports = nextConfig;
