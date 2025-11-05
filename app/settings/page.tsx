"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Mail, Bell, Send, Calendar, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import TopNav from "../components/TopNav";
import Sidebar from "../components/Sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase, getCurrentUser, signOut } from "@/lib/supabase";
import { getUserSessions, type ChatSession } from "@/lib/supabase-chat";
import { useUser } from "@/app/contexts/UserContext";
import Notification, { useNotifications } from "../components/Notification";

export default function SettingsPage() {
  const router = useRouter();
  const { userEmail: contextUserEmail, avatarUrl: contextAvatarUrl, userId: contextUserId } = useUser();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(contextUserEmail);
  const [userName, setUserName] = useState<string>("User");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(contextAvatarUrl);
  const [location, setLocation] = useState<string>("Loading location...");
  const [conversations, setConversations] = useState<Array<{id: string, title: string, timestamp: string}>>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  // Initialize with false to match server-side rendering (avoid hydration mismatch)
  // Load from localStorage in useEffect after mount
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [subscriptionFrequency, setSubscriptionFrequency] = useState<'week' | 'month'>('week');
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false); // Track if backend data is loaded
  const [isHydrated, setIsHydrated] = useState(false); // Track if client-side hydration is complete
  const [userId, setUserId] = useState<string | null>(null);
  
  // Email Management state
  const [useCustomEmail, setUseCustomEmail] = useState(false);
  const [customEmail, setCustomEmail] = useState<string>('');
  const [availableSummaries, setAvailableSummaries] = useState<Array<{
    period_start: string;
    period_end: string;
    time_range: string;
    message_count: number;
    created_at?: string;
  }>>([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null); // Track which summary is being sent
  const [isEmailManagementExpanded, setIsEmailManagementExpanded] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const { notifications, showNotification, removeNotification } = useNotifications();

  // Load subscription state from localStorage after mount (client-side only)
  useEffect(() => {
    setIsHydrated(true);
    
    // Load cached subscription state from localStorage
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('emailSubscription');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // Only use cache if it's recent (within 24 hours) and has userId
          const cacheAge = parsed.updatedAt ? Date.now() - parsed.updatedAt : Infinity;
          if (cacheAge < 24 * 60 * 60 * 1000 && parsed.userId) {
            setIsSubscribed(parsed.subscribed || false);
            setSubscriptionFrequency(parsed.frequency || 'week');
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }, []);

  useEffect(() => {
    // Use context values immediately
    setUserEmail(contextUserEmail);
    setAvatarUrl(contextAvatarUrl);
    if (contextUserId) {
      setUserId(contextUserId);
    }
    if (contextUserEmail) {
      setUserName(contextUserEmail.split('@')[0] || "User");
    }
    
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser();
        const savedAuth = localStorage.getItem("userEmail");
        
        if (user) {
          setUserEmail(user.email || null);
          setUserId(user.id);
          
          // Validate cached subscription belongs to current user
          if (typeof window !== 'undefined' && isHydrated) {
            const cached = localStorage.getItem('emailSubscription');
            if (cached) {
              try {
                const parsed = JSON.parse(cached);
                if (parsed.userId && parsed.userId !== user.id) {
                  // Different user, clear cache
                  localStorage.removeItem('emailSubscription');
                  setIsSubscribed(false);
                  setSubscriptionFrequency('week');
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
          
          // Try to get user name from metadata or email
          const name = user.user_metadata?.user_name || 
                       user.user_metadata?.full_name || 
                       user.user_metadata?.name ||
                       user.email?.split('@')[0] || 
                       "User";
          setUserName(name);
          
          // Try to get avatar URL from metadata
          const avatar = user.user_metadata?.avatar_url || 
                        user.user_metadata?.picture || 
                        null;
          setAvatarUrl(avatar);
          
          // Load subscription status (this will update from backend and cache if needed)
          await loadSubscriptionStatus(user.id);
          
          // Load available summaries for email management
          await loadAvailableSummaries(user.id);
          
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
        } else if (savedAuth) {
          setUserEmail(savedAuth);
          setUserName(savedAuth.split('@')[0] || "User");
        } else {
          router.push("/login");
        }
      } catch (error) {
        console.error("Error loading user data:", error);
        // Don't redirect on error, just use defaults
      }
    };

    checkAuth();
  }, [router, isHydrated, contextUserEmail, contextAvatarUrl, contextUserId]);

  // Get user's location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Try to get readable location name using reverse geocoding
          try {
            // Using OpenStreetMap's Nominatim API (free, no API key required)
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            );
            const data = await response.json();
            
            // Extract city and state/country
            const city = data.address?.city || data.address?.town || data.address?.village || "";
            const state = data.address?.state || "";
            const country = data.address?.country || "";
            
            let locationString = "";
            if (city && state) {
              locationString = `${city}, ${state}`;
            } else if (city && country) {
              locationString = `${city}, ${country}`;
            } else if (state && country) {
              locationString = `${state}, ${country}`;
            } else {
              locationString = `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
            }
            
            setLocation(locationString);
          } catch (error) {
            console.error("Error getting location name:", error);
            // Fallback to coordinates
            setLocation(`${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`);
          }
        },
        (error) => {
          console.error("Error getting location:", error);
          switch (error.code) {
            case error.PERMISSION_DENIED:
              setLocation("Location access denied");
              break;
            case error.POSITION_UNAVAILABLE:
              setLocation("Location unavailable");
              break;
            case error.TIMEOUT:
              setLocation("Location timeout");
              break;
            default:
              setLocation("Location unknown");
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      setLocation("Location not supported");
    }
  }, []);

  const handleNewChat = () => {
    router.push("/chat");
  };

  const handleLogout = async () => {
    try {
      if (supabase) {
        await signOut();
      }
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      localStorage.removeItem("userEmail");
      router.push("/login");
    }
  };

  const loadSubscriptionStatus = async (uid: string) => {
    try {
      // Make request with timeout to ensure it completes quickly
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`http://localhost:8000/v1/email-subscription?user_id=${uid}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const newSubscribed = data.subscribed || false;
        const newFrequency = data.frequency || 'week';
        
        setIsSubscribed(newSubscribed);
        setSubscriptionFrequency(newFrequency);
        
        // Cache in localStorage for instant load on next visit
        localStorage.setItem('emailSubscription', JSON.stringify({
          subscribed: newSubscribed,
          frequency: newFrequency,
          userId: uid,
          updatedAt: Date.now()
        }));
        
        setSubscriptionLoaded(true);
      } else {
        // If backend fails, keep cached value and mark as loaded to avoid flash
        setSubscriptionLoaded(true);
      }
    } catch (error) {
      console.error("Error loading subscription status:", error);
      // On error, mark as loaded to use cached value (prevents infinite loading state)
      setSubscriptionLoaded(true);
    }
  };

  const handleSubscriptionToggle = async (subscribed: boolean) => {
    if (!userId || !userEmail) return;
    await handleSubscriptionToggleWithFrequency(subscribed, subscriptionFrequency);
  };

  const loadAvailableSummaries = async (uid: string) => {
    try {
      setSummariesLoading(true);
      const response = await fetch(`http://localhost:8000/v1/chat-summaries/list?user_id=${uid}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableSummaries(data.summaries || []);
      }
    } catch (error) {
      console.error("Error loading summaries:", error);
    } finally {
      setSummariesLoading(false);
    }
  };

  const handleSendEmail = async (summary: { period_start: string; period_end: string; time_range: string }) => {
    if (!userId) return;
    
    const emailToUse = useCustomEmail && customEmail ? customEmail : null;
    
            if (useCustomEmail && !customEmail) {
              showNotification('Please enter a custom email address or switch to default email.', 'warning');
              return;
            }
    
    const summaryKey = `${summary.period_start}-${summary.period_end}-${summary.time_range}`;
    setSendingEmail(summaryKey);
    
    try {
      const response = await fetch('http://localhost:8000/v1/send-spotlight-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          period_start: summary.period_start,
          period_end: summary.period_end,
          time_range: summary.time_range,
          custom_email: emailToUse || undefined
        }),
      });

              if (response.ok) {
                const data = await response.json();
                const emailAddress = emailToUse || userEmail || 'your email';
                showNotification(`Email sent successfully to ${emailAddress}!`, 'success');
              } else {
                const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
                throw new Error(errorData.detail || 'Failed to send email');
              }
            } catch (error: any) {
              console.error("Error sending email:", error);
              showNotification(`Failed to send email: ${error.message || 'Unknown error'}`, 'error');
            } finally {
              setSendingEmail(null);
            }
  };

  const handleSubscriptionToggleWithFrequency = async (subscribed: boolean, frequency: 'week' | 'month') => {
    if (!userId || !userEmail) return;
    
    setSubscriptionLoading(true);
    try {
      const response = await fetch('http://localhost:8000/v1/email-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          subscribed,
          frequency,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsSubscribed(data.subscribed);
        setSubscriptionFrequency(data.frequency);
        
        // Update localStorage cache immediately
        if (userId) {
          localStorage.setItem('emailSubscription', JSON.stringify({
            subscribed: data.subscribed,
            frequency: data.frequency,
            userId: userId,
            updatedAt: Date.now()
          }));
        }
        
        if (subscribed) {
          showNotification(`Successfully subscribed to ${frequency === 'week' ? 'weekly' : 'monthly'} Spotlight emails!`, 'success');
        } else {
          showNotification('Successfully unsubscribed from Spotlight emails.', 'success');
        }
      } else {
        throw new Error('Failed to update subscription');
      }
    } catch (error) {
      console.error("Error updating subscription:", error);
      showNotification('Failed to update subscription. Please try again.', 'error');
    } finally {
      setSubscriptionLoading(false);
    }
  };

  return (
    <div className="h-screen bg-gray-100 dark:bg-slate-900">
      {/* Notifications */}
      <div className="fixed top-20 right-6 z-[9999] space-y-2 pointer-events-none">
        {notifications.map((notification) => (
          <div key={notification.id} className="pointer-events-auto">
            <Notification
              notification={notification}
              onClose={removeNotification}
            />
          </div>
        ))}
      </div>
      
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
        onNewChat={handleNewChat}
        onDeleteConversation={() => {}}
        userEmail={userEmail || undefined}
        avatarUrl={avatarUrl || undefined}
      />

      {/* Main Content */}
      <div className="pt-16 h-full flex flex-col">
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Profile Header with Sky-to-Ocean Background */}
          <div className="relative">
            {/* Combined Background Layer: White Sky + Wave Ocean */}
            <div className="relative overflow-hidden" style={{ height: "450px" }}>
              {/* Background Layer */}
              <div className="absolute inset-0">
                {/* Top: White/Frosted Sky Area */}
                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white via-white/95 to-transparent"></div>
                
                {/* Bottom: Animated Wave Ocean */}
                <div className="curved-wave-container">
                  {/* Animated Wave 1 - Cyan */}
                  <div className="curved-wave curved-wave-cyan"></div>
                  
                  {/* Animated Wave 2 - Blue */}
                  <div className="curved-wave curved-wave-blue"></div>
                  
                  {/* Frosted glass overlay with gradient */}
                  <div className="absolute inset-0 backdrop-blur-3xl bg-gradient-to-b from-white/60 via-yellow-50/10 to-black/25"></div>
                </div>
              </div>

              {/* Profile Content on top of combined background */}
              <div className="relative z-10 flex flex-col items-center pt-20">
                {/* Avatar */}
                <div className="relative mb-8">
                  <div className="w-28 h-28 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center p-2 shadow-xl">
                    <div className="w-full h-full rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center overflow-hidden">
                      {avatarUrl ? (
                        <Image 
                          src={avatarUrl} 
                          alt="User avatar" 
                          width={104} 
                          height={104}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg className="w-16 h-16 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  {/* Edit Avatar Button */}
                  <button
                    onClick={() => fileInput?.click()}
                    disabled={uploadingAvatar}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:bg-gray-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Change profile picture"
                  >
                    {uploadingAvatar ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Pencil className="w-4 h-4" />
                    )}
                  </button>
                  {/* Hidden file input */}
                  <input
                    ref={(el) => setFileInput(el)}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !userId || !supabase) return;
                      
                      setUploadingAvatar(true);
                      try {
                        // Validate file type
                        if (!file.type.startsWith('image/')) {
                          showNotification('Please select an image file', 'warning');
                          setUploadingAvatar(false);
                          return;
                        }
                        
                        // Validate file size (max 5MB)
                        if (file.size > 5 * 1024 * 1024) {
                          showNotification('Image size must be less than 5MB', 'warning');
                          setUploadingAvatar(false);
                          return;
                        }
                        
                        if (!supabase) {
                          showNotification('Database connection error', 'error');
                          setUploadingAvatar(false);
                          return;
                        }
                        
                        // Create a unique filename
                        const fileExt = file.name.split('.').pop();
                        const fileName = `${userId}/${Date.now()}.${fileExt}`;
                        
                        // Upload to Supabase Storage
                        const { data: uploadData, error: uploadError } = await supabase.storage
                          .from('avatars')
                          .upload(fileName, file, {
                            cacheControl: '3600',
                            upsert: false
                          });
                        
                        if (uploadError) {
                          // If bucket doesn't exist or upload fails, try to create bucket or use public URL
                          console.error('Upload error:', uploadError);
                          
                          // Alternative: Convert to base64 and store URL directly
                          const reader = new FileReader();
                          reader.onloadend = async () => {
                            const base64 = reader.result as string;
                            const newAvatarUrl = base64;
                            
                            if (!supabase) {
                              showNotification('Database connection error', 'error');
                              return;
                            }
                            
                            // Update profile in database
                            const { error: updateError } = await supabase
                              .from('profiles')
                              .update({ 
                                avatar_url: newAvatarUrl,
                                updated_at: new Date().toISOString()
                              })
                              .eq('user_id', userId);
                            
                            if (updateError) {
                              console.error('Error updating profile:', updateError);
                              showNotification('Failed to update profile picture', 'error');
                            } else {
                              setAvatarUrl(newAvatarUrl);
                              showNotification('Profile picture updated successfully!', 'success');
                              // Update context by refreshing page data
                              setTimeout(() => window.location.reload(), 1000);
                            }
                          };
                          reader.readAsDataURL(file);
                          return;
                        }
                        
                        // Get public URL
                        const { data: { publicUrl } } = supabase.storage
                          .from('avatars')
                          .getPublicUrl(fileName);
                        
                        // Update profile in database
                        const { error: updateError } = await supabase
                          .from('profiles')
                          .update({ 
                            avatar_url: publicUrl,
                            updated_at: new Date().toISOString()
                          })
                          .eq('user_id', userId);
                        
                        if (updateError) {
                          console.error('Error updating profile:', updateError);
                          showNotification('Failed to update profile picture', 'error');
                        } else {
                          setAvatarUrl(publicUrl);
                          showNotification('Profile picture updated successfully!', 'success');
                          // Update context by refreshing page data
                          setTimeout(() => window.location.reload(), 1000);
                        }
                      } catch (error) {
                        console.error('Error uploading avatar:', error);
                        showNotification('Failed to upload profile picture', 'error');
                      } finally {
                        setUploadingAvatar(false);
                        // Reset file input
                        if (fileInput) {
                          fileInput.value = '';
                        }
                      }
                    }}
                  />
                </div>

                {/* User Name */}
                <h2 className="text-2xl font-title text-gray-900 mb-5 pb-1 drop-shadow-sm">
                  {userName}
                </h2>

                {/* User Email */}
                {userEmail && (
                  <p className="text-base font-body text-gray-700 drop-shadow-sm mb-5">
                    {userEmail}
                  </p>
                )}

                {/* Location */}
                <div className="flex items-center gap-2 text-gray-600 text-sm font-body">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{location}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Email Management Section - Envelope Design */}
          <div className="max-w-2xl mx-auto px-6 py-8">
            {/* Envelope Container */}
            <div className="relative">
              {/* Envelope Body - Elegant theme colors */}
              <div 
                className={`relative bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900/40 dark:via-gray-800/40 dark:to-gray-900/40 border-2 border-gray-300 dark:border-gray-700/60 shadow-xl transition-all duration-700 ease-in-out ${
                  isEmailManagementExpanded 
                    ? 'rounded-lg pt-8 pb-6 px-6' 
                    : 'rounded-lg p-6 cursor-pointer hover:shadow-2xl'
                }`}
                style={{
                  minHeight: isEmailManagementExpanded ? 'auto' : '220px',
                  clipPath: isEmailManagementExpanded 
                    ? 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' 
                    : 'polygon(0% 0%, 100% 0%, 100% 82%, 50% 92%, 0% 82%)'
                }}
                onClick={() => !isEmailManagementExpanded && setIsEmailManagementExpanded(true)}
              >
                {/* Envelope Flap - Elegant dark theme */}
                <div 
                  className={`absolute top-0 left-0 right-0 bg-gradient-to-br from-gray-200 via-gray-300 to-gray-200 dark:from-gray-800/70 dark:via-gray-700/70 dark:to-gray-800/70 border-t-2 border-l-2 border-r-2 border-gray-400 dark:border-gray-600/70 transition-all duration-700 ease-in-out ${
                    isEmailManagementExpanded 
                      ? 'opacity-0 -translate-y-full -rotate-[15deg] pointer-events-none scale-95' 
                      : 'opacity-100 translate-y-0 rotate-0 scale-100'
                  }`}
                  style={{
                    height: '30%',
                    clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%, 0% 0%)',
                    zIndex: 15,
                    transformOrigin: 'center top'
                  }}
                >
                </div>
                
                {/* Wax Seal - positioned outside to cover the seal point on top of both flap and body */}
                <div 
                  className={`absolute left-1/2 -translate-x-1/2 transition-all duration-700 ease-in-out ${
                    isEmailManagementExpanded 
                      ? 'opacity-0 scale-75 translate-y-2 rotate-[-10deg]' 
                      : 'opacity-100 scale-100 translate-y-0 rotate-0'
                  }`}
                  style={{
                    top: 'calc(30% - 24px)', // Position at seal point (30% of envelope height - half seal size)
                    width: '48px',
                    height: '48px',
                    zIndex: 25 // Highest to appear on top of everything
                  }}
                >
                  <Image
                    src="/wax-seal.png"
                    alt="Wax Seal"
                    width={48}
                    height={48}
                    className="w-full h-full object-contain drop-shadow-xl"
                  />
                </div>

                {/* Header - Center aligned when closed, positioned in triangle top area */}
                {!isEmailManagementExpanded && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-full">
                    <div className="flex items-center gap-3 mb-1">
                      <Mail className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 font-body text-center">
                        Email Management
                      </h3>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 font-body italic">
                      Click to open
                    </div>
                  </div>
                )}

                {/* Content Paper - Slides out from inside the envelope */}
                <div 
                  className={`relative bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 transition-all duration-700 ease-in-out ${
                    isEmailManagementExpanded 
                      ? 'opacity-100 translate-y-0 scale-100 mt-4' 
                      : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
                  }`}
                  style={{
                    transform: isEmailManagementExpanded 
                      ? 'translateY(0) scale(1)' 
                      : 'translateY(30px) scale(0.95)',
                    transitionDelay: isEmailManagementExpanded ? '250ms' : '0ms',
                    zIndex: isEmailManagementExpanded ? 20 : 5
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Close button when expanded */}
                  {isEmailManagementExpanded && (
                    <button
                      onClick={() => setIsEmailManagementExpanded(false)}
                      className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors z-30"
                      aria-label="Close envelope"
                    >
                      <ChevronUp className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </button>
                  )}

                  {/* Header when expanded */}
                  {isEmailManagementExpanded && (
                    <div className="flex items-center gap-3 p-6 pb-4 border-b border-gray-200 dark:border-slate-700">
                      <Mail className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white font-body">
                        Email Management
                      </h3>
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-6">
                <Tabs defaultValue="subscription" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-100 dark:bg-slate-700">
                  <TabsTrigger value="subscription" className="font-body">Subscription</TabsTrigger>
                  <TabsTrigger value="management" className="font-body">Send Emails</TabsTrigger>
                </TabsList>

                {/* Subscription Tab */}
                <TabsContent value="subscription" className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-body mb-6">
                    Enable automatic weekly or monthly email summaries sent to your default email address.
                  </p>

                  <div className="space-y-4">
                {/* Subscription Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white font-body">
                        Email Notifications
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-body">
                        {subscriptionLoading ? 'Loading...' : (!isHydrated ? 'Loading...' : (isSubscribed ? 'Currently subscribed' : 'Currently not subscribed'))}
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSubscribed}
                      onChange={(e) => handleSubscriptionToggle(e.target.checked)}
                      disabled={subscriptionLoading || !subscriptionLoaded}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-300 dark:peer-focus:ring-gray-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-gray-800 dark:peer-checked:bg-gray-600 ${!subscriptionLoaded ? 'opacity-50 cursor-wait' : ''}`}></div>
                  </label>
                </div>

                {/* Frequency Selection */}
                {isSubscribed && (
                  <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                    <label className="block text-sm font-medium text-gray-900 dark:text-white font-body mb-2">
                      Email Frequency
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (userId && userEmail) {
                            setSubscriptionFrequency('week');
                            await handleSubscriptionToggleWithFrequency(true, 'week');
                          }
                        }}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-body transition-colors ${
                          subscriptionFrequency === 'week'
                            ? 'bg-gray-800 dark:bg-gray-600 text-white'
                            : 'bg-white dark:bg-slate-600 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-slate-500'
                        }`}
                        disabled={subscriptionLoading}
                      >
                        Weekly
                      </button>
                      <button
                        onClick={async () => {
                          if (userId && userEmail) {
                            setSubscriptionFrequency('month');
                            await handleSubscriptionToggleWithFrequency(true, 'month');
                          }
                        }}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-body transition-colors ${
                          subscriptionFrequency === 'month'
                            ? 'bg-gray-800 dark:bg-gray-600 text-white'
                            : 'bg-white dark:bg-slate-600 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-slate-500'
                        }`}
                        disabled={subscriptionLoading}
                      >
                        Monthly
                      </button>
                    </div>
                  </div>
                )}
              </div>
                </TabsContent>

                {/* Email Management Tab */}
                <TabsContent value="management" className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-body mb-6">
                    Choose which summary to send and to which email address. Send summaries manually whenever you need them.
                  </p>

                  {/* Email Selection */}
                  <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg space-y-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        id="default-email"
                        checked={!useCustomEmail}
                        onChange={() => setUseCustomEmail(false)}
                        className="w-4 h-4 text-gray-800 dark:text-gray-200"
                      />
                      <label htmlFor="default-email" className="text-sm font-medium text-gray-900 dark:text-white font-body cursor-pointer">
                        Use Default Email ({userEmail || 'Loading...'})
                      </label>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        id="custom-email"
                        checked={useCustomEmail}
                        onChange={() => setUseCustomEmail(true)}
                        className="w-4 h-4 text-gray-800 dark:text-gray-200"
                      />
                      <label htmlFor="custom-email" className="text-sm font-medium text-gray-900 dark:text-white font-body cursor-pointer flex-1">
                        Use Custom Email
                      </label>
                    </div>

                    {useCustomEmail && (
                      <div className="ml-7">
                        <input
                          type="email"
                          placeholder="Enter custom email address"
                          value={customEmail}
                          onChange={(e) => setCustomEmail(e.target.value)}
                          className="flex h-10 w-full max-w-md rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-gray-900 dark:text-white font-body placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                        />
                      </div>
                    )}
                  </div>

                  {/* Available Summaries */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white font-body flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Available Summaries
                    </h4>

                    {summariesLoading ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400 font-body">
                        Loading summaries...
                      </div>
                    ) : availableSummaries.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400 font-body">
                        No summaries available. Generate summaries on the Spotlight page first.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {availableSummaries.map((summary, idx) => {
                          const summaryKey = `${summary.period_start}-${summary.period_end}-${summary.time_range}`;
                          const isSending = sendingEmail === summaryKey;
                          const periodLabel = summary.time_range === 'week' ? 'Week' : 'Month';
                          
                          return (
                            <div
                              key={idx}
                              className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600 flex items-center justify-between"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-white font-body">
                                  {periodLabel}: {new Date(summary.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(summary.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-body mt-1">
                                  {summary.message_count} messages
                                </p>
                              </div>
                              <Button
                                onClick={() => handleSendEmail(summary)}
                                disabled={isSending || (!useCustomEmail && !isSubscribed)}
                                className="flex items-center gap-2 bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-white font-body"
                                size="sm"
                              >
                                {isSending ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="h-4 w-4" />
                                    <span>Send Now</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {!useCustomEmail && !isSubscribed && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200 font-body">
                        ⚠️ You need to be subscribed to send emails to your default address. Enable subscription in the Subscription tab.
                      </p>
                    </div>
                  )}
                </TabsContent>
                  </Tabs>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Spacer to push sign out button down */}
          <div className="h-16"></div>
        </div>

        {/* Fixed Sign Out Button at Bottom */}
        <div className="p-6 pb-8 bg-gray-100 dark:bg-slate-900 flex justify-center">
          <button
            onClick={handleLogout}
            className="py-3 px-12 bg-red-500 hover:bg-red-600 text-white font-body text-sm rounded-2xl shadow-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

