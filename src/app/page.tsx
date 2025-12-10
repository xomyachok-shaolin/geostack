'use client';

import dynamic from 'next/dynamic';

const CesiumViewer = dynamic(() => import('@/components/CesiumViewer'), {
  ssr: false,
  loading: () => <div className="loading">Загрузка Cesium...</div>,
});

export default function Home() {
  return (
    <div className="viewer-container">
      <CesiumViewer />
    </div>
  );
}
