import { useCallback } from "react";

export function useFakeProfileDraft(setDraft) {
  const setDraftField = useCallback(
    (key, value) => {
      setDraft((d) => ({ ...d, [key]: value }));
    },
    [setDraft],
  );

  const setPreferenceField = useCallback(
    (key, value) => {
      setDraft((d) => ({
        ...d,
        preferences: {
          ...(d.preferences || {}),
          [key]: value,
        },
      }));
    },
    [setDraft],
  );

  const setBasicsField = useCallback(
    (key, value) => {
      setDraft((d) => ({
        ...d,
        preferences: {
          ...d.preferences,
          basics: {
            ...(d.preferences?.basics || {}),
            [key]: value,
          },
        },
      }));
    },
    [setDraft],
  );

  const addInterest = useCallback(
    (value) => {
      const v = (value || "").trim();
      if (!v) return;
      setDraft((d) => {
        const prev = Array.isArray(d.preferences?.interests)
          ? d.preferences.interests
          : [];
        const exists = prev.some((x) => x.toLowerCase() === v.toLowerCase());
        const next = exists ? prev : [...prev, v];
        return {
          ...d,
          preferences: {
            ...d.preferences,
            interests: next,
          },
        };
      });
    },
    [setDraft],
  );

  const removeInterest = useCallback(
    (value) => {
      setDraft((d) => {
        const prev = Array.isArray(d.preferences?.interests)
          ? d.preferences.interests
          : [];
        const next = prev.filter((x) => x !== value);
        return {
          ...d,
          preferences: {
            ...d.preferences,
            interests: next,
          },
        };
      });
    },
    [setDraft],
  );

  const addPrompt = useCallback(() => {
    setDraft((d) => {
      const prev = Array.isArray(d.preferences?.prompts)
        ? d.preferences.prompts
        : [];
      const next = [...prev, { question: "", answer: "" }];
      return {
        ...d,
        preferences: {
          ...d.preferences,
          prompts: next,
        },
      };
    });
  }, [setDraft]);

  const updatePrompt = useCallback(
    (index, patch) => {
      setDraft((d) => {
        const prev = Array.isArray(d.preferences?.prompts)
          ? d.preferences.prompts
          : [];
        const next = prev.map((p, i) => (i === index ? { ...p, ...patch } : p));
        return {
          ...d,
          preferences: {
            ...d.preferences,
            prompts: next,
          },
        };
      });
    },
    [setDraft],
  );

  const removePrompt = useCallback(
    (index) => {
      setDraft((d) => {
        const prev = Array.isArray(d.preferences?.prompts)
          ? d.preferences.prompts
          : [];
        const next = prev.filter((_, i) => i !== index);
        return {
          ...d,
          preferences: {
            ...d.preferences,
            prompts: next,
          },
        };
      });
    },
    [setDraft],
  );

  const removePhotoAt = useCallback(
    (index) => {
      setDraft((d) => {
        const next = (d.photos || []).filter((_, i) => i !== index);
        return { ...d, photos: next };
      });
    },
    [setDraft],
  );

  const removeVideoAt = useCallback(
    (index) => {
      setDraft((d) => {
        const prev = Array.isArray(d.preferences?.media?.videos)
          ? d.preferences.media.videos
          : [];
        const next = prev.filter((_, i) => i !== index);
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
    },
    [setDraft],
  );

  return {
    setDraftField,
    setPreferenceField,
    setBasicsField,
    addInterest,
    removeInterest,
    addPrompt,
    updatePrompt,
    removePrompt,
    removePhotoAt,
    removeVideoAt,
  };
}
