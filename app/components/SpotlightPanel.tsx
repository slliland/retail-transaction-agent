"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Loader2, Play, Pause, TrendingUp, MapPin, Package } from "lucide-react";

interface CategoryInsight {
  category: string;
  sales: number;
  profit_margin: number;
  transactions: number;
}

interface RegionInsight {
  state: string;
  sales: number;
  transactions: number;
  avg_transaction: number;
}

interface SpotlightData {
  narrative: string;
  audio_url: string;
  timestamp: string;
  insights: {
    top_categories: CategoryInsight[];
    top_regions: RegionInsight[];
  };
}

export default function SpotlightPanel() {
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchSpotlight();
  }, []);

  const fetchSpotlight = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/spotlight/preview`
      );
      setSpotlight(response.data);

      // Prepare audio if available
      if (response.data.audio_url) {
        const audioUrl = `${process.env.NEXT_PUBLIC_API_URL}${response.data.audio_url}`;
        const audioElement = new Audio(audioUrl);
        audioElement.addEventListener("ended", () => setIsPlaying(false));
        setAudio(audioElement);
      }
    } catch (error: any) {
      console.error("Error fetching spotlight:", error);
      setError(error.response?.data?.detail || error.message || "Failed to load spotlight");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAudio = () => {
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] text-slate-500">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p>Analyzing retail data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] text-red-500">
        <p className="text-lg font-medium mb-2">Failed to load spotlight</p>
        <p className="text-sm text-slate-500">{error}</p>
        <button
          onClick={fetchSpotlight}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!spotlight) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] text-slate-500">
        <p>No spotlight available</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
      {/* Narrative Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3 mb-4">
          <TrendingUp className="w-6 h-6 text-blue-600 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              This Week's Insights
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              {spotlight.narrative}
            </p>
          </div>
        </div>

        {/* Audio Player */}
        {spotlight.audio_url && audio && (
          <div className="mt-4 flex items-center gap-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg">
            <button
              onClick={toggleAudio}
              className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </button>
            <div>
              <p className="font-medium text-slate-900 dark:text-white">
                {isPlaying ? "Playing..." : "Listen to Spotlight"}
              </p>
              <p className="text-sm text-slate-500">AI-narrated insights</p>
            </div>
          </div>
        )}
      </div>

      {/* Top Categories */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Top Performing Categories
          </h3>
        </div>
        <div className="space-y-3">
          {spotlight.insights.top_categories.map((category, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {category.category}
                </p>
                <p className="text-sm text-slate-500">
                  {category.profit_margin.toFixed(1)}% margin • {category.transactions} transactions
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-blue-600">
                  ${formatNumber(category.sales)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Regions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Top Regions
          </h3>
        </div>
        <div className="space-y-3">
          {spotlight.insights.top_regions.map((region, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {region.state}
                </p>
                <p className="text-sm text-slate-500">
                  {region.transactions} transactions • ${formatNumber(region.avg_transaction)} avg
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-blue-600">
                  ${formatNumber(region.sales)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-center text-sm text-slate-500">
        Generated: {formatDate(spotlight.timestamp)}
      </div>
    </div>
  );
}

