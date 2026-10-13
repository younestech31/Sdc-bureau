"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatDZD, dinarToCents } from "@/lib/domain/currency";
import {
  getPromoterUndisbursedClearedFundsAction,
  getNextCheckNumberAction,
  executePromoterPayoutAction,
  type ClearedFundItemDto,
} from "@/server/actions/payouts";
import { getPromotersAction, type PromoterDto } from "@/server/actions/promoters";
import { useOperator } from "@/components/shared/operator-context";
import {
  ArrowRight,
  Check,
  AlertCircle,
  FileText,
  DollarSign,
  Sparkles,
} from "lucide-react";

function NewPayoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPromoterId = searchParams.get("promoterId");
  const { activeOperator } = useOperator();

  const [promoters, setPromoters] = useState<PromoterDto[]>([]);
  const [selectedPromoterId, setSelectedPromoterId] = useState<string>(initialPromoterId || "");
  const [clearedFunds, setClearedFunds] = useState<ClearedFundItemDto[]>([]);
  const [allocations, setAllocations] = useState<Record<number, { selected: boolean; amountCents: number }>>({});
  const [nextCheckInfo, setNextCheckInfo] = useState<{ checkNumber?: number; seriesPrefix?: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [loadingFunds, setLoadingFunds] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load promoters and active checkbook
  useEffect(() => {
    let active = true;
    getPromotersAction().then((res) => {
      if (!active) return;
      setPromoters(res);
      setSelectedPromoterId((prev) => (!prev && res.length > 0 ? String(res[0].id) : prev));
    });

    getNextCheckNumberAction().then((res) => {
      if (!active) return;
      if (res.success) {
        setNextCheckInfo({ checkNumber: res.checkNumber, seriesPrefix: res.seriesPrefix });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // When promoter selection changes, load their cleared funds
  useEffect(() => {
    if (!selectedPromoterId) return;

    let active = true;
    getPromoterUndisbursedClearedFundsAction(Number(selectedPromoterId)).then((res) => {
      if (!active) return;
      setLoadingFunds(false);
      if (res.success) {
        setClearedFunds(res.items);

        // Pre-select ALL cleared items with 100% allocation by default (المسار السريع للمكتب)
        const initialAlloc: Record<number, { selected: boolean; amountCents: number }> = {};
        for (const item of res.items) {
          initialAlloc[item.incomingPaymentId] = {
            selected: true,
            amountCents: item.remainingAmountCents,
          };
        }
        setAllocations(initialAlloc);
      } else {
        setError(res.message || "خطأ أثناء جلب الأموال المحصلة");
      }
    });
  }, [selectedPromoterId]);

  // Compute total selected payout amount
  const totalSelectedCents = clearedFunds.reduce((sum, item) => {
    const alloc = allocations[item.incomingPaymentId];
    if (alloc?.selected && alloc.amountCents > 0) {
      return sum + alloc.amountCents;
    }
    return sum;
  }, 0);

  const selectedCount = clearedFunds.filter((item) => allocations[item.incomingPaymentId]?.selected).length;

  const handleToggleItem = (paymentId: number) => {
    setAllocations((prev) => ({
      ...prev,
      [paymentId]: {
        ...prev[paymentId],
        selected: !prev[paymentId]?.selected,
      },
    }));
  };

  const handleAmountChange = (paymentId: number, valDinar: string, maxCents: number) => {
    const parsedCents = dinarToCents(valDinar);
    const validCents = Math.min(Math.max(0, parsedCents), maxCents);

    setAllocations((prev) => ({
      ...prev,
      [paymentId]: {
        selected: validCents > 0,
        amountCents: validCents,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPromoterId) return;

    const itemsToSubmit = clearedFunds
      .filter((item) => allocations[item.incomingPaymentId]?.selected && allocations[item.incomingPaymentId]?.amountCents > 0)
      .map((item) => ({
        incomingPaymentId: item.incomingPaymentId,
        allocatedAmountCents: allocations[item.incomingPaymentId].amountCents,
      }));

    if (itemsToSubmit.length === 0) {
      setError("يجب تحديد بند واحد على الأقل بمبلغ أكبر من صفر");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await executePromoterPayoutAction({
      promoterId: Number(selectedPromoterId),
      operatorName: activeOperator?.name || "الموثق",
      notes: notes.trim() || undefined,
      items: itemsToSubmit,
    });

    setSubmitting(false);

    if (res.success && res.payoutId) {
      router.push(`/payouts/${res.payoutId}`);
    } else {
      setError(res.message || "فشل إصدار الصك");
    }
  };

  const currentPromoter = promoters.find((p) => String(p.id) === selectedPromoterId);

  return (
    <div className="space-y-6">
      {/* Top Back Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/payouts"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لقائمة الصكوك</span>
        </Link>
        <span className="text-xs text-slate-400">تحرير صك الخزينة المجمع</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            مصفوفة إعداد صك الخزينة وتفريغ مستحقات المرقي (SDC)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            جميع التدفقات المحصلة محددة تلقائياً بنسبة 100%. يمكنك مراجعة المبالغ أو التعديل الجزئي قبل الاعتماد.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Promoter Selection & Account Preview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
          <div className="sm:col-span-2 space-y-1.5">
            <label className="block font-bold text-slate-700">1. اختيار المرقي العقاري المستفيد:</label>
            <select
              value={selectedPromoterId}
              onChange={(e) => setSelectedPromoterId(e.target.value)}
              className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {promoters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.clearedFundsCents ? `· [متاح: ${formatDZD(p.clearedFundsCents)}]` : ""}
                </option>
              ))}
            </select>
            {currentPromoter?.bankRib && (
              <p className="text-[11px] text-slate-500 font-mono">
                الحساب البنكي (RIB): {currentPromoter.bankRib} ({currentPromoter.bankName})
              </p>
            )}
          </div>

          <div className="space-y-1 border-r border-slate-200 pr-4">
            <span className="block font-bold text-slate-700">رقم صك الخزينة التالي المحجوز:</span>
            <div className="text-lg font-bold font-mono text-slate-900 pt-1">
              {nextCheckInfo?.seriesPrefix ? `${nextCheckInfo.seriesPrefix}-` : ""}
              {nextCheckInfo?.checkNumber || "100001"}
            </div>
            <p className="text-[11px] text-slate-400">مُقترح تلقائياً من دفتر الصكوك النشط</p>
          </div>
        </div>

        {/* Step 2: Cleared Items Matrix */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              التدفقات المحصلة التابعة لهذا المرقي ({clearedFunds.length})
            </h2>
            <div className="text-xs text-slate-500">
              محدد للصرف: <span className="font-bold text-slate-800">{selectedCount}</span> من أصل{" "}
              <span className="font-bold text-slate-800">{clearedFunds.length}</span>
            </div>
          </div>

          {loadingFunds ? (
            <div className="py-12 text-center text-xs text-slate-400">
              جاري فحص المبالغ المحصلة في كشف الخزينة...
            </div>
          ) : clearedFunds.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              لا توجد مبالغ محصلة غير مصروفة لهذا المرقي حالياً. (تأكد من تحصيل الصكوك عبر شاشة المطابقة أولاً).
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3 text-center w-10">تحديد</th>
                      <th className="py-2.5 px-3">المكتتب والوحدة</th>
                      <th className="py-2.5 px-3">رقم الصك والبنك</th>
                      <th className="py-2.5 px-3 text-center">تاريخ التحصيل</th>
                      <th className="py-2.5 px-3 text-left">المبلغ الأصلي</th>
                      <th className="py-2.5 px-3 text-left">المتبقي غير المصروف</th>
                      <th className="py-2.5 px-3 text-left w-48">المبلغ المصروف الآن (دج)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clearedFunds.map((item) => {
                      const alloc = allocations[item.incomingPaymentId] || {
                        selected: false,
                        amountCents: item.remainingAmountCents,
                      };

                      return (
                        <tr
                          key={item.incomingPaymentId}
                          className={`transition-colors ${alloc.selected ? "bg-emerald-50/30" : "hover:bg-slate-50"}`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={alloc.selected}
                              onChange={() => handleToggleItem(item.incomingPaymentId)}
                              className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{item.buyerName}</div>
                            {item.unitNumber && (
                              <div className="text-[10px] text-slate-400">{item.unitNumber}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-mono font-semibold text-slate-800">{item.referenceNumber}</div>
                            <div className="text-[10px] text-slate-400">{item.bankName}</div>
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-600">
                            {item.clearanceDate || item.depositDate}
                          </td>
                          <td className="py-3 px-3 text-left font-mono text-slate-600">
                            {formatDZD(item.totalAmountCents)}
                          </td>
                          <td className="py-3 px-3 text-left font-mono font-bold text-slate-800">
                            {formatDZD(item.remainingAmountCents)}
                          </td>
                          <td className="py-3 px-3 text-left">
                            <div className="relative">
                              <input
                                type="text"
                                disabled={!alloc.selected}
                                value={alloc.selected ? String((alloc.amountCents / 100) || "") : "0"}
                                onChange={(e) =>
                                  handleAmountChange(item.incomingPaymentId, e.target.value, item.remainingAmountCents)
                                }
                                className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-400 text-left"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="block text-xs text-slate-500 font-medium">المجموع الإجمالي المحدد للصرف بهذا الصك:</span>
            <div className="text-2xl font-bold font-mono text-emerald-800">
              {formatDZD(totalSelectedCents)}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/payouts"
              className="px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              إلغاء
            </Link>
            <button
              onClick={handleSubmit}
              disabled={submitting || totalSelectedCents <= 0}
              className="px-6 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
            >
              <span>{submitting ? "جاري الاعتماد وحجز الرقم..." : "اعتماد وإصدار صك الخزينة المجمع"}</span>
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewPayoutPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-xs text-slate-400">
          جاري تحميل مصفوفة صرف صك الخزينة...
        </div>
      }
    >
      <NewPayoutContent />
    </Suspense>
  );
}
