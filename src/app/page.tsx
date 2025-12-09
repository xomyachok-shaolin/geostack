'use client';

import dynamic from 'next/dynamic';

const MapLibreViewer = dynamic(() => import('@/components/MapLibreViewer'), {
  ssr: false,
  loading: () => <div className="loading">Загрузка 3D карты...</div>,
});

export default function Home() {
  return (
    <div className="viewer-container">
      <MapLibreViewer />
    </div>
  );
}
