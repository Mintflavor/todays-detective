// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import { useState, useEffect, useRef, ChangeEvent, KeyboardEvent, useCallback } from 'react';
import { CaseData, ChatLogs, DeductionInput, Evaluation, Evidence, GameError, GamePhase, LoadingType, ChatMessage } from '../types/game';
import { getRandomPlaceholder, formatTime, shuffled } from '../lib/utils';
import { ApiError } from '../lib/http';

import useGameTimer from './useGameTimer';
import useGeminiClient from './useGeminiClient';
import usePhaseHistory from './usePhaseHistory';

/**
 * 심문 횟수는 **용의자 1명당** 이만큼이다 (공유 풀이 아니다).
 *
 * 예전에는 20을 셋이 나눠 썼다. 한 명에게 다 쓰면 나머지 둘은 아예 만나지
 * 못했고, 그건 플레이어의 선택이 아니라 규칙이 만든 데드엔드였다.
 * 이제 각자의 몫이 있으므로 "누구에게 쓸까"가 아니라 "무엇을 물을까"가 문제다.
 *
 * 총량은 3명 x 20 = 60회. 20분 안에 다 쓰는 것은 사실상 불가능하므로
 * 실질적인 제약은 시간이고, AP는 한 명을 붙잡고 늘어지는 것만 막는다.
 *
 * 이 값을 올리면 심문 레이트 리밋(`RATE_LIMIT_CHAT`)도 같이 봐야 한다.
 * 전역 시간당 한도라서, 한 판이 한도를 다 쓰면 다른 접속자가 429를 받는다.
 */
const AP_PER_SUSPECT = 20;

/** 20분. 프롬프트의 시간 관리 채점 기준(server/app/prompts.py)과 반드시 일치해야 한다. */
const TOTAL_SECONDS = 1200;

/** 용의자 id -> 남은 심문 횟수. 수사 수첩(id 0)은 들어가지 않는다 (AP를 쓰지 않는다). */
type ActionPoints = Record<number, number>;

/** 튜토리얼을 본 적이 있는지. 기록실로 처음 들어온 사람도 규칙을 봐야 한다 (§5). */
const TUTORIAL_SEEN_KEY = 'td_tutorial_seen';

function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false; // 프라이버시 모드 등. 못 읽으면 그냥 보여준다.
  }
}

function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    /* 저장 못 해도 게임은 진행돼야 한다 */
  }
}

export default function useGameEngine() {
  // --- Game Flow State ---
  const [phase, setPhase] = useState<GamePhase>('intro');

  // --- Game Data State ---
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [preloadedData, setPreloadedData] = useState<CaseData | null>(null);
  const [currentSuspectId, setCurrentSuspectId] = useState<number>(1); // 0 = Note(Self), 1~3 = Suspects
  const [chatLogs, setChatLogs] = useState<ChatLogs>({ 0: [], 1: [], 2: [], 3: [] });
  const [actionPoints, setActionPoints] = useState<ActionPoints>({});
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  // --- 증거 제시 및 해금 상태 ---
  const [selectedEvidenceName, setSelectedEvidenceName] = useState<string | null>(null);
  const [newlyUnlockedEvidence, setNewlyUnlockedEvidence] = useState<Evidence | null>(null);

  // --- UI & Audio State ---
  const [userInput, setUserInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>("현장 보존 중...");
  const [loadingType, setLoadingType] = useState<LoadingType>('case');
  const [inputPlaceholder, setInputPlaceholder] = useState<string>("");
  const [deductionInput, setDeductionInput] = useState<DeductionInput>({ culpritId: null, reasoning: "" });
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [showTimeOverModal, setShowTimeOverModal] = useState<boolean>(false);

  // 에러 상태는 **이 훅이 소유한다.** API 계층이 아니다.
  // 과거에는 useGeminiClient가 재시도 콜백까지 들고 있었는데, 등록된 콜백이
  // `generateCase` 자기 자신이라 재시도가 성공해도 결과를 받는 곳이 없었다.
  // 사건 생성 1회가 약 159원이므로 "돈만 나가고 화면은 그대로"였다.
  const [gameError, setGameError] = useState<GameError | null>(null);
  // 생성 실패 사실은 **모달과 별개로** 남겨야 한다.
  // gameError로 판단하면 사용자가 모달을 닫는 순간 실패한 사실이 사라지고,
  // 튜토리얼을 마쳤을 때 로딩 화면으로 들어가 갇힌다 (실제로 그렇게 갇혔다).
  const [caseFetchFailed, setCaseFetchFailed] = useState(false);
  // 뒤로가기로 수사를 버릴 때 확인을 받는다.
  const [quitPrompt, setQuitPrompt] = useState(false);

  // 진행 중인 생성을 무효화하는 세대 번호.
  // 취소하고 인트로로 나온 뒤에 생성이 완료되면 setPreloadedData가 실행되어
  // **낡은 사건이 되살아난다.** 그 상태에서 "새로운 의뢰"를 누르면 새 생성(159원)을
  // 또 걸면서 화면에는 옛 사건이 뜬다. 세대가 어긋난 결과는 버린다.
  const generationEpoch = useRef(0);

  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Hooks ---
  const { generateCase, interrogateSuspect, evaluateDeduction } = useGeminiClient();
  const { timerSeconds, isOverTime, resetTimer } = useGameTimer({
    initialSeconds: TOTAL_SECONDS,
    isActive: phase === 'investigation' && !isTyping,
    onTimeUp: () => setShowTimeOverModal(true)
  });

  const dismissError = useCallback(() => setGameError(null), []);

  const goToLoadMenu = useCallback(() => {
    setPhase('load_menu');
  }, []);

  // --- Effects ---

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.pause();
    } else {
      audio.volume = 0.2;
      if (audio.readyState === 0) audio.load();
      audio.play().catch(e => console.log("Audio play prevented:", e));
    }
  }, [isMuted]);

  useEffect(() => {
    setInputPlaceholder(getRandomPlaceholder());
  }, []);

  // Loading Text Cycle
  useEffect(() => {
    if (phase === 'loading') {
      let texts: string[] = [];
      if (loadingType === 'case') {
        texts = [
          "현장 보존선 설치 중...", "용의자 신원 조회 중...", "부검 리포트 요청 중...",
          "인근 CCTV 영상 확보 중...", "목격자 탐문 수사 중...", "지문 감식 결과 대기 중...",
          "과거 범죄 기록 열람 중...", "사건 현장 3D 스캔 중...", "통신 기록 조회 중...",
          "알리바이 1차 검증 중..."
        ];
      } else {
        texts = [
          "최종 추리 논리 검증 중...", "용의자 알리바이 재확인 중...", "범행 트릭 시뮬레이션 중...",
          "증거물과 진술 대조 중...", "범행 동기 타당성 분석 중...", "최종 수사 보고서 작성 중...",
          "검찰 송치 서류 준비 중...", "사건의 진상을 재구성하는 중...", "모순점 최종 확인 중..."
        ];
      }

      let i = 0;
      const interval = setInterval(() => {
        i = (i + 1) % texts.length;
        setLoadingText(texts[i]);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [phase, loadingType]);

  useEffect(() => {
    if (phase === 'investigation') {
      if (currentSuspectId === 0) {
        setInputPlaceholder("중요한 단서를 메모하거나 생각을 정리하세요...");
      } else {
        setInputPlaceholder(getRandomPlaceholder());
      }
    }
  }, [chatLogs, currentSuspectId, phase]);

  // --- Callbacks & Handlers ---

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const finalizeGameStart = useCallback((data: CaseData) => {
    // 두 경로(신규 생성·기록 재생) 모두 여기를 지난다. 셔플도 여기서 한다.
    // 과거에는 신규 생성 경로에만 셔플이 있어서, 기록 재생 시 범인 위치가
    // 항상 같았다 (실제 데이터의 범인이 전부 id 2였으므로 = 가운데). §14
    const prepared: CaseData = {
      ...data,
      suspects: shuffled(data.suspects),
      caseNumber: data.caseNumber ?? Math.floor(100000 + Math.random() * 900000).toString(),
    };

    setCaseData(prepared);
    setPreloadedData(null);
    setPhase('briefing');
    const initialMsg: ChatMessage = {
      role: 'system',
      text: `[현장 정보] ${prepared.world_setting.location}\n[날씨] ${prepared.world_setting.weather}`
    };
    // 용의자 id를 1~3으로 가정하지 않는다. case_data는 스키마를 걸지 않은
    // LLM 출력이라 id가 달라질 수 있고, 그러면 chatLogs[id]가 undefined가 되어
    // 렌더링에서 크래시한다.
    const logs: ChatLogs = { 0: [{ role: 'system', text: '수사 수첩입니다. 이곳에 자유롭게 메모를 남기세요. (AP 소모 없음)' }] };
    for (const s of prepared.suspects) {
      logs[s.id] = [initialMsg];
    }
    setChatLogs(logs);

    // chatLogs와 같은 이유로 id를 가정하지 않는다 — 실제 id마다 몫을 만든다.
    const ap: ActionPoints = {};
    for (const s of prepared.suspects) {
      ap[s.id] = AP_PER_SUSPECT;
    }
    setActionPoints(ap);

    setCurrentSuspectId(prepared.suspects[0]?.id ?? 1);
  }, []);

  /**
   * ApiError를 플레이어용 문구로 바꾼다.
   *
   * 429는 반드시 구분해야 한다. 예산 상한에 걸린 것과 통신이 끊긴 것은
   * 취할 행동이 정반대다 — 전자는 기록실로 가면 되고 재시도는 무의미하다.
   */
  const describeCaseError = useCallback((e: unknown, retry: () => void): GameError => {
    const archive = { label: '사건 기록실로 가기', action: goToLoadMenu };

    if (e instanceof ApiError && e.isRateLimited) {
      return {
        title: '의뢰 접수 마감',
        message: `${e.message}\n\n새 사건 생성은 횟수가 제한되어 있습니다. 사건 기록실에서 지난 사건을 플레이할 수 있습니다.`,
        secondary: archive,
      };
    }

    if (e instanceof ApiError && e.isAborted) {
      return {
        title: '응답 지연',
        message: `${e.message}\n\n서버에서 생성이 계속되고 있을 수 있습니다. 잠시 후 사건 기록실을 확인해 보세요.`,
        retry,
        secondary: archive,
      };
    }

    return {
      message: e instanceof ApiError ? e.message : '사건 파일을 불러오는데 실패했습니다.',
      retry,
      secondary: archive,
    };
  }, [goToLoadMenu]);

  // 재시도가 실제로 상태를 반영하도록, 생성 절차 전체를 하나의 ref에 담는다.
  const fetchCaseRef = useRef<() => void>(() => {});

  const fetchCase = useCallback(async () => {
    const epoch = ++generationEpoch.current;
    setGameError(null);
    setCaseFetchFailed(false);
    try {
      const data = await generateCase();
      if (epoch !== generationEpoch.current) return;  // 취소된 생성 — 결과를 버린다
      setPreloadedData(data);
    } catch (err) {
      if (epoch !== generationEpoch.current) return;
      setCaseFetchFailed(true);
      console.error("Case generation failed:", err);
      // 로딩 화면에 갇히지 않도록 반드시 흐름을 되돌린다.
      // 튜토리얼 중이면 그대로 두고(에러 모달이 위에 뜬다), 이미 로딩이면 인트로로.
      setPhase(prev => (prev === 'loading' ? 'intro' : prev));
      setGameError(describeCaseError(err, () => fetchCaseRef.current()));
    }
  }, [generateCase, describeCaseError]);

  useEffect(() => {
    fetchCaseRef.current = () => { void fetchCase(); };
  }, [fetchCase]);

  useEffect(() => {
    if (phase === 'loading' && preloadedData) {
      finalizeGameStart(preloadedData);
    }
  }, [phase, preloadedData, finalizeGameStart]);

  const handleStartGame = useCallback(() => {
    setPhase('tutorial');
    void fetchCase();
  }, [fetchCase]);

  const handleTutorialComplete = useCallback(() => {
    markTutorialSeen();
    if (preloadedData) {
      finalizeGameStart(preloadedData);
    } else if (caseFetchFailed) {
      // 생성이 이미 실패했다. 로딩 화면에 넣으면 갇힌다.
      // 사용자가 모달을 닫았을 수 있으니 왜 못 들어가는지 다시 알려준다.
      setPhase('intro');
      setGameError(prev => prev ?? {
        title: '사건 배정 불가',
        message: '사건 파일을 받지 못했습니다. 사건 기록실에서 지난 사건을 플레이할 수 있습니다.',
        retry: () => fetchCaseRef.current(),
        secondary: { label: '사건 기록실로 가기', action: goToLoadMenu },
      });
    } else {
      setLoadingType('case');
      setLoadingText("사건 파일을 불러오는 중...");
      setPhase('loading');
    }
  }, [preloadedData, caseFetchFailed, finalizeGameStart, goToLoadMenu]);

  /** API 호출만 담당한다. AP 차감과 낙관적 렌더링은 호출부에서 한 번만 한다. */
  const runInterrogationRef = useRef<(text: string, suspectId: number, history: string, presentedEvidenceName?: string) => void>(() => {});

  const runInterrogation = useCallback(async (text: string, suspectId: number, history: string, presentedEvidenceName?: string) => {
    if (!caseData?.scenarioId) return;
    setIsTyping(true);
    try {
      const unlockedNames = (caseData.evidence_list || []).map(e => e.name);
      const { reply, isContradiction, unlockedEvidence } = await interrogateSuspect(
        caseData.scenarioId,
        suspectId,
        history,
        text,
        presentedEvidenceName,
        unlockedNames
      );
      const isAlreadyAcquired = Boolean(
        unlockedEvidence &&
        caseData.evidence_list.some(e => e.name === unlockedEvidence.name)
      );
      const isNewEvidence = Boolean(unlockedEvidence && !isAlreadyAcquired);

      setChatLogs(prev => {
        const nextList: ChatMessage[] = [...(prev[suspectId] ?? []), { role: 'ai', text: reply }];
        if (isContradiction) {
          nextList.push({
            role: 'system',
            text: '※ 조서 특기사항: 용의자의 미세한 동요 포착 — 확인된 사실과의 불일치',
          });
        }
        if (isNewEvidence && unlockedEvidence) {
          nextList.push({
            role: 'system',
            text: `새로운 증거 확보: [${unlockedEvidence.name}] ${unlockedEvidence.description}`,
          });
        }
        return {
          ...prev,
          [suspectId]: nextList,
        };
      });
      if (isNewEvidence && unlockedEvidence) {
        setCaseData(prev => {
          if (!prev) return prev;
          const alreadyExists = prev.evidence_list.some(e => e.name === unlockedEvidence.name);
          if (alreadyExists) return prev;
          return {
            ...prev,
            evidence_list: [...prev.evidence_list, { ...unlockedEvidence, isUnlocked: true }],
          };
        });
        setNewlyUnlockedEvidence(unlockedEvidence);
        setTimeout(() => setNewlyUnlockedEvidence(null), 5000);
      }
    } catch (err) {
      console.error("Interrogation error:", err);
      const rateLimited = err instanceof ApiError && err.isRateLimited;
      setGameError({
        title: rateLimited ? '심문 횟수 초과' : 'Signal Lost',
        message: err instanceof ApiError ? err.message : '용의자와의 통신이 끊겼습니다.',
        // 같은 질문을 그대로 다시 보낸다. AP는 이미 차감됐으므로 재차감하지 않는다.
        retry: rateLimited ? undefined : () => runInterrogationRef.current(text, suspectId, history, presentedEvidenceName),
      });
    } finally {
      setIsTyping(false);
    }
  }, [caseData, interrogateSuspect]);

  useEffect(() => {
    runInterrogationRef.current = (text, suspectId, history, presentedEvidenceName) => {
      void runInterrogation(text, suspectId, history, presentedEvidenceName);
    };
  }, [runInterrogation]);

  const handleSendMessage = useCallback((customText?: string, customEvidence?: string) => {
    const evidenceToPresent = customEvidence !== undefined ? customEvidence : selectedEvidenceName;
    const rawText = (customText !== undefined ? customText : userInput).trim();

    // 수사 수첩(id 0)은 AP를 쓰지 않고 서버로도 가지 않는다.
    if (currentSuspectId === 0) {
      if (!rawText) return;
      setChatLogs(prev => ({
        ...prev,
        0: [...(prev[0] ?? []), { role: 'note', text: rawText }]
      }));
      setUserInput("");
      return;
    }

    const effectiveText = rawText || (evidenceToPresent ? `이 증거(${evidenceToPresent})에 대해 설명해 주십시오.` : "");
    if (!effectiveText || isTyping || !caseData || !caseData.scenarioId) return;

    // 현재 용의자의 몫만 본다. 다른 용의자가 소진됐어도 이쪽은 계속 물을 수 있다.
    if ((actionPoints[currentSuspectId] ?? 0) <= 0) return;
    const suspect = caseData.suspects.find(s => s.id === currentSuspectId);
    if (!suspect) return;

    const history = (chatLogs[currentSuspectId] ?? [])
      .filter(msg => msg.role === 'user' || msg.role === 'ai')
      .map(msg => (msg.role === 'user' ? `탐정: ${msg.text}` : `용의자: ${msg.text}`))
      .join('\n');

    const displayText = evidenceToPresent
      ? `[증거 제시: ${evidenceToPresent}] ${effectiveText}`
      : effectiveText;

    setChatLogs(prev => ({
      ...prev,
      [currentSuspectId]: [...(prev[currentSuspectId] ?? []), { role: 'user', text: displayText }]
    }));
    setUserInput("");
    setSelectedEvidenceName(null);
    setActionPoints(prev => ({
      ...prev,
      [currentSuspectId]: (prev[currentSuspectId] ?? 0) - 1,
    }));

    void runInterrogation(effectiveText, suspect.id, history, evidenceToPresent ?? undefined);
  }, [userInput, selectedEvidenceName, isTyping, caseData, currentSuspectId, actionPoints, chatLogs, runInterrogation]);

  const submitDeductionRef = useRef<() => void>(() => {});

  const submitDeduction = useCallback(async () => {
    if (!caseData || !deductionInput.culpritId || !caseData.scenarioId) return;
    const chosenSuspect = caseData.suspects.find(s => s.id === deductionInput.culpritId);
    if (!chosenSuspect) return;

    setLoadingType('deduction');
    setLoadingText("최종 추리 보고서 작성 중...");
    setPhase('loading');
    setGameError(null);

    try {
      const unlockedNames = (caseData.evidence_list || [])
        .filter(e => e.isUnlocked)
        .map(e => e.name);
      const evaluationResult = await evaluateDeduction(
        caseData.scenarioId,
        chosenSuspect.name,
        deductionInput.reasoning,
        isOverTime,
        unlockedNames
      );

      const elapsedSeconds = TOTAL_SECONDS - timerSeconds;
      const realCulprit = caseData.suspects.find(s => s.name === evaluationResult.culpritName);

      setEvaluation({
        ...evaluationResult,
        timeTaken: formatTime(elapsedSeconds),
        caseNumber: caseData.caseNumber,
        culpritImage: realCulprit?.portraitImage
      });
      setPhase('resolution');
    } catch (err) {
      console.error("Deduction evaluation error:", err);
      // **반드시 추리 화면으로 되돌린다.** 로딩에 남기면 작성한 서술까지 갇힌다.
      setPhase('deduction');
      const rateLimited = err instanceof ApiError && err.isRateLimited;
      setGameError({
        title: rateLimited ? '평가 요청 한도 초과' : 'Signal Lost',
        message: err instanceof ApiError ? err.message : '추리 평가 중 오류가 발생했습니다.',
        retry: rateLimited ? undefined : () => submitDeductionRef.current(),
      });
    }
  }, [caseData, deductionInput, isOverTime, timerSeconds, evaluateDeduction]);

  useEffect(() => {
    submitDeductionRef.current = () => { void submitDeduction(); };
  }, [submitDeduction]);

  /** 전체 초기화. 과거에는 window.location.reload()로 자산까지 다시 받았다. */
  const resetGame = useCallback(() => {
    generationEpoch.current += 1;   // 진행 중인 생성 결과를 무효화한다
    setQuitPrompt(false);
    setCaseData(null);
    setPreloadedData(null);
    setEvaluation(null);
    setChatLogs({ 0: [], 1: [], 2: [], 3: [] });
    setActionPoints({});
    setCurrentSuspectId(1);
    setDeductionInput({ culpritId: null, reasoning: "" });
    setUserInput("");
    setSelectedEvidenceName(null);
    setNewlyUnlockedEvidence(null);
    setShowTimeOverModal(false);
    setGameError(null);
    setCaseFetchFailed(false);
    resetTimer();
    setPhase('intro');
  }, [resetTimer]);

  /** 결과 화면에서 곧바로 기록실로. 새 사건 생성(159원·리밋)을 거치지 않는 경로다. */
  const goToArchiveFresh = useCallback(() => {
    resetGame();
    setPhase('load_menu');
  }, [resetGame]);

  const handleLoadGame = useCallback((data: CaseData) => {
    // 기록실이 무료·무제한 경로라서, 리밋에 걸린 사람이 여기로 흘러든다.
    // 처음 온 사람이라면 규칙을 모른 채 타이머가 돌아가므로 튜토리얼을 먼저 보여준다.
    if (hasSeenTutorial()) {
      finalizeGameStart(data);
    } else {
      setPreloadedData(data);
      setPhase('tutorial');
    }
  }, [finalizeGameStart]);

  usePhaseHistory({
    phase,
    goToPhase: setPhase,
    reset: resetGame,
    askQuit: () => setQuitPrompt(true),
  });

  const confirmQuit = useCallback(() => {
    setQuitPrompt(false);
    resetGame();
  }, [resetGame]);

  const cancelQuit = useCallback(() => setQuitPrompt(false), []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setUserInput(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSendMessage();
  }, [handleSendMessage]);

  const closeTimeOverModal = useCallback(() => {
    setShowTimeOverModal(false);
  }, []);

  return {
    // State
    phase, setPhase,
    caseData,
    currentSuspectId, setCurrentSuspectId,
    chatLogs,
    // 심문 화면은 용의자별 잔량이 필요하고(탭마다 표시),
    // 추리 화면은 전체 소진 정도만 보여준다. 두 형태를 모두 내보낸다.
    actionPoints,
    totalActionPoints: AP_PER_SUSPECT,
    apRemainingTotal: Object.values(actionPoints).reduce((a, b) => a + b, 0),
    apGrandTotal: Object.keys(actionPoints).length * AP_PER_SUSPECT,
    evaluation,
    userInput, setUserInput,
    isTyping,
    loadingText,
    loadingType, setLoadingType,
    inputPlaceholder,
    deductionInput, setDeductionInput,
    isMuted, toggleMute,
    showTimeOverModal, closeTimeOverModal, triggerTimeOver: () => setShowTimeOverModal(true),
    gameError, dismissError,
    quitPrompt, confirmQuit, cancelQuit,
    audioRef,
    timerSeconds, isOverTime,
    selectedEvidenceName, setSelectedEvidenceName,
    newlyUnlockedEvidence,

    // Actions
    handleStartGame,
    handleTutorialComplete,
    handleSendMessage,
    submitDeduction,
    resetGame,
    goToArchiveFresh,
    handleInputChange,
    handleKeyDown,
    finalizeGameStart,
    goToLoadMenu,
    handleLoadGame,
  };
}
