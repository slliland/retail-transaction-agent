import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import CookieConsent from "./components/CookieConsent";
import { UserProvider } from "./contexts/UserContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Retail Assistant",
  description: "AI-powered retail analytics assistant",
  icons: {
    icon: "/pure-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{const c=localStorage.getItem('cookieConsent');if(c==='accepted'){const t=localStorage.getItem('theme')||'system',r=document.documentElement;r.classList.remove('dark');if(t==='dark')r.classList.add('dark');else if(t==='light')r.classList.remove('dark');else{const p=window.matchMedia('(prefers-color-scheme: dark)').matches;p?r.classList.add('dark'):r.classList.remove('dark');}}}catch(e){}})();`
        }} />
      </head>
      <body className={inter.className}>
        <UserProvider>
          {children}
          <CookieConsent />
        </UserProvider>
      </body>
    </html>
  );
}

