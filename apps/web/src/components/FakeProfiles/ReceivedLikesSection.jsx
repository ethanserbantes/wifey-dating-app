import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartHandshake, MessageCircle, RefreshCcw } from "lucide-react";
import adminFetch from "@/utils/adminFetch";

function formatTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function ReceivedLikesSection({ fakeUserId }) {
  const queryClient = useQueryClient();
  const [seedMessageText, setSeedMessageText] = useState("Hey! 👋");
  const [uiError, setUiError] = useState(null);

  const likesQuery = useQuery({
    queryKey: ["admin", "fakeProfiles", "likes", fakeUserId],
    enabled: Boolean(fakeUserId),
    refetchOnWindowFocus: true,
    refetchInterval: fakeUserId ? 10000 : false,
    queryFn: async () => {
      const response = await adminFetch(
        `/api/admin/fake-profiles/${fakeUserId}/likes`,
      );
      if (!response.ok) {
        throw new Error(
          `When fetching /api/admin/fake-profiles/${fakeUserId}/likes, the response was [${response.status}] ${response.statusText}`,
        );
      }
      const data = await response.json();
      return data.likes || [];
    },
  });

  const matchMutation = useMutation({
    mutationFn: async ({ fromUserId }) => {
      setUiError(null);
      const response = await adminFetch("/api/admin/matches/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdA: fromUserId,
          userIdB: fakeUserId,
          seedSenderId: fakeUserId,
          seedMessageText,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `When posting /api/admin/matches/manual, the response was [${response.status}] ${response.statusText}`,
        );
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles", "likes", fakeUserId],
      });
    },
    onError: (e) => {
      console.error(e);
      setUiError(e?.message || "Could not create match");
    },
  });

  const likes = likesQuery.data || [];

  const likesCountText = useMemo(() => {
    const count = likes.length;
    if (count === 0) return "No likes yet";
    if (count === 1) return "1 like";
    return `${count} likes`;
  }, [likes.length]);

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Received likes
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            When a real user likes this fake profile, it will show up here. You
            can manually create a match and seed the first chat message.
          </p>
        </div>

        <button
          onClick={() => likesQuery.refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>

      <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="text-sm font-medium text-gray-900">Seed message</div>
        <div className="text-xs text-gray-500 mt-1">
          This gets sent from the fake profile when you click “Match + send”.
          (Only sends if the chat is empty.)
        </div>
        <input
          value={seedMessageText}
          onChange={(e) => setSeedMessageText(e.target.value)}
          className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="Hey! 👋"
          maxLength={2000}
        />
      </div>

      {uiError ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-900 text-sm p-3 rounded-lg">
          {uiError}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-700">{likesCountText}</div>
        {likesQuery.isLoading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : null}
      </div>

      {likesQuery.isError ? (
        <div className="mt-3 text-sm text-red-700">Could not load likes.</div>
      ) : null}

      {likes.length === 0 ? (
        <div className="mt-3 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg p-4">
          No one has liked this fake profile yet.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {likes.map((like) => {
            const fromName =
              String(like?.from_display_name || "").trim() ||
              String(like?.from_email || "").trim() ||
              `User ${like?.from_user_id}`;

            const alreadyMatched = Boolean(like?.match_id);
            const comment = String(like?.comment_text || "").trim();
            const when = formatTime(like?.created_at);

            return (
              <div
                key={like.id}
                className="bg-white border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {fromName}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {when}
                      {like?.section_type ? ` • ${like.section_type}` : ""}
                    </div>
                    {comment ? (
                      <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">
                        “{comment}”
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {alreadyMatched ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                        <MessageCircle size={14} />
                        Matched
                      </span>
                    ) : null}

                    <button
                      disabled={alreadyMatched || matchMutation.isPending}
                      onClick={() =>
                        matchMutation.mutate({ fromUserId: like.from_user_id })
                      }
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-[#FF1744] text-white hover:bg-[#D50032] disabled:opacity-50"
                      title="Create match and seed the first message"
                    >
                      <HeartHandshake size={16} />
                      Match + send
                    </button>
                  </div>
                </div>

                {alreadyMatched ? (
                  <div className="mt-2 text-xs text-gray-500">
                    match_id: {like.match_id}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
