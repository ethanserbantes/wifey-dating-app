import sql from "@/app/api/utils/sql";
import { requireAdmin, hasRole } from "@/app/api/utils/adminAuth";

export async function POST(request, { params }) {
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

    const body = await request.json().catch(() => ({}));

    // Accept either credits (integer count) or amountCents.
    const creditsNum = body?.credits == null ? null : Number(body.credits);
    const amountCentsNum =
      body?.amountCents == null ? null : Number(body.amountCents);

    const REQUIRED_CENTS = 3000;

    let grantCents = null;
    if (Number.isFinite(amountCentsNum)) {
      grantCents = Math.max(0, Math.round(amountCentsNum));
    } else if (Number.isFinite(creditsNum)) {
      grantCents = Math.max(0, Math.round(creditsNum)) * REQUIRED_CENTS;
    }

    if (!Number.isFinite(grantCents) || grantCents <= 0) {
      return Response.json(
        { error: "credits (>=1) or amountCents (>0) required" },
        { status: 400 },
      );
    }

    const supportTicketIdRaw =
      body?.supportTicketId == null ? null : Number(body.supportTicketId);
    const supportTicketId = Number.isFinite(supportTicketIdRaw)
      ? supportTicketIdRaw
      : null;

    const noteRaw = body?.note != null ? String(body.note).trim() : "";
    const note = noteRaw && noteRaw.length <= 400 ? noteRaw : null;

    // Update wallet + ledger as one statement (atomic).
    const rows = await sql`
      WITH ensure_wallet AS (
        INSERT INTO date_credit_wallets (user_id)
        VALUES (${userIdNum})
        ON CONFLICT (user_id) DO NOTHING
        RETURNING 1
      ),
      ins_ledger AS (
        INSERT INTO date_credit_ledger (user_id, match_id, action, amount_cents, meta)
        VALUES (
          ${userIdNum},
          NULL,
          'ADMIN_GRANT',
          ${grantCents},
          jsonb_build_object(
            'admin_id', ${Number(admin.id)},
            'admin_email', ${String(admin.email)},
            'support_ticket_id', ${supportTicketId}::int,
            'note', ${note}::text
          )
        )
        RETURNING 1
      )
      UPDATE date_credit_wallets
      SET balance_cents = balance_cents + ${grantCents},
          updated_at = now()
      WHERE user_id = ${userIdNum}
        AND EXISTS (SELECT 1 FROM ins_ledger)
      RETURNING user_id, balance_cents, updated_at
    `;

    const wallet = rows?.[0] || null;

    return Response.json({
      ok: true,
      grantedCents: grantCents,
      wallet: wallet
        ? {
            userId: Number(wallet.user_id),
            balanceCents: Number(wallet.balance_cents || 0),
            updatedAt: wallet.updated_at || null,
          }
        : null,
    });
  } catch (e) {
    console.error("POST /api/admin/users/[id]/date-credits/grant error", e);
    return Response.json({ error: "Failed to grant" }, { status: 500 });
  }
}
