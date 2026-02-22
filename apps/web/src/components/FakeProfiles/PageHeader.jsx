import { Plus, Save, Trash2 } from "lucide-react";

export function PageHeader({
  onNew,
  onSave,
  onDelete,
  canSave,
  isSaving,
  isEditing,
  isDeleting,
}) {
  const saveLabel = isEditing ? "Save" : "Create";
  const saveDisabled = !canSave || isSaving;

  const disabledHint =
    !isEditing && !canSave
      ? "To create a fake profile, add a display name and at least one photo."
      : null;

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Fake Profiles</h1>
        <p className="text-sm text-gray-600 mt-1">
          Create and edit seed profiles (photos, videos, basics, prompts,
          interests).
        </p>
      </div>

      <div className="flex flex-col items-start md:items-end gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Plus size={18} />
            New
          </button>

          <button
            onClick={onSave}
            disabled={saveDisabled}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF1744] text-white rounded-lg hover:bg-[#D50032] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {isSaving ? "Saving…" : saveLabel}
          </button>

          <button
            onClick={onDelete}
            disabled={!isEditing || isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={18} />
            Delete
          </button>
        </div>

        {disabledHint ? (
          <div className="text-xs text-gray-500">{disabledHint}</div>
        ) : null}
      </div>
    </div>
  );
}
