export function ProfilePhotos({ photos }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-900 mb-2">
        Photos ({photos.length})
      </div>
      {photos.length === 0 ? (
        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          No photos saved.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((url, idx) => (
            <a
              key={`${url}-${idx}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block"
              title="Open image"
            >
              <img
                src={url}
                alt=""
                className="w-full h-40 object-cover rounded-lg border border-gray-200"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
