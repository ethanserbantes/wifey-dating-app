export function ProfileVideos({ videos }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-900 mb-2">
        Videos ({videos.length})
      </div>
      {videos.length === 0 ? (
        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          No videos saved.
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((v, idx) => {
            const url = String(v?.url || "").trim();
            const mime = String(v?.mimeType || "video").trim();
            const canRender = Boolean(url);

            return (
              <div
                key={`${url || "video"}-${idx}`}
                className="border border-gray-200 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">{mime}</div>
                    <div className="text-sm text-gray-900 truncate">
                      {url || "(missing url)"}
                    </div>
                  </div>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[#FF1744] hover:text-[#D50032]"
                    >
                      Open
                    </a>
                  ) : null}
                </div>

                {canRender ? (
                  <video
                    src={url}
                    controls
                    className="mt-3 w-full max-h-56 rounded-lg border border-gray-200"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
