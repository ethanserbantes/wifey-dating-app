import { Upload, X } from "lucide-react";

export function PhotosSection({ photos, onUpload, onRemove }) {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <span className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100">
            <Upload size={16} />
            Add photos
          </span>
        </label>
      </div>

      {photos.length === 0 ? (
        <div className="text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg p-4">
          Add at least one photo to create a profile.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photos.map((url, idx) => (
            <div key={`${url}-${idx}`} className="relative group">
              <img
                src={url}
                alt=""
                className="w-full h-32 object-cover rounded-lg border border-gray-200"
              />
              <button
                onClick={() => onRemove(idx)}
                className="absolute top-2 right-2 bg-white/90 border border-gray-200 rounded-full p-1 opacity-0 group-hover:opacity-100"
                title="Remove"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
