import React, { useState, useEffect } from 'react';
import { RefreshCw, Lightbulb } from 'lucide-react';

interface LoadingScreenProps {
  loadingText: string;
}

const GAME_TIPS = [
  "범인은 거짓말을 하고 있을 수 있습니다. 핵심 트릭과 알리바이 모순을 찾아보세요.",
  "모든 용의자는 비밀을 가지고 있습니다. 하지만 모든 비밀이 범행과 관련 있는 것은 아닙니다.",
  "사건 현장의 날씨와 시간은 알리바이를 검증하는 중요한 단서가 됩니다.",
  "용의자의 성격에 주목하세요. 감정적인 동요를 일으켜 진실을 얻어낼 수도 있습니다.",
  "범행 동기를 파악하면 용의자 목록을 크게 좁힐 수 있습니다.",
  "너무 뻔해 보이는 용의자는 함정일 수 있습니다. 이면을 들여다보세요.",
  "피해자와의 관계 속에 살해 동기가 숨어있을 가능성이 높습니다.",
  "알리바이가 너무 완벽하다면, 오히려 트릭이 숨겨져 있을 수 있습니다.",
  "증거물은 거짓말을 하지 않습니다. 증언과 증거가 엇갈린다면 증거를 믿으세요."
];

export default function LoadingScreen({ loadingText }: LoadingScreenProps) {
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  useEffect(() => {
    setCurrentTipIndex(Math.floor(Math.random() * GAME_TIPS.length));
  }, []);

  const nextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % GAME_TIPS.length);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-gray-100 font-serif p-6">
      <RefreshCw className="animate-spin text-amber-700 mb-6" size={48} />
      <p className="text-xl text-amber-500 animate-pulse tracking-widest text-center">{loadingText}</p>
      
      <div className="mt-8 w-48 h-1 bg-gray-800 rounded-full overflow-hidden mb-12">
        <div className="h-full bg-amber-800 animate-loading-bar w-full origin-left"></div>
      </div>

      <div 
        onClick={nextTip}
        className="max-w-2xl cursor-pointer animate-fade-in select-none text-center flex flex-col items-center gap-3 px-4 hover:opacity-80 transition-opacity"
      >
        <Lightbulb className="text-amber-700" size={24} />
        <p className="text-sm text-gray-400 leading-relaxed word-keep-all font-sans">
          "{GAME_TIPS[currentTipIndex]}"
        </p>
      </div>
    </div>
  );
}
