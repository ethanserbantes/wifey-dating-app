import sql from "@/app/api/utils/sql";

// POST - Import quiz from JSON
export async function POST(request) {
  try {
    const body = await request.json();
    const { jsonData, audienceGender } = body;

    const audienceNorm =
      audienceGender === "MALE" ||
      audienceGender === "FEMALE" ||
      audienceGender === "ALL"
        ? audienceGender
        : "ALL";

    const config =
      typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;

    // --- helpers ---
    const toSafeWeight = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    const normalizeAnswerText = (value) => {
      return (value == null ? "" : String(value)).trim();
    };

    // Some older exports/imports may use different keys than `answers`.
    // Be flexible so we don't silently drop answers.
    const getImportedAnswers = (question) => {
      const raw =
        question?.answers ??
        question?.options ??
        question?.answerOptions ??
        question?.answer_options;

      return Array.isArray(raw) ? raw : [];
    };

    // If a question already exists in the question bank (same audience), we still need
    // to ensure its answers + weights match the imported JSON.
    const syncAnswersForQuestion = async (questionId, importedAnswersRaw) => {
      const importedAnswers = Array.isArray(importedAnswersRaw)
        ? importedAnswersRaw
            .map((a, idx) => ({
              text: normalizeAnswerText(a?.text ?? a?.answer_text),
              weight: toSafeWeight(a?.weight),
              displayOrder: idx,
            }))
            .filter((a) => a.text.length > 0)
        : [];

      // Nothing to sync
      if (importedAnswers.length === 0) {
        return;
      }

      const existingAnswers = await sql`
        SELECT id, answer_text, weight, display_order
        FROM question_answers
        WHERE question_id = ${questionId}
        ORDER BY display_order ASC, id ASC
      `;

      const needsReplace =
        existingAnswers.length !== importedAnswers.length ||
        importedAnswers.some((a, idx) => {
          const ex = existingAnswers[idx];
          if (!ex) return true;
          const exText = normalizeAnswerText(ex.answer_text);
          const exWeight = toSafeWeight(ex.weight);
          return exText !== a.text || exWeight !== a.weight;
        });

      if (!needsReplace) {
        return;
      }

      // Replace answers in one shot so the bank is consistent for this audience.
      // This is what you want when importing/duplicating a quiz.
      await sql`
        DELETE FROM question_answers
        WHERE question_id = ${questionId}
      `;

      for (let i = 0; i < importedAnswers.length; i++) {
        const ans = importedAnswers[i];
        await sql`
          INSERT INTO question_answers (question_id, answer_text, weight, display_order)
          VALUES (${questionId}, ${ans.text}, ${ans.weight}, ${i})
        `;
      }
    };

    // Create new version
    const maxVersion = await sql`
      SELECT COALESCE(MAX(version_number), 0) as max_version
      FROM quiz_versions
    `;
    const nextVersion = maxVersion[0].max_version + 1;

    const version = await sql`
      INSERT INTO quiz_versions (version_number, status, created_by_admin_id, notes, audience_gender)
      VALUES (${nextVersion}, 'draft', NULL, ${`Imported from JSON (${audienceNorm})`}, ${audienceNorm})
      RETURNING *
    `;

    const versionId = version[0].id;

    // Import questions and answers
    const questionMap = {}; // Maps old question IDs to new database IDs

    for (const phase of config.phases) {
      for (let qIndex = 0; qIndex < (phase.questions || []).length; qIndex++) {
        const question = phase.questions[qIndex];
        const allowMultiple =
          !!question.allowMultiple || !!question.allow_multiple;

        const importedMinReq =
          question.minSelectionsRequired != null &&
          question.minSelectionsRequired !== ""
            ? Number(question.minSelectionsRequired)
            : question.min_selections_required != null &&
                question.min_selections_required !== ""
              ? Number(question.min_selections_required)
              : null;

        const importedMinPenalty =
          question.minSelectionsPenalty != null &&
          question.minSelectionsPenalty !== ""
            ? Number(question.minSelectionsPenalty)
            : question.min_selections_penalty != null &&
                question.min_selections_penalty !== ""
              ? Number(question.min_selections_penalty)
              : null;

        const hasMinReq = Number.isFinite(importedMinReq);
        const hasMinPenalty = Number.isFinite(importedMinPenalty);

        const safeMinReq = hasMinReq ? Math.max(0, importedMinReq) : null;
        const safeMinPenalty = hasMinPenalty
          ? Math.max(0, importedMinPenalty)
          : null;

        // Check if question already exists in *this audience* in question bank.
        // (Do NOT dedupe across male/female, otherwise edits leak between quizzes.)
        let questionId;

        const existing = await sql`
          SELECT id, allow_multiple, min_selections_required, min_selections_penalty, is_mandatory
          FROM question_bank
          WHERE question_text = ${question.text}
            AND audience_gender = ${audienceNorm}
          LIMIT 1
        `;

        const importedAnswersRaw = getImportedAnswers(question);

        if (existing.length > 0) {
          questionId = existing[0].id;

          const nextMinReq = allowMultiple
            ? hasMinReq
              ? safeMinReq
              : existing[0].min_selections_required
            : null;

          const nextMinPenalty = allowMultiple
            ? hasMinPenalty
              ? safeMinPenalty
              : existing[0].min_selections_penalty
            : null;

          const importedMandatory = !!question.mandatory;

          // Never downgrade: if the imported JSON says allow multiple, ensure the bank also allows multiple.
          // Also: only overwrite min selection settings if the import actually included them.
          const shouldUpdate =
            (allowMultiple &&
              (!existing[0].allow_multiple ||
                existing[0].min_selections_required !== nextMinReq ||
                existing[0].min_selections_penalty !== nextMinPenalty)) ||
            existing[0].is_mandatory !== importedMandatory;

          if (shouldUpdate) {
            await sql`
              UPDATE question_bank
              SET is_mandatory = ${importedMandatory},
                  allow_multiple = ${allowMultiple || existing[0].allow_multiple},
                  min_selections_required = ${
                    allowMultiple
                      ? hasMinReq
                        ? safeMinReq
                        : existing[0].min_selections_required
                      : null
                  },
                  min_selections_penalty = ${
                    allowMultiple
                      ? hasMinPenalty
                        ? safeMinPenalty
                        : existing[0].min_selections_penalty
                      : null
                  },
                  updated_at = NOW()
              WHERE id = ${questionId}
            `;
          }

          // IMPORTANT: make sure the existing question's answers + weights are present.
          // This fixes the "only questions copied" issue.
          await syncAnswersForQuestion(questionId, importedAnswersRaw);
        } else {
          // Create new question (scoped to this audience)
          const newQuestion = await sql`
            INSERT INTO question_bank (
              question_text,
              is_mandatory,
              allow_multiple,
              min_selections_required,
              min_selections_penalty,
              audience_gender
            )
            VALUES (
              ${question.text},
              ${question.mandatory || false},
              ${allowMultiple},
              ${allowMultiple ? safeMinReq : null},
              ${allowMultiple ? safeMinPenalty : null},
              ${audienceNorm}
            )
            RETURNING *
          `;
          questionId = newQuestion[0].id;

          // Add answers
          const importedAnswers = importedAnswersRaw;

          for (let aIndex = 0; aIndex < importedAnswers.length; aIndex++) {
            const answer = importedAnswers[aIndex];
            const answerText = normalizeAnswerText(
              answer?.text ?? answer?.answer_text,
            );
            if (!answerText) {
              continue;
            }
            await sql`
              INSERT INTO question_answers (question_id, answer_text, weight, display_order)
              VALUES (${questionId}, ${answerText}, ${toSafeWeight(answer?.weight)}, ${aIndex})
            `;
          }
        }

        questionMap[question.id] = questionId;

        // Add question to phase
        await sql`
          INSERT INTO version_phase_questions (version_id, phase_name, question_id, display_order)
          VALUES (${versionId}, ${phase.id}, ${questionId}, ${qIndex})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    // Import phase configs - INSERT instead of UPDATE
    const phaseRules = config.scoring.phase_rules;
    for (const [phaseName, rules] of Object.entries(phaseRules)) {
      await sql`
        INSERT INTO version_phase_configs (
          version_id, phase_name, serve_count_min, serve_count_max,
          fail_if_sum_gte, escalate_if_sum_gte, escalate_if_any_weight_gte,
          approve_if_sum_lte, cooldown_if_sum_gte
        )
        VALUES (
          ${versionId}, ${phaseName}, ${rules.serve_count_min || 3}, ${rules.serve_count_max || 5},
          ${rules.fail_if_sum_gte || null}, ${rules.escalate_if_sum_gte || null},
          ${rules.escalate_if_any_weight_gte || null}, ${rules.approve_if_sum_lte || null},
          ${rules.cooldown_if_sum_gte || null}
        )
        ON CONFLICT (version_id, phase_name)
        DO UPDATE SET
          serve_count_min = EXCLUDED.serve_count_min,
          serve_count_max = EXCLUDED.serve_count_max,
          fail_if_sum_gte = EXCLUDED.fail_if_sum_gte,
          escalate_if_sum_gte = EXCLUDED.escalate_if_sum_gte,
          escalate_if_any_weight_gte = EXCLUDED.escalate_if_any_weight_gte,
          approve_if_sum_lte = EXCLUDED.approve_if_sum_lte,
          cooldown_if_sum_gte = EXCLUDED.cooldown_if_sum_gte
      `;
    }

    // Import lifetime rules
    if (config.lifetimeRules) {
      for (let i = 0; i < config.lifetimeRules.length; i++) {
        await sql`
          INSERT INTO version_lifetime_rules (version_id, rule_name, rule_json, display_order)
          VALUES (${versionId}, ${"Imported Rule " + (i + 1)}, ${JSON.stringify(config.lifetimeRules[i])}::jsonb, ${i})
        `;
      }
    }

    return Response.json({ success: true, versionId, version: version[0] });
  } catch (error) {
    console.error("Error importing quiz:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
