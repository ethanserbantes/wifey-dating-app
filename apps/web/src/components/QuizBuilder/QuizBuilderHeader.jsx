import {
  Plus,
  Save,
  Download,
  Upload,
  Trash2,
  Edit2,
  Copy,
} from "lucide-react";
import { useState } from "react";

export function QuizBuilderHeader({
  versions,
  // allVersions is no longer needed for cloning UX
  currentVersion,
  onVersionChange,
  audienceGender,
  onAudienceGenderChange,
  onCreateNewVersion,
  onPublishVersion,
  onExportJSON,
  onImportJSON,
  onCloneVersion,
  onDeleteVersion,
  isLoading = false,
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newNotes, setNewNotes] = useState("");

  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);

  const safeVersions = Array.isArray(versions)
    ? versions.filter(
        (v) =>
          v &&
          typeof v === "object" &&
          v.id != null &&
          v.version_number != null &&
          v.status != null,
      )
    : [];

  const getStatusBadge = (status) => {
    const badges = {
      active: "bg-green-500 text-white",
      draft: "bg-yellow-500 text-white",
      archived: "bg-gray-400 text-white",
    };
    return badges[status] || badges.draft;
  };

  const getStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handleRename = async () => {
    if (!currentVersion || !newNotes.trim()) {
      setIsRenaming(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/quiz-builder/versions/${currentVersion.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: newNotes.trim() }),
        },
      );

      if (!res.ok) throw new Error("Failed to rename");
      window.location.reload();
    } catch (error) {
      console.error("Failed to rename:", error);
      alert("Failed to rename version");
    }
    setIsRenaming(false);
  };

  const openDuplicate = () => {
    if (!currentVersion?.id) {
      alert("Select a version to duplicate first.");
      return;
    }

    setIsDuplicateOpen(true);
  };

  const closeDuplicate = () => {
    setIsDuplicateOpen(false);
  };

  const duplicateTo = (target) => {
    if (!currentVersion?.id) {
      setIsDuplicateOpen(false);
      return;
    }

    onCloneVersion?.(target);
    setIsDuplicateOpen(false);
  };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* LEFT SIDE */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quiz Builder</h1>
            {currentVersion && (
              <div className="flex items-center gap-2 mt-2">
                {isRenaming ? (
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename();
                      if (e.key === "Escape") setIsRenaming(false);
                    }}
                    autoFocus
                    placeholder="Version notes..."
                    className="px-2 py-1 border border-blue-500 rounded text-sm"
                  />
                ) : (
                  <>
                    <span className="text-lg font-bold text-gray-900">
                      v{currentVersion.version_number}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(currentVersion.status)}`}
                    >
                      {getStatusLabel(currentVersion.status)}
                    </span>
                    {currentVersion.notes && (
                      <span className="text-sm text-gray-600">
                        • {currentVersion.notes}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setNewNotes(currentVersion.notes || "");
                        setIsRenaming(true);
                      }}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Rename version"
                    >
                      <Edit2 size={16} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-3">
          {/* Audience Dropdown */}
          <select
            value={audienceGender || "ALL"}
            onChange={(e) => onAudienceGenderChange?.(e.target.value)}
            disabled={isLoading}
            className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            title="Which quiz are you editing?"
          >
            <option value="FEMALE">Female quiz</option>
            <option value="MALE">Male quiz</option>
            <option value="ALL">All users (legacy)</option>
          </select>

          {/* Version Dropdown */}
          <select
            value={currentVersion?.id || ""}
            onChange={(e) => {
              const selectedId = parseInt(e.target.value);
              if (!selectedId) return;
              const version = safeVersions.find((v) => v?.id === selectedId);
              if (version) {
                onVersionChange(version);
              }
            }}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed min-w-[250px]"
          >
            <option value="">
              {isLoading ? "Loading..." : "Select Version"}
            </option>
            {safeVersions.map((v) => {
              let badge = "";
              if (v.status === "active") badge = "🟢 ACTIVE";
              else if (v.status === "draft") badge = "🟡 DRAFT";
              else badge = "⚪ ARCHIVED";

              const label = `v${v.version_number} ${badge}${v.notes ? ` - ${v.notes}` : ""}`;
              return (
                <option key={v.id} value={v.id}>
                  {label}
                </option>
              );
            })}
          </select>

          {/* Delete Button */}
          {currentVersion && (
            <button
              onClick={() => onDeleteVersion(currentVersion.id)}
              disabled={isLoading || currentVersion.status === "active"}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={
                currentVersion.status === "active"
                  ? "Cannot delete active version"
                  : "Delete this version"
              }
            >
              <Trash2 size={18} />
            </button>
          )}

          <div className="h-8 w-px bg-gray-300"></div>

          {/* New Version Button */}
          <button
            onClick={onCreateNewVersion}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={18} />
            New
          </button>

          {/* Publish Button (only for drafts) */}
          {currentVersion?.status === "draft" && (
            <button
              onClick={onPublishVersion}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={18} />
              Publish
            </button>
          )}

          <div className="h-8 w-px bg-gray-300"></div>

          {/* Export Button */}
          <button
            onClick={onExportJSON}
            disabled={isLoading || !currentVersion}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Export JSON"
          >
            <Download size={18} />
          </button>

          {/* Import Button */}
          <button
            onClick={onImportJSON}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Import JSON"
          >
            <Upload size={18} />
          </button>

          {/* Duplicate Button (now lives near import/export) */}
          <button
            onClick={openDuplicate}
            disabled={isLoading || !currentVersion}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Duplicate this version into another quiz (male/female/all)"
          >
            <Copy size={18} />
            Duplicate
          </button>
        </div>
      </div>

      {isDuplicateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDuplicate}
          />
          <div className="relative bg-white w-[92vw] max-w-[420px] rounded-xl shadow-xl border border-gray-200 p-5">
            <div className="text-lg font-bold text-gray-900">
              Duplicate version
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Pick where you want the copy to live.
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => duplicateTo("FEMALE")}
                className="px-3 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 text-left"
              >
                <div className="font-semibold text-gray-900">Female</div>
                <div className="text-xs text-gray-600">New female draft</div>
              </button>

              <button
                onClick={() => duplicateTo("MALE")}
                className="px-3 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 text-left"
              >
                <div className="font-semibold text-gray-900">Male</div>
                <div className="text-xs text-gray-600">New male draft</div>
              </button>

              <button
                onClick={() => duplicateTo("ALL")}
                className="px-3 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 text-left"
              >
                <div className="font-semibold text-gray-900">All users</div>
                <div className="text-xs text-gray-600">Legacy / fallback</div>
              </button>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={closeDuplicate}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
