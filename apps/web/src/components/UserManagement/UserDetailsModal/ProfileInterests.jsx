export function ProfileInterests({ interests }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-900 mb-2">
        Interests ({interests.length})
      </div>
      {interests.length === 0 ? (
        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          No interests saved.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {interests.map((i, idx) => (
            <span
              key={`${i}-${idx}`}
              className="px-2 py-1 text-xs bg-white border border-gray-200 rounded-full text-gray-800"
            >
              {String(i)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
