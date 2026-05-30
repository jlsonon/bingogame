import { motion, AnimatePresence } from "framer-motion";

interface BallCallerProps {
  latestBall: number | null;
  history: number[];
}

export function BallCaller({ latestBall, history }: BallCallerProps) {
  const getLetter = (num: number) => {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    return 'O';
  };

  const recentHistory = [...history].reverse().slice(0, 5); // show last 5

  return (
    <div className="w-full flex flex-col items-center gap-4 bg-white pb-6 pt-4 px-6 rounded-[32px] border-2 border-[#E8E2D9] shadow-sm relative">
      <div className="text-[10px] items-center justify-center flex font-bold text-[#A19B91] uppercase tracking-[0.2em] mb-[-10px]">Now Calling</div>
      <div className="relative w-32 h-32 rounded-full border-8 border-white bg-[#FACC15] shadow-[0_10px_20px_-10px_rgba(0,0,0,0.2)] flex items-center justify-center overflow-hidden outline outline-4 outline-[#FACC15] my-2">
        <AnimatePresence mode="popLayout">
          {latestBall ? (
            <motion.div
              key={latestBall}
              initial={{ y: 150, opacity: 0, rotate: -45 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -150, opacity: 0, rotate: 45 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-[#FACC15] text-[#854D0E]"
            >
              <div className="text-xl font-black opacity-80 uppercase leading-none mb-1">{getLetter(latestBall)}</div>
              <div className="text-6xl font-black leading-none mb-2">{latestBall}</div>
            </motion.div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#F3EFE9] text-[#A19B91] font-medium text-lg text-center p-2">
              Waiting for ball...
            </div>
          )}
        </AnimatePresence>
      </div>

      {recentHistory.length > 0 && (
        <div className="flex gap-2 flex-wrap justify-center">
          {recentHistory.map((num, idx) => (
            <motion.div
              key={`${num}-${idx}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: Math.max(1 - (idx * 0.15), 0.3) }}
              className="bg-white rounded-lg aspect-square w-12 h-12 flex flex-col items-center justify-center text-xs font-bold text-[#A19B91] border border-[#DED9D1]"
            >
              <span className="text-[10px] font-bold opacity-60 m-0 leading-tight">{getLetter(num)}</span>
              <span className="text-sm font-black leading-none mt-[2px]">{num}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
