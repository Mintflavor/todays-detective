// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import React, { useState, ChangeEvent } from 'react';
import Image from 'next/image';
import {
  AlertCircle, User, ChevronLeft, Timer, Zap, AlertTriangle,
  Notebook, MessageSquare, Package, X, Shield
} from 'lucide-react';
import { CaseData, DeductionInput, ChatLogs } from '../types/game';
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
  chatLogs?: ChatLogs;
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
  totalActionPoints,
  chatLogs = { 0: [] },
}: DeductionScreenProps) {
  const tooShort = deductionInput.reasoning.trim().length < REASONING_MIN_LENGTH;
  const [showRecordsModal, setShowRecordsModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'notebook' | 'interrogation' | 'evidence'>('notebook');
  const [selectedSuspectId, setSelectedSuspectId] = useState<number>(
    caseData.suspects[0]?.id ?? 1
  );

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

        {/* 수사 기록 및 대화 열람 버튼 */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowRecordsModal(true)}
            className="w-full py-2.5 px-4 bg-gray-900/90 hover:bg-gray-700/80 border border-amber-600/50 hover:border-amber-500 text-amber-400 rounded-sm text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md group"
          >
            <Notebook size={15} className="text-amber-500 group-hover:scale-110 transition-transform" />
            <span>수사 기록 열람 (수사 수첩 및 용의자 심문 내역)</span>
            <span className="text-[0.625rem] bg-amber-950/80 text-amber-300 px-2 py-0.5 rounded border border-amber-800/60 ml-1">
              확인
            </span>
          </button>
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

      {/* 수사 기록 및 심문 대화 조회 모달 */}
      {showRecordsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-5 animate-fade-in">
          <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-sm shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-gray-200">
            {/* 모달 헤더 */}
            <div className="bg-gray-800 px-5 py-3.5 border-b border-gray-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Notebook size={18} className="text-amber-500" />
                <h3 className="font-bold text-sm tracking-wider text-white font-serif">
                  수사 기록철 열람
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRecordsModal(false)}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 탭 네비게이션 */}
            <div className="flex border-b border-gray-800 bg-gray-950/60 px-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('notebook')}
                className={`py-3 px-4 text-xs font-bold font-serif flex items-center gap-1.5 border-b-2 transition-all ${
                  activeTab === 'notebook'
                    ? 'border-amber-500 text-amber-400 bg-gray-800/40'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Notebook size={14} />
                <span>수사 수첩 메모</span>
                <span className="text-[0.625rem] px-1.5 py-0.2 bg-gray-800 rounded text-gray-300">
                  {Math.max(0, (chatLogs[0] || []).length - 1)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('interrogation')}
                className={`py-3 px-4 text-xs font-bold font-serif flex items-center gap-1.5 border-b-2 transition-all ${
                  activeTab === 'interrogation'
                    ? 'border-amber-500 text-amber-400 bg-gray-800/40'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <MessageSquare size={14} />
                <span>용의자 심문 기록</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('evidence')}
                className={`py-3 px-4 text-xs font-bold font-serif flex items-center gap-1.5 border-b-2 transition-all ${
                  activeTab === 'evidence'
                    ? 'border-amber-500 text-amber-400 bg-gray-800/40'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Package size={14} />
                <span>확보된 증거물</span>
                <span className="text-[0.625rem] px-1.5 py-0.2 bg-gray-800 rounded text-gray-300">
                  {(caseData.evidence_list || []).length}
                </span>
              </button>
            </div>

            {/* 탭 내용 영역 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 font-sans space-y-4">
              {/* 1. 수사 수첩 */}
              {activeTab === 'notebook' && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-400 bg-gray-800/40 p-3 rounded border border-gray-700/50 flex items-center gap-2">
                    <Shield size={14} className="text-amber-500 shrink-0" />
                    <span>수사 도중 수첩에 기록해 둔 현장 메모 및 단서 목록입니다.</span>
                  </div>

                  {(!chatLogs[0] || chatLogs[0].length <= 1) ? (
                    <div className="text-center py-12 text-gray-500 text-xs font-serif">
                      기록된 추가 수사 메모가 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {chatLogs[0].map((msg, idx) => (
                        idx === 0 ? null : (
                          <div
                            key={idx}
                            className="bg-gray-800/80 border border-gray-700/70 p-3 rounded-sm text-sm text-gray-200 leading-relaxed"
                          >
                            <div className="text-[0.625rem] text-amber-500/80 font-mono mb-1">
                              MEMO #{idx}
                            </div>
                            <div className="whitespace-pre-wrap">{msg.text}</div>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. 용의자 심문 기록 */}
              {activeTab === 'interrogation' && (
                <div className="space-y-4">
                  {/* 용의자 서브 탭 */}
                  <div className="grid grid-cols-3 gap-2">
                    {caseData.suspects.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSuspectId(s.id)}
                        className={`p-2 rounded-sm border text-center transition-all flex flex-col items-center ${
                          selectedSuspectId === s.id
                            ? 'border-amber-500 bg-amber-950/20 text-amber-300'
                            : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <span className="font-bold text-xs truncate w-full">{s.name}</span>
                        <span className="text-[0.625rem] text-gray-500 truncate w-full">{s.role}</span>
                      </button>
                    ))}
                  </div>

                  {/* 선택된 용의자 대화 목록 */}
                  <div className="bg-gray-950/70 border border-gray-800 rounded-sm p-4 min-h-[15rem] max-h-[45vh] overflow-y-auto space-y-3">
                    {(!chatLogs[selectedSuspectId] || chatLogs[selectedSuspectId].length <= 1) ? (
                      <div className="text-center py-10 text-gray-500 text-xs font-serif">
                        해당 용의자와의 심문 기록이 없습니다.
                      </div>
                    ) : (
                      chatLogs[selectedSuspectId].map((msg, idx) => {
                        if (msg.role === 'system') {
                          return (
                            <div key={idx} className="text-center text-[0.6875rem] text-gray-400 italic bg-gray-900/80 py-1.5 px-3 rounded border border-gray-800 whitespace-pre-line">
                              {msg.text}
                            </div>
                          );
                        }

                        const isUser = msg.role === 'user';
                        return (
                          <div
                            key={idx}
                            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                          >
                            <span className="text-[0.625rem] text-gray-500 mb-1 px-1">
                              {isUser ? '탐정' : (caseData.suspects.find(s => s.id === selectedSuspectId)?.name ?? '용의자')}
                            </span>
                            <div
                              className={`max-w-[85%] rounded-sm p-3 text-xs leading-relaxed whitespace-pre-wrap ${
                                isUser
                                  ? 'bg-amber-950/40 border border-amber-800/50 text-amber-100'
                                  : 'bg-gray-800 border border-gray-700 text-gray-200'
                              }`}
                            >
                              {msg.text}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* 3. 확보된 증거물 */}
              {activeTab === 'evidence' && (
                <div className="space-y-3">
                  {(!caseData.evidence_list || caseData.evidence_list.length === 0) ? (
                    <div className="text-center py-10 text-gray-500 text-xs font-serif">
                      확보된 증거물이 없습니다.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {caseData.evidence_list.map((item, idx) => (
                        <div
                          key={idx}
                          className="bg-gray-800/80 border border-gray-700 p-3 rounded-sm flex gap-3 items-start"
                        >
                          <Package size={18} className="text-amber-500 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <div className="font-bold text-xs text-white">{item.name}</div>
                            <div className="text-[0.6875rem] text-gray-400 leading-relaxed">
                              {item.description}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="bg-gray-800/80 px-4 py-3 border-t border-gray-700 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowRecordsModal(false)}
                className="py-2 px-5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-bold rounded-sm transition-colors"
              >
                닫고 추리 작성 계속하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
