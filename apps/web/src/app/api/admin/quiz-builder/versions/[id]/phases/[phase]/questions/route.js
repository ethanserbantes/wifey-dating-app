import sql from "@/app/api/utils/sql";

// POST - Add question to phase
export async function POST(request, { params }) {
  try {
    const versionId = params.id;
    const phaseName = params.phase;
    const body = await request.json();
    const { questionId } = body;

    // Get max display order
    const maxOrder = await sql`
      SELECT COALESCE(MAX(display_order), -1) as max_order
      FROM version_phase_questions
      WHERE version_id = ${versionId} AND phase_name = ${phaseName}
    `;

    await sql`
      INSERT INTO version_phase_questions (version_id, phase_name, question_id, display_order)
      VALUES (${versionId}, ${phaseName}, ${questionId}, ${maxOrder[0].max_order + 1})
      ON CONFLICT (version_id, phase_name, question_id) DO NOTHING
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error adding question to phase:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Remove question from phase
export async function DELETE(request, { params }) {
  try {
    const versionId = params.id;
    const phaseName = params.phase;
    const { searchParams } = new URL(request.url);
    const questionId = searchParams.get("questionId");

    await sql`
      DELETE FROM version_phase_questions
      WHERE version_id = ${versionId}
        AND phase_name = ${phaseName}
        AND question_id = ${questionId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error removing question from phase:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
