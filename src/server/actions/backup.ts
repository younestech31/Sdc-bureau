"use server";

import { ensureDbInitialized, getRawClient } from "@/lib/db";

export async function runIntegrityCheckAction(): Promise<{
  success: boolean;
  status: string;
  details: string[];
}> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    const res = await client.execute("PRAGMA integrity_check;");
    const results = res.rows.map((r) => Object.values(r)[0]?.toString() || "");

    const isOk = results.length > 0 && results[0].toLowerCase() === "ok";

    return {
      success: isOk,
      status: isOk ? "قاعدة البيانات سليمة ومحصنة بنجاح (100% Valid)" : "تم اكتشاف تنبيهات في فحص السلامة",
      details: results,
    };
  } catch (error) {
    return {
      success: false,
      status: "خطأ أثناء تنفيذ فحص السلامة",
      details: [error instanceof Error ? error.message : "خطأ غير متوقع"],
    };
  }
}

export async function exportDatabaseBackupAction(): Promise<{
  success: boolean;
  exportedAt: string;
  data?: Record<string, unknown[]>;
  message?: string;
}> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();
    const tables = [
      "accounts",
      "checkbooks",
      "check_dispositions",
      "promoters",
      "projects",
      "buyers",
      "vefa_contracts",
      "incoming_payments",
      "payouts",
      "payout_items",
      "journal_entries",
      "treasury_statements",
      "statement_lines",
      "audit_logs",
    ];

    const data: Record<string, unknown[]> = {};

    for (const t of tables) {
      const res = await client.execute(`SELECT * FROM ${t}`);
      data[t] = res.rows;
    }

    const exportedAt = new Date().toISOString();

    return {
      success: true,
      exportedAt,
      data,
    };
  } catch (error) {
    return {
      success: false,
      exportedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "فشل التصدير",
    };
  }
}

export async function getAuditLogsAction(limit = 100) {
  await ensureDbInitialized();
  const client = getRawClient();

  const res = await client.execute({
    sql: `SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?`,
    args: [limit],
  });

  return res.rows.map((r) => ({
    id: Number(r.id),
    operator: String(r.operator),
    action: String(r.action),
    entityTable: String(r.entity_table),
    entityId: Number(r.entity_id),
    details: r.details ? String(r.details) : null,
    timestamp: String(r.timestamp),
  }));
}
