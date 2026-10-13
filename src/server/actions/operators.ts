"use server";

import { ensureDbInitialized, getRawClient } from "@/lib/db";

export interface OperatorDto {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
}

export async function getOperatorsAction(): Promise<OperatorDto[]> {
  await ensureDbInitialized();
  const client = getRawClient();
  const res = await client.execute("SELECT id, name, role, is_active FROM operators WHERE is_active = 1 ORDER BY id ASC");
  return res.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    role: String(row.role),
    isActive: Boolean(row.is_active),
  }));
}

export async function verifyOperatorPinAction(operatorId: number, pin: string): Promise<{ success: boolean; message?: string }> {
  await ensureDbInitialized();
  const client = getRawClient();
  const res = await client.execute({
    sql: "SELECT pin_hash FROM operators WHERE id = ? AND is_active = 1",
    args: [operatorId],
  });

  if (res.rows.length === 0) {
    return { success: false, message: "المشغل غير موجود أو غير نشط" };
  }

  const storedPin = String(res.rows[0].pin_hash);
  if (storedPin !== pin.trim()) {
    return { success: false, message: "الرمز السري (PIN) غير صحيح" };
  }

  return { success: true };
}
