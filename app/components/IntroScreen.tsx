import React from 'react';
import { Search, FileText, VolumeX, Volume2 } from 'lucide-react';

interface IntroScreenProps {
  onStart: () => void;
  isMuted: boolean;
  toggleMute: () => void;
}

export default function IntroScreen({ onStart, isMuted, toggleMute }: IntroScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-100 p-6 relative overflow-hidden font-sans">
      {/* Sound Toggle (Absolute) */}
      <button onClick={toggleMute} className="absolute top-6 right-6 p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors z-50">
        {isMuted ? <VolumeX size={20} className="text-gray-400" /> : <Volume2 size={20} className="text-amber-500" />}
      </button>

      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #444 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
      
      <div className="w-full max-w-md text-center space-y-12 z-10 animate-fade-in">
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center border-4 border-amber-800/50 shadow-2xl shadow-black">
            <Search size={48} className="text-amber-700" />
          </div>
          <div>
            <h1 className="text-5xl font-serif font-bold text-gray-100 tracking-tighter drop-shadow-lg mb-2">
              오늘의 <span className="text-amber-700">탐정</span>
            </h1>
            <p className="text-amber-500 font-serif text-lg tracking-widest font-bold mb-1">
              10분의 미스터리
            </p>
            <p className="text-gray-500 text-xs tracking-[0.3em] uppercase border-y border-gray-700 py-2">
              The Daily Detective
            </p>
          </div>
        </div>
        
        <button 
          onClick={onStart}
          className="w-full bg-amber-800 hover:bg-amber-700 text-amber-100 font-bold py-4 px-6 rounded-sm shadow-lg border border-amber-600 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-3 font-serif text-lg"
        >
          <FileText size={20} /> 사건 파일 열기
        </button>
      </div>
    </div>
  );
}
