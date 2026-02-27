import { useState, useEffect, useMemo } from "react";
import adminFetch from "@/utils/adminFetch";

export function useQuizBuilder() {
  const [versions, setVersions] = useState([]);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [audienceGender, setAudienceGender] = useState("FEMALE"); // FEMALE | MALE | ALL
  const [phases, setPhases] = useState([]);
  const [questionBank, setQuestionBank] = useState([]);
  const [lifetimeRules, setLifetimeRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      // --- access control ---
      // Prefer the freshest role from /api/admin/me because localStorage can be stale in prod.
      try {
        const meRes = await adminFetch("/api/admin/me");
        if (meRes.ok) {
          const me = await meRes.json();
          const role = (me?.admin?.role || "").toString().toUpperCase();
          const canAccess = role === "OWNER" || role === "ADMIN";

          if (!canAccess) {
            if (!cancelled) {
              setError(
                "Access denied. Quiz Builder requires an OWNER or ADMIN account.",
              );
              setLoading(false);
            }
            return;
          }

          // keep localStorage in sync for other pages that read it
          try {
            if (me?.admin && typeof window !== "undefined") {
              localStorage.setItem("admin", JSON.stringify(me.admin));
            }
          } catch {
            // ignore
          }
        } else {
          // If we can't load /me, fall back to localStorage role check (best effort)
          const adminData = localStorage.getItem("admin");
          if (adminData) {
            const admin = JSON.parse(adminData);
            const role = (admin?.role || "").toString().toUpperCase();
            const canAccess = role === "OWNER" || role === "ADMIN";
            if (!canAccess) {
              if (!cancelled) {
                setError(
                  "Access denied. Quiz Builder requires an OWNER or ADMIN account.",
                );
                setLoading(false);
              }
              return;
            }
          }
        }
      } catch (e) {
        console.error("Quiz Builder: failed to validate admin role", e);
        // If role check fails, do not hard-block; the API calls will still 401 if session is invalid.
      }

      const storedAudience = localStorage.getItem(
        "quiz_builder_audience_gender",
      );
      if (
        storedAudience === "FEMALE" ||
        storedAudience === "MALE" ||
        storedAudience === "ALL"
      ) {
        setAudienceGender(storedAudience);
      }

      loadVersions();
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  // NEW: reload question bank whenever the admin switches Male/Female/All
  useEffect(() => {
    // audienceGender comes from state; the effect runs after it is set from localStorage.
    loadQuestionBank(audienceGender);
  }, [audienceGender]);

  useEffect(() => {
    try {
      localStorage.setItem("quiz_builder_audience_gender", audienceGender);
    } catch {
      // ignore
    }
  }, [audienceGender]);

  const visibleVersions = useMemo(() => {
    const safe = Array.isArray(versions) ? versions : [];
    return safe
      .filter((v) => v != null && typeof v === "object")
      .filter(
        (v) => v.id != null && v.version_number != null && v.status != null,
      )
      .filter((v) => v.audience_gender === "ALL" || v.audience_gender === audienceGender);
  }, [versions, audienceGender]);

  // If the user switches Male/Female, auto-select that quiz's active/draft version.
  useEffect(() => {
    if (!visibleVersions.length) {
      if (
        currentVersion &&
        (currentVersion.audience_gender || "ALL") !== audienceGender
      ) {
        setCurrentVersion(null);
      }
      return;
    }

    const currentAudience = currentVersion?.audience_gender || "ALL";
    if (currentVersion && currentAudience === audienceGender) {
      return;
    }

    const active = visibleVersions.find((v) => v.status === "active");
    const draft = visibleVersions.find((v) => v.status === "draft");
    setCurrentVersion(active || draft || visibleVersions[0] || null);
  }, [audienceGender, visibleVersions, currentVersion]);

  useEffect(() => {
    if (currentVersion) {
      loadVersionData();
    }
  }, [currentVersion]);

  const loadVersions = async () => {
    try {
      setError(null);
      console.log("📥 Loading quiz versions...");
      const res = await adminFetch("/api/admin/quiz-builder/versions");
      console.log("📥 Response status:", res.status);
      if (!res.ok) {
        throw new Error(
          `Failed to load versions: ${res.status} ${res.statusText}`,
        );
      }
      const data = await res.json();
      console.log("📥 Received versions:", data.versions?.length || 0);
      const validVersions = (data.versions || [])
        .filter((v) => v != null && typeof v === "object")
        .filter(
          (v) => v.id != null && v.version_number != null && v.status != null,
        );
      setVersions(validVersions);

      // If the previously-selected audience has no versions (common after a data migration),
      // auto-fallback to an audience that *does* have versions.
      const hasAudience = (gender) =>
        validVersions.some((v) => (v.audience_gender || "ALL") === gender);

      if (!hasAudience(audienceGender)) {
        const fallback = ["FEMALE", "MALE", "ALL"].find((g) => hasAudience(g));
        if (fallback && fallback !== audienceGender) {
          setAudienceGender(fallback);
        }
      }
    } catch (error) {
      console.error("Failed to load versions:", error);
      setError("Could not load quiz versions. Please refresh the page.");
      setVersions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestionBank = async (audience = "ALL") => {
    try {
      const res = await adminFetch(
        `/api/admin/quiz-builder/questions?audienceGender=${encodeURIComponent(
          audience || "ALL",
        )}`,
      );
      if (!res.ok) {
        throw new Error(
          `Failed to load questions: ${res.status} ${res.statusText}`,
        );
      }
      const data = await res.json();
      setQuestionBank(data.questions || []);
    } catch (error) {
      console.error("Failed to load question bank:", error);
      setQuestionBank([]);
    }
  };

  const loadVersionData = async () => {
    if (!currentVersion?.id) return;

    try {
      const [phasesRes, rulesRes] = await Promise.all([
        adminFetch(
          `/api/admin/quiz-builder/versions/${currentVersion.id}/phases`,
        ),
        adminFetch(
          `/api/admin/quiz-builder/versions/${currentVersion.id}/lifetime-rules`,
        ),
      ]);

      if (!phasesRes.ok || !rulesRes.ok) {
        throw new Error("Failed to load version data");
      }

      const phasesData = await phasesRes.json();
      const rulesData = await rulesRes.json();

      setPhases(phasesData.phases || []);
      setLifetimeRules(rulesData.rules || []);
    } catch (error) {
      console.error("Failed to load version data:", error);
      setPhases([]);
      setLifetimeRules([]);
    }
  };

  const createNewVersion = async () => {
    try {
      const res = await adminFetch("/api/admin/quiz-builder/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `New ${audienceGender.toLowerCase()} draft - ${Date.now()}`,
          audienceGender,
        }),
      });

      if (!res.ok) {
        throw new Error(
          `Failed to create version: ${res.status} ${res.statusText}`,
        );
      }

      const data = await res.json();
      if (data.version && data.version.id != null) {
        setVersions([data.version, ...versions]);
        setCurrentVersion(data.version);
      }
    } catch (error) {
      console.error("Failed to create version:", error);
      alert("Failed to create new version. Please try again.");
    }
  };

  const publishVersion = async () => {
    if (!currentVersion || currentVersion.status !== "draft") return;

    const quizLabel =
      audienceGender === "MALE"
        ? "Male quiz"
        : audienceGender === "FEMALE"
          ? "Female quiz"
          : "All users quiz";

    if (
      !confirm(`Publish this version? It will become the active ${quizLabel}.`)
    ) {
      return;
    }

    try {
      const res = await adminFetch(
        `/api/admin/quiz-builder/versions/${currentVersion.id}/publish`,
        {
          method: "POST",
        },
      );

      if (!res.ok) {
        throw new Error(`Failed to publish: ${res.status} ${res.statusText}`);
      }

      alert("Version published successfully!");
      loadVersions();
    } catch (error) {
      console.error("Failed to publish version:", error);
      alert("Failed to publish version. Please try again.");
    }
  };

  const exportJSON = async () => {
    if (!currentVersion) return;

    try {
      const res = await adminFetch(
        `/api/admin/quiz-builder/export/${currentVersion.id}`,
      );

      if (!res.ok) {
        throw new Error(`Failed to export: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      // Download as file
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quiz-v${currentVersion.version_number}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export:", error);
      alert("Failed to export version. Please try again.");
    }
  };

  const importJSON = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        setLoading(true);
        const text = await file.text();
        const res = await adminFetch("/api/admin/quiz-builder/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonData: text, audienceGender }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Import failed");
        }

        const data = await res.json();
        alert("Quiz imported successfully!");

        // Reload versions and set current version to the newly imported one
        await loadVersions();
        if (data.version) {
          setCurrentVersion(data.version);
        }

        // IMPORTANT: refresh question bank so newly-imported answers/weights show up immediately
        await loadQuestionBank(audienceGender);
      } catch (error) {
        console.error("Failed to import:", error);
        alert("Import failed: " + error.message);
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  // Replace the one-off Female → Male helper with a generic "duplicate" helper.
  const cloneCurrentVersionToAudience = async (targetAudienceGender) => {
    if (!currentVersion?.id) {
      alert("Select a version to duplicate first.");
      return;
    }

    const target = (targetAudienceGender || "").toString().toUpperCase();
    const allowed = ["FEMALE", "MALE", "ALL"];

    if (!allowed.includes(target)) {
      alert("Please choose FEMALE, MALE, or ALL.");
      return;
    }

    try {
      setLoading(true);

      // Export the currently-selected version
      const exportRes = await adminFetch(
        `/api/admin/quiz-builder/export/${currentVersion.id}`,
      );
      if (!exportRes.ok) {
        throw new Error(
          `Failed to export source quiz: ${exportRes.status} ${exportRes.statusText}`,
        );
      }

      const exported = await exportRes.json();

      // Import into the target audience (creates a new draft version)
      const importRes = await adminFetch("/api/admin/quiz-builder/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonData: exported, audienceGender: target }),
      });

      if (!importRes.ok) {
        const err = await importRes.json().catch(() => ({}));
        throw new Error(err.error || "Duplicate failed");
      }

      const data = await importRes.json();

      await loadVersions();

      // Switch the builder to the target quiz and open the newly created draft.
      setAudienceGender(target);
      if (data?.version) {
        setCurrentVersion(data.version);
      }

      alert("Duplicated successfully!");
    } catch (error) {
      console.error("Failed to duplicate version:", error);
      alert("Duplicate failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteVersion = async (versionId) => {
    if (!confirm("Delete this version? This cannot be undone.")) {
      return;
    }

    try {
      setLoading(true);
      const res = await adminFetch(
        `/api/admin/quiz-builder/versions/${versionId}`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Delete failed");
      }

      alert("Version deleted successfully!");

      // If we deleted the current version, clear it
      if (currentVersion?.id === versionId) {
        setCurrentVersion(null);
      }

      // Reload versions
      await loadVersions();
    } catch (error) {
      console.error("Failed to delete version:", error);
      alert("Delete failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    versions: visibleVersions,
    allVersions: versions,
    currentVersion,
    setCurrentVersion,
    audienceGender,
    setAudienceGender,
    phases,
    questionBank,
    lifetimeRules,
    loading,
    error,
    loadVersionData,
    loadQuestionBank,
    createNewVersion,
    publishVersion,
    exportJSON,
    importJSON,
    cloneCurrentVersionToAudience,
    deleteVersion,
  };
}
