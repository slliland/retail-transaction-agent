"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Play, Pause, TrendingUp, Loader2 } from "lucide-react";
import { logger } from "@/lib/logger";

interface SpotlightData {
  narrative: string;
  timestamp: string;
  insights: {
    top_categories?: Array<{ category: string; sales: number; count: number }>;
    regional_trends?: Array<{ state: string; sales: number }>;
    brand_performance?: Array<{ product: string; profit: number }>;
  };
}

export default function SpotlightView() {
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSpotlight();
  }, []);

  const loadSpotlight = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await axios.get(`${apiUrl}/v1/spotlight/preview`);
      setSpotlight(response.data);
    } catch (err) {
      logger.error("Failed to load spotlight:", err);
      setError("Failed to load spotlight data");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Loading insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <TrendingUp className="w-16 h-16 text-gray-400 mb-4" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
        <button
          onClick={loadSpotlight}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full">
            <TrendingUp className="w-10 h-10 text-black dark:text-white" />
          </div>
          <h1 className="text-4xl font-zapfino">Weekly Spotlight</h1>
          <p className="text-gray-600 dark:text-gray-400 font-caslon">AI-powered retail insights</p>
          {spotlight?.timestamp && (
            <p className="text-sm text-gray-500">{new Date(spotlight.timestamp).toLocaleDateString()}</p>
          )}
        </div>

        {/* Narrative */}
        {spotlight?.narrative && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <h2 className="text-xl font-caslon font-semibold mb-4">📊 This Week's Insights</h2>
            <p className="text-gray-700 dark:text-gray-300 font-caslon leading-relaxed whitespace-pre-wrap">
              {spotlight.narrative}
            </p>
          </div>
        )}

        {/* Top Categories */}
        {spotlight?.insights?.top_categories && spotlight.insights.top_categories.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">🏆 Top Categories</h3>
            <div className="space-y-3">
              {spotlight.insights.top_categories.map((cat, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  <span className="font-medium">{cat.category}</span>
                  <span className="text-green-600 dark:text-green-400 font-semibold">
                    ${cat.sales.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Regional Trends */}
        {spotlight?.insights?.regional_trends && spotlight.insights.regional_trends.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">🗺️ Regional Performance</h3>
            <div className="space-y-3">
              {spotlight.insights.regional_trends.map((region, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  <span className="font-medium">{region.state}</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                    ${region.sales.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Brand Performance */}
        {spotlight?.insights?.brand_performance && spotlight.insights.brand_performance.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">💼 Brand Performance</h3>
            <div className="space-y-3">
              {spotlight.insights.brand_performance.map((brand, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  <span className="font-medium">{brand.product}</span>
                  <span className="text-purple-600 dark:text-purple-400 font-semibold">
                    ${brand.profit.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

