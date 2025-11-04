'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TopNav from '../components/TopNav';
import Sidebar from '../components/Sidebar';
import { supabase, getCurrentUser } from '@/lib/supabase';
import { getUserSessions, getSessionMessages, type ChatSession } from '@/lib/supabase-chat';
import { useUser } from '@/app/contexts/UserContext';
import { MessageSquare, Calendar, ArrowRight, ChevronDown, ChevronUp, Loader2, ArrowUpDown, SortAsc, SortDesc, Play, Pause, Volume2 } from 'lucide-react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: number;
  created_at: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[] | null;
}

interface GroupedMessages {
  period: string;
  startDate: Date;
  endDate: Date;
  messages: Array<{
    message: Message;
    sessionTitle: string;
  }>;
}

interface PeriodSummary {
  summary: string;
  cached: boolean;
  loading: boolean;
}

export default function SpotlightPage() {
  const router = useRouter();
  const { userEmail: contextUserEmail, avatarUrl: contextAvatarUrl, userId: contextUserId } = useUser();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(contextUserEmail);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(contextAvatarUrl);
  const [userId, setUserId] = useState<string | null>(contextUserId);
  const [groupedMessages, setGroupedMessages] = useState<GroupedMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'month'>('week');
  const [hasMessages, setHasMessages] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Map<string, PeriodSummary>>(new Map());
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Array<{id: string, title: string, timestamp: string}>>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  // Per-card audio state
  const [playingStates, setPlayingStates] = useState<Map<string, { isPlaying: boolean; isPaused: boolean; progress: number; duration: number }>>(new Map());
  const [audioLoading, setAudioLoading] = useState<Map<string, boolean>>(new Map()); // Track loading state per card
  const [isSeeking, setIsSeeking] = useState<string | null>(null); // Track which card is seeking
  const [audioCache, setAudioCache] = useState<Map<string, { dataUrl: string; duration: number }>>(new Map()); // base64 data URLs for persistence
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map()); // Separate audio instance per card
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load cached audio on mount (base64 data URLs persist across page refresh)
  useEffect(() => {
    try {
      const cachedAudioData = localStorage.getItem('audioCache');
      if (cachedAudioData) {
        const parsedCache = JSON.parse(cachedAudioData);
        const cacheMap = new Map<string, { dataUrl: string; duration: number }>();
        Object.entries(parsedCache).forEach(([key, value]) => {
          cacheMap.set(key, value as { dataUrl: string; duration: number });
        });
        setAudioCache(cacheMap);
        console.log('✅ Loaded audio cache from localStorage:', cacheMap.size, 'items');
      }
    } catch (e) {
      console.warn('Failed to load audio cache from localStorage:', e);
    }
  }, []);

  useEffect(() => {
    // Use context values immediately
    setUserEmail(contextUserEmail);
    setAvatarUrl(contextAvatarUrl);
    setUserId(contextUserId);
    
    const loadUserAndData = async () => {
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
        console.error('Error loading conversations:', error);
      }
    };

    if (contextUserId) {
      loadUserAndData();
    }
  }, [contextUserEmail, contextAvatarUrl, contextUserId]);

  useEffect(() => {
    const loadMessages = async () => {
      if (!userId || !supabase) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log('🔍 Spotlight: Loading user sessions and messages...');

        // Get all sessions for the user
        const sessions = await getUserSessions(userId);
        console.log('📋 Spotlight: Found sessions:', sessions.length);

        if (sessions.length === 0) {
          setHasMessages(false);
          setGroupedMessages([]);
          setLoading(false);
          return;
        }

        // Get messages for all sessions
        const allMessages: Array<{
          message: Message;
          sessionTitle: string;
        }> = [];

        for (const session of sessions) {
          const messages = await getSessionMessages(session.id);
          const sessionTitle = session.title || `Chat ${new Date(session.created_at).toLocaleDateString()}`;
          
          for (const msg of messages) {
            allMessages.push({
              message: {
                ...msg,
                id: typeof msg.id === 'string' ? parseInt(msg.id) || 0 : msg.id
              } as Message,
              sessionTitle
            });
          }
        }

        console.log('📝 Spotlight: Total messages found:', allMessages.length);

        if (allMessages.length === 0) {
          setHasMessages(false);
          setGroupedMessages([]);
          setLoading(false);
          return;
        }

        setHasMessages(true);

        // Sort messages by date
        allMessages.sort((a, b) => 
          new Date(a.message.created_at).getTime() - new Date(b.message.created_at).getTime()
        );

        // Group messages by week or month
        const grouped = groupMessagesByPeriod(allMessages, timeRange);
        
        // Apply sorting
        const sortedGrouped = Array.from(grouped).sort((a, b) => {
          const diff = b.startDate.getTime() - a.startDate.getTime();
          return sortOrder === 'desc' ? diff : -diff;
        });
        
        // Filter by selected week if provided
        let filteredGrouped = sortedGrouped;
        if (selectedWeekStart && timeRange === 'week') {
          const selectedDate = new Date(selectedWeekStart);
          filteredGrouped = sortedGrouped.filter(group => {
            const groupStart = new Date(group.startDate);
            return groupStart.getTime() >= selectedDate.getTime() && 
                   groupStart.getTime() < selectedDate.getTime() + 7 * 24 * 60 * 60 * 1000;
          });
        }
        
        setGroupedMessages(filteredGrouped);
        
      } catch (error) {
        console.error('❌ Error loading messages:', error);
        setHasMessages(false);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadMessages();
    }
  }, [userId, timeRange, sortOrder, selectedWeekStart]);

  const groupMessagesByPeriod = (
    messages: Array<{ message: Message; sessionTitle: string }>,
    range: 'week' | 'month'
  ): GroupedMessages[] => {
    const groups: Map<string, GroupedMessages> = new Map();
    
    for (const { message, sessionTitle } of messages) {
      const date = new Date(message.created_at);
      let periodKey: string;
      let periodLabel: string;
      let startDate: Date;
      let endDate: Date;

      if (range === 'week') {
        // Get start of week (Sunday)
        const day = date.getDay();
        const diff = date.getDate() - day;
        startDate = new Date(date);
        startDate.setDate(startDate.getDate() - day);
        startDate.setHours(0, 0, 0, 0);
        
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        
        periodKey = `week-${startDate.getFullYear()}-W${getWeekNumber(startDate)}`;
        periodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      } else {
        // Get start of month
        startDate = new Date(date.getFullYear(), date.getMonth(), 1);
        endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
        periodKey = `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        periodLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }

      if (!groups.has(periodKey)) {
        groups.set(periodKey, {
          period: periodLabel,
          startDate,
          endDate,
          messages: []
        });
      }

      groups.get(periodKey)!.messages.push({ message, sessionTitle });
    }

    // Return groups (sorting and filtering will be done in useEffect)
    return Array.from(groups.values());
  };

  const fetchSummaries = useCallback(async (groups: GroupedMessages[], userId: string) => {
    if (!userId) return;

    // Test backend connection first
    try {
      const healthCheck = await fetch('http://localhost:8000/health', { 
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout for health check
      });
      if (!healthCheck.ok) {
        console.warn('[Spotlight] ⚠️ Backend health check failed:', healthCheck.status);
      } else {
        console.log('[Spotlight] ✅ Backend is reachable');
      }
    } catch (healthError) {
      console.error('[Spotlight] ❌ Backend is not reachable. Is it running?', healthError);
      // Still try to fetch summaries, but we know there's likely a connection issue
    }

    for (const group of groups) {
      const periodKey = `${group.startDate.toISOString().split('T')[0]}-${group.endDate.toISOString().split('T')[0]}-${timeRange}`;
      
      // Skip generating summaries for the current ongoing week/month to save tokens
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const isCurrentPeriod = group.startDate.getTime() <= todayEnd.getTime() && group.endDate.getTime() >= todayStart.getTime();
        if (isCurrentPeriod) {
          console.log(`[Spotlight] ⏭️ Skipping current ${timeRange} period to save tokens: ${periodKey}`);
          // Ensure loading state is not left true if previously set
          setSummaries(prev => {
            const existing = prev.get(periodKey);
            if (existing && !existing.loading) return prev;
            const newMap = new Map(prev);
            newMap.set(periodKey, {
              summary: existing?.summary || '',
              cached: existing?.cached || false,
              loading: false
            });
            return newMap;
          });
          continue;
        }
      } catch (e) {
        console.warn('[Spotlight] Failed to evaluate current period check:', e);
      }
      
      // Check if summary already exists using functional update
      let shouldFetch = true;
      setSummaries(prev => {
        const existing = prev.get(periodKey);
        if (existing && existing.summary && !existing.loading) {
          shouldFetch = false;
          return prev; // Return unchanged map
        }
        
        // Set loading state for new summaries
        const newMap = new Map(prev);
        newMap.set(periodKey, { 
          summary: existing?.summary || '', 
          cached: existing?.cached || false, 
          loading: true 
        });
        return newMap;
      });
      
      // Skip API call if summary already exists
      if (!shouldFetch) {
        console.log(`[Spotlight] ⏭️ Skipping summary fetch for ${periodKey}, already exists`);
        continue;
      }

      try {
        // Prepare messages for summary
        const messagesForSummary = group.messages.map(({ message }) => ({
          role: message.role,
          content: message.content
        }));

        console.log(`[Spotlight] 🔄 Fetching summary for period: ${periodKey}`, {
          userId,
          period_start: group.startDate.toISOString().split('T')[0],
          period_end: group.endDate.toISOString().split('T')[0],
          message_count: group.messages.length,
          messages_sample: messagesForSummary.slice(0, 2)
        });

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

        let response;
        try {
          response = await fetch('http://localhost:8000/v1/chat-summary', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: userId,
              period_start: group.startDate.toISOString().split('T')[0],
              period_end: group.endDate.toISOString().split('T')[0],
              time_range: timeRange,
              message_count: group.messages.length,
              messages: messagesForSummary
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.error(`[Spotlight] ⏱️ Request timeout after 60 seconds`);
            throw new Error('Request timeout: Backend took too long to respond');
          }
          throw fetchError;
        }

        console.log(`[Spotlight] 📡 Summary response:`, response.status, response.statusText);

        if (response.ok) {
          const data = await response.json();
          console.log(`[Spotlight] ✅ Summary received:`, { 
            cached: data.cached, 
            summary_length: data.summary?.length || 0,
            summary_preview: data.summary?.substring(0, 100) || 'empty'
          });
          
          setSummaries(prev => {
            const newMap = new Map(prev);
            newMap.set(periodKey, {
              summary: data.summary || '',
              cached: data.cached || false,
              loading: false
            });
            return newMap;
          });
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`[Spotlight] ❌ Failed to generate summary: ${response.status} ${response.statusText}`, errorText);
          setSummaries(prev => {
            const newMap = new Map(prev);
            newMap.set(periodKey, {
              summary: '',
              cached: false,
              loading: false
            });
            return newMap;
          });
        }
      } catch (error: any) {
        console.error('[Spotlight] ❌ Error fetching summary:', error);
        console.error('[Spotlight] ❌ Error details:', {
          name: error?.name,
          message: error?.message,
          stack: error?.stack
        });
        
        const errorMessage = error?.message || 'Unknown error';
        setSummaries(prev => {
          const newMap = new Map(prev);
          newMap.set(periodKey, {
            summary: `Error: ${errorMessage}. Please ensure the backend is running at http://localhost:8000`,
            cached: false,
            loading: false
          });
          return newMap;
        });
      }
    }
  }, [timeRange]);

  // Fetch summaries when grouped messages change (only if summaries don't exist)
  useEffect(() => {
    if (userId && groupedMessages.length > 0) {
      // Use a ref-like approach: check current summaries state
      setSummaries(currentSummaries => {
        // Check if we need summaries for any group
        const needsSummary = groupedMessages.some(group => {
          const periodKey = `${group.startDate.toISOString().split('T')[0]}-${group.endDate.toISOString().split('T')[0]}-${timeRange}`;
          const existing = currentSummaries.get(periodKey);
          return !existing || (!existing.summary && !existing.loading);
        });
        
        if (needsSummary) {
          // Trigger fetch in next tick to avoid state update conflicts
          setTimeout(() => {
            fetchSummaries(groupedMessages, userId);
          }, 0);
        }
        
        return currentSummaries; // Don't modify state in this check
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedMessages, userId, timeRange]);

  const togglePeriod = (periodKey: string) => {
    setExpandedPeriods(prev => {
      const newSet = new Set(prev);
      if (newSet.has(periodKey)) {
        newSet.delete(periodKey);
      } else {
        newSet.add(periodKey);
      }
      return newSet;
    });
  };

  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const formatMessageDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleNewChat = () => {
    router.push('/chat');
  };

  const handleSelectConversation = (sessionId: string) => {
    router.push(`/chat?session=${sessionId}`);
  };

  // Helper to update playing state for a specific card
  const updatePlayingState = (periodKey: string, updates: Partial<{ isPlaying: boolean; isPaused: boolean; progress: number; duration: number }>) => {
    setPlayingStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(periodKey) || { isPlaying: false, isPaused: false, progress: 0, duration: 0 };
      newMap.set(periodKey, { ...current, ...updates });
      return newMap;
    });
  };

  // Text-to-Speech functionality - per-card independent playback
  const handlePlayAudio = async (
    summaryText: string, 
    periodKey: string,
    periodStart?: string,
    periodEnd?: string,
    timeRangeParam?: 'week' | 'month'
  ) => {
    const currentState = playingStates.get(periodKey);
    const audio = audioRefs.current.get(periodKey);

    // If resuming paused audio for this card, just play (no loading needed)
    if (audio && currentState?.isPaused && !currentState.isPlaying) {
      audio.play();
      updatePlayingState(periodKey, { isPlaying: true, isPaused: false });
      return;
    }

    // Check cache first (base64 data URLs persist across page refresh)
    const cachedAudio = audioCache.get(periodKey);
    if (cachedAudio && cachedAudio.dataUrl) {
      // Set loading state while creating audio from cache
      setAudioLoading(prev => {
        const newMap = new Map(prev);
        newMap.set(periodKey, true);
        return newMap;
      });

      try {
        // Recreate audio from cached base64 data URL
        const audio = new Audio(cachedAudio.dataUrl);
        audioRefs.current.set(periodKey, audio);
        
        // Wait for audio to be ready
        audio.addEventListener('loadedmetadata', () => {
          updatePlayingState(periodKey, { 
            isPlaying: true, 
            isPaused: false, 
            duration: cachedAudio.duration,
            progress: 0 
          });
          
          // Clear loading state
          setAudioLoading(prev => {
            const newMap = new Map(prev);
            newMap.delete(periodKey);
            return newMap;
          });
        }, { once: true });
        
        // Set up progress tracking for cached audio
        audio.addEventListener('timeupdate', () => {
          if (isSeeking !== periodKey && audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            updatePlayingState(periodKey, { progress });
          }
        });
        
        audio.addEventListener('ended', () => {
          updatePlayingState(periodKey, { isPlaying: false, isPaused: false, progress: 0 });
        });
        
        audio.addEventListener('error', (e) => {
          console.error('Audio playback error for', periodKey, e);
          updatePlayingState(periodKey, { isPlaying: false, isPaused: false, progress: 0 });
          setAudioLoading(prev => {
            const newMap = new Map(prev);
            newMap.delete(periodKey);
            return newMap;
          });
        });
        
        await audio.play();
      } catch (error) {
        console.error('Error playing cached audio:', error);
        setAudioLoading(prev => {
          const newMap = new Map(prev);
          newMap.delete(periodKey);
          return newMap;
        });
      }
      return;
    }

    // Set loading state when generating new audio
    setAudioLoading(prev => {
      const newMap = new Map(prev);
      newMap.set(periodKey, true);
      return newMap;
    });

    try {
      updatePlayingState(periodKey, { isPlaying: true, isPaused: false });
      
      // Build request body with caching params if available
      const requestBody: any = {
        text: summaryText,
        voice_id: 'JBFqnCBsd6RMkjVDRZzb',
        model_id: 'eleven_multilingual_v2'
      };
      
      // Add caching parameters if available (for Supabase caching)
      if (userId && periodStart && periodEnd && timeRangeParam) {
        requestBody.user_id = userId;
        requestBody.period_start = periodStart;
        requestBody.period_end = periodEnd;
        requestBody.time_range = timeRangeParam;
        console.log('📦 [TTS] Including caching params:', { userId, periodStart, periodEnd, timeRangeParam });
      }
      
      // Call backend TTS endpoint
      const response = await fetch('http://localhost:8000/v1/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const blob = await response.blob();
        
        // Convert blob to base64 for persistent caching
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          
          // Create audio from base64
          const audio = new Audio(base64data);
          audioRefs.current.set(periodKey, audio);
          
          // Set up progress tracking
          audio.addEventListener('loadedmetadata', () => {
            const duration = audio.duration;
            updatePlayingState(periodKey, { duration });
            
            // Clear loading state when audio is ready
            setAudioLoading(prev => {
              const newMap = new Map(prev);
              newMap.delete(periodKey);
              return newMap;
            });
            
            // Cache the audio as base64
            setAudioCache(prev => {
              const newCache = new Map(prev);
              newCache.set(periodKey, { dataUrl: base64data, duration });
              
              // Save to localStorage for page refresh
              try {
                const cacheData: Record<string, { dataUrl: string; duration: number }> = {};
                newCache.forEach((value, key) => {
                  cacheData[key] = value;
                });
                localStorage.setItem('audioCache', JSON.stringify(cacheData));
                console.log('✅ Cached audio for', periodKey);
              } catch (e) {
                console.warn('Failed to cache audio to localStorage:', e);
              }
              
              return newCache;
            });
          });
          
          audio.addEventListener('timeupdate', () => {
            if (isSeeking !== periodKey && audio.duration) {
              const progress = (audio.currentTime / audio.duration) * 100;
              updatePlayingState(periodKey, { progress });
            }
          });
          
          audio.addEventListener('ended', () => {
            updatePlayingState(periodKey, { isPlaying: false, isPaused: false, progress: 0 });
          });
          
          audio.addEventListener('error', (e) => {
            console.error('Audio playback error for', periodKey, e);
            updatePlayingState(periodKey, { isPlaying: false, isPaused: false, progress: 0 });
            setAudioLoading(prev => {
              const newMap = new Map(prev);
              newMap.delete(periodKey);
              return newMap;
            });
          });
          
          audio.play();
        };
        reader.readAsDataURL(blob);
      } else {
        console.error('TTS failed:', response.statusText);
        updatePlayingState(periodKey, { isPlaying: false, isPaused: false });
        setAudioLoading(prev => {
          const newMap = new Map(prev);
          newMap.delete(periodKey);
          return newMap;
        });
      }
    } catch (error) {
      console.error('TTS error:', error);
      updatePlayingState(periodKey, { isPlaying: false, isPaused: false });
      setAudioLoading(prev => {
        const newMap = new Map(prev);
        newMap.delete(periodKey);
        return newMap;
      });
    }
  };

  const handlePauseAudio = (periodKey: string) => {
    const audio = audioRefs.current.get(periodKey);
    if (audio && !audio.paused) {
      audio.pause();
      updatePlayingState(periodKey, { isPlaying: false, isPaused: true });
    }
  };

  const handleResumeAudio = (periodKey: string) => {
    const audio = audioRefs.current.get(periodKey);
    if (audio && audio.paused) {
      audio.play();
      updatePlayingState(periodKey, { isPlaying: true, isPaused: false });
    }
  };

  const handleStopAudio = (periodKey: string) => {
    const audio = audioRefs.current.get(periodKey);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audioRefs.current.delete(periodKey);
    }
    
    // Stop speech synthesis if playing
    if ('speechSynthesis' in window && speechSynthesisRef.current) {
      speechSynthesis.cancel();
      speechSynthesisRef.current = null;
    }
    
    updatePlayingState(periodKey, { isPlaying: false, isPaused: false, progress: 0 });
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>, periodKey: string) => {
    const audio = audioRefs.current.get(periodKey);
    const state = playingStates.get(periodKey);
    if (!audio || !state?.duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    
    setIsSeeking(periodKey);
    const newTime = (percentage / 100) * state.duration;
    audio.currentTime = newTime;
    updatePlayingState(periodKey, { progress: percentage });
    
    setTimeout(() => setIsSeeking(null), 100);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, periodKey: string) => {
    if (isSeeking === periodKey) {
      const audio = audioRefs.current.get(periodKey);
      const state = playingStates.get(periodKey);
      if (audio && state?.duration) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        const newTime = (percentage / 100) * state.duration;
        audio.currentTime = newTime;
        updatePlayingState(periodKey, { progress: percentage });
      }
    }
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Load voices on mount for fallback TTS
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // Chrome loads voices asynchronously
      const loadVoices = () => speechSynthesis.getVoices();
      loadVoices();
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <TopNav 
        onMenuClick={() => setIsSidebarOpen(true)} 
      />
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
        onAction={(action) => {
          if (action === 'chat') router.push('/chat');
          if (action === 'reports') router.push('/reports');
          if (action === 'settings') router.push('/settings');
        }}
        currentPage="spotlight"
        userEmail={userEmail || undefined}
        avatarUrl={avatarUrl || undefined}
      />

      <div className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white font-title mb-6 flex items-center gap-3">
                  <Image 
                    src="/scroll.png" 
                    alt="Scroll" 
                    width={32} 
                    height={32} 
                    className="object-contain"
                  />
                  Spotlight
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-400 font-body mt-2">
                  Your weekly and monthly chat history with the retail agent
                </p>
        </div>
              
              {!hasMessages && (
                <Button
                  onClick={handleNewChat}
                  className="flex items-center gap-2 bg-gray-900 dark:bg-gray-800 hover:bg-gray-800 dark:hover:bg-gray-700 text-white font-body"
                >
                  <MessageSquare className="h-4 w-4" />
                  New Chat
                </Button>
              )}
              
              {hasMessages && (
                <div className="flex items-center gap-3">
                  {/* Sort Order Toggle */}
                  <Button
                    onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                    variant="outline"
                    className="flex items-center gap-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 font-body"
                  >
                    {sortOrder === 'desc' ? (
                      <SortDesc className="h-4 w-4" />
                    ) : (
                      <SortAsc className="h-4 w-4" />
                    )}
                    {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
                  </Button>
                  
                  {/* Week Dropdown (only for weekly view) */}
                  {timeRange === 'week' && groupedMessages.length > 0 && (
                    <Select
                      value={selectedWeekStart || 'all'}
                      onValueChange={(value) => {
                        if (value === 'all') {
                          setSelectedWeekStart(null);
                        } else {
                          setSelectedWeekStart(value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-[200px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-body">
                        <SelectValue placeholder="Select Week" />
                      </SelectTrigger>
                      <SelectContent 
                        className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 font-body z-[100]"
                        position="popper"
                        sideOffset={4}
                      >
                        <SelectItem value="all" className="font-body">All Weeks</SelectItem>
                        {groupedMessages.map((group) => {
                          const weekKey = group.startDate.toISOString().split('T')[0];
                          const weekLabel = `${group.period} (${group.messages.length} messages)`;
                          return (
                            <SelectItem key={weekKey} value={weekKey} className="font-body">
                              {weekLabel}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
      </div>
              )}
    </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
            </div>
          ) : !hasMessages ? (
            /* No Data State */
            <Card className="bg-white dark:bg-slate-800 border-2 border-dashed border-gray-300 dark:border-slate-700">
              <CardContent className="pt-12 pb-12">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-body mb-2">
                    No Chat History Yet
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 font-body mb-6 max-w-md mx-auto">
                    Start a conversation with the retail agent to track your weekly and monthly chat activity. 
                    Your messages and insights will appear here once you begin chatting.
                  </p>
                  <Button
                    onClick={handleNewChat}
                    className="flex items-center gap-2 bg-gray-900 dark:bg-gray-800 hover:bg-gray-800 dark:hover:bg-gray-700 text-white mx-auto font-body"
                    size="lg"
                  >
                    <MessageSquare className="h-5 w-5" />
                    Start Chatting with Agent
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Messages Display */
            <div className="space-y-6">
              <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as 'week' | 'month')}>
                <TabsList className="grid w-full max-w-xs grid-cols-2 bg-gray-100 dark:bg-slate-800">
                  <TabsTrigger value="week" className="font-body">
                    <Calendar className="h-4 w-4 mr-2 text-gray-900 dark:text-gray-100" />
                    Weekly
                  </TabsTrigger>
                  <TabsTrigger value="month" className="font-body">
                    <Calendar className="h-4 w-4 mr-2 text-gray-900 dark:text-gray-100" />
                    Monthly
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="week" className="space-y-6 mt-6">
                  {groupedMessages.map((group, idx) => {
                    const periodKey = `${group.startDate.toISOString().split('T')[0]}-${group.endDate.toISOString().split('T')[0]}-${timeRange}`;
                    const isExpanded = expandedPeriods.has(periodKey);
                    const summary = summaries.get(periodKey);
                    
                    return (
                      <Card key={idx} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-800 shadow-sm">
                        <CardHeader>
                          <CardTitle className="font-body flex items-center gap-2 text-gray-900 dark:text-gray-100">
                            <Calendar className="h-5 w-5 text-gray-900 dark:text-gray-100" />
                            Week of {group.period}
                            <Badge variant="outline" className="ml-auto border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-body">
                              {group.messages.length} messages
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* AI Summary Card */}
                          <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Image 
                                    src="/3d.png" 
                                    alt="AI Summary" 
                                    width={20} 
                                    height={20} 
                                    className="object-contain"
                                  />
                                  <CardTitle className="text-lg font-body text-gray-900 dark:text-gray-100">AI Summary</CardTitle>
                                  {summary?.cached && (
                                    <Badge variant="secondary" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-body">Cached</Badge>
                                  )}
                                  {summary?.loading && (
                                    <Loader2 className="h-4 w-4 animate-spin text-gray-600 dark:text-gray-400" />
                                  )}
                                </div>
                                {summary?.summary && !summary?.loading && (() => {
                                  const state = playingStates.get(periodKey);
                                  const isPlaying = state?.isPlaying || false;
                                  const isPaused = state?.isPaused || false;
                                  const hasCache = audioCache.has(periodKey);
                                  
                                  return (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (isPlaying && !isPaused) {
                                          handlePauseAudio(periodKey);
                                        } else if (isPaused || hasCache) {
                                          if (isPaused) {
                                            handleResumeAudio(periodKey);
                                          } else {
                                            handlePlayAudio(
                                              summary.summary, 
                                              periodKey,
                                              group.startDate.toISOString().split('T')[0],
                                              group.endDate.toISOString().split('T')[0],
                                              timeRange
                                            );
                                          }
                                        } else {
                                          handlePlayAudio(
                                            summary.summary, 
                                            periodKey,
                                            group.startDate.toISOString().split('T')[0],
                                            group.endDate.toISOString().split('T')[0],
                                            timeRange
                                          );
                                        }
                                      }}
                                      className="flex items-center gap-1 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-body"
                                    >
                                      {isPlaying && !isPaused ? (
                                        <>
                                          <Pause className="h-4 w-4" />
                                          <span className="text-xs">Pause</span>
                                        </>
                                      ) : isPaused || hasCache ? (
                                        <>
                                          <Play className="h-4 w-4" />
                                          <span className="text-xs">{isPaused ? 'Resume' : 'Listen'}</span>
                                        </>
                                      ) : (
                                        <>
                                          <Volume2 className="h-4 w-4" />
                                          <span className="text-xs">Listen</span>
                                        </>
                                      )}
                                    </Button>
                                  );
                                })()}
                              </div>
                            </CardHeader>
                            <CardContent>
                              {summary?.loading ? (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-sm font-body">Generating summary...</span>
                                </div>
                              ) : summary?.summary ? (
                                <>
                                  <div className="text-sm text-gray-800 dark:text-gray-200 font-body leading-relaxed mb-4 prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {summary.summary}
                                    </ReactMarkdown>
                                  </div>
                                  
                                  {/* Audio Player */}
                                  {(() => {
                                    const state = playingStates.get(periodKey);
                                    const hasCache = audioCache.has(periodKey);
                                    const audio = audioRefs.current.get(periodKey);
                                    const isLoading = audioLoading.get(periodKey) || false;
                                    
                                    const isPlaying = state?.isPlaying || false;
                                    const isPaused = state?.isPaused || false;
                                    
                                    // Hide audio bar if not playing, not paused, and not loading
                                    // Show it when loading to display spinner
                                    if (!isPlaying && !isPaused && !isLoading) return null;
                                    const progress = state?.progress || 0;
                                    const duration = state?.duration || 0;
                                    
                                    return (
                                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center gap-3">
                                          {/* Play/Pause Button - Use same logic as summary card button */}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              if (isLoading) return; // Prevent clicks while loading
                                              if (isPlaying && !isPaused) {
                                                handlePauseAudio(periodKey);
                                              } else if (isPaused || hasCache) {
                                                if (isPaused) {
                                                  handleResumeAudio(periodKey);
                                                } else {
                                                  handlePlayAudio(
                                                    summary.summary, 
                                                    periodKey,
                                                    group.startDate.toISOString().split('T')[0],
                                                    group.endDate.toISOString().split('T')[0],
                                                    timeRange
                                                  );
                                                }
                                              } else {
                                                handlePlayAudio(
                                                  summary.summary, 
                                                  periodKey,
                                                  group.startDate.toISOString().split('T')[0],
                                                  group.endDate.toISOString().split('T')[0],
                                                  timeRange
                                                );
                                              }
                                            }}
                                            disabled={isLoading}
                                            className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-body disabled:opacity-50"
                                          >
                                            {isLoading ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : isPlaying && !isPaused ? (
                                              <Pause className="h-4 w-4" />
                                            ) : isPaused || hasCache ? (
                                              <Play className="h-4 w-4" />
                                            ) : (
                                              <Play className="h-4 w-4" />
                                            )}
                                          </Button>
                                          
                                          {/* Animated Volume Icon with Wave Animation */}
                                          <div className="flex items-end gap-0.5 h-6">
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-1' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '40%' : '30%',
                                                minHeight: '8px'
                                              }}
                                            ></div>
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-2' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '60%' : '40%',
                                                minHeight: '10px'
                                              }}
                                            ></div>
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-3' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '80%' : '50%',
                                                minHeight: '12px'
                                              }}
                                            ></div>
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-4' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '100%' : '60%',
                                                minHeight: '14px'
                                              }}
                                            ></div>
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-5' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '70%' : '45%',
                                                minHeight: '11px'
                                              }}
                                            ></div>
                                          </div>
                                          
                                          {/* Progress Bar */}
                                          <div className="flex-1 flex items-center gap-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-body min-w-[40px]">
                                              {isLoading ? '...' : formatTime((audio?.currentTime || 0))}
                                            </span>
                                            <div
                                              className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer relative group"
                                              onClick={(e) => !isLoading && handleSeek(e, periodKey)}
                                              onMouseDown={(e) => {
                                                if (isLoading) return;
                                                setIsSeeking(periodKey);
                                                handleSeek(e, periodKey);
                                              }}
                                              onMouseMove={(e) => !isLoading && handleMouseMove(e, periodKey)}
                                              onMouseUp={() => setIsSeeking(null)}
                                              onMouseLeave={() => setIsSeeking(null)}
                                            >
                                              {isLoading ? (
                                                <div className="h-full bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                                                  <Loader2 className="h-3 w-3 animate-spin text-gray-500 dark:text-gray-400" />
                                                </div>
                                              ) : (
                                                <>
                                                  <div
                                                    className="h-full bg-gray-600 dark:bg-gray-400 rounded-full transition-all duration-100"
                                                    style={{ width: `${progress}%` }}
                                                  />
                                                  <div
                                                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-600 dark:bg-gray-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                    style={{ left: `calc(${progress}% - 8px)` }}
                                                  />
                                                </>
                                              )}
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-body min-w-[40px]">
                                              {isLoading ? '...' : formatTime(duration)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </>
                              ) : (
                                <div className="text-sm text-gray-500 dark:text-gray-400 font-body italic">
                                  {(() => {
                                    const todayStart = new Date();
                                    todayStart.setHours(0, 0, 0, 0);
                                    const todayEnd = new Date();
                                    todayEnd.setHours(23, 59, 59, 999);
                                    const isCurrent = group.startDate.getTime() <= todayEnd.getTime() && group.endDate.getTime() >= todayStart.getTime();
                                    if (isCurrent) {
                                      return `Summary will be available at the end of this ${timeRange}.`;
                                    }
                                    return 'Summary not available yet. Check browser console for details.';
                                  })()}
                                </div>
                              )}
                            </CardContent>
                          </Card>

                          {/* Messages - Collapsible */}
                          <div>
                            <Button
                              variant="ghost"
                              onClick={() => togglePeriod(periodKey)}
                              className="w-full justify-between font-body text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                            >
                              <span className="flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" />
                                {isExpanded ? 'Hide' : 'Show'} Messages ({group.messages.length})
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            
                            {isExpanded && (
                              <div className="mt-4 space-y-4">
                                {group.messages.map(({ message, sessionTitle }) => (
                                  <div
                                    key={message.id}
                                    className={`p-4 rounded-lg border font-body ${
                                      message.role === 'user'
                                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 ml-8 text-gray-900 dark:text-gray-100'
                                        : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 mr-8 text-gray-800 dark:text-gray-200'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <Badge 
                                          variant={message.role === 'user' ? 'default' : 'secondary'}
                                          className="font-body"
                                        >
                                          {message.role === 'user' ? 'You' : 'Agent'}
                                        </Badge>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-body">
                                          {sessionTitle}
                                        </span>
                                      </div>
                                      <span className="text-xs text-gray-500 dark:text-gray-400 font-body">
                                        {formatMessageDate(message.created_at)}
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-900 dark:text-gray-100 font-body prose prose-sm dark:prose-invert max-w-none">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {message.content}
                                      </ReactMarkdown>
                                    </div>
                                    {message.sources && message.sources.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-body">
                                          Sources: {message.sources.join(', ')}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </TabsContent>

                <TabsContent value="month" className="space-y-6 mt-6">
                  {groupedMessages.map((group, idx) => {
                    const periodKey = `${group.startDate.toISOString().split('T')[0]}-${group.endDate.toISOString().split('T')[0]}-${timeRange}`;
                    const isExpanded = expandedPeriods.has(periodKey);
                    const summary = summaries.get(periodKey);
                    
                    return (
                      <Card key={idx} className="bg-white dark:bg-slate-800">
                        <CardHeader>
                          <CardTitle className="font-body flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-gray-900 dark:text-gray-100" />
                            {group.period}
                            <Badge variant="outline" className="ml-auto">
                              {group.messages.length} messages
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* AI Summary Card */}
                          <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Image 
                                    src="/3d.png" 
                                    alt="AI Summary" 
                                    width={20} 
                                    height={20} 
                                    className="object-contain"
                                  />
                                  <CardTitle className="text-lg font-body text-gray-900 dark:text-gray-100">AI Summary</CardTitle>
                                  {summary?.cached && (
                                    <Badge variant="secondary" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-body">Cached</Badge>
                                  )}
                                  {summary?.loading && (
                                    <Loader2 className="h-4 w-4 animate-spin text-gray-600 dark:text-gray-400" />
                                  )}
                                </div>
                                {summary?.summary && !summary?.loading && (() => {
                                  const state = playingStates.get(periodKey);
                                  const isPlaying = state?.isPlaying || false;
                                  const isPaused = state?.isPaused || false;
                                  const hasCache = audioCache.has(periodKey);
                                  
                                  return (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (isPlaying && !isPaused) {
                                          handlePauseAudio(periodKey);
                                        } else if (isPaused || hasCache) {
                                          if (isPaused) {
                                            handleResumeAudio(periodKey);
                                          } else {
                                            handlePlayAudio(
                                              summary.summary, 
                                              periodKey,
                                              group.startDate.toISOString().split('T')[0],
                                              group.endDate.toISOString().split('T')[0],
                                              timeRange
                                            );
                                          }
                                        } else {
                                          handlePlayAudio(
                                            summary.summary, 
                                            periodKey,
                                            group.startDate.toISOString().split('T')[0],
                                            group.endDate.toISOString().split('T')[0],
                                            timeRange
                                          );
                                        }
                                      }}
                                      className="flex items-center gap-1 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-body"
                                    >
                                      {isPlaying && !isPaused ? (
                                        <>
                                          <Pause className="h-4 w-4" />
                                          <span className="text-xs">Pause</span>
                                        </>
                                      ) : isPaused || hasCache ? (
                                        <>
                                          <Play className="h-4 w-4" />
                                          <span className="text-xs">{isPaused ? 'Resume' : 'Listen'}</span>
                                        </>
                                      ) : (
                                        <>
                                          <Volume2 className="h-4 w-4" />
                                          <span className="text-xs">Listen</span>
                                        </>
                                      )}
                                    </Button>
                                  );
                                })()}
                              </div>
                            </CardHeader>
                            <CardContent>
                              {summary?.loading ? (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-sm font-body">Generating summary...</span>
                                </div>
                              ) : summary?.summary ? (
                                <>
                                  <div className="text-sm text-gray-800 dark:text-gray-200 font-body leading-relaxed mb-4 prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {summary.summary}
                                    </ReactMarkdown>
                                  </div>
                                  
                                  {/* Audio Player */}
                                  {(() => {
                                    const state = playingStates.get(periodKey);
                                    const hasCache = audioCache.has(periodKey);
                                    const audio = audioRefs.current.get(periodKey);
                                    const isLoading = audioLoading.get(periodKey) || false;
                                    
                                    const isPlaying = state?.isPlaying || false;
                                    const isPaused = state?.isPaused || false;
                                    
                                    // Hide audio bar if not playing, not paused, and not loading
                                    // Show it when loading to display spinner
                                    if (!isPlaying && !isPaused && !isLoading) return null;
                                    const progress = state?.progress || 0;
                                    const duration = state?.duration || 0;
                                    
                                    return (
                                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center gap-3">
                                          {/* Play/Pause Button - Use same logic as summary card button */}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              if (isLoading) return; // Prevent clicks while loading
                                              if (isPlaying && !isPaused) {
                                                handlePauseAudio(periodKey);
                                              } else if (isPaused || hasCache) {
                                                if (isPaused) {
                                                  handleResumeAudio(periodKey);
                                                } else {
                                                  handlePlayAudio(
                                                    summary.summary, 
                                                    periodKey,
                                                    group.startDate.toISOString().split('T')[0],
                                                    group.endDate.toISOString().split('T')[0],
                                                    timeRange
                                                  );
                                                }
                                              } else {
                                                handlePlayAudio(
                                                  summary.summary, 
                                                  periodKey,
                                                  group.startDate.toISOString().split('T')[0],
                                                  group.endDate.toISOString().split('T')[0],
                                                  timeRange
                                                );
                                              }
                                            }}
                                            disabled={isLoading}
                                            className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-body disabled:opacity-50"
                                          >
                                            {isLoading ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : isPlaying && !isPaused ? (
                                              <Pause className="h-4 w-4" />
                                            ) : isPaused || hasCache ? (
                                              <Play className="h-4 w-4" />
                                            ) : (
                                              <Play className="h-4 w-4" />
                                            )}
                                          </Button>
                                          
                                          {/* Animated Volume Icon with Wave Animation */}
                                          <div className="flex items-end gap-0.5 h-6">
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-1' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '40%' : '30%',
                                                minHeight: '8px'
                                              }}
                                            ></div>
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-2' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '60%' : '40%',
                                                minHeight: '10px'
                                              }}
                                            ></div>
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-3' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '80%' : '50%',
                                                minHeight: '12px'
                                              }}
                                            ></div>
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-4' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '100%' : '60%',
                                                minHeight: '14px'
                                              }}
                                            ></div>
                                            <div 
                                              className={`w-1 bg-gray-600 dark:bg-gray-400 rounded-full transition-all ${isPlaying && !isPaused && !isLoading ? 'animate-wave-5' : ''}`} 
                                              style={{ 
                                                height: isPlaying && !isPaused && !isLoading ? '70%' : '45%',
                                                minHeight: '11px'
                                              }}
                                            ></div>
                                          </div>
                                          
                                          {/* Progress Bar */}
                                          <div className="flex-1 flex items-center gap-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-body min-w-[40px]">
                                              {isLoading ? '...' : formatTime((audio?.currentTime || 0))}
                                            </span>
                                            <div
                                              className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer relative group"
                                              onClick={(e) => !isLoading && handleSeek(e, periodKey)}
                                              onMouseDown={(e) => {
                                                if (isLoading) return;
                                                setIsSeeking(periodKey);
                                                handleSeek(e, periodKey);
                                              }}
                                              onMouseMove={(e) => !isLoading && handleMouseMove(e, periodKey)}
                                              onMouseUp={() => setIsSeeking(null)}
                                              onMouseLeave={() => setIsSeeking(null)}
                                            >
                                              {isLoading ? (
                                                <div className="h-full bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                                                  <Loader2 className="h-3 w-3 animate-spin text-gray-500 dark:text-gray-400" />
                                                </div>
                                              ) : (
                                                <>
                                                  <div
                                                    className="h-full bg-gray-600 dark:bg-gray-400 rounded-full transition-all duration-100"
                                                    style={{ width: `${progress}%` }}
                                                  />
                                                  <div
                                                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-600 dark:bg-gray-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                    style={{ left: `calc(${progress}% - 8px)` }}
                                                  />
                                                </>
                                              )}
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-body min-w-[40px]">
                                              {isLoading ? '...' : formatTime(duration)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </>
                              ) : (
                                <div className="text-sm text-gray-500 dark:text-gray-400 font-body italic">
                                  {(() => {
                                    const todayStart = new Date();
                                    todayStart.setHours(0, 0, 0, 0);
                                    const todayEnd = new Date();
                                    todayEnd.setHours(23, 59, 59, 999);
                                    const isCurrent = group.startDate.getTime() <= todayEnd.getTime() && group.endDate.getTime() >= todayStart.getTime();
                                    if (isCurrent) {
                                      return `Summary will be available at the end of this ${timeRange}.`;
                                    }
                                    return 'Summary not available yet. Check browser console for details.';
                                  })()}
                                </div>
                              )}
                            </CardContent>
                          </Card>

                          {/* Messages - Collapsible */}
                          <div>
                            <Button
                              variant="ghost"
                              onClick={() => togglePeriod(periodKey)}
                              className="w-full justify-between font-body text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                            >
                              <span className="flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" />
                                {isExpanded ? 'Hide' : 'Show'} Messages ({group.messages.length})
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            
                            {isExpanded && (
                              <div className="mt-4 space-y-4">
                                {group.messages.map(({ message, sessionTitle }) => (
                                  <div
                                    key={message.id}
                                    className={`p-4 rounded-lg border font-body ${
                                      message.role === 'user'
                                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 ml-8 text-gray-900 dark:text-gray-100'
                                        : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 mr-8 text-gray-800 dark:text-gray-200'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <Badge 
                                          variant={message.role === 'user' ? 'default' : 'secondary'}
                                          className="font-body"
                                        >
                                          {message.role === 'user' ? 'You' : 'Agent'}
                                        </Badge>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-body">
                                          {sessionTitle}
                                        </span>
                                      </div>
                                      <span className="text-xs text-gray-500 dark:text-gray-400 font-body">
                                        {formatMessageDate(message.created_at)}
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-900 dark:text-gray-100 font-body prose prose-sm dark:prose-invert max-w-none">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {message.content}
                                      </ReactMarkdown>
                                    </div>
                                    {message.sources && message.sources.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-body">
                                          Sources: {message.sources.join(', ')}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
