import { useMutation, useQueryClient } from "@tanstack/react-query";
import adminFetch from "@/utils/adminFetch";

export function useFakeProfileMutations({
  setSelectedUserId,
  setSavingHint,
  setUiError,
  setDraft,
  emptyDraft,
}) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await adminFetch("/api/admin/fake-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `When posting /api/admin/fake-profiles, the response was [${response.status}] ${response.statusText}. ${text}`,
        );
      }
      return response.json();
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles"],
      });
      const newUserId = data?.user?.id;
      if (newUserId) {
        setSelectedUserId(newUserId);
        setSavingHint("Created");
        setTimeout(() => setSavingHint(null), 1500);
      }
    },
    onError: (error) => {
      console.error(error);
      setUiError(error?.message || "Could not create fake profile");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, payload }) => {
      const response = await adminFetch(`/api/admin/fake-profiles/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `When patching /api/admin/fake-profiles/${userId}, the response was [${response.status}] ${response.statusText}. ${text}`,
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles"],
      });
      setSavingHint("Saved");
      setTimeout(() => setSavingHint(null), 1200);
    },
    onError: (error) => {
      console.error(error);
      setUiError(error?.message || "Could not save changes");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId) => {
      const response = await adminFetch(`/api/admin/fake-profiles/${userId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `When deleting /api/admin/fake-profiles/${userId}, the response was [${response.status}] ${response.statusText}. ${text}`,
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles"],
      });
      setSelectedUserId(null);
      setDraft(emptyDraft());
      setSavingHint("Deleted");
      setTimeout(() => setSavingHint(null), 1500);
    },
    onError: (error) => {
      console.error(error);
      setUiError(error?.message || "Could not delete fake profile");
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
