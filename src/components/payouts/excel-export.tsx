"use client";

import React from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { centsToDinar } from "@/lib/domain/currency";

interface ExcelExportProps {
  promoterName: string;
  checkNumber: number;
  issuedDate: string;
  totalAmountCents: number;
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

export function ExcelExportButton({ promoterName, checkNumber, issuedDate, totalAmountCents, items }: ExcelExportProps) {
  const handleExport = () => {
    // 1. Prepare header rows
    const headerData = [
      ["الجمهورية الجزائرية الديمقراطية الشعبية - وزارة العدل"],
      ["جدول تفريغ مستحقات الترقية العقارية (Bordereau Récapitulatif de Règlement - SDC)"],
      [],
      ["المرقي العقاري (Promoteur):", promoterName],
      ["رقم صك الخزينة (N° Chèque Trésor):", checkNumber],
      ["تاريخ الإصدار (Date d'émission):", issuedDate],
      ["المبلغ الإجمالي المصروف (Montant Total DZD):", centsToDinar(totalAmountCents)],
      [],
      [
        "الرقم",
        "اسم المكتتب (Souscripteur)",
        "الوحدة (Unité / Lot)",
        "مرجع العقد (Réf. Acte)",
        "رقم الصك/التحويل",
        "البنك المصدر",
        "تاريخ الإيداع",
        "تاريخ التحصيل بالخزينة",
        "المبلغ الأصلي (دج)",
        "المبلغ المصروف بهذا الصك (دج)",
        "المتبقي (دج)",
      ],
    ];

    // 2. Prepare item rows
    const itemRows = items.map((item, idx) => {
      const allocatedDinar = centsToDinar(item.allocatedAmountCents);
      const originalDinar = centsToDinar(item.originalAmountCents);
      const remainingDinar = Math.max(0, originalDinar - allocatedDinar);

      return [
        idx + 1,
        item.buyerName,
        item.unitNumber || "—",
        item.contractReference || "—",
        item.referenceNumber,
        item.bankName,
        item.depositDate,
        item.clearanceDate || "—",
        originalDinar,
        allocatedDinar,
        remainingDinar,
      ];
    });

    // 3. Totals row
    const footerRow = [
      "المجموع الإجمالي",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      centsToDinar(totalAmountCents),
      "",
    ];

    const fullSheetData = [...headerData, ...itemRows, [], footerRow];

    const worksheet = XLSX.utils.aoa_to_sheet(fullSheetData);

    // Set columns width
    worksheet["!cols"] = [
      { wch: 6 }, // N°
      { wch: 25 }, // Buyer
      { wch: 18 }, // Unit
      { wch: 22 }, // Contract
      { wch: 16 }, // Ref
      { wch: 18 }, // Bank
      { wch: 14 }, // Deposit date
      { wch: 16 }, // Clearance date
      { wch: 18 }, // Orig amount
      { wch: 20 }, // Allocated
      { wch: 16 }, // Remaining
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "جدول التفريغ SDC");

    // Generate filename
    const filename = `Bordereau_SDC_Cheque_${checkNumber}_${issuedDate}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shadow-2xs cursor-pointer"
    >
      <Download className="w-4 h-4 text-emerald-700" />
      <span>تصدير Excel (XLSX)</span>
    </button>
  );
}
