"use client";

import React from "react";
import { formatDZD, numberToArabicWords, numberToFrenchWords } from "@/lib/domain/currency";
import { Printer } from "lucide-react";

interface PrintBordereauProps {
  payout: {
    id: number;
    promoterName: string;
    promoterRib?: string | null;
    promoterBank?: string | null;
    checkNumber: number;
    seriesPrefix?: string | null;
    totalAmountCents: number;
    issuedDate: string;
    issuedByOperator: string;
    notes?: string | null;
  };
  items: {
    id: number;
    buyerName: string;
    unitNumber: string | null;
    contractReference: string | null;
    referenceNumber: string;
    bankName: string;
    depositDate: string;
    clearanceDate: string | null;
    allocatedAmountCents: number;
    originalAmountCents: number;
  }[];
}

export function PrintBordereau({ payout, items }: PrintBordereauProps) {
  const checkFullRef = payout.seriesPrefix
    ? `${payout.seriesPrefix}-${payout.checkNumber}`
    : String(payout.checkNumber);

  const arabicWords = numberToArabicWords(payout.totalAmountCents);
  const frenchWords = numberToFrenchWords(payout.totalAmountCents);

  return (
    <div className="bg-white text-slate-900">
      {/* Actions Bar (Hidden in Print) */}
      <div className="print:hidden flex items-center justify-between pb-6 mb-6 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900">معاينة جدول التفريغ الرسمي (A4)</h2>
          <p className="text-xs text-slate-500">جاهز للطباعة المباشرة وإرفاقه مع صك الخزينة العمومية</p>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة الوثيقة الرسمية (A4 / PDF)</span>
        </button>
      </div>

      {/* Official A4 Document Container */}
      <div className="border border-slate-300 print:border-none p-8 sm:p-12 max-w-[210mm] mx-auto bg-white min-h-[297mm] flex flex-col justify-between text-right leading-relaxed shadow-xs print:shadow-none print:p-0">
        <div>
          {/* Official Bilingual Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
            <div className="text-right space-y-0.5">
              <p className="text-xs font-bold text-slate-900">الجمهورية الجزائرية الديمقراطية الشعبية</p>
              <p className="text-xs font-semibold text-slate-700">وزارة العدل</p>
              <p className="text-xs font-semibold text-slate-800">مكتب التوثيق للأستاذ: رحال يونس</p>
              <p className="text-[11px] text-slate-500">موثق معتمد لدى محكمة وهران</p>
            </div>
            <div className="text-left space-y-0.5" dir="ltr">
              <p className="text-xs font-bold text-slate-900">RÉPUBLIQUE ALGÉRIENNE DÉMOCRATIQUE ET POPULAIRE</p>
              <p className="text-xs font-semibold text-slate-700">MINISTÈRE DE LA JUSTICE</p>
              <p className="text-xs font-semibold text-slate-800">Étude Notariale de Maître Rahal Younes</p>
              <p className="text-[11px] text-slate-500">Notaire près la Cour d&apos;Oran</p>
            </div>
          </div>

          {/* Document Title */}
          <div className="text-center my-6 space-y-1 bg-slate-50 border border-slate-200 py-3 rounded-lg print:border-slate-800">
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              جدول تفريغ مستحقات الترقية العقارية (حساب الزبائن SDC)
            </h1>
            <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase" dir="ltr">
              BORDEREAU RÉCAPITULATIF DE RÈGLEMENT PROSPECTIF (COMPTE SDC)
            </p>
          </div>

          {/* Metadata Block */}
          <div className="grid grid-cols-2 gap-4 text-xs border border-slate-200 p-4 rounded-lg mb-6 bg-white print:border-slate-800">
            <div className="space-y-1.5">
              <p>
                <span className="font-bold text-slate-700">المرقي العقاري (Promoteur): </span>
                <span className="font-semibold text-slate-900">{payout.promoterName}</span>
              </p>
              {payout.promoterRib && (
                <p>
                  <span className="font-bold text-slate-700">الحساب البنكي (RIB): </span>
                  <span className="font-mono text-slate-900" dir="ltr">{payout.promoterRib}</span>
                  {payout.promoterBank && <span className="text-slate-500"> ({payout.promoterBank})</span>}
                </p>
              )}
              <p>
                <span className="font-bold text-slate-700">تاريخ الإصدار (Date): </span>
                <span className="font-mono text-slate-900">{payout.issuedDate}</span>
              </p>
            </div>

            <div className="space-y-1.5 border-r border-slate-200 pr-4 print:border-slate-800">
              <p>
                <span className="font-bold text-slate-700">صك الخزينة المرفق (Chèque Trésor N°): </span>
                <span className="font-mono font-bold text-slate-900 text-sm">{checkFullRef}</span>
              </p>
              <p>
                <span className="font-bold text-slate-700">المبلغ الإجمالي (Montant Total): </span>
                <span className="font-mono font-bold text-emerald-800 text-sm">
                  {formatDZD(payout.totalAmountCents)}
                </span>
              </p>
              <p>
                <span className="font-bold text-slate-700">المشغل المعتمد: </span>
                <span className="text-slate-800">{payout.issuedByOperator}</span>
              </p>
            </div>
          </div>

          {/* Amount in Words */}
          <div className="border-r-2 border-slate-800 pr-3 py-1 mb-6 text-xs space-y-1">
            <p>
              <span className="font-bold text-slate-900">المبلغ بالحروف العربية: </span>
              <span className="font-semibold text-slate-800">{arabicWords}</span>
            </p>
            <p dir="ltr" className="text-left">
              <span className="font-bold text-slate-900">Montant en toutes lettres: </span>
              <span className="font-semibold text-slate-800">{frenchWords}</span>
            </p>
          </div>

          {/* Operations Table */}
          <div className="overflow-hidden border border-slate-300 rounded-lg print:border-slate-800 mb-6">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 print:bg-slate-200 print:border-slate-800">
                <tr>
                  <th className="py-2.5 px-2 text-center w-8">#</th>
                  <th className="py-2.5 px-3">المكتتب / M. (Souscripteur)</th>
                  <th className="py-2.5 px-2">الوحدة والعقد (Lot & Acte)</th>
                  <th className="py-2.5 px-2">وسيلة الدفع والبنك</th>
                  <th className="py-2.5 px-2 text-center">تاريخ التحصيل</th>
                  <th className="py-2.5 px-3 text-left">المبلغ المصروف (دج)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 print:divide-slate-400">
                {items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-2 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{item.buyerName}</td>
                    <td className="py-2.5 px-2 text-slate-700">
                      <div>{item.unitNumber || "شقة"}</div>
                      {item.contractReference && (
                        <div className="text-[10px] text-slate-500 font-mono">{item.contractReference}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-slate-700">
                      <div>{item.referenceNumber}</div>
                      <div className="text-[10px] text-slate-500">{item.bankName}</div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-700">
                      {item.clearanceDate || item.depositDate}
                    </td>
                    <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-900">
                      {formatDZD(item.allocatedAmountCents, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-800 font-bold">
                <tr>
                  <td colSpan={5} className="py-2.5 px-4 text-left">
                    المجموع الإجمالي المصروف (TOTAL DÉCAISSÉ):
                  </td>
                  <td className="py-2.5 px-3 text-left font-mono text-sm text-emerald-900">
                    {formatDZD(payout.totalAmountCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer & Signature Section */}
        <div className="pt-6 border-t border-slate-200 print:border-slate-800">
          <div className="flex justify-between items-start text-xs">
            <div className="space-y-1">
              <p className="text-slate-500">حرر بوهران في: <span className="font-mono text-slate-800">{payout.issuedDate}</span></p>
              <p className="text-[11px] text-slate-400">
                وثيقة محاسبية وقانونية ملحقة بصك الخزينة العمومية لحساب أموال الزبائن (Compte SDC)
              </p>
            </div>
            <div className="text-center pl-12">
              <p className="font-bold text-slate-900 mb-12">خاتم وتوقيع الموثق</p>
              <p className="text-[10px] text-slate-400">Cachet et Signature du Notaire</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
