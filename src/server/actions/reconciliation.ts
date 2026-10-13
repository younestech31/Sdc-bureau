"use server";

import { ensureDbInitialized, getRawClient } from "@/lib/db";
import { verifyOperatorPinAction } from "./operators";
import { revalidatePath } from "next/cache";

export interface ReconciliationDashboardDto {
  ledgerBalanceCents: number;
  clearedUndisbursedCents: number;
  depositsInTransitCents: number;
  outstandingPayoutsCents: number;
  statementBalanceCents: number;
  computedReconciledCents: number;
  differenceCents: number;
  pendingDepositsCount: number;
  clearedFundsCount: number;
  activeCheckNumber: number;
  statementId: number | null;
  statementMonth: number;
  statementYear: number;
  isStatementClosed: boolean;
  closedAt: string | null;
}

export async function getReconciliationDashboardAction(month?: number, year?: number): Promise<ReconciliationDashboardDto> {
  await ensureDbInitialized();
  const client = getRawClient();

  const now = new Date();
  const targetMonth = month || now.getMonth() + 1;
  const targetYear = year || now.getFullYear();

  // 1. حساب رصيد الدفتر الحركي المشتق: مجموع الدائن - مجموع المدين
  const ledgerRes = await client.execute(`
    SELECT 
      COALESCE(SUM(credit_cents), 0) as total_credits,
      COALESCE(SUM(debit_cents), 0) as total_debits
    FROM journal_entries
  `);
  const totalCredits = Number(ledgerRes.rows[0].total_credits || 0);
  const totalDebits = Number(ledgerRes.rows[0].total_debits || 0);
  const ledgerBalanceCents = totalCredits - totalDebits;

  // 2. حساب إجمالي الأموال المحصلة الجاهزة للصرف (CLEARED وغير مصروفة)
  const clearedRes = await client.execute(`
    SELECT 
      p.id, p.amount_cents,
      COALESCE((
        SELECT SUM(pi.allocated_amount_cents)
        FROM payout_items pi
        JOIN payouts py ON py.id = pi.payout_id
        WHERE pi.incoming_payment_id = p.id AND py.is_cancelled = 0
      ), 0) as disbursed_cents
    FROM incoming_payments p
    WHERE p.status = 'CLEARED'
  `);
  let clearedUndisbursedCents = 0;
  let clearedFundsCount = 0;
  for (const r of clearedRes.rows) {
    const rem = Math.max(0, Number(r.amount_cents) - Number(r.disbursed_cents || 0));
    if (rem > 0) {
      clearedUndisbursedCents += rem;
      clearedFundsCount++;
    }
  }

  // 3. الإيداعات التي لم تُقيّد بعد في الخزينة (Deposits in Transit: status = DEPOSITED)
  const transitRes = await client.execute(`
    SELECT 
      COALESCE(SUM(amount_cents), 0) as transit_total,
      COUNT(*) as cnt
    FROM incoming_payments
    WHERE status = 'DEPOSITED'
  `);
  const depositsInTransitCents = Number(transitRes.rows[0].transit_total || 0);
  const pendingDepositsCount = Number(transitRes.rows[0].cnt || 0);

  // 4. صكوك الصرف الصادرة التي لم تُخصم بعد من الخزينة (Outstanding Payout Checks)
  const outstandingRes = await client.execute(`
    SELECT COALESCE(SUM(total_amount_cents), 0) as outstanding_total
    FROM payouts py
    WHERE py.is_cancelled = 0
      AND py.id NOT IN (
        SELECT COALESCE(matched_payout_id, 0) FROM statement_lines WHERE is_matched = 1
      )
  `);
  const outstandingPayoutsCents = Number(outstandingRes.rows[0].outstanding_total || 0);

  // 5. جلب كشف الشهر الحالي
  const stmtRes = await client.execute({
    sql: `SELECT * FROM treasury_statements WHERE month = ? AND year = ? LIMIT 1`,
    args: [targetMonth, targetYear],
  });

  let statementId: number | null = null;
  let statementBalanceCents = 0;
  let isStatementClosed = false;
  let closedAt: string | null = null;

  if (stmtRes.rows.length > 0) {
    const s = stmtRes.rows[0];
    statementId = Number(s.id);
    statementBalanceCents = Number(s.ending_balance_cents || 0);
    isStatementClosed = Boolean(s.is_closed);
    closedAt = s.closed_at ? String(s.closed_at) : null;
  }

  // معادلة التسوية البنكية المعتمدة:
  // رصيد الكشف + إيداعات لم تقيد بعد - صكوك صادرة لم تخصم بعد = رصيد الدفتر المطابق
  const computedReconciledCents = statementBalanceCents + depositsInTransitCents - outstandingPayoutsCents;
  const differenceCents = computedReconciledCents - ledgerBalanceCents;

  // جلب رقم الصك الجاري النشط
  const cbRes = await client.execute("SELECT current_number FROM checkbooks WHERE is_active = 1 LIMIT 1");
  const activeCheckNumber = cbRes.rows.length > 0 ? Number(cbRes.rows[0].current_number) : 100001;

  return {
    ledgerBalanceCents,
    clearedUndisbursedCents,
    depositsInTransitCents,
    outstandingPayoutsCents,
    statementBalanceCents,
    computedReconciledCents,
    differenceCents,
    pendingDepositsCount,
    clearedFundsCount,
    activeCheckNumber,
    statementId,
    statementMonth: targetMonth,
    statementYear: targetYear,
    isStatementClosed,
    closedAt,
  };
}

export async function getOrCreateCurrentMonthStatementAction(month: number, year: number): Promise<{
  id: number;
  month: number;
  year: number;
  statementNumber: string | null;
  startingBalanceCents: number;
  endingBalanceCents: number;
  isClosed: boolean;
  closedAt: string | null;
}> {
  await ensureDbInitialized();
  const client = getRawClient();

  const res = await client.execute({
    sql: `SELECT * FROM treasury_statements WHERE month = ? AND year = ? LIMIT 1`,
    args: [month, year],
  });

  if (res.rows.length > 0) {
    const s = res.rows[0];
    return {
      id: Number(s.id),
      month: Number(s.month),
      year: Number(s.year),
      statementNumber: s.statement_number ? String(s.statement_number) : null,
      startingBalanceCents: Number(s.starting_balance_cents || 0),
      endingBalanceCents: Number(s.ending_balance_cents || 0),
      isClosed: Boolean(s.is_closed),
      closedAt: s.closed_at ? String(s.closed_at) : null,
    };
  }

  // إنشاء كشف جديد
  const now = new Date().toISOString();
  const insertRes = await client.execute({
    sql: `INSERT INTO treasury_statements (month, year, statement_number, starting_balance_cents, ending_balance_cents, is_closed, imported_at)
          VALUES (?, ?, ?, 0, 0, 0, ?) RETURNING id`,
    args: [month, year, `RELEVE-${year}-${String(month).padStart(2, "0")}`, now],
  });

  return {
    id: Number(insertRes.rows[0].id),
    month,
    year,
    statementNumber: `RELEVE-${year}-${String(month).padStart(2, "0")}`,
    startingBalanceCents: 0,
    endingBalanceCents: 0,
    isClosed: false,
    closedAt: null,
  };
}

export async function updateStatementBalanceAction(input: {
  statementId: number;
  endingBalanceCents: number;
  startingBalanceCents?: number;
  statementNumber?: string;
}): Promise<{ success: boolean; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    await client.execute({
      sql: `UPDATE treasury_statements 
            SET ending_balance_cents = ?, 
                starting_balance_cents = COALESCE(?, starting_balance_cents),
                statement_number = COALESCE(?, statement_number)
            WHERE id = ?`,
      args: [input.endingBalanceCents, input.startingBalanceCents ?? null, input.statementNumber ?? null, input.statementId],
    });

    revalidatePath("/reconciliation");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ" };
  }
}

export async function addStatementLineAction(input: {
  statementId: number;
  operationDate: string;
  description: string;
  referenceNumber?: string;
  type: "CREDIT" | "DEBIT";
  amountCents: number;
  operatorName: string;
}): Promise<{ success: boolean; lineId?: number; autoMatched?: boolean; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    if (!input.amountCents || input.amountCents <= 0) {
      return { success: false, message: "المبلغ يجب أن يكون أكبر من صفر" };
    }

    const cleanRef = input.referenceNumber?.trim() || "";
    let isMatched = false;
    let matchedPaymentId: number | null = null;
    let matchedPayoutId: number | null = null;

    // محاولة المطابقة التلقائية مع الصكوك بالرقم
    if (cleanRef) {
      if (input.type === "CREDIT") {
        const pRes = await client.execute({
          sql: `SELECT id, amount_cents FROM incoming_payments WHERE LOWER(TRIM(reference_number)) = LOWER(TRIM(?)) LIMIT 1`,
          args: [cleanRef],
        });
        if (pRes.rows.length > 0) {
          isMatched = true;
          matchedPaymentId = Number(pRes.rows[0].id);
          // وضع التدفق كـ CLEARED
          await client.execute({
            sql: `UPDATE incoming_payments SET status = 'CLEARED', clearance_date = ? WHERE id = ?`,
            args: [input.operationDate, matchedPaymentId],
          });
        }
      } else {
        const pyRes = await client.execute({
          sql: `SELECT id FROM payouts WHERE check_number = ? AND is_cancelled = 0 LIMIT 1`,
          args: [parseInt(cleanRef) || 0],
        });
        if (pyRes.rows.length > 0) {
          isMatched = true;
          matchedPayoutId = Number(pyRes.rows[0].id);
        }
      }
    }

    const insertRes = await client.execute({
      sql: `INSERT INTO statement_lines 
            (statement_id, operation_date, description, reference_number, type, amount_cents, is_matched, matched_payment_id, matched_payout_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        input.statementId,
        input.operationDate,
        input.description.trim(),
        cleanRef || null,
        input.type,
        input.amountCents,
        isMatched ? 1 : 0,
        matchedPaymentId,
        matchedPayoutId,
      ],
    });

    revalidatePath("/reconciliation");
    revalidatePath("/");
    return { success: true, lineId: Number(insertRes.rows[0].id), autoMatched: isMatched };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ أثناء إضافة السطر" };
  }
}

export async function getStatementLinesAction(statementId: number) {
  await ensureDbInitialized();
  const client = getRawClient();

  const res = await client.execute({
    sql: `SELECT * FROM statement_lines WHERE statement_id = ? ORDER BY operation_date DESC, id DESC`,
    args: [statementId],
  });

  return res.rows.map((r) => ({
    id: Number(r.id),
    statementId: Number(r.statement_id),
    operationDate: String(r.operation_date),
    valueDate: r.value_date ? String(r.value_date) : null,
    description: String(r.description),
    referenceNumber: r.reference_number ? String(r.reference_number) : null,
    type: String(r.type) as "CREDIT" | "DEBIT",
    amountCents: Number(r.amount_cents),
    isMatched: Boolean(r.is_matched),
    matchedPaymentId: r.matched_payment_id ? Number(r.matched_payment_id) : null,
    matchedPayoutId: r.matched_payout_id ? Number(r.matched_payout_id) : null,
  }));
}

export async function closeMonthlyStatementAction(input: {
  statementId: number;
  operatorName: string;
}): Promise<{ success: boolean; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();
    const now = new Date().toISOString();

    await client.execute({
      sql: `UPDATE treasury_statements SET is_closed = 1, closed_at = ?, closed_by_operator = ? WHERE id = ?`,
      args: [now, input.operatorName, input.statementId],
    });

    // تسجيل التدقيق
    await client.execute({
      sql: `INSERT INTO audit_logs (operator, action, entity_table, entity_id, details, timestamp)
            VALUES (?, 'CLOSE_MONTH', 'treasury_statements', ?, ?, ?)`,
      args: [input.operatorName, input.statementId, JSON.stringify({ closedAt: now }), now],
    });

    revalidatePath("/reconciliation");
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ" };
  }
}

export async function reopenMonthlyStatementAction(input: {
  statementId: number;
  operatorId: number;
  pin: string;
  reason: string;
  operatorName: string;
}): Promise<{ success: boolean; message?: string }> {
  try {
    await ensureDbInitialized();
    const pinCheck = await verifyOperatorPinAction(input.operatorId, input.pin);
    if (!pinCheck.success) {
      return { success: false, message: pinCheck.message || "الرمز السري غير صحيح" };
    }

    if (!input.reason?.trim()) {
      return { success: false, message: "يرجى توضيح سبب إعادة فتح الشهر في سجل التدقيق" };
    }

    const client = getRawClient();
    const now = new Date().toISOString();

    await client.execute({
      sql: `UPDATE treasury_statements SET is_closed = 0, reopen_reason = ? WHERE id = ?`,
      args: [input.reason.trim(), input.statementId],
    });

    // تسجيل التدقيق
    await client.execute({
      sql: `INSERT INTO audit_logs (operator, action, entity_table, entity_id, details, timestamp)
            VALUES (?, 'REOPEN_MONTH', 'treasury_statements', ?, ?, ?)`,
      args: [input.operatorName, input.statementId, JSON.stringify({ reason: input.reason.trim(), reopenedAt: now }), now],
    });

    revalidatePath("/reconciliation");
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ" };
  }
}
