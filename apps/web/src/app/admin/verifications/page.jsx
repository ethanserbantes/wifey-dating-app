"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { BadgeCheck, Ban, XCircle } from "lucide-react";
import adminFetch from "@/utils/adminFetch";

async function fetchQueue() {
  const response = await adminFetch("/api/admin/verifications");
  if (!response.ok) {
    throw new Error(
      `When fetching /api/admin/verifications, the response was [${response.status}] ${response.statusText}`,
    );
  }
  const json = await response.json();
  return Array.isArray(json?.items) ? json.items : [];
}

function prettyGender(g) {
  const s = String(g || "").trim();
  if (!s) return "—";
  if (s.toLowerCase() === "male") return "Male";
  if (s.toLowerCase() === "female") return "Female";
  return s;
}

export default function AdminVerificationsPage() {
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("admin");
      if (!raw) {
        setAdmin(null);
        return;
      }
      setAdmin(JSON.parse(raw));
    } catch (e) {
      console.error(e);
      setAdmin(null);
    }
  }, []);

  const {
    data: items = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin", "verifications"],
    queryFn: fetchQueue,
  });

  useEffect(() => {
    if (items.length === 0) {
      setSelectedUserId(null);
      return;
    }

    const stillExists = items.some((x) => x.user_id === selectedUserId);
    if (selectedUserId == null || !stillExists) {
      setSelectedUserId(items[0].user_id);
    }
  }, [items, selectedUserId]);

  const selected = useMemo(() => {
    return items.find((x) => x.user_id === selectedUserId) || null;
  }, [items, selectedUserId]);

  const approveMutation = useMutation({
    mutationFn: async (userId) => {
      const response = await adminFetch(
        `/api/admin/verifications/${userId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminId: admin?.id || null }),
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `When POSTing approve, the response was [${response.status}] ${response.statusText} ${text}`,
        );
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Approved");
      queryClient.invalidateQueries({ queryKey: ["admin", "verifications"] });
    },
    onError: (e) => {
      console.error(e);
      toast.error("Could not approve");
    },
  });

  const denyMutation = useMutation({
    mutationFn: async ({ userId, reason }) => {
      const response = await adminFetch(
        `/api/admin/verifications/${userId}/deny`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminId: admin?.id || null, reason }),
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `When POSTing deny, the response was [${response.status}] ${response.statusText} ${text}`,
        );
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Denied (retake requested)");
      queryClient.invalidateQueries({ queryKey: ["admin", "verifications"] });
    },
    onError: (e) => {
      console.error(e);
      toast.error("Could not deny");
    },
  });

  const banMutation = useMutation({
    mutationFn: async ({ userId, notes }) => {
      const response = await adminFetch(
        `/api/admin/verifications/${userId}/ban`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminId: admin?.id || null, notes }),
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `When POSTing ban, the response was [${response.status}] ${response.statusText} ${text}`,
        );
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Banned");
      queryClient.invalidateQueries({ queryKey: ["admin", "verifications"] });
    },
    onError: (e) => {
      console.error(e);
      toast.error("Could not ban");
    },
  });

  const busy =
    approveMutation.isPending ||
    denyMutation.isPending ||
    banMutation.isPending;

  return (
    <AdminLayout currentPage="verifications">
      <Toaster richColors position="top-right" />

      <div className="p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Photo Verification
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Quick approve/deny queue for selfies
            </p>
          </div>

          <button
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Could not load queue.
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queue */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-900">
                Queue ({items.length})
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Unreviewed selfies
              </div>
            </div>

            {isLoading ? (
              <div className="p-6 text-sm text-gray-600">Loading…</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-sm text-gray-600">
                No selfies waiting.
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                {items.map((it) => {
                  const active = it.user_id === selectedUserId;
                  const genderLabel = prettyGender(it.gender);
                  const statusLabel = String(
                    it.verification_status || "pending",
                  );

                  return (
                    <button
                      key={it.user_id}
                      onClick={() => setSelectedUserId(it.user_id)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${
                        active ? "bg-gray-50" : "bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {it.email}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {genderLabel} • {statusLabel}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          #{it.user_id}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {selected ? selected.email : "Select a user"}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {selected
                    ? `User #${selected.user_id} • Gender: ${prettyGender(selected.gender)}`
                    : ""}
                </div>
              </div>

              {selected ? (
                <div className="flex items-center gap-2">
                  <a
                    href={selected.verification_photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-[#7C3AED] hover:underline"
                  >
                    Open image
                  </a>
                </div>
              ) : null}
            </div>

            {!selected ? (
              <div className="p-10 text-sm text-gray-600">Pick a selfie.</div>
            ) : (
              <div className="p-5">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      {selected.verification_photo_url ? (
                        <img
                          src={selected.verification_photo_url}
                          alt="Verification selfie"
                          className="w-full h-[420px] object-contain rounded-lg bg-white"
                        />
                      ) : (
                        <div className="h-[420px] flex items-center justify-center text-sm text-gray-500">
                          No image
                        </div>
                      )}
                    </div>

                    {selected.verification_submitted_at ? (
                      <div className="text-xs text-gray-500 mt-2">
                        Submitted:{" "}
                        {new Date(
                          selected.verification_submitted_at,
                        ).toLocaleString()}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <div className="text-sm font-semibold text-gray-900">
                        Actions
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Approve, deny (retake), or ban
                      </div>

                      <div className="mt-4 flex flex-col gap-2">
                        <button
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 text-white px-4 py-3 font-semibold hover:bg-green-700 disabled:opacity-60"
                          onClick={() =>
                            approveMutation.mutate(selected.user_id)
                          }
                          disabled={busy}
                        >
                          <BadgeCheck size={18} /> Approve
                        </button>

                        <button
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 text-white px-4 py-3 font-semibold hover:bg-amber-600 disabled:opacity-60"
                          onClick={() => {
                            const reason = window.prompt(
                              "Optional: tell them what to fix (lighting, face visible, etc).",
                              "Please retake in good light with your full face visible.",
                            );
                            denyMutation.mutate({
                              userId: selected.user_id,
                              reason,
                            });
                          }}
                          disabled={busy}
                        >
                          <XCircle size={18} /> Deny (retake)
                        </button>

                        <button
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-4 py-3 font-semibold hover:bg-red-700 disabled:opacity-60"
                          onClick={() => {
                            const ok = window.confirm(
                              "Ban this user permanently for fraud? This blocks all access.",
                            );
                            if (!ok) return;
                            const notes = window.prompt(
                              "Optional notes (for internal record):",
                              "",
                            );
                            banMutation.mutate({
                              userId: selected.user_id,
                              notes,
                            });
                          }}
                          disabled={busy}
                        >
                          <Ban size={18} /> Ban (fraud)
                        </button>
                      </div>

                      <div className="mt-4 text-xs text-gray-500 leading-5">
                        <div>
                          <span className="font-semibold text-gray-700">
                            Approve
                          </span>
                          : user stays verified.
                        </div>
                        <div>
                          <span className="font-semibold text-gray-700">
                            Deny
                          </span>
                          : forces selfie retake and locks them out.
                        </div>
                        <div>
                          <span className="font-semibold text-gray-700">
                            Ban
                          </span>
                          : sets status to lifetime ineligible + fraud ban.
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 mt-4">
                      <div className="text-sm font-semibold text-gray-900">
                        Current status
                      </div>
                      <div className="mt-2 text-sm text-gray-700">
                        verification_status:{" "}
                        <span className="font-semibold">
                          {String(selected.verification_status || "")}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-700">
                        is_verified:{" "}
                        <span className="font-semibold">
                          {selected.is_verified ? "true" : "false"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        (This queue only shows users with no manual review yet.)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
