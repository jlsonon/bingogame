import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useGameStore } from './store/gameStore';

import Landing from './pages/Landing';
import Host from './pages/Host';
import Player from './pages/Player';
import Display from './pages/Display';
import GodView from './pages/GodView';

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className="min-h-screen"
      >
        <Routes location={location}>
          <Route path="/" element={<Landing />} />
          <Route path="/host/:code" element={<Host />} />
          <Route path="/host/:code/grid" element={<GodView />} />
          <Route path="/play/:code" element={<Player />} />
          <Route path="/display/:code" element={<Display />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const connect = useGameStore(s => s.connect);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <div className="min-h-screen bg-[#FAF7F2] text-[#3D3A35] font-sans selection:bg-[#EA580C]/20">
          <AnimatedRoutes />
        </div>
      </BrowserRouter>
    </MotionConfig>
  );
}
