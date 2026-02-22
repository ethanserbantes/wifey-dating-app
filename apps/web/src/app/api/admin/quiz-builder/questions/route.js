import sql from "@/app/api/utils/sql";

// GET - List all questions in bank
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const audienceGenderRaw = (searchParams.get("audienceGender") || "ALL")
      .toString()
      .toUpperCase();

    const audienceGender =
      audienceGenderRaw === "MALE" ||
      audienceGenderRaw === "FEMALE" ||
      audienceGenderRaw === "ALL"
        ? audienceGenderRaw
        : "ALL";

    // IMPORTANT: don't nest sql template calls; build the query string dynamically.
    const whereSql =
      audienceGender === "ALL"
        ? "qb.audience_gender = $1"
        : "qb.audience_gender IN ('ALL', $1)";

    const query = `
      SELECT qb.*,
             json_agg(
               json_build_object(
                 'id', qa.id,
                 'text', qa.answer_text,
                 'weight', qa.weight,
                 'display_order', qa.display_order
               ) ORDER BY qa.display_order
             ) FILTER (WHERE qa.id IS NOT NULL) as answers
      FROM question_bank qb
      LEFT JOIN question_answers qa ON qb.id = qa.question_id
      WHERE ${whereSql}
      GROUP BY qb.id
      ORDER BY qb.id DESC
    `;

    const questions = await sql(query, [audienceGender]);

    return Response.json({ questions });
  } catch (error) {
    console.error("Error fetching questions:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create new question
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      questionText,
      isMandatory,
      allowMultiple,
      minSelectionsRequired,
      minSelectionsPenalty,
      answers,
      audienceGender: audienceGenderRaw,
    } = body;

    const audienceGenderNorm = (audienceGenderRaw || "ALL")
      .toString()
      .toUpperCase();

    const audienceGender =
      audienceGenderNorm === "MALE" ||
      audienceGenderNorm === "FEMALE" ||
      audienceGenderNorm === "ALL"
        ? audienceGenderNorm
        : "ALL";

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

    const question = await sql`
      INSERT INTO question_bank (
        question_text,
        is_mandatory,
        allow_multiple,
        min_selections_required,
        min_selections_penalty,
        audience_gender
      )
      VALUES (
        ${questionText},
        ${isMandatory || false},
        ${allowMultiple || false},
        ${allowMultiple ? safeMinReq : null},
        ${allowMultiple ? safeMinPen : null},
        ${audienceGender}
      )
      RETURNING *
    `;

    const questionId = question[0].id;

    // Insert answers
    if (answers && answers.length > 0) {
      for (let i = 0; i < answers.length; i++) {
        await sql`
          INSERT INTO question_answers (question_id, answer_text, weight, display_order)
          VALUES (${questionId}, ${answers[i].text}, ${answers[i].weight || 0}, ${i})
        `;
      }
    }

    return Response.json({ question: question[0] });
  } catch (error) {
    console.error("Error creating question:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
