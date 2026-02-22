import sql from "@/app/api/utils/sql";
import { sendDrinkReadyPushNotification } from "@/app/api/utils/pushNotifications";

function defaultCoords() {
  // Somewhere harmless. This is only used for dev/test when neither user has a recent location.
  return { lat: 37.7749, lng: -122.4194 };
}

function summarizePushResult(res) {
  if (!res) return null;
  return {
    ok: res.ok === true,
    skipped: res.skipped === true,
    error: res.ok ? null : res.error || "Unknown push error",
  };
}

export async function POST(request, { params }) {
  try {
    const matchIdNum = Number(params?.matchId);
    if (!Number.isFinite(matchIdNum)) {
      return Response.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const sendPush = body?.sendPush !== false;
    const addSystemMessage = body?.addSystemMessage !== false; // default true
    const forceSystemMessage = body?.forceSystemMessage === true; // NEW

    const matchRows = await sql`
      SELECT id, user1_id, user2_id
      FROM matches
      WHERE id = ${matchIdNum}
      LIMIT 1
    `;

    const match = matchRows?.[0];
    if (!match) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }

    const user1Id = Number(match.user1_id);
    const user2Id = Number(match.user2_id);

    // Optional guard: if you haven't planned a date, this perk isn't really meant to be active.
    // For dev testing, you can still force it, but default behavior is to require a date plan.
    const dateRows = await sql`
      SELECT date_status, date_start
      FROM match_date_plans
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;

    const date = dateRows?.[0] || null;
    const hasDate =
      Boolean(date) && String(date?.date_status || "none") !== "none";

    if (!hasDate) {
      return Response.json(
        {
          error:
            "This match has no date planned yet. Plan a date first, then try again.",
        },
        { status: 400 },
      );
    }

    // Check if we were already READY before we do the update (so we don't spam a system message).
    const existingPerkRows = await sql`
      SELECT state
      FROM match_drink_perks
      WHERE match_id = ${matchIdNum}
      LIMIT 1
    `;
    const existingState = String(existingPerkRows?.[0]?.state || "").trim();
    const alreadyReady = existingState === "READY";

    const locRows = await sql`
      SELECT lat, lng
      FROM user_location_latest
      WHERE user_id IN (${user1Id}, ${user2Id})
        AND lat IS NOT NULL
        AND lng IS NOT NULL
      ORDER BY captured_at DESC
      LIMIT 1
    `;

    const picked = locRows?.[0];
    const coords = {
      lat: Number(picked?.lat),
      lng: Number(picked?.lng),
    };

    const coordsOk = Number.isFinite(coords.lat) && Number.isFinite(coords.lng);
    const useCoords = coordsOk ? coords : defaultCoords();

    // Mark both users as "together" and immediately READY.
    // Also refresh both users' locations so the app can show the proximity-based state.
    const togetherSince = new Date(Date.now() - 3 * 60 * 1000);

    const txnQueries = [
      sql`
        INSERT INTO user_location_latest (user_id, lat, lng, accuracy_m, captured_at)
        VALUES (${user1Id}, ${useCoords.lat}, ${useCoords.lng}, NULL, now())
        ON CONFLICT (user_id)
        DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          accuracy_m = EXCLUDED.accuracy_m,
          captured_at = now()
      `,
      sql`
        INSERT INTO user_location_latest (user_id, lat, lng, accuracy_m, captured_at)
        VALUES (${user2Id}, ${useCoords.lat}, ${useCoords.lng}, NULL, now())
        ON CONFLICT (user_id)
        DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          accuracy_m = EXCLUDED.accuracy_m,
          captured_at = now()
      `,
      sql`
        INSERT INTO match_drink_perks (match_id, state, together_since, ready_at, updated_at)
        VALUES (${matchIdNum}, 'READY', ${togetherSince}, now(), now())
        ON CONFLICT (match_id)
        DO UPDATE SET
          state = 'READY',
          together_since = EXCLUDED.together_since,
          ready_at = EXCLUDED.ready_at,
          updated_at = now()
        WHERE match_drink_perks.state <> 'REDEEMED'
        RETURNING match_id, state, together_since, ready_at, redeemed_at
      `,
    ];

    // UPDATED: allow forcing a system message even if it was already READY.
    // This is helpful in dev when you want a fresh unread + tab badge every time.
    const shouldInsertSystemMessage =
      addSystemMessage && (forceSystemMessage || !alreadyReady);

    if (shouldInsertSystemMessage) {
      txnQueries.push(
        sql`
          INSERT INTO chat_messages (match_id, sender_id, message_text, is_read, created_at)
          VALUES (
            ${matchIdNum},
            NULL,
            '🍸 Drink on Us is ready. Open the chat and tap the banner to start.',
            false,
            now()
          )
        `,
      );
    }

    const txnResults = await sql.transaction(txnQueries);
    const perkRow = txnResults?.[2]?.[0] || null;

    if (!perkRow) {
      return Response.json(
        {
          error:
            "Could not mark perk as READY (maybe it was already redeemed).",
        },
        { status: 400 },
      );
    }

    // Best-effort push to both users (uses the same preference gate as other announcements)
    let push = null;
    if (sendPush) {
      try {
        const p1 = await sendDrinkReadyPushNotification({
          toUserId: user1Id,
          matchId: matchIdNum,
        });
        const p2 = await sendDrinkReadyPushNotification({
          toUserId: user2Id,
          matchId: matchIdNum,
        });

        push = {
          user1: summarizePushResult(p1),
          user2: summarizePushResult(p2),
        };
      } catch (e) {
        console.error("[ADMIN][DRINK][SIMULATE_READY] push failed", e);
        push = {
          user1: { ok: false, skipped: false, error: "Push failed" },
          user2: { ok: false, skipped: false, error: "Push failed" },
        };
      }
    }

    return Response.json({
      ok: true,
      matchId: matchIdNum,
      state: String(perkRow.state || "READY"),
      coords: useCoords,
      sendPush,
      push,
      systemMessageInserted: Boolean(shouldInsertSystemMessage),
      alreadyReady,
    });
  } catch (error) {
    console.error("[ADMIN][DRINK][SIMULATE_READY] Error:", error);
    return Response.json(
      { error: "Failed to simulate drink-ready" },
      { status: 500 },
    );
  }
}
