import sql from "@/app/api/utils/sql";

async function resolveUserId({ userIdRaw, emailRaw }) {
  const email = typeof emailRaw === "string" ? emailRaw.trim() : "";

  let userId = null;
  if (userIdRaw != null) {
    const parsed = Number(userIdRaw);
    if (Number.isFinite(parsed)) {
      userId = parsed;
    }
  }

  // Prefer email lookup when present.
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

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const userId = await resolveUserId({
      userIdRaw: body?.userId,
      emailRaw: body?.email,
    });

    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "userId (or email) is required" },
        { status: 400 },
      );
    }

    await sql`
      UPDATE users
      SET likes_seen_at = NOW()
      WHERE id = ${userId}
    `;

    return Response.json({ ok: true, resolvedUserId: userId });
  } catch (error) {
    console.error("Error marking likes seen:", error);
    return Response.json({ error: "Failed to mark seen" }, { status: 500 });
  }
}
