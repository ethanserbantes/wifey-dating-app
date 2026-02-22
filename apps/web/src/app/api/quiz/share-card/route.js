import sql from "@/app/api/utils/sql";

function normalizeAudienceGender(value) {
  const v = String(value || "")
    .toUpperCase()
    .trim();
  if (v === "FEMALE" || v === "MALE" || v === "ALL") {
    return v;
  }
  return null;
}

function parseUserId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.trunc(n);
}

function escapeJsString(value) {
  // Very small helper for embedding text literals into a JS chart config string.
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");
}

function getMaterialLine(audienceGender) {
  if (audienceGender === "MALE") {
    return "You\u2019re husband material.";
  }
  if (audienceGender === "FEMALE") {
    return "You\u2019re Wifey material.";
  }
  return "You\u2019re Wifey / husband material.";
}

function getMaterialEmoji(audienceGender) {
  if (audienceGender === "MALE") {
    return "🤵";
  }
  if (audienceGender === "FEMALE") {
    return "💍"; // women who pass: show ring (not bride)
  }
  return "💍";
}

function formatNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  try {
    return new Intl.NumberFormat("en-US").format(n);
  } catch {
    return String(n);
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = parseUserId(searchParams.get("userId"));
    const audienceGender = normalizeAudienceGender(searchParams.get("gender"));

    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    const audienceToUse = audienceGender || "FEMALE";

    const rows = await sql(
      `
      WITH completed AS (
        SELECT
          sa.id,
          sa.user_id,
          sa.outcome,
          sa.completed_at,
          sa.quiz_config_version,
          v.audience_gender
        FROM screening_attempts sa
        LEFT JOIN quiz_versions v
          ON v.version_number = sa.quiz_config_version
        WHERE sa.outcome IS NOT NULL
          AND sa.outcome <> 'IN_PROGRESS'
          AND sa.completed_at IS NOT NULL
          AND (($2::text = 'ALL') OR (v.audience_gender = $2::text))
      ),
      latest_completed AS (
        SELECT DISTINCT ON (c.user_id)
          c.user_id,
          c.outcome,
          c.completed_at,
          c.id AS attempt_id
        FROM completed c
        ORDER BY c.user_id, c.completed_at DESC, c.id DESC
      ),
      approved_first AS (
        SELECT DISTINCT ON (c.user_id)
          c.user_id,
          c.completed_at,
          c.id AS attempt_id
        FROM completed c
        WHERE c.outcome = 'APPROVED'
        ORDER BY c.user_id, c.completed_at ASC, c.id ASC
      ),
      my_status AS (
        SELECT * FROM latest_completed WHERE user_id = $1
      ),
      my_pass AS (
        SELECT * FROM approved_first WHERE user_id = $1
      ),
      totals AS (
        SELECT COUNT(*)::int AS total_count FROM latest_completed
      ),
      rank_calc AS (
        SELECT
          (
            SELECT COUNT(*)::int
            FROM approved_first af, my_pass mp
            WHERE (af.completed_at < mp.completed_at)
               OR (af.completed_at = mp.completed_at AND af.attempt_id <= mp.attempt_id)
          ) AS rank
      )
      SELECT
        $2::text AS audience_gender,
        (SELECT total_count FROM totals) AS total_count,
        (SELECT outcome FROM my_status) AS my_outcome,
        (SELECT rank FROM rank_calc) AS rank
      `,
      [userId, audienceToUse],
    );

    const row = rows?.[0] || {};
    const totalCount = Number(row.total_count) || 0;
    const rank = row.rank == null ? null : Number(row.rank);
    const myOutcome = row.my_outcome || null;

    if (myOutcome !== "APPROVED" || !rank || totalCount <= 0) {
      return Response.json(
        {
          error: "User is not approved (or missing rank)",
          isApproved: false,
          audienceGender: row.audience_gender || audienceToUse,
        },
        { status: 400 },
      );
    }

    const audienceResolved = row.audience_gender || audienceToUse;

    const rankLine = `${formatNumber(rank)} / ${formatNumber(totalCount)}`;

    const materialLine = getMaterialLine(audienceResolved);
    const materialEmoji = getMaterialEmoji(audienceResolved);

    // Generate a shareable PNG URL using QuickChart (no API key required).
    // We use an empty chart and draw a custom card using a plugin.
    const emojiLine = escapeJsString(materialEmoji);
    const line1 = escapeJsString("You passed.");
    const line2 = escapeJsString(materialLine);
    const line3 = escapeJsString(rankLine);
    const line4 = escapeJsString("and growing.");

    const config = `{
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        layout: { padding: 0 }
      },
      plugins: [{
        id: 'rankCard',
        beforeDraw: function(chart) {
          var ctx = chart.ctx;
          var w = chart.width;
          var h = chart.height;
          ctx.save();

          // Background gradient
          var g = ctx.createLinearGradient(0, 0, w, h);
          g.addColorStop(0, '#F7EEFF');
          g.addColorStop(0.5, '#F2F7FF');
          g.addColorStop(1, '#FFF1F7');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);

          // Soft blobs
          function blob(x, y, r, color) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
          }
          blob(-120, 240, 260, 'rgba(255, 79, 216, 0.16)');
          blob(w + 110, 320, 300, 'rgba(124, 58, 237, 0.14)');
          blob(-120, h + 60, 320, 'rgba(99, 179, 237, 0.16)');

          // Icon circle + emoji (to match the in-app pass UI)
          var icX = w / 2;
          var icY = 180;
          var icR = 110;
          ctx.beginPath();
          ctx.arc(icX, icY, icR, 0, Math.PI * 2);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255,255,255,0.88)';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(17,17,17,0.06)';
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#111111';
          ctx.font = '900 96px Arial';
          ctx.fillText('${emojiLine}', icX, icY + 6);

          // Card
          var pad = 90;
          var cardX = pad;
          var cardY = 280;
          var cardW = w - pad * 2;
          var cardH = h - cardY - 260;
          var radius = 48;

          function roundRect(x, y, width, height, r) {
            var rr = Math.min(r, width / 2, height / 2);
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.arcTo(x + width, y, x + width, y + height, rr);
            ctx.arcTo(x + width, y + height, x, y + height, rr);
            ctx.arcTo(x, y + height, x, y, rr);
            ctx.arcTo(x, y, x + width, y, rr);
            ctx.closePath();
          }

          // Shadow
          ctx.shadowColor = 'rgba(0,0,0,0.12)';
          ctx.shadowBlur = 28;
          ctx.shadowOffsetY = 18;
          roundRect(cardX, cardY, cardW, cardH, radius);
          ctx.fillStyle = 'rgba(255,255,255,0.90)';
          ctx.fill();

          // Border
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(17,17,17,0.06)';
          roundRect(cardX, cardY, cardW, cardH, radius);
          ctx.stroke();

          // Text
          var cx = cardX + cardW / 2;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';

          var y = cardY + 160;
          ctx.fillStyle = '#111111';
          ctx.font = '900 86px Arial';
          ctx.fillText('${line1}', cx, y);

          y += 120;
          ctx.font = '900 62px Arial';
          ctx.fillText('${line2}', cx, y);

          y += 160;
          ctx.font = '900 120px Arial';
          ctx.fillText('${line3}', cx, y);

          y += 90;
          ctx.fillStyle = '#6B7280';
          ctx.font = '800 54px Arial';
          ctx.fillText('${line4}', cx, y);

          ctx.restore();
        }
      }]
    }`;

    const imageUrl = `https://quickchart.io/chart?format=png&width=1080&height=1920&c=${encodeURIComponent(
      config,
    )}`;

    const downloadUrl = `/api/quiz/share-card/download?userId=${encodeURIComponent(
      String(userId),
    )}&gender=${encodeURIComponent(audienceResolved)}`;

    return Response.json({
      audienceGender: audienceResolved,
      userId,
      rank,
      totalCount,
      imageUrl,
      downloadUrl,
      shareText: `You passed.\n${materialLine}\n${rankLine}\nand growing.`,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error generating share card:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
