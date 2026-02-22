import { UserInfoSection } from "./UserInfoSection";
import { DatingProfileSection } from "./DatingProfileSection";
import { ScreeningAttemptsSection } from "./ScreeningAttemptsSection";
import { ScreeningBansSection } from "./ScreeningBansSection";
import { BehaviorBansSection } from "./BehaviorBansSection";
import { ReportsSection } from "./ReportsSection";
import { ProfileBasicsEditor } from "./ProfileBasicsEditor";
import { UserActionsButtons } from "./UserActionsButtons";
import ChatsSection from "./ChatsSection";
import SubscriptionOverrideSection from "./SubscriptionOverrideSection";

export function UserDetailsModal({
  selectedUser,
  onClose,
  onApproveUser,
  onResetUser,
  onPartialResetUser,
  onDeleteUser,
  profileView,
  profileSaving,
  profileError,
  profileDraft,
  setProfileDraft,
  setBasicsField,
  onSaveProfile,
}) {
  if (!selectedUser) return null;

  const userId = selectedUser?.user?.id;
  const status = selectedUser?.user?.status;
  const latestAttemptDebug = selectedUser?.latestAttemptDebug || null;
  const attemptsDetailed = Array.isArray(selectedUser?.attemptsDetailed)
    ? selectedUser.attemptsDetailed
    : [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedUser.user.email}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                User ID: {selectedUser.user.id}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <UserActionsButtons
            userId={selectedUser.user.id}
            status={status}
            onApproveUser={onApproveUser}
            onResetUser={onResetUser}
            onPartialResetUser={onPartialResetUser}
            onDeleteUser={onDeleteUser}
          />

          <UserInfoSection user={selectedUser.user} />

          <SubscriptionOverrideSection userId={userId} />

          <DatingProfileSection profileView={profileView} />

          <ChatsSection userId={userId} />

          <ScreeningAttemptsSection
            attempts={selectedUser.attempts}
            attemptsDetailed={attemptsDetailed}
            latestAttemptDebug={latestAttemptDebug}
          />

          <ScreeningBansSection bans={selectedUser.screeningBans} />

          <BehaviorBansSection bans={selectedUser.behaviorBans} />

          <ReportsSection reports={selectedUser.reports} />

          <ProfileBasicsEditor
            profileError={profileError}
            profileDraft={profileDraft}
            setProfileDraft={setProfileDraft}
            setBasicsField={setBasicsField}
            profileSaving={profileSaving}
            onSaveProfile={onSaveProfile}
          />
        </div>
      </div>
    </div>
  );
}
