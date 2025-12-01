import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GeoStack - 3D Viewer',
  description: '3D модели зданий на карте',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
