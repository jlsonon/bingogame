import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';

import Landing from './pages/Landing';
import Host from './pages/Host';
import Player from './pages/Player';

export default function App() {
  const connect = useGameStore(s => s.connect);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#FAF7F2] text-[#3D3A35] font-sans selection:bg-[#EA580C]/20">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/host/:code" element={<Host />} />
          <Route path="/play/:code" element={<Player />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
