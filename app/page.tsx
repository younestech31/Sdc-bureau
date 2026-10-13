"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDZD } from "@/lib/domain/currency";
import { getReconciliationDashboardAction, type ReconciliationDashboardDto } from "@/server/actions/reconciliation";
import { quickMatchByCheckNumberAction } from "@/server/actions/payments";
import { getPromotersAction, seedSampleDataAction, type PromoterDto } from "@/server/actions/promoters";
import { useOperator } from "@/components/shared/operator-context";
import {
  CheckCircle2,
  AlertCircle,
  FileText,
  Building2,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  Search,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { activeOperator } = useOperator();

  const [dashboard, setDashboard] = useState<ReconciliationDashboardDto | null>(null);
  const [promoters, setPromoters] = useState<PromoterDto[]>([]);
  const [quickRef, setQuickRef] = useState("");
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchMessage, setMatchMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [dash, prom] = await Promise.all([
        getReconciliationDashboardAction(),
        getPromotersAction(),
      ]);
      setDashboard(dash);
      setPromoters(prom);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      getReconciliationDashboardAction(),
      getPromotersAction(),
    ]).then(([dash, prom]) => {
      if (!active) return;
      setDashboard(dash);
      setPromoters(prom);
      setLoading(false);
    }).catch(console.error);
    return () => {
      active = false;
    };
  }, []);

  const handleQuickMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRef.trim()) return;

    setMatchLoading(true);
    setMatchMessage(null);

    const res = await quickMatchByCheckNumberAction({
      referenceNumber: quickRef.trim(),
      operatorName: activeOperator?.name || "الموثق",
    });

    setMatchLoading(false);

    if (res.success) {
      setMatchMessage({ type: "success", text: res.message });
      setQuickRef("");
      loadData(); // Refresh balances
    } else {
      setMatchMessage({ type: "error", text: res.message });
    }
  };

  const handleSeedData = async () => {
    setSeeding(true);
    const res = await seedSampleDataAction();
    setSeeding(false);
    if (res.success) {
      loadData();
    }
  };

  const promotersWithFunds = promoters.filter((p) => (p.clearedFundsCents || 0) > 0);

  return (
    <div className="space-y-8">
      {/* 1. Quick Match Bar (أهم أداة في يد الموثق يوم وصول الكشف) */}
      <section className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-md">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="text-center space-y-1">
            <span className="text-[11px] font-bold text-emerald-400 tracking-wider uppercase">
              التحصيل الفوري المباشر · COMPENSATION RAPIDE
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              مطابقة سريعة برقم الصك أو التحويل البنكي
            </h1>
            <p className="text-xs text-slate-400">
              وصل كشف الخزينة؟ اكتب رقم الصك واضغط <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono text-[10px]">Enter</kbd> لتعليمه محصّلاً فوراً ونقله إلى أموال الصرف.
            </p>
          </div>

          <form onSubmit={handleQuickMatch} className="flex gap-2 max-w-xl mx-auto">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={quickRef}
                onChange={(e) => setQuickRef(e.target.value)}
                placeholder="أدخل رقم الصك (مثلاً: 0084512)..."
                autoFocus
                className="w-full pr-11 pl-4 py-3 bg-slate-800/90 border border-slate-700 rounded-xl text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={matchLoading || !quickRef.trim()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-2 cursor-pointer"
            >
              {matchLoading ? "جاري المطابقة..." : "تأكيد التحصيل (Enter)"}
            </button>
          </form>

          {matchMessage && (
            <div
              className={`p-3 rounded-lg text-xs font-medium text-center max-w-xl mx-auto flex items-center justify-center gap-2 ${
                matchMessage.type === "success"
                  ? "bg-emerald-950/80 border border-emerald-800 text-emerald-300"
                  : "bg-rose-950/80 border border-rose-800 text-rose-300"
              }`}
            >
              {matchMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{matchMessage.text}</span>
            </div>
          )}
        </div>
      </section>

      {/* 2. Key Metrics Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* رصيد SDC الفعلي */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">رصيد SDC الدفتري الفعلي</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900">
            {dashboard ? formatDZD(dashboard.ledgerBalanceCents) : "—"}
          </div>
          <p className="text-[11px] text-slate-400">
            مجموع المحصل الفعلي − صكوك الصرف المسحوبة
          </p>
        </div>

        {/* المبالغ المحصلة الجاهزة للصرف */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">المحصل الجاهز للصرف للمرقين</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {dashboard ? formatDZD(dashboard.clearedUndisbursedCents) : "—"}
          </div>
          <p className="text-[11px] text-slate-400">
            {dashboard?.clearedFundsCount || 0} تدفق محصل وجاهز للتحرير
          </p>
        </div>

        {/* الصكوك العالقة قيد الانتظار */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">صكوك مودعة لم تظهر في الكشف</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-800">
            {dashboard ? formatDZD(dashboard.depositsInTransitCents) : "—"}
          </div>
          <p className="text-[11px] text-slate-400">
            {dashboard?.pendingDepositsCount || 0} صك مودع (قيد التحصيل)
          </p>
        </div>

        {/* رقم صك الخزينة الجاري النشط */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">صك الخزينة التالي النشط</span>
            <FileText className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900">
            N° {dashboard?.activeCheckNumber || 100001}
          </div>
          <p className="text-[11px] text-slate-400">
            الرقم المحجوز تلقائياً للصرف القادم
          </p>
        </div>
      </section>

      {/* 3. المرقيون الجاهزون للصرف الفوري (المسار السريع) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              المرقيون العقاريون الجاهزون لتحرير الصكوك
            </h2>
            <p className="text-xs text-slate-500">
              تجميع المبالغ المحصلة في كشف الخزينة لكل مرقي جاهزة للإصدار بنقرة واحدة
            </p>
          </div>
          <Link
            href="/payouts/new"
            className="text-xs font-semibold text-slate-900 hover:text-slate-700 underline underline-offset-4"
          >
            فتح مصفوفة الصرف الكاملة
          </Link>
        </div>

        {promotersWithFunds.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">لا توجد مبالغ محصلة جاهزة للصرف حالياً</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              إما أنه لم يتم تسجيل تدفقات واردة بعد، أو أن الصكوك ما زالت معلقة بانتظار مطابقة كشف الخزينة.
            </p>
            {promoters.length === 0 && (
              <button
                onClick={handleSeedData}
                disabled={seeding}
                className="inline-flex items-center gap-2 px-4 py-2 mt-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>{seeding ? "جاري التعبئة..." : "تعبئة بيانات تجريبية سريعة للتجربة الفورية"}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {promotersWithFunds.map((p) => (
              <div key={p.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 px-2 rounded-lg transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{p.name}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      ({p.projectsCount || 1} مشاريع)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {p.bankName ? `${p.bankName} · ` : ""}
                    {p.bankRib ? `RIB: ${p.bankRib}` : "لم يسجل الحساب البنكي"}
                  </p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-left sm:text-right">
                    <span className="block text-[11px] text-slate-400 font-medium leading-none">المبلغ المتاح للصرف:</span>
                    <span className="text-base font-bold font-mono text-emerald-800">
                      {formatDZD(p.clearedFundsCents || 0)}
                    </span>
                  </div>

                  <button
                    onClick={() => router.push(`/payouts/new?promoterId=${p.id}`)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
                  >
                    <span>تحرير صك الخزينة الآن</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Quick Navigation Hub */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/payments/new"
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors shadow-2xs group flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
              +
            </div>
            <h3 className="font-bold text-sm text-slate-900 group-hover:text-blue-700 transition-colors">
              تسجيل تدفق وارد جديد
            </h3>
            <p className="text-xs text-slate-500">
              إدخال صك أو تحويل بنكي للمكتتب فور استلامه في المكتب.
            </p>
          </div>
          <span className="text-xs font-semibold text-blue-700 mt-4 inline-flex items-center gap-1">
            تسجيل سريع ←
          </span>
        </Link>

        <Link
          href="/reconciliation"
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors shadow-2xs group flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm">
              ✓
            </div>
            <h3 className="font-bold text-sm text-slate-900 group-hover:text-emerald-700 transition-colors">
              كشف الخزينة والمصالحة الشهرية
            </h3>
            <p className="text-xs text-slate-500">
              تسوية بنود الكشف البنكي، إيداعات لم تقيد، وصكوك صادرة لم تخصم.
            </p>
          </div>
          <span className="text-xs font-semibold text-emerald-700 mt-4 inline-flex items-center gap-1">
            فتح الكشف ←
          </span>
        </Link>

        <Link
          href="/checkbooks"
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors shadow-2xs group flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
              #
            </div>
            <h3 className="font-bold text-sm text-slate-900 group-hover:text-slate-700 transition-colors">
              دفاتر صكوك الخزينة
            </h3>
            <p className="text-xs text-slate-500">
              متابعة التسلسل العددي للصكوك، حرق الأرقام التالفة، وإضافة دفاتر جديدة.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-700 mt-4 inline-flex items-center gap-1">
            إدارة الدفاتر ←
          </span>
        </Link>
      </section>
    </div>
  );
}
