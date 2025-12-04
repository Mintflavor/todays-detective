import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Search, User, Send, FileText, AlertCircle, RefreshCw, Clock, ShieldAlert, CheckCircle, X, Camera } from 'lucide-react';

// --- [AI PROMPT LAYER: FACT CONSISTENCY ENGINE] ---

const CASE_GENERATION_PROMPT = `
당신은 하드보일드 미스터리 소설의 거장입니다.
플레이어(탐정)가 해결해야 할 단편 추리 시나리오를 JSON 포맷으로 생성하세요.

[핵심 요구사항: 사실의 일관성]
모든 용의자는 동일한 시공간에 존재했습니다. 따라서 '공간 구조'와 '시간의 흐름'은 절대적으로 일치해야 합니다.

다음 JSON 스키마를 엄격히 준수하여 응답하세요 (Markdown 코드 블록 없이 순수 JSON만 출력):

{
  "title": "사건 제목 (예: 빗속의 방문자)",
  "summary": "탐정에게 전달될 사건 브리핑 (3문장 요약)",
  
  "world_setting": {
    "location": "사건 현장의 구체적 구조 (예: 2층 저택. 1층 거실/주방, 2층 서재/침실. 서재는 복도 끝)",
    "weather": "날씨와 분위기 (예: 폭우로 인한 고립, 천둥소리)",
    "key_items": ["현장에 남은 결정적 증거 1", "증거 2"]
  },

  "timeline_truth": [
    "19:00 - 사건 발생 2시간 전 상황",
    "20:00 - 사건 발생 직전 상황 (갈등 심화)",
    "20:30 - 사건 발생 추정 시각 및 특이사항 (예: 정전, 소음)",
    "21:00 - 시신 발견"
  ],

  "suspects": [
    {
      "id": 1,
      "name": "이름",
      "role": "직업 또는 관계",
      "personality": "성격 묘사",
      "secret": "숨기고 있는 비밀 (범인이 아니더라도 의심 살만한 행동)",
      "isCulprit": false,
      "real_action": "timeline_truth에 따른 실제 행적",
      "alibi_claim": "탐정에게 주장할 알리바이"
    },
    {
      "id": 2,
      "name": "이름",
      "role": "직업/관계",
      "personality": "...",
      "secret": "...",
      "isCulprit": true,
      "motive": "범행 동기",
      "trick": "world_setting을 활용한 트릭",
      "real_action": "실제 범행 행동",
      "alibi_claim": "거짓 알리바이"
    },
    {
      "id": 3,
      "name": "이름",
      "role": "직업/관계",
      "personality": "...",
      "secret": "...",
      "isCulprit": false,
      "real_action": "...",
      "alibi_claim": "..."
    }
  ],
  "solution": "사건의 전말 (누가, 왜, 어떻게 죽였는지 논리적 해설)"
}

언어: 한국어(Korean)
`;

const generateSuspectPrompt = (suspect, world, timeline) => `
당신은 추리 게임의 용의자 '${suspect.name}'(${suspect.role})입니다.
탐정(플레이어)이 당신을 심문하고 있습니다.

[절대적 사실 - 당신의 기억 속에 명확히 존재합니다]
1. 장소 구조: ${world.location}
   - 경고: 위 묘사에 없는 방이나 구조를 절대 지어내지 마세요.
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
- 플레이어가 구체적인 물건/장소를 물어보면 [절대적 사실]에 근거해 답하세요. 모르면 "모른다"고 하세요.
`;

// --- [HELPER FUNCTIONS] ---

const callGemini = async (prompt) => {
  try {
    // 변경됨: Google API가 아니라 우리 서버(/api/gemini)로 요청
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt }) // 구조를 단순화해서 보냄
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    
    // 서버에서 받은 데이터 구조에 따라 파싱
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("API Error:", error);
    return null;
  }
};

const parseJSON = (text) => {
  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parse Error", e);
    return null;
  }
};

const getRandomPlaceholder = () => {
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

// --- [COMPONENTS] ---

export default function TodaysDetective() {
  // Game Flow State
  const [phase, setPhase] = useState('intro'); // intro -> tutorial -> loading -> briefing -> investigation -> deduction -> resolution
  
  // Game Data State
  const [caseData, setCaseData] = useState(null);
  const [preloadedData, setPreloadedData] = useState(null); // 백그라운드 로딩용
  const [currentSuspectId, setCurrentSuspectId] = useState(1);
  const [chatLogs, setChatLogs] = useState({ 1: [], 2: [], 3: [] });
  const [actionPoints, setActionPoints] = useState(20);
  const [evaluation, setEvaluation] = useState(null);
  
  // UI State
  const [userInput, setUserInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [loadingText, setLoadingText] = useState("현장 보존 중...");
  const [inputPlaceholder, setInputPlaceholder] = useState(getRandomPlaceholder());
  const [deductionInput, setDeductionInput] = useState({ culpritId: null, reasoning: "" });
  
  const chatEndRef = useRef(null);

  // Scroll to bottom effect
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLogs, currentSuspectId, isTyping]);

  // Loading text cycle
  useEffect(() => {
    if (phase === 'loading') {
      const texts = ["현장 보존 중...", "용의자 신원 조회 중...", "부검 리포트 작성 중...", "CCTV 확보 중..."];
      let i = 0;
      const interval = setInterval(() => {
        i = (i + 1) % texts.length;
        setLoadingText(texts[i]);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [phase]);

  // Preloading Effect check
  useEffect(() => {
    // 로딩 화면에 있는데 이미 프리로딩된 데이터가 있다면 즉시 넘어감
    if (phase === 'loading' && preloadedData) {
      finalizeGameStart(preloadedData);
    }
  }, [phase, preloadedData]);

  // Placeholder rotation
  useEffect(() => {
    if (phase === 'investigation') {
      setInputPlaceholder(getRandomPlaceholder());
    }
  }, [chatLogs]);

  // --- ACTIONS ---

  // 게임 시작 시 튜토리얼을 띄우면서 동시에 백그라운드 데이터 패칭 시작
  const handleStartGame = () => {
    setPhase('tutorial');
    
    // Background Fetching
    callGemini(CASE_GENERATION_PROMPT).then(resultText => {
      if (!resultText) return;
      const data = parseJSON(resultText);
      if (data && data.suspects) {
        setPreloadedData(data); // 데이터를 상태에 저장해둠
      }
    }).catch(err => console.error("Background Fetch Error:", err));
  };

  const finalizeGameStart = (data) => {
    setCaseData(data);
    setPreloadedData(null); // [BUG FIX]: 사용한 프리로드 데이터 초기화 (나중에 로딩 화면 충돌 방지)
    setPhase('briefing');
    
    // Inject initial system message with world info
    const initialMsg = { 
      role: 'system', 
      text: `[현장 정보] ${data.world_setting.location}\n[날씨] ${data.world_setting.weather}` 
    };
    setChatLogs({
      1: [initialMsg],
      2: [initialMsg],
      3: [initialMsg]
    });
  };

  const handleTutorialComplete = async () => {
    if (preloadedData) {
      // 이미 로딩이 끝났으면 바로 시작
      finalizeGameStart(preloadedData);
    } else {
      // 아직 로딩 중이면 로딩 화면으로 이동 (useEffect가 감지해서 넘겨줌)
      setPhase('loading');
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || actionPoints <= 0 || isTyping) return;

    const suspect = caseData.suspects.find(s => s.id === currentSuspectId);
    const userMsg = userInput;
    
    // User Message
    setChatLogs(prev => ({
      ...prev,
      [currentSuspectId]: [...prev[currentSuspectId], { role: 'user', text: userMsg }]
    }));
    setUserInput("");
    setActionPoints(prev => prev - 1);
    setIsTyping(true);

    // AI Generation
    const systemPrompt = generateSuspectPrompt(suspect, caseData.world_setting, caseData.timeline_truth);
    const history = chatLogs[currentSuspectId].map(msg => 
      msg.role === 'user' ? `탐정: ${msg.text}` : `용의자: ${msg.text}`
    ).join('\n');
    
    const fullPrompt = `${systemPrompt}\n\n[이전 대화]\n${history}\n\n탐정: ${userMsg}\n용의자:`;
    const reply = await callGemini(fullPrompt);
    
    setIsTyping(false);
    setChatLogs(prev => ({
      ...prev,
      [currentSuspectId]: [...prev[currentSuspectId], { role: 'ai', text: reply || "(침묵)" }]
    }));
  };

  const submitDeduction = async () => {
    setPhase('loading');
    setLoadingText("최종 추리 보고서 작성 중...");
    
    const chosenSuspect = caseData.suspects.find(s => s.id === deductionInput.culpritId);
    const isCorrect = chosenSuspect.isCulprit;
    
    const evalPrompt = `
      [사건 진상]
      ${caseData.solution}
      진범: ${caseData.suspects.find(s => s.isCulprit).name}

      [플레이어의 추리]
      지목한 범인: ${chosenSuspect.name}
      추리 내용: ${deductionInput.reasoning}

      위 내용을 바탕으로 플레이어를 평가해주세요.
      1. 정답 여부 (O/X)
      2. 탐정 등급 (S, A, B, C, F)
      3. 피드백 (플레이어에게 보내는 짧은 편지 형식, 3문장 내외)
    `;
    
    const evalResult = await callGemini(evalPrompt);
    
    setEvaluation({
      isCorrect,
      feedback: evalResult,
      truth: caseData.solution,
      culpritName: chosenSuspect.name
    });
    setPhase('resolution');
  };

  const resetGame = () => {
    setPhase('intro');
    setCaseData(null);
    setPreloadedData(null);
    setActionPoints(20);
    setChatLogs({ 1: [], 2: [], 3: [] });
    setDeductionInput({ culpritId: null, reasoning: "" });
    setEvaluation(null);
  };

  // --- RENDERERS ---

  // 1. INTRO SCREEN
  if (phase === 'intro') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-100 p-6 relative overflow-hidden font-sans">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #444 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        
        <div className="max-w-md w-full text-center space-y-12 z-10 animate-fade-in">
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center border-4 border-amber-800/50 shadow-2xl shadow-black">
              <Search size={48} className="text-amber-700" />
            </div>
            <div>
              <h1 className="text-5xl font-serif font-bold text-gray-100 tracking-tighter drop-shadow-lg mb-2">
                오늘의 <span className="text-amber-700">탐정</span>
              </h1>
              <p className="text-gray-500 text-sm tracking-[0.3em] uppercase border-y border-gray-700 py-2">
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
        <div className="max-w-md w-full bg-[#f0e6d2] text-gray-900 rounded-sm shadow-2xl overflow-hidden relative rotate-1">
          {/* Header */}
          <div className="bg-amber-900 text-amber-100 p-4 border-b-4 border-amber-800 flex items-center gap-2">
            <BookOpen size={20} />
            <h2 className="font-serif font-bold text-xl tracking-wider">수사 수칙 (Manual)</h2>
          </div>

          {/* Content */}
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
                <Clock size={18} /> 자원 (Resources)
              </h3>
              <p className="text-sm leading-relaxed text-gray-800">
                당신에게는 <span className="font-bold text-red-700">20번의 행동력(AP)</span>만 주어집니다.
                무의미한 질문으로 기회를 날리지 마세요.
              </p>
            </div>

            <div className="bg-black/5 p-4 rounded border border-black/10">
              <h3 className="font-bold text-gray-700 text-xs uppercase tracking-widest mb-2">Interrogation Tip</h3>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2 text-red-700/70">
                  <X size={16} /> "너 범인이야?" (단순 부정만 돌아옵니다)
                </div>
                <div className="flex gap-2 text-green-800">
                  <CheckCircle size={16} /> "8시 정전 때 어디에 있었나?"
                </div>
                <div className="flex gap-2 text-green-800">
                  <CheckCircle size={16} /> "서재에 있던 유서에 대해 아는가?"
                </div>
              </div>
            </div>

          </div>

          {/* Footer Action */}
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
        <RefreshCw className="animate-spin text-amber-700 mb-6" size={48} />
        <p className="text-xl text-amber-500 animate-pulse tracking-widest">{loadingText}</p>
        <div className="mt-8 w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-800 animate-loading-bar w-full origin-left"></div>
        </div>
      </div>
    );
  }

  // 3. BRIEFING SCREEN
  if (phase === 'briefing') {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-900 p-4 font-serif overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto bg-[#eaddcf] rounded-sm shadow-2xl min-h-[85vh] relative transform rotate-1 mt-4 mb-8">
          {/* Paper Texture Overlay */}
          <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-multiply" 
               style={{backgroundImage: 'url("https://www.transparenttextures.com/patterns/aged-paper.png")'}}></div>
          
          <div className="p-8 relative z-10">
            {/* Header */}
            <div className="flex justify-between items-start mb-8 border-b-2 border-gray-800 pb-4">
              <div>
                <span className="bg-red-800 text-white text-[10px] px-2 py-1 font-bold tracking-widest uppercase">Top Secret</span>
                <h2 className="text-3xl font-bold mt-2 text-gray-900 leading-tight">{caseData.title}</h2>
              </div>
              <div className="w-16 h-16 border-2 border-dashed border-gray-400 flex items-center justify-center opacity-40 rotate-12">
                <ShieldAlert size={32} />
              </div>
            </div>

            {/* Content */}
            <div className="space-y-8">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <FileText size={14} /> Case Summary
                </h3>
                <p className="text-lg leading-relaxed font-medium text-gray-800 border-l-4 border-amber-800/30 pl-4">
                  {caseData.summary}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <User size={14} /> Suspect List
                </h3>
                <div className="grid gap-3">
                  {caseData.suspects.map(s => (
                    <div key={s.id} className="flex items-center gap-4 bg-black/5 p-4 rounded-sm border border-black/10 hover:bg-black/10 transition-colors">
                      <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center shrink-0 border border-gray-400">
                        <User className="text-gray-600" size={24} />
                      </div>
                      <div>
                        <div className="font-bold text-lg text-gray-900">{s.name}</div>
                        <div className="text-sm text-gray-600 italic">{s.role} | {s.personality}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Footer Button */}
            <div className="mt-12 sticky bottom-4">
               <button 
                onClick={() => setPhase('investigation')}
                className="w-full bg-gray-900 hover:bg-black text-[#eaddcf] font-bold py-4 px-6 rounded-sm shadow-xl transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2 border border-gray-700"
              >
                수사 시작 (AP: 20) <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. INVESTIGATION SCREEN (MAIN)
  if (phase === 'investigation') {
    const currentSuspect = caseData.suspects.find(s => s.id === currentSuspectId);

    return (
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
        {/* Top Bar */}
        <header className="bg-gray-900 p-3 border-b border-gray-800 shadow-md flex justify-between items-center z-20 shrink-0">
          <div className="flex flex-col">
            <h2 className="font-serif font-bold text-amber-600 text-lg truncate max-w-[200px]">{caseData.title}</h2>
            <button onClick={() => setPhase('briefing')} className="text-xs text-gray-500 hover:text-gray-300 underline text-left">서류 다시보기</button>
          </div>
          
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold font-mono transition-colors ${actionPoints <= 5 ? 'bg-red-900/50 text-red-400 border border-red-800 animate-pulse' : 'bg-gray-800 text-amber-500 border border-amber-900'}`}>
              <Clock size={14} /> 
              <span>{actionPoints}</span>
            </div>
            <button 
              onClick={() => setPhase('deduction')}
              className="bg-red-800 hover:bg-red-700 text-white text-xs px-3 py-2 rounded-sm font-bold tracking-wider transition-colors shadow-sm"
            >
              범인 지목
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#111827] scrollbar-hide">
          {chatLogs[currentSuspectId].map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'} animate-fade-in`}>
              {msg.role === 'system' ? (
                <div className="bg-gray-800/50 text-gray-400 text-xs px-4 py-1.5 rounded-full border border-gray-700/50 my-2 text-center max-w-[90%] whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>
              ) : (
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg relative ${
                  msg.role === 'user' 
                    ? 'bg-amber-800 text-white rounded-tr-sm' 
                    : 'bg-gray-800 text-gray-200 rounded-tl-sm border border-gray-700'
                }`}>
                  {msg.role !== 'user' && <div className="text-[10px] text-gray-500 mb-1 font-bold opacity-75">{currentSuspect.name}</div>}
                  {msg.text}
                </div>
              )}
            </div>
          ))}
          {isTyping && (
             <div className="flex justify-start animate-pulse">
               <div className="bg-gray-800 text-gray-500 rounded-2xl rounded-tl-sm px-4 py-3 text-xs border border-gray-700">
                입력 중...
               </div>
             </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Bottom Area */}
        <div className="bg-gray-900 border-t border-gray-800 z-20 shrink-0 pb-safe">
          {/* Suspect Tabs */}
          <div className="flex divide-x divide-gray-800 border-b border-gray-800 overflow-x-auto">
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
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={inputPlaceholder}
              disabled={actionPoints <= 0 || isTyping}
              className="flex-1 bg-gray-950 border border-gray-700 rounded-md px-4 py-3 text-white focus:outline-none focus:border-amber-700 placeholder-gray-600 font-sans text-sm transition-all"
            />
            <button 
              onClick={handleSendMessage}
              disabled={actionPoints <= 0 || isTyping || !userInput.trim()}
              className="bg-amber-800 hover:bg-amber-700 disabled:bg-gray-800 disabled:text-gray-600 text-amber-100 p-3 rounded-md transition-colors shadow-lg"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. DEDUCTION SCREEN
  if (phase === 'deduction') {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6 flex items-center justify-center font-serif overflow-y-auto">
        <div className="max-w-lg w-full bg-gray-800 rounded-sm p-8 shadow-2xl border border-gray-700 relative my-auto">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-900 via-red-600 to-red-900"></div>
          
          <div className="text-center mb-8">
            <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
            <h2 className="text-3xl font-bold text-white tracking-widest uppercase">
              Final Deduction
            </h2>
            <p className="text-gray-500 text-xs mt-2 uppercase tracking-wide">Select the culprit & Reveal the truth</p>
          </div>
          
          <div className="mb-8 space-y-4">
            <label className="block text-gray-400 text-xs font-sans uppercase tracking-wider font-bold">The Culprit</label>
            <div className="grid grid-cols-3 gap-3">
              {caseData.suspects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setDeductionInput(prev => ({ ...prev, culpritId: s.id }))}
                  className={`p-4 rounded-sm border-2 text-center transition-all group ${
                    deductionInput.culpritId === s.id
                      ? 'border-red-600 bg-red-900/20 text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.3)]'
                      : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-500'
                  }`}
                >
                  <div className="w-full aspect-square bg-gray-800 mb-2 rounded-full overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform">
                    <User size={32} />
                  </div>
                  <div className="font-bold text-sm">{s.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8 space-y-4">
            <label className="block text-gray-400 text-xs font-sans uppercase tracking-wider font-bold">Motive & Trick</label>
            <textarea
              value={deductionInput.reasoning}
              onChange={(e) => setDeductionInput(prev => ({ ...prev, reasoning: e.target.value }))}
              placeholder="범행 동기와 사용된 트릭을 상세히 서술하시오... (예: 빚 때문에 유산을 노렸고, 정전 시간을 이용해...)"
              className="w-full h-40 bg-gray-900 border border-gray-700 rounded-sm p-4 text-white focus:border-red-600 focus:outline-none resize-none font-sans leading-relaxed text-sm placeholder-gray-600"
            />
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setPhase('investigation')}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-4 rounded-sm transition-colors text-sm"
            >
              취소
            </button>
            <button 
              onClick={submitDeduction}
              disabled={!deductionInput.culpritId || !deductionInput.reasoning}
              className="flex-[2] bg-red-800 hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold py-4 rounded-sm shadow-xl text-lg tracking-widest transition-all"
            >
              제출 (SUBMIT)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6. RESOLUTION SCREEN (Redesigned)
  if (phase === 'resolution') {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-serif overflow-y-auto relative">
        {/* Background Texture (Dark Desk) */}
        <div className="absolute inset-0 opacity-40 pointer-events-none" 
             style={{backgroundImage: 'radial-gradient(#222 1px, transparent 1px)', backgroundSize: '30px 30px'}}></div>

        <div className="max-w-4xl mx-auto space-y-12 animate-fade-in-up pb-10 mt-6 relative z-10">
          
          {/* Header */}
          <div className="text-center border-b border-gray-700 pb-6">
            <h2 className="text-3xl text-gray-200 font-bold tracking-widest uppercase">Investigation Report</h2>
            <p className="text-gray-500 text-xs mt-2 font-mono">CASE ID: {new Date().getTime().toString().slice(-6)}</p>
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-start">
            
            {/* Left: Polaroid Result */}
            <div className="w-full md:w-1/3 bg-white p-3 shadow-2xl transform -rotate-2 relative">
              {/* Paper Clip */}
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
              <div className="text-center text-xs text-gray-500 pt-2 font-mono">
                Date: {new Date().toLocaleDateString()}
              </div>
            </div>

            {/* Right: Typewriter Report */}
            <div className="w-full md:w-2/3 space-y-6">
              
              {/* AI Feedback */}
              <div className="bg-[#f0e6d2] text-gray-900 p-6 shadow-xl rounded-sm relative">
                <div className="absolute top-0 right-0 p-2 opacity-20">
                  <FileText size={48} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-amber-900 mb-4 border-b border-amber-900/20 pb-2">
                  Detective Performance Eval.
                </h3>
                <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {evaluation.feedback}
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

          {/* Action Buttons */}
          <div className="flex justify-center pt-8 border-t border-gray-700">
             <button 
              onClick={resetGame}
              className="bg-amber-800 hover:bg-amber-700 text-amber-100 py-4 px-12 rounded-sm font-bold shadow-lg border border-amber-600 transition-all transform hover:-translate-y-1 flex items-center gap-3 text-lg"
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