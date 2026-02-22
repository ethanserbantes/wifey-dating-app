import { RotateCcw, Trash2, CheckCircle2, RefreshCw } from "lucide-react";

export function UserActionsButtons({
  userId,
  status,
  onApproveUser,
  onResetUser,
  onPartialResetUser,
  onDeleteUser,
}) {
  const canApprove = !!onApproveUser && status !== "APPROVED";

  return (
    <div className="flex gap-3 flex-wrap">
      {canApprove ? (
        <button
          onClick={() => onApproveUser(userId)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <CheckCircle2 size={18} />
          Approve (Bypass)
        </button>
      ) : null}

      {onPartialResetUser ? (
        <button
          onClick={() => onPartialResetUser(userId)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <RefreshCw size={18} />
          Reset Likes/Matches
        </button>
      ) : null}

      <button
        onClick={() => onResetUser(userId)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <RotateCcw size={18} />
        Reset Account
      </button>

      <button
        onClick={() => onDeleteUser(userId)}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
      >
        <Trash2 size={18} />
        Delete User
      </button>
    </div>
  );
}
