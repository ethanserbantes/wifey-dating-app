import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, CalendarDays, Clock } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIMES = ["Daytime", "Evening", "Late", "Flexible"];

function formatWhen(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

function uniq(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const v of arr) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function Chip({ label, active, onClick }) {
  const className = active
    ? "bg-[#FF1744] text-white border-[#FF1744]"
    : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${className}`}
    >
      {label}
    </button>
  );
}

export default function ChatAndAvailabilitySection({ fakeUserId }) {
  const queryClient = useQueryClient();
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [uiError, setUiError] = useState(null);
  const [uiSuccess, setUiSuccess] = useState(null);

  // NEW: simulate pre-chat -> active-chat consent for testing
  const [consentTierFake, setConsentTierFake] = useState("");
  const [consentTierOther, setConsentTierOther] = useState("");

  const matchesQuery = useQuery({
    queryKey: ["admin", "fakeProfiles", "chats", fakeUserId],
    enabled: Boolean(fakeUserId),
    queryFn: async () => {
      const resp = await fetch(`/api/admin/users/${fakeUserId}/chats`);
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `When fetching /api/admin/users/${fakeUserId}/chats, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }
      const json = await resp.json();
      return Array.isArray(json?.matches) ? json.matches : [];
    },
  });

  const matches = matchesQuery.data || [];

  const selectedMatch = useMemo(() => {
    if (!selectedMatchId) return null;
    const found = matches.find((m) => m.matchId === selectedMatchId);
    return found || null;
  }, [matches, selectedMatchId]);

  // NEW: prefill tiers from admin overrides (best-effort)
  const overrideTierQuery = useQuery({
    queryKey: [
      "admin",
      "match",
      "activateChat",
      "overrideTiers",
      selectedMatchId,
      fakeUserId,
      selectedMatch?.otherUser?.id,
    ],
    enabled:
      Boolean(selectedMatchId) &&
      Boolean(fakeUserId) &&
      Boolean(selectedMatch?.otherUser?.id),
    queryFn: async () => {
      const fakeId = Number(fakeUserId);
      const otherId = Number(selectedMatch?.otherUser?.id);
      const out = { fake: null, other: null };

      const fetchTier = async (userId) => {
        const resp = await fetch(
          `/api/subscription/override?userId=${encodeURIComponent(String(userId))}`,
        );
        if (!resp.ok) return null;
        const json = await resp.json().catch(() => ({}));
        const t = String(json?.override?.tier || "")
          .toLowerCase()
          .trim();
        return t === "serious" || t === "committed" ? t : null;
      };

      out.fake = Number.isFinite(fakeId) ? await fetchTier(fakeId) : null;
      out.other = Number.isFinite(otherId) ? await fetchTier(otherId) : null;
      return out;
    },
  });

  useEffect(() => {
    const fake = overrideTierQuery.data?.fake;
    const other = overrideTierQuery.data?.other;

    // only auto-fill if the admin hasn't picked a tier manually yet
    if (!consentTierFake && (fake === "serious" || fake === "committed")) {
      setConsentTierFake(fake);
    }
    if (!consentTierOther && (other === "serious" || other === "committed")) {
      setConsentTierOther(other);
    }
  }, [
    consentTierFake,
    consentTierOther,
    overrideTierQuery.data?.fake,
    overrideTierQuery.data?.other,
  ]);

  const messagesQuery = useQuery({
    queryKey: ["admin", "matches", "messages", selectedMatchId],
    enabled: Boolean(selectedMatchId),
    queryFn: async () => {
      const resp = await fetch(
        `/api/admin/matches/${selectedMatchId}/messages`,
      );
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `When fetching /api/admin/matches/${selectedMatchId}/messages, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }
      const json = await resp.json();
      return Array.isArray(json?.messages) ? json.messages : [];
    },
  });

  const availabilityQuery = useQuery({
    queryKey: ["admin", "matches", "availability", selectedMatchId, fakeUserId],
    enabled: Boolean(selectedMatchId) && Boolean(fakeUserId),
    queryFn: async () => {
      const qs = new URLSearchParams({ userId: String(fakeUserId) });
      const resp = await fetch(
        `/api/admin/matches/${selectedMatchId}/availability?${qs}`,
      );
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `When fetching /api/admin/matches/${selectedMatchId}/availability, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }
      return resp.json();
    },
  });

  const availability = availabilityQuery.data?.availability || null;
  const otherAvailability = availabilityQuery.data?.otherAvailability || null;
  const overlapSummary = availabilityQuery.data?.overlap?.summary || null;

  const seededDays = useMemo(() => {
    const next = uniq(availability?.days);
    return next;
  }, [availability?.days]);

  const seededTimes = useMemo(() => {
    const next = uniq(availability?.times);
    return next;
  }, [availability?.times]);

  const [draftDays, setDraftDays] = useState([]);
  const [draftTimes, setDraftTimes] = useState([]);

  // Keep local state in sync when switching matches
  const hydratedKey = useMemo(() => {
    return `${selectedMatchId || ""}:${(seededDays || []).join(",")}:${(seededTimes || []).join(",")}`;
  }, [selectedMatchId, seededDays, seededTimes]);

  useEffect(() => {
    setDraftDays(seededDays);
    setDraftTimes(seededTimes);
  }, [hydratedKey, seededDays, seededTimes]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      setUiError(null);
      setUiSuccess(null);

      const trimmed = String(messageText || "").trim();
      if (!trimmed) {
        throw new Error("Type a message first");
      }

      const resp = await fetch(
        `/api/admin/matches/${selectedMatchId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: Number(fakeUserId),
            messageText: trimmed,
          }),
        },
      );

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `When posting /api/admin/matches/${selectedMatchId}/messages, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }

      return resp.json();
    },
    onSuccess: async () => {
      setMessageText("");
      setUiSuccess("Sent");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "matches", "messages", selectedMatchId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles", "chats", fakeUserId],
      });
      setTimeout(() => setUiSuccess(null), 1200);
    },
    onError: (e) => {
      console.error(e);
      setUiError(e?.message || "Could not send");
    },
  });

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      setUiError(null);
      setUiSuccess(null);

      const resp = await fetch(
        `/api/admin/matches/${selectedMatchId}/availability`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: Number(fakeUserId),
            days: draftDays,
            times: draftTimes,
            tag: null,
          }),
        },
      );

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `When posting /api/admin/matches/${selectedMatchId}/availability, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }

      return resp.json();
    },
    onSuccess: async () => {
      setUiSuccess("Availability saved");
      await queryClient.invalidateQueries({
        queryKey: [
          "admin",
          "matches",
          "availability",
          selectedMatchId,
          fakeUserId,
        ],
      });
      setTimeout(() => setUiSuccess(null), 1200);
    },
    onError: (e) => {
      console.error(e);
      setUiError(e?.message || "Could not save availability");
    },
  });

  const simulateNextDayRatingMutation = useMutation({
    mutationFn: async () => {
      setUiError(null);
      setUiSuccess(null);

      if (!selectedMatchId) {
        throw new Error("Select a match first");
      }

      const resp = await fetch(
        `/api/admin/matches/${selectedMatchId}/date-feedback/simulate-next-day`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hoursAgo: 13, resetExisting: true }),
        },
      );

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `When posting /api/admin/matches/${selectedMatchId}/date-feedback/simulate-next-day, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }

      return resp.json();
    },
    onSuccess: async () => {
      setUiSuccess("Simulated next-day rating prompt");
      // This will help keep the chat list + transcript fresh in case other tooling depends on it.
      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles", "chats", fakeUserId],
      });
      setTimeout(() => setUiSuccess(null), 1500);
    },
    onError: (e) => {
      console.error(e);
      setUiError(e?.message || "Could not simulate next-day prompt");
    },
  });

  const activateChatMutation = useMutation({
    mutationFn: async () => {
      setUiError(null);
      setUiSuccess(null);

      if (!selectedMatchId) {
        throw new Error("Select a match first");
      }

      const otherIdRaw = selectedMatch?.otherUser?.id;
      const otherUserId = Number(otherIdRaw);
      const fakeUserIdNum = Number(fakeUserId);

      if (!Number.isFinite(otherUserId) || !Number.isFinite(fakeUserIdNum)) {
        throw new Error("Could not determine both user IDs for this match");
      }

      // Admin force-activate: this bypasses active-chat limits so you can test flows.
      const resp = await fetch(
        `/api/admin/matches/${selectedMatchId}/activate-chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fakeUserId: fakeUserIdNum,
            otherUserId,
            fakeTier: consentTierFake || undefined,
            otherTier: consentTierOther || undefined,
            force: true,
          }),
        },
      );

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `When posting /api/admin/matches/${selectedMatchId}/activate-chat, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }

      return resp.json();
    },
    onSuccess: async (data) => {
      const activeNow = Boolean(data?.status?.isActive);
      if (activeNow) {
        setUiSuccess("Active chat started (admin forced activation). ");
      } else {
        setUiSuccess("Activation saved, but it does not look active yet.");
      }

      await queryClient.invalidateQueries({
        queryKey: ["admin", "fakeProfiles", "chats", fakeUserId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "matches", "messages", selectedMatchId],
      });

      setTimeout(() => setUiSuccess(null), 1500);
    },
    onError: (e) => {
      console.error(e);
      setUiError(e?.message || "Could not activate chat");
    },
  });

  const openMatch = useCallback((matchId) => {
    setSelectedMatchId(matchId);
    setUiError(null);
    setUiSuccess(null);
    setMessageText("");
  }, []);

  const matchRows = useMemo(() => {
    return matches.map((m) => {
      const who =
        m.otherUser?.displayName || m.otherUser?.email || "Unknown user";
      const lastLine = m.lastMessage
        ? String(m.lastMessage)
        : "(no messages yet)";
      const lastWhen = m.lastMessageAt ? formatWhen(m.lastMessageAt) : "";
      const meta = lastWhen ? `${who} • ${lastWhen}` : who;

      return {
        matchId: m.matchId,
        who,
        meta,
        lastLine,
        photoUrl: m.otherUser?.photoUrl || null,
      };
    });
  }, [matches]);

  const bubbles = useMemo(() => {
    const msgs = messagesQuery.data || [];
    return msgs.map((m) => {
      const sender =
        m.sender_display_name || m.sender_email || `User ${m.sender_id}`;
      const when = formatWhen(m.created_at);
      const text = String(m.message_text || "");
      const mine = Number(m.sender_id) === Number(fakeUserId);
      const id = m.id;

      return { id, sender, when, text, mine };
    });
  }, [messagesQuery.data, fakeUserId]);

  const canSend = Boolean(selectedMatchId) && !sendMutation.isPending;
  const canSaveAvailability =
    Boolean(selectedMatchId) && !saveAvailabilityMutation.isPending;
  const canSimulateNextDay =
    Boolean(selectedMatchId) && !simulateNextDayRatingMutation.isPending;
  const canActivateChat =
    Boolean(selectedMatchId) && !activateChatMutation.isPending;

  if (!fakeUserId) {
    return (
      <div className="mt-8 border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Chat + availability (as fake profile)
        </h3>
        <p className="text-sm text-gray-600 mt-2">
          Save this fake profile first, then you can message its matches and set
          availability.
        </p>
      </div>
    );
  }

  const matchesLoadingLine = matchesQuery.isLoading ? "Loading…" : null;
  const matchesEmptyLine =
    !matchesQuery.isLoading && matchRows.length === 0
      ? "No matches yet. Use “Like as fake” above to create one."
      : null;

  const transcriptTitle = selectedMatch
    ? `Chat with ${selectedMatch.otherUser?.displayName || selectedMatch.otherUser?.email || "Match"}`
    : "Transcript";

  const overlapLine = overlapSummary ? `Overlap: ${overlapSummary}` : null;

  const otherDays = uniq(otherAvailability?.days);
  const otherTimes = uniq(otherAvailability?.times);

  const otherLineParts = [];
  if (otherDays.length > 0) otherLineParts.push(`Days: ${otherDays.join(" ")}`);
  if (otherTimes.length > 0)
    otherLineParts.push(`Times: ${otherTimes.join(" / ")}`);
  const otherLine =
    otherLineParts.length > 0 ? otherLineParts.join(" • ") : null;

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquare size={18} />
            Chat + availability (as fake profile)
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Send multiple messages from this fake profile, and set its date
            availability for a given match.
          </p>
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

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">Matches</div>
            <div className="text-xs text-gray-500">
              Pick a match to message and set availability
            </div>
          </div>

          {matchesLoadingLine ? (
            <div className="p-4 text-sm text-gray-600">
              {matchesLoadingLine}
            </div>
          ) : null}

          {matchesEmptyLine ? (
            <div className="p-4 text-sm text-gray-600">{matchesEmptyLine}</div>
          ) : null}

          {matchRows.length > 0 ? (
            <div className="max-h-[420px] overflow-y-auto">
              {matchRows.map((r) => {
                const isActive = r.matchId === selectedMatchId;
                const rowBg = isActive
                  ? "bg-[#FF1744] bg-opacity-5"
                  : "bg-white";
                const subLine =
                  r.lastLine.length > 120
                    ? `${r.lastLine.slice(0, 120)}…`
                    : r.lastLine;

                return (
                  <button
                    key={r.matchId}
                    type="button"
                    onClick={() => openMatch(r.matchId)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${rowBg}`}
                  >
                    <div className="flex items-center gap-3">
                      {r.photoUrl ? (
                        <img
                          src={r.photoUrl}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gray-200 border border-gray-200" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {r.meta}
                        </div>
                        <div className="text-xs text-gray-600 truncate">
                          {subLine}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">
              {transcriptTitle}
            </div>
            <div className="text-xs text-gray-500">
              {selectedMatchId
                ? `Match ID: ${selectedMatchId}`
                : "Select a match"}
            </div>

            {selectedMatchId ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => activateChatMutation.mutate()}
                  disabled={!canActivateChat}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                  title="Forces both users to consent and sets the chat to active (admin testing tool)."
                >
                  Activate chat (force)
                </button>

                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <span>Fake tier</span>
                  <select
                    value={consentTierFake}
                    onChange={(e) => setConsentTierFake(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 bg-white"
                  >
                    <option value="">unknown/default</option>
                    <option value="serious">serious (1)</option>
                    <option value="committed">committed (3)</option>
                  </select>

                  <span>Other tier</span>
                  <select
                    value={consentTierOther}
                    onChange={(e) => setConsentTierOther(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 bg-white"
                  >
                    <option value="">unknown/default</option>
                    <option value="serious">serious (1)</option>
                    <option value="committed">committed (3)</option>
                  </select>

                  {overrideTierQuery.isLoading ? (
                    <span className="text-[10px] text-gray-400">
                      checking overrides…
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {selectedMatchId ? (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => simulateNextDayRatingMutation.mutate()}
                  disabled={!canSimulateNextDay}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                  title="Forces date_start into the past so both users see the next-day rating prompt on mobile"
                >
                  <Clock size={14} />
                  Simulate next-day rating prompt
                </button>
                <div className="text-[11px] text-gray-500">
                  Shows on mobile Home within ~30 seconds (may require app
                  relaunch)
                </div>
              </div>
            ) : null}
          </div>

          {messagesQuery.isLoading ? (
            <div className="p-4 text-sm text-gray-600">Loading messages…</div>
          ) : !selectedMatchId ? (
            <div className="p-4 text-sm text-gray-600">
              Pick a match on the left.
            </div>
          ) : bubbles.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">No messages yet.</div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto p-4 space-y-2">
              {bubbles.map((m) => {
                const bubbleBg = m.mine
                  ? "bg-[#FF1744] text-white border-[#FF1744]"
                  : "bg-gray-50 text-gray-900 border-gray-200";
                const senderLine = `${m.sender} • ${m.when}`;

                return (
                  <div
                    key={m.id}
                    className={`border rounded-lg p-3 ${bubbleBg}`}
                  >
                    <div className="text-[11px] font-semibold opacity-90">
                      {senderLine}
                    </div>
                    <div className="mt-2 text-sm whitespace-pre-wrap">
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type a message as this fake profile…"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={!selectedMatchId}
                maxLength={2000}
              />
              <button
                type="button"
                onClick={() => sendMutation.mutate()}
                disabled={!canSend}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-[#111] text-white hover:bg-black disabled:opacity-50"
              >
                <Send size={16} />
                Send
              </button>
            </div>

            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <CalendarDays size={16} />
                Availability (fake profile)
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Pick up to 3 days. These show up in the Date flow.
              </div>

              {overlapLine ? (
                <div className="mt-2 text-xs text-gray-700">{overlapLine}</div>
              ) : null}

              {otherLine ? (
                <div className="mt-1 text-xs text-gray-500">
                  Other user: {otherLine}
                </div>
              ) : null}

              <div className="mt-3">
                <div className="text-xs font-semibold text-gray-700">Days</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const active = draftDays.includes(d);
                    const onClick = () => {
                      setDraftDays((prev) => {
                        const has = prev.includes(d);
                        if (has) return prev.filter((x) => x !== d);
                        if (prev.length >= 3) return prev;
                        return [...prev, d];
                      });
                    };

                    return (
                      <Chip
                        key={d}
                        label={d}
                        active={active}
                        onClick={onClick}
                      />
                    );
                  })}
                </div>
                {draftDays.length >= 3 ? (
                  <div className="mt-2 text-[11px] text-gray-500">
                    Max 3 days (to match the app)
                  </div>
                ) : null}
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-gray-700">
                  Times (optional)
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TIMES.map((t) => {
                    const active = draftTimes.includes(t);
                    const onClick = () => {
                      setDraftTimes((prev) => {
                        const has = prev.includes(t);
                        if (has) return prev.filter((x) => x !== t);
                        return [...prev, t];
                      });
                    };

                    return (
                      <Chip
                        key={t}
                        label={t}
                        active={active}
                        onClick={onClick}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => saveAvailabilityMutation.mutate()}
                  disabled={!canSaveAvailability}
                  className="px-4 py-2 rounded-lg bg-[#FF1744] text-white text-sm font-semibold hover:bg-[#D50032] disabled:opacity-50"
                >
                  Save availability
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Tip: this is meant for testing + running fake profiles. If you want, I
        can add a “Send as other user” toggle too.
      </div>
    </div>
  );
}
