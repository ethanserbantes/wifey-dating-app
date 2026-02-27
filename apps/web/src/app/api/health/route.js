/**
 * Health Check Endpoint
 * GET /api/health
 */
export async function GET(request) {
  return new Response(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'wifey-app-backend',
      version: '1.0.0',
      routes: {
        health: '/api/health',
        quiz: '/api/quiz/answer',
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
