import sql from "@/app/api/utils/sql";
import {
  sendMatchPushNotification,
  sendLikePushNotification,
} from "@/app/api/utils/pushNotifications";

export async function POST(request, { params: { userId } }) {
  try {
    const fakeId = Number(userId);
    if (!Number.isFinite(fakeId)) {
      return Response.json({ error: "Invalid userId" }, { status: 400 });
    }

    const body = await request.json();
    const toUserIdRaw = body?.toUserId;
    const toUserId = Number(toUserIdRaw);

    const forceMatch = body?.forceMatch === true;

    if (!Number.isFinite(toUserId)) {
      return Response.json({ error: "Invalid toUserId" }, { status: 400 });
    }

    if (toUserId === fakeId) {
      return Response.json({ error: "Cannot like self" }, { status: 400 });
    }

    // Ensure fake exists
    const fakeCheck = await sql`
      SELECT id
      FROM users
      WHERE id = ${fakeId}
        AND COALESCE(screening_state_json->>'is_fake', 'false') = 'true'
      LIMIT 1
    `;

    if (fakeCheck.length === 0) {
      return Response.json(
        { error: "Fake profile not found" },
        { status: 404 },
      );
    }

    // Ensure target exists and is NOT fake
    const targetCheck = await sql`
      SELECT id
      FROM users
      WHERE id = ${toUserId}
        AND COALESCE(screening_state_json->>'is_fake', 'false') <> 'true'
      LIMIT 1
    `;

    if (targetCheck.length === 0) {
      return Response.json({ error: "Target user not found" }, { status: 404 });
    }

    // Like on behalf of fake
    const inserted = await sql`
      INSERT INTO profile_likes (from_user_id, to_user_id)
      VALUES (${fakeId}, ${toUserId})
      ON CONFLICT (from_user_id, to_user_id) DO UPDATE
      SET created_at = NOW()
      RETURNING (xmax = 0) AS inserted
    `;

    const didInsertNewLike = inserted?.[0]?.inserted === true;

    // Mutual like?
    const mutualLike = await sql`
      SELECT id
      FROM profile_likes
      WHERE from_user_id = ${toUserId} AND to_user_id = ${fakeId}
      LIMIT 1
    `;

    const hasMutualLike = mutualLike.length > 0;

    let isMatch = false;
    let forced = false;
    let matchId = null;

    if (hasMutualLike || forceMatch) {
      forced = !hasMutualLike && forceMatch;

      const low = Math.min(fakeId, toUserId);
      const high = Math.max(fakeId, toUserId);

      // IMPORTANT (Messaging Flow): creating a match must NOT create any chat messages.
      // Keep it message-free until someone sends the first real message.
      const match = await sql`
        INSERT INTO matches (user1_id, user2_id, user1_seen_at, user2_seen_at)
        VALUES (${low}, ${high}, ${null}, ${null})
        ON CONFLICT (user1_id, user2_id) DO UPDATE
        SET
          created_at = matches.created_at
        RETURNING id
      `;

      isMatch = true;
      matchId = match?.[0]?.id || null;

      if (matchId) {
        // Push notify the real user (best-effort)
        const realUserId = fakeId === low ? high : low;
        try {
          await sendMatchPushNotification({
            toUserId: realUserId,
            fromUserId: fakeId,
            matchId,
          });
        } catch (e) {
          console.error(
            "[ADMIN][FAKE_PROFILES][LIKE] Could not send match push:",
            e,
          );
        }
      }
    } else {
      // If it's just an inbound like (not a match), send a like push.
      if (didInsertNewLike) {
        try {
          await sendLikePushNotification({
            toUserId: toUserId,
            fromUserId: fakeId,
          });
        } catch (e) {
          console.error(
            "[ADMIN][FAKE_PROFILES][LIKE] Could not send like push:",
            e,
          );
        }
      }
    }

    return Response.json({
      success: true,
      liked: true,
      hasMutualLike,
      forceMatch,
      forced,
      isMatch,
      matchId,
    });
  } catch (error) {
    console.error("[ADMIN][FAKE_PROFILES][LIKE][POST] Error:", error);
    return Response.json({ error: "Failed to like profile" }, { status: 500 });
  }
}
