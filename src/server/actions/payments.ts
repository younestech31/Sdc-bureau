"use server";

import { ensureDbInitialized, getRawClient } from "@/lib/db";
import { revalidatePath } from "next/cache";

export interface IncomingPaymentDto {
  id: number;
  promoterId: number;
  promoterName: string;
  contractId: number | null;
  buyerName: string;
  unitNumber: string | null;
  amountCents: number;
  disbursedAmountCents: number;
  remainingAmountCents: number;
  paymentMethod: string;
  referenceNumber: string;
  bankName: string;
  drawerName: string;
  paymentType: string;
  depositDate: string;
  clearanceDate: string | null;
  status: "DEPOSITED" | "CLEARED" | "BOUNCED";
  notes: string | null;
  contractReference?: string | null;
}

export async function createIncomingPaymentAction(input: {
  promoterId: number;
  amountCents: number;
  paymentMethod: string;
  referenceNumber: string;
  bankName: string;
  drawerName: string;
  buyerName?: string;
  unitNumber?: string;
  paymentType?: string;
  depositDate?: string;
  notes?: string;
  operatorName: string;
}): Promise<{ success: boolean; id?: number; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    if (!input.promoterId) return { success: false, message: "يجب تحديد المرقي العقاري" };
    if (!input.amountCents || input.amountCents <= 0) return { success: false, message: "المبلغ غير صالح" };
    if (!input.referenceNumber?.trim()) return { success: false, message: "رقم الصك أو التحويل مطلوب" };
    if (!input.bankName?.trim()) return { success: false, message: "اسم البنك مطلوب" };

    const depositDate = input.depositDate || new Date().toISOString().split("T")[0];
    const buyerName = (input.buyerName || input.drawerName || "مكتتب").trim();
    const now = new Date().toISOString();

    const insertRes = await client.execute({
      sql: `INSERT INTO incoming_payments 
        (promoter_id, buyer_name, unit_number, amount_cents, payment_method, reference_number, bank_name, drawer_name, payment_type, deposit_date, status, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DEPOSITED', ?, ?) RETURNING id`,
      args: [
        input.promoterId,
        buyerName,
        input.unitNumber || null,
        input.amountCents,
        input.paymentMethod || "CHECK",
        input.referenceNumber.trim(),
        input.bankName.trim(),
        (input.drawerName || buyerName).trim(),
        input.paymentType || "قسط بيع على التصاميم",
        depositDate,
        input.notes || null,
        now,
      ],
    });

    const paymentId = Number(insertRes.rows[0].id);

    // تسجيل القيد في دفتر الحركات غير القابل للتعديل كقيد إيداع معلّق
    await client.execute({
      sql: `INSERT INTO journal_entries (entry_type, incoming_payment_id, debit_cents, credit_cents, operator, description, timestamp)
            VALUES ('INFLOW_DEPOSIT', ?, 0, 0, ?, ?, ?)`,
      args: [
        paymentId,
        input.operatorName || "المشغل",
        `إيداع صك/تحويل رقم ${input.referenceNumber} بمبلغ ${input.amountCents / 100} دج (قيد الانتظار بالخزينة)`,
        now,
      ],
    });

    // تسجيل التدقيق
    await client.execute({
      sql: `INSERT INTO audit_logs (operator, action, entity_table, entity_id, details, timestamp)
            VALUES (?, 'CREATE_PAYMENT', 'incoming_payments', ?, ?, ?)`,
      args: [
        input.operatorName || "المشغل",
        paymentId,
        JSON.stringify({ amountCents: input.amountCents, referenceNumber: input.referenceNumber, promoterId: input.promoterId }),
        now,
      ],
    });

    revalidatePath("/payments");
    revalidatePath("/");
    revalidatePath("/reconciliation");
    return { success: true, id: paymentId };
  } catch (error) {
    console.error("Error creating incoming payment:", error);
    return { success: false, message: error instanceof Error ? error.message : "حدث خطأ أثناء حفظ التدفق" };
  }
}

export async function quickMatchByCheckNumberAction(input: {
  referenceNumber: string;
  operatorName: string;
}): Promise<{ success: boolean; message: string; payment?: IncomingPaymentDto }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    const cleanRef = input.referenceNumber.trim();
    if (!cleanRef) {
      return { success: false, message: "يرجى إدخال رقم الصك أو التحويل" };
    }

    // ابحث عن العملية غير المحصلة المطابقة للرقم
    const res = await client.execute({
      sql: `SELECT p.*, pr.name as promoter_name 
            FROM incoming_payments p
            JOIN promoters pr ON pr.id = p.promoter_id
            WHERE LOWER(TRIM(p.reference_number)) = LOWER(TRIM(?))
            ORDER BY p.id DESC LIMIT 1`,
      args: [cleanRef],
    });

    if (res.rows.length === 0) {
      return { success: false, message: `لم يتم العثور على أي عملية مسجلة برقم "${cleanRef}"` };
    }

    const row = res.rows[0];
    const currentStatus = String(row.status);
    const paymentId = Number(row.id);
    const amountCents = Number(row.amount_cents);
    const promoterName = String(row.promoter_name);

    if (currentStatus === "CLEARED") {
      return {
        success: true,
        message: `الصك رقم "${cleanRef}" محصل بالفعل مسبقاً لصالح [${promoterName}] بمبلغ ${(amountCents / 100).toLocaleString("ar-DZ")} دج`,
        payment: {
          id: paymentId,
          promoterId: Number(row.promoter_id),
          promoterName,
          contractId: row.contract_id ? Number(row.contract_id) : null,
          buyerName: String(row.buyer_name),
          unitNumber: row.unit_number ? String(row.unit_number) : null,
          amountCents,
          disbursedAmountCents: 0,
          remainingAmountCents: amountCents,
          paymentMethod: String(row.payment_method),
          referenceNumber: String(row.reference_number),
          bankName: String(row.bank_name),
          drawerName: String(row.drawer_name),
          paymentType: String(row.payment_type),
          depositDate: String(row.deposit_date),
          clearanceDate: row.clearance_date ? String(row.clearance_date) : null,
          status: "CLEARED",
          notes: row.notes ? String(row.notes) : null,
        },
      };
    }

    if (currentStatus === "BOUNCED") {
      return { success: false, message: `الصك رقم "${cleanRef}" مسجل كصك مرتد (مرفوض) ولا يمكن تحصيله` };
    }

    // تحويل الحالة إلى CLEARED
    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();

    await client.execute({
      sql: `UPDATE incoming_payments SET status = 'CLEARED', clearance_date = ? WHERE id = ?`,
      args: [today, paymentId],
    });

    // تسجيل قيد دائن بالدفتر المالي الحركي
    await client.execute({
      sql: `INSERT INTO journal_entries (entry_type, incoming_payment_id, debit_cents, credit_cents, operator, description, timestamp)
            VALUES ('INFLOW_CLEARANCE', ?, 0, ?, ?, ?, ?)`,
      args: [
        paymentId,
        amountCents,
        input.operatorName || "المشغل",
        `تحصيل فعلي بالخزينة للصك/التحويل رقم ${cleanRef} لصالح ${promoterName}`,
        now,
      ],
    });

    // تسجيل التدقيق
    await client.execute({
      sql: `INSERT INTO audit_logs (operator, action, entity_table, entity_id, details, timestamp)
            VALUES (?, 'CLEAR_PAYMENT', 'incoming_payments', ?, ?, ?)`,
      args: [
        input.operatorName || "المشغل",
        paymentId,
        JSON.stringify({ referenceNumber: cleanRef, amountCents, clearanceDate: today }),
        now,
      ],
    });

    revalidatePath("/");
    revalidatePath("/payments");
    revalidatePath("/reconciliation");
    revalidatePath("/payouts/new");

    return {
      success: true,
      message: `تم تحصيل الصك رقم "${cleanRef}" بنجاح! المبلغ: ${(amountCents / 100).toLocaleString("ar-DZ")} دج للمرقي [${promoterName}]`,
      payment: {
        id: paymentId,
        promoterId: Number(row.promoter_id),
        promoterName,
        contractId: row.contract_id ? Number(row.contract_id) : null,
        buyerName: String(row.buyer_name),
        unitNumber: row.unit_number ? String(row.unit_number) : null,
        amountCents,
        disbursedAmountCents: 0,
        remainingAmountCents: amountCents,
        paymentMethod: String(row.payment_method),
        referenceNumber: String(row.reference_number),
        bankName: String(row.bank_name),
        drawerName: String(row.drawer_name),
        paymentType: String(row.payment_type),
        depositDate: String(row.deposit_date),
        clearanceDate: today,
        status: "CLEARED",
        notes: row.notes ? String(row.notes) : null,
      },
    };
  } catch (error) {
    console.error("Error matching payment:", error);
    return { success: false, message: error instanceof Error ? error.message : "حدث خطأ أثناء المطابقة" };
  }
}

export async function getIncomingPaymentsAction(filter?: {
  promoterId?: number;
  status?: string;
  search?: string;
}): Promise<IncomingPaymentDto[]> {
  await ensureDbInitialized();
  const client = getRawClient();

  let query = `
    SELECT p.*, pr.name as promoter_name,
      COALESCE((
        SELECT SUM(pi.allocated_amount_cents) 
        FROM payout_items pi
        JOIN payouts py ON py.id = pi.payout_id
        WHERE pi.incoming_payment_id = p.id AND py.is_cancelled = 0
      ), 0) as disbursed_amount_cents,
      vc.contract_reference
    FROM incoming_payments p
    JOIN promoters pr ON pr.id = p.promoter_id
    LEFT JOIN vefa_contracts vc ON vc.id = p.contract_id
    WHERE 1=1
  `;
  const args: (string | number)[] = [];

  if (filter?.promoterId) {
    query += ` AND p.promoter_id = ?`;
    args.push(filter.promoterId);
  }

  if (filter?.status && filter.status !== "ALL") {
    query += ` AND p.status = ?`;
    args.push(filter.status);
  }

  if (filter?.search?.trim()) {
    query += ` AND (p.reference_number LIKE ? OR p.buyer_name LIKE ? OR p.drawer_name LIKE ?)`;
    const s = `%${filter.search.trim()}%`;
    args.push(s, s, s);
  }

  query += ` ORDER BY p.id DESC`;

  const res = await client.execute({ sql: query, args });

  return res.rows.map((row) => {
    const amountCents = Number(row.amount_cents);
    const disbursedCents = Number(row.disbursed_amount_cents || 0);
    const remainingCents = Math.max(0, amountCents - disbursedCents);

    return {
      id: Number(row.id),
      promoterId: Number(row.promoter_id),
      promoterName: String(row.promoter_name),
      contractId: row.contract_id ? Number(row.contract_id) : null,
      buyerName: String(row.buyer_name),
      unitNumber: row.unit_number ? String(row.unit_number) : null,
      amountCents,
      disbursedAmountCents: disbursedCents,
      remainingAmountCents: remainingCents,
      paymentMethod: String(row.payment_method),
      referenceNumber: String(row.reference_number),
      bankName: String(row.bank_name),
      drawerName: String(row.drawer_name),
      paymentType: String(row.payment_type),
      depositDate: String(row.deposit_date),
      clearanceDate: row.clearance_date ? String(row.clearance_date) : null,
      status: row.status as "DEPOSITED" | "CLEARED" | "BOUNCED",
      notes: row.notes ? String(row.notes) : null,
      contractReference: row.contract_reference ? String(row.contract_reference) : null,
    };
  });
}

export async function linkContractToPaymentAction(input: {
  paymentId: number;
  buyerName: string;
  unitNumber?: string;
  notes?: string;
  operatorName: string;
}): Promise<{ success: boolean; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    await client.execute({
      sql: `UPDATE incoming_payments SET buyer_name = ?, unit_number = ?, notes = ? WHERE id = ?`,
      args: [input.buyerName.trim(), input.unitNumber?.trim() || null, input.notes || null, input.paymentId],
    });

    revalidatePath("/payments");
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "حدث خطأ" };
  }
}
