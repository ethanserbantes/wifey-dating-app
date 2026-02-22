import { useCallback } from "react";

export function useFakeProfileUpload({ upload, setDraft, setUiError }) {
  const uploadFiles = useCallback(
    async ({ files, kind }) => {
      setUiError(null);
      const list = Array.from(files || []);
      if (list.length === 0) return;

      for (const file of list) {
        const result = await upload({ file });
        if (result?.error) {
          console.error(result.error);
          setUiError(result.error);
          return;
        }
        if (!result?.url) {
          setUiError("Upload failed");
          return;
        }

        if (kind === "photo") {
          setDraft((d) => ({
            ...d,
            photos: [...(d.photos || []), result.url],
          }));
        }

        if (kind === "video") {
          setDraft((d) => {
            const prev = Array.isArray(d.preferences?.media?.videos)
              ? d.preferences.media.videos
              : [];
            const next = [
              ...prev,
              { url: result.url, mimeType: result.mimeType },
            ];
            return {
              ...d,
              preferences: {
                ...d.preferences,
                media: {
                  ...(d.preferences?.media || {}),
                  videos: next,
                },
              },
            };
          });
        }
      }
    },
    [upload, setDraft, setUiError],
  );

  return { uploadFiles };
}
