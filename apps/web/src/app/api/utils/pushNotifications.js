import sql from "@/app/api/utils/sql";

async function sendExpoPush({ to, title, body, data }) {
  try {
    if (!to) {
      return { ok: false, error: "Missing expo push token" };
    }

    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to,
        title,
        body,
        data,
        sound: "default",
      }),
    });

    if (!resp.ok) {
      return {
        ok: false,
        error: `Expo push request failed: [${resp.status}] ${resp.statusText}`,
      };
    }

    const json = await resp.json();

    // Expo can return errors in the JSON even when HTTP is 200.
    // Shape can be { data: {...} } or { data: [ ... ] }
    const dataNode = json?.data;
    const first = Array.isArray(dataNode) ? dataNode[0] : dataNode;
    const status = first?.status;

    if (status && status !== "ok") {
      return {
        ok: false,
        error: first?.message || "Expo push rejected the message",
        response: json,
      };
    }

    return { ok: true, response: json };
  } catch (e) {
    console.error("[PUSH] sendExpoPush error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

function defaultPrefs() {
  return {
    enableAll: true,
    muteAll: false,
    newLikes: true,
    newMatches: true,
    newMessages: true,
    promotions: true,
    announcements: true,
  };
}

async function getUserNotificationPreferences(userId) {
  try {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return defaultPrefs();

    const rows = await sql`
      SELECT enable_all, mute_all, new_likes, new_matches, new_messages, promotions, announcements
      FROM user_notification_preferences
      WHERE user_id = ${uid}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return defaultPrefs();
    }

    const row = rows[0] || {};
    return {
      enableAll: row.enable_all !== false,
      muteAll: row.mute_all === true,
      newLikes: row.new_likes !== false,
      newMatches: row.new_matches !== false,
      newMessages: row.new_messages !== false,
      promotions: row.promotions !== false,
      announcements: row.announcements !== false,
    };
  } catch (e) {
    console.error("[PUSH] getUserNotificationPreferences error", e);
    return defaultPrefs();
  }
}

function allowedByPrefs(prefs, category) {
  const p = prefs || defaultPrefs();
  if (!p.enableAll) return false;
  if (p.muteAll) return false;

  if (category === "new_likes") return p.newLikes;
  if (category === "new_matches") return p.newMatches;
  if (category === "new_messages") return p.newMessages;
  if (category === "promotions") return p.promotions;
  if (category === "announcements") return p.announcements;

  return true;
}

async function getRecentPushTokensForUser(uid) {
  const rows = await sql`
    SELECT expo_push_token
    FROM user_push_tokens
    WHERE user_id = ${uid}
    ORDER BY updated_at DESC
    LIMIT 5
  `;
  return (rows || []).map((r) => r?.expo_push_token).filter(Boolean);
}

async function getDisplayNameForUser(userId) {
  try {
    const [row] = await sql`
      SELECT display_name
      FROM user_profiles
      WHERE user_id = ${Number(userId)}
      LIMIT 1
    `;

    const name = String(row?.display_name || "").trim();
    return name || "Someone";
  } catch (e) {
    console.error("[PUSH] getDisplayNameForUser error", e);
    return "Someone";
  }
}

export async function sendAnnouncementPushNotification({
  toUserId,
  title,
  body,
  data,
}) {
  try {
    const uid = Number(toUserId);
    if (!Number.isFinite(uid)) {
      return { ok: false, error: "Invalid toUserId" };
    }

    const prefs = await getUserNotificationPreferences(uid);
    if (!allowedByPrefs(prefs, "announcements")) {
      return { ok: true, skipped: true };
    }

    const rows = await sql`
      SELECT expo_push_token
      FROM user_push_tokens
      WHERE user_id = ${uid}
      ORDER BY updated_at DESC
      LIMIT 5
    `;

    if (!rows || rows.length === 0) {
      return { ok: false, error: "No push tokens for user" };
    }

    const results = [];
    for (const row of rows) {
      const token = row?.expo_push_token;
      const res = await sendExpoPush({
        to: token,
        title: title || "Update",
        body: body || "Tap to open",
        data: data || { type: "announcement" },
      });
      results.push(res);
    }

    const anyOk = results.some((r) => r?.ok);

    if (!anyOk) {
      const firstErr = results.find((r) => r?.error)?.error;
      return {
        ok: false,
        error: firstErr || "All push attempts failed",
        results,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("[PUSH] sendAnnouncementPushNotification error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function sendMatchPushNotification({
  toUserId,
  fromUserId,
  matchId,
}) {
  try {
    const uid = Number(toUserId);
    if (!Number.isFinite(uid)) {
      return { ok: false, error: "Invalid toUserId" };
    }

    const prefs = await getUserNotificationPreferences(uid);
    if (!allowedByPrefs(prefs, "new_matches")) {
      return { ok: true, skipped: true };
    }

    const rows = await sql`
      SELECT expo_push_token
      FROM user_push_tokens
      WHERE user_id = ${uid}
      ORDER BY updated_at DESC
      LIMIT 5
    `;

    if (!rows || rows.length === 0) {
      return { ok: false, error: "No push tokens for user" };
    }

    const [fromProfile] = await sql`
      SELECT display_name
      FROM user_profiles
      WHERE user_id = ${Number(fromUserId)}
      LIMIT 1
    `;

    const fromName = String(fromProfile?.display_name || "Someone").trim();

    const results = [];
    for (const row of rows) {
      const token = row?.expo_push_token;
      const res = await sendExpoPush({
        to: token,
        title: "It’s a match!",
        body: `${fromName} liked you back — say hi 👋`,
        data: {
          type: "match",
          matchId,
        },
      });
      results.push(res);
    }

    const anyOk = results.some((r) => r?.ok);

    if (!anyOk) {
      const firstErr = results.find((r) => r?.error)?.error;
      return {
        ok: false,
        error: firstErr || "All push attempts failed",
        results,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("[PUSH] sendMatchPushNotification error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// NEW: push for new chat messages
export async function sendMessagePushNotification({
  toUserId,
  fromUserId,
  matchId,
  messageText,
}) {
  try {
    const uid = Number(toUserId);
    if (!Number.isFinite(uid)) {
      return { ok: false, error: "Invalid toUserId" };
    }

    const prefs = await getUserNotificationPreferences(uid);
    if (!allowedByPrefs(prefs, "new_messages")) {
      return { ok: true, skipped: true };
    }

    const rows = await sql`
      SELECT expo_push_token
      FROM user_push_tokens
      WHERE user_id = ${uid}
      ORDER BY updated_at DESC
      LIMIT 5
    `;

    if (!rows || rows.length === 0) {
      return { ok: false, error: "No push tokens for user" };
    }

    const [fromProfile] = await sql`
      SELECT display_name
      FROM user_profiles
      WHERE user_id = ${Number(fromUserId)}
      LIMIT 1
    `;

    const fromName = String(fromProfile?.display_name || "New message").trim();

    const previewRaw = typeof messageText === "string" ? messageText : "";
    const preview = previewRaw.trim().slice(0, 140);
    const body = preview || "Tap to open";

    const results = [];
    for (const row of rows) {
      const token = row?.expo_push_token;
      const res = await sendExpoPush({
        to: token,
        title: fromName,
        body,
        data: {
          type: "message",
          matchId,
        },
      });
      results.push(res);
    }

    const anyOk = results.some((r) => r?.ok);

    if (!anyOk) {
      const firstErr = results.find((r) => r?.error)?.error;
      return {
        ok: false,
        error: firstErr || "All push attempts failed",
        results,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("[PUSH] sendMessagePushNotification error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// NEW: push for "Move to chat" (someone committed and wants to chat)
export async function sendChatStartedPushNotification({
  toUserId,
  fromUserId,
  matchId,
}) {
  try {
    const uid = Number(toUserId);
    if (!Number.isFinite(uid)) {
      return { ok: false, error: "Invalid toUserId" };
    }

    const prefs = await getUserNotificationPreferences(uid);
    if (!allowedByPrefs(prefs, "new_messages")) {
      return { ok: true, skipped: true };
    }

    const tokens = await getRecentPushTokensForUser(uid);
    if (tokens.length === 0) {
      return { ok: false, error: "No push tokens for user" };
    }

    const fromName = await getDisplayNameForUser(fromUserId);

    const results = [];
    for (const token of tokens) {
      const res = await sendExpoPush({
        to: token,
        title: fromName,
        body: "Wants to chat — tap to open",
        data: {
          type: "chat_started",
          matchId,
        },
      });
      results.push(res);
    }

    const anyOk = results.some((r) => r?.ok);
    if (!anyOk) {
      const firstErr = results.find((r) => r?.error)?.error;
      return {
        ok: false,
        error: firstErr || "All push attempts failed",
        results,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("[PUSH] sendChatStartedPushNotification error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// NEW: push for date invites
export async function sendDateInvitePushNotification({
  toUserId,
  fromUserId,
  matchId,
}) {
  try {
    const uid = Number(toUserId);
    if (!Number.isFinite(uid)) {
      return { ok: false, error: "Invalid toUserId" };
    }

    const prefs = await getUserNotificationPreferences(uid);
    if (!allowedByPrefs(prefs, "new_messages")) {
      return { ok: true, skipped: true };
    }

    const tokens = await getRecentPushTokensForUser(uid);
    if (tokens.length === 0) {
      return { ok: false, error: "No push tokens for user" };
    }

    const fromName = await getDisplayNameForUser(fromUserId);

    const results = [];
    for (const token of tokens) {
      const res = await sendExpoPush({
        to: token,
        title: "Date idea",
        body: `${fromName} sent you a date idea`,
        data: {
          type: "date_invite",
          matchId,
        },
      });
      results.push(res);
    }

    const anyOk = results.some((r) => r?.ok);
    if (!anyOk) {
      const firstErr = results.find((r) => r?.error)?.error;
      return {
        ok: false,
        error: firstErr || "All push attempts failed",
        results,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("[PUSH] sendDateInvitePushNotification error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// NEW: push for date accept/decline
export async function sendDateUpdatePushNotification({
  toUserId,
  matchId,
  title,
  body,
}) {
  try {
    const uid = Number(toUserId);
    if (!Number.isFinite(uid)) {
      return { ok: false, error: "Invalid toUserId" };
    }

    const prefs = await getUserNotificationPreferences(uid);
    if (!allowedByPrefs(prefs, "new_messages")) {
      return { ok: true, skipped: true };
    }

    const tokens = await getRecentPushTokensForUser(uid);
    if (tokens.length === 0) {
      return { ok: false, error: "No push tokens for user" };
    }

    const results = [];
    for (const token of tokens) {
      const res = await sendExpoPush({
        to: token,
        title: title || "Date update",
        body: body || "Tap to open",
        data: {
          type: "date_update",
          matchId,
        },
      });
      results.push(res);
    }

    const anyOk = results.some((r) => r?.ok);
    if (!anyOk) {
      const firstErr = results.find((r) => r?.error)?.error;
      return {
        ok: false,
        error: firstErr || "All push attempts failed",
        results,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("[PUSH] sendDateUpdatePushNotification error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function sendDrinkReadyPushNotification({ toUserId, matchId }) {
  try {
    const uid = Number(toUserId);
    if (!Number.isFinite(uid)) {
      return { ok: false, error: "Invalid toUserId" };
    }

    const prefs = await getUserNotificationPreferences(uid);
    if (!allowedByPrefs(prefs, "announcements")) {
      return { ok: true, skipped: true };
    }

    const rows = await sql`
      SELECT expo_push_token
      FROM user_push_tokens
      WHERE user_id = ${uid}
      ORDER BY updated_at DESC
      LIMIT 5
    `;

    if (!rows || rows.length === 0) {
      return { ok: false, error: "No push tokens for user" };
    }

    const results = [];
    for (const row of rows) {
      const token = row?.expo_push_token;
      const res = await sendExpoPush({
        to: token,
        title: "You’re together 🍸",
        body: "Open the app to unlock your Drink on Us perk.",
        data: {
          type: "drink_ready",
          matchId,
        },
      });
      results.push(res);
    }

    const anyOk = results.some((r) => r?.ok);

    if (!anyOk) {
      const firstErr = results.find((r) => r?.error)?.error;
      return {
        ok: false,
        error: firstErr || "All push attempts failed",
        results,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("[PUSH] sendDrinkReadyPushNotification error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function sendLikePushNotification({ toUserId, fromUserId }) {
  try {
    const uid = Number(toUserId);
    if (!Number.isFinite(uid)) {
      return { ok: false, error: "Invalid toUserId" };
    }

    const prefs = await getUserNotificationPreferences(uid);
    if (!allowedByPrefs(prefs, "new_likes")) {
      return { ok: true, skipped: true };
    }

    const rows = await sql`
      SELECT expo_push_token
      FROM user_push_tokens
      WHERE user_id = ${uid}
      ORDER BY updated_at DESC
      LIMIT 5
    `;

    if (!rows || rows.length === 0) {
      return { ok: false, error: "No push tokens for user" };
    }

    const [fromProfile] = await sql`
      SELECT display_name
      FROM user_profiles
      WHERE user_id = ${Number(fromUserId)}
      LIMIT 1
    `;

    const fromName = String(fromProfile?.display_name || "Someone").trim();

    const results = [];
    for (const row of rows) {
      const token = row?.expo_push_token;
      const res = await sendExpoPush({
        to: token,
        title: "New like",
        body: `${fromName} liked you — tap to see`,
        data: {
          type: "like",
        },
      });
      results.push(res);
    }

    const anyOk = results.some((r) => r?.ok);

    if (!anyOk) {
      const firstErr = results.find((r) => r?.error)?.error;
      return {
        ok: false,
        error: firstErr || "All push attempts failed",
        results,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("[PUSH] sendLikePushNotification error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// NEW: push for 7-day match countdown milestones and expiration
export async function sendCountdownPushNotification({
  toUserId,
  matchId,
  title,
  body,
  pushType,
}) {
  try {
    const uid = Number(toUserId);
    if (!Number.isFinite(uid)) {
      return { ok: false, error: "Invalid toUserId" };
    }

    const prefs = await getUserNotificationPreferences(uid);
    if (!allowedByPrefs(prefs, "new_matches")) {
      return { ok: true, skipped: true };
    }

    const tokens = await getRecentPushTokensForUser(uid);
    if (tokens.length === 0) {
      return { ok: false, error: "No push tokens for user" };
    }

    const results = [];
    for (const token of tokens) {
      const res = await sendExpoPush({
        to: token,
        title: title || "Match countdown",
        body: body || "Your match is expiring soon",
        data: {
          type: "countdown",
          matchId,
          pushType: pushType || "generic",
        },
      });
      results.push(res);
    }

    const anyOk = results.some((r) => r?.ok);
    if (!anyOk) {
      const firstErr = results.find((r) => r?.error)?.error;
      return {
        ok: false,
        error: firstErr || "All push attempts failed",
        results,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("[PUSH] sendCountdownPushNotification error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}
