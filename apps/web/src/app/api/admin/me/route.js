import { requireAdmin } from "@/app/api/utils/adminAuth";

export async function GET(request) {
  try {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.response;

    return Response.json({ admin: gate.admin });
  } catch (e) {
    console.error("GET /api/admin/me error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
