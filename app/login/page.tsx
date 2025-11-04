"use client";

import { useRouter } from "next/navigation";
import WelcomeScreen from "../components/WelcomeScreen";

export default function LoginPage() {
  const router = useRouter();

  const handleLogin = (email: string, password: string) => {
    localStorage.setItem("userEmail", email);
    router.push("/chat");
  };

  const handleSignUp = (email: string, password: string) => {
    localStorage.setItem("userEmail", email);
    router.push("/chat");
  };

  return <WelcomeScreen onLogin={handleLogin} onSignUp={handleSignUp} />;
}

