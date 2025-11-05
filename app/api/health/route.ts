import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://retail-transaction-analysis.onrender.com';

export async function GET() {
  try {
    // Simple proxy to actual Render backend health check
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const res = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        {
          status: 'unhealthy',
          message: 'Backend responded with error',
          backendStatus: res.status,
          backendBody: text,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({
      status: 'healthy',
      message: 'Backend reachable',
      backendResponse: data,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // Handle timeout or network errors
    const isTimeout = error?.name === 'AbortError';
    return NextResponse.json(
      {
        status: 'unhealthy',
        message: isTimeout ? 'Backend timeout (cold start)' : 'Failed to reach backend',
        error: error?.message ?? String(error),
        hint: isTimeout ? 'Backend is waking up from cold start. Try again in 30 seconds.' : undefined,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
