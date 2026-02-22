import { Video, Trash2 } from "lucide-react";

export function VideosSection({ videos, onUpload, onRemove }) {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Videos</h2>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <span className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100">
            <Video size={16} />
            Add videos
          </span>
        </label>
      </div>

      {videos.length === 0 ? (
        <div className="text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg p-4">
          Optional. Add short videos (we store URLs in profile preferences).
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((v, idx) => {
            const url = v?.url;
            return (
              <div
                key={`${url || "video"}-${idx}`}
                className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {url}
                  </div>
                  <div className="text-xs text-gray-600">
                    {v?.mimeType || "video"}
                  </div>
                </div>
                <button
                  onClick={() => onRemove(idx)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <Trash2 size={16} />
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
