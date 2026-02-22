"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import adminFetch from "@/utils/adminFetch";

function Field({ label, description, children }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold text-gray-900">{label}</div>
      {description ? (
        <div className="text-xs text-gray-500">{description}</div>
      ) : null}
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, min, max }) {
  return (
    <input
      type="number"
      value={String(value ?? "")}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
    />
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${
        checked ? "bg-[#FF1744]" : "bg-gray-300"
      }`}
    >
      <div
        className={`w-5 h-5 bg-white rounded-full transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function LikesThrottleAdminPage() {
  const queryClient = useQueryClient();

  const [error, setError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["admin", "likesThrottle", "settings"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/likes-throttle/settings");
      if (!res.ok) {
        throw new Error(
          `When fetching /api/admin/likes-throttle/settings, the response was [${res.status}] ${res.statusText}`,
        );
      }
      return res.json();
    },
  });

  const [draft, setDraft] = useState(null);

  useEffect(() => {
    const cfg = settingsQuery.data?.config;
    if (cfg && !draft) {
      setDraft(cfg);
    }
  }, [settingsQuery.data, draft]);

  const effective = settingsQuery.data?.effective || null;

  const saveMutation = useMutation({
    mutationFn: async (nextConfig) => {
      const res = await adminFetch("/api/admin/likes-throttle/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: nextConfig }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error || res.statusText;
        throw new Error(`Save failed: ${msg}`);
      }
      return res.json();
    },
    onSuccess: async () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "likesThrottle", "settings"],
      });
    },
    onError: (e) => {
      console.error(e);
      setError(e.message || "Could not save settings");
    },
  });

  const updateDraft = useCallback((key, value) => {
    setDraft((prev) => {
      const next = { ...(prev || {}) };
      next[key] = value;
      return next;
    });
  }, []);

  const toInt = useCallback((v, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  }, []);

  const onSave = useCallback(() => {
    setError(null);
    if (!draft) return;

    const nextConfig = {
      ...draft,
      maxSurfacedAtOnce: toInt(draft.maxSurfacedAtOnce, 1),
      maxSurfacedPer24h: toInt(draft.maxSurfacedPer24h, 3),
      promoteAfterHours: toInt(draft.promoteAfterHours, 48),
      lowActivityPromoteAfterHours: toInt(
        draft.lowActivityPromoteAfterHours,
        24,
      ),
      impressionCooldownHours: toInt(draft.impressionCooldownHours, 12),
      inboundBoostCount: toInt(draft.inboundBoostCount, 3),
      expireHiddenOnPass: Boolean(draft.expireHiddenOnPass),
      allowImmediateFirstSurface: Boolean(draft.allowImmediateFirstSurface),
    };

    saveMutation.mutate(nextConfig);
  }, [draft, saveMutation, toInt]);

  // --- debug lookup ---
  const [lookupUserId, setLookupUserId] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");

  const userQueryKey = useMemo(() => {
    return ["admin", "likesThrottle", "user", lookupUserId, lookupEmail];
  }, [lookupEmail, lookupUserId]);

  const userQuery = useQuery({
    queryKey: userQueryKey,
    enabled: false,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (lookupUserId.trim()) params.set("userId", lookupUserId.trim());
      if (lookupEmail.trim()) params.set("email", lookupEmail.trim());

      const res = await adminFetch(
        `/api/admin/likes-throttle/user?${params.toString()}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error || res.statusText;
        throw new Error(`Lookup failed: ${msg}`);
      }
      return res.json();
    },
  });

  const onLookup = useCallback(() => {
    setError(null);
    userQuery.refetch();
  }, [userQuery]);

  const loadingSettings = settingsQuery.isLoading || settingsQuery.isFetching;
  const saving = saveMutation.isPending;

  return (
    <AdminLayout currentPage="likes-throttle">
      <div className="p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Hidden Likes Throttle
            </h1>
            <div className="text-sm text-gray-600 mt-2 max-w-3xl">
              Controls how many inbound likes are visible at a time, when hidden
              likes are promoted, and how often inbound-likers can reappear in
              Discovery.
            </div>
          </div>

          <button
            onClick={onSave}
            disabled={saving || !draft}
            className={`px-4 py-2 rounded-lg font-semibold text-white ${
              saving || !draft
                ? "bg-gray-400"
                : "bg-[#FF1744] hover:bg-[#E01535]"
            }`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        ) : null}

        {saveSuccess ? (
          <div className="mt-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
            Saved.
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Settings */}
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Settings</h2>
              {loadingSettings ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : null}
            </div>

            <div className="mt-5 space-y-5">
              <Field
                label="Max surfaced at once"
                description="How many likes can be visible in the Likes inbox at the same time. Set to 0 to fully hide the inbox."
              >
                <NumberInput
                  value={draft?.maxSurfacedAtOnce ?? ""}
                  onChange={(v) => updateDraft("maxSurfacedAtOnce", v)}
                  min={0}
                  max={25}
                />
              </Field>

              <Field
                label="Max surfaced per 24h"
                description="Hard cap on how many new likes can be promoted into the inbox in a rolling 24 hour window."
              >
                <NumberInput
                  value={draft?.maxSurfacedPer24h ?? ""}
                  onChange={(v) => updateDraft("maxSurfacedPer24h", v)}
                  min={0}
                  max={100}
                />
              </Field>

              <Field
                label="Promote after (hours)"
                description="If a hidden like doesn't get matched naturally, it becomes eligible to surface after this many hours."
              >
                <NumberInput
                  value={draft?.promoteAfterHours ?? ""}
                  onChange={(v) => updateDraft("promoteAfterHours", v)}
                  min={0}
                  max={720}
                />
              </Field>

              <Field
                label="Low-activity promote after (hours)"
                description="If the receiver hasn't been active recently, promote sooner to avoid dead-end likes."
              >
                <NumberInput
                  value={draft?.lowActivityPromoteAfterHours ?? ""}
                  onChange={(v) =>
                    updateDraft("lowActivityPromoteAfterHours", v)
                  }
                  min={0}
                  max={720}
                />
              </Field>

              <Field
                label="Discovery re-show cooldown (hours)"
                description="Prevents the same inbound-liker from being shown too frequently in Discovery."
              >
                <NumberInput
                  value={draft?.impressionCooldownHours ?? ""}
                  onChange={(v) => updateDraft("impressionCooldownHours", v)}
                  min={0}
                  max={168}
                />
              </Field>

              <Field
                label="Inbound boost count"
                description="How many inbound-likers we try to place near the top of Discovery (still looks like normal feed)."
              >
                <NumberInput
                  value={draft?.inboundBoostCount ?? ""}
                  onChange={(v) => updateDraft("inboundBoostCount", v)}
                  min={0}
                  max={20}
                />
              </Field>

              <Field
                label="Allow immediate first surface"
                description="If a user currently has 0 surfaced likes, allow surfacing 1 hidden like immediately (ignores the promote-after delay). Helps brand-new users see something right away."
              >
                <Toggle
                  checked={Boolean(draft?.allowImmediateFirstSurface)}
                  onChange={(v) => updateDraft("allowImmediateFirstSurface", v)}
                />
              </Field>

              <Field
                label="Expire hidden like on pass"
                description="If the user passes someone in Discovery, any hidden inbound like from that person is expired. Recommended."
              >
                <Toggle
                  checked={Boolean(draft?.expireHiddenOnPass)}
                  onChange={(v) => updateDraft("expireHiddenOnPass", v)}
                />
              </Field>

              {effective ? (
                <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="text-sm font-semibold text-gray-900">
                    Effective config (after clamping)
                  </div>
                  <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap">
                    {JSON.stringify(effective, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>

          {/* Debug */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold text-gray-900">Debug a user</h2>
            <div className="text-sm text-gray-600 mt-2">
              Look up inbound likes backlog + what is scheduled to surface.
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">
                  User ID
                </div>
                <input
                  value={lookupUserId}
                  onChange={(e) => setLookupUserId(e.target.value)}
                  placeholder="123"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">
                  or Email
                </div>
                <input
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={onLookup}
                className="px-4 py-2 rounded-lg font-semibold text-white bg-gray-900 hover:bg-black"
              >
                Lookup
              </button>
              {userQuery.isFetching ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : null}
            </div>

            {userQuery.isError ? (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                {String(userQuery.error?.message || "Lookup failed")}
              </div>
            ) : null}

            {userQuery.data ? (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(userQuery.data?.counts || {}).map(
                    ([k, v]) => (
                      <div
                        key={k}
                        className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                      >
                        <div className="text-xs text-gray-600">{k}</div>
                        <div className="text-lg font-bold text-gray-900">
                          {String(v)}
                        </div>
                      </div>
                    ),
                  )}
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-sm font-semibold text-gray-900">
                    Promote timing
                  </div>
                  <div className="text-sm text-gray-700 mt-1">
                    lowActivity: {String(userQuery.data?.isLowActivity)}
                    <br />
                    promoteAfterHours:{" "}
                    {String(userQuery.data?.promoteAfterHours)}
                    <br />
                    immediateFirstSurfaceActive:{" "}
                    {String(userQuery.data?.allowImmediateFirstSurfaceActive)}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    Next hidden likes
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    (sorted by created_at desc)
                  </div>

                  <div className="mt-3 overflow-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100 text-gray-700">
                        <tr>
                          <th className="text-left px-3 py-2">from</th>
                          <th className="text-left px-3 py-2">age (h)</th>
                          <th className="text-left px-3 py-2">eligible</th>
                          <th className="text-left px-3 py-2">has comment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(userQuery.data?.nextHiddenLikes || []).map((row) => (
                          <tr
                            key={row.like_id}
                            className="border-t border-gray-200"
                          >
                            <td className="px-3 py-2">
                              <div className="font-semibold text-gray-900">
                                {row.display_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                id: {row.from_user_id}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.age_hours ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  row.eligible_now
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {row.eligible_now ? "yes" : "no"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.has_comment ? "yes" : "no"}
                            </td>
                          </tr>
                        ))}
                        {!(userQuery.data?.nextHiddenLikes || []).length ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-6 text-center text-gray-500"
                            >
                              No hidden likes.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                    Raw response
                  </summary>
                  <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap">
                    {JSON.stringify(userQuery.data, null, 2)}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
