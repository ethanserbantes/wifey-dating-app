import { Image as ImageIcon } from "lucide-react";

export function EditorFooter({ uploadLoading, isSaving, canSave }) {
  return (
    <div className="mt-8 text-xs text-gray-500 flex items-center gap-2">
      {(uploadLoading || isSaving) && (
        <span className="inline-flex items-center gap-2">
          <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-[#FF1744]"></span>
          Working...
        </span>
      )}

      {!canSave && (
        <span className="inline-flex items-center gap-2">
          <ImageIcon size={14} />
          Add a name + at least one photo to create.
        </span>
      )}
    </div>
  );
}
