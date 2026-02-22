import sql from "@/app/api/utils/sql";

async function sendExpoPushRaw({ to, title, body, data }) {
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

  const json = await resp.json().catch(() => null);

  if (!resp.ok) {
    return {
      ok: false,
      httpStatus: resp.status,
      httpStatusText: resp.statusText,
      response: json,
    };
  }

  const dataNode = json?.data;
  const first = Array.isArray(dataNode) ? dataNode[0] : dataNode;
  const ticketId = first?.id || null;
  const status = first?.status || null;

  if (status && status !== "ok") {
    return { ok: false, response: json, ticketId };
  }

  return { ok: true, response: json, ticketId };
}

async function getExpoReceipts(ticketIds) {
  const ids = Array.isArray(ticketIds) ? ticketIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return { ok: false, error: "No ticket ids" };
  }

  const resp = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  const json = await resp.json().catch(() => null);

  if (!resp.ok) {
    return {
      ok: false,
      httpStatus: resp.status,
      httpStatusText: resp.statusText,
      response: json,
    };
  }

  return { ok: true, response: json };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getReceiptsWithRetries(ticketIds) {
  const attempts = [];

  // Expo receipts can take a bit to show up; retry a few times.
  // This is the only reliable way to surface errors like InvalidCredentials.
  for (const delayMs of [0, 2000, 5000]) {
    if (delayMs) {
      await sleep(delayMs);
    }
    const res = await getExpoReceipts(ticketIds);
    attempts.push({ delayMs, ...res });
  }

  return attempts;
}

function inferCredentialIssue(receiptAttempts) {
  try {
    const attempts = Array.isArray(receiptAttempts) ? receiptAttempts : [];
    const flat = [];

    for (const a of attempts) {
      const details = a?.response?.data || a?.response?.data?.details;
      if (details && typeof details === "object") {
        flat.push(details);
      }

      const responseData = a?.response?.data;
      if (responseData && typeof responseData === "object") {
        flat.push(responseData);
      }

      const response = a?.response;
      if (response && typeof response === "object") {
        flat.push(response);
      }
    }

    const asText = JSON.stringify(flat).toLowerCase();

    if (
      asText.includes("invalidcredentials") ||
      asText.includes("could not find apns credentials")
    ) {
      return {
        type: "InvalidCredentials",
        message:
          "Expo could not find APNs credentials for this iOS bundle / Expo project. This is an iOS push setup issue, not a code issue.",
        nextSteps: [
          "In Apple Developer: create an APNs Auth Key (.p8) with Push Notifications enabled (Certificates, Identifiers & Profiles → Keys).",
          "In Expo/EAS credentials for this project: upload that APNs key (or let EAS generate new push credentials).",
          "Rebuild the iOS app (TestFlight build) after credentials are set.",
        ],
      };
    }

    return null;
  } catch (e) {
    return null;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = Number(searchParams.get("userId"));
    const kindRaw = String(searchParams.get("kind") || "").toLowerCase();
    const kind = ["like", "match", "message", "announcement"].includes(kindRaw)
      ? kindRaw
      : "announcement";

    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "userId must be a number" },
        { status: 400 },
      );
    }

    const tokens = await sql`
      SELECT expo_push_token
      FROM user_push_tokens
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
      LIMIT 5
    `;

    const list = (tokens || [])
      .map((r) => r?.expo_push_token)
      .filter((t) => typeof t === "string" && t.length);

    if (list.length === 0) {
      return Response.json(
        { ok: false, error: "No push tokens registered for this user" },
        { status: 404 },
      );
    }

    const payload =
      kind === "like"
        ? {
            title: "Test: New like",
            body: "If you see this, like pushes can deliver.",
            data: { type: "like" },
          }
        : kind === "match"
          ? {
              title: "Test: It’s a match!",
              body: "If you see this, match pushes can deliver.",
              data: { type: "match", matchId: "0" },
            }
          : kind === "message"
            ? {
                title: "Test: New message",
                body: "If you see this, message pushes can deliver.",
                data: { type: "message", matchId: "0" },
              }
            : {
                title: "Test push",
                body: "If you see this, pushes are working.",
                data: { type: "announcement" },
              };

    const sendResults = [];
    const ticketIds = [];

    for (const token of list) {
      const res = await sendExpoPushRaw({ to: token, ...payload });
      sendResults.push({ token, ...res });
      if (res?.ticketId) {
        ticketIds.push(res.ticketId);
      }
    }

    // Receipts are the only reliable way to surface delivery errors.
    // We retry a few times and return every attempt to the client.
    const receiptAttempts = ticketIds.length
      ? await getReceiptsWithRetries(ticketIds)
      : [];

    const credentialIssue = inferCredentialIssue(receiptAttempts);

    return Response.json({
      ok: true,
      tokenCount: list.length,
      kind,
      sendResults,
      ticketIds,
      receiptAttempts,
      credentialIssue,
    });
  } catch (e) {
    console.error("[PUSH][TEST] error", e);
    return Response.json(
      { error: "Failed to send test push" },
      { status: 500 },
    );
  }
}
