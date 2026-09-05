// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

'use client';

import React, { useState } from 'react';
import useGameEngine from './hooks/useGameEngine';
import IntroScreen from './components/IntroScreen';
import LoadScenarioScreen from './components/LoadScenarioScreen';
import TutorialModal from './components/TutorialModal';
import LoadingScreen from './components/LoadingScreen';
import BriefingScreen from './components/BriefingScreen';
import InvestigationScreen from './components/InvestigationScreen';
import DeductionScreen from './components/DeductionScreen';
import ResolutionScreen from './components/ResolutionScreen';
import ErrorModal from './components/ErrorModal';
import ConfirmModal from './components/ConfirmModal';
import AdminScreen from './components/AdminScreen';
import AdminAuthModal from './components/AdminAuthModal';
import { useSecretCommand } from './hooks/useSecretCommand';

export default function TodaysDetective() {
  const {
    // State
    phase, setPhase,
    caseData,
    currentSuspectId, setCurrentSuspectId,
    chatLogs,
    actionPoints,
    totalActionPoints,
    apRemainingTotal,
    apGrandTotal,
    evaluation,
    userInput,
    isTyping,
    loadingText,
    inputPlaceholder,
    deductionInput, setDeductionInput,
    isMuted, toggleMute,
    showTimeOverModal, closeTimeOverModal,
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
    goToLoadMenu,
    handleLoadGame,
  } = useGameEngine();

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showAdminAuth, setShowAdminAuth] = useState(false);

  useSecretCommand({
    onTrigger: () => {
      if (phase === 'intro') {
        setShowAdminAuth(true);
        dismissError();
      }
    },
    enabled: phase === 'intro',
  });

  if (isAdminMode) {
    return <AdminScreen onExit={() => setIsAdminMode(false)} />;
  }

  return (
    <>
      {showAdminAuth && (
        <AdminAuthModal
          onSuccess={() => {
            setShowAdminAuth(false);
            setIsAdminMode(true);
          }}
          onCancel={() => setShowAdminAuth(false)}
        />
      )}

      {/* Common Error Modal */}
      <ErrorModal
        errorMsg={gameError?.message ?? null}
        setErrorMsg={dismissError}
        title={gameError?.title}
        onRetry={gameError?.retry}
        onSecondary={gameError?.secondary?.action}
        secondaryLabel={gameError?.secondary?.label}
      />

      {/* 뒤로가기로 진행 중인 수사를 버릴 때만 뜬다 */}
      <ConfirmModal
        open={quitPrompt}
        title="수사 중단"
        message="처음 화면으로 돌아가면 지금까지의 심문 기록과 남은 시간이 사라집니다. 사건 자체는 기록실에 남습니다."
        confirmLabel="중단하고 나가기"
        onConfirm={confirmQuit}
        onCancel={cancelQuit}
      />

      {/* Background Audio */}
      <audio ref={audioRef} src="/bgm/Cold_Coffee_at_Three_compressed.mp3" loop preload="auto" />

      {/* Screen Routing */}
      {phase === 'intro' && (
        <IntroScreen
          onStart={handleStartGame}
          onLoadGame={goToLoadMenu}
          isMuted={isMuted}
          toggleMute={toggleMute}
        />
      )}

      {phase === 'load_menu' && (
        <LoadScenarioScreen
          onLoad={handleLoadGame}
          onBack={() => setPhase('intro')}
        />
      )}

      {phase === 'tutorial' && (
        <TutorialModal
          onComplete={handleTutorialComplete}
        />
      )}

      {phase === 'loading' && (
        <LoadingScreen
          loadingText={loadingText}
          onCancel={resetGame}
        />
      )}

      {phase === 'briefing' && caseData && (
        <BriefingScreen
          caseData={caseData}
          onStartInvestigation={() => setPhase('investigation')}
        />
      )}

      {phase === 'investigation' && caseData && (
        <InvestigationScreen
          caseData={caseData}
          currentSuspectId={currentSuspectId}
          setCurrentSuspectId={setCurrentSuspectId}
          chatLogs={chatLogs}
          actionPoints={actionPoints}
          totalActionPoints={totalActionPoints}
          timerSeconds={timerSeconds}
          isOverTime={isOverTime}
          showTimeOverModal={showTimeOverModal}
          closeTimeOverModal={closeTimeOverModal}
          userInput={userInput}
          handleInputChange={handleInputChange}
          handleKeyDown={handleKeyDown}
          handleSendMessage={handleSendMessage}
          inputPlaceholder={inputPlaceholder}
          isTyping={isTyping}
          isMuted={isMuted}
          toggleMute={toggleMute}
          onGoToBriefing={() => setPhase('briefing')}
          onGoToDeduction={() => setPhase('deduction')}
          selectedEvidenceName={selectedEvidenceName}
          setSelectedEvidenceName={setSelectedEvidenceName}
          newlyUnlockedEvidence={newlyUnlockedEvidence}
        />
      )}

      {phase === 'deduction' && caseData && (
        <DeductionScreen
          caseData={caseData}
          deductionInput={deductionInput}
          setDeductionInput={setDeductionInput}
          onSubmit={submitDeduction}
          onBack={() => setPhase('investigation')}
          timerSeconds={timerSeconds}
          isOverTime={isOverTime}
          /* 추리 화면은 용의자별 잔량이 아니라 전체 소진 정도를 보여준다 */
          actionPoints={apRemainingTotal}
          totalActionPoints={apGrandTotal}
        />
      )}

      {phase === 'resolution' && evaluation && caseData && (
        <ResolutionScreen
          evaluation={evaluation}
          caseData={caseData}
          deductionInput={deductionInput}
          onReset={resetGame}
          onGoToArchive={goToArchiveFresh}
        />
      )}
    </>
  );
}
