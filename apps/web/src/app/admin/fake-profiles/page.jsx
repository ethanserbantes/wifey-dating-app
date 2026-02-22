"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useQuery } from "@tanstack/react-query";
import useUpload from "@/utils/useUpload";
import { emptyDraft, normalizeProfileRow } from "@/utils/fakeProfileHelpers";
import { useFakeProfileMutations } from "@/hooks/useFakeProfileMutations";
import { useFakeProfileDraft } from "@/hooks/useFakeProfileDraft";
import { useFakeProfileUpload } from "@/hooks/useFakeProfileUpload";
import { ProfileList } from "@/components/FakeProfiles/ProfileList";
import { PageHeader } from "@/components/FakeProfiles/PageHeader";
import { StatusMessages } from "@/components/FakeProfiles/StatusMessages";
import { BasicInfoSection } from "@/components/FakeProfiles/BasicInfoSection";
import { BasicsSection } from "@/components/FakeProfiles/BasicsSection";
import { PhotosSection } from "@/components/FakeProfiles/PhotosSection";
import { VideosSection } from "@/components/FakeProfiles/VideosSection";
import { InterestsSection } from "@/components/FakeProfiles/InterestsSection";
import { PromptsSection } from "@/components/FakeProfiles/PromptsSection";
import { EditorFooter } from "@/components/FakeProfiles/EditorFooter";
import { ReceivedLikesSection } from "@/components/FakeProfiles/ReceivedLikesSection";
import LikeAsFakeSection from "@/components/FakeProfiles/LikeAsFakeSection";
import ChatAndAvailabilitySection from "@/components/FakeProfiles/ChatAndAvailabilitySection";
import adminFetch from "@/utils/adminFetch";

function sanitizePreferences(input) {
  if (!input || typeof input !== "object") {
    return {};
  }

  const out = { ...input };

  // Remove deprecated fake-profile field.
  if (out.basics && typeof out.basics === "object") {
    const nextBasics = { ...out.basics };
    if ("lookingFor" in nextBasics) {
      delete nextBasics.lookingFor;
    }
    out.basics = nextBasics;
  }

  const category = String(out.category || "").trim();
  if (!category) {
    // Don't store empty strings; category feeds treat empty as unset anyway.
    delete out.category;
  } else {
    out.category = category;
  }

  return out;
}

export default function FakeProfilesAdminPage() {
  const [upload, { loading: uploadLoading }] = useUpload();

  const [draft, setDraft] = useState(() => emptyDraft());
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [uiError, setUiError] = useState(null);
  const [savingHint, setSavingHint] = useState(null);

  const listQuery = useQuery({
    queryKey: ["admin", "fakeProfiles"],
    queryFn: async () => {
      const response = await adminFetch("/api/admin/fake-profiles");
      if (!response.ok) {
        throw new Error(
          `When fetching /api/admin/fake-profiles, the response was [${response.status}] ${response.statusText}`,
        );
      }
      const data = await response.json();
      return data.profiles || [];
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["admin", "profileCategories"],
    queryFn: async () => {
      const response = await adminFetch("/api/admin/categories");
      if (!response.ok) {
        throw new Error(
          `When fetching /api/admin/categories, the response was [${response.status}] ${response.statusText}`,
        );
      }
      const data = await response.json();
      return Array.isArray(data?.categories) ? data.categories : [];
    },
  });

  const normalizedProfiles = useMemo(() => {
    return (listQuery.data || [])
      .map((p) => {
        try {
          return normalizeProfileRow(p);
        } catch (e) {
          console.error("[ADMIN][FAKE_PROFILES] normalize error", e);
          return null;
        }
      })
      .filter(Boolean);
  }, [listQuery.data]);

  useEffect(() => {
    if (!selectedUserId) return;
    const found = normalizedProfiles.find((p) => p.userId === selectedUserId);
    if (found) {
      setDraft(found);
    }
  }, [selectedUserId, normalizedProfiles]);

  const { createMutation, updateMutation, deleteMutation } =
    useFakeProfileMutations({
      setSelectedUserId,
      setSavingHint,
      setUiError,
      setDraft,
      emptyDraft,
    });

  const {
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
  } = useFakeProfileDraft(setDraft);

  const { uploadFiles } = useFakeProfileUpload({
    upload,
    setDraft,
    setUiError,
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleNew = useCallback(() => {
    setSelectedUserId(null);
    setUiError(null);
    setDraft(emptyDraft());
  }, []);

  const canSave = useMemo(() => {
    const nameOk = Boolean((draft.displayName || "").trim());
    const hasAtLeastOnePhoto =
      Array.isArray(draft.photos) && draft.photos.length > 0;
    return nameOk && hasAtLeastOnePhoto;
  }, [draft.displayName, draft.photos]);

  const handleSave = useCallback(() => {
    setUiError(null);

    const categoryFromDraft = String(draft.preferences?.category || "").trim();
    const prefs = sanitizePreferences(draft.preferences);

    const payload = {
      displayName: (draft.displayName || "").trim(),
      age: draft.age === "" ? null : Number(draft.age),
      gender: draft.gender,
      location: draft.location,
      bio: draft.bio,
      isVisible: Boolean(draft.isVisible),
      isVerified: Boolean(draft.isVerified),
      photos: Array.isArray(draft.photos) ? draft.photos : [],
      // Send category explicitly as a backstop so the server can persist it
      // even if the preferences merge changes in the future.
      category: categoryFromDraft,
      preferences: prefs,
    };

    if (draft.userId) {
      updateMutation.mutate({ userId: draft.userId, payload });
    } else {
      createMutation.mutate(payload);
    }
  }, [draft, createMutation, updateMutation]);

  const handleDelete = useCallback(() => {
    if (!draft.userId) return;
    const ok = confirm("Delete this fake profile? This cannot be undone.");
    if (!ok) return;
    deleteMutation.mutate(draft.userId);
  }, [draft.userId, deleteMutation]);

  const videos = Array.isArray(draft.preferences?.media?.videos)
    ? draft.preferences.media.videos
    : [];
  const interests = Array.isArray(draft.preferences?.interests)
    ? draft.preferences.interests
    : [];
  const prompts = Array.isArray(draft.preferences?.prompts)
    ? draft.preferences.prompts
    : [];

  const categories = categoriesQuery.data || [];

  return (
    <AdminLayout currentPage="fake-profiles">
      <div className="p-8">
        <PageHeader
          onNew={handleNew}
          onSave={handleSave}
          onDelete={handleDelete}
          canSave={canSave}
          isSaving={isSaving}
          isEditing={Boolean(draft.userId)}
          isDeleting={deleteMutation.isPending}
        />

        <StatusMessages error={uiError} savingHint={savingHint} />

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* Left list */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="font-semibold text-gray-900">Existing</div>
              <div className="text-xs text-gray-500">
                {normalizedProfiles.length}
              </div>
            </div>

            <ProfileList
              profiles={normalizedProfiles}
              selectedUserId={selectedUserId}
              onSelectProfile={setSelectedUserId}
              isLoading={listQuery.isLoading}
              error={listQuery.error}
            />
          </div>

          {/* Editor */}
          <div className="bg-white rounded-lg shadow p-6">
            <BasicInfoSection
              draft={draft}
              setDraftField={setDraftField}
              categories={categories}
              setPreferenceField={setPreferenceField}
            />

            {/* Move media to the top so the profile is easy to identify */}
            <PhotosSection
              photos={draft.photos}
              onUpload={(files) => uploadFiles({ files, kind: "photo" })}
              onRemove={removePhotoAt}
            />

            <VideosSection
              videos={videos}
              onUpload={(files) => uploadFiles({ files, kind: "video" })}
              onRemove={removeVideoAt}
            />

            <BasicsSection draft={draft} setBasicsField={setBasicsField} />

            <InterestsSection
              interests={interests}
              onAdd={addInterest}
              onRemove={removeInterest}
            />

            <PromptsSection
              prompts={prompts}
              onAdd={addPrompt}
              onUpdate={updatePrompt}
              onRemove={removePrompt}
            />

            <ReceivedLikesSection fakeUserId={draft.userId} />

            <LikeAsFakeSection fakeUserId={draft.userId} />

            <ChatAndAvailabilitySection fakeUserId={draft.userId} />

            <EditorFooter
              uploadLoading={uploadLoading}
              isSaving={isSaving}
              canSave={canSave}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
