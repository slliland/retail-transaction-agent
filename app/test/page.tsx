"use client";

import { useState, useEffect } from "react";
import { logger } from "@/lib/logger";

export default function TestPage() {
  const [apiUrl, setApiUrl] = useState("");
  const [healthStatus, setHealthStatus] = useState("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL || "NOT SET";
    setApiUrl(url);
    
    if (url !== "NOT SET") {
      testConnection(url);
    }
  }, []);

  const testConnection = async (url: string) => {
    try {
      logger.log("Testing connection to:", url);
      const response = await fetch(`${url}/health`, {
        method: "GET",
        mode: "cors",
      });
      logger.log("Response:", response);
      
      if (response.ok) {
        const data = await response.json();
        logger.log("Data:", data);
        setHealthStatus("connected");
      } else {
        setHealthStatus("error");
        setError(`HTTP ${response.status}`);
      }
    } catch (err: any) {
      logger.error("Connection error:", err);
      setHealthStatus("error");
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-8">Backend Connection Test</h1>
        
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Environment Variable</h2>
            <div className="bg-slate-100 p-4 rounded font-mono text-sm">
              NEXT_PUBLIC_API_URL = {apiUrl || "undefined"}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
            <div className={`p-4 rounded font-semibold ${
              healthStatus === "connected" ? "bg-green-100 text-green-800" :
              healthStatus === "error" ? "bg-red-100 text-red-800" :
              "bg-yellow-100 text-yellow-800"
            }`}>
              {healthStatus === "connected" ? "✅ Connected" :
               healthStatus === "error" ? `❌ Error: ${error}` :
               "🔄 Checking..."}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Manual Test</h2>
            <button
              onClick={() => testConnection(apiUrl)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Test Connection Again
            </button>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Direct Links</h2>
            <div className="space-y-2">
              <a 
                href={`${apiUrl}/health`}
                target="_blank"
                className="block text-blue-600 hover:underline"
              >
                {apiUrl}/health
              </a>
              <a 
                href={`${apiUrl}/docs`}
                target="_blank"
                className="block text-blue-600 hover:underline"
              >
                {apiUrl}/docs
              </a>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Troubleshooting</h2>
            <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
              <li>Check that backend is running: <code className="bg-slate-100 px-2 py-1 rounded">ps aux | grep uvicorn</code></li>
              <li>Check backend health directly: <code className="bg-slate-100 px-2 py-1 rounded">curl http://localhost:8000/health</code></li>
              <li>Restart frontend: <code className="bg-slate-100 px-2 py-1 rounded">pkill -f "next dev" && cd test-client && npm run dev</code></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t">
          <a href="/" className="text-blue-600 hover:underline">← Back to main app</a>
        </div>
      </div>
    </div>
  );
}

