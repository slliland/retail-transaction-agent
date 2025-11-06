"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { logger } from "@/lib/logger";
import { supabase, getCurrentUser } from '@/lib/supabase';

interface UserContextType {
  userEmail: string | null;
  avatarUrl: string | null;
  userId: string | null;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType>({
  userEmail: null,
  avatarUrl: null,
  userId: null,
  isLoading: true,
});

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load from localStorage immediately for instant display
    if (typeof window !== 'undefined') {
      const cachedEmail = localStorage.getItem('userEmail');
      const cachedAvatar = localStorage.getItem('userAvatarUrl');
      const cachedUserId = localStorage.getItem('userId');
      
      if (cachedEmail) {
        setUserEmail(cachedEmail);
      }
      if (cachedAvatar) {
        setAvatarUrl(cachedAvatar);
      }
      if (cachedUserId) {
        setUserId(cachedUserId);
      }
    }

    // Then fetch fresh data from Supabase
    const loadUser = async () => {
      try {
        const user = await getCurrentUser();
        if (user) {
          const email = user.email || null;
          const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
          
          setUserEmail(email);
          setAvatarUrl(avatar);
          setUserId(user.id);
          
          // Cache in localStorage for instant load on next navigation
          if (email) localStorage.setItem('userEmail', email);
          if (avatar) localStorage.setItem('userAvatarUrl', avatar);
          if (user.id) localStorage.setItem('userId', user.id);
        } else {
          // Fallback to localStorage if no user
          const cachedEmail = localStorage.getItem('userEmail');
          if (cachedEmail) {
            setUserEmail(cachedEmail);
          }
        }
      } catch (error) {
        logger.error('Error loading user:', error);
        // Keep cached values on error
        const cachedEmail = localStorage.getItem('userEmail');
        if (cachedEmail) {
          setUserEmail(cachedEmail);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();

    // Listen for auth changes
    if (supabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (session?.user) {
            const email = session.user.email || null;
            const avatar = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null;
            
            setUserEmail(email);
            setAvatarUrl(avatar);
            setUserId(session.user.id);
            
            // Update cache
            if (email) localStorage.setItem('userEmail', email);
            if (avatar) localStorage.setItem('userAvatarUrl', avatar);
            if (session.user.id) localStorage.setItem('userId', session.user.id);
          } else if (event === "SIGNED_OUT") {
            setUserEmail(null);
            setAvatarUrl(null);
            setUserId(null);
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userAvatarUrl');
            localStorage.removeItem('userId');
          }
        }
      );

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
  }, []);

  return (
    <UserContext.Provider value={{ userEmail, avatarUrl, userId, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}

