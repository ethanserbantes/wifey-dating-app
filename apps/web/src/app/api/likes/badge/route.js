import sql from "@/app/api/utils/sql";

function safeParseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return new URL(rawUrl, process.env.APP_URL);
  }
}

async function resolveUserId({ userIdRaw, emailRaw }) {
  const email = typeof emailRaw === "string" ? emailRaw.trim() : "";

  let userId = null;
  if (userIdRaw) {
    const parsed = Number(userIdRaw);
    if (Number.isFinite(parsed)) {
      userId = parsed;
    }
  }

  // Prefer email lookup when present (more stable across devices).
  if (email) {
    const rows = await sql`
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
    `;
    const idFromEmail = rows?.[0]?.id;
    if (Number.isFinite(idFromEmail)) {
      userId = Number(idFromEmail);
    }
  }

  return userId;
}

export async function GET(request) {
  try {
    const parsedUrl = safeParseUrl(request.url);
    const { searchParams } = parsedUrl;

    const userId = await resolveUserId({
      userIdRaw: searchParams.get("userId"),
      emailRaw: searchParams.get("email"),
    });

    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "User ID (or email) required" },
        { status: 400 },
      );
    }

    const rows = await sql`
      SELECT COUNT(*)::int AS count
      FROM profile_likes pl
      WHERE pl.to_user_id = ${userId}
        AND pl.status IN ('pending_hidden','surfaced')
        AND pl.created_at > COALESCE(
          (SELECT likes_seen_at FROM users WHERE id = ${userId} LIMIT 1),
          '1970-01-01'::timestamp
        )
        AND pl.from_user_id NOT IN (
          SELECT to_user_id FROM profile_likes WHERE from_user_id = ${userId}
        )
        AND NOT EXISTS (
          SELECT 1
          FROM matches m
          WHERE m.user1_id = LEAST(pl.from_user_id, ${userId})
            AND m.user2_id = GREATEST(pl.from_user_id, ${userId})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM user_blocks b
          WHERE (b.blocker_user_id = ${userId} AND b.blocked_user_id = pl.from_user_id)
             OR (b.blocker_user_id = pl.from_user_id AND b.blocked_user_id = ${userId})
        )
    `;

    const count = rows?.[0]?.count ?? 0;

    return Response.json({
      badgeCount: Number(count) || 0,
      resolvedUserId: userId,
    });
  } catch (error) {
    console.error("Error fetching likes badge:", error);
    return Response.json(
      { error: "Failed to fetch likes badge" },
      { status: 500 },
    );
  }
}
