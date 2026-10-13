import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { OperatorProvider } from "@/components/shared/operator-context";
import { PinModal } from "@/components/shared/pin-modal";

export const metadata: Metadata = {
  title: "صكوك الموثق - NotaryFunds SDC",
  description: "نظام إدارة ومتابعة أموال حساب الزبائن (SDC) والترقية العقارية ومصالحة الخزينة وجداول التفريغ لمكاتب التوثيق الجزائرية.",
  openGraph: {
    title: "صكوك الموثق - NotaryFunds SDC",
    description: "نظام إدارة ومتابعة أموال حساب الزبائن (SDC) والترقية العقارية ومصالحة الخزينة وجداول التفريغ لمكاتب التوثيق الجزائرية.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "صكوك الموثق - NotaryFunds SDC",
    description: "نظام إدارة ومتابعة أموال حساب الزبائن (SDC) والترقية العقارية ومصالحة الخزينة وجداول التفريغ لمكاتب التوثيق الجزائرية.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-slate-50/50 text-slate-900 font-sans antialiased selection:bg-slate-900 selection:text-white" suppressHydrationWarning>
        <OperatorProvider>
          <Header />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <PinModal />
        </OperatorProvider>
      </body>
    </html>
  );
}
