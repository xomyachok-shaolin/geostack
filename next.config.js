const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // Включаем сжатие
  compress: true,
  
  // Оптимизация сборки
  swcMinify: true,
  
  // Отключаем source maps в production
  productionBrowserSourceMaps: false,
  
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
      
      // Оптимизация размера бандла
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          ...config.optimization?.splitChunks,
          cacheGroups: {
            ...config.optimization?.splitChunks?.cacheGroups,
            cesium: {
              test: /[\\/]node_modules[\\/]cesium[\\/]/,
              name: 'cesium',
              chunks: 'all',
              priority: 10,
            },
          },
        },
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
      {
        protocol: 'https',
        hostname: 'services.arcgisonline.com',
      },
    ],
  },
  
  // Заголовки для кэширования статических ресурсов
  async headers() {
    return [
      {
        source: '/cesium/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800',
          },
        ],
      },
      {
        source: '/api/ortho/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
