// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

/**
 * 심문 화면 — 「심문조서」
 *
 * ## 왜 말풍선을 버렸는가
 *
 * 이전 화면은 어두운 배경에 좌우 말풍선과 하단 탭이었다. 구조가 메신저와 같아서
 * **추리 게임이 아니라 채팅앱처럼 읽혔고**, 용의자는 32px 썸네일로만 존재해서
 * 누구와 이야기하는지 감각이 남지 않았다.
 *
 * 그래서 화면 전체를 하나의 문서로 바꿨다. 어두운 책상 위에 조서 한 장이 놓여 있고,
 * 진술이 문/답으로 타자기에 찍힌다.
 *
 * ## 세 가지를 의도적으로 해결한다
 *
 * 1. **용의자가 사람처럼 보이게** — 초상화를 조서 머리에 클립으로 물린 증명사진으로
 *    키웠다. 스크롤 영역 밖에 두어 진술을 읽는 동안 얼굴이 사라지지 않는다.
 * 2. **정보를 찾으러 나가지 않게** — 증거·피해자 정보를 `CaseFileRail`로 같은 화면에
 *    둔다. 데스크톱은 조서 옆, 모바일은 아래에서 올라오는 서류철. 예전에는 브리핑
 *    화면까지 나갔다 와야 해서 대화 맥락이 끊겼다.
 * 3. **밝은 종이, 어두운 책상** — 다른 화면이 전부 다크이므로 화면을 통째로 밝게
 *    뒤집지 않는다. 종이만 조명을 받는다.
 *
 * ## 건드리지 않은 것
 *
 * 프롭 시그니처는 그대로다. `AdminScreen`이 이 화면을 미리보기로 렌더링하므로
 * 프롭을 늘리면 그쪽도 같이 고쳐야 한다. 증거·피해자 정보는 이미 `caseData`에 있어서
 * 새 프롭 없이 화면 안으로 끌어올 수 있었다.
 *
 * 용의자 id를 1~3으로 가정하지 않는다 (LLM이 다른 id를 줄 수 있다).
 * 증거 개수도 사건마다 다르다 — 서버가 뽑아 주입한다.
 */

import React, { useRef, useEffect, useState, KeyboardEvent, ChangeEvent } from 'react';
import Image from 'next/image';
import {
  Volume2, VolumeX, AlertTriangle, Notebook, User, Send,
  Stamp, FolderOpen, X, PenLine, Maximize2, Package,
} from 'lucide-react';
import { CaseData, ChatLogs, Evidence } from '../types/game';
import { formatTime } from '../lib/utils';
import CaseFileRail from './CaseFileRail';

interface InvestigationScreenProps {
  caseData: CaseData;
  currentSuspectId: number;
  setCurrentSuspectId: (id: number) => void;
  chatLogs: ChatLogs;
  /** 용의자 id -> 남은 심문 횟수. AP는 공유 풀이 아니라 용의자마다 따로다. */
  actionPoints: Record<number, number>;
  /** 용의자 1명당 총 횟수. */
  totalActionPoints: number;
  timerSeconds: number;
  isOverTime: boolean;
  showTimeOverModal: boolean;
  closeTimeOverModal: () => void;
  userInput: string;
  handleInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleSendMessage: () => void;
  inputPlaceholder: string;
  isTyping: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  onGoToBriefing: () => void;
  onGoToDeduction: () => void;
  selectedEvidenceName?: string | null;
  setSelectedEvidenceName?: (name: string | null) => void;
  newlyUnlockedEvidence?: Evidence | null;
}

/**
 * 초상화 주소. 구 데이터에는 `portraitImage`가 base64 문자열인 것이 있다
 * (지금은 MinIO URL). 분기가 세 곳에 흩어져 있었으므로 여기로 모았다.
 */
function portraitSrc(portrait: string): string {
  return portrait.startsWith('http') ? portrait : `data:image/jpeg;base64,${portrait}`;
}

/** 조서 번호. 서버가 caseNumber를 주지 않으면 시나리오 id 끝자리로 만든다. */
function recordNumber(caseData: CaseData): string {
  if (caseData.caseNumber) return caseData.caseNumber;
  if (caseData.scenarioId) return caseData.scenarioId.slice(-6).toUpperCase();
  return '——————';
}

/** 사진을 조서에 물린 클립. */
function Paperclip() {
  return (
    <svg
      viewBox="0 0 24 48"
      aria-hidden="true"
      className="absolute -top-3.5 left-1.5 h-9 w-[1.125rem] rotate-[-8deg] text-slate-400 drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)] sm:-top-4 sm:h-11 sm:w-5"
    >
      <path
        d="M6 31V11a6 6 0 0 1 12 0v25a9 9 0 0 1-18 0V15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 한 용의자에게 남은 심문 횟수를 눈금으로 보여준다.
 * 숫자만 있으면 남은 양이 몸으로 느껴지지 않는다 — 칸이 하나씩 지워진다.
 * 총량이 바뀔 수 있으므로 flex-1로 폭에 맞춰 나눈다 (20칸도 좁은 화면에 들어간다).
 *
 * 색은 **종이 위 기준**이다. 예전에는 어두운 책상 헤더에 있어서 앰버였는데,
 * AP가 용의자에게 속하게 되면서 조서 머리로 옮겼다.
 */
function ActionTally({ used, total }: { used: number; total: number }) {
  const left = total - used;
  return (
    <div className="flex h-[0.3125rem] w-full gap-[1.5px]" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[1px] transition-colors duration-500 ${
            i < used
              ? 'bg-ink/12'
              : left <= 5
                ? 'bg-stamp'
                : 'bg-ink/55'
          }`}
        />
      ))}
    </div>
  );
}

/** 좌측 여백의 편철 구멍. */
function PunchHoles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[0.7rem] sm:left-[1.1rem]">
      <span className="td-punch absolute top-[16%] block h-[0.5625rem] w-[0.5625rem] rounded-full sm:h-[0.6875rem] sm:w-[0.6875rem]" />
      <span className="td-punch absolute top-[58%] block h-[0.5625rem] w-[0.5625rem] rounded-full sm:h-[0.6875rem] sm:w-[0.6875rem]" />
    </div>
  );
}

/**
 * 조서 머리의 증명사진.
 *
 * 조서 안에서는 세로 비율로 **잘라서** 쓴다 (얼굴이 크게 보이는 쪽이 낫다).
 * 원본은 512x512 정사각형이라 잘린 부분이 있으므로, 누르면 자르지 않은 원본을 보여준다.
 * 사진이 없는 용의자는 누를 것이 없으므로 버튼으로 만들지 않는다.
 */
function MugShot({
  name,
  portrait,
  onOpen,
}: {
  name: string;
  portrait?: string;
  onOpen: () => void;
}) {
  const frame =
    'relative h-[5.375rem] w-[4.25rem] overflow-hidden rounded-[1px] border border-ink/30 bg-ink/10 shadow-[0_3px_10px_rgba(0,0,0,0.4)] sm:h-[7.375rem] sm:w-[5.875rem]';

  const inner = portrait ? (
    <>
      <Image
        src={portraitSrc(portrait)}
        unoptimized
        alt={`${name} 증명사진`}
        fill
        className="object-cover contrast-[1.06] saturate-[0.72] sepia-[0.14] transition-transform duration-300 group-hover:scale-[1.05]"
      />
      {/* 인화지 광택 */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/20 mix-blend-overlay"
      />
      {/* 누를 수 있다는 표시 — 평소에는 숨긴다 (조서를 어지럽히지 않게) */}
      <span
        aria-hidden="true"
        className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-ink/75 text-paper opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <Maximize2 size={11} />
      </span>
    </>
  ) : (
    <div className="grid h-full w-full place-items-center text-ink-faint">
      <User size={30} strokeWidth={1.4} />
    </div>
  );

  return (
    <div className="relative shrink-0 animate-[td-clip-in_0.55s_0.15s_ease-out_both]">
      {portrait ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${name} 사진 크게 보기`}
          className={`${frame} group cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen`}
        >
          {inner}
        </button>
      ) : (
        <div className={frame}>{inner}</div>
      )}
      <Paperclip />
    </div>
  );
}

export default function InvestigationScreen({
  caseData,
  currentSuspectId,
  setCurrentSuspectId,
  chatLogs,
  actionPoints,
  totalActionPoints,
  timerSeconds,
  isOverTime,
  showTimeOverModal,
  closeTimeOverModal,
  userInput,
  handleInputChange,
  handleKeyDown,
  handleSendMessage,
  inputPlaceholder,
  isTyping,
  isMuted,
  toggleMute,
  onGoToBriefing,
  onGoToDeduction,
  selectedEvidenceName,
  setSelectedEvidenceName,
  newlyUnlockedEvidence,
}: InvestigationScreenProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentSuspect = caseData.suspects.find((s) => s.id === currentSuspectId);

  /** 모바일 서류철. 데스크톱은 항상 펼쳐져 있으므로 이 상태를 쓰지 않는다. */
  const [fileOpen, setFileOpen] = useState(false);
  /** 증거 선택 팝업 */
  const [evidenceMenuOpen, setEvidenceMenuOpen] = useState(false);
  /**
   * 증명사진 확대 — 열린 상태를 boolean이 아니라 **어느 용의자의 사진인지**로 들고 있다.
   *
   * boolean으로 두면 용의자를 바꿀 때 닫아주는 effect가 필요하고(안 닫으면 방금 전
   * 사람의 얼굴이 그대로 떠 있다), 그 effect는 렌더 중 setState라 연쇄 렌더를 만든다.
   * id를 담아 두면 현재 용의자와 비교만 하면 되므로 동기화할 것이 없다.
   */
  const [photoFor, setPhotoFor] = useState<number | null>(null);
  const photoOpen = photoFor !== null && photoFor === currentSuspectId;

  const isNotebook = currentSuspectId === 0;
  const log = chatLogs[currentSuspectId] ?? [];
  const answered = log.filter((m) => m.role === 'ai').length;

  /** 이 용의자에게 남은 심문 횟수. 수첩은 AP를 쓰지 않는다. */
  const remaining = isNotebook ? totalActionPoints : (actionPoints[currentSuspectId] ?? 0);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs, currentSuspectId, isTyping]);

  // 심문이 끝나면 바로 다음 질문을 쓸 수 있게 한다.
  useEffect(() => {
    if (!isTyping && remaining > 0) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isTyping, currentSuspectId, remaining]);

  // 겹쳐 뜬 것을 Escape로 닫는다. 위에 있는 것부터 닫힌다.
  // 뒤로가기는 usePhaseHistory가 게임 내 이동으로 쓰므로 여기서 건드리지 않는다.
  useEffect(() => {
    if (!fileOpen && !photoOpen && !evidenceMenuOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (evidenceMenuOpen) setEvidenceMenuOpen(false);
      else if (photoOpen) setPhotoFor(null);
      else setFileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fileOpen, photoOpen, evidenceMenuOpen]);

  const inputDisabled = !isNotebook && (remaining <= 0 || isTyping);
  const sendDisabled = isNotebook
    ? !userInput.trim()
    : remaining <= 0 || isTyping || (!userInput.trim() && !selectedEvidenceName);

  return (
    <div className="td-desk relative flex h-[100dvh] flex-col overflow-hidden">
      {/* 책상 위 서류 뭉치 — 아주 옅게 깔린다 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 opacity-[0.055]">
        <Image src="/images/papers_background.webp" alt="" fill className="object-cover" priority />
      </div>

      {/* ───────── 책상 헤더 ───────── */}
      <header className="relative z-30 shrink-0 border-b border-black/60 bg-black/45 px-3 py-2 backdrop-blur-sm sm:px-5">
        <div className="mx-auto flex w-full max-w-[78rem] items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-type text-[0.625rem] text-amber-600/70">No.{recordNumber(caseData)}</span>
              <h2 className="truncate font-dossier text-[0.9375rem] font-bold tracking-tight text-amber-200/95 sm:text-base">
                {caseData.title}
              </h2>
            </div>
            <button
              onClick={onGoToBriefing}
              className="-my-1.5 flex min-h-[2.75rem] items-center text-left text-[0.6875rem] text-stone-400/80 underline decoration-stone-600 underline-offset-2 transition-colors hover:text-amber-200"
            >
              사건 브리핑으로
            </button>
          </div>

          {/* 남은 시간 — 초과하면 붉게 뛴다 */}
          <div className="shrink-0 text-right">
            <div className="font-dossier text-[0.5625rem] uppercase tracking-[0.2em] text-stone-500">남은 시간</div>
            <div
              className={`font-type text-lg leading-none tabular-nums sm:text-xl ${
                isOverTime ? 'animate-pulse text-stamp' : 'text-stone-200'
              }`}
            >
              {formatTime(timerSeconds)}
            </div>
          </div>

          <button
            onClick={toggleMute}
            aria-label={isMuted ? '배경음 켜기' : '배경음 끄기'}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone-500 transition-colors hover:bg-white/5 hover:text-amber-300"
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          {/* 범인 지목 — 관인을 찍는 행위로 보이게 */}
          <button
            onClick={onGoToDeduction}
            className="td-stamp flex min-h-[2.75rem] shrink-0 items-center rounded-[2px] bg-paper/95 px-2.5 py-2 font-dossier text-[0.6875rem] font-bold leading-tight tracking-[0.16em] transition-transform active:scale-[0.97] sm:px-3.5 sm:text-xs"
          >
            범인 지목
          </button>
        </div>
      </header>

      {/* ───────── 새로운 증거 해금 알림 배너 ───────── */}
      {newlyUnlockedEvidence && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-50 -translate-x-1/2 animate-bounce sm:top-16">
          <div className="td-paper flex items-center gap-2.5 rounded-[2px] border-2 border-stamp bg-paper px-4 py-2.5 shadow-2xl">
            <Package size={22} className="animate-pulse text-stamp" />
            <div>
              <div className="font-dossier text-[0.6875rem] font-bold tracking-widest text-stamp">
                새로운 증거 확보!
              </div>
              <div className="font-dossier text-sm font-bold text-ink">
                {newlyUnlockedEvidence.name}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────── 본체: 조서 + 서류철 ───────── */}
      <div className="relative z-10 flex min-h-0 flex-1 justify-center gap-5 overflow-hidden px-2 pb-2 pt-3 sm:px-4 sm:pb-3 lg:px-6 lg:pt-5">
        {/*
          조서 열 — 조서·색인표·기재란을 한 열로 묶는다.
          처음에는 기재란을 별도 푸터에 두고 오른쪽 여백을 계산해서 맞췄는데,
          조서는 서류철과 **함께 가운데 정렬**되므로 폭이 68px 어긋났다.
          한 장의 문서가 아니라 무관한 종이 두 장처럼 보였다 — 계산이 아니라 구조로 맞춘다.
        */}
        <div className="flex min-h-0 w-full max-w-[46rem] flex-col">
        <main className="td-paper td-margin-rule relative flex min-h-0 flex-1 animate-[td-sheet-in_0.45s_ease-out_both] flex-col rounded-[2px] [--td-margin:2.1rem] sm:[--td-margin:3rem]">
          <PunchHoles />

          {/* 시간 초과 관인 — 조서에 찍혀 남는다 */}
          {isOverTime && (
            <div
              aria-hidden="true"
              className="td-stamp pointer-events-none absolute right-3 top-3 z-20 animate-[td-stamp-in_0.5s_ease-out_both] rounded-[2px] px-2 py-1 font-dossier text-[0.625rem] font-bold tracking-[0.18em] sm:right-6 sm:px-3 sm:text-xs"
            >
              시간 초과
            </div>
          )}

          {/* ── 조서 머리 (스크롤되지 않는다: 얼굴이 사라지면 안 된다) ── */}
          <div className="relative shrink-0 border-b-[3px] border-double border-ink/25 pb-3 pl-[2.6rem] pr-3 pt-4 sm:pb-4 sm:pl-[3.6rem] sm:pr-6 sm:pt-5">
            <div className="flex items-start gap-3 sm:gap-5">
              {isNotebook ? (
                <div className="grid h-[4.75rem] w-[3.75rem] shrink-0 place-items-center rounded-[2px] border border-ink/25 bg-paper-2/70 text-ink-faint shadow-inner sm:h-[6.5rem] sm:w-[5.125rem]">
                  <Notebook size={26} strokeWidth={1.4} />
                </div>
              ) : (
                /* 클립에 물린 증명사진 — 누르면 원본 크기로 본다 */
                <MugShot
                  name={currentSuspect?.name ?? ''}
                  portrait={currentSuspect?.portraitImage}
                  onOpen={() => setPhotoFor(currentSuspectId)}
                />
              )}

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="font-dossier text-[0.5625rem] font-bold tracking-[0.34em] text-stamp sm:text-[0.625rem]">
                  {isNotebook ? '수 사 수 첩' : '심 문 조 서'}
                </div>
                <h1 className="mt-0.5 truncate font-dossier text-[1.375rem] font-bold leading-tight text-ink sm:text-3xl">
                  {isNotebook ? '수사 수첩' : currentSuspect?.name}
                </h1>
                <p className="mt-1 truncate font-record text-[0.8125rem] text-ink-soft sm:text-[0.875rem]">
                  {isNotebook
                    ? '나 혼자 보는 기록. 행동력을 쓰지 않는다.'
                    : [
                        currentSuspect?.role,
                        currentSuspect?.relationship_to_victim,
                        currentSuspect?.age ? `${currentSuspect.age}세` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-ink/20 pt-2 font-record text-[0.6875rem] text-ink-faint sm:text-[0.75rem]">
                  {isNotebook ? (
                    <span>메모 {log.length}건</span>
                  ) : (
                    <>
                      <span>답변 {answered}건</span>
                      <span className="text-ink/20">|</span>
                      {/* AP가 용의자에게 속하므로 조서 머리에 둔다 (예전에는 책상 헤더의 전역 수치였다) */}
                      <span className={remaining <= 5 ? 'font-bold text-stamp' : undefined}>
                        이 사람에게 남은 심문 {remaining}회
                      </span>
                    </>
                  )}
                  {/* 모바일에서 서류철을 여는 유일한 입구 */}
                  <button
                    onClick={() => setFileOpen(true)}
                    className="ml-auto -my-2.5 flex min-h-[2.75rem] items-center gap-1 rounded-[2px] border border-ink/25 bg-paper-2/60 px-2 py-1 font-dossier text-[0.625rem] font-bold tracking-wider text-ink-soft transition-colors hover:bg-paper-3/60 lg:hidden"
                  >
                    <FolderOpen size={12} />
                    사건 서류
                  </button>
                </div>

                {!isNotebook && (
                  <div className="mt-2">
                    <ActionTally used={totalActionPoints - remaining} total={totalActionPoints} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 진술 본문 ── */}
          <div
            className={`td-scroll min-h-0 flex-1 overflow-y-auto pb-4 pl-[2.6rem] pr-3 pt-3 sm:pl-[3.6rem] sm:pr-6 sm:pt-4 ${
              isNotebook ? 'td-ruled' : ''
            }`}
          >
            {log.length === 0 && !isTyping && (
              <p className="py-10 text-center font-record text-[0.8125rem] leading-loose text-ink-soft">
                {isNotebook ? (
                  <>
                    수첩이 비어 있습니다.
                    <br />
                    떠오른 것을 적어 두십시오 — 행동력은 쓰지 않습니다.
                  </>
                ) : (
                  <>
                    아직 기재된 진술이 없습니다.
                    <br />
                    아래 <span className="font-dossier font-bold text-ink-soft">문</span> 란에 질문을 적으십시오.
                    <br />
                    <span className="text-[0.75rem]">이 사람에게 {remaining}회 물을 수 있습니다.</span>
                  </>
                )}
              </p>
            )}

            {log.map((msg, idx) => {
              /* 안내문 — 조서 가운데 한 줄로 지나간다 */
              if (msg.role === 'system') {
                return (
                  <div key={idx} className="my-4 flex animate-fade-in items-center gap-3">
                    <span className="h-px flex-1 bg-ink/15" />
                    <span className="whitespace-pre-wrap text-center font-dossier text-[0.65625rem] font-bold uppercase tracking-[0.14em] text-stamp sm:text-[0.6875rem]">
                      {msg.text}
                    </span>
                    <span className="h-px flex-1 bg-ink/15" />
                  </div>
                );
              }

              /* 수사 메모 — 파란 볼펜, 번호를 붙여 적는다 */
              if (msg.role === 'note') {
                return (
                  <div key={idx} className="mb-4 flex animate-fade-in gap-2.5">
                    <span className="mt-[3px] shrink-0 font-type text-[0.625rem] text-pen/75">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <p className="flex-1 whitespace-pre-wrap font-record text-[0.875rem] leading-[1.95] text-pen">
                      {msg.text}
                    </p>
                  </div>
                );
              }

              /* 문 — 플레이어의 질문 (파란 볼펜) / 답 — 용의자의 진술 (검은 잉크) */
              const isQuestion = msg.role === 'user';
              return (
                <div
                  key={idx}
                  className={`grid animate-fade-in grid-cols-[1.4rem_1fr] gap-x-2 sm:grid-cols-[1.7rem_1fr] sm:gap-x-2.5 ${
                    isQuestion ? 'mt-4 first:mt-0' : 'mt-1.5 border-b border-dashed border-ink/15 pb-4'
                  }`}
                >
                  <span
                    className={`select-none pt-[2px] font-dossier text-[0.9375rem] font-bold leading-[1.9] sm:text-base ${
                      isQuestion ? 'text-pen/85' : 'text-stamp/85'
                    }`}
                    aria-hidden="true"
                  >
                    {isQuestion ? '문' : '답'}
                  </span>
                  <p
                    className={`whitespace-pre-wrap font-record text-[0.875rem] leading-[1.9] sm:text-[0.9375rem] ${
                      isQuestion ? 'text-pen' : 'text-ink'
                    }`}
                  >
                    <span className="sr-only">{isQuestion ? '질문: ' : `${currentSuspect?.name ?? ''} 답변: `}</span>
                    {msg.text}
                  </p>
                </div>
              );
            })}

            {/* 타자기가 답변을 찍는 중 */}
            {isTyping && (
              <div className="mt-1.5 grid grid-cols-[1.4rem_1fr] gap-x-2 sm:grid-cols-[1.7rem_1fr] sm:gap-x-2.5">
                <span aria-hidden="true" className="pt-[2px] font-dossier text-[0.9375rem] font-bold leading-[1.9] text-stamp/85 sm:text-base">
                  답
                </span>
                <p className="td-caret font-record text-[0.875rem] leading-[1.9] text-ink-faint sm:text-[0.9375rem]">
                  <span className="tracking-[0.2em]">진술을 받아 적는 중</span>
                </p>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </main>

          {/* 색인표 — 앞으로 당겨진 것만 종이색이 된다 */}
          <div className="flex shrink-0 gap-[3px] overflow-x-auto pt-1.5">
            <button
              onClick={() => setCurrentSuspectId(0)}
              className={`flex min-h-[2.75rem] min-w-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-t-[3px] px-2 pb-1 pt-1.5 transition-colors ${
                isNotebook
                  ? 'bg-paper text-ink shadow-[0_-2px_8px_rgba(0,0,0,0.35)]'
                  : 'bg-black/45 text-stone-500 hover:bg-black/30 hover:text-stone-300'
              }`}
            >
              <Notebook size={17} strokeWidth={1.6} />
              <span className="font-dossier text-[0.625rem] font-bold">수첩</span>
            </button>

            {caseData.suspects.map((s) => {
              const active = currentSuspectId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSuspectId(s.id)}
                  className={`flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-t-[3px] px-2 pb-1 pt-1.5 transition-colors sm:gap-2 ${
                    active
                      ? 'bg-paper text-ink shadow-[0_-2px_8px_rgba(0,0,0,0.35)]'
                      : 'bg-black/45 text-stone-500 hover:bg-black/30 hover:text-stone-300'
                  }`}
                >
                  <span
                    className={`relative h-7 w-7 shrink-0 overflow-hidden rounded-[1px] border sm:h-8 sm:w-8 ${
                      active ? 'border-ink/40' : 'border-white/10'
                    }`}
                  >
                    {s.portraitImage ? (
                      <Image
                        src={portraitSrc(s.portraitImage)}
                        unoptimized
                        alt=""
                        fill
                        className={`object-cover ${active ? 'saturate-[0.8] sepia-[0.1]' : 'opacity-55 grayscale'}`}
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-black/30">
                        <User size={15} />
                      </span>
                    )}
                  </span>
                  <span className="truncate font-dossier text-[0.6875rem] font-bold sm:text-xs">{s.name}</span>
                </button>
              );
            })}
          </div>

          {/* 증거 제시 칩 바 */}
          {!isNotebook && selectedEvidenceName && (
            <div className="flex items-center justify-between border-t border-dashed border-ink/20 bg-stamp/[0.06] px-3 py-1.5 font-record text-xs text-ink">
              <div className="flex items-center gap-1.5 truncate">
                <Package size={13} className="shrink-0 text-stamp" />
                <span className="font-dossier text-[0.6875rem] font-bold text-stamp">제시할 증거:</span>
                <span className="truncate font-bold text-ink">{selectedEvidenceName}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvidenceName?.(null)}
                className="ml-2 shrink-0 rounded p-0.5 text-ink-faint hover:text-stamp"
                title="증거 선택 취소"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/*
            기재란. 조서 아래에 이어 붙은 종이 띠라서 입력이 문서의 일부처럼 보인다.
            handleInputChange·handleKeyDown이 HTMLInputElement 기준이므로 input을 유지한다.
          */}
          <div className="td-paper flex shrink-0 items-center gap-2 rounded-b-[2px] px-2.5 py-2.5 pb-safe sm:gap-3 sm:px-4">
            <span
              aria-hidden="true"
              className={`shrink-0 font-dossier font-bold ${isNotebook ? 'text-[0.6875rem] tracking-widest text-pen/80' : 'text-base text-pen/85'}`}
            >
              {isNotebook ? '메모' : '문'}
            </span>

            {/* 증거 첨부 버튼 및 팝업 (수첩이 아닐 때만) */}
            {!isNotebook && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setEvidenceMenuOpen((prev) => !prev)}
                  disabled={inputDisabled}
                  className={`grid h-9 w-9 place-items-center rounded-[2px] border transition-colors ${
                    selectedEvidenceName
                      ? 'border-stamp bg-stamp/15 text-stamp font-bold'
                      : 'border-ink/25 text-ink-soft hover:border-ink/40 hover:text-ink disabled:opacity-40'
                  }`}
                  title="용의자에게 제시할 증거 첨부"
                  aria-label="증거 첨부"
                >
                  <Package size={16} />
                </button>
                {evidenceMenuOpen && (
                  <div className="td-paper absolute bottom-full left-0 z-40 mb-2 w-64 rounded-[2px] border border-ink/25 p-2.5 shadow-xl sm:w-72">
                    <div className="mb-2 flex items-center justify-between border-b border-ink/15 pb-1 font-dossier text-[0.6875rem] font-bold text-stamp">
                      <span>보유 증거 ({caseData.evidence_list.length}건)</span>
                      <button
                        type="button"
                        onClick={() => setEvidenceMenuOpen(false)}
                        className="text-ink-faint hover:text-ink"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="td-scroll max-h-48 space-y-1.5 overflow-y-auto">
                      {caseData.evidence_list.map((ev, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setSelectedEvidenceName?.(
                              selectedEvidenceName === ev.name ? null : ev.name
                            );
                            setEvidenceMenuOpen(false);
                          }}
                          className={`w-full rounded-[2px] p-2 text-left transition-colors ${
                            selectedEvidenceName === ev.name
                              ? 'border border-stamp/30 bg-stamp/15 text-stamp'
                              : 'border border-transparent text-ink hover:bg-ink/5'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-dossier text-[0.75rem] font-bold">
                            <span className="text-stamp">#{i + 1}</span>
                            <span className="truncate">{ev.name}</span>
                            {ev.isUnlocked && (
                              <span className="rounded bg-stamp px-1 py-0.2 text-[0.5625rem] font-bold text-paper">
                                NEW
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 line-clamp-1 font-record text-[0.6875rem] text-ink-soft">
                            {ev.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              aria-label={isNotebook ? '수사 메모' : `${currentSuspect?.name ?? '용의자'}에게 할 질문`}
              placeholder={
                !isNotebook && remaining <= 0
                  ? '이 사람에게 물을 수 있는 횟수를 다 썼습니다. 다른 용의자로 넘어가십시오.'
                  : !isNotebook && selectedEvidenceName
                  ? `[${selectedEvidenceName}] 제시 중... (질문 입력 또는 바로 전송)`
                  : inputPlaceholder
              }
              disabled={inputDisabled}
              className="min-w-0 flex-1 border-b border-ink/25 bg-transparent pb-1.5 font-record text-base text-pen caret-pen placeholder:text-ink-faint focus:border-pen/60 focus:outline-none disabled:border-ink/15 disabled:text-ink-faint disabled:placeholder:text-ink-soft"
            />
            <button
              onClick={handleSendMessage}
              aria-label={isNotebook ? '메모 적어두기' : '질문 기재'}
              disabled={sendDisabled}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-[2px] border-2 transition-all ${
                isNotebook
                  ? 'border-pen/45 bg-paper-2/60 text-pen hover:bg-paper-3/60'
                  : 'border-stamp/70 bg-paper-2/50 text-stamp hover:bg-stamp/10 active:scale-[0.96] disabled:border-ink/15 disabled:bg-transparent disabled:text-ink-faint disabled:active:scale-100'
              }`}
            >
              {isNotebook ? <PenLine size={17} /> : isTyping ? <Send size={17} /> : <Stamp size={18} />}
            </button>
          </div>
        </div>

        {/* 사건 서류철 — 데스크톱은 항상 펼쳐둔다 */}
        <aside className="hidden w-[19rem] shrink-0 lg:block xl:w-[21rem]">
          <div className="td-paper td-scroll h-full animate-[td-sheet-in_0.45s_0.1s_ease-out_both] overflow-y-auto rounded-[2px] px-5 py-5">
            <div className="mb-4 border-b-[3px] border-double border-ink/25 pb-2.5">
              <div className="font-dossier text-[0.5625rem] font-bold tracking-[0.3em] text-stamp">사 건 서 류</div>
              <div className="mt-0.5 font-type text-[0.6875rem] text-ink-faint">No.{recordNumber(caseData)}</div>
            </div>
            <CaseFileRail
              caseData={caseData}
              selectedEvidenceName={selectedEvidenceName}
              onPresentEvidence={
                !isNotebook
                  ? (name) => {
                      setSelectedEvidenceName?.(selectedEvidenceName === name ? null : name);
                      setFileOpen(false);
                    }
                  : undefined
              }
            />
          </div>
        </aside>
      </div>

      {/* ───────── 모바일 서류철 ───────── */}
      {fileOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden">
          <button
            aria-label="사건 서류 닫기"
            onClick={() => setFileOpen(false)}
            className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-[2px]"
          />
          <div className="td-paper relative max-h-[78dvh] animate-[td-sheet-in_0.32s_ease-out_both] overflow-hidden rounded-t-[4px]">
            <div className="flex items-center justify-between border-b-[3px] border-double border-ink/25 px-4 py-3">
              <div>
                <div className="font-dossier text-[0.5625rem] font-bold tracking-[0.3em] text-stamp">사 건 서 류</div>
                <div className="mt-0.5 font-type text-[0.6875rem] text-ink-faint">No.{recordNumber(caseData)}</div>
              </div>
              <button
                onClick={() => setFileOpen(false)}
                aria-label="닫기"
                className="grid h-11 w-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-ink/10"
              >
                <X size={19} />
              </button>
            </div>
            <div className="td-scroll max-h-[calc(78dvh-4.5rem)] overflow-y-auto px-4 py-4 pb-safe">
              <CaseFileRail
                caseData={caseData}
                selectedEvidenceName={selectedEvidenceName}
                onPresentEvidence={
                  !isNotebook
                    ? (name) => {
                        setSelectedEvidenceName?.(selectedEvidenceName === name ? null : name);
                        setFileOpen(false);
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* ───────── 증명사진 확대 ───────── */}
      {photoOpen && currentSuspect?.portraitImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <button
            aria-label="사진 닫기"
            onClick={() => setPhotoFor(null)}
            className="absolute inset-0 animate-fade-in cursor-zoom-out bg-black/80 backdrop-blur-sm"
          />
          {/* 인화지에 붙인 사진 — 사방에 여백을 둔다 */}
          <figure className="td-paper relative z-10 w-full max-w-[24rem] animate-[td-sheet-in_0.3s_ease-out_both] rounded-[2px] p-3 sm:max-w-[28rem] sm:p-4">
            {/*
              조서 안에서는 세로로 잘라 쓰지만 원본은 512x512다.
              확대에서는 aspect-square로 **자르지 않은 전체**를 보여준다.
            */}
            <div className="relative aspect-square w-full overflow-hidden border border-ink/25 bg-ink/10">
              <Image
                src={portraitSrc(currentSuspect.portraitImage)}
                unoptimized
                alt={`${currentSuspect.name} 증명사진 (확대)`}
                fill
                sizes="(min-width: 640px) 28rem, 90vw"
                className="object-cover contrast-[1.04] saturate-[0.78] sepia-[0.1]"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/15 mix-blend-overlay"
              />
            </div>

            <figcaption className="px-1 pb-1 pt-3 text-center">
              <div className="font-dossier text-[0.5625rem] font-bold tracking-[0.34em] text-stamp">
                심 문 조 서 · 인 물 사 진
              </div>
              <div className="mt-1 font-dossier text-xl font-bold leading-tight text-ink">
                {currentSuspect.name}
              </div>
              <div className="mt-1 font-record text-[0.8125rem] text-ink-soft">
                {[currentSuspect.role, currentSuspect.age ? `${currentSuspect.age}세` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </figcaption>

            <button
              onClick={() => setPhotoFor(null)}
              aria-label="닫기"
              className="td-stamp absolute -right-2 -top-2 grid h-11 w-11 place-items-center rounded-full bg-paper sm:-right-3 sm:-top-3"
            >
              <X size={17} />
            </button>
          </figure>
        </div>
      )}

      {/* ───────── 시간 초과 통보 ───────── */}
      {showTimeOverModal && (
        <div className="absolute inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/55 p-5 backdrop-blur-sm">
          <div className="td-paper w-full max-w-md overflow-hidden rounded-[2px]">
            <div className="flex items-center gap-2 border-b-4 border-stamp-2 bg-stamp px-4 py-3 text-paper">
              <AlertTriangle size={18} />
              <h2 className="font-dossier text-lg font-bold tracking-[0.14em]">긴급 타전</h2>
            </div>

            <div className="space-y-5 px-5 py-5 text-ink">
              <div>
                <h3 className="mb-2 font-dossier text-sm font-bold text-stamp">골든 타임 종료</h3>
                <p className="font-record text-[0.84375rem] leading-[1.9] text-ink-soft">
                  <span className="font-bold text-ink underline decoration-ink/40">제한 시간 20분</span>이 모두
                  경과했습니다. 현장에 경찰 병력이 도착하여 통제를 시작했습니다.
                </p>
              </div>

              <div className="border-l-[3px] border-stamp/50 bg-stamp/[0.06] px-3.5 py-3">
                <h3 className="mb-1.5 font-dossier text-[0.625rem] font-bold uppercase tracking-[0.2em] text-stamp">
                  본부 지침
                </h3>
                <p className="font-record text-[0.84375rem] leading-[1.9] text-ink">
                  수사는 계속할 수 있으나, 최종 평가 등급은{' '}
                  <span className="font-bold text-stamp underline decoration-stamp/50">최대 B등급</span>으로
                  제한됩니다.
                </p>
              </div>
            </div>

            <div className="border-t border-ink/15 bg-paper-2/70 p-4">
              <button
                onClick={closeTimeOverModal}
                className="td-stamp min-h-[3rem] w-full rounded-[2px] bg-paper/60 font-dossier text-sm font-bold tracking-[0.18em] transition-transform active:scale-[0.98]"
              >
                수신 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
