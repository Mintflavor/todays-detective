'use client';

import React, { useEffect } from 'react';
import useGameEngine from './hooks/useGameEngine';
import IntroScreen from './components/IntroScreen';
import TutorialModal from './components/TutorialModal';
import LoadingScreen from './components/LoadingScreen';
import BriefingScreen from './components/BriefingScreen';
import InvestigationScreen from './components/InvestigationScreen';
import DeductionScreen from './components/DeductionScreen';
import ResolutionScreen from './components/ResolutionScreen';
import ErrorModal from './components/ErrorModal';

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
  } = useGameEngine();

  return (
    <>
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
          isMuted={isMuted} 
          toggleMute={toggleMute} 
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
