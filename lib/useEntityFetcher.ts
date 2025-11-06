import { useState, useEffect, useCallback } from 'react';
import { logger } from "@/lib/logger";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface UseEntityFetcherOptions {
  /** Enable retry on failure */
  retry?: boolean;
  /** Enable fallback to by-entity endpoint */
  fallback?: boolean;
  /** Custom API endpoint (defaults to /v1/report/entities) */
  endpoint?: string;
}

/**
 * Custom hook for fetching entity list from backend
 * Isolated to prevent breaking when other code changes
 */
export function useEntityFetcher(options: UseEntityFetcherOptions = {}) {
  const { retry = true, fallback = true, endpoint = '/v1/report/entities' } = options;
  
  const [entities, setEntities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntities = useCallback(async () => {
    const url = `${API_BASE_URL}${endpoint}`;
    logger.log('🔄 [EntityFetcher] Fetching entities from:', url);
    setLoading(true);
    setError(null);

    const doFetch = async (attempt: number): Promise<string[] | null> => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store', // Prevent caching issues
        });

        logger.log(`📡 [EntityFetcher] Attempt ${attempt}:`, response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          logger.error(`❌ [EntityFetcher] Non-OK response (${response.status}):`, errorText.slice(0, 200));
          return null;
        }

        const data = await response.json().catch((e) => {
          logger.error(`❌ [EntityFetcher] JSON parse failed:`, e);
          return null;
        });

        if (!data) {
          logger.error(`❌ [EntityFetcher] No data in response`);
          return null;
        }

        const entityList = Array.isArray(data?.entities) ? data.entities : [];
        logger.log(`✅ [EntityFetcher] Attempt ${attempt}: Got ${entityList.length} entities`);
        return entityList;
      } catch (error) {
        logger.error(`❌ [EntityFetcher] Exception on attempt ${attempt}:`, error);
        return null;
      }
    };

    // First attempt
    let result = await doFetch(1);
    
    // Retry if enabled and first attempt failed
    if (!result || result.length === 0) {
      if (retry) {
        logger.log('⏳ [EntityFetcher] First attempt failed, retrying in 500ms...');
        await new Promise(resolve => setTimeout(resolve, 500));
        result = await doFetch(2);
      }
    }

    // Fallback to by-entity endpoint if enabled and still no result
    if ((!result || result.length === 0) && fallback) {
      try {
        const fallbackUrl = `${API_BASE_URL}/v1/report/overview/by-entity?period_months=0&limit=0`;
        logger.warn('🛟 [EntityFetcher] Using fallback endpoint:', fallbackUrl);
        
        const resp = await fetch(fallbackUrl, { cache: 'no-store' });
        if (resp.ok) {
          const json = await resp.json().catch(() => []);
          if (Array.isArray(json) && json.length > 0) {
            const derived = json.map((r: any) => r.entity_id).filter(Boolean);
            logger.log(`🛟 [EntityFetcher] Fallback: Derived ${derived.length} entities from by-entity endpoint`);
            result = derived;
          }
        }
      } catch (e) {
        logger.error('🛟 [EntityFetcher] Fallback exception:', e);
      }
    }

    // Update state
    if (result && result.length > 0) {
      setEntities(result);
      setLoading(false);
      logger.log(`✨ [EntityFetcher] Successfully loaded ${result.length} entities`);
    } else {
      setError('Failed to fetch entities');
      setLoading(false);
      logger.error('❌ [EntityFetcher] All attempts failed, no entities loaded');
    }
  }, [endpoint, retry, fallback]);

  // Fetch on mount
  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  return {
    entities,
    loading,
    error,
    refetch: fetchEntities,
  };
}
