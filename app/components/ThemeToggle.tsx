"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = (localStorage.getItem("theme") as Theme) || "system";
    setTheme(savedTheme);
    applyTheme(savedTheme);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const currentTheme = localStorage.getItem("theme") as Theme;
      if (currentTheme === "system") applyTheme("system");
    };
    
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    
    if (newTheme === "dark") {
      root.classList.add("dark");
    } else if (newTheme === "light") {
      root.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      prefersDark ? root.classList.add("dark") : root.classList.remove("dark");
    }
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    const consent = localStorage.getItem("cookieConsent");
    if (consent === "accepted") {
      localStorage.setItem("theme", newTheme);
    }
    applyTheme(newTheme);
    handleMouseLeave();
  };

  const handleMouseEnter = () => {
    setIsLeaving(false);
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsExpanded(false);
      setIsLeaving(false);
    }, 280);
  };

  if (!mounted) return <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />;

  const themes: Array<{ value: Theme; icon: typeof Sun; label: string; color: string }> = [
    { value: "light", icon: Sun, label: "Light", color: "text-yellow-500" },
    { value: "dark", icon: Moon, label: "Dark", color: "text-blue-400" },
    { value: "system", icon: Monitor, label: "Auto", color: "text-purple-500" },
  ];

  const currentTheme = themes.find((t) => t.value === theme) || themes[0];
  const CurrentIcon = currentTheme.icon;

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`flex items-center bg-gray-100/80 dark:bg-slate-800/80 backdrop-blur-md rounded-full shadow-sm hover:shadow-md transition-all ease-out ${isExpanded ? 'gap-1 p-1' : 'gap-0 p-0'}`}
        style={{ 
          width: isExpanded ? 'auto' : '32px', 
          height: '32px',
          transitionDuration: isLeaving ? '240ms' : '280ms'
        }}
      >
        {themes.map(({ value, icon: Icon, label, color }, index) => {
          const isActive = theme === value;
          const isVisible = isExpanded || isActive;
          const expandDelay = index * 60;
          const collapseDelay = (2 - index) * 60;
          const delay = isLeaving ? `${collapseDelay}ms` : `${expandDelay}ms`;
          
          return (
            <button
              key={value}
              onClick={() => handleThemeChange(value)}
              className={`flex items-center justify-center rounded-full transition-all ${
                isActive
                  ? `${color} ${isExpanded ? 'bg-white dark:bg-slate-700 shadow-md w-8 h-8' : 'w-8 h-8'}`
                  : `text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-slate-700/50 ${
                      isVisible ? 'w-8 h-8 opacity-100' : 'w-0 h-8 opacity-0'
                    }`
              }`}
              style={{
                transform: isActive && !isExpanded ? 'scale(1)' : isActive ? 'scale(1.08)' : 'scale(1)',
                pointerEvents: isVisible ? 'auto' : 'none',
                transitionDuration: isLeaving ? '220ms' : '280ms',
                transitionDelay: !isActive ? delay : '0ms',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              aria-label={label}
              title={label}
            >
              <Icon 
                className="transition-all" 
                style={{
                  width: isVisible ? '16px' : '0px',
                  height: isVisible ? '16px' : '0px',
                  opacity: isVisible ? 1 : 0,
                  transitionDuration: isLeaving ? '200ms' : '260ms',
                  transitionDelay: !isActive ? delay : '0ms',
                  transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

