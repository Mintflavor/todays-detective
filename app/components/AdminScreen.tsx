'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, Trash2, XCircle, ChevronDown, ChevronUp, User, Skull, Gavel, ArrowLeft, ArrowRight, MonitorPlay, X } from 'lucide-react';
import { getScenarios, deleteScenario, getScenarioDetail, ScenarioListItem } from '../lib/api';
import { CaseData, ChatLogs, Evaluation, DeductionInput } from '../types/game';
import ErrorModal from './ErrorModal';
import IntroScreen from './IntroScreen';
import LoadingScreen from './LoadingScreen';
import BriefingScreen from './BriefingScreen';
import InvestigationScreen from './InvestigationScreen';
import DeductionScreen from './DeductionScreen';
import ResolutionScreen from './ResolutionScreen';

interface AdminScreenProps {
  onExit: () => void;
}

type TestScreenType = 'NONE' | 'INTRO' | 'LOADING' | 'BRIEFING' | 'INVESTIGATION' | 'DEDUCTION' | 'RESOLUTION';

export default function AdminScreen({ onExit }: AdminScreenProps) {
  // Data State
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scenarioToDelete, setScenarioToDelete] = useState<{ id: string, title: string } | null>(null);
  
  // Filter & Pagination
  const [filterCrimeType, setFilterCrimeType] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;
  const [hasMore, setHasMore] = useState<boolean>(true);

  // Detail View
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<CaseData | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // UI Test State
  const [testScreen, setTestScreen] = useState<TestScreenType>('NONE');
  const [testCaseData, setTestCaseData] = useState<CaseData | null>(null);
  const [testLoading, setTestLoading] = useState<boolean>(false);

  // Mock States for Investigation Test
  const [mockCurrentSuspectId, setMockCurrentSuspectId] = useState<number>(0);
  const [mockChatLogs, setMockChatLogs] = useState<ChatLogs>({ 0: [], 1: [], 2: [], 3: [] });
  const [mockUserInput, setMockUserInput] = useState<string>("");
  const [mockIsTyping, setMockIsTyping] = useState<boolean>(false);

  // Mock States for Deduction Test
  const [mockDeductionInput, setMockDeductionInput] = useState<DeductionInput>({ culpritId: null, reasoning: "" });

  const fetchScenarios = async (pageNum: number) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const fetchedScenarios = await getScenarios(pageNum, ITEMS_PER_PAGE, filterCrimeType);
      setScenarios(fetchedScenarios);
      setHasMore(fetchedScenarios.length === ITEMS_PER_PAGE);
    } catch (error) {
      setErrorMsg("사건 목록을 불러오는데 실패했습니다: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1); // Reset page on filter change
    fetchScenarios(1);
  }, [filterCrimeType]);

  useEffect(() => {
    if (page > 1) fetchScenarios(page);
  }, [page]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetailData(null);
      return;
    }

    setExpandedId(id);
    setDetailLoading(true);
    setDetailData(null);

    try {
      const data = await getScenarioDetail(id);
      setDetailData(data);
    } catch (error) {
      setErrorMsg("상세 정보를 불러오는데 실패했습니다: " + (error as Error).message);
      setExpandedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleInitiateDelete = (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    setScenarioToDelete({ id, title });
  };

  const handleConfirmDelete = async () => {
    if (!scenarioToDelete) return;
    setErrorMsg(null);
    try {
      await deleteScenario(scenarioToDelete.id);
      fetchScenarios(page);
    } catch (error) {
      setErrorMsg("사건 기록 말소 실패: " + (error as Error).message);
    } finally {
      setScenarioToDelete(null);
      if (expandedId === scenarioToDelete.id) {
        setExpandedId(null);
        setDetailData(null);
      }
    }
  };

  const handleCancelDelete = () => {
    setScenarioToDelete(null);
  };

  const handlePrevPage = () => {
    if (page > 1) setPage(p => p - 1);
  };

  const handleNextPage = () => {
    if (hasMore) setPage(p => p + 1);
  };

  // UI Testing Logic
  const prepareTestData = async (screenName: TestScreenType) => {
    if (screenName === 'INTRO' || screenName === 'LOADING') {
      setTestScreen(screenName);
      return;
    }

    if (scenarios.length === 0) {
      setErrorMsg("테스트할 시나리오가 없습니다. 먼저 사건을 생성해주세요.");
      return;
    }

    setTestLoading(true);
    try {
      // Use the first available scenario for testing
      const targetId = scenarios[0]._id;
      const data = await getScenarioDetail(targetId);
      setTestCaseData(data);
      
      // Initialize mocks based on data
      const initialLogs: ChatLogs = { 0: [], 1: [], 2: [], 3: [] };
      
      const worldInfoMsg = { 
        role: 'system' as const, // Explicitly cast to 'system' | 'user' | 'ai' | 'note'
        text: `[현장 정보] ${data.world_setting.location}\n[날씨] ${data.world_setting.weather}` 
      };

      initialLogs[0] = [{ role: 'system', text: '수사 수첩입니다. 이곳에 자유롭게 메모를 남기세요. (AP 소모 없음)' }];
      
      data.suspects.forEach(s => {
          initialLogs[s.id] = [worldInfoMsg];
      });

      setMockChatLogs(initialLogs);
      setMockCurrentSuspectId(0);
      setMockDeductionInput({ culpritId: null, reasoning: "" });
      
      setTestScreen(screenName);
    } catch (error) {
      setErrorMsg("테스트 데이터를 불러오는데 실패했습니다.");
    } finally {
      setTestLoading(false);
    }
  };

  const renderTestScreen = () => {
    if (!testScreen || testScreen === 'NONE') return null;

    const exitButton = (
      <button 
        onClick={() => setTestScreen('NONE')}
        className="fixed top-4 right-4 z-[100] bg-red-600 text-white p-2 rounded-full shadow-xl hover:bg-red-700 transition-colors border-2 border-white"
        title="테스트 종료"
      >
        <X size={24} />
      </button>
    );

    // Add overlay for exit button context
    const withExit = (component: React.ReactNode) => (
      <div className="relative w-full h-full">
        {exitButton}
        {component}
      </div>
    );

    switch (testScreen) {
      case 'INTRO':
        return withExit(<IntroScreen onStart={() => alert("Start Clicked")} onLoadGame={() => alert("Load Clicked")} isMuted={false} toggleMute={() => {}} />);
      case 'LOADING':
        return withExit(<LoadingScreen loadingText="테스트 로딩 중..." />);
      case 'BRIEFING':
        return testCaseData ? withExit(<BriefingScreen caseData={testCaseData} onStartInvestigation={() => alert("Start Investigation")} />) : null;
      case 'INVESTIGATION':
        return testCaseData ? withExit(
          <InvestigationScreen 
            caseData={testCaseData}
            currentSuspectId={mockCurrentSuspectId}
            setCurrentSuspectId={setMockCurrentSuspectId}
            chatLogs={mockChatLogs}
            actionPoints={5}
            timerSeconds={600}
            isOverTime={false}
            showTimeOverModal={false}
            closeTimeOverModal={() => {}}
            userInput={mockUserInput}
            handleInputChange={(e) => setMockUserInput(e.target.value)}
            handleKeyDown={(e) => { if(e.key === 'Enter') { setMockUserInput(""); alert("Message Sent (Mock)"); }}}
            handleSendMessage={() => { setMockUserInput(""); alert("Message Sent (Mock)"); }}
            inputPlaceholder="질문을 입력하세요..."
            isTyping={mockIsTyping}
            isMuted={false}
            toggleMute={() => {}}
            onGoToBriefing={() => alert("Go to Briefing")}
            onGoToDeduction={() => alert("Go to Deduction")}
          />
        ) : null;
      case 'DEDUCTION':
        return testCaseData ? withExit(
          <DeductionScreen 
            caseData={testCaseData} 
            deductionInput={mockDeductionInput} 
            setDeductionInput={setMockDeductionInput} 
            onSubmit={() => alert("Submit Deduction")} 
            onBack={() => setTestScreen('NONE')} 
          />
        ) : null;
      case 'RESOLUTION':
        return testCaseData ? withExit(
          <ResolutionScreen 
            caseData={testCaseData} 
            evaluation={{
              isCorrect: true,
              grade: "S",
              report: "탐정은 놀라운 추리력으로 사건의 진상을 완벽하게 파악했습니다.",
              advice: "특별히 조언할 점이 없습니다.",
              culpritName: "테스트 범인",
              truth: "이것은 테스트용 진상입니다.",
              timeTaken: "05:00",
              culpritImage: testCaseData.suspects[0]?.portraitImage,
              caseNumber: "TEST-001"
            }} 
            onReset={() => setTestScreen('NONE')} 
          />
        ) : null;
      default:
        return null;
    }
  };

  if (testScreen !== 'NONE') {
    return (
      <div className="fixed inset-0 z-[200] bg-black overflow-y-auto">
        {testLoading ? (
          <div className="flex h-full items-center justify-center text-white">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
            테스트 데이터 로딩 중...
          </div>
        ) : renderTestScreen()}
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col items-center justify-center min-h-screen bg-black/95 p-4 md:p-6 relative"
      style={{ userSelect: 'text' }}
    >
      <div className="w-full max-w-4xl bg-[#1a1a1a] text-gray-300 rounded-sm shadow-2xl overflow-hidden relative border border-gray-800 animate-fade-in flex flex-col h-[85vh]">
        {/* Header */}
        <div className="bg-red-900/20 text-red-500 p-4 border-b border-red-900/50 flex flex-col gap-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen size={24} />
              <div>
                <h2 className="font-mono font-bold text-xl md:text-2xl tracking-widest uppercase text-gray-200">
                  제한 구역
                </h2>
                <p className="text-[10px] text-red-400/60 uppercase tracking-widest">Authorized Personnel Only</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <select 
                value={filterCrimeType} 
                onChange={(e) => setFilterCrimeType(e.target.value)}
                className="bg-black/50 text-red-400 border border-red-900/50 text-xs p-2 rounded-sm focus:outline-none focus:border-red-500"
              >
                <option value="ALL">전체 사건</option>
                <option value="살인">살인</option>
                <option value="방화">방화</option>
                <option value="납치">납치</option>
                <option value="강도">강도</option>
                <option value="절도">절도</option>
              </select>
               <span className="text-xs font-mono border-2 border-red-800 px-2 py-1 rounded text-red-600 font-bold bg-red-950/40 transform -rotate-6 opacity-80 hidden md:inline-block">
                TOP SECRET
              </span>
            </div>
          </div>

          {/* UI Test Bench Controls */}
          <div className="flex flex-wrap gap-2 items-center bg-black/40 p-2 rounded border border-red-900/30">
            <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mr-2">
              <MonitorPlay size={14} /> UI Test Bench:
            </span>
            {[
              { label: 'Intro', type: 'INTRO' },
              { label: 'Loading', type: 'LOADING' },
              { label: 'Briefing', type: 'BRIEFING' },
              { label: 'Investigation', type: 'INVESTIGATION' },
              { label: 'Deduction', type: 'DEDUCTION' },
              { label: 'Resolution', type: 'RESOLUTION' },
            ].map(btn => (
              <button
                key={btn.type}
                onClick={() => prepareTestData(btn.type as TestScreenType)}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] uppercase font-bold rounded-sm border border-gray-600 transition-colors"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#111]">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-red-900 border-t-red-500 rounded-full animate-spin"></div>
              <p className="text-center text-sm font-mono text-red-500/80 animate-pulse uppercase tracking-widest">
                보안 데이터베이스 접속 중...
              </p>
            </div>
          ) : scenarios.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2">
              <XCircle size={48} className="opacity-20" />
              <p className="text-lg">데이터가 존재하지 않습니다.</p>
              {filterCrimeType !== "ALL" && <p className="text-sm">필터 조건을 변경해보세요.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {scenarios.map((scenario) => (
                <div
                  key={scenario._id}
                  className={`bg-[#202020] rounded-sm border transition-all duration-300 overflow-hidden
                    ${expandedId === scenario._id ? 'border-red-900/50 bg-[#252525]' : 'border-gray-800 hover:border-gray-600'}
                  `}
                >
                  {/* List Item Header (Clickable) */}
                  <div 
                    onClick={() => handleExpand(scenario._id)}
                    className="p-4 flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex-grow min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider
                          ${scenario.crime_type === '살인' ? 'bg-red-950 text-red-400' : 'bg-gray-700 text-gray-300'}
                        `}>
                          {scenario.crime_type}
                        </span>
                        <h3 className="text-base font-bold text-gray-200 truncate group-hover:text-white transition-colors">
                          {scenario.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
                        <span>사건 번호: {scenario._id}</span>
                        <span>사건 발생일: {new Date(scenario.created_at).toLocaleString('ko-KR')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={(e) => handleInitiateDelete(e, scenario._id, scenario.title)}
                        className="p-2 text-red-800 hover:text-red-500 hover:bg-red-950/30 rounded transition-colors"
                        title="기록 말소"
                      >
                        <Trash2 size={16} />
                      </button>
                      {expandedId === scenario._id ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
                    </div>
                  </div>

                  {/* Expanded Detail View */}
                  {expandedId === scenario._id && (
                    <div className="border-t border-gray-800 bg-[#151515] p-4 animate-slide-down">
                      {detailLoading ? (
                        <div className="flex justify-center py-8">
                          <div className="w-6 h-6 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin"></div>
                        </div>
                      ) : detailData ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                          {/* Left Column: Summary & Victim */}
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                <BookOpen size={12} /> 사건 개요
                              </h4>
                              <p className="text-gray-300 leading-relaxed bg-[#202020] p-3 rounded-sm border border-gray-800">
                                {detailData.summary}
                              </p>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                <Skull size={12} /> 피해자 정보
                              </h4>
                              <div className="bg-[#202020] p-3 rounded-sm border border-gray-800 space-y-1">
                                <p><span className="text-gray-500">이름:</span> <span className="text-gray-200">{detailData.victim_info.name}</span></p>
                                <p><span className="text-gray-500">피해 내용:</span> <span className="text-gray-400">{detailData.victim_info.damage_details}</span></p>
                                <p><span className="text-gray-500">발견 당시:</span> <span className="text-gray-400">{detailData.victim_info.body_condition}</span></p>
                              </div>
                            </div>
                          </div>

                          {/* Right Column: Culprit & Suspects */}
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-xs font-bold text-red-700 uppercase mb-2 flex items-center gap-2">
                                <Gavel size={12} /> 진범
                              </h4>
                              <div className="bg-red-950/10 p-3 rounded-sm border border-red-900/30">
                                <p className="text-lg font-bold text-red-500">
                                  {detailData.suspects.find(s => s.isCulprit)?.name || "Unknown"}
                                </p>
                                <p className="text-xs text-red-800/70 mt-1">{detailData.solution}</p>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                <User size={12} /> 용의자 목록
                              </h4>
                              <div className="grid grid-cols-2 gap-2">
                                {detailData.suspects.map((suspect, idx) => (
                                  <div key={idx} className={`p-2 rounded-sm border ${suspect.isCulprit ? 'bg-red-900/10 border-red-900/30' : 'bg-[#202020] border-gray-800'}`}>
                                    <p className={`font-bold ${suspect.isCulprit ? 'text-red-400' : 'text-gray-300'}`}>{suspect.name}</p>
                                    <p className="text-xs text-gray-500">{suspect.role}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-center text-red-500">상세 정보를 불러올 수 없습니다.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: Pagination */}
        <div className="bg-[#151515] p-3 border-t border-gray-800 flex items-center justify-between shrink-0">
           <button
             onClick={onExit}
             className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-sm text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
           >
             <ArrowLeft size={14} /> 보안 구역 이탈
           </button>

           <div className="flex items-center gap-4">
             <button
               onClick={handlePrevPage}
               disabled={page === 1}
               className="p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
             >
               <ArrowLeft size={18} />
             </button>
             <span className="font-mono text-gray-500 text-sm">PAGE {page}</span>
             <button
               onClick={handleNextPage}
               disabled={!hasMore}
               className="p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
             >
               <ArrowRight size={18} />
             </button>
           </div>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {scenarioToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-[#1a1a1a] border-2 border-red-800 w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="bg-red-900/20 p-3 rounded-full animate-pulse">
                <Trash2 size={32} className="text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-red-500 font-mono tracking-wider uppercase">
                기록 말소 확인
              </h3>
              <p className="text-gray-400 text-sm font-mono leading-relaxed">
                정말로 다음 사건 기록을 영구적으로 말소하시겠습니까?
                <br />
                <span className="text-white font-bold block mt-2 text-lg">"{scenarioToDelete.title}"</span>
              </p>
              <div className="bg-red-950/30 border border-red-900/50 p-2 w-full">
                <p className="text-red-500 text-xs font-bold uppercase tracking-widest text-center">
                  주의! 기록 말소는 되돌릴 수 없습니다.
                </p>
              </div>
              
              <div className="flex gap-4 w-full mt-4">
                <button
                  onClick={handleCancelDelete}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-sm font-mono text-sm uppercase tracking-wider transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-900 hover:bg-red-800 text-white py-3 rounded-sm font-mono text-sm uppercase tracking-wider transition-colors shadow-lg shadow-red-900/20"
                >
                  기록 말소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ErrorModal
        errorMsg={errorMsg}
        setErrorMsg={setErrorMsg}
        onRetry={() => fetchScenarios(page)}
      />

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #111;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}