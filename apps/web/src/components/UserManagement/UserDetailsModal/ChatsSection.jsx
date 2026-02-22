import { useEffect, useMemo, useState } from "react";

function formatWhen(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

function shortPushSummary(label, pushRes) {
  if (!pushRes) return `${label}: (no push info)`;
  if (pushRes.skipped) return `${label}: skipped (prefs)`;
  if (pushRes.ok) return `${label}: sent`;
  return `${label}: failed (${pushRes.error || "error"})`;
}

export default function ChatsSection({ userId }) {
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState(null);

  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);

  // NEW: dev testing helpers (Drink on Us)
  const [devBusy, setDevBusy] = useState(false);
  const [devNote, setDevNote] = useState(null);

  // NEW: show current drink status so it's obvious why the phone is/ isn't showing the unlock flow
  const [drinkStatus, setDrinkStatus] = useState(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const load = async () => {
      try {
        setMatchesLoading(true);
        setMatchesError(null);
        setSelectedMatchId(null);
        setMessages([]);
        setMessagesError(null);

        const response = await fetch(`/api/admin/users/${userId}/chats`);
        if (!response.ok) {
          throw new Error(
            `When fetching /api/admin/users/${userId}/chats, the response was [${response.status}] ${response.statusText}`,
          );
        }

        const json = await response.json();
        if (cancelled) return;

        const nextMatches = Array.isArray(json?.matches) ? json.matches : [];
        setMatches(nextMatches);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setMatchesError("Could not load chats.");
        }
      } finally {
        if (!cancelled) {
          setMatchesLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const selectedMatch = useMemo(() => {
    if (!selectedMatchId) return null;
    return matches.find((m) => m.matchId === selectedMatchId) || null;
  }, [matches, selectedMatchId]);

  const rows = useMemo(() => {
    return matches.map((m) => {
      const who = m.otherUser?.displayName || m.otherUser?.email || "Unknown";
      const lastWhen = m.lastMessageAt ? formatWhen(m.lastMessageAt) : "";
      const lastLine = m.lastMessage
        ? String(m.lastMessage)
        : "(no messages yet)";
      const label = lastWhen ? `${who} • ${lastWhen}` : who;
      const sublabel =
        lastLine.length > 120 ? `${lastLine.slice(0, 120)}…` : lastLine;

      return {
        matchId: m.matchId,
        label,
        sublabel,
        photoUrl: m.otherUser?.photoUrl || null,
      };
    });
  }, [matches]);

  const openMatch = async (matchId) => {
    try {
      setSelectedMatchId(matchId);
      setMessages([]);
      setMessagesError(null);
      setMessagesLoading(true);
      setDevNote(null);
      setDrinkStatus(null);

      const response = await fetch(`/api/admin/matches/${matchId}/messages`);
      if (!response.ok) {
        throw new Error(
          `When fetching /api/admin/matches/${matchId}/messages, the response was [${response.status}] ${response.statusText}`,
        );
      }

      const json = await response.json();
      const next = Array.isArray(json?.messages) ? json.messages : [];
      setMessages(next);

      // NEW: also load drink status (best-effort)
      try {
        const ds = await fetch(
          `/api/admin/matches/${matchId}/drink-perk/status`,
        );
        if (ds.ok) {
          const dsJson = await ds.json();
          setDrinkStatus(dsJson);
        }
      } catch (e) {
        console.error(e);
      }
    } catch (e) {
      console.error(e);
      setMessagesError("Could not load messages.");
    } finally {
      setMessagesLoading(false);
    }
  };

  const simulateDrinkReady = async () => {
    try {
      if (!selectedMatchId) return;
      setDevBusy(true);
      setDevNote(null);

      const resp = await fetch(
        `/api/admin/matches/${selectedMatchId}/drink-perk/simulate-ready`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sendPush: true,
            addSystemMessage: true,
            forceSystemMessage: true, // NEW: always create a fresh unread message + badge for dev
          }),
        },
      );

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `When posting /api/admin/matches/${selectedMatchId}/drink-perk/simulate-ready, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }

      const json = await resp.json();
      const state = String(json?.state || "READY");

      const p1 = json?.push?.user1;
      const p2 = json?.push?.user2;

      const noteParts = [];
      noteParts.push(`✅ Drink perk is now ${state}.`);

      if (json?.alreadyReady) {
        noteParts.push("(It was already READY before this click.)");
      }

      if (json?.systemMessageInserted) {
        noteParts.push(
          "Added a system message (so Messages tab shows a badge). ",
        );
      }

      if (json?.sendPush) {
        noteParts.push(shortPushSummary("User1 push", p1));
        noteParts.push(shortPushSummary("User2 push", p2));
      } else {
        noteParts.push("Push: off");
      }

      setDevNote(noteParts.join(" "));

      // NEW: refresh drink status panel
      try {
        const ds = await fetch(
          `/api/admin/matches/${selectedMatchId}/drink-perk/status`,
        );
        if (ds.ok) {
          setDrinkStatus(await ds.json());
        }
      } catch (e) {
        console.error(e);
      }
    } catch (e) {
      console.error(e);
      setDevNote(
        e?.message ||
          "Could not simulate drink-ready. Make sure a date is planned for this match.",
      );
    } finally {
      setDevBusy(false);
    }
  };

  // NEW: complete the handshake (simulate the second phone) and mint the credit
  const simulateDrinkComplete = async () => {
    try {
      if (!selectedMatchId) return;
      setDevBusy(true);
      setDevNote(null);

      const resp = await fetch(
        `/api/admin/matches/${selectedMatchId}/drink-perk/simulate-complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `When posting /api/admin/matches/${selectedMatchId}/drink-perk/simulate-complete, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }

      const json = await resp.json();
      const tokenPreview = String(json?.credit?.token || "").slice(0, 10);
      setDevNote(
        `✅ Handshake completed. Credit issued (${tokenPreview}…). The phone that's waiting should flip to Unlocked in ~1 second.`,
      );

      // NEW: refresh drink status panel
      try {
        const ds = await fetch(
          `/api/admin/matches/${selectedMatchId}/drink-perk/status`,
        );
        if (ds.ok) {
          setDrinkStatus(await ds.json());
        }
      } catch (e) {
        console.error(e);
      }
    } catch (e) {
      console.error(e);
      setDevNote(
        e?.message ||
          "Could not complete handshake. Make sure a phone has tapped 'Tap to start' first.",
      );
    } finally {
      setDevBusy(false);
    }
  };

  // NEW: reset action so you can re-test on the same match
  const resetDrinkPerk = async () => {
    try {
      if (!selectedMatchId) return;
      setDevBusy(true);
      setDevNote(null);

      const resp = await fetch(
        `/api/admin/matches/${selectedMatchId}/drink-perk/reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `When posting /api/admin/matches/${selectedMatchId}/drink-perk/reset, the response was [${resp.status}] ${resp.statusText}. ${text}`,
        );
      }

      const json = await resp.json();
      setDevNote(`♻️ Reset complete. Drink perk is now ${String(json?.state)}.`);

      try {
        const ds = await fetch(
          `/api/admin/matches/${selectedMatchId}/drink-perk/status`,
        );
        if (ds.ok) {
          setDrinkStatus(await ds.json());
        }
      } catch (e) {
        console.error(e);
      }
    } catch (e) {
      console.error(e);
      setDevNote(e?.message || "Could not reset drink perk.");
    } finally {
      setDevBusy(false);
    }
  };

  const transcriptHeader = useMemo(() => {
    if (!selectedMatch) return null;
    const who =
      selectedMatch.otherUser?.displayName ||
      selectedMatch.otherUser?.email ||
      "Conversation";
    return `Chat with ${who}`;
  }, [selectedMatch]);

  const messageBubbles = useMemo(() => {
    return messages.map((m) => {
      const sender =
        m.sender_display_name || m.sender_email || `User ${m.sender_id}`;
      const when = formatWhen(m.created_at);
      const text = String(m.message_text || "");
      const id = m.id;

      return { id, sender, when, text };
    });
  }, [messages]);

  return (
    <div className="border-t border-gray-200 pt-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Chats</h3>

      {matchesError ? (
        <div className="bg-red-50 border border-red-200 text-red-900 text-sm p-3 rounded-lg mb-3">
          {matchesError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">Matches</div>
            <div className="text-xs text-gray-500">
              Pick a match to see the full chat transcript
            </div>
          </div>

          {matchesLoading ? (
            <div className="p-4 text-sm text-gray-600">Loading chats…</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">No matches found.</div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {rows.map((r) => {
                const isActive = r.matchId === selectedMatchId;
                const rowClassName = isActive
                  ? "bg-[#FF1744] bg-opacity-5"
                  : "bg-white";

                return (
                  <button
                    key={r.matchId}
                    onClick={() => openMatch(r.matchId)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${rowClassName}`}
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
                          {r.label}
                        </div>
                        <div className="text-xs text-gray-600 truncate">
                          {r.sublabel}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">
              {transcriptHeader || "Transcript"}
            </div>
            <div className="text-xs text-gray-500">
              {selectedMatchId
                ? `Match ID: ${selectedMatchId}`
                : "Select a match"}
            </div>
          </div>

          {messagesError ? (
            <div className="p-4">
              <div className="bg-red-50 border border-red-200 text-red-900 text-sm p-3 rounded-lg">
                {messagesError}
              </div>
            </div>
          ) : null}

          {messagesLoading ? (
            <div className="p-4 text-sm text-gray-600">Loading messages…</div>
          ) : !selectedMatchId ? (
            <div className="p-4 text-sm text-gray-600">
              Pick a match on the left.
            </div>
          ) : messageBubbles.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">No messages yet.</div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto p-4 space-y-3">
              {messageBubbles.map((m) => (
                <div
                  key={m.id}
                  className="border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-xs font-semibold text-gray-800 truncate">
                      {m.sender}
                    </div>
                    <div className="text-[11px] text-gray-500">{m.when}</div>
                  </div>
                  <div className="mt-2 text-sm text-gray-900 whitespace-pre-wrap">
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* NEW: dev controls */}
          {selectedMatchId ? (
            <div className="border-t border-gray-200 p-4">
              <div className="text-xs font-semibold text-gray-700">
                Dev: Drink on Us
              </div>
              <div className="text-xs text-gray-500 mt-1">
                If the phone already says “Drink ready”, that just means this
                match is already in READY state. Tap the banner on the phone to
                open the unlock screen.
              </div>

              {drinkStatus ? (
                <div className="mt-3 text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <div>
                    <span className="font-semibold">perk:</span>{" "}
                    {String(drinkStatus?.perk?.state || "-")}
                  </div>
                  <div>
                    <span className="font-semibold">handshake:</span>{" "}
                    {drinkStatus?.handshake?.active ? "active" : "none"}
                  </div>
                  <div>
                    <span className="font-semibold">credit:</span>{" "}
                    {drinkStatus?.credit?.token ? "issued" : "none"}
                  </div>

                  {/* NEW: push debug */}
                  {drinkStatus?.match?.user1Id && drinkStatus?.pushDebug ? (
                    <div className="mt-2">
                      <div className="font-semibold">push debug</div>
                      <div>
                        user1 tokens:{" "}
                        {drinkStatus.pushDebug[
                          String(drinkStatus.match.user1Id)
                        ]?.tokenCount ?? "-"}
                        {" • announcements: "}
                        {drinkStatus.pushDebug[
                          String(drinkStatus.match.user1Id)
                        ]?.prefs?.announcements
                          ? "on"
                          : "off"}
                        {" • enableAll: "}
                        {drinkStatus.pushDebug[
                          String(drinkStatus.match.user1Id)
                        ]?.prefs?.enableAll
                          ? "on"
                          : "off"}
                      </div>
                      <div>
                        user2 tokens:{" "}
                        {drinkStatus.pushDebug[
                          String(drinkStatus.match.user2Id)
                        ]?.tokenCount ?? "-"}
                        {" • announcements: "}
                        {drinkStatus.pushDebug[
                          String(drinkStatus.match.user2Id)
                        ]?.prefs?.announcements
                          ? "on"
                          : "off"}
                        {" • enableAll: "}
                        {drinkStatus.pushDebug[
                          String(drinkStatus.match.user2Id)
                        ]?.prefs?.enableAll
                          ? "on"
                          : "off"}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {devNote ? (
                <div className="mt-3 text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-2">
                  {devNote}
                </div>
              ) : null}

              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                {/* NEW: reset */}
                <button
                  disabled={devBusy}
                  onClick={resetDrinkPerk}
                  className="inline-flex items-center justify-center rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200 disabled:opacity-60"
                >
                  {devBusy ? "Working…" : "0) Reset (so you can re-test)"}
                </button>

                <button
                  disabled={devBusy}
                  onClick={simulateDrinkReady}
                  className="inline-flex items-center justify-center rounded-md bg-[#7C3AED] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6D28D9] disabled:opacity-60"
                >
                  {devBusy ? "Working…" : "1) Simulate together now (READY)"}
                </button>

                <button
                  disabled={devBusy}
                  onClick={simulateDrinkComplete}
                  className="inline-flex items-center justify-center rounded-md bg-[#FF4FD8] px-3 py-2 text-sm font-semibold text-white hover:bg-[#FF2ECF] disabled:opacity-60"
                >
                  {devBusy ? "Working…" : "2) Complete unlock (issue credit)"}
                </button>
              </div>

              <div className="mt-3 text-[11px] text-gray-500">
                Tip: Phone flow is: open chat → tap “Drink ready — tap to start”
                banner → Tap to start → then click step 2 here. If it says
                “Used”, click Reset first.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Note: this is an admin-only view. We can also add a shortcut from
        Reports → “View chat transcript” if you want.
      </div>
    </div>
  );
}
