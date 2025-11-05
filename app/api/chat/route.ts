import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let message: string = '';
    let conversationHistory: any[] = [];
    let files: File[] = [];
    
    // Check if this is multipart/form-data (file upload) or JSON
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      message = formData.get('message') as string || '';
      const historyStr = formData.get('conversationHistory') as string;
      if (historyStr) {
        try {
          conversationHistory = JSON.parse(historyStr);
        } catch (e) {
          console.error('Failed to parse conversationHistory:', e);
        }
      }
      
      // Get all files
      const fileEntries = formData.getAll('files');
      files = fileEntries.filter((entry): entry is File => entry instanceof File);
    } else {
      // Regular JSON request
      const body = await request.json();
      message = body.message;
      conversationHistory = body.conversationHistory || [];
    }

    if (!message && files.length === 0) {
      return NextResponse.json(
        { error: 'Message or file is required' },
        { status: 400 }
      );
    }

    // Connect to the new FastAPI backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    try {
      let response;
      if (files.length > 0) {
        // Send files using FormData
        const formData = new FormData();
        formData.append('message', message || '');
        formData.append('conversation_history', JSON.stringify(conversationHistory.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        }))));
        
        // Append all files
        for (const file of files) {
          formData.append('files', file);
        }
        
        response = await fetch(`${backendUrl}/v1/ask`, {
          method: 'POST',
          body: formData,
        });
      } else {
        // Regular JSON request
        response = await fetch(`${backendUrl}/v1/ask`, {
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
      }

      if (!response.ok) {
        throw new Error(`Backend responded with status: ${response.status}`);
      }

      const data = await response.json();
      
      return NextResponse.json({
        response: data.answer,
        contextSources: data.sources?.length || 0,
        validation: {},
        timestamp: new Date().toISOString(),
        progressSteps: data.progress_steps || []
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
