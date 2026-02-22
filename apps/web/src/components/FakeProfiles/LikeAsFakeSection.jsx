import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, RefreshCcw } from "lucide-react";
import adminFetch from "@/utils/adminFetch";

function formatUserLabel(row) {
  const name = String(row?.display_name || "").trim();
  const email = String(row?.email || "").trim();
  if (name && email) return `${name} (${email})`;
  return name || email || `User ${row?.id}`;
}

export default function LikeAsFakeSection({ fakeUserId }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // NOTE: We no longer seed an automatic first message when creating a match.
  // This keeps "Matches" truly message-free until a user sends the first message.
  const [forceMatch, setForceMatch] = useState(false);
  const [uiError, setUiError] = useState(null);
  const [uiSuccess, setUiSuccess] = useState(null);

  const candidatesQuery = useQuery({
    queryKey: ["admin", "fakeProfiles", "likeCandidates", fakeUserId, search],
    // Previously this required 2+ chars; that made it feel "broken".
    // We now allow empty search and just return a small, safe default list.
    enabled: Boolean(fakeUserId),
    queryFn: async () => {
      const trimmed = search.trim();
      const qs = new URLSearchParams({
        ...(trimmed ? { search: trimmed } : {}),
      });
      const response = await adminFetch(
        `/api/admin/fake-profiles/${fakeUserId}/like-candidates?${qs}`,
      );
      if (!response.ok) {
        throw new Error(
          `When fetching /api/admin/fake-profiles/${fakeUserId}/like-candidates, the response was [${response.status}] ${response.statusText}`,
        );
      }
      const data = await response.json();
      return data.users || [];
    },
  });

  const matchMutation = useMutation({
    mutationFn: async ({ toUserId }) => {
      setUiError(null);
      setUiSuccess(null);

      const response = await adminFetch("/api/admin/matches/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdA: fakeUserId,
          userIdB: toUserId,
          // IMPORTANT: do NOT seed a first message on manual match creation.
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `When posting /api/admin/matches/manual, the response was [${response.status}] ${response.statusText}. ${text}`,
        );
      }

      return response.json();
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles", "likeCandidates", fakeUserId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles", "likes", fakeUserId],
      });

      const matchId = data?.matchId;
      setUiSuccess(
        `Match created${matchId ? ` (match_id: ${matchId})` : ""}. This will show under Matches (no messages yet).`,
      );
    },
    onError: (e) => {
      console.error(e);
      setUiError(e?.message || "Could not create match");
    },
  });

  const likeMutation = useMutation({
    mutationFn: async ({ toUserId }) => {
      setUiError(null);
      setUiSuccess(null);

      const response = await adminFetch(
        `/api/admin/fake-profiles/${fakeUserId}/like`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toUserId,
            forceMatch,
            // IMPORTANT: do NOT seed a first message when a like creates a match.
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `When posting /api/admin/fake-profiles/${fakeUserId}/like, the response was [${response.status}] ${response.statusText}. ${text}`,
        );
      }

      return response.json();
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles", "likeCandidates", fakeUserId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles", "likes", fakeUserId],
      });

      const isMatch = Boolean(data?.isMatch);
      const forced = Boolean(data?.forced);
      const hasMutualLike = Boolean(data?.hasMutualLike);

      if (isMatch) {
        const suffix = forced ? " (forced)" : hasMutualLike ? "" : "";
        setUiSuccess(
          `Match created${suffix}. This will show under Matches (no messages yet).`,
        );
        return;
      }

      setUiSuccess("Like sent. This should show in the user’s Likes tab.");
    },
    onError: (e) => {
      console.error(e);
      setUiError(e?.message || "Could not like profile");
    },
  });

  const candidates = candidatesQuery.data || [];

  const hint = useMemo(() => {
    const trimmed = search.trim();
    if (candidatesQuery.isLoading) return "Loading…";
    if (!trimmed) {
      if (candidates.length === 0) {
        return "No users found yet. If you only signed up via Auth and didn’t complete onboarding, you may not exist in the in-app users table.";
      }
      return "Showing recent users. Type to filter by name, email, or ID.";
    }
    if (candidatesQuery.isFetching) return "Searching…";
    if (candidates.length === 0) return "No results.";
    return null;
  }, [
    search,
    candidates.length,
    candidatesQuery.isLoading,
    candidatesQuery.isFetching,
  ]);

  if (!fakeUserId) {
    return (
      <div className="mt-8 border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Like as fake profile
        </h3>
        <p className="text-sm text-gray-600 mt-2">
          Save this fake profile first, then you can like real users on its
          behalf.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Like a user (as this fake profile)
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Clear rule: a <span className="font-semibold">Like</span> shows in
            the user’s <span className="font-semibold">Likes</span> tab. A{" "}
            <span className="font-semibold">Match</span> shows in{" "}
            <span className="font-semibold">Messages</span> → Matches.
            <span className="font-semibold"> No auto message is sent.</span>
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
              Sends like → Likes tab
            </span>
            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-800">
              Creates match → Matches (no messages)
            </span>
          </div>
        </div>

        <button
          onClick={() => candidatesQuery.refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          disabled={candidatesQuery.isFetching}
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-900">Search</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Search by name, email, or user ID"
          />
          {hint ? (
            <div className="mt-2 text-xs text-gray-500">{hint}</div>
          ) : null}
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-900">Match testing</div>
          <div className="text-xs text-gray-500 mt-1">
            If enabled, we’ll create a match even if the user hasn’t liked the
            fake profile yet.
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-gray-700 select-none">
            <input
              type="checkbox"
              checked={forceMatch}
              onChange={(e) => setForceMatch(e.target.checked)}
              className="h-4 w-4"
            />
            Force match (testing only)
          </label>
        </div>
      </div>

      {uiError ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-900 text-sm p-3 rounded-lg">
          {uiError}
        </div>
      ) : null}

      {uiSuccess ? (
        <div className="mt-4 bg-green-50 border border-green-200 text-green-900 text-sm p-3 rounded-lg">
          {uiSuccess}
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="mt-4 space-y-2">
          {candidates.map((u) => {
            const label = formatUserLabel(u);
            const likedByFake = Boolean(u?.liked_by_fake);
            const alreadyMatched = Boolean(u?.match_id);
            const likedFakeByUser = Boolean(u?.liked_fake_by_user);
            const passedFakeByUser = Boolean(u?.passed_fake_by_user);

            const willCreateMatchFromLike =
              !alreadyMatched && (forceMatch || likedFakeByUser);

            const outcomePill = alreadyMatched
              ? {
                  text: "Already a match → Messages",
                  className: "border-gray-200 bg-gray-50 text-gray-700",
                }
              : willCreateMatchFromLike
                ? {
                    text: "Like will create match → Messages",
                    className: "border-indigo-200 bg-indigo-50 text-indigo-800",
                  }
                : {
                    text: "Like sends → Likes tab",
                    className:
                      "border-emerald-200 bg-emerald-50 text-emerald-800",
                  };

            let statusText = null;
            if (alreadyMatched) statusText = "Matched";
            else if (likedByFake) statusText = "Liked";

            const extraHints = [];
            if (passedFakeByUser) {
              extraHints.push("User previously passed this fake.");
            }
            if (likedFakeByUser && !alreadyMatched)
              extraHints.push("They already liked this fake.");

            const likeDisabled =
              likeMutation.isPending || matchMutation.isPending;
            const matchDisabled =
              alreadyMatched ||
              matchMutation.isPending ||
              likeMutation.isPending;

            const likeButtonLabel = likedByFake ? "Bump like" : "Send like";

            return (
              <div
                key={u.id}
                className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {label}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {u?.age ? `Age ${u.age}` : ""}
                    {u?.gender ? `${u?.age ? " • " : ""}${u.gender}` : ""}
                    {statusText ? ` • ${statusText}` : ""}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${outcomePill.className}`}
                    >
                      {outcomePill.text}
                    </span>
                    {extraHints.length > 0 ? (
                      <span className="text-[11px] text-amber-700">
                        {extraHints.join(" ")}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <button
                    disabled={matchDisabled}
                    onClick={() => matchMutation.mutate({ toUserId: u.id })}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    title={
                      alreadyMatched
                        ? "Already matched (check Messages)"
                        : "Create a match right now (shows in Messages)"
                    }
                  >
                    Create match
                  </button>

                  <button
                    disabled={likeDisabled}
                    onClick={() => likeMutation.mutate({ toUserId: u.id })}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-[#FF1744] text-white hover:bg-[#D50032] disabled:opacity-50"
                    title={
                      likedByFake
                        ? "Bump this like to the top (updates timestamp)"
                        : "Send a like (shows in Likes tab)"
                    }
                  >
                    <Heart size={16} />
                    {likeButtonLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
