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
    evaluation,
    userInput,
    isTyping,
    loadingText,
    inputPlaceholder,
    deductionInput, setDeductionInput,
    isMuted, toggleMute,
    showTimeOverModal, closeTimeOverModal, triggerTimeOver,
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
    goToLoadMenu,
    handleLoadGame,
  } = useGameEngine();

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showAdminAuth, setShowAdminAuth] = useState(false);

  useSecretCommand({
    onTrigger: () => {
      if (phase === 'intro') {
        setShowAdminAuth(true);
        setErrorMsg(null);
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
        errorMsg={errorMsg} 
        setErrorMsg={setErrorMsg} 
        onRetry={retryAction} 
      />

      {/* Background Audio */}
      <audio ref={audioRef} src="/bgm/noir_theme.mp3" loop />

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
        />
      )}

      {phase === 'deduction' && caseData && (
        <DeductionScreen 
          caseData={caseData}
          deductionInput={deductionInput}
          setDeductionInput={setDeductionInput}
          onSubmit={submitDeduction}
          onBack={() => setPhase('investigation')}
        />
      )}

      {phase === 'resolution' && evaluation && (
        <ResolutionScreen 
          evaluation={evaluation}
          onReset={resetGame}
        />
      )}
    </>
  );
}
