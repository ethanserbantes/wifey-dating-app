import sql from "@/app/api/utils/sql";

export async function GET() {
  try {
    const rows = await sql`
      SELECT
        u.id AS user_id,
        u.email,
        up.gender,
        up.verification_photo_url,
        up.verification_status,
        up.verification_submitted_at,
        up.verification_reviewed_at,
        up.is_verified
      FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      WHERE up.verification_photo_url IS NOT NULL
        AND up.verification_photo_url <> ''
        AND up.verification_reviewed_at IS NULL
      ORDER BY up.verification_submitted_at DESC NULLS LAST, up.updated_at DESC
      LIMIT 200
    `;

    return Response.json({ items: rows });
  } catch (error) {
    console.error("Error fetching verification queue:", error);
    return Response.json(
      { error: "Failed to fetch verification queue" },
      { status: 500 },
    );
  }
}
