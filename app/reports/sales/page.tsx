'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from "@/lib/logger";
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ComposedChart, Line, Legend, ReferenceArea, LineChart } from 'recharts';
import { ChevronLeft, ChevronRight, DollarSign, TrendingUp, Users, ShoppingCart, Package } from 'lucide-react';
import TopNav from '../../components/TopNav';
import Sidebar from '../../components/Sidebar';
import { supabase, getCurrentUser } from '@/lib/supabase';
import { getUserSessions, type ChatSession } from '@/lib/supabase-chat';
import { useUser } from '@/app/contexts/UserContext';

interface TimeSeriesPoint {
  period: string;
  total_sales: number;
}

interface EntityTotalSales {
  entity_id: string;
  total_sales: number;
}

interface OverallKPI {
  total_sales: number;
  total_transactions: number;
  avg_sales_per_transaction: number;
  total_entities: number;
  top_product_group: string;
  top_product_group_sales: number;
  sales_growth_rate?: number;
  period_start: string;
  period_end: string;
}

export default function SalesOverviewPage() {
  const router = useRouter();
  const [periodMonths, setPeriodMonths] = useState(0);
  const [granularity, setGranularity] = useState<'day'|'week'|'month'>('day');
  const [entityLimit, setEntityLimit] = useState(20);
  const [productGroup, setProductGroup] = useState<string>('ALL');
  const [mode, setMode] = useState<'aggregate'|'points'>('points');
  const [overviewSeries, setOverviewSeries] = useState<TimeSeriesPoint[]>([]);
  const [overviewByEntity, setOverviewByEntity] = useState<EntityTotalSales[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [heatmapProductGroups, setHeatmapProductGroups] = useState<string[]>([]);
  const [overallKPIs, setOverallKPIs] = useState<OverallKPI | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false); // Track when all data is ready
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { userEmail: contextUserEmail, avatarUrl: contextAvatarUrl, userId: contextUserId } = useUser();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(contextUserEmail);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(contextAvatarUrl);
  const [conversations, setConversations] = useState<Array<{id: string, title: string, timestamp: string}>>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  // Visualization tab for Sales Over Time
  const [chartView, setChartView] = useState<'sales' | 'boxplot'>('sales'); // 'sales' = simple bars, 'boxplot' = boxplots

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const periodLabel = (() => {
    if (periodMonths === 0) return 'All time';
    return `${periodMonths} months`;
  })();

  const granularityLabel = (() => {
    if (granularity === 'day') return 'Daily';
    if (granularity === 'week') return 'Weekly';
    return 'Monthly';
  })();

  // Calculate linear regression trendline (overall slope across the period)
  const calculateLinearRegression = useCallback((data: TimeSeriesPoint[]) => {
    if (data.length === 0) return [];
    
    // Convert periods to numeric indices for regression
    const xValues = data.map((_, i) => i);
    const yValues = data.map(p => p.total_sales);
    
    // Calculate means
    const n = data.length;
    const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
    const yMean = yValues.reduce((sum, y) => sum + y, 0) / n;
    
    // Calculate slope (a) and intercept (b): y = a*x + b
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
      denominator += Math.pow(xValues[i] - xMean, 2);
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;
    
    // Generate trendline points
    return data.map((point, i) => ({
      ...point,
      trendline: slope * i + intercept
    }));
  }, []);

  // Calculate boxplot statistics for each time period
  // For points mode: group by period and calculate quartiles
  // For aggregate mode: each point is already aggregated, so just show the values with IQR calculated from the series
  const calculateBoxplotData = useCallback((data: TimeSeriesPoint[], mode: 'points' | 'aggregate') => {
    if (data.length === 0) return [];
    
    if (mode === 'points') {
      // Group by period and calculate quartiles for each period
      const groupedByPeriod = new Map<string, number[]>();
      
      data.forEach(point => {
        const period = point.period;
        if (!groupedByPeriod.has(period)) {
          groupedByPeriod.set(period, []);
        }
        groupedByPeriod.get(period)!.push(point.total_sales);
      });
      
      // Calculate quartiles for each period
      const boxplotData = Array.from(groupedByPeriod.entries()).map(([period, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;
        
        const q1 = sorted[Math.floor(n * 0.25)];
        const median = n % 2 === 0 
          ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 
          : sorted[Math.floor(n / 2)];
        const q3 = sorted[Math.floor(n * 0.75)];
        const min = sorted[0];
        const max = sorted[n - 1];
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        
        // IQR and whiskers
        const iqr = q3 - q1;
        const lowerWhisker = Math.max(min, q1 - 1.5 * iqr);
        const upperWhisker = Math.min(max, q3 + 1.5 * iqr);
        
        return {
          period,
          min: lowerWhisker,
          q1,
          median,
          q3,
          max: upperWhisker,
          iqr: q3 - q1, // IQR for stacked bar visualization
          mean,
          actualMin: min,
          actualMax: max,
          outliers: values.filter(v => v < lowerWhisker || v > upperWhisker)
        };
      });
      
      return boxplotData.sort((a, b) => a.period.localeCompare(b.period));
    } else {
      // For aggregate mode, each point is already aggregated
      // Calculate overall quartiles from the aggregated values for reference
      const values = data.map(p => p.total_sales).sort((a, b) => a - b);
      const n = values.length;
      const overallQ1 = values[Math.floor(n * 0.25)];
      const overallMedian = n % 2 === 0 
        ? (values[n / 2 - 1] + values[n / 2]) / 2 
        : values[Math.floor(n / 2)];
      const overallQ3 = values[Math.floor(n * 0.75)];
      
      // Return data with quartile info for visualization
      return data.map(point => ({
        period: point.period,
        total_sales: point.total_sales,
        median: overallMedian,
        q1: overallQ1,
        q3: overallQ3,
        min: values[0],
        max: values[n - 1]
      }));
    }
  }, []);

  // Load user data
  useEffect(() => {
    // Use context values immediately
    setUserEmail(contextUserEmail);
    setAvatarUrl(contextAvatarUrl);
    
    const loadUser = async () => {
      try {
        if (supabase && contextUserId) {
            // Load conversations from Supabase
            const dbSessions = await getUserSessions(contextUserId);
            if (dbSessions.length > 0) {
              const formattedConversations = dbSessions.map((session: ChatSession) => {
                let title = session.title;
                if (!title || title.trim() === '' || title === 'New Chat') {
                  const date = new Date(session.created_at);
                  const timeStr = date.toLocaleTimeString(undefined, { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  });
                  const dateStr = date.toLocaleDateString(undefined, { 
                    month: 'short', 
                    day: 'numeric' 
                  });
                  title = `Chat ${dateStr} ${timeStr}`;
                }
                return {
                  id: session.id,
                  title: title,
                  timestamp: new Date(session.created_at).toLocaleString(),
                };
              });
              setConversations(formattedConversations);
              if (formattedConversations.length > 0) {
                setSelectedConversationId(formattedConversations[0].id);
              }
            }
        }
      } catch (error) {
        logger.error('Error loading conversations:', error);
      }
    };

    if (contextUserId) {
      loadUser();
    }
  }, [contextUserEmail, contextAvatarUrl, contextUserId]);

  // Product groups are hardcoded: A, C, D, E, All (no API call needed)

  // Load all data together - only show final state when everything is ready
  // Use ref to prevent multiple simultaneous fetches
  const loadingRef = React.useRef(false);
  
  useEffect(() => {
    // Prevent multiple simultaneous fetches
    if (loadingRef.current) {
      logger.log('⏸️ Load already in progress, skipping...');
      return;
    }
    
    logger.log(`📊 Fetching data: period=${periodMonths}, granularity=${granularity}, entities=${entityLimit}, productGroup=${productGroup}, mode=${mode}`);
    
    const loadAllData = async () => {
      loadingRef.current = true;
      setLoading(true);
      setDataReady(false); // Hide all data until everything is loaded
      
      try {
        // Fetch all data in parallel for speed
        const byEntityUrl = `http://localhost:8000/v1/report/overview/by-entity?period_months=${periodMonths}&limit=${entityLimit}&product_group=${encodeURIComponent(productGroup)}`;
        logger.log(`🔗 Fetching by-entity: ${byEntityUrl}`);
        
        const [tsResp, beResp, hmResp, kpiResp] = await Promise.all([
          fetch(`http://localhost:8000/v1/report/overview/time-series?granularity=${granularity}&period_months=${periodMonths}&product_group=${encodeURIComponent(productGroup)}&mode=${mode}`),
          fetch(byEntityUrl),
          fetch(`http://localhost:8000/v1/report/overview/heatmap?period_months=${periodMonths}`),
          fetch(`http://localhost:8000/v1/report/overview/kpis?period_months=${periodMonths}&product_group=${encodeURIComponent(productGroup)}&entity_limit=${entityLimit}`)
        ]);
        
        // Check all responses
        if (!tsResp.ok) throw new Error(`Time-series failed: ${tsResp.status}`);
        if (!beResp.ok) throw new Error(`By-entity failed: ${beResp.status}`);
        if (!hmResp.ok) throw new Error(`Heatmap failed: ${hmResp.status}`);
        if (!kpiResp.ok) throw new Error(`KPIs failed: ${kpiResp.status}`);
        
        // Parse all data
        const [tsData, beData, hmData, kpiData] = await Promise.all([
          tsResp.json(),
          beResp.json(),
          hmResp.json(),
          kpiResp.json()
        ]);
        
        // Update all state at once - only show final complete data
        logger.log(`✅ Data received: timeSeries=${Array.isArray(tsData) ? tsData.length : 0}, byEntity=${Array.isArray(beData) ? beData.length : 0}, KPIs=${kpiData ? 'ok' : 'null'}`);
        setOverviewSeries(Array.isArray(tsData) ? tsData : []);
        setOverviewByEntity(Array.isArray(beData) ? beData : []);
        setOverallKPIs(kpiData);
        if (hmData.heatmap && Array.isArray(hmData.heatmap)) {
          setHeatmapData(hmData.heatmap);
          setHeatmapProductGroups(Array.isArray(hmData.product_groups) ? hmData.product_groups : []);
        } else {
          setHeatmapData([]);
          setHeatmapProductGroups([]);
        }
        setCurrentPage(1);
        
        // Mark data as ready - now show it
        setDataReady(true);
      } catch (e) {
        // On error, set empty states
        setOverviewSeries([]);
        setOverviewByEntity([]);
        setHeatmapData([]);
        setHeatmapProductGroups([]);
        setOverallKPIs(null);
        setDataReady(false);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    };
    
    loadAllData();
  }, [granularity, periodMonths, productGroup, mode, entityLimit]);

  // Compute trendline data (linear regression)
  const trendlineData = useMemo(() => {
    return calculateLinearRegression(overviewSeries);
  }, [overviewSeries, calculateLinearRegression]);

  // Compute boxplot data (distribution over time)
  const boxplotData = useMemo(() => {
    return calculateBoxplotData(overviewSeries, mode);
  }, [overviewSeries, mode, calculateBoxplotData]);

  const handleSidebarAction = (action: string) => {
    switch (action) {
      case 'chat':
        router.push('/chat');
        break;
      case 'reports':
        router.push('/reports');
        break;
      case 'settings':
        router.push('/settings');
        break;
      default:
        break;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopNav 
        onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      
      <div className="flex">
        <Sidebar 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          conversations={conversations}
          selectedId={selectedConversationId}
          onSelectConversation={(id) => {
            setSelectedConversationId(id);
            router.push('/chat');
          }}
          onNewChat={() => router.push('/chat')}
          onAction={handleSidebarAction}
          currentPage="sales"
          userEmail={userEmail || undefined}
          avatarUrl={avatarUrl || undefined}
        />
        
        <div className={`flex-1 p-6 pt-24 transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-0'}`}>
          {/* Fixed Back Button - stays with top nav when scrolling */}
          <div className={`fixed top-20 right-6 z-30 transition-all duration-300 ${isSidebarOpen ? 'lg:right-72' : 'lg:right-6'}`}>
            <Button
              onClick={() => router.push('/reports')}
              className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-md font-body text-sm shadow-lg"
            >
              Back
            </Button>
          </div>
          
          <div className="max-w-7xl mx-auto w-full">
            <div className="mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white font-title">Sales Overview</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 font-body">
                  Comprehensive analysis of sales performance across all entities
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="mb-6 flex gap-4 items-center flex-wrap justify-center">
              <div className="flex items-center gap-2">
                <span className="text-xs italic text-gray-500 dark:text-gray-400 font-body">Period:</span>
                <Select value={periodMonths.toString()} onValueChange={(v) => { const n = parseInt(v); setPeriodMonths(n); }}>
                  <SelectTrigger className="w-[120px] h-9 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md shadow-sm data-[state=open]:shadow data-[state=open]:ring-1 data-[state=open]:ring-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg z-50 backdrop-blur-none">
                    <SelectItem value="0">All time</SelectItem>
                    <SelectItem value="3">3 months</SelectItem>
                    <SelectItem value="6">6 months</SelectItem>
                    <SelectItem value="12">12 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs italic text-gray-500 dark:text-gray-400 font-body">Granularity:</span>
                <Select value={granularity} onValueChange={(v) => { setGranularity(v as any); }}>
                  <SelectTrigger className="w-[120px] h-9 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md shadow-sm data-[state=open]:shadow data-[state=open]:ring-1 data-[state=open]:ring-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg z-50 backdrop-blur-none">
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 font-body">Entities:</span>
                <Select value={entityLimit.toString()} onValueChange={(v) => { 
                  const n = parseInt(v, 10); 
                  logger.log(`🔄 Entities changed: ${entityLimit} -> ${n}`);
                  setEntityLimit(n);
                  setCurrentPage(1); // Reset to first page when limit changes
                }}>
                  <SelectTrigger className="w-[120px] h-9 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md shadow-sm data-[state=open]:shadow data-[state=open]:ring-1 data-[state=open]:ring-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg z-50 backdrop-blur-none">
                    <SelectItem value="20">Top 20</SelectItem>
                    <SelectItem value="50">Top 50</SelectItem>
                    <SelectItem value="100">Top 100</SelectItem>
                    <SelectItem value="500">Top 500</SelectItem>
                    <SelectItem value="1000">Top 1000</SelectItem>
                    <SelectItem value="0">All entities</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 font-body">Product Group:</span>
                <Select value={productGroup} onValueChange={(v) => { setProductGroup(v); }}>
                  <SelectTrigger className="w-[160px] h-9 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md shadow-sm data-[state=open]:shadow data-[state=open]:ring-1 data-[state=open]:ring-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg z-50 backdrop-blur-none">
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                    <SelectItem value="D">D</SelectItem>
                    <SelectItem value="E">E</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 font-body">Mode:</span>
                <Select value={mode} onValueChange={(v) => { setMode(v as any); }}>
                  <SelectTrigger className="w-[140px] h-9 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md shadow-sm data-[state=open]:shadow data-[state=open]:ring-1 data-[state=open]:ring-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg z-50 backdrop-blur-none">
                    <SelectItem value="points">Per-row points</SelectItem>
                    <SelectItem value="aggregate">Aggregated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Overall KPIs Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  {loading || !overallKPIs ? (
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 font-body">Total Sales</p>
                        <div className="mt-1 h-8 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded"></div>
                      </div>
                      <DollarSign className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 font-body">Total Sales</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                          {formatCurrency(overallKPIs.total_sales)}
                        </p>
                      </div>
                      <DollarSign className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  {loading || !overallKPIs ? (
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 font-body">Avg Sales/Transaction</p>
                        <div className="mt-1 h-8 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded"></div>
                      </div>
                      <ShoppingCart className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 font-body">Avg Sales/Transaction</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                          {formatCurrency(overallKPIs.avg_sales_per_transaction)}
                        </p>
                      </div>
                      <ShoppingCart className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  {loading || !overallKPIs ? (
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 font-body">Total Entities</p>
                        <div className="mt-1 h-8 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded"></div>
                      </div>
                      <Users className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 font-body">Total Entities</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                          {overallKPIs.total_entities.toLocaleString()}
                        </p>
                      </div>
                      <Users className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  {loading || !overallKPIs ? (
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 font-body">Growth Rate/Period</p>
                        <div className="mt-1 h-8 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded"></div>
                      </div>
                      <TrendingUp className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 font-body">
                          {overallKPIs.sales_growth_rate !== null && overallKPIs.sales_growth_rate !== undefined 
                            ? 'Growth Rate/Period' 
                            : 'Top Product Group'}
                        </p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                          {overallKPIs.sales_growth_rate !== null && overallKPIs.sales_growth_rate !== undefined ? (
                            <span className={overallKPIs.sales_growth_rate >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {overallKPIs.sales_growth_rate >= 0 ? '+' : ''}{overallKPIs.sales_growth_rate.toFixed(1)}%
                            </span>
                          ) : (
                            overallKPIs.top_product_group
                          )}
                        </p>
                        {overallKPIs.sales_growth_rate === null && overallKPIs.sales_growth_rate === undefined && (
                          <p className="text-xs text-gray-500 mt-1">
                            {formatCurrency(overallKPIs.top_product_group_sales)}
                          </p>
                        )}
                      </div>
                      {overallKPIs.sales_growth_rate !== null && overallKPIs.sales_growth_rate !== undefined ? (
                        <TrendingUp className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                      ) : (
                        <Package className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="space-y-6">
              <Card id="sales-over-time" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="font-body">
                    Sales Over Time
                    <span className="text-xs italic text-gray-500 dark:text-gray-400 font-body ml-2">• {periodLabel} • {granularityLabel}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading || !dataReady ? (
                    <div className="h-80 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    </div>
                  ) : (
                    <Tabs value={chartView} onValueChange={(v) => setChartView(v as 'sales' | 'boxplot')} className="w-full">
                      <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
                        <TabsTrigger value="sales">Sales Over Time</TabsTrigger>
                        <TabsTrigger value="boxplot">Box Plot</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="sales" className="mt-0">
                        {/* PURE Sales Over Time - simple bars ONLY, NO trends, NO dots, NO fancy features */}
                        <ResponsiveContainer width="100%" height={500}>
                          <BarChart 
                            data={overviewSeries}
                            key={`sales-bars-${granularity}-${periodMonths}-${productGroup}-${mode}`}
                            margin={{ top: 20, right: 30, left: 0, bottom: 80 }}
                            barGap={0}
                            barCategoryGap={"2%"}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" opacity={0.5} />
                            <XAxis 
                              dataKey="period" 
                              minTickGap={20}
                              stroke="#6B7280"
                              style={{ fontSize: '12px' }}
                              angle={-35}
                              textAnchor="end"
                              height={80}
                            />
                            <YAxis 
                              tickFormatter={(v) => formatCurrency(v)}
                              stroke="#6B7280"
                              style={{ fontSize: '12px' }}
                            />
                            <Tooltip 
                              formatter={(value: any) => formatCurrency(Number(value))}
                              contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid #E5E7EB',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                              }}
                              labelStyle={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}
                            />
                            <Legend />
                            <Bar 
                              dataKey="total_sales" 
                              fill="#000000" 
                              fillOpacity={1}
                              stroke="#000000"
                              strokeWidth={0}
                              maxBarSize={10}
                              name="Sales"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </TabsContent>
                      
                      <TabsContent value="boxplot" className="mt-0">
                        {/* Box Plot Chart - boxplots only */}
                        {mode === 'points' && boxplotData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={500}>
                            <ComposedChart 
                              data={boxplotData} 
                              key={`boxplot-${granularity}-${periodMonths}-${productGroup}-${mode}`} 
                              margin={{ top: 20, right: 30, left: 0, bottom: 80 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" opacity={0.5} />
                              <XAxis 
                                dataKey="period" 
                                minTickGap={20}
                                stroke="#6B7280"
                                style={{ fontSize: '12px' }}
                                angle={-35}
                                textAnchor="end"
                                height={80}
                              />
                              <YAxis 
                                tickFormatter={(v) => formatCurrency(v)}
                                stroke="#6B7280"
                                style={{ fontSize: '12px' }}
                              />
                              <Tooltip 
                                formatter={(value: any, name: string) => {
                                  if (name === 'median') return [formatCurrency(Number(value)), 'Median'];
                                  if (name === 'q1') return [formatCurrency(Number(value)), 'Q1 (25th percentile)'];
                                  if (name === 'q3') return [formatCurrency(Number(value)), 'Q3 (75th percentile)'];
                                  if (name === 'min') return [formatCurrency(Number(value)), 'Min (Whisker)'];
                                  if (name === 'max') return [formatCurrency(Number(value)), 'Max (Whisker)'];
                                  if (name === 'mean') return [formatCurrency(Number(value)), 'Mean'];
                                  return [formatCurrency(Number(value)), name];
                                }}
                                contentStyle={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                  border: '1px solid #E5E7EB',
                                  borderRadius: '8px',
                                  padding: '8px 12px',
                                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}
                                labelStyle={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}
                              />
                              <Legend />
                              <Bar 
                                dataKey="q1" 
                                fill="#E5E7EB" 
                                fillOpacity={0.8} 
                                name="Q1" 
                                stackId="box"
                              />
                              <Bar 
                                dataKey="iqr" 
                                fill="#3B82F6" 
                                fillOpacity={0.4} 
                                name="IQR (Q1-Q3)"
                                stackId="box"
                              />
                              <Line 
                                type="monotone" 
                                dataKey="median" 
                                stroke="#111827" 
                                strokeWidth={2.5}
                                dot={{ r: 5, fill: '#111827', stroke: '#fff', strokeWidth: 2 }}
                                name="Median"
                                connectNulls={true}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="min" 
                                stroke="#9CA3AF" 
                                strokeWidth={1}
                                strokeDasharray="2 2"
                                dot={{ r: 3, fill: '#9CA3AF' }}
                                name="Min (Whisker)"
                                connectNulls={true}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="max" 
                                stroke="#9CA3AF" 
                                strokeWidth={1}
                                strokeDasharray="2 2"
                                dot={{ r: 3, fill: '#9CA3AF' }}
                                name="Max (Whisker)"
                                connectNulls={true}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-80 flex items-center justify-center">
                            <p className="text-gray-500 dark:text-gray-400 font-body">
                              Box plots are only available in "points" mode. Please switch Mode to "Points" to view box plots.
                            </p>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  )}
                </CardContent>
              </Card>

              <Card id="sales-by-entity" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="font-body">
                    Sales by Entity {entityLimit > 0 ? `(Top ${entityLimit})` : '(All)'}
                    <span className="text-xs italic text-gray-500 dark:text-gray-400 font-body ml-2">• {periodLabel}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading || !dataReady ? (
                    <div className="h-80 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const totalItems = overviewByEntity.length;
                        const totalPages = Math.ceil(totalItems / itemsPerPage);
                        const startIndex = (currentPage - 1) * itemsPerPage;
                        const endIndex = startIndex + itemsPerPage;
                        const paginatedData = overviewByEntity.slice(startIndex, endIndex);
                        
                        return (
                          <>
                            <ResponsiveContainer width="100%" height={400}>
                              <BarChart data={paginatedData} layout="vertical" key={`be-${periodMonths}-${productGroup}-${entityLimit}-page${currentPage}`}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickFormatter={(v) => `$${Intl.NumberFormat('en', {notation: 'compact'}).format(Number(v))}`} />
                                <YAxis type="category" dataKey="entity_id" width={220} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                                <Bar dataKey="total_sales" fill="#111827" radius={[0,4,4,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                            
                            {totalPages > 1 && (
                              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                                <div className="text-sm text-gray-600 dark:text-gray-400 font-body">
                                  Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems} entities
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 px-3 bg-gray-800 hover:bg-gray-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                    variant="ghost"
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                  </Button>
                                  <span className="text-sm font-body text-gray-700 dark:text-gray-300">
                                    Page {currentPage} of {totalPages}
                                  </span>
                                  <Button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 px-3 bg-gray-800 hover:bg-gray-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                    variant="ghost"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Sales Heatmap */}
              <Card id="sales-heatmap" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="font-body">
                    Sales Heatmap
                    <span className="text-xs italic text-gray-500 dark:text-gray-400 font-body ml-2">• {periodLabel}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading || !dataReady ? (
                    <div className="h-80 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    </div>
                  ) : heatmapData.length === 0 ? (
                    <div className="h-80 flex items-center justify-center text-gray-500">
                      No heatmap data available
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Enhanced Color Legend with Detailed Statistics */}
                      {(() => {
                        const allValues = heatmapData.flatMap((row) =>
                          heatmapProductGroups.map((pg) => Number(row[pg] || 0))
                        );
                        const nonZeroValues = allValues.filter(v => v > 0);
                        const globalMax = Math.max(...allValues, 1);
                        const globalMin = Math.min(...nonZeroValues, 0);
                        const totalSales = allValues.reduce((sum, v) => sum + v, 0);
                        const sumNonZero = nonZeroValues.reduce((sum, v) => sum + v, 0);
                        const avgSales = nonZeroValues.length > 0 ? sumNonZero / nonZeroValues.length : 0;
                        // Proper median calculation
                        const medianSales = (() => {
                          if (nonZeroValues.length === 0) return 0;
                          const sorted = [...nonZeroValues].sort((a, b) => a - b);
                          const mid = Math.floor(sorted.length / 2);
                          return sorted.length % 2 === 0 
                            ? (sorted[mid - 1] + sorted[mid]) / 2 
                            : sorted[mid];
                        })();
                        const totalCells = allValues.length;
                        const nonZeroCells = nonZeroValues.length;
                        const steps = 10;
                        
                        // Calculate percentile values for legend
                        const sortedValues = [...nonZeroValues].sort((a, b) => a - b);
                        const percentileValues = [0, 25, 50, 75, 100].map(p => {
                          if (sortedValues.length === 0) return 0;
                          const index = Math.floor((p / 100) * (sortedValues.length - 1));
                          return sortedValues[index];
                        });
                        
                        return (
                          <div className="space-y-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                            {/* Statistics Summary */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-800">
                                <div className="text-blue-600 dark:text-blue-400 font-semibold mb-1">Total Sales</div>
                                <div className="text-blue-900 dark:text-blue-100 font-bold text-sm">{formatCurrency(totalSales)}</div>
                              </div>
                              <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800">
                                <div className="text-green-600 dark:text-green-400 font-semibold mb-1">Average</div>
                                <div className="text-green-900 dark:text-green-100 font-bold text-sm">{formatCurrency(avgSales)}</div>
                              </div>
                              <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded border border-purple-200 dark:border-purple-800">
                                <div className="text-purple-600 dark:text-purple-400 font-semibold mb-1">Median</div>
                                <div className="text-purple-900 dark:text-purple-100 font-bold text-sm">{formatCurrency(medianSales)}</div>
                              </div>
                              <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded border border-orange-200 dark:border-orange-800">
                                <div className="text-orange-600 dark:text-orange-400 font-semibold mb-1">Data Points</div>
                                <div className="text-orange-900 dark:text-orange-100 font-bold text-sm">
                                  {nonZeroCells.toLocaleString()} / {totalCells.toLocaleString()}
                                  <span className="text-xs font-normal ml-1">
                                    ({((nonZeroCells / totalCells) * 100).toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Color Gradient Legend with Percentiles */}
                            <div className="flex flex-col md:flex-row md:items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 font-body">Color Scale:</span>
                                <span className="text-xs text-gray-600 dark:text-gray-400">Low → High</span>
                              </div>
                              <div className="flex-1 flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-gray-500 min-w-[60px]">Min:</span>
                                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{formatCurrency(globalMin)}</span>
                                <div className="flex-1 flex gap-0.5 items-center">
                                  {Array.from({ length: steps }, (_, i) => {
                                    const intensity = i / (steps - 1);
                                    const bgColor = `rgba(59, 130, 246, ${0.15 + intensity * 0.75})`;
                                    const value = globalMin + (globalMax - globalMin) * intensity;
                                    const percentile = i <= steps / 4 ? 'P0-25' : i <= steps / 2 ? 'P25-50' : i <= steps * 3 / 4 ? 'P50-75' : 'P75-100';
                                    return (
                                      <div
                                        key={i}
                                        className="flex-1 h-6 border border-gray-300 dark:border-gray-600 cursor-help group relative"
                                        style={{ backgroundColor: bgColor }}
                                        title={`${percentile}: ${formatCurrency(value)}`}
                                      >
                                        <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg whitespace-nowrap z-20">
                                          {formatCurrency(value)}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-500 min-w-[60px]">Max:</span>
                                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{formatCurrency(globalMax)}</span>
                              </div>
                            </div>
                            
                            {/* Percentile Breakdown */}
                            <div className="grid grid-cols-5 gap-2 text-xs">
                              <div className="text-center">
                                <div className="text-gray-600 dark:text-gray-400 font-medium">P0 (Min)</div>
                                <div className="text-gray-800 dark:text-gray-200 font-mono text-xs mt-0.5">{formatCurrency(percentileValues[0])}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-600 dark:text-gray-400 font-medium">P25</div>
                                <div className="text-gray-800 dark:text-gray-200 font-mono text-xs mt-0.5">{formatCurrency(percentileValues[1])}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-600 dark:text-gray-400 font-medium">P50 (Median)</div>
                                <div className="text-gray-800 dark:text-gray-200 font-mono text-xs mt-0.5">{formatCurrency(percentileValues[2])}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-600 dark:text-gray-400 font-medium">P75</div>
                                <div className="text-gray-800 dark:text-gray-200 font-mono text-xs mt-0.5">{formatCurrency(percentileValues[3])}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-600 dark:text-gray-400 font-medium">P100 (Max)</div>
                                <div className="text-gray-800 dark:text-gray-200 font-mono text-xs mt-0.5">{formatCurrency(percentileValues[4])}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Heatmap Table */}
                      <div className="overflow-x-auto">
                        <div className="inline-block min-w-full">
                          {(() => {
                            const allValues = heatmapData.flatMap((row) =>
                              heatmapProductGroups.map((pg) => Number(row[pg] || 0))
                            );
                            const globalMax = Math.max(...allValues, 1);
                            
                            return (
                              <table className="min-w-full border-collapse text-xs">
                                <thead>
                                  <tr>
                                    <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-sm">
                                      Month
                                    </th>
                                    {heatmapProductGroups.map((pg) => (
                                      <th
                                        key={pg}
                                        className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800"
                                      >
                                        {pg}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {heatmapData.map((row, rowIdx) => (
                                    <tr 
                                      key={row.month}
                                      className={rowIdx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'}
                                    >
                                      <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 shadow-sm">
                                        {row.month}
                                      </td>
                                      {heatmapProductGroups.map((pg) => {
                                        const value = Number(row[pg] || 0);
                                        const intensity = globalMax > 0 ? value / globalMax : 0;
                                        // Blue gradient: darker blue for higher values (similar to seaborn heatmap)
                                        const bgColor = `rgba(59, 130, 246, ${0.15 + intensity * 0.75})`;
                                        const textColor = intensity > 0.5 ? 'text-white font-semibold' : 'text-gray-900 dark:text-gray-100';
                                        return (
                                          <td
                                            key={pg}
                                            className={`border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center text-xs ${textColor} transition-colors hover:opacity-80`}
                                            style={{ backgroundColor: bgColor }}
                                            title={`${pg} - ${row.month}: ${formatCurrency(value)}`}
                                          >
                                            {value > 0 ? formatCurrency(value) : '-'}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


