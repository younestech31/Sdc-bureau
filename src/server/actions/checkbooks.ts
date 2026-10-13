"use server";

import { ensureDbInitialized, getRawClient } from "@/lib/db";
import { revalidatePath } from "next/cache";

export interface CheckbookDto {
  id: number;
  accountId: number;
  seriesPrefix: string | null;
  startNumber: number;
  endNumber: number;
  currentNumber: number;
  isActive: boolean;
  totalChecks: number;
  remainingChecks: number;
}

export interface CheckDispositionDto {
  id: number;
  checkNumber: number;
  status: "ISSUED" | "VOIDED" | "RECONCILED";
  payoutId: number | null;
  voidReason: string | null;
  operator: string;
  timestamp: string;
  payoutAmountCents?: number;
  promoterName?: string;
}

export async function getCheckbooksAction(): Promise<CheckbookDto[]> {
  await ensureDbInitialized();
  const client = getRawClient();

  const res = await client.execute("SELECT * FROM checkbooks ORDER BY id DESC");
  return res.rows.map((r) => {
    const start = Number(r.start_number);
    const end = Number(r.end_number);
    const curr = Number(r.current_number);
    const total = end - start + 1;
    const remaining = Math.max(0, end - curr + 1);

    return {
      id: Number(r.id),
      accountId: Number(r.account_id),
      seriesPrefix: r.series_prefix ? String(r.series_prefix) : null,
      startNumber: start,
      endNumber: end,
      currentNumber: curr,
      isActive: Boolean(r.is_active),
      totalChecks: total,
      remainingChecks: remaining,
    };
  });
}

export async function createCheckbookAction(input: {
  seriesPrefix?: string;
  startNumber: number;
  endNumber: number;
  setActive?: boolean;
}): Promise<{ success: boolean; id?: number; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    if (input.startNumber >= input.endNumber) {
      return { success: false, message: "رقم البداية يجب أن يكون أقل من رقم النهاية" };
    }

    const now = new Date().toISOString();
    const accRes = await client.execute("SELECT id FROM accounts LIMIT 1");
    const accountId = Number(accRes.rows[0]?.id || 1);

    if (input.setActive) {
      await client.execute("UPDATE checkbooks SET is_active = 0");
    }

    const res = await client.execute({
      sql: `INSERT INTO checkbooks (account_id, series_prefix, start_number, end_number, current_number, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        accountId,
        input.seriesPrefix?.trim() || null,
        input.startNumber,
        input.endNumber,
        input.startNumber,
        input.setActive ? 1 : 0,
        now,
      ],
    });

    revalidatePath("/checkbooks");
    revalidatePath("/payouts/new");
    return { success: true, id: Number(res.rows[0].id) };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ أثناء إضافة دفتر الصكوك" };
  }
}

export async function getCheckDispositionsAction(): Promise<CheckDispositionDto[]> {
  await ensureDbInitialized();
  const client = getRawClient();

  const res = await client.execute(`
    SELECT cd.*, py.total_amount_cents, pr.name as promoter_name
    FROM check_dispositions cd
    LEFT JOIN payouts py ON py.id = cd.payout_id
    LEFT JOIN promoters pr ON pr.id = py.promoter_id
    ORDER BY cd.check_number DESC, cd.id DESC
  `);

  return res.rows.map((r) => ({
    id: Number(r.id),
    checkNumber: Number(r.check_number),
    status: r.status as "ISSUED" | "VOIDED" | "RECONCILED",
    payoutId: r.payout_id ? Number(r.payout_id) : null,
    voidReason: r.void_reason ? String(r.void_reason) : null,
    operator: String(r.operator),
    timestamp: String(r.timestamp),
    payoutAmountCents: r.total_amount_cents ? Number(r.total_amount_cents) : undefined,
    promoterName: r.promoter_name ? String(r.promoter_name) : undefined,
  }));
}
