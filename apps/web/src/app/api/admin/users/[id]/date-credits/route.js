import sql from "@/app/api/utils/sql";
import { requireAdmin, hasRole } from "@/app/api/utils/adminAuth";

const REQUIRED_CENTS = 3000;

export async function GET(request, { params }) {
  try {
    const authz = await requireAdmin(request);
    if (!authz.ok) return authz.response;

    const admin = authz.admin;
    if (!hasRole(admin, ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"])) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const userIdNum = Number(params?.id);
    if (!Number.isFinite(userIdNum)) {
      return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    // Ensure wallet row exists.
    await sql`
      INSERT INTO date_credit_wallets (user_id)
      VALUES (${userIdNum})
      ON CONFLICT (user_id) DO NOTHING
    `;

    const walletRows = await sql`
      SELECT user_id, balance_cents, updated_at
      FROM date_credit_wallets
      WHERE user_id = ${userIdNum}
      LIMIT 1
    `;

    const wallet = walletRows?.[0] || { user_id: userIdNum, balance_cents: 0 };
    const balanceCents = Number(wallet?.balance_cents || 0);

    const credits = Math.max(0, Math.floor(balanceCents / REQUIRED_CENTS));

    const ledger = await sql`
      SELECT id, action, amount_cents, match_id, meta, created_at
      FROM date_credit_ledger
      WHERE user_id = ${userIdNum}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return Response.json({
      wallet: {
        userId: userIdNum,
        balanceCents,
        credits,
        updatedAt: wallet?.updated_at || null,
      },
      ledger: ledger || [],
    });
  } catch (e) {
    console.error("GET /api/admin/users/[id]/date-credits error", e);
    return Response.json({ error: "Failed to load" }, { status: 500 });
  }
}
