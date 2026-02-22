import sql from "@/app/api/utils/sql";
import { sendMatchPushNotification } from "@/app/api/utils/pushNotifications";

export async function POST(request) {
  try {
    const body = await request.json();

    const userIdA = Number(body?.userIdA);
    const userIdB = Number(body?.userIdB);

    if (!Number.isFinite(userIdA) || !Number.isFinite(userIdB)) {
      return Response.json(
        { error: "userIdA and userIdB must be numbers" },
        { status: 400 },
      );
    }

    if (userIdA === userIdB) {
      return Response.json(
        { error: "Cannot match a user with themselves" },
        { status: 400 },
      );
    }

    const low = Math.min(userIdA, userIdB);
    const high = Math.max(userIdA, userIdB);

    // IMPORTANT (Messaging Flow): creating a match must NOT create any chat messages.
    // Matches should appear under "Matches" with 0 messages until a user sends the first message.
    // Also: do not mark either side as "seen" here.
    const matchRows = await sql`
      INSERT INTO matches (user1_id, user2_id, user1_seen_at, user2_seen_at)
      VALUES (${low}, ${high}, ${null}, ${null})
      ON CONFLICT (user1_id, user2_id) DO UPDATE
      SET
        created_at = matches.created_at
      RETURNING id, created_at
    `;

    const matchId = matchRows?.[0]?.id;
    if (!matchId) {
      return Response.json(
        { error: "Failed to create match" },
        { status: 500 },
      );
    }

    // Notify both users (best-effort) that a match exists.
    // We pick userIdA as the "from" user for the push payload; the app treats it as a match event.
    try {
      await sendMatchPushNotification({
        toUserId: high,
        fromUserId: low,
        matchId,
      });
      await sendMatchPushNotification({
        toUserId: low,
        fromUserId: high,
        matchId,
      });
    } catch (e) {
      console.error("Could not send match push:", e);
    }

    return Response.json({ ok: true, matchId, seeded: false });
  } catch (error) {
    console.error("[ADMIN][MATCHES][MANUAL][POST] Error:", error);
    return Response.json({ error: "Failed to create match" }, { status: 500 });
  }
}
