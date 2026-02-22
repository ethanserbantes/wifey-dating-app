import sql from "@/app/api/utils/sql";
import { requireAdmin, hasRole } from "@/app/api/utils/adminAuth";

function normalizeName(name) {
  return String(name || "").trim();
}

function normalizeEmoji(emoji) {
  const s = String(emoji || "").trim();
  return s || null;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  // read-only; allow all admin roles
  try {
    const rows = await sql`
      SELECT id, name, emoji, is_active, sort_order, created_at, updated_at
      FROM profile_categories
      ORDER BY sort_order ASC, name ASC
    `;

    return Response.json({ categories: rows || [] });
  } catch (error) {
    console.error("[ADMIN][CATEGORIES] GET error:", error);
    return Response.json(
      { error: "Failed to load categories" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!hasRole(auth.admin, ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = normalizeName(body?.name);
    const emoji = normalizeEmoji(body?.emoji);
    const isActive = body?.isActive == null ? true : Boolean(body.isActive);

    const sortRaw = body?.sortOrder;
    const sortOrder = Number.isFinite(Number(sortRaw)) ? Number(sortRaw) : 0;

    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO profile_categories (name, emoji, is_active, sort_order)
      VALUES (${name}, ${emoji}, ${isActive}, ${sortOrder})
      RETURNING id, name, emoji, is_active, sort_order, created_at, updated_at
    `;

    return Response.json({ category: rows?.[0] || null });
  } catch (error) {
    console.error("[ADMIN][CATEGORIES] POST error:", error);

    const msg = String(error?.message || "");
    const isDup = msg.toLowerCase().includes("profile_categories_name_unique");

    return Response.json(
      {
        error: isDup
          ? "That category name already exists"
          : "Failed to create category",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!hasRole(auth.admin, ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body?.id);

    if (!Number.isFinite(id)) {
      return Response.json({ error: "Valid id is required" }, { status: 400 });
    }

    const updates = [];
    const values = [];
    let i = 1;

    if (body?.name != null) {
      const name = normalizeName(body.name);
      if (!name) {
        return Response.json(
          { error: "Name cannot be empty" },
          { status: 400 },
        );
      }
      updates.push(`name = $${i++}`);
      values.push(name);
    }

    if (body?.emoji !== undefined) {
      const emoji = normalizeEmoji(body.emoji);
      updates.push(`emoji = $${i++}`);
      values.push(emoji);
    }

    if (body?.isActive != null) {
      updates.push(`is_active = $${i++}`);
      values.push(Boolean(body.isActive));
    }

    if (body?.sortOrder != null) {
      const sortOrder = Number(body.sortOrder);
      if (!Number.isFinite(sortOrder)) {
        return Response.json(
          { error: "sortOrder must be a number" },
          { status: 400 },
        );
      }
      updates.push(`sort_order = $${i++}`);
      values.push(sortOrder);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);

    values.push(id);
    const query = `
      UPDATE profile_categories
      SET ${updates.join(", ")}
      WHERE id = $${i}
      RETURNING id, name, emoji, is_active, sort_order, created_at, updated_at
    `;

    const rows = await sql(query, values);

    if (!rows?.length) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json({ category: rows[0] });
  } catch (error) {
    console.error("[ADMIN][CATEGORIES] PATCH error:", error);

    const msg = String(error?.message || "");
    const isDup = msg.toLowerCase().includes("profile_categories_name_unique");

    return Response.json(
      {
        error: isDup
          ? "That category name already exists"
          : "Failed to update category",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!hasRole(auth.admin, ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const idRaw = searchParams.get("id");
    const id = Number(idRaw);

    if (!Number.isFinite(id)) {
      return Response.json({ error: "Valid id is required" }, { status: 400 });
    }

    await sql`DELETE FROM profile_categories WHERE id = ${id}`;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[ADMIN][CATEGORIES] DELETE error:", error);
    return Response.json(
      { error: "Failed to delete category" },
      { status: 500 },
    );
  }
}
