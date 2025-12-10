import { useState, useEffect, useRef, ChangeEvent, KeyboardEvent, useCallback } from 'react';
import { CaseData, ChatLogs, DeductionInput, Evaluation, GamePhase, LoadingType, ChatMessage } from '../types/game';
import { getRandomPlaceholder, formatTime } from '../lib/utils';
import { saveScenario } from '../lib/api';
import useGameTimer from './useGameTimer';
import useGeminiClient from './useGeminiClient';
import { generateSuspectPrompt } from '../lib/prompts'; // Import directly for use in send message


export default function useGameEngine() {
  // --- Game Flow State ---
  const [phase, setPhase] = useState<GamePhase>('intro');
  
  // --- Game Data State ---
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [preloadedData, setPreloadedData] = useState<CaseData | null>(null);
  const [currentSuspectId, setCurrentSuspectId] = useState<number>(1); // 0 = Note(Self), 1~3 = Suspects
  const [chatLogs, setChatLogs] = useState<ChatLogs>({ 0: [], 1: [], 2: [], 3: [] });
  const [actionPoints, setActionPoints] = useState<number>(20);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  
  // --- UI & Audio State ---
  const [userInput, setUserInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>("현장 보존 중...");
  const [loadingType, setLoadingType] = useState<LoadingType>('case');
  const [inputPlaceholder, setInputPlaceholder] = useState<string>("");
  const [deductionInput, setDeductionInput] = useState<DeductionInput>({ culpritId: null, reasoning: "" });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showTimeOverModal, setShowTimeOverModal] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Hooks ---
  const { errorMsg, setErrorMsg, retryAction, setRetryAction, generateCase, interrogateSuspect, evaluateDeduction } = useGeminiClient();
  const { timerSeconds, isOverTime, resetTimer } = useGameTimer({
    initialSeconds: 600,
    isActive: phase === 'investigation' && !isTyping,
    onTimeUp: () => setShowTimeOverModal(true)
  });


  // --- Effects ---

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
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
    if (phase === 'loading' && preloadedData) {
      finalizeGameStart(preloadedData);
    }
  }, [phase, preloadedData]);

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
    setCaseData(data);
    setPreloadedData(null); 
    setPhase('briefing');
    const initialMsg: ChatMessage = { 
      role: 'system', 
      text: `[현장 정보] ${data.world_setting.location}\n[날씨] ${data.world_setting.weather}` 
    };
    setChatLogs({
      0: [{ role: 'system', text: '수사 수첩입니다. 이곳에 자유롭게 메모를 남기세요. (AP 소모 없음)' }],
      1: [initialMsg],
      2: [initialMsg],
      3: [initialMsg]
    });
  }, []);

  const handleStartGame = useCallback(() => {
    setPhase('tutorial');
    if (audioRef.current) {
      audioRef.current.volume = 0.3; 
      audioRef.current.play().catch(e => console.log("Audio autoplay prevented", e));
    }

    const fetchCase = async () => {
      try {
        const data = await generateCase();
        // Generate random Case ID
        data.caseNumber = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Shuffle suspects to prevent predictable culprit position
        data.suspects.sort(() => Math.random() - 0.5);
        
        setPreloadedData(data);
        // Automatically save generated scenario to backend - REMOVED: Already saved in generateCase (server-side)
        // saveScenario(data).catch(err => console.error("Failed to auto-save scenario:", err));
      } catch (err) {
        console.error("Background Fetch Error:", err);
      }
    };
    fetchCase();
  }, [generateCase]);

  const handleTutorialComplete = useCallback(() => {
    if (preloadedData) {
      finalizeGameStart(preloadedData);
    } else {
      setLoadingType('case'); 
      setLoadingText("사건 파일을 불러오는 중..."); 
      setPhase('loading');
    }
  }, [preloadedData, finalizeGameStart]);

  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isTyping || !caseData || !caseData.scenarioId) return;
    
    // Note tab logic
    if (currentSuspectId === 0) {
      setChatLogs(prev => ({
        ...prev,
        0: [...prev[0], { role: 'note', text: userInput }]
      }));
      setUserInput("");
      return; 
    }

    if (actionPoints <= 0) return;
    const suspect = caseData.suspects.find(s => s.id === currentSuspectId);
    if (!suspect) return;

    const userMsg = userInput;
    setChatLogs(prev => ({
      ...prev,
      [currentSuspectId]: [...prev[currentSuspectId], { role: 'user', text: userMsg }]
    }));
    setUserInput("");
    setActionPoints(prev => prev - 1);
    setIsTyping(true);

    try {
      const history = chatLogs[currentSuspectId].map(msg => 
        msg.role === 'user' ? `탐정: ${msg.text}` : `용의자: ${msg.text}`
      ).join('\n');
      
      const reply = await interrogateSuspect(
        caseData.scenarioId,
        suspect.id,
        history,
        userMsg
      );
      setChatLogs(prev => ({
        ...prev,
        [currentSuspectId]: [...prev[currentSuspectId], { role: 'ai', text: reply }]
      }));
    } catch (err) {
      console.error("Interrogation error:", err);
      setErrorMsg("용의자와의 통신이 끊겼습니다.");
      setRetryAction(() => handleSendMessageRef.current); 
    } finally {
      setIsTyping(false);
    }
  }, [userInput, isTyping, caseData, currentSuspectId, actionPoints, chatLogs, interrogateSuspect, setErrorMsg, setRetryAction]);

  // Create a ref to hold the latest handleSendMessage function
  const handleSendMessageRef = useRef(handleSendMessage);

  // Update the ref whenever handleSendMessage changes
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);


  const submitDeduction = useCallback(async () => {
    if (!caseData || !deductionInput.culpritId || !caseData.scenarioId) return;

    setLoadingType('deduction'); 
    setLoadingText("최종 추리 보고서 작성 중..."); 
    setPhase('loading');
    
    const chosenSuspect = caseData.suspects.find(s => s.id === deductionInput.culpritId);
    if (!chosenSuspect) return;

    try {
      const evaluationResult = await evaluateDeduction(
        caseData.scenarioId,
        chosenSuspect.name,
        deductionInput.reasoning,
        isOverTime
      );
      
      const elapsedSeconds = 600 - timerSeconds;
      const timeTakenStr = formatTime(elapsedSeconds);

      setEvaluation({
        ...evaluationResult,
        timeTaken: timeTakenStr,
        caseNumber: caseData.caseNumber 
      });
      setPhase('resolution');
    } catch (err) {
      console.error("Deduction evaluation error:", err);
      setErrorMsg("추리 평가 중 오류가 발생했습니다.");
      setRetryAction(() => submitDeduction);
    }
  }, [caseData, deductionInput, isOverTime, timerSeconds, evaluateDeduction, setErrorMsg, setRetryAction]);

  const resetGame = useCallback(() => {
    window.location.reload();
  }, []);

  const goToLoadMenu = useCallback(() => {
    setPhase('load_menu');
  }, []);

  const handleLoadGame = useCallback((data: CaseData) => {
    finalizeGameStart(data);
  }, [finalizeGameStart]);

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
    actionPoints,
    evaluation,
    userInput, setUserInput,
    isTyping,
    loadingText,
    loadingType, setLoadingType,
    inputPlaceholder,
    deductionInput, setDeductionInput,
    isMuted, toggleMute,
    showTimeOverModal, closeTimeOverModal,
    errorMsg, setErrorMsg,
    retryAction,
    audioRef,
    timerSeconds, isOverTime,

    // Actions
    handleStartGame,
    handleTutorialComplete,
    handleSendMessage,
    submitDeduction,
    resetGame,
    handleInputChange,
    handleKeyDown,
    finalizeGameStart, // Export for use in page.tsx for preloaded data handling
    goToLoadMenu,
    handleLoadGame,
  };
}
