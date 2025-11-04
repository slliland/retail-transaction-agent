import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function GET() {
  try {
    // Check if backend files exist
    const backendPath = path.join(process.cwd(), '..', 'backend');
    const requiredFiles = [
      'rag_system.py',
      'vector_store.py',
      'validation_system.py'
    ];

    const fs = require('fs');
    const missingFiles = requiredFiles.filter(file => 
      !fs.existsSync(path.join(backendPath, file))
    );

    if (missingFiles.length > 0) {
      return NextResponse.json({
        status: 'unhealthy',
        message: 'Missing backend files',
        missingFiles,
        timestamp: new Date().toISOString()
      }, { status: 503 });
    }

    // Check if Python dependencies are available
    return new Promise<NextResponse>((resolve) => {
      const python = spawn('python', ['-c', `
import sys
try:
    import pandas
    import chromadb
    from sentence_transformers import SentenceTransformer
    print('OK')
except ImportError as e:
    print(f'IMPORT_ERROR: {e}')
    sys.exit(1)
`], {
        cwd: backendPath,
        env: { ...process.env }
      });

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0 && output.trim() === 'OK') {
          resolve(NextResponse.json({
            status: 'healthy',
            message: 'All systems operational',
            backend: {
              path: backendPath,
              files: requiredFiles,
              dependencies: 'OK'
            },
            timestamp: new Date().toISOString()
          }));
        } else {
          resolve(NextResponse.json({
            status: 'unhealthy',
            message: 'Python dependencies missing',
            error: errorOutput || output,
            timestamp: new Date().toISOString()
          }, { status: 503 }));
        }
      });

      python.on('error', (error) => {
        resolve(NextResponse.json({
          status: 'unhealthy',
          message: 'Failed to check Python dependencies',
          error: error.message,
          timestamp: new Date().toISOString()
        }, { status: 503 }));
      });
    });

  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
