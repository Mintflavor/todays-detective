// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import React, { useState, useEffect } from 'react';
import { RefreshCw, Lightbulb, ChevronLeft } from 'lucide-react';

interface LoadingScreenProps {
  loadingText: string;
  /** 탈출 경로. 오래 걸릴 때만 노출된다. 없으면 버튼을 만들지 않는다. */
  onCancel?: () => void;
}

/** 정상 생성이 25~31초다. 그보다 넉넉히 지나서야 "뭔가 잘못됐다"고 볼 수 있다. */
const CANCEL_REVEAL_MS = 45_000;

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

export default function LoadingScreen({ loadingText, onCancel }: LoadingScreenProps) {
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showCancel, setShowCancel] = useState(false);

  // 초기값으로 Math.random()을 쓰면 SSR과 CSR의 값이 달라 하이드레이션이 깨진다.
  // 마운트 후에 뽑아야 하므로 effect가 맞다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentTipIndex(Math.floor(Math.random() * GAME_TIPS.length));
  }, []);

  // 로딩이 비정상적으로 길어지면 나갈 방법을 준다.
  // 과거에는 이 화면에 버튼이 하나도 없어서, 생성이 실패하면 새로고침 외에
  // 탈출 경로가 없었다 (게임 진행 불가).
  useEffect(() => {
    if (!onCancel) return;
    const t = setTimeout(() => setShowCancel(true), CANCEL_REVEAL_MS);
    return () => clearTimeout(t);
  }, [onCancel]);

  const nextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % GAME_TIPS.length);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-950 text-gray-100 font-serif p-6">
      <RefreshCw className="animate-spin text-amber-700 mb-6" size={48} />
      <p className="text-xl text-amber-500 animate-pulse tracking-widest text-center">{loadingText}</p>

      <div className="mt-8 w-48 h-1 bg-gray-800 rounded-full overflow-hidden mb-12">
        <div className="h-full bg-amber-800 animate-loading-bar w-full origin-left"></div>
      </div>

      <button
        onClick={nextTip}
        aria-label="다음 수사 팁 보기"
        className="max-w-2xl cursor-pointer animate-fade-in select-none text-center flex flex-col items-center gap-3 px-4 hover:opacity-80 transition-opacity"
      >
        <Lightbulb className="text-amber-700" size={24} />
        <p className="text-sm text-gray-400 leading-relaxed word-keep-all font-sans">
          &ldquo;{GAME_TIPS[currentTipIndex]}&rdquo;
        </p>
      </button>

      {showCancel && onCancel && (
        <div className="mt-12 flex flex-col items-center gap-3 animate-fade-in">
          <p className="text-xs text-gray-500 font-sans word-keep-all text-center max-w-xs leading-relaxed">
            평소보다 오래 걸리고 있습니다. 기다려도 되고, 나가서 다시 시도해도 됩니다.
          </p>
          <button
            onClick={onCancel}
            className="min-h-[48px] px-6 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-sm font-sans text-sm font-bold flex items-center gap-2 transition-colors"
          >
            <ChevronLeft size={16} /> 처음으로 돌아가기
          </button>
        </div>
      )}
    </div>
  );
}
