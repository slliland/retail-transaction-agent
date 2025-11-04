'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, TrendingUp, DollarSign, BarChart3, PieChart, LineChart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, LineChart as RechartsLineChart, Line, ComposedChart, ReferenceLine } from 'recharts';
import TopNav from '../components/TopNav';
import Sidebar from '../components/Sidebar';
import { supabase, getCurrentUser } from '@/lib/supabase';
import { useEntityFetcher } from '@/lib/useEntityFetcher';
import { getUserSessions, type ChatSession } from '@/lib/supabase-chat';
import { useUser } from '@/app/contexts/UserContext';

interface EntityKPI {
  entity_id: string;
  total_sales: number;
  avg_sales_per_transaction: number;
  top_product_group: string;
  top_product_group_sales: number;
  sales_growth_rate?: number;
  period_start: string;
  period_end: string;
}

interface ProductGroupPerformance {
  product_group_code: string;
  total_sales: number;
  percentage_of_total: number;
}

interface SalesTrend {
  period_end: string;
  total_sales: number;
}

interface SpotlightReport {
  entity_id: string;
  report_period: string;
  kpis: EntityKPI;
  product_group_performance: ProductGroupPerformance[];
  sales_trends: SalesTrend[];
  ai_summary: string;
  generated_at: string;
}

export default function ReportGeneratorPage() {
  const router = useRouter();
  const { userEmail: contextUserEmail, avatarUrl: contextAvatarUrl } = useUser();
  
  // Use the isolated entity fetcher hook
  const { entities, loading: entitiesLoading, error: entitiesError, refetch: refetchEntities } = useEntityFetcher({
    retry: true,
    fallback: true,
  });
  
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [report, setReport] = useState<SpotlightReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodMonths, setPeriodMonths] = useState(12);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(contextUserEmail);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(contextAvatarUrl);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showAllEntities, setShowAllEntities] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [conversations, setConversations] = useState<Array<{id: string, title: string, timestamp: string}>>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);


  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't close if clicking on dropdown items
      if (target.closest('[data-entity-item]')) {
        return;
      }
      if (!target.closest('.entity-search-container') && !target.closest('[data-entity-dropdown]')) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load user and conversations on mount (entities are loaded by the hook automatically)
  useEffect(() => {
    // Use context values immediately
    setUserEmail(contextUserEmail);
    setAvatarUrl(contextAvatarUrl);
    
    const loadUserAndData = async () => {
      try {
        if (supabase) {
      const user = await getCurrentUser();
      if (user) {
        setUserEmail(user.email || null);
            const avatarUrl = user.user_metadata?.avatar_url || null;
            setAvatarUrl(avatarUrl);
            
            // Load conversations from Supabase
            const dbSessions = await getUserSessions(user.id);
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
          } else {
            const savedEmail = localStorage.getItem('userEmail');
            setUserEmail(savedEmail);
          }
      } else {
          const savedEmail = localStorage.getItem('userEmail');
          setUserEmail(savedEmail);
        }
      } catch (error) {
        console.error('Error loading user:', error);
        const savedEmail = localStorage.getItem('userEmail');
        setUserEmail(savedEmail);
      }
    };

    loadUserAndData();
  }, [contextUserEmail, contextAvatarUrl]);

  // Debounce search query for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setShowAllEntities(false); // Reset show all when search changes
    }, 150); // 150ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  // Debug: Log when searchQuery changes
  useEffect(() => {
    console.log('🔍 searchQuery state changed to:', searchQuery);
  }, [searchQuery]);

  // Auto-regenerate report when period changes and report already exists
  useEffect(() => {
    console.log('🔄 periodMonths changed to:', periodMonths, 'report exists:', !!report, 'selectedEntity:', selectedEntity, 'loading:', loading);
    if (report && selectedEntity && !loading) {
      // Only regenerate if we have an existing report
      console.log('🔄 Auto-regenerating report with periodMonths:', periodMonths);
      generateReport();
    }
  }, [periodMonths]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const generateReport = async () => {
    if (!selectedEntity) return;

    setLoading(true);
    try {
      const url = `http://localhost:8000/v1/report/report/${selectedEntity}?period_months=${periodMonths}`;
      console.log('📊 Generating report for entity:', selectedEntity, 'with period_months:', periodMonths);
      console.log('📡 Request URL:', url);
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          alert(`No data found for entity "${selectedEntity}". Please select a different entity.`);
          return;
        } else {
          throw new Error(`Server responded with status: ${response.status}`);
        }
      }
      
      const data = await response.json();
      setReport(data);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  // Optimized similarity search function with early returns
  const getSimilarityScore = (entity: string, query: string): number => {
    if (!query) return 0;
    
    const entityLower = entity.toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Exact match (highest priority) - early return
    if (entityLower === queryLower) return 1000;
    
    // Starts with query (very high priority) - early return
    if (entityLower.startsWith(queryLower)) {
      return 500;
    }
    
    // Contains query as substring (high priority) - early return
    if (entityLower.includes(queryLower)) {
      return 300;
    }
    
    // For short queries, only exact/prefix/contains matches
    if (queryLower.length <= 2) {
      return 0;
    }
    
    // Fast fuzzy matching with early termination
    let matchCount = 0;
    let consecutiveMatches = 0;
    let lastMatchIndex = -1;
    
    // Use indexOf with start position for better performance
    for (let i = 0; i < queryLower.length; i++) {
      const char = queryLower[i];
      const index = entityLower.indexOf(char, lastMatchIndex + 1);
      
      if (index === -1) {
        // Early termination if we can't find a character
        return 0;
      }
      
      matchCount++;
      
      // Check for consecutive matches
      if (index === lastMatchIndex + 1) {
        consecutiveMatches++;
      }
      
      lastMatchIndex = index;
    }
    
    // Calculate score only if all characters matched
    const matchRatio = matchCount / queryLower.length;
    let score = matchRatio * 100;
    score += consecutiveMatches * 20;
    
    // Light penalty for length difference
    const lengthDiff = Math.abs(entity.length - query.length);
    score -= lengthDiff * 0.1;
    
    return Math.max(0, score);
  };

  // Debug entities state (optional - can be removed if not needed)
  React.useEffect(() => {
    if (entities.length > 0) {
      console.log('✅ [Reports] Entities loaded:', entities.length, 'entities');
    }
  }, [entities]);

  // Optimized filtering with all matches - no limits, using debounced query
  const filteredEntities = React.useMemo(() => {
    console.log('🔍 Filtering entities. Total entities:', entities.length, 'Debounced search query:', debouncedSearchQuery);
    
    if (!debouncedSearchQuery) {
      const result = entities.slice(0, 100); // Show first 100 by default
      console.log('📋 No search query, showing first 100 entities:', result.length);
      return result;
    }
    
    // Use a more efficient approach for large datasets
    const queryLower = debouncedSearchQuery.toLowerCase();
    
    // First pass: collect exact matches, prefix matches, and contains matches
    const exactMatches = [];
    const prefixMatches = [];
    const containsMatches = [];
    const fuzzyMatches = [];
    
    for (const entity of entities) {
      const entityLower = entity.toLowerCase();
      
      if (entityLower === queryLower) {
        exactMatches.push({ entity, score: 1000 });
      } else if (entityLower.startsWith(queryLower)) {
        prefixMatches.push({ entity, score: 500 });
      } else if (entityLower.includes(queryLower)) {
        containsMatches.push({ entity, score: 300 });
      } else if (queryLower.length > 2) {
        // Only do fuzzy matching for longer queries
        const score = getSimilarityScore(entity, debouncedSearchQuery);
        if (score > 0) {
          fuzzyMatches.push({ entity, score });
        }
      }
    }
    
    // Combine all matches in priority order
    const allMatches = [
      ...exactMatches,
      ...prefixMatches,
      ...containsMatches,
      ...fuzzyMatches.sort((a, b) => b.score - a.score) // Sort fuzzy matches by score
    ];
    
    const result = allMatches.map(item => item.entity);
    console.log('✨ Filtered entities:', result.length, 'matches for query:', debouncedSearchQuery);
    console.log(`   📊 Breakdown: ${exactMatches.length} exact, ${prefixMatches.length} prefix, ${containsMatches.length} contains, ${fuzzyMatches.length} fuzzy`);
    
    return result;
  }, [entities, debouncedSearchQuery]);

  // Get entities to display (limited or all based on showAllEntities state)
  const displayedEntities = React.useMemo(() => {
    if (showAllEntities) {
      return filteredEntities;
    }
    return filteredEntities.slice(0, 10); // Show first 10 by default
  }, [filteredEntities, showAllEntities]);

  const handleEntitySelect = (entity: string) => {
    console.log('🔵 handleEntitySelect called with entity:', entity);
    
    // Immediately update the input field value if ref exists
    if (searchInputRef.current) {
      searchInputRef.current.value = entity;
    }
    
    // Update all states
    setSelectedEntity(entity);
    setSearchQuery(entity);
    setDebouncedSearchQuery(entity);
    setIsDropdownOpen(false);
    setShowAllEntities(false);
    
    // Force a re-render by triggering input event
    if (searchInputRef.current) {
      const event = new Event('input', { bubbles: true });
      searchInputRef.current.dispatchEvent(event);
    }
    
    console.log('✅ Entity selected, states updated to:', entity);
  };

  const handleShowMore = () => {
    setShowAllEntities(true);
  };

  // Highlight matching characters in entity ID
  const highlightMatch = (entity: string, query: string) => {
    if (!query) return entity;
    
    const parts = [];
    const entityLower = entity.toLowerCase();
    const queryLower = query.toLowerCase();
    let lastIndex = 0;
    
    // Find all occurrences of query characters
    for (let i = 0; i < entity.length; i++) {
      if (entityLower[i] === queryLower[0] && entityLower.substring(i).toLowerCase().startsWith(queryLower)) {
        // Found the query as substring
        if (i > lastIndex) {
          parts.push({ text: entity.substring(lastIndex, i), highlight: false });
        }
        parts.push({ text: entity.substring(i, i + query.length), highlight: true });
        lastIndex = i + query.length;
        break;
      }
    }
    
    if (lastIndex < entity.length) {
      parts.push({ text: entity.substring(lastIndex), highlight: false });
    }
    
    if (parts.length === 0) {
      return entity;
    }

  return (
      <>
        {parts.map((part, idx) => (
          <span key={idx} className={part.highlight ? 'font-bold text-blue-600 bg-blue-50' : ''}>
            {part.text}
          </span>
        ))}
      </>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const downloadPDF = async () => {
    if (!report) return;
    
    try {
      const response = await fetch(
        `http://localhost:8000/v1/report/download-pdf/${report.entity_id}?period_months=${periodMonths}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retail-report-${report.entity_id}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF. Please try again.');
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 overflow-visible">
      <TopNav onMenuClick={() => setIsSidebarOpen(true)} />
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
        onDeleteConversation={() => {
          // Delete handled in chat page, just navigate there
          router.push('/chat');
        }}
        onAction={handleSidebarAction}
        currentPage="reports"
        userEmail={userEmail || undefined}
        avatarUrl={avatarUrl || undefined}
      />

      <div className="pt-16 overflow-visible">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-visible">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white font-title mb-6 flex items-center gap-3">
                  <Image 
                    src="/data-report.png" 
                    alt="Data Report" 
                    width={32} 
                    height={32} 
                    className="object-contain"
                  />
                  Report Generator
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-400 font-body mt-2">
                  Your weekly and monthly chat history with the retail agent
                </p>
              </div>
              <Button 
                onClick={() => router.push('/reports/sales')}
                className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg font-body"
              >
                View Sales Overview
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 overflow-visible">
            <div className="lg:col-span-2 overflow-visible">
              <Card className="overflow-visible">
                <CardHeader className="overflow-visible">
                  <CardTitle className="font-body">Entity Selection</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="relative">
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setIsDropdownOpen(true);
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        placeholder="Type to search entities (e.g., 0 or 000 or 0005fd)..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {isDropdownOpen && filteredEntities.length > 0 && (
                        <div 
                          data-entity-dropdown
                          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto"
                        >
                          {displayedEntities.map((entity) => (
                            <div
                              key={entity}
                              data-entity-item
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('🖱️ MouseDown on entity:', entity);
                                handleEntitySelect(entity);
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('🖱️ Clicked on entity:', entity);
                                handleEntitySelect(entity);
                              }}
                              className="px-4 py-2 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                            >
                              <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{highlightMatch(entity, debouncedSearchQuery)}</div>
                            </div>
                          ))}
                          {!showAllEntities && filteredEntities.length > 10 && (
                            <div 
                              onClick={handleShowMore}
                              className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0 font-medium"
                            >
                              Show {filteredEntities.length - 10} more entities...
                            </div>
                          )}
                        </div>
                      )}
                      {searchQuery && filteredEntities.length === 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg p-4 text-sm text-gray-500 dark:text-gray-400">
                          No entities found matching "{searchQuery}"
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-48">
                        <label className="block text-sm font-medium mb-2">Analysis Period</label>
                        <Select 
                          value={periodMonths.toString()} 
                          onValueChange={(value) => {
                            const numValue = parseInt(value, 10);
                            console.log('📅 Analysis Period dropdown changed from', periodMonths, 'to:', numValue, 'raw value:', value);
                            if (isNaN(numValue)) {
                              console.error('❌ Invalid period value:', value);
                              return;
                            }
                            setPeriodMonths(numValue);
                            console.log('✅ periodMonths state updated to:', numValue);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select period" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3 months</SelectItem>
                            <SelectItem value="6">6 months</SelectItem>
                            <SelectItem value="12">12 months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button 
                        onClick={generateReport} 
                        disabled={!selectedEntity || loading}
                        className={`h-10 px-6 rounded-full transition-all duration-200 ${
                          loading 
                            ? 'bg-gray-600 hover:bg-gray-700 text-white' 
                            : 'bg-gray-800 hover:bg-gray-900 text-white shadow-sm hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          {loading ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                              <span className="text-sm font-medium text-white">Generating...</span>
                            </>
                          ) : (
                            <>
                              <BarChart3 className="h-3 w-3 text-white" />
                              <span className="text-sm font-medium text-white">Generate Report</span>
                            </>
                          )}
                        </div>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="font-body">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center">
                      {entitiesLoading ? (
                        <>
                          <div className="text-2xl font-bold text-gray-400">Loading...</div>
                          <div className="text-sm text-gray-600">Total Entities</div>
                        </>
                      ) : entitiesError ? (
                        <>
                          <div className="text-2xl font-bold text-red-600">Error</div>
                          <div className="text-sm text-red-500">{entitiesError}</div>
                          <Button 
                            onClick={refetchEntities}
                            className="mt-2 h-8 px-3 text-xs"
                            variant="outline"
                          >
                            Retry
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="text-2xl font-bold text-blue-600">{entities.length}</div>
                          <div className="text-sm text-gray-600">Total Entities</div>
                        </>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{periodMonths}</div>
                      <div className="text-sm text-gray-600">Analysis Period (months)</div>
                    </div>
                    {selectedEntity && (
                      <div className="text-center">
                        <div className="text-sm font-mono text-gray-500 break-all">{selectedEntity}</div>
                        <div className="text-sm text-gray-600">Selected Entity</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {report && (
            <div className="space-y-6">
              {/* Report Header */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="font-body">Retail Analytics Report</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">
                        Entity: {report.entity_id} | Period: {report.report_period}
                      </p>
                    </div>
                    <Button 
                      onClick={downloadPDF} 
                      className="flex items-center gap-2 h-9 px-4 rounded-full bg-gray-700 hover:bg-gray-800 text-white shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <Download className="h-3 w-3 text-white" />
                      <span className="text-sm font-medium text-white">Download PDF</span>
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* KPIs */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-body flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Key Performance Indicators
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 justify-items-center">
                    <div className="text-center">
                      <DollarSign className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                      <div className="text-2xl font-bold text-blue-600">
                        {formatCurrency(report?.kpis?.total_sales || 0)}
                      </div>
                      <div className="text-sm text-gray-600">Total Sales</div>
                    </div>
                    <div className="text-center">
                      <DollarSign className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                      <div className="text-2xl font-bold text-purple-600">
                        {formatCurrency(report?.kpis?.avg_sales_per_transaction || 0)}
                      </div>
                      <div className="text-sm text-gray-600">Avg Sales/Transaction</div>
                    </div>
                    <div className="text-center">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                      <div className="text-2xl font-bold text-orange-600">
                        {report?.kpis?.sales_growth_rate ? `${report.kpis.sales_growth_rate.toFixed(1)}%` : 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">Growth Rate/Period</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Charts */}
              <Tabs defaultValue="product-groups" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-black rounded-full">
                  <TabsTrigger value="product-groups" className="font-body text-white data-[state=active]:bg-white data-[state=active]:text-black rounded-full">Product Groups</TabsTrigger>
                  <TabsTrigger value="sales-trends" className="font-body text-white data-[state=active]:bg-white data-[state=active]:text-black rounded-full">Sales Trends</TabsTrigger>
                  <TabsTrigger value="summary" className="font-body text-white data-[state=active]:bg-white data-[state=active]:text-black rounded-full">AI Summary</TabsTrigger>
                </TabsList>

                <TabsContent value="product-groups" className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="font-body flex items-center gap-2">
                          <PieChart className="h-5 w-5" />
                          Sales Distribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <RechartsPieChart>
                            <Pie
                              data={report?.product_group_performance || []}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ product_group_code, percentage_of_total }) => `${product_group_code}: ${percentage_of_total.toFixed(1)}%`}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="total_sales"
                            >
                              {(report?.product_group_performance || []).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    

                    {/* Pareto Chart: Bars + cumulative line for product group contribution */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="font-body flex items-center gap-2">
                          <BarChart3 className="h-5 w-5" />
                          Product Group Pareto (80/20)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={320}>
                          <ComposedChart
                            data={(report?.product_group_performance || [])
                              .slice()
                              .sort((a, b) => b.total_sales - a.total_sales)
                              .map((d, idx, arr) => {
                                const total = arr.reduce((s, x) => s + x.total_sales, 0);
                                const cum = arr.slice(0, idx + 1).reduce((s, x) => s + x.total_sales, 0);
                                return { ...d, cumulative_pct: (cum / total) * 100 };
                              })}
                          margin={{ top: 10, right: 20, bottom: 36, left: 12 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis 
                              dataKey="product_group_code" 
                              tickLine={false} 
                              axisLine={false}
                              interval={0}
                              tick={(props: any) => {
                                const { x, y, payload } = props;
                                return (
                                  <text 
                                    x={x} 
                                    y={y} 
                                    dy={16} 
                                    textAnchor="end" 
                                    fill="#666" 
                                    fontSize={12}
                                    transform={`rotate(-35, ${x}, ${y})`}
                                  >
                                    {payload.value}
                                  </text>
                                );
                              }}
                            />
                            <YAxis yAxisId="left" tickFormatter={(v) => `$${Intl.NumberFormat('en', {notation: 'compact'}).format(Number(v))}`} domain={[0, 'auto']} />
                            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <Tooltip formatter={(value, name) => name === 'cumulative_pct' ? `${(value as number).toFixed(1)}%` : formatCurrency(Number(value))} />
                            <Bar yAxisId="left" dataKey="total_sales" fill="#111827" radius={[4,4,0,0]} />
                            <Line yAxisId="right" type="monotone" dataKey="cumulative_pct" stroke="#EF4444" strokeWidth={2.2} dot={{ r: 2 }} />
                            <ReferenceLine yAxisId="right" y={80} stroke="#9CA3AF" strokeDasharray="4 2" label={{ value: '80%', position: 'right', fill: '#6B7280', fontSize: 12 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="font-body">Product Group Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-body">Product Group</th>
                              <th className="text-right py-2 font-body">Total Sales</th>
                              <th className="text-right py-2 font-body">Percentage</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.product_group_performance || []).map((group) => (
                              <tr key={group.product_group_code} className="border-b">
                                <td className="py-2 font-body">
                                  <Badge variant="outline">{group.product_group_code}</Badge>
                                </td>
                                <td className="text-right py-2 font-body">{formatCurrency(group.total_sales)}</td>
                                <td className="text-right py-2 font-body">{group.percentage_of_total.toFixed(1)}%</td>
                                
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>


                <TabsContent value="sales-trends">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-body flex items-center gap-2">
                        <LineChart className="h-5 w-5" />
                        Sales Trends Over Time
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <RechartsLineChart data={report?.sales_trends || []}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="period_end" 
                            tickFormatter={(value) => new Date(value).toLocaleDateString()}
                          />
                          <YAxis />
                          <Tooltip 
                            formatter={(value) => formatCurrency(Number(value))}
                            labelFormatter={(value) => new Date(value).toLocaleDateString()}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="total_sales" 
                            stroke="#8884d8" 
                            strokeWidth={2}
                            dot={{ fill: '#8884d8', strokeWidth: 2, r: 4 }}
                          />
                        </RechartsLineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="summary">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-body flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-gray-600 rounded-full"></div>
                        AI-Generated Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="prose max-w-none">
                        {loading ? (
                          <div className="space-y-3">
                            <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-3 rounded w-full"></div>
                            <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-3 rounded w-5/6"></div>
                            <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-3 rounded w-4/6"></div>
                            <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-3 rounded w-3/4"></div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-lg border border-gray-200 dark:border-gray-700">
                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-body text-sm">
                              {report?.ai_summary || 'No summary available. Generate a report to see AI-generated insights.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}