"use client";

import { MessageSquare, FileText, TrendingUp, Settings, Menu, User, LogOut, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import ThemeToggle from "./ThemeToggle";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/app/contexts/UserContext";
import { logger } from "@/lib/logger";

interface TopNavProps {
  onMenuClick: () => void;
  userEmail?: string;
  avatarUrl?: string;
}

export default function TopNav({ onMenuClick, userEmail: propUserEmail, avatarUrl: propAvatarUrl }: TopNavProps) {
  // Use context for user data, fallback to props if provided
  const { userEmail: contextUserEmail, avatarUrl: contextAvatarUrl } = useUser();
  const userEmail = propUserEmail ?? contextUserEmail ?? null;
  const avatarUrl = propAvatarUrl ?? contextAvatarUrl ?? null;
  const pathname = usePathname();
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
      localStorage.removeItem("userEmail");
      router.push("/");
    } catch (error) {
      logger.error("Error signing out:", error);
    }
  };

  const navItems = [
    { href: "/chat", label: "Chat", icon: MessageSquare },
    { href: "/reports", label: "Reports", icon: FileText },
    { href: "/spotlight", label: "Spotlight", icon: TrendingUp },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-40 flex items-center justify-center border-b border-gray-200 dark:border-slate-700">
      <div className="h-full w-full px-6 flex items-center justify-between max-w-[2000px]">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/chat" className="flex items-center gap-3">
            <Image src="/pure-icon.png" alt="Retail Assistant" width={32} height={32} className="w-12 h-12" />
            <span className="hidden sm:block font-title text-sm text-gray-600 dark:text-gray-400 italic">
              Less guesswork, more sales
            </span>
          </Link>
        </div>

        <div className="absolute left-1/2 transform -translate-x-1/2">
          <div className="flex items-center gap-1 bg-gray-100/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-full px-1 py-1 shadow-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href === '/reports' && pathname.startsWith('/reports'));
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1 px-2 py-2 rounded-full font-body text-xs transition-all ${
                    isActive
                      ? "bg-black text-white dark:bg-white dark:text-black shadow-md"
                      : "text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-slate-700/60"
                  }`}
                  title={item.label}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:block">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              
              {userEmail && <div className="hidden sm:block text-sm font-body text-gray-600 dark:text-gray-400">{userEmail}</div>}
              
              {/* Avatar Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  {avatarUrl ? (
                    <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-gray-200 dark:ring-gray-700">
                      <Image 
                        src={avatarUrl} 
                        alt="User avatar" 
                        width={32} 
                        height={32}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                      {userEmail?.charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden z-50">
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
                      <p className="text-sm font-semibold font-body text-gray-900 dark:text-white truncate">
                        {userEmail?.split('@')[0] || "User"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{userEmail}</p>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                      <Link
                        href="/settings"
                        onClick={() => setIsDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-body text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <User className="w-4 h-4" />
                        <span>Profile</span>
                      </Link>
                      
                      <Link
                        href="/settings"
                        onClick={() => setIsDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-body text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </Link>
                    </div>

                    {/* Sign Out */}
                    <div className="border-t border-gray-200 dark:border-slate-700">
                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-body text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
      </div>
    </nav>
  );
}

