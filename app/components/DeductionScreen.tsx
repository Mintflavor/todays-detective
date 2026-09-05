// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import React, { ChangeEvent } from 'react';
import Image from 'next/image';
import { AlertCircle, User, ChevronLeft, Timer, Zap, AlertTriangle } from 'lucide-react';
import { CaseData, DeductionInput } from '../types/game';
import { formatTime } from '../lib/utils';

/** 이보다 짧으면 동기·트릭을 서술했다고 보기 어렵다. 등급이 낮게 나온다. */
const REASONING_MIN_LENGTH = 10;

interface DeductionScreenProps {
  caseData: CaseData;
  deductionInput: DeductionInput;
  setDeductionInput: (input: DeductionInput | ((prev: DeductionInput) => DeductionInput)) => void;
  onSubmit: () => void;
  onBack: () => void;
  timerSeconds: number;
  isOverTime: boolean;
  actionPoints: number;
  totalActionPoints: number;
}

export default function DeductionScreen({
  caseData,
  deductionInput,
  setDeductionInput,
  onSubmit,
  onBack,
  timerSeconds,
  isOverTime,
  actionPoints,
  totalActionPoints
}: DeductionScreenProps) {
  const tooShort = deductionInput.reasoning.trim().length < REASONING_MIN_LENGTH;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 flex items-center justify-center font-serif overflow-y-auto relative">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/papers_background.webp"
          alt="Papers Background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gray-900/90" />
      </div>

      <div className="w-full max-w-lg bg-gray-800 rounded-sm p-6 shadow-2xl border border-gray-700 relative my-auto z-10">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-900 via-red-600 to-red-900"></div>
        
        <div className="text-center mb-6">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={40} />
          <h2 className="text-2xl font-bold text-white tracking-widest uppercase">
            최종 수사 보고
          </h2>
          <p className="text-gray-500 text-[0.625rem] mt-2 uppercase tracking-wide">범인을 지목하고 사건의 진실을 밝히세요</p>
        </div>

        {/* 남은 자원. 여기서 시간 초과 여부가 등급 상한을 결정하는데
            과거에는 이 화면에 시간도 AP도 표시되지 않았다. */}
        <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-mono border ${
            isOverTime ? 'bg-red-900 text-red-200 border-red-700' : 'bg-gray-900 text-gray-400 border-gray-700'
          }`}>
            <Timer size={12} /> <span>{formatTime(timerSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-mono bg-gray-900 text-amber-500 border border-amber-900">
            <Zap size={12} /> <span>{actionPoints} / {totalActionPoints}</span>
          </div>
          <span className="text-[0.625rem] text-gray-500 font-sans w-full text-center mt-1">
            이 화면에서는 시간이 흐르지 않습니다
          </span>
        </div>

        {isOverTime && (
          <div className="mb-6 bg-red-950/40 border border-red-900 p-3 rounded-sm flex gap-2 items-start">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 leading-relaxed font-sans word-keep-all">
              제한 시간을 초과했습니다. 아무리 완벽한 추리라도 <span className="font-bold underline">최대 B등급</span>으로 제한됩니다.
            </p>
          </div>
        )}

        <div className="mb-6 space-y-4">
          <label className="block text-gray-400 text-xs font-sans uppercase tracking-wider font-bold">용의자 지목</label>
          <div className="grid grid-cols-3 gap-2">
            {caseData.suspects.map(s => (
              <button
                key={s.id}
                onClick={() => setDeductionInput(prev => ({ ...prev, culpritId: s.id }))}
                className={`p-2 py-4 rounded-sm border-2 text-center transition-all group ${
                  deductionInput.culpritId === s.id
                    ? 'border-red-600 bg-red-900/20 text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.3)]'
                    : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-500'
                }`}
              >
                <div className="w-full aspect-square bg-gray-800 mb-2 rounded-full overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform relative border border-gray-600">
                  {s.portraitImage ? (
                    <Image
                      src={s.portraitImage.startsWith('http') ? s.portraitImage : `data:image/jpeg;base64,${s.portraitImage}`}
                      unoptimized
                      alt={s.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <User size={32} />
                  )}
                </div>
                <div className="font-bold text-xs truncate">{s.name}</div>
                <div className="text-[0.625rem] text-gray-400 truncate mt-1">{s.role}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <label className="block text-gray-400 text-xs font-sans uppercase tracking-wider font-bold">범행 동기 및 트릭</label>
          {/* 등급을 결정하는 입력이다. 이 화면에서 가장 넓어야 한다.
              text-base(16px)는 iOS Safari가 포커스 시 페이지를 확대하지 않는 하한이다. */}
          <textarea
            value={deductionInput.reasoning}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDeductionInput(prev => ({ ...prev, reasoning: e.target.value }))}
            placeholder="누가, 왜, 어떻게 범행했는지 서술하세요. 세 가지를 모두 밝혀야 최고 등급을 받습니다."
            className="w-full min-h-[11.25rem] max-h-[50vh] bg-gray-900 border border-gray-700 rounded-sm p-3 text-white focus:border-red-600 focus:outline-none resize-y font-sans leading-relaxed text-base placeholder-gray-600"
          />
          {tooShort && deductionInput.reasoning.length > 0 && (
            <p className="text-[0.625rem] text-amber-600 font-sans">
              너무 짧습니다. 동기와 트릭을 함께 적으면 등급이 올라갑니다.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 min-h-[3rem] bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-4 rounded-sm transition-colors text-xs flex items-center justify-center gap-1"
          >
            <ChevronLeft size={14} /> 수사 계속하기
          </button>
          <button
            onClick={onSubmit}
            disabled={!deductionInput.culpritId || !deductionInput.reasoning.trim()}
            className="flex-[2] min-h-[3rem] bg-red-800 hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold py-4 rounded-sm shadow-xl text-sm tracking-widest transition-all"
          >
            제출
          </button>
        </div>
      </div>
    </div>
  );
}
