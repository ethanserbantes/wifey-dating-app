import sql from "@/app/api/utils/sql";
import { expireInboundLikeOnPass } from "@/app/api/utils/likeThrottle";

export async function POST(request) {
  try {
    const { fromUserId, toUserId } = await request.json();

    if (!fromUserId || !toUserId) {
      return Response.json({ error: "User IDs required" }, { status: 400 });
    }

    await sql.transaction(async (txn) => {
      // Insert pass
      await txn`
        INSERT INTO profile_passes (from_user_id, to_user_id)
        VALUES (${fromUserId}, ${toUserId})
        ON CONFLICT (from_user_id, to_user_id) DO NOTHING
      `;
    });

    // NEW: if the passed user had an inbound like (hidden or surfaced), expire it.
    // This is the recommended behavior so hidden likes don't linger after a hard "no".
    try {
      await expireInboundLikeOnPass({
        viewerId: Number(fromUserId),
        passedUserId: Number(toUserId),
      });
    } catch (e) {
      console.error("expireInboundLikeOnPass error:", e);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error passing profile:", error);
    return Response.json({ error: "Failed to pass profile" }, { status: 500 });
  }
}

// Allow "rewind" by removing the last pass.
export async function DELETE(request) {
  try {
    const { fromUserId, toUserId } = await request.json();

    if (!fromUserId || !toUserId) {
      return Response.json({ error: "User IDs required" }, { status: 400 });
    }

    await sql`
      DELETE FROM profile_passes
      WHERE from_user_id = ${fromUserId}
        AND to_user_id = ${toUserId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error rewinding pass:", error);
    return Response.json({ error: "Failed to rewind pass" }, { status: 500 });
  }
}
