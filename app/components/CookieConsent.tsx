"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { X, Cookie } from "lucide-react";

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Only show on authenticated pages (not on welcome/login pages)
    if (pathname === "/" || pathname === "/login") {
      return;
    }

    const consent = localStorage.getItem("cookieConsent");
    if (!consent) {
      setTimeout(() => {
        setShowBanner(true);
        setTimeout(() => setIsVisible(true), 100);
      }, 1000);
    } else if (consent === "accepted") {
      enableCookies();
    }
  }, [pathname]);

  const enableCookies = () => {
    // Enable theme storage
    const currentTheme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    localStorage.setItem("theme", currentTheme);
  };

  const handleAccept = () => {
    localStorage.setItem("cookieConsent", "accepted");
    enableCookies();
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  };

  const handleDecline = () => {
    localStorage.setItem("cookieConsent", "declined");
    localStorage.removeItem("theme");
    localStorage.removeItem("userEmail");
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  };

  if (!showBanner) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
    >
      <div className="max-w-7xl mx-auto p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <Cookie className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </div>
            
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Cookie Preferences
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies for analytics, personalized content, and remembering your preferences.{" "}
                <a href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
                  Learn more
                </a>
              </p>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleAccept}
                  className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                >
                  Accept All
                </button>
                <button
                  onClick={handleDecline}
                  className="px-6 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>

            <button
              onClick={handleDecline}
              className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

