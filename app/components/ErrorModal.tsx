// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import React from 'react';
import { WifiOff, RefreshCw, X, Archive } from 'lucide-react';

interface ErrorModalProps {
  errorMsg: string | null;
  setErrorMsg: (msg: string | null) => void;
  /** 재시도가 의미 있을 때만 넘긴다. 없으면 재시도 버튼을 숨긴다. */
  onRetry?: (() => void) | null;
  /** 대안 경로 (예: 기록실로 이동). 레이트 리밋처럼 재시도가 무의미할 때 쓴다. */
  onSecondary?: (() => void) | null;
  secondaryLabel?: string;
  /** 기본값은 통신 장애를 뜻하는 SIGNAL LOST. */
  title?: string;
}

/**
 * 공통 에러 모달.
 *
 * **닫기는 항상 있어야 한다.** 과거에는 버튼이 "재접속 시도" 하나뿐이라,
 * 실패한 플레이어가 취할 수 있는 유일한 행동이 유료 API를 다시 호출하는 것이었다.
 */
export default function ErrorModal({
  errorMsg,
  setErrorMsg,
  onRetry,
  onSecondary,
  secondaryLabel,
  title = 'Signal Lost',
}: ErrorModalProps) {
  if (!errorMsg) return null;

  const dismiss = () => setErrorMsg(null);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 animate-fade-in">
      <div className="w-full max-w-sm bg-gray-800 border-2 border-red-600 rounded-sm p-6 text-center shadow-[0_0_20px_rgba(220,38,38,0.5)]">
        <WifiOff className="mx-auto text-red-500 mb-4 animate-pulse" size={48} />
        <h2 className="text-xl font-bold text-red-500 mb-2 uppercase tracking-widest">{title}</h2>
        <p className="text-gray-300 mb-6 font-mono text-sm word-keep-all leading-relaxed">{errorMsg}</p>

        <div className="space-y-2">
          {onRetry && (
            <button
              onClick={() => {
                dismiss();
                onRetry();
              }}
              className="w-full min-h-[48px] bg-red-700 hover:bg-red-600 text-white font-bold py-3 rounded-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} /> 재접속 시도
            </button>
          )}

          {onSecondary && secondaryLabel && (
            <button
              onClick={() => {
                dismiss();
                onSecondary();
              }}
              className="w-full min-h-[48px] bg-amber-800 hover:bg-amber-700 text-amber-100 font-bold py-3 rounded-sm tracking-wider transition-all flex items-center justify-center gap-2"
            >
              <Archive size={18} /> {secondaryLabel}
            </button>
          )}

          <button
            onClick={dismiss}
            className="w-full min-h-[48px] bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold py-3 rounded-sm tracking-wider transition-all flex items-center justify-center gap-2"
          >
            <X size={18} /> 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
