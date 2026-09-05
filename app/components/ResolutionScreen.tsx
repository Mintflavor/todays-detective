// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  FileText, User, ShieldAlert, RefreshCw, Eye, EyeOff, X, Skull,
  Microscope, MessageSquare, Send, CheckCircle, Archive, HelpCircle,
  Sparkles, MessageCircleQuestion
} from 'lucide-react';
import { Evaluation, CaseData, DeductionInput } from '../types/game';
import { submitFeedback, askCaseQuestion, QAMessage } from '../lib/api';

interface ResolutionScreenProps {
  evaluation: Evaluation;
  caseData: CaseData;
  deductionInput?: DeductionInput;
  onReset: () => void;
  /** 새 사건 생성(159원·횟수 제한)을 거치지 않는 경로. */
  onGoToArchive: () => void;
}

const FEEDBACK_MAX_LENGTH = 300;

interface DisplayQAMessage {
  role: 'user' | 'model';
  text: string;
}

const INITIAL_QA_MESSAGE: DisplayQAMessage = {
  role: 'model',
  text: '수사를 마치느라 수고 많으셨습니다, 탐정님. 이번 사건의 진실, 범인의 트릭, 용의자들의 숨겨진 사연, 또는 현장에서 이상하다고 느끼셨던 부분에 대해 무엇이든 질문해 주십시오. 사건의 모든 기록을 바탕으로 명쾌하게 설명해 드리겠습니다.',
};

const PRESET_QUESTIONS = [
  '💡 진범의 진짜 범행 동기는 무엇이었나요?',
  '🔍 제가 놓친 핵심 단서나 트릭은 무엇인가요?',
  '🕵️ 용의자들이 숨기고 있던 진짜 비밀은 무엇이었나요?',
  '⏱️ 사건 당일의 실제 타임라인을 정리해 주세요.',
];

export default function ResolutionScreen({ evaluation, caseData, deductionInput, onReset, onGoToArchive }: ResolutionScreenProps) {
  const [showTruth, setShowTruth] = useState(evaluation.isCorrect);
  const [showBriefing, setShowBriefing] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // --- AI 질의응답 (Q&A) State ---
  const [showQAModal, setShowQAModal] = useState(false);
  const [qaMessages, setQaMessages] = useState<DisplayQAMessage[]>([INITIAL_QA_MESSAGE]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const qaChatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showQAModal) {
      qaChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [qaMessages, showQAModal]);

  const closeFeedbackModal = () => {
    if (feedbackSending) return;
    setShowFeedback(false);
    setFeedbackError(null);
    setTimeout(() => {
      setFeedbackText('');
      setFeedbackSent(false);
    }, 300);
  };

  const handleSubmitFeedback = async () => {
    const trimmed = feedbackText.trim();
    if (!trimmed || feedbackSending) return;
    setFeedbackSending(true);
    setFeedbackError(null);
    try {
      const selectedSuspect = deductionInput?.culpritId
        ? caseData.suspects.find(s => s.id === deductionInput.culpritId)
        : undefined;

      await submitFeedback({
        content: trimmed,
        scenarioId: caseData.scenarioId,
        grade: evaluation.grade,
        gameResult: {
          scenarioTitle: caseData.title,
          selectedSuspectId: deductionInput?.culpritId ?? null,
          selectedSuspectName: selectedSuspect?.name ?? null,
          reasoning: deductionInput?.reasoning ?? '',
          isCorrect: evaluation.isCorrect,
          grade: evaluation.grade,
          culpritName: evaluation.culpritName,
          report: evaluation.report,
          advice: evaluation.advice,
          timeTaken: evaluation.timeTaken,
        },
      });
      setFeedbackSent(true);
      setTimeout(() => {
        closeFeedbackModal();
      }, 2000);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : '피드백 전송에 실패했습니다.');
    } finally {
      setFeedbackSending(false);
    }
  };

  const handleSendQA = async (questionToSend?: string) => {
    const q = (questionToSend ?? qaInput).trim();
    if (!q || qaLoading) return;

    setQaError(null);
    setQaLoading(true);
    setQaInput('');

    // 유저 메시지 추가
    const newMessages: DisplayQAMessage[] = [...qaMessages, { role: 'user', text: q }];
    setQaMessages(newMessages);

    try {
      // API 전달용 history 구성 (초기 환영 인사말 제외)
      const historyPayload: QAMessage[] = newMessages.slice(1, -1).map(m => ({
        role: m.role,
        content: m.text,
      }));

      const answer = await askCaseQuestion({
        scenarioId: caseData.scenarioId ?? '',
        question: q,
        history: historyPayload,
      });

      setQaMessages(prev => [...prev, { role: 'model', text: answer }]);
    } catch (err) {
      setQaError(err instanceof Error ? err.message : '답변을 불러오지 못했습니다.');
    } finally {
      setQaLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-serif overflow-y-auto relative">
      {/* Background Texture */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/papers_background.webp"
          alt="Resolution Background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gray-900/60" />
      </div>

      <div className="w-full max-w-4xl mx-auto space-y-8 animate-fade-in-up pb-10 mt-6 relative z-10">
        
        {/* Header */}
        <div className="text-center border-b border-gray-700/50 pb-6">
          <h2 className="text-2xl text-gray-200 font-bold tracking-widest uppercase shadow-black drop-shadow-md">수사 결과 보고서</h2>
          <p className="text-gray-400 text-[0.625rem] mt-2 font-mono">CASE ID: {evaluation.caseNumber || new Date().getTime().toString().slice(-6)}</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          
          {/* Left: Polaroid Result */}
          <div className="w-full md:w-1/3 bg-white p-3 shadow-2xl transform -rotate-2 relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-12 border-4 border-gray-400 rounded-t-full border-b-0 z-20"></div>
            
            {/* Image Area */}
            <div className="bg-gray-200 aspect-square mb-4 flex items-center justify-center relative overflow-hidden">
              {(showTruth || evaluation.isCorrect) && evaluation.culpritImage ? (
                <Image
                  src={evaluation.culpritImage.startsWith('http') ? evaluation.culpritImage : `data:image/jpeg;base64,${evaluation.culpritImage}`}
                  unoptimized
                  alt="Culprit"
                  fill
                  className="object-cover grayscale contrast-125"
                />
              ) : (
                <User size={80} className="text-gray-400" />
              )}
              
              {/* Stamp Overlay */}
              <div className={`absolute inset-0 flex items-center justify-center border-4 border-double m-2 opacity-80 mix-blend-multiply animate-stamp transform rotate-12 rounded-full
                ${evaluation.isCorrect ? 'border-red-600 text-red-600' : 'border-gray-500 text-gray-500'}`}>
                <span className="text-3xl font-black uppercase tracking-widest">
                  {evaluation.isCorrect ? '검거 성공' : '검거 실패'}
                </span>
              </div>
            </div>
            
            {/* Caption */}
            <div className="text-center font-handwriting text-gray-800 text-xl font-bold pb-2 border-b border-gray-100 min-h-[2.5rem]">
              진범: {showTruth ? evaluation.culpritName : '???'}
            </div>
            <div className="flex justify-between px-2 pt-2 font-mono text-xs text-gray-500">
              <span>{new Date().toLocaleDateString()}</span>
              {/* Time Taken Display */}
              <span className="font-bold text-gray-700">소요 시간: {evaluation.timeTaken}</span>
            </div>
          </div>

          {/* Right: Typewriter Report (Standardized UI) */}
          <div className="w-full md:w-2/3 space-y-6">
            
            {/* AI Feedback */}
            <div className="bg-[#f0e6d2] text-gray-900 p-6 shadow-xl rounded-sm relative" style={{ fontFamily: '"Courier New", Courier, monospace' }}>
              <div className="absolute top-0 right-0 p-2 opacity-20">
                <FileText size={48} />
              </div>
              
              {/* Grade Badge */}
              <div className="absolute top-4 right-4 w-16 h-16 border-4 border-red-800 rounded-full flex items-center justify-center transform rotate-12 opacity-80">
                <span className="text-3xl font-black text-red-800">{evaluation.grade}</span>
              </div>

              <h3 className="text-sm font-bold uppercase tracking-widest text-amber-900 mb-4 border-b border-amber-900/20 pb-2">
                탐정 수사 능력 평가
              </h3>
              
              <div className="space-y-6 text-sm leading-relaxed">
                <div>
                  <h4 className="font-bold text-gray-700 mb-1 border-l-4 border-gray-400 pl-2">종합 평가</h4>
                  <p>{evaluation.report}</p>
                </div>
                
                {/* Missed Clues / Hints Section */}
                <div>
                  <h4 className="font-bold text-gray-700 mb-1 border-l-4 border-red-400 pl-2">조언 및 놓친 단서</h4>
                  <p className="text-gray-700 italic bg-black/5 p-2 rounded">{evaluation.advice}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {/* AI 사건 질의응답 버튼 */}
              <button
                onClick={() => setShowQAModal(true)}
                className="w-full py-3.5 bg-amber-950/40 hover:bg-amber-900/50 border-2 border-amber-600/80 text-amber-300 rounded-sm flex items-center justify-center gap-2.5 transition-all text-sm font-bold shadow-lg group"
              >
                <MessageCircleQuestion size={18} className="text-amber-400 group-hover:scale-110 transition-transform" />
                <span>수석 분석관에게 사건 의문점 질문하기 (AI Q&A)</span>
                <span className="text-[0.625rem] bg-amber-600 text-gray-950 px-1.5 py-0.5 rounded font-mono font-black">
                  AI
                </span>
              </button>

              {/* Briefing Button */}
              <button 
                onClick={() => setShowBriefing(true)}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-amber-500 rounded-sm flex items-center justify-center gap-2 transition-all text-sm font-bold"
              >
                <FileText size={16} /> 사건 브리핑 문서 확인
              </button>

              {/* Truth Reveal Control */}
              {!evaluation.isCorrect && (
                <button 
                  onClick={() => setShowTruth(!showTruth)}
                  className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-sm flex items-center justify-center gap-2 transition-all text-sm font-bold"
                >
                  {showTruth ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showTruth ? "사건의 전말 숨기기" : "진범 및 사건의 전말 확인하기"}
                </button>
              )}
            </div>

            {/* Truth Reveal Content */}
            {showTruth && (
              <div className="bg-black/40 border border-gray-700 p-6 rounded-sm backdrop-blur-sm animate-fade-in">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                  <ShieldAlert size={14} /> 사건의 전말
                </h3>
                <p className="text-gray-300 leading-relaxed font-serif text-lg">
                  {evaluation.truth}
                </p>
              </div>
            )}

          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-center items-stretch md:items-center gap-3 pt-8 border-t border-gray-700 flex-wrap">
          <button
            onClick={() => setShowQAModal(true)}
            className="w-full md:w-auto bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 py-4 px-8 rounded-sm font-bold shadow-lg border-2 border-amber-600/80 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 text-lg"
          >
            <MessageCircleQuestion size={22} className="text-amber-400" /> 의문점 질문하기
          </button>
          <button
            onClick={onReset}
            className="w-full md:w-auto bg-amber-800 hover:bg-amber-700 text-amber-100 py-4 px-10 rounded-sm font-bold shadow-lg border border-amber-600 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 text-lg"
          >
            <RefreshCw size={20} /> 새로운 사건 맡기
          </button>
          <button
            onClick={onGoToArchive}
            className="w-full md:w-auto bg-gray-800 hover:bg-gray-700 text-gray-200 py-4 px-8 rounded-sm font-bold shadow-lg border border-gray-600 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 text-lg"
          >
            <Archive size={20} /> 지난 사건 맡기
          </button>
          <button
            onClick={() => setShowFeedback(true)}
            className="w-full md:w-auto bg-gray-800 hover:bg-gray-700 text-gray-200 py-4 px-8 rounded-sm font-bold shadow-lg border border-gray-600 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 text-lg"
          >
            <MessageSquare size={20} /> 사무소로 피드백 보내기
          </button>
        </div>

      </div>

      {/* Briefing Modal */}
      {showBriefing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-2xl bg-[#eaddcf] text-gray-900 rounded-sm shadow-2xl overflow-hidden relative max-h-[90vh] flex flex-col border border-gray-600">
            <div className="bg-gray-800 text-gray-200 p-4 flex justify-between items-center shrink-0 border-b border-amber-900/30">
              <h3 className="font-bold text-lg flex items-center gap-2 font-serif text-amber-500">
                <FileText size={20} /> 사건 브리핑 문서
              </h3>
              <button onClick={() => setShowBriefing(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto font-serif space-y-8 bg-[#eaddcf]">
              
              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <FileText size={14} /> 사건 개요
                </h3>
                <p className="text-sm leading-relaxed font-medium text-gray-800 border-l-4 border-amber-800/30 pl-4">
                  {caseData.summary}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <Skull size={14} /> 피해자 정보
                </h3>
                <div className="bg-black/5 p-4 rounded-sm border border-black/10 text-sm space-y-2">
                  <div className="flex justify-between border-b border-black/10 pb-1">
                    <span className="font-bold text-gray-700">이름:</span>
                    <span>{caseData.victim_info.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-black/10 pb-1">
                    <span className="font-bold text-gray-700">발생 시각:</span>
                    <span>{caseData.victim_info.incident_time}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 block mb-1">피해 내용:</span>
                    <span className="block pl-2 text-gray-800">{caseData.victim_info.damage_details}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 block mb-1">현장 상태:</span>
                    <span className="block pl-2 text-gray-800">{caseData.victim_info.body_condition}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <Microscope size={14} /> 초동 증거물
                </h3>
                <div className="space-y-2">
                  {caseData.evidence_list.map((item, idx) => (
                    <div key={idx} className="bg-white/50 p-3 rounded-sm border border-black/5 flex gap-3 items-start">
                      <div className="w-1 h-full bg-amber-800 rounded-full shrink-0"></div>
                      <div>
                        <div className="font-bold text-sm text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-600">{item.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <User size={14} /> 용의자 목록
                </h3>
                <div className="grid gap-3">
                  {caseData.suspects.map(s => (
                    <div key={s.id} className="flex items-center gap-4 bg-black/5 p-4 rounded-sm border border-black/10">
                      <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center shrink-0 border border-gray-400 overflow-hidden relative">
                        {s.portraitImage ? (
                          <Image
                            src={s.portraitImage.startsWith('http') ? s.portraitImage : `data:image/jpeg;base64,${s.portraitImage}`}
                            unoptimized
                            alt={s.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <User className="text-gray-600" size={24} />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-base text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-600 italic">{s.role} | {s.personality}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </div>
            
            <div className="p-4 bg-gray-200 border-t border-gray-300 text-center shrink-0">
              <button
                onClick={() => setShowBriefing(false)}
                className="px-8 py-3 bg-gray-800 text-white rounded-sm font-bold text-sm hover:bg-gray-700 transition-colors uppercase tracking-widest"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#1a1a1a] text-gray-200 rounded-sm shadow-2xl overflow-hidden relative flex flex-col border border-gray-700">
            <div className="bg-gray-800 p-4 flex justify-between items-center shrink-0 border-b border-amber-900/30">
              <h3 className="font-bold text-lg flex items-center gap-2 font-serif text-amber-500">
                <MessageSquare size={20} /> 사무소로 피드백 보내기
              </h3>
              <button
                onClick={closeFeedbackModal}
                disabled={feedbackSending}
                className="text-gray-400 hover:text-white transition-colors disabled:opacity-30"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {feedbackSent ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-3 animate-fade-in">
                  <CheckCircle size={48} className="text-amber-500" />
                  <p className="text-lg font-serif text-gray-100">소중한 피드백 감사합니다.</p>
                  <p className="text-xs text-gray-500 font-mono tracking-widest uppercase">Message Delivered</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400 font-serif leading-relaxed">
                    게임에 대한 의견이나 개선 사항을 사무소로 전해주세요. 최대 300자까지 남길 수 있습니다.
                  </p>
                  <div className="relative">
                    <textarea
                      value={feedbackText}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.length <= FEEDBACK_MAX_LENGTH) setFeedbackText(v);
                      }}
                      maxLength={FEEDBACK_MAX_LENGTH}
                      disabled={feedbackSending}
                      placeholder="자유롭게 작성해주세요..."
                      rows={6}
                      className="w-full bg-black/40 border border-gray-700 focus:border-amber-700 focus:outline-none text-gray-200 text-sm p-3 rounded-sm resize-none font-serif placeholder-gray-600"
                    />
                    <div className="absolute bottom-2 right-3 text-[0.625rem] font-mono text-gray-500">
                      {feedbackText.length} / {FEEDBACK_MAX_LENGTH}
                    </div>
                  </div>

                  {feedbackError && (
                    <p className="text-xs text-red-400 font-mono">{feedbackError}</p>
                  )}
                </>
              )}
            </div>

            {!feedbackSent && (
              <div className="p-4 bg-black/40 border-t border-gray-800 flex gap-3 shrink-0">
                <button
                  onClick={closeFeedbackModal}
                  disabled={feedbackSending}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-sm font-mono text-sm uppercase tracking-wider transition-colors disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmitFeedback}
                  disabled={feedbackSending || !feedbackText.trim()}
                  className="flex-1 bg-amber-800 hover:bg-amber-700 text-amber-100 py-3 rounded-sm font-mono text-sm uppercase tracking-wider transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {feedbackSending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-amber-100 border-t-transparent rounded-full animate-spin" />
                      전송 중
                    </>
                  ) : (
                    <>
                      <Send size={14} /> 전송
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────── AI 사건 심층 질의응답 모달 ───────── */}
      {showQAModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-5 animate-fade-in">
          <div className="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-sm shadow-2xl flex flex-col h-[88vh] max-h-[88vh] overflow-hidden text-gray-200">
            {/* 모달 헤더 */}
            <div className="bg-gray-800 px-5 py-3.5 border-b border-gray-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-wider text-white font-serif flex items-center gap-2">
                    <span>사건 심층 질의응답</span>
                    <span className="text-[0.625rem] px-2 py-0.5 rounded bg-gray-950 text-amber-400 border border-amber-700/60 font-mono">
                      gemini-3.8-flash
                    </span>
                  </h3>
                  <p className="text-[0.6875rem] text-gray-400 font-sans">
                    사건의 모든 내막을 알고 있는 수석 사건 분석관실
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQAModal(false)}
                className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 추천 질문 칩 영역 (빠른 질문) */}
            <div className="bg-gray-950/80 px-4 py-2.5 border-b border-gray-800 shrink-0 overflow-x-auto flex gap-2 no-scrollbar">
              <span className="text-[0.625rem] font-bold text-gray-500 uppercase tracking-wider py-1 shrink-0 flex items-center gap-1 font-mono">
                <HelpCircle size={12} /> 추천 질문:
              </span>
              {PRESET_QUESTIONS.map((pq, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={qaLoading}
                  onClick={() => handleSendQA(pq.replace(/^[^\s]+\s/, ''))}
                  className="text-xs bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-amber-300 px-3 py-1 rounded-full border border-gray-700 transition-all shrink-0 disabled:opacity-50"
                >
                  {pq}
                </button>
              ))}
            </div>

            {/* 대화 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 font-sans space-y-4 bg-gray-900/60">
              {qaMessages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[0.6875rem] text-gray-400 mb-1 px-1">
                      {isUser ? (
                        <>
                          <span className="font-bold text-amber-400">담당 탐정</span>
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-amber-500 font-serif">수석 사건 분석관</span>
                          <span className="text-[0.625rem] text-gray-500 font-mono">Chief Analyst</span>
                        </>
                      )}
                    </div>

                    <div
                      className={`max-w-[90%] sm:max-w-[82%] rounded-sm p-4 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap shadow-md ${
                        isUser
                          ? 'bg-amber-950/30 border border-amber-800/60 text-amber-100'
                          : 'bg-[#f4ebd8] text-gray-900 border border-amber-900/20 font-serif'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}

              {/* 로딩 인디케이터 */}
              {qaLoading && (
                <div className="flex flex-col items-start animate-fade-in">
                  <div className="text-[0.6875rem] text-amber-500 font-bold mb-1 px-1 font-serif">
                    수석 사건 분석관
                  </div>
                  <div className="bg-[#f4ebd8] text-gray-800 border border-amber-900/20 rounded-sm p-4 text-xs sm:text-sm flex items-center gap-3 font-serif shadow-md">
                    <div className="w-4 h-4 border-2 border-amber-900 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>수석 분석관이 사건 기록과 타임라인을 대조하고 있습니다...</span>
                  </div>
                </div>
              )}

              {/* 에러 메시지 */}
              {qaError && (
                <div className="p-3 bg-red-950/40 border border-red-900 text-red-300 text-xs rounded-sm flex items-center justify-between">
                  <span>{qaError}</span>
                  <button
                    type="button"
                    onClick={() => setQaError(null)}
                    className="text-red-400 hover:text-red-200 underline text-[0.6875rem]"
                  >
                    닫기
                  </button>
                </div>
              )}

              <div ref={qaChatEndRef} />
            </div>

            {/* 모달 입력 폼 */}
            <div className="bg-gray-800/95 p-3 sm:p-4 border-t border-gray-700 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendQA();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  disabled={qaLoading}
                  placeholder="사건에 대해 궁금한 점이나 의문점을 자유롭게 질문하세요... (예: 범인의 알리바이 트릭이 뭐였나요?)"
                  className="flex-1 bg-gray-950 border border-gray-700 focus:border-amber-600 focus:outline-none text-white text-xs sm:text-sm px-3.5 py-3 rounded-sm font-sans placeholder-gray-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={qaLoading || !qaInput.trim()}
                  className="px-5 py-3 bg-amber-800 hover:bg-amber-700 disabled:bg-gray-800 disabled:text-gray-600 text-amber-100 rounded-sm font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 shrink-0"
                >
                  <Send size={15} />
                  <span>질문하기</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
