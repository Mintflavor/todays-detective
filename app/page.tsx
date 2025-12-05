'use client';

import React, { useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from 'react';
import { BookOpen, Search, User, Send, FileText, AlertCircle, RefreshCw, Clock, ShieldAlert, CheckCircle, X, Timer, AlertTriangle, Notebook, ChevronLeft, Skull, Microscope, Volume2, VolumeX, WifiOff } from 'lucide-react';

// --- [TYPES & INTERFACES] ---

interface Suspect {
  id: number;
  name: string;
  role: string;
  personality: string;
  secret: string;
  isCulprit: boolean;
  real_action?: string;
  alibi_claim?: string;
  motive?: string;
  trick?: string;
}

interface VictimInfo {
  name: string;
  cause_of_death: string;
  body_condition: string;
  estimated_time_of_death: string;
}

interface Evidence {
  name: string;
  description: string;
}

interface WorldSetting {
  location: string;
  weather: string;
}

interface CaseData {
  title: string;
  summary: string;
  world_setting: WorldSetting;
  timeline_truth: string[];
  victim_info: VictimInfo;
  evidence_list: Evidence[];
  suspects: Suspect[];
  solution: string;
}

interface ChatMessage {
  role: 'user' | 'ai' | 'system' | 'note';
  text: string;
}

interface ChatLogs {
  [key: number]: ChatMessage[];
}

interface DeductionInput {
  culpritId: number | null;
  reasoning: string;
}

interface Evaluation {
  isCorrect: boolean;
  report: string; // 타자기 보고서 본문
  advice: string; // 수사 보완점 (힌트)
  grade: string;
  truth: string;
  culpritName: string;
  timeTaken: string;
}

// --- [AI PROMPT LAYER] ---

const CASE_GENERATION_PROMPT = `
당신은 하드보일드 미스터리 소설의 거장입니다.
플레이어(탐정)가 해결해야 할 단편 추리 시나리오를 JSON 포맷으로 생성하세요.

[핵심 요구사항]
1. 사실의 일관성: 모든 용의자는 동일한 시공간에 존재했습니다. 공간 구조, 시간의 흐름, 시신의 상태는 절대적으로 일치해야 합니다.
2. 다양성: **살인, 강도, 절도, 방화, 납치 등 다양한 강력 범죄 중 하나를 랜덤하게 선택**하여 시나리오를 작성하세요. (단순 살인 사건만 반복하지 말 것)
3. 이름 표기: 모든 인물의 이름은 괄호나 영문 병기 없이 **순수 한글**로만 작성하세요. (예: '김철수', '제임스 박')

다음 JSON 스키마를 엄격히 준수하여 응답하세요 (Markdown 코드 블록 없이 순수 JSON만 출력):

{
  "title": "사건 제목 (예: 빗속의 방문자)",
  "summary": "탐정에게 전달될 사건 브리핑 (3문장 요약)",
  
  "world_setting": {
    "location": "사건 현장의 구체적 구조 (예: 2층 저택. 1층 거실/주방, 2층 서재/침실. 서재는 복도 끝)",
    "weather": "날씨와 분위기 (예: 폭우로 인한 고립, 천둥소리)"
  },

  "victim_info": {
    "name": "피해자 이름 (순수 한글)",
    "cause_of_death": "직접적인 사인 또는 피해 내용 (예: 둔기에 의한 두부 손상, 금고 털림)",
    "body_condition": "시신 또는 현장의 상태 묘사 (예: 안경이 깨져 있고 바닥을 향해 엎드려 있음)",
    "estimated_time_of_death": "사건 발생 추정 시각"
  },

  "evidence_list": [
    { "name": "증거물 이름 1", "description": "상세 묘사 (중요: 이름, 이니셜, 생년월일 등 범인을 바로 특정할 수 있는 직접적인 단서는 절대 포함하지 마세요. 간접적인 정황 증거여야 합니다.)" },
    { "name": "증거물 이름 2", "description": "상세 묘사" }
    // (증거물은 최대 3개까지만 생성하세요)
  ],

  "timeline_truth": [
    "19:00 - 사건 발생 2시간 전 상황",
    "20:00 - 사건 발생 직전 상황 (갈등 심화)",
    "20:30 - 사건 발생 추정 시각 및 특이사항 (예: 정전, 소음)",
    "21:00 - 사건 발각"
  ],

  "suspects": [
    {
      "id": 1,
      "name": "이름 (순수 한글)",
      "role": "직업 또는 관계",
      "personality": "성격 묘사",
      "secret": "숨기고 있는 비밀 (범인이 아니더라도 의심 살만한 행동)",
      "isCulprit": false,
      "real_action": "timeline_truth에 따른 실제 행적",
      "alibi_claim": "탐정에게 주장할 알리바이"
    },
    {
      "id": 2,
      "name": "이름 (순수 한글)",
      "role": "직업/관계",
      "personality": "...",
      "secret": "...",
      "isCulprit": true,
      "motive": "범행 동기",
      "trick": "world_setting과 evidence_list를 활용한 트릭",
      "real_action": "실제 범행 행동",
      "alibi_claim": "거짓 알리바이"
    },
    {
      "id": 3,
      "name": "이름 (순수 한글)",
      "role": "직업/관계",
      "personality": "...",
      "secret": "...",
      "isCulprit": false,
      "real_action": "...",
      "alibi_claim": "..."
    }
  ],
  "solution": "사건의 전말 (누가, 왜, 어떻게 범행을 저질렀는지 논리적 해설. 이 내용은 게임이 끝날 때까지 절대 변하면 안 됩니다.)"
}

언어: 한국어(Korean)
`;

const generateSuspectPrompt = (suspect: Suspect, world: WorldSetting, timeline: string[]) => `
당신은 추리 게임의 용의자 '${suspect.name}'(${suspect.role})입니다.
탐정(플레이어)이 당신을 심문하고 있습니다.

[절대적 사실 - 당신의 기억 속에 명확히 존재합니다]
이 설정은 절대 변하지 않으며, 당신은 이 세계관 안에서만 대답해야 합니다.
1. 장소 구조: ${world.location}
   - 경고: 위 묘사에 없는 방이나 구조를 절대 지어내지 마세요. 모르면 "모른다"고 답하세요.
2. 당시 상황: ${world.weather}
3. 공통 타임라인:
   ${timeline.join('\n')}
   (단, 당신이 직접 보지 못한 타인의 은밀한 행동은 모릅니다.)

[당신의 설정]
- 성격: ${suspect.personality}
- 비밀: ${suspect.secret} (들키지 않으려 노력하세요)
- 실제 행적: ${suspect.real_action}
- 주장하는 알리바이: ${suspect.alibi_claim}
- 범인 여부: ${suspect.isCulprit ? "당신은 진범입니다. 논리적으로 거짓말을 꾸며내세요." : "당신은 결백합니다. 사실대로 말하거나 억울해하세요."}

[대화 지침]
- 답변은 구어체로 자연스럽게, 2문장 이내로 짧게 하세요.
- 플레이어가 구체적인 물건/장소를 물어보면 [절대적 사실]에 근거해 답하세요.
- [절대적 사실]에 없는 내용은 상상해서 지어내지 말고 "기억이 안 난다", "모르겠다"고 회피하세요.
`;

// --- [HELPER FUNCTIONS] ---

const callGemini = async (prompt: string): Promise<string> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("Invalid response from AI");
  
  return data.candidates[0].content.parts[0].text;
};

const parseJSON = (text: string): CaseData | null => {
  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parse Error", e);
    return null;
  }
};

const getRandomPlaceholder = (): string => {
  const prompts = [
    "알리바이를 물어보세요...",
    "피해자와의 관계는 어땠나요?",
    "8시 정전 때 무엇을 하고 있었나요?",
    "현장에 있던 깨진 물건에 대해 아나요?",
    "왜 거짓말을 하는지 추궁해보세요...",
    "마지막으로 피해자를 본 게 언제인가요?"
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// --- [MAIN COMPONENT] ---

export default function TodaysDetective() {
  // Game Flow State
  const [phase, setPhase] = useState<'intro' | 'tutorial' | 'loading' | 'briefing' | 'investigation' | 'deduction' | 'resolution'>('intro');
  
  // Game Data State
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [preloadedData, setPreloadedData] = useState<CaseData | null>(null);
  const [currentSuspectId, setCurrentSuspectId] = useState<number>(1); // 0 = Note(Self), 1~3 = Suspects
  const [chatLogs, setChatLogs] = useState<ChatLogs>({ 0: [], 1: [], 2: [], 3: [] });
  const [actionPoints, setActionPoints] = useState<number>(20);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  
  // Timer State
  const [timerSeconds, setTimerSeconds] = useState<number>(600); 
  const [isOverTime, setIsOverTime] = useState<boolean>(false);
  const [showTimeOverModal, setShowTimeOverModal] = useState<boolean>(false);
  
  // UI & Audio State
  const [userInput, setUserInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>("현장 보존 중...");
  const [loadingType, setLoadingType] = useState<'case' | 'deduction'>('case');
  const [inputPlaceholder, setInputPlaceholder] = useState<string>("");
  const [deductionInput, setDeductionInput] = useState<DeductionInput>({ culpritId: null, reasoning: "" });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  
  // Error & Retry State
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Effects ---

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    setInputPlaceholder(getRandomPlaceholder());
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLogs, currentSuspectId, isTyping]);

  // Loading Text Cycle
  useEffect(() => {
    if (phase === 'loading') {
      let texts: string[] = [];
      if (loadingType === 'case') {
        texts = [
          "현장 보존선 설치 중...",
          "용의자 신원 조회 중...",
          "부검 리포트 요청 중...",
          "인근 CCTV 영상 확보 중...",
          "목격자 탐문 수사 중...",
          "지문 감식 결과 대기 중...",
          "과거 범죄 기록 열람 중...",
          "사건 현장 3D 스캔 중...",
          "통신 기록 조회 중...",
          "알리바이 1차 검증 중..."
        ];
      } else {
        texts = [
          "최종 추리 논리 검증 중...",
          "용의자 알리바이 재확인 중...",
          "범행 트릭 시뮬레이션 중...",
          "증거물과 진술 대조 중...",
          "범행 동기 타당성 분석 중...",
          "최종 수사 보고서 작성 중...",
          "검찰 송치 서류 준비 중...",
          "사건의 진상을 재구성하는 중...",
          "모순점 최종 확인 중..."
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

  // Timer Countdown Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    // Check isTyping to pause timer
    if (phase === 'investigation' && timerSeconds > 0 && !isTyping) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsOverTime(true);
            setShowTimeOverModal(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [phase, timerSeconds, isTyping]);

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
  }, [chatLogs, currentSuspectId]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // --- ERROR HANDLING WRAPPER ---
  const withErrorHandling = async (action: () => Promise<void>) => {
    try {
      setErrorMsg(null);
      await action();
    } catch (e) {
      console.error("Game Error:", e);
      setErrorMsg("본부와의 통신이 끊겼습니다.");
      setRetryAction(() => () => withErrorHandling(action)); 
    }
  };

  // --- ACTIONS ---

  const handleStartGame = () => {
    setPhase('tutorial');
    if (audioRef.current) {
      audioRef.current.volume = 0.3; 
      audioRef.current.play().catch(e => console.log("Audio autoplay prevented", e));
    }

    callGemini(CASE_GENERATION_PROMPT).then(resultText => {
      const data = parseJSON(resultText);
      if (data && data.suspects) {
        setPreloadedData(data); 
      }
    }).catch(err => {
      console.error("Background Fetch Error:", err);
    });
  };

  const finalizeGameStart = (data: CaseData) => {
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
  };

  const handleTutorialComplete = () => {
    if (preloadedData) {
      finalizeGameStart(preloadedData);
    } else {
      setLoadingType('case'); 
      setLoadingText("사건 파일을 불러오는 중..."); 
      setPhase('loading');
      
      if (!caseData) {
        withErrorHandling(async () => {
           const resultText = await callGemini(CASE_GENERATION_PROMPT);
           const data = parseJSON(resultText);
           if (data && data.suspects) {
             finalizeGameStart(data);
           } else {
             throw new Error("Invalid Data");
           }
        });
      }
    }
  };

  const handleSendMessage = () => withErrorHandling(async () => {
    if (!userInput.trim() || isTyping || !caseData) return;
    
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

    const systemPrompt = generateSuspectPrompt(suspect, caseData.world_setting, caseData.timeline_truth);
    const history = chatLogs[currentSuspectId].map(msg => 
      msg.role === 'user' ? `탐정: ${msg.text}` : `용의자: ${msg.text}`
    ).join('\n');
    const fullPrompt = `${systemPrompt}\n\n[이전 대화]\n${history}\n\n탐정: ${userMsg}\n용의자:`;
    
    const reply = await callGemini(fullPrompt);
    setIsTyping(false);
    setChatLogs(prev => ({
      ...prev,
      [currentSuspectId]: [...prev[currentSuspectId], { role: 'ai', text: reply }]
    }));
  });

  const submitDeduction = () => withErrorHandling(async () => {
    if (!caseData || !deductionInput.culpritId) return;

    setLoadingType('deduction'); 
    setLoadingText("최종 추리 보고서 작성 중..."); 
    setPhase('loading');
    
    const chosenSuspect = caseData.suspects.find(s => s.id === deductionInput.culpritId);
    if (!chosenSuspect) return;

    const culprit = caseData.suspects.find(s => s.isCulprit);
    if (!culprit) return; 

    const isCorrect = chosenSuspect.isCulprit;

    const penaltyInstruction = isOverTime 
      ? "\n[중요 페널티]: 플레이어가 제한시간(10분)을 초과했습니다. 추리가 완벽하더라도 '탐정 등급'은 최대 'B'까지만 부여할 수 있습니다." 
      : "";

    // [강화된 평가 프롬프트]
    const evalPrompt = `
      [절대 원칙: 사실 왜곡 금지]
      당신은 냉철한 판사입니다. 아래 제공된 [사건의 진상]을 유일한 정답으로 간주해야 합니다.
      AI가 생성한 것이라도, 기존에 설정된 사건의 진상과 다른 내용을 새로 창조해내지 마십시오.
      플레이어의 추리가 [사건의 진상]과 일치하는지만을 판단하세요.

      [사건의 진상 (Ground Truth)]
      ${caseData.solution}
      
      진범: ${culprit.name}

      [플레이어의 추리]
      지목한 범인: ${chosenSuspect.name}
      추리 내용: ${deductionInput.reasoning}

      ${penaltyInstruction}

      위 내용을 바탕으로 플레이어를 평가해주세요.
      다음 포맷을 엄격히 지켜주세요:

      [JUDGMENT]
      (성공 또는 실패)

      [GRADE]
      (S/A/B/C/F)

      [REPORT]
      (플레이어에게 보내는 타자기 스타일의 수사 보고서 본문. 경어체 사용. 3~4문장.)

      [ADVICE]
      (플레이어가 놓친 핵심 질문이나 단서 2가지. "아쉬운 점: ~를 물어봤어야 했다" 형식으로 구체적으로.)
    `;
    
    const evalResult = await callGemini(evalPrompt);
    
    const grade = evalResult.match(/\[GRADE\]\s*(.*)/)?.[1] || "F";
    const report = evalResult.match(/\[REPORT\]\s*([\s\S]*?)(?=\[ADVICE\]|$)/)?.[1]?.trim() || "보고서 생성 실패";
    const advice = evalResult.match(/\[ADVICE\]\s*([\s\S]*)/)?.[1]?.trim() || "조언을 불러올 수 없습니다.";

    const elapsedSeconds = 600 - timerSeconds;
    const timeTakenStr = formatTime(elapsedSeconds);

    setEvaluation({
      isCorrect,
      report,
      advice,
      grade,
      truth: caseData.solution,
      culpritName: chosenSuspect.name,
      timeTaken: timeTakenStr 
    });
    setPhase('resolution');
  });

  const resetGame = () => {
    window.location.reload();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setUserInput(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSendMessage();
  };

  const closeTimeOverModal = () => {
    setShowTimeOverModal(false);
  };

  // --- RENDERERS ---

  // 0. Error Modal (Global)
  const renderErrorModal = () => {
    if (!errorMsg) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 animate-fade-in">
        <div className="w-full max-w-sm bg-gray-800 border-2 border-red-600 rounded-sm p-6 text-center shadow-[0_0_20px_rgba(220,38,38,0.5)]">
          <WifiOff className="mx-auto text-red-500 mb-4 animate-pulse" size={48} />
          <h2 className="text-xl font-bold text-red-500 mb-2 uppercase tracking-widest">Signal Lost</h2>
          <p className="text-gray-300 mb-6 font-mono text-sm">{errorMsg}</p>
          <button 
            onClick={() => {
              setErrorMsg(null);
              if (retryAction) retryAction();
            }}
            className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 rounded-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw size={18} /> 재접속 시도 (Retry)
          </button>
        </div>
      </div>
    );
  };

  // 1. INTRO SCREEN
  if (phase === 'intro') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-100 p-6 relative overflow-hidden font-sans">
        {renderErrorModal()}
        {/* Background Audio */}
        <audio ref={audioRef} src="/bgm/noir_theme.mp3" loop />
        
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
            onClick={handleStartGame}
            className="w-full bg-amber-800 hover:bg-amber-700 text-amber-100 font-bold py-4 px-6 rounded-sm shadow-lg border border-amber-600 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-3 font-serif text-lg"
          >
            <FileText size={20} /> 사건 파일 열기
          </button>
        </div>
      </div>
    );
  }

  // 1.5 TUTORIAL MODAL
  if (phase === 'tutorial') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-6">
        {renderErrorModal()}
        <div className="w-full max-w-md bg-[#f0e6d2] text-gray-900 rounded-sm shadow-2xl overflow-hidden relative md:rotate-1 animate-fade-in">
          <div className="bg-amber-900 text-amber-100 p-4 border-b-4 border-amber-800 flex items-center gap-2">
            <BookOpen size={20} />
            <h2 className="font-serif font-bold text-xl tracking-wider">수사 수칙 (Manual)</h2>
          </div>

          <div className="p-6 space-y-6 font-serif">
            <div>
              <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-2">
                <ShieldAlert size={18} /> 목표 (Goal)
              </h3>
              <p className="text-sm leading-relaxed text-gray-800">
                단순히 범인을 찍는 것이 아닙니다. <br/>
                <span className="font-bold border-b border-black">누가(Who), 왜(Why), 어떻게(How)</span> <br/>
                세 가지를 모두 밝혀내야 최고의 등급을 받습니다.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-2">
                <Clock size={18} /> 자원 및 시간 (Resources)
              </h3>
              <p className="text-sm leading-relaxed text-gray-800">
                당신에게는 <span className="font-bold text-red-700">20번의 행동력(AP)</span>만 주어집니다.<br/>
                또한 <span className="font-bold text-red-700">10분 내</span>에 해결하지 못하면, <br/>
                아무리 완벽한 추리라도 <span className="underline">최대 B등급</span>만 받게 됩니다.
              </p>
            </div>

            <div className="bg-black/5 p-4 rounded border border-black/10">
              <h3 className="font-bold text-gray-700 text-xs uppercase tracking-widest mb-2">Interrogation Tip</h3>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2 text-red-700/70">
                  <X size={16} /> "너 범인이야?" (단순 부정만)
                </div>
                <div className="flex gap-2 text-green-800">
                  <CheckCircle size={16} /> "8시 정전 때 어디에 있었나?"
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-[#e6dbc5] border-t border-[#d6cbb5]">
            <button 
              onClick={handleTutorialComplete}
              className="w-full bg-red-800 hover:bg-red-700 text-white font-bold py-3 rounded-sm shadow-md flex items-center justify-center gap-2 transition-colors"
            >
              <CheckCircle size={18} /> 수칙 확인 완료
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. LOADING SCREEN
  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-gray-100 font-serif">
        {renderErrorModal()}
        <RefreshCw className="animate-spin text-amber-700 mb-6" size={48} />
        <p className="text-xl text-amber-500 animate-pulse tracking-widest">{loadingText}</p>
        <div className="mt-8 w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-800 animate-loading-bar w-full origin-left"></div>
        </div>
      </div>
    );
  }

  // 3. BRIEFING SCREEN
  if (phase === 'briefing' && caseData) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-900 p-4 font-serif overflow-y-auto">
        {renderErrorModal()}
        <div className="max-w-2xl mx-auto bg-[#eaddcf] rounded-sm shadow-2xl min-h-[90%] relative transform md:rotate-1 mt-4 mb-8">
          <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-multiply" 
               style={{backgroundImage: 'url("https://www.transparenttextures.com/patterns/aged-paper.png")'}}></div>
          
          <div className="p-8 relative z-10">
            <div className="flex justify-between items-start mb-8 border-b-2 border-gray-800 pb-4">
              <div>
                <span className="bg-red-800 text-white text-[10px] px-2 py-1 font-bold tracking-widest uppercase">Top Secret</span>
                <h2 className="text-2xl font-bold mt-2 text-gray-900 leading-tight">{caseData.title}</h2>
              </div>
              <div className="w-12 h-12 border-2 border-dashed border-gray-400 flex items-center justify-center opacity-40 rotate-12">
                <ShieldAlert size={24} />
              </div>
            </div>

            <div className="space-y-8">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <FileText size={14} /> Case Summary
                </h3>
                <p className="text-base leading-relaxed font-medium text-gray-800 border-l-4 border-amber-800/30 pl-4">
                  {caseData.summary}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <Skull size={14} /> Autopsy Report
                </h3>
                <div className="bg-black/5 p-4 rounded-sm border border-black/10 text-sm space-y-2">
                  <div className="flex justify-between border-b border-black/10 pb-1">
                    <span className="font-bold text-gray-700">Name:</span>
                    <span>{caseData.victim_info.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-black/10 pb-1">
                    <span className="font-bold text-gray-700">Time of Death:</span>
                    <span>{caseData.victim_info.estimated_time_of_death}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 block mb-1">Cause of Death:</span>
                    <span className="block pl-2 text-gray-800">{caseData.victim_info.cause_of_death}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 block mb-1">Body Condition:</span>
                    <span className="block pl-2 text-gray-800">{caseData.victim_info.body_condition}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <Microscope size={14} /> Initial Evidence
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
                  <User size={14} /> Suspect List
                </h3>
                <div className="grid gap-3">
                  {caseData.suspects.map(s => (
                    <div key={s.id} className="flex items-center gap-4 bg-black/5 p-4 rounded-sm border border-black/10 hover:bg-black/10 transition-colors">
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center shrink-0 border border-gray-400">
                        <User className="text-gray-600" size={20} />
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

            <div className="mt-12 sticky bottom-4">
               <button 
                onClick={() => setPhase('investigation')}
                className="w-full bg-gray-900 hover:bg-black text-[#eaddcf] font-bold py-4 px-6 rounded-sm shadow-xl transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2 border border-gray-700"
              >
                수사 시작 <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. INVESTIGATION SCREEN (MAIN)
  if (phase === 'investigation' && caseData) {
    const currentSuspect = caseData.suspects.find(s => s.id === currentSuspectId);

    return (
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
        {renderErrorModal()}
        {/* Time Over Modal Overlay */}
        {showTimeOverModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-fade-in">
             <div className="w-full max-w-md bg-[#dfd3c3] text-gray-900 rounded-sm shadow-2xl overflow-hidden border-4 border-double border-red-900">
                <div className="bg-red-900 text-red-100 p-3 flex items-center gap-2">
                  <AlertTriangle size={20} />
                  <h2 className="font-serif font-bold text-lg tracking-wider uppercase">URGENT TELEGRAM</h2>
                </div>
                <div className="p-6 font-mono text-sm leading-relaxed text-gray-800 space-y-4">
                  <p>
                    <span className="font-bold">TO:</span> DETECTIVE<br/>
                    <span className="font-bold">FROM:</span> HEADQUARTERS
                  </p>
                  <div className="border-t border-b border-gray-400 py-4 my-2 uppercase font-bold text-center tracking-widest text-red-800">
                    -- STOP -- <br/>
                    GOLDEN TIME EXPIRED. <br/>
                    -- STOP --
                  </div>
                  <p>
                    POLICE FORCE ARRIVED. INVESTIGATION CONTINUES BUT MAX GRADE CAPPED AT 'B'.
                  </p>
                </div>
                <div className="p-4 bg-[#cfc3b3]">
                  <button 
                    onClick={closeTimeOverModal}
                    className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-sm uppercase tracking-wider"
                  >
                    Acknowledge
                  </button>
                </div>
             </div>
          </div>
        )}

        {/* Top Bar */}
        <header className="bg-gray-900 p-3 border-b border-gray-800 shadow-md flex justify-between items-center z-20 shrink-0">
          <div className="flex flex-col">
            <h2 className="font-serif font-bold text-amber-600 text-base truncate max-w-[150px]">{caseData.title}</h2>
            <button onClick={() => setPhase('briefing')} className="text-[10px] text-gray-500 hover:text-gray-300 underline text-left">서류 다시보기</button>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Volume Control */}
            <button onClick={toggleMute} className="p-1.5 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors">
              {isMuted ? <VolumeX size={14} className="text-gray-400" /> : <Volume2 size={14} className="text-amber-500" />}
            </button>

            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-mono border ${isOverTime ? 'bg-red-900 text-red-200 border-red-700 animate-pulse' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
              <Timer size={12} />
              <span>{formatTime(timerSeconds)}</span>
            </div>

            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-mono transition-colors ${actionPoints <= 5 ? 'bg-red-900/50 text-red-400 border border-red-800 animate-pulse' : 'bg-gray-800 text-amber-500 border border-amber-900'}`}>
              <Clock size={12} /> 
              <span>{actionPoints}</span>
            </div>
            <button 
              onClick={() => setPhase('deduction')}
              className="bg-red-800 hover:bg-red-700 text-white text-[10px] px-3 py-2 rounded-sm font-bold tracking-wider transition-colors shadow-sm"
            >
              범인 지목
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#111827] flex flex-col items-center">
          <div className="w-full max-w-2xl flex flex-col space-y-4">
            {chatLogs[currentSuspectId].map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' || msg.role === 'note' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'} animate-fade-in`}>
                {msg.role === 'system' ? (
                  <div className="bg-gray-800/50 text-gray-400 text-xs px-4 py-1.5 rounded-full border border-gray-700/50 my-2 text-center max-w-[90%] whitespace-pre-wrap leading-relaxed">
                    {msg.text}
                  </div>
                ) : (
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg relative ${
                    msg.role === 'user' 
                      ? 'bg-amber-800 text-white rounded-tr-sm' 
                      : msg.role === 'note'
                        ? 'bg-gray-700 text-gray-300 rounded-tr-sm border border-gray-600 italic'
                        : 'bg-gray-800 text-gray-200 rounded-tl-sm border border-gray-700'
                  }`}>
                    {msg.role !== 'user' && msg.role !== 'note' && currentSuspect && <div className="text-[10px] text-gray-500 mb-1 font-bold opacity-75">{currentSuspect.name}</div>}
                    {msg.role === 'note' && <div className="text-[10px] text-gray-400 mb-1 font-bold opacity-75 flex items-center gap-1"><Notebook size={10} /> 수사 메모</div>}
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
               <div className="flex justify-start animate-pulse">
                 <div className="bg-gray-800 text-gray-500 rounded-2xl rounded-tl-sm px-4 py-3 text-xs border border-gray-700">
                  ...
                 </div>
               </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Bottom Area */}
        <div className="bg-gray-900 border-t border-gray-800 z-20 shrink-0 pb-safe">
          <div className="w-full max-w-2xl mx-auto">
            {/* Tabs */}
            <div className="flex divide-x divide-gray-800 border-b border-gray-800 overflow-x-auto">
              {/* Note Tab (ID 0) */}
              <button
                onClick={() => setCurrentSuspectId(0)}
                className={`flex-1 py-3 px-2 text-sm font-medium transition-all relative min-w-[60px] ${
                  currentSuspectId === 0 
                    ? 'bg-gray-800 text-gray-300' 
                    : 'bg-gray-900 text-gray-600 hover:bg-gray-800'
                }`}
              >
                <div className="flex flex-col items-center gap-1.5">
                  <Notebook size={20} className={currentSuspectId === 0 ? "text-gray-300" : ""} />
                  <span className="text-xs truncate max-w-full">나(Memo)</span>
                </div>
                {currentSuspectId === 0 && <div className="absolute top-0 left-0 w-full h-0.5 bg-gray-500"></div>}
              </button>

              {/* Suspect Tabs */}
              {caseData.suspects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setCurrentSuspectId(s.id)}
                  className={`flex-1 py-3 px-2 text-sm font-medium transition-all relative min-w-[80px] ${
                    currentSuspectId === s.id 
                      ? 'bg-gray-800 text-amber-500' 
                      : 'bg-gray-900 text-gray-500 hover:bg-gray-800'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <User size={20} className={currentSuspectId === s.id ? "fill-amber-500/20" : ""} />
                    <span className="text-xs truncate max-w-full">{s.name}</span>
                  </div>
                  {currentSuspectId === s.id && <div className="absolute top-0 left-0 w-full h-0.5 bg-amber-600"></div>}
                </button>
              ))}
            </div>

            {/* Input Area */}
            <div className="p-3 pb-6 flex gap-2 bg-gray-900">
              <input
                type="text"
                value={userInput}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={inputPlaceholder}
                disabled={currentSuspectId !== 0 && (actionPoints <= 0 || isTyping)}
                className="flex-1 bg-gray-950 border border-gray-700 rounded-md px-4 py-3 text-white focus:outline-none focus:border-amber-700 placeholder-gray-600 font-sans text-sm transition-all"
              />
              <button 
                onClick={handleSendMessage}
                disabled={currentSuspectId !== 0 && (actionPoints <= 0 || isTyping || !userInput.trim())}
                className={`p-3 rounded-md transition-colors shadow-lg ${
                  currentSuspectId === 0 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                    : 'bg-amber-800 hover:bg-amber-700 disabled:bg-gray-800 disabled:text-gray-600 text-amber-100'
                }`}
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 5. DEDUCTION
  if (phase === 'deduction' && caseData) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6 flex items-center justify-center font-serif overflow-y-auto">
        {renderErrorModal()}
        <div className="w-full max-w-lg bg-gray-800 rounded-sm p-6 shadow-2xl border border-gray-700 relative my-auto">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-900 via-red-600 to-red-900"></div>
          
          <div className="text-center mb-6">
            <AlertCircle className="mx-auto text-red-500 mb-4" size={40} />
            <h2 className="text-2xl font-bold text-white tracking-widest uppercase">
              Final Deduction
            </h2>
            <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-wide">Select the culprit & Reveal the truth</p>
          </div>
          
          <div className="mb-6 space-y-4">
            <label className="block text-gray-400 text-xs font-sans uppercase tracking-wider font-bold">The Culprit</label>
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
                  <div className="w-full aspect-square bg-gray-800 mb-2 rounded-full overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform">
                    <User size={24} />
                  </div>
                  <div className="font-bold text-xs truncate">{s.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 space-y-4">
            <label className="block text-gray-400 text-xs font-sans uppercase tracking-wider font-bold">Motive & Trick</label>
            <textarea
              value={deductionInput.reasoning}
              onChange={(e) => setDeductionInput(prev => ({ ...prev, reasoning: e.target.value }))}
              placeholder="범행 동기와 사용된 트릭을 상세히 서술하시오..."
              className="w-full h-32 bg-gray-900 border border-gray-700 rounded-sm p-3 text-white focus:border-red-600 focus:outline-none resize-none font-sans leading-relaxed text-xs placeholder-gray-600"
            />
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setPhase('investigation')}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-4 rounded-sm transition-colors text-xs flex items-center justify-center gap-1"
            >
              <ChevronLeft size={14} /> 수사 계속하기
            </button>
            <button 
              onClick={submitDeduction}
              disabled={!deductionInput.culpritId || !deductionInput.reasoning}
              className="flex-[2] bg-red-800 hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold py-4 rounded-sm shadow-xl text-sm tracking-widest transition-all"
            >
              제출 (SUBMIT)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6. RESOLUTION SCREEN
  if (phase === 'resolution' && evaluation && caseData) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-serif overflow-y-auto relative">
        {renderErrorModal()}
        {/* Background Texture (Dark Desk) */}
        <div className="absolute inset-0 opacity-40 pointer-events-none" 
             style={{backgroundImage: 'radial-gradient(#222 1px, transparent 1px)', backgroundSize: '30px 30px'}}></div>

        <div className="w-full max-w-4xl mx-auto space-y-8 animate-fade-in-up pb-10 mt-6 relative z-10">
          
          {/* Header */}
          <div className="text-center border-b border-gray-700 pb-6">
            <h2 className="text-2xl text-gray-200 font-bold tracking-widest uppercase">Investigation Report</h2>
            <p className="text-gray-500 text-[10px] mt-2 font-mono">CASE ID: {new Date().getTime().toString().slice(-6)}</p>
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-start">
            
            {/* Left: Polaroid Result */}
            <div className="w-full md:w-1/3 bg-white p-3 shadow-2xl transform -rotate-2 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-12 border-4 border-gray-400 rounded-t-full border-b-0 z-20"></div>
              
              {/* Image Area */}
              <div className="bg-gray-200 aspect-square mb-4 flex items-center justify-center relative overflow-hidden">
                <User size={80} className="text-gray-400" />
                
                {/* Stamp Overlay */}
                <div className={`absolute inset-0 flex items-center justify-center border-4 border-double m-2 opacity-80 mix-blend-multiply animate-stamp transform rotate-12
                  ${evaluation.isCorrect ? 'border-red-600 text-red-600' : 'border-gray-500 text-gray-500'}`}>
                  <span className="text-3xl font-black uppercase tracking-widest">
                    {evaluation.isCorrect ? 'ARRESTED' : 'ESCAPED'}
                  </span>
                </div>
              </div>
              
              {/* Caption */}
              <div className="text-center font-handwriting text-gray-800 text-xl font-bold pb-2 border-b border-gray-100">
                Suspect: {evaluation.culpritName}
              </div>
              <div className="flex justify-between px-2 pt-2 font-mono text-xs text-gray-500">
                <span>{new Date().toLocaleDateString()}</span>
                {/* Time Taken Display */}
                <span className="font-bold text-gray-700">Time: {evaluation.timeTaken}</span>
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
                  Detective Performance Eval.
                </h3>
                
                <div className="space-y-6 text-sm leading-relaxed">
                  <div>
                    <h4 className="font-bold text-gray-700 mb-1 border-l-4 border-gray-400 pl-2">SUMMARY</h4>
                    <p>{evaluation.report}</p>
                  </div>
                  
                  {/* Missed Clues / Hints Section */}
                  <div>
                    <h4 className="font-bold text-gray-700 mb-1 border-l-4 border-red-400 pl-2">MISSED CLUES & ADVICE</h4>
                    <p className="text-gray-700 italic bg-black/5 p-2 rounded">{evaluation.advice}</p>
                  </div>
                </div>
              </div>

              {/* Truth Reveal */}
              <div className="bg-black/40 border border-gray-700 p-6 rounded-sm backdrop-blur-sm">
                 <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                  <ShieldAlert size={14} /> The Whole Truth
                </h3>
                <p className="text-gray-300 leading-relaxed font-serif text-lg">
                  {evaluation.truth}
                </p>
              </div>

            </div>
          </div>

          <div className="flex justify-center pt-8 border-t border-gray-700">
             <button 
              onClick={resetGame}
              className="w-full md:w-auto bg-amber-800 hover:bg-amber-700 text-amber-100 py-4 px-12 rounded-sm font-bold shadow-lg border border-amber-600 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 text-lg"
            >
              <RefreshCw size={20} /> Close Case & Start New
            </button>
          </div>

        </div>
      </div>
    );
  }

  return null;
}