"use server";

import { ensureDbInitialized, getRawClient } from "@/lib/db";
import { verifyOperatorPinAction } from "./operators";
import { revalidatePath } from "next/cache";

export interface ClearedFundItemDto {
  incomingPaymentId: number;
  buyerName: string;
  unitNumber: string | null;
  referenceNumber: string;
  bankName: string;
  depositDate: string;
  clearanceDate: string | null;
  totalAmountCents: number;
  disbursedAmountCents: number;
  remainingAmountCents: number;
  suggestedAllocationCents: number;
}

export interface PayoutDto {
  id: number;
  promoterId: number;
  promoterName: string;
  promoterRib?: string | null;
  promoterBank?: string | null;
  checkNumber: number;
  seriesPrefix?: string | null;
  totalAmountCents: number;
  issuedDate: string;
  issuedByOperator: string;
  notes: string | null;
  isCancelled: boolean;
  cancelReason: string | null;
  cancelledAt: string | null;
  itemsCount: number;
}

export async function getPromoterUndisbursedClearedFundsAction(promoterId: number): Promise<{
  success: boolean;
  totalAvailableCents: number;
  items: ClearedFundItemDto[];
  message?: string;
}> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    const sql = `
      SELECT p.*,
        COALESCE((
          SELECT SUM(pi.allocated_amount_cents)
          FROM payout_items pi
          JOIN payouts py ON py.id = pi.payout_id
          WHERE pi.incoming_payment_id = p.id AND py.is_cancelled = 0
        ), 0) as disbursed_cents
      FROM incoming_payments p
      WHERE p.promoter_id = ? AND p.status = 'CLEARED'
      ORDER BY p.id ASC
    `;

    const res = await client.execute({ sql, args: [promoterId] });

    let totalAvailableCents = 0;
    const items: ClearedFundItemDto[] = [];

    for (const row of res.rows) {
      const amountCents = Number(row.amount_cents);
      const disbursedCents = Number(row.disbursed_cents || 0);
      const remainingCents = Math.max(0, amountCents - disbursedCents);

      if (remainingCents > 0) {
        totalAvailableCents += remainingCents;
        items.push({
          incomingPaymentId: Number(row.id),
          buyerName: String(row.buyer_name),
          unitNumber: row.unit_number ? String(row.unit_number) : null,
          referenceNumber: String(row.reference_number),
          bankName: String(row.bank_name),
          depositDate: String(row.deposit_date),
          clearanceDate: row.clearance_date ? String(row.clearance_date) : null,
          totalAmountCents: amountCents,
          disbursedAmountCents: disbursedCents,
          remainingAmountCents: remainingCents,
          suggestedAllocationCents: remainingCents, // Default 100% allocation
        });
      }
    }

    return { success: true, totalAvailableCents, items };
  } catch (error) {
    console.error("Error getting cleared funds:", error);
    return { success: false, totalAvailableCents: 0, items: [], message: "خطأ في جلب الأموال المحصلة" };
  }
}

export async function getNextCheckNumberAction(): Promise<{
  success: boolean;
  checkbookId?: number;
  checkNumber?: number;
  seriesPrefix?: string;
  message?: string;
}> {
  await ensureDbInitialized();
  const client = getRawClient();

  const res = await client.execute("SELECT id, series_prefix, current_number, end_number FROM checkbooks WHERE is_active = 1 LIMIT 1");
  if (res.rows.length === 0) {
    return { success: false, message: "لا يوجد دفتر صكوك نشط، يرجى تفعيل دفتر صكوك أولاً" };
  }

  const row = res.rows[0];
  const currentNumber = Number(row.current_number);
  const endNumber = Number(row.end_number);

  if (currentNumber > endNumber) {
    return { success: false, message: "انتهت أرقام دفتر الصكوك النشط الحالي" };
  }

  return {
    success: true,
    checkbookId: Number(row.id),
    checkNumber: currentNumber,
    seriesPrefix: row.series_prefix ? String(row.series_prefix) : undefined,
  };
}

export async function executePromoterPayoutAction(input: {
  promoterId: number;
  operatorName: string;
  notes?: string;
  items: { incomingPaymentId: number; allocatedAmountCents: number }[];
}): Promise<{ success: boolean; payoutId?: number; checkNumber?: number; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    if (!input.promoterId) return { success: false, message: "يجب اختيار المرقي العقاري" };
    if (!input.items || input.items.length === 0) return { success: false, message: "يجب اختيار بند واحد على الأقل للصرف" };

    // حساب المجموع الإجمالي
    let totalPayoutCents = 0;
    for (const item of input.items) {
      if (item.allocatedAmountCents <= 0) continue;
      totalPayoutCents += item.allocatedAmountCents;
    }

    if (totalPayoutCents <= 0) {
      return { success: false, message: "المبلغ الإجمالي للصرف يجب أن يكون أكبر من صفر" };
    }

    // التحقق الصارم من القاعدة الذهبية: كل المبالغ يجب أن تكون CLEARED والمبلغ المقتطع <= المتبقي
    for (const item of input.items) {
      if (item.allocatedAmountCents <= 0) continue;

      const pRes = await client.execute({
        sql: `SELECT p.*,
                COALESCE((
                  SELECT SUM(pi.allocated_amount_cents)
                  FROM payout_items pi
                  JOIN payouts py ON py.id = pi.payout_id
                  WHERE pi.incoming_payment_id = p.id AND py.is_cancelled = 0
                ), 0) as disbursed_cents
              FROM incoming_payments p
              WHERE p.id = ?`,
        args: [item.incomingPaymentId],
      });

      if (pRes.rows.length === 0) {
        return { success: false, message: `التدفق رقم ${item.incomingPaymentId} غير موجود` };
      }

      const payment = pRes.rows[0];
      if (payment.status !== "CLEARED") {
        return {
          success: false,
          message: `رفض أمني: لا يمكن صرف العملية (${payment.reference_number}) لأنها لم تُحصّل في كشف الخزينة بعد! الحالة الحالية: ${payment.status}`,
        };
      }

      const amountCents = Number(payment.amount_cents);
      const disbursedCents = Number(payment.disbursed_cents || 0);
      const remainingCents = Math.max(0, amountCents - disbursedCents);

      if (item.allocatedAmountCents > remainingCents) {
        return {
          success: false,
          message: `المبلغ المطلوب صرفه (${item.allocatedAmountCents / 100} دج) يتجاوز الرصيد المتبقي للعملية (${remainingCents / 100} دج)`,
        };
      }
    }

    // حجز رقم الصك التسلسلي من دفتر صكوك الخزينة
    const cbRes = await client.execute("SELECT id, current_number, end_number, series_prefix FROM checkbooks WHERE is_active = 1 LIMIT 1");
    if (cbRes.rows.length === 0) {
      return { success: false, message: "لا يوجد دفتر صكوك نشط" };
    }

    const checkbook = cbRes.rows[0];
    const checkbookId = Number(checkbook.id);
    const assignedCheckNumber = Number(checkbook.current_number);
    const endNumber = Number(checkbook.end_number);

    if (assignedCheckNumber > endNumber) {
      return { success: false, message: "انتهت أرقام دفتر الصكوك النشط" };
    }

    const now = new Date().toISOString();
    const today = now.split("T")[0];

    // 1. زيادة عداد دفتر الصكوك فوراً
    await client.execute({
      sql: `UPDATE checkbooks SET current_number = current_number + 1 WHERE id = ?`,
      args: [checkbookId],
    });

    // 2. إدراج سجل الصرف الرئيسي
    const insertPayoutRes = await client.execute({
      sql: `INSERT INTO payouts (promoter_id, checkbook_id, check_number, total_amount_cents, issued_date, issued_by_operator, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        input.promoterId,
        checkbookId,
        assignedCheckNumber,
        totalPayoutCents,
        today,
        input.operatorName || "المشغل",
        input.notes || null,
        now,
      ],
    });

    const payoutId = Number(insertPayoutRes.rows[0].id);

    // 3. إدراج بنود التخصيص
    for (const item of input.items) {
      if (item.allocatedAmountCents <= 0) continue;
      await client.execute({
        sql: `INSERT INTO payout_items (payout_id, incoming_payment_id, allocated_amount_cents)
              VALUES (?, ?, ?)`,
        args: [payoutId, item.incomingPaymentId, item.allocatedAmountCents],
      });
    }

    // 4. تسجيل حالة الصك في dispositions
    await client.execute({
      sql: `INSERT INTO check_dispositions (checkbook_id, check_number, status, payout_id, operator, timestamp)
            VALUES (?, ?, 'ISSUED', ?, ?, ?)`,
      args: [checkbookId, assignedCheckNumber, payoutId, input.operatorName || "المشغل", now],
    });

    // 5. تسجيل قيد مدين (خصم من SDC) في دفتر الحركات غير القابل للتعديل
    await client.execute({
      sql: `INSERT INTO journal_entries (entry_type, payout_id, debit_cents, credit_cents, operator, description, timestamp)
            VALUES ('PAYOUT_ISSUE', ?, ?, 0, ?, ?, ?)`,
      args: [
        payoutId,
        totalPayoutCents,
        input.operatorName || "المشغل",
        `تحرير صك خزينة مجمع رقم ${assignedCheckNumber} بمبلغ ${totalPayoutCents / 100} دج للمرقي`,
        now,
      ],
    });

    // 6. تسجيل التدقيق
    await client.execute({
      sql: `INSERT INTO audit_logs (operator, action, entity_table, entity_id, details, timestamp)
            VALUES (?, 'ISSUE_PAYOUT', 'payouts', ?, ?, ?)`,
      args: [
        input.operatorName || "المشغل",
        payoutId,
        JSON.stringify({ checkNumber: assignedCheckNumber, totalPayoutCents, itemsCount: input.items.length }),
        now,
      ],
    });

    revalidatePath("/payouts");
    revalidatePath("/");
    revalidatePath("/reconciliation");
    return { success: true, payoutId, checkNumber: assignedCheckNumber };
  } catch (error) {
    console.error("Error executing payout:", error);
    return { success: false, message: error instanceof Error ? error.message : "حدث خطأ أثناء إصدار الصك" };
  }
}

export async function voidCheckNumberAction(input: {
  checkNumber: number;
  reason: string;
  operatorId: number;
  pin: string;
  operatorName: string;
}): Promise<{ success: boolean; message?: string }> {
  try {
    await ensureDbInitialized();
    const pinCheck = await verifyOperatorPinAction(input.operatorId, input.pin);
    if (!pinCheck.success) {
      return { success: false, message: pinCheck.message || "الرمز السري غير صحيح" };
    }

    const client = getRawClient();
    const now = new Date().toISOString();

    const cbRes = await client.execute("SELECT id, current_number FROM checkbooks WHERE is_active = 1 LIMIT 1");
    if (cbRes.rows.length === 0) return { success: false, message: "لا يوجد دفتر صكوك نشط" };

    const checkbookId = Number(cbRes.rows[0].id);
    const currentNumber = Number(cbRes.rows[0].current_number);

    // تسجيل الصك كـ VOIDED
    await client.execute({
      sql: `INSERT INTO check_dispositions (checkbook_id, check_number, status, void_reason, operator, timestamp)
            VALUES (?, ?, 'VOIDED', ?, ?, ?)`,
      args: [checkbookId, input.checkNumber, input.reason.trim(), input.operatorName, now],
    });

    // إذا كان الرقم هو الرقم الحالي الجاري، نرفع العداد رقماً
    if (input.checkNumber === currentNumber) {
      await client.execute({
        sql: `UPDATE checkbooks SET current_number = current_number + 1 WHERE id = ?`,
        args: [checkbookId],
      });
    }

    // تسجيل قيد في دفتر الحركات
    await client.execute({
      sql: `INSERT INTO journal_entries (entry_type, debit_cents, credit_cents, operator, description, timestamp)
            VALUES ('VOID_CHECK', 0, 0, ?, ?, ?)`,
      args: [input.operatorName, `حرق وإلغاء رقم صك الخزينة ${input.checkNumber} بسبب: ${input.reason}`, now],
    });

    // تسجيل التدقيق
    await client.execute({
      sql: `INSERT INTO audit_logs (operator, action, entity_table, entity_id, details, timestamp)
            VALUES (?, 'VOID_CHECK', 'check_dispositions', ?, ?, ?)`,
      args: [input.operatorName, input.checkNumber, JSON.stringify({ reason: input.reason }), now],
    });

    revalidatePath("/checkbooks");
    revalidatePath("/payouts/new");
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ أثناء إتلاف الصك" };
  }
}

export async function cancelPayoutAction(input: {
  payoutId: number;
  reason: string;
  operatorId: number;
  pin: string;
  operatorName: string;
}): Promise<{ success: boolean; message?: string }> {
  try {
    await ensureDbInitialized();
    const pinCheck = await verifyOperatorPinAction(input.operatorId, input.pin);
    if (!pinCheck.success) {
      return { success: false, message: pinCheck.message || "الرمز السري غير صحيح" };
    }

    const client = getRawClient();
    const pRes = await client.execute({
      sql: "SELECT * FROM payouts WHERE id = ?",
      args: [input.payoutId],
    });

    if (pRes.rows.length === 0) return { success: false, message: "الصك غير موجود" };
    const payout = pRes.rows[0];
    if (Boolean(payout.is_cancelled)) return { success: false, message: "هذا الصك ملغى بالفعل" };

    const totalAmountCents = Number(payout.total_amount_cents);
    const checkNumber = Number(payout.check_number);
    const checkbookId = Number(payout.checkbook_id);
    const now = new Date().toISOString();

    // 1. تحديث الصك كملغى
    await client.execute({
      sql: `UPDATE payouts SET is_cancelled = 1, cancel_reason = ?, cancelled_at = ? WHERE id = ?`,
      args: [input.reason.trim(), now, input.payoutId],
    });

    // 2. تحديث حالة رقم الصك إلى VOIDED
    await client.execute({
      sql: `UPDATE check_dispositions SET status = 'VOIDED', void_reason = ? WHERE payout_id = ?`,
      args: [input.reason.trim(), input.payoutId],
    });

    // 3. قيد عكسي تصحيحي في دفتر الحركات
    await client.execute({
      sql: `INSERT INTO journal_entries (entry_type, payout_id, debit_cents, credit_cents, operator, description, timestamp)
            VALUES ('PAYOUT_REVERSAL', ?, 0, ?, ?, ?, ?)`,
      args: [
        input.payoutId,
        totalAmountCents,
        input.operatorName,
        `قيد عكسي لإلغاء صك الخزينة رقم ${checkNumber} بمبلغ ${totalAmountCents / 100} دج بسبب: ${input.reason}`,
        now,
      ],
    });

    // 4. تسجيل التدقيق
    await client.execute({
      sql: `INSERT INTO audit_logs (operator, action, entity_table, entity_id, details, timestamp)
            VALUES (?, 'CANCEL_PAYOUT', 'payouts', ?, ?, ?)`,
      args: [input.operatorName, input.payoutId, JSON.stringify({ checkNumber, reason: input.reason, amountCents: totalAmountCents }), now],
    });

    revalidatePath("/payouts");
    revalidatePath(`/payouts/${input.payoutId}`);
    revalidatePath("/");
    revalidatePath("/reconciliation");
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ أثناء إلغاء الصك" };
  }
}

export async function getPayoutDetailsAction(payoutId: number): Promise<{
  success: boolean;
  payout?: PayoutDto;
  items?: {
    id: number;
    allocatedAmountCents: number;
    incomingPaymentId: number;
    buyerName: string;
    unitNumber: string | null;
    referenceNumber: string;
    bankName: string;
    depositDate: string;
    clearanceDate: string | null;
    originalAmountCents: number;
    contractReference: string | null;
  }[];
  message?: string;
}> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    const pRes = await client.execute({
      sql: `SELECT py.*, pr.name as promoter_name, pr.bank_rib as promoter_rib, pr.bank_name as promoter_bank,
              cb.series_prefix
            FROM payouts py
            JOIN promoters pr ON pr.id = py.promoter_id
            JOIN checkbooks cb ON cb.id = py.checkbook_id
            WHERE py.id = ?`,
      args: [payoutId],
    });

    if (pRes.rows.length === 0) return { success: false, message: "لم يتم العثور على الصك" };
    const row = pRes.rows[0];

    // جلب البنود
    const itemsRes = await client.execute({
      sql: `SELECT pi.id, pi.allocated_amount_cents, pi.incoming_payment_id,
              p.buyer_name, p.unit_number, p.reference_number, p.bank_name, p.deposit_date, p.clearance_date, p.amount_cents as original_amount_cents,
              vc.contract_reference
            FROM payout_items pi
            JOIN incoming_payments p ON p.id = pi.incoming_payment_id
            LEFT JOIN vefa_contracts vc ON vc.id = p.contract_id
            WHERE pi.payout_id = ?
            ORDER BY pi.id ASC`,
      args: [payoutId],
    });

    const items = itemsRes.rows.map((r) => ({
      id: Number(r.id),
      allocatedAmountCents: Number(r.allocated_amount_cents),
      incomingPaymentId: Number(r.incoming_payment_id),
      buyerName: String(r.buyer_name),
      unitNumber: r.unit_number ? String(r.unit_number) : null,
      referenceNumber: String(r.reference_number),
      bankName: String(r.bank_name),
      depositDate: String(r.deposit_date),
      clearanceDate: r.clearance_date ? String(r.clearance_date) : null,
      originalAmountCents: Number(r.original_amount_cents),
      contractReference: r.contract_reference ? String(r.contract_reference) : null,
    }));

    return {
      success: true,
      payout: {
        id: Number(row.id),
        promoterId: Number(row.promoter_id),
        promoterName: String(row.promoter_name),
        promoterRib: row.promoter_rib ? String(row.promoter_rib) : null,
        promoterBank: row.promoter_bank ? String(row.promoter_bank) : null,
        checkNumber: Number(row.check_number),
        seriesPrefix: row.series_prefix ? String(row.series_prefix) : null,
        totalAmountCents: Number(row.total_amount_cents),
        issuedDate: String(row.issued_date),
        issuedByOperator: String(row.issued_by_operator),
        notes: row.notes ? String(row.notes) : null,
        isCancelled: Boolean(row.is_cancelled),
        cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
        cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
        itemsCount: items.length,
      },
      items,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ أثناء جلب التفاصيل" };
  }
}

export async function getAllPayoutsAction(): Promise<PayoutDto[]> {
  await ensureDbInitialized();
  const client = getRawClient();

  const res = await client.execute(`
    SELECT py.*, pr.name as promoter_name, cb.series_prefix,
      (SELECT COUNT(*) FROM payout_items WHERE payout_id = py.id) as items_count
    FROM payouts py
    JOIN promoters pr ON pr.id = py.promoter_id
    JOIN checkbooks cb ON cb.id = py.checkbook_id
    ORDER BY py.id DESC
  `);

  return res.rows.map((row) => ({
    id: Number(row.id),
    promoterId: Number(row.promoter_id),
    promoterName: String(row.promoter_name),
    checkNumber: Number(row.check_number),
    seriesPrefix: row.series_prefix ? String(row.series_prefix) : null,
    totalAmountCents: Number(row.total_amount_cents),
    issuedDate: String(row.issued_date),
    issuedByOperator: String(row.issued_by_operator),
    notes: row.notes ? String(row.notes) : null,
    isCancelled: Boolean(row.is_cancelled),
    cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    itemsCount: Number(row.items_count || 0),
  }));
}
