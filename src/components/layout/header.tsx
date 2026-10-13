"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOperator } from "../shared/operator-context";
import { UserCheck, Shield } from "lucide-react";

export function Header() {
  const pathname = usePathname();
  const { activeOperator, operators, setActiveOperator } = useOperator();

  const navLinks = [
    { href: "/", label: "الرئيسية" },
    { href: "/reconciliation", label: "المطابقة السريعة" },
    { href: "/payouts", label: "صرف الصكوك" },
    { href: "/payments", label: "التدفقات الواردة" },
    { href: "/promoters", label: "المرقيين والمشاريع" },
    { href: "/checkbooks", label: "دفاتر الصكوك" },
    { href: "/backup", label: "النسخ والسلامة" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand title wordmark */}
        <Link href="/" className="flex items-center gap-2 whitespace-nowrap shrink-0 group">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-tight shadow-xs">
            SDC
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold text-slate-900 tracking-tight leading-tight group-hover:text-slate-700 transition-colors">
              صكوك الموثق
            </span>
            <span className="text-[10px] text-slate-500 font-medium leading-none">
              حساب الزبائن · الخزينة العمومية
            </span>
          </div>
        </Link>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Operator Selection & Session Identification */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg">
            <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="text-right">
              <span className="block text-[10px] text-slate-400 font-medium leading-none">المشغل المعتمد:</span>
              <select
                aria-label="المشغل المعتمد"
                value={activeOperator?.id || ""}
                onChange={(e) => {
                  const target = operators.find((op) => String(op.id) === e.target.value);
                  if (target) setActiveOperator(target);
                }}
                className="text-xs font-bold text-slate-800 bg-transparent border-none focus:outline-none cursor-pointer pr-1"
              >
                {operators.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name} {op.role === "NOTARY" ? "(الموثق)" : "(كاتب)"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
