"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { signInWithGitHub, signInWithGoogle, signInWithEmail, signUpWithEmail } from "@/lib/supabase";

interface WelcomeScreenProps {
  onLogin: (email: string, password: string) => void;
  onSignUp: (email: string, password: string) => void;
}

export default function WelcomeScreen({ onLogin, onSignUp }: WelcomeScreenProps) {
  const [showCard, setShowCard] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cardHeight, setCardHeight] = useState(35); // Percentage from bottom
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // GitHub login handler
  const handleGitHubLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await signInWithGitHub();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with GitHub');
      setIsLoading(false);
    }
  };

  // Google login handler
  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true); 
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setIsLoading(false);
    }
  };

  // Email login handler
  const handleEmailLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await signInWithEmail(email, password);
      onLogin(email, password);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  // Email signup handler
  const handleEmailSignUp = async () => {
    try {
      setIsLoading(true);
      setError(null);
      if (password !== confirmPassword) {
        setError("Passwords don't match");
        return;
      }
      await signUpWithEmail(email, password);
      onSignUp(email, password);
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    startHeightRef.current = cardHeight;
  };

  // Handle drag move - MUST be before any conditional returns
  useEffect(() => {
    const handleDragMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = startYRef.current - clientY;
      const windowHeight = window.innerHeight;
      const deltaPercent = (deltaY / windowHeight) * 100;
      
      // Min 20%, max 80% of screen
      const newHeight = Math.min(Math.max(startHeightRef.current + deltaPercent, 20), 80);
      setCardHeight(newHeight);
    };

    const handleDragEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging]);

  if (showSignUp) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        {/* Full-screen Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1632030163062-5308eb363214?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')"
          }}
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

        {/* Draggable Card */}
        <div 
          className="absolute left-0 right-0 transition-all duration-200"
          style={{ 
            bottom: 0,
            height: `${cardHeight}%`
          }}
        >
          {/* Drag Handle */}
          <div 
            className="w-full py-3 cursor-grab active:cursor-grabbing flex justify-center"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            <div className="w-12 h-1.5 bg-gray-400/50 rounded-full" />
          </div>

          {/* Card Content with backdrop blur and transparency */}
          <div className="h-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-t-[30px] px-8 pb-12 overflow-y-auto">
            <div className="max-w-md mx-auto space-y-6 pt-12">
              <h2 className="text-3xl font-zapfino text-center mb-2">Sign Up</h2>
              
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              />
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              />
              
              <button
                onClick={handleEmailSignUp}
                disabled={isLoading || !email || !password || !confirmPassword}
                className="w-full py-4 bg-black text-white rounded-full text-lg font-caslon font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {isLoading ? 'Signing up...' : 'Sign Up'}
              </button>
              
              {error && (
                <p className="text-center text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              
              <p className="text-center text-sm font-caslon text-gray-600 dark:text-gray-400 pt-4">
                Already have an account?{" "}
                <button onClick={() => { setShowSignUp(false); setShowLogin(true); }} className="text-black dark:text-white font-bold">
                  Sign In
                </button>
              </p>
            </div>

            {/* Back Button */}
            <button
              onClick={() => setShowSignUp(false)}
              className="absolute top-6 left-6 p-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-full shadow-lg z-20 hover:bg-white dark:hover:bg-slate-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showLogin) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        {/* Full-screen Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1698870366378-1b213ce2049c?q=80&w=1483&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')"
          }}
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

        {/* Draggable Card */}
        <div 
          className="absolute left-0 right-0 transition-all duration-200"
          style={{ 
            bottom: 0,
            height: `${cardHeight}%`
          }}
        >
          {/* Drag Handle */}
          <div 
            className="w-full py-3 cursor-grab active:cursor-grabbing flex justify-center"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            <div className="w-12 h-1.5 bg-gray-400/50 rounded-full" />
          </div>

          {/* Card Content with backdrop blur and transparency */}
          <div className="h-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-t-[30px] px-8 pb-12 overflow-y-auto">
            <div className="max-w-md mx-auto space-y-6 pt-12">
              <h2 className="text-3xl font-zapfino text-center mb-2">Sign In</h2>
              
              {/* Social Login Buttons */}
              <button 
                onClick={handleGitHubLogin}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg font-caslon disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                {isLoading ? 'Signing in...' : 'Sign in with GitHub'}
              </button>
              <button 
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg font-caslon disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {isLoading ? 'Signing in...' : 'Sign in with Google'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-slate-900 text-gray-500 dark:text-gray-400">or with email</span>
                </div>
              </div>
              
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              />
              
              <button
                onClick={handleEmailLogin}
                disabled={isLoading || !email || !password}
                className="w-full py-4 bg-black text-white rounded-full text-lg font-caslon font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
              
              {error && (
                <p className="text-center text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              
              <p className="text-center text-sm font-caslon text-gray-600 dark:text-gray-400 pt-4">
                Don't have an account?{" "}
                <button onClick={() => { setShowLogin(false); setShowSignUp(true); }} className="text-black dark:text-white font-bold">
                  Sign Up
                </button>
              </p>
            </div>

            {/* Back Button */}
            <button
              onClick={() => setShowLogin(false)}
              className="absolute top-6 left-6 p-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-full shadow-lg z-20 hover:bg-white dark:hover:bg-slate-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main welcome screen
  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Full-screen Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')"
        }}
      />
    
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

      {/* Animated Title */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <h1 
          className="text-6xl font-zapfino text-white tracking-wider animate-fade-in"
          style={{
            textShadow: "0 10px 50px rgba(0,0,0,0.9)",
            animation: "fadeIn 1s ease-out 0.5s both"
          }}
        >
          WELCOME
        </h1>
      </div>

      {/* Bouncing Arrow */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 animate-bounce pointer-events-none">
        <ChevronDown className="w-8 h-8 text-white/70" />
      </div>

      {/* Draggable Card */}
      <div 
        className="absolute left-0 right-0 transition-all duration-200"
        style={{ 
          bottom: 0,
          height: `${cardHeight}%`
        }}
      >
        {/* Drag Handle */}
        <div 
          className="w-full py-3 cursor-grab active:cursor-grabbing flex justify-center"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className="w-12 h-1.5 bg-gray-400/50 rounded-full" />
        </div>

        {/* Card Content with backdrop blur and transparency */}
        <div className="h-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-t-[30px] px-8 pb-12 overflow-y-auto">
          <div className="max-w-md mx-auto space-y-6 pt-12">
            <button
              onClick={() => setShowLogin(true)}
              className="w-full py-4 bg-black text-white rounded-full text-lg font-caslon font-semibold hover:bg-gray-800 transition-all shadow-md"
            >
              Sign In
            </button>
            
            <button
              onClick={() => setShowSignUp(true)}
              className="w-full py-4 bg-transparent border-2 border-black text-black dark:text-white dark:border-white rounded-full text-lg font-caslon font-semibold hover:bg-black/10 dark:hover:bg-white/10 transition-all"
            >
              Sign Up
            </button>
            
            <p className="text-center text-sm font-caslon text-gray-600 dark:text-gray-400 pt-4">
              New around here?{" "}
              <button onClick={() => setShowSignUp(true)} className="text-black dark:text-white font-bold">
                Create an account
              </button>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
