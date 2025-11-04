import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';

    // Connect to the new FastAPI backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    try {
      if (action === 'stats') {
        // For now, return basic stats since we don't have a stats endpoint in the new backend
        return NextResponse.json({
          total_documents: 'Connected to new backend',
          collection_name: '2024 Transactions Data',
          status: 'active'
        });
      }

      if (action === 'suggestions') {
        const { searchParams } = new URL(request.url);
        const userMessage = searchParams.get('user_message') || null;
        
        // Build URL with optional user_message parameter
        let url = `${backendUrl}/v1/suggested-questions`;
        if (userMessage) {
          url += `?user_message=${encodeURIComponent(userMessage)}`;
        }
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.error(`Backend suggested-questions endpoint failed: ${response.status} ${response.statusText}`);
          throw new Error(`Backend responded with status: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Data API: Suggested questions response:', data);
        
        // Backend returns { questions: [...], categories: {...} }
        // Return the questions array directly for easier frontend consumption
        return NextResponse.json(data.questions || data);
      }

      return NextResponse.json({
        error: 'Invalid action. Use ?action=stats or ?action=suggestions'
      }, { status: 400 });

    } catch (backendError) {
      console.error('Backend connection error:', backendError);
      return NextResponse.json({
        error: 'Failed to connect to backend',
        message: 'Please ensure the backend is running on port 8000'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Data API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json();

    if (action === 'upload') {
      // Handle data file upload
      return NextResponse.json({
        message: 'Data upload functionality will be implemented',
        action,
        received: !!data
      });
    }

    return NextResponse.json({
      error: 'Invalid action'
    }, { status: 400 });

  } catch (error) {
    console.error('Data API POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
