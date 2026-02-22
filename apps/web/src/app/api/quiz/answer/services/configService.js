import sql from "@/app/api/utils/sql";
import { hydrateConfigWithDbQuestions } from "@/app/api/quiz/utils/hydrateConfigQuestions.js";

export async function getQuizConfig(configVersion, audienceGender) {
  let configs = [];
  const stateConfigVersion = Number(configVersion);
  const hasStableVersion = Number.isFinite(stateConfigVersion);

  if (hasStableVersion) {
    configs = await sql`
      SELECT config_json, version, audience_gender
      FROM quiz_configs
      WHERE version = ${stateConfigVersion}
        AND audience_gender = ${audienceGender}
      ORDER BY is_active DESC, id DESC
      LIMIT 1
    `;

    // Fallback chain must match /api/quiz/start (never cross genders)
    if (configs.length === 0 && audienceGender !== "ALL") {
      configs = await sql`
        SELECT config_json, version, audience_gender
        FROM quiz_configs
        WHERE version = ${stateConfigVersion}
          AND audience_gender = 'ALL'
        ORDER BY is_active DESC, id DESC
        LIMIT 1
      `;
    }
  }

  // Fall back to currently-active config for this audience
  if (configs.length === 0) {
    configs = await sql`
      SELECT config_json, version, audience_gender
      FROM quiz_configs
      WHERE is_active = true
        AND audience_gender = ${audienceGender}
      LIMIT 1
    `;

    if (configs.length === 0 && audienceGender !== "ALL") {
      configs = await sql`
        SELECT config_json, version, audience_gender
        FROM quiz_configs
        WHERE is_active = true
          AND audience_gender = 'ALL'
        LIMIT 1
      `;
    }
  }

  if (configs.length === 0) {
    return null;
  }

  const hydratedConfig = await hydrateConfigWithDbQuestions({
    configVersion: configs[0].version,
    config: configs[0].config_json,
  });

  return {
    version: configs[0].version,
    config: hydratedConfig,
  };
}

export async function getPhaseRules(configVersion) {
  const phaseRuleRows = await sql`
    SELECT pc.phase_name,
           pc.serve_count_min,
           pc.serve_count_max,
           pc.fail_if_sum_gte,
           pc.escalate_if_sum_gte,
           pc.escalate_if_any_weight_gte,
           pc.approve_if_sum_lte,
           pc.cooldown_if_sum_gte
    FROM quiz_versions v
    JOIN version_phase_configs pc ON pc.version_id = v.id
    WHERE v.version_number = ${configVersion}
  `;

  const latestPhaseRules = {};
  for (const row of phaseRuleRows) {
    latestPhaseRules[row.phase_name] = {
      serve_count_min: row.serve_count_min,
      serve_count_max: row.serve_count_max,
      fail_if_sum_gte: row.fail_if_sum_gte,
      escalate_if_sum_gte: row.escalate_if_sum_gte,
      escalate_if_any_weight_gte: row.escalate_if_any_weight_gte,
      approve_if_sum_lte: row.approve_if_sum_lte,
      cooldown_if_sum_gte: row.cooldown_if_sum_gte,
    };
  }

  return latestPhaseRules;
}

export async function getLifetimeRules(configVersion) {
  const lifetimeRuleRows = await sql`
    SELECT r.rule_json
    FROM quiz_versions v
    JOIN version_lifetime_rules r ON r.version_id = v.id
    WHERE v.version_number = ${configVersion}
    ORDER BY r.display_order
  `;

  return lifetimeRuleRows.map((r) => r.rule_json);
}
