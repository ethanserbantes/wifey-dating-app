import sql from "@/app/api/utils/sql";

// GET - Get question details
export async function GET(request, { params }) {
  try {
    const questionId = params.id;

    const question = await sql`
      SELECT * FROM question_bank WHERE id = ${questionId}
    `;

    if (question.length === 0) {
      return Response.json({ error: "Question not found" }, { status: 404 });
    }

    const answers = await sql`
      SELECT * FROM question_answers
      WHERE question_id = ${questionId}
      ORDER BY display_order
    `;

    return Response.json({
      question: { ...question[0], answers },
    });
  } catch (error) {
    console.error("Error fetching question:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT - Update question
export async function PUT(request, { params }) {
  try {
    const questionId = params.id;
    const body = await request.json();
    const {
      questionText,
      isMandatory,
      isActive,
      allowMultiple,
      minSelectionsRequired,
      minSelectionsPenalty,
      answers,
    } = body;

    const minReqNum =
      minSelectionsRequired == null || minSelectionsRequired === ""
        ? null
        : Number(minSelectionsRequired);
    const minPenNum =
      minSelectionsPenalty == null || minSelectionsPenalty === ""
        ? null
        : Number(minSelectionsPenalty);

    const safeMinReq = Number.isFinite(minReqNum)
      ? Math.max(0, minReqNum)
      : null;
    const safeMinPen = Number.isFinite(minPenNum)
      ? Math.max(0, minPenNum)
      : null;

    await sql`
      UPDATE question_bank
      SET question_text = ${questionText},
          is_mandatory = ${isMandatory},
          is_active = ${isActive},
          allow_multiple = ${allowMultiple || false},
          min_selections_required = ${allowMultiple ? safeMinReq : null},
          min_selections_penalty = ${allowMultiple ? safeMinPen : null},
          updated_at = NOW()
      WHERE id = ${questionId}
    `;

    // Update answers - delete and recreate for simplicity
    if (answers) {
      await sql`DELETE FROM question_answers WHERE question_id = ${questionId}`;

      for (let i = 0; i < answers.length; i++) {
        await sql`
          INSERT INTO question_answers (question_id, answer_text, weight, display_order)
          VALUES (${questionId}, ${answers[i].text}, ${answers[i].weight || 0}, ${i})
        `;
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating question:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete question
export async function DELETE(request, { params }) {
  try {
    const questionId = params.id;

    await sql`DELETE FROM question_bank WHERE id = ${questionId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting question:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
