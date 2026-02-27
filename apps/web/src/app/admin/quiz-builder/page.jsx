"use client";

import { useState, useEffect } from "react";
import { useQuizBuilder } from "@/hooks/useQuizBuilder";
import AdminLayout from "@/components/AdminLayout";
import { QuizBuilderHeader } from "@/components/QuizBuilder/QuizBuilderHeader";
import { PhaseTabs } from "@/components/QuizBuilder/PhaseTabs";
import { PhaseEditor } from "@/components/QuizBuilder/PhaseEditor";
import { QuestionBankModal } from "@/components/QuizBuilder/QuestionBankModal";
import { QuestionEditorModal } from "@/components/QuizBuilder/QuestionEditorModal";
import { PhaseConfigModal } from "@/components/QuizBuilder/PhaseConfigModal";
import { LifetimeRulesModal } from "@/components/QuizBuilder/LifetimeRulesModal";
import { GlobalEscalateModal } from "@/components/QuizBuilder/GlobalEscalateModal";

export default function QuizBuilderPage() {
  const {
    versions,
    currentVersion,
    setCurrentVersion,
    audienceGender,
    setAudienceGender,
    phases,
    questionBank,
    lifetimeRules,
    loading,
    error,
    loadVersionData,
    loadQuestionBank,
    createNewVersion,
    publishVersion,
    exportJSON,
    importJSON,
    cloneCurrentVersionToAudience,
    deleteVersion,
  } = useQuizBuilder();

  const [activePhase, setActivePhase] = useState(null);

  // When version changes, reset activePhase so it will re-auto-select
  useEffect(() => {
    setActivePhase(null);
  }, [currentVersion]);

  // When phases load, auto-set activePhase to first phase
  useEffect(() => {
    if (phases && phases.length > 0 && !activePhase) {
      setActivePhase(phases[0].phase_name);
    }
  }, [phases, activePhase]);

  // Modals
  const [showQuestionBankModal, setShowQuestionBankModal] = useState(false);
  const [showQuestionEditorModal, setShowQuestionEditorModal] = useState(false);
  const [showPhaseConfigModal, setShowPhaseConfigModal] = useState(false);
  const [showLifetimeRuleModal, setShowLifetimeRuleModal] = useState(false);
  const [showGlobalEscalateModal, setShowGlobalEscalateModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);

  // NEW: when we create a brand new question from the "Add Question" flow,
  // auto-add it to the currently active phase.
  const [afterCreateAddToPhase, setAfterCreateAddToPhase] = useState(null);

  if (loading) {
    return (
      <AdminLayout currentPage="quiz-builder">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Quiz Builder</h1>
            <div className="flex items-center gap-3">
              <div className="h-10 w-48 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse"></div>
            </div>
          </div>
        </div>
        <div className="p-8 text-center text-gray-500">
          Loading quiz builder...
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout currentPage="quiz-builder">
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
            <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
            <p className="text-gray-700 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="quiz-builder">
      <div className="bg-gray-50 min-h-screen">
        <QuizBuilderHeader
          versions={versions}
          currentVersion={currentVersion}
          onVersionChange={setCurrentVersion}
          audienceGender={audienceGender}
          onAudienceGenderChange={setAudienceGender}
          onCreateNewVersion={createNewVersion}
          onPublishVersion={publishVersion}
          onExportJSON={exportJSON}
          onImportJSON={importJSON}
          onCloneVersion={cloneCurrentVersionToAudience}
          onDeleteVersion={deleteVersion}
          isLoading={loading}
        />

        {!currentVersion ? (
          <div className="p-8 text-center text-gray-500">
            Select or create a version to start editing
          </div>
        ) : (
          <div className="p-6">
            <div className="bg-white rounded-lg shadow mb-6">
              <PhaseTabs
                activePhase={activePhase}
                onPhaseChange={setActivePhase}
                lifetimeRulesCount={lifetimeRules.length}
                onShowLifetimeRules={() => setShowLifetimeRuleModal(true)}
                onShowGlobalEscalate={() => setShowGlobalEscalateModal(true)}
              />

              <PhaseEditor
                phase={phases.find((p) => p.phase_name === activePhase)}
                questionBank={questionBank}
                versionId={currentVersion.id}
                onUpdate={loadVersionData}
                onEditQuestion={(q) => {
                  setAfterCreateAddToPhase(null);
                  setEditingQuestion(q);
                  setShowQuestionEditorModal(true);
                }}
                onShowQuestionBank={() => setShowQuestionBankModal(true)}
                onEditPhaseConfig={() => setShowPhaseConfigModal(true)}
              />
            </div>
          </div>
        )}

        {/* Modals */}
        {showQuestionBankModal && (
          <QuestionBankModal
            questionBank={questionBank}
            phase={activePhase}
            versionId={currentVersion.id}
            onClose={() => setShowQuestionBankModal(false)}
            onAdd={loadVersionData}
            onEdit={(q) => {
              setAfterCreateAddToPhase(null);
              setEditingQuestion(q);
              setShowQuestionBankModal(false);
              setShowQuestionEditorModal(true);
            }}
            onCreate={() => {
              setAfterCreateAddToPhase({
                versionId: currentVersion.id,
                phase: activePhase,
              });
              setEditingQuestion(null);
              setShowQuestionBankModal(false);
              setShowQuestionEditorModal(true);
            }}
          />
        )}

        {showQuestionEditorModal && (
          <QuestionEditorModal
            question={editingQuestion}
            afterCreateAddToPhase={afterCreateAddToPhase}
            audienceGender={audienceGender}
            onClose={() => {
              setShowQuestionEditorModal(false);
              setEditingQuestion(null);
              setAfterCreateAddToPhase(null);
            }}
            onSave={() => {
              loadQuestionBank(audienceGender);
              loadVersionData();
              setShowQuestionEditorModal(false);
              setEditingQuestion(null);
              setAfterCreateAddToPhase(null);
            }}
          />
        )}

        {showPhaseConfigModal && (
          <PhaseConfigModal
            phase={phases.find((p) => p.phase_name === activePhase)}
            versionId={currentVersion.id}
            onClose={() => setShowPhaseConfigModal(false)}
            onSave={loadVersionData}
          />
        )}

        {showLifetimeRuleModal && (
          <LifetimeRulesModal
            rules={lifetimeRules}
            versionId={currentVersion.id}
            questionBank={questionBank}
            onClose={() => setShowLifetimeRuleModal(false)}
            onUpdate={loadVersionData}
          />
        )}

        {showGlobalEscalateModal && (
          <GlobalEscalateModal
            versionId={currentVersion.id}
            onClose={() => setShowGlobalEscalateModal(false)}
            onSave={loadVersionData}
          />
        )}
      </div>
    </AdminLayout>
  );
}
