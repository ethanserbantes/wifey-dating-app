import { useState, useEffect, useCallback } from "react";

export function useProfileEditor(selectedUser) {
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileDraft, setProfileDraft] = useState({
    isVerified: false,
    basics: {
      height: "",
      sexuality: "",
      lookingFor: "",
      jobTitle: "",
      company: "",
      education: "",
    },
  });

  const normalizePreferences = useCallback((raw) => {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setProfileError(null);
      return;
    }

    const prefs = normalizePreferences(selectedUser.profile?.preferences);
    const basics =
      prefs?.basics && typeof prefs.basics === "object" ? prefs.basics : {};

    // Back-compat: parse basics.work into job title + company when possible
    let jobTitle = String(basics.jobTitle || "").trim();
    let company = String(basics.company || "").trim();
    const workLegacy = String(basics.work || "").trim();
    if (!jobTitle && !company && workLegacy.includes(" at ")) {
      const parts = workLegacy.split(" at ");
      jobTitle = String(parts[0] || "").trim();
      company = String(parts.slice(1).join(" at ") || "").trim();
    }

    setProfileDraft({
      isVerified: selectedUser.profile?.is_verified === true,
      basics: {
        height: String(basics.height || ""),
        sexuality: String(basics.sexuality || ""),
        lookingFor: String(basics.lookingFor || ""),
        jobTitle,
        company,
        education: String(basics.education || ""),
      },
    });
    setProfileError(null);
  }, [normalizePreferences, selectedUser]);

  const saveProfile = async (setSelectedUser) => {
    if (!selectedUser?.user?.id) return;

    try {
      setProfileSaving(true);
      setProfileError(null);

      const response = await fetch(`/api/admin/users/${selectedUser.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isVerified: !!profileDraft.isVerified,
          basics: {
            height: profileDraft.basics.height,
            sexuality: profileDraft.basics.sexuality,
            lookingFor: profileDraft.basics.lookingFor,
            jobTitle: profileDraft.basics.jobTitle,
            company: profileDraft.basics.company,
            education: profileDraft.basics.education,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `When updating /api/admin/users/${selectedUser.user.id}, the response was [${response.status}] ${response.statusText}`,
        );
      }

      const json = await response.json();
      setSelectedUser((prev) => {
        if (!prev) return prev;
        return { ...prev, profile: json.profile };
      });
    } catch (e) {
      console.error(e);
      setProfileError(e?.message || "Could not save profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const setBasicsField = (key, value) => {
    setProfileDraft((prev) => ({
      ...prev,
      basics: { ...prev.basics, [key]: value },
    }));
  };

  return {
    profileSaving,
    profileError,
    profileDraft,
    setProfileDraft,
    setBasicsField,
    saveProfile,
  };
}
