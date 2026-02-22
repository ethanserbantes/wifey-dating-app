export async function GET(request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const userId = searchParams.get("userId");
    const gender = searchParams.get("gender");

    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    // Reuse the existing share-card logic to ensure the card content stays consistent.
    const shareCardResp = await fetch(
      `${origin}/api/quiz/share-card?userId=${encodeURIComponent(userId)}${gender ? `&gender=${encodeURIComponent(gender)}` : ""}`,
    );

    const shareCardJson = await shareCardResp.json().catch(() => ({}));
    if (!shareCardResp.ok) {
      return Response.json(shareCardJson, { status: shareCardResp.status });
    }

    const imageUrl = shareCardJson?.imageUrl;
    if (!imageUrl || typeof imageUrl !== "string") {
      return Response.json(
        { error: "Could not generate image" },
        { status: 500 },
      );
    }

    const imageResp = await fetch(imageUrl);
    if (!imageResp.ok) {
      return Response.json(
        {
          error: `Could not download image (status ${imageResp.status})`,
        },
        { status: 502 },
      );
    }

    const contentType = imageResp.headers.get("content-type") || "image/png";
    const bytes = await imageResp.arrayBuffer();

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Make it easy to save from a browser.
        "Content-Disposition": 'inline; filename="standard-rank.png"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error creating share-card download:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
