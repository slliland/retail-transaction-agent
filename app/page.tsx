"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  // Redirect to chat page on mount
  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      const savedAuth = localStorage.getItem("userEmail");
      
      if (user || savedAuth) {
        router.push("/chat");
      } else {
        router.push("/login");
      }
    };

    checkAuth();
  }, [router]);

  // Show loading while redirecting
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black dark:border-white mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400 font-body">Loading...</p>
      </div>
    </div>
  );
}
