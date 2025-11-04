import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory = [] } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Connect to the new FastAPI backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    try {
      const response = await fetch(`${backendUrl}/v1/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          k: 10,
          session_id: null,
          conversation_history: conversationHistory.map((msg: any) => ({
            role: msg.role,
            content: msg.content
          }))
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend responded with status: ${response.status}`);
      }

      const data = await response.json();
      
      return NextResponse.json({
        response: data.answer,
        contextSources: data.sources?.length || 0,
        validation: {},
        timestamp: new Date().toISOString()
      });

    } catch (backendError) {
      console.error('Backend connection error:', backendError);
      return NextResponse.json({
        response: 'I encountered an error connecting to the backend. Please ensure the backend is running on port 8000.',
        contextSources: 0,
        validation: {},
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Chat API endpoint is running',
    endpoints: {
      POST: '/api/chat - Send a message to the AI'
    }
  });
}
