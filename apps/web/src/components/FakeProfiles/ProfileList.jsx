import { Eye, EyeOff, BadgeCheck } from "lucide-react";

export function ProfileList({
  profiles,
  selectedUserId,
  onSelectProfile,
  isLoading,
  error,
}) {
  if (isLoading) {
    return (
      <div className="text-center py-10">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF1744]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 text-sm text-red-700">Could not load profiles</div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="p-5 text-sm text-gray-600">No fake profiles yet.</div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {profiles.map((p) => {
        const isSelected = p.userId === selectedUserId;

        const category = String(p?.preferences?.category || "").trim();

        const subtitleParts = [
          p.age ? `${p.age}` : null,
          p.location || null,
          category ? `Category: ${category}` : null,
        ].filter(Boolean);

        const subtitle = subtitleParts.join(" • ");

        const likesCount = Number.isFinite(Number(p.likesCount))
          ? Number(p.likesCount)
          : 0;
        const likesBadgeText =
          likesCount === 1 ? "1 like" : `${likesCount} likes`;

        return (
          <button
            key={p.userId}
            onClick={() => onSelectProfile(p.userId)}
            className={`w-full text-left px-5 py-4 hover:bg-gray-50 ${
              isSelected ? "bg-gray-50" : "bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 truncate flex items-center gap-2">
                  <span className="truncate">
                    {p.displayName || "(no name)"}
                  </span>

                  {p.isVerified ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex-shrink-0">
                      <BadgeCheck size={12} />
                      Verified
                    </span>
                  ) : null}

                  {likesCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#D50032] bg-[#FFEBEE] border border-[#FFCDD2] px-2 py-0.5 rounded-full flex-shrink-0">
                      {likesBadgeText}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-600 truncate">
                  {subtitle || p.gender || ""}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {p.isVisible ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                    <Eye size={14} />
                    Visible
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 px-2 py-1 rounded-full">
                    <EyeOff size={14} />
                    Hidden
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
