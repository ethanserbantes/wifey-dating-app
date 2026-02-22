import sql from "@/app/api/utils/sql";

function boolOrNull(v) {
  if (v === true) return true;
  if (v === false) return false;
  return null;
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get("userId");
    const userId = Number(userIdRaw);

    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "userId must be a number" },
        { status: 400 },
      );
    }

    const rows = await sql`
      SELECT enable_all, mute_all, new_likes, new_matches, new_messages, promotions, announcements
      FROM user_notification_preferences
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return Response.json({ preferences: defaultPrefs() });
    }

    const row = rows[0] || {};

    return Response.json({
      preferences: {
        enableAll: row.enable_all !== false,
        muteAll: row.mute_all === true,
        newLikes: row.new_likes !== false,
        newMatches: row.new_matches !== false,
        newMessages: row.new_messages !== false,
        promotions: row.promotions !== false,
        announcements: row.announcements !== false,
      },
    });
  } catch (error) {
    console.error("[PUSH][PREFERENCES][GET] Error:", error);
    return Response.json(
      { error: "Failed to load notification preferences" },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();

    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      return Response.json(
        { error: "userId must be a number" },
        { status: 400 },
      );
    }

    const prefs =
      body?.preferences && typeof body.preferences === "object"
        ? body.preferences
        : {};

    const enableAll = boolOrNull(prefs.enableAll);
    const muteAll = boolOrNull(prefs.muteAll);
    const newLikes = boolOrNull(prefs.newLikes);
    const newMatches = boolOrNull(prefs.newMatches);
    const newMessages = boolOrNull(prefs.newMessages);
    const promotions = boolOrNull(prefs.promotions);
    const announcements = boolOrNull(prefs.announcements);

    const rows = await sql`
      INSERT INTO user_notification_preferences (
        user_id,
        enable_all,
        mute_all,
        new_likes,
        new_matches,
        new_messages,
        promotions,
        announcements,
        updated_at
      )
      VALUES (
        ${userId},
        COALESCE(${enableAll}, true),
        COALESCE(${muteAll}, false),
        COALESCE(${newLikes}, true),
        COALESCE(${newMatches}, true),
        COALESCE(${newMessages}, true),
        COALESCE(${promotions}, true),
        COALESCE(${announcements}, true),
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE
      SET
        enable_all = COALESCE(${enableAll}, user_notification_preferences.enable_all),
        mute_all = COALESCE(${muteAll}, user_notification_preferences.mute_all),
        new_likes = COALESCE(${newLikes}, user_notification_preferences.new_likes),
        new_matches = COALESCE(${newMatches}, user_notification_preferences.new_matches),
        new_messages = COALESCE(${newMessages}, user_notification_preferences.new_messages),
        promotions = COALESCE(${promotions}, user_notification_preferences.promotions),
        announcements = COALESCE(${announcements}, user_notification_preferences.announcements),
        updated_at = NOW()
      RETURNING enable_all, mute_all, new_likes, new_matches, new_messages, promotions, announcements
    `;

    const row = rows?.[0] || {};

    return Response.json({
      ok: true,
      preferences: {
        enableAll: row.enable_all !== false,
        muteAll: row.mute_all === true,
        newLikes: row.new_likes !== false,
        newMatches: row.new_matches !== false,
        newMessages: row.new_messages !== false,
        promotions: row.promotions !== false,
        announcements: row.announcements !== false,
      },
    });
  } catch (error) {
    console.error("[PUSH][PREFERENCES][PUT] Error:", error);
    return Response.json(
      { error: "Failed to save notification preferences" },
      { status: 500 },
    );
  }
}
