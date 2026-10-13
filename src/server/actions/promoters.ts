"use server";

import { ensureDbInitialized, getRawClient } from "@/lib/db";
import { revalidatePath } from "next/cache";

export interface PromoterDto {
  id: number;
  name: string;
  commercialRegister: string | null;
  approvalNumber: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankRib: string | null;
  projectsCount?: number;
  clearedFundsCents?: number;
}

export interface ProjectDto {
  id: number;
  promoterId: number;
  name: string;
  buildingPermitNumber: string | null;
  fgcmpiCertificateNumber: string | null;
  fgcmpiExpiryDate: string | null;
  currentProgressPercentage: number;
}

export async function getPromotersAction(): Promise<PromoterDto[]> {
  await ensureDbInitialized();
  const client = getRawClient();

  const res = await client.execute(`
    SELECT pr.*, 
      (SELECT COUNT(*) FROM projects WHERE promoter_id = pr.id) as projects_count,
      (
        SELECT COALESCE(SUM(p.amount_cents), 0) - COALESCE(SUM(
          (SELECT COALESCE(SUM(pi.allocated_amount_cents), 0) 
           FROM payout_items pi 
           JOIN payouts py ON py.id = pi.payout_id 
           WHERE pi.incoming_payment_id = p.id AND py.is_cancelled = 0)
        ), 0)
        FROM incoming_payments p
        WHERE p.promoter_id = pr.id AND p.status = 'CLEARED'
      ) as cleared_funds_cents
    FROM promoters pr
    ORDER BY pr.name ASC
  `);

  return res.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    commercialRegister: row.commercial_register ? String(row.commercial_register) : null,
    approvalNumber: row.approval_number ? String(row.approval_number) : null,
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    bankName: row.bank_name ? String(row.bank_name) : null,
    bankRib: row.bank_rib ? String(row.bank_rib) : null,
    projectsCount: Number(row.projects_count || 0),
    clearedFundsCents: Math.max(0, Number(row.cleared_funds_cents || 0)),
  }));
}

export async function createPromoterAction(input: {
  name: string;
  commercialRegister?: string;
  approvalNumber?: string;
  phone?: string;
  bankName?: string;
  bankRib?: string;
}): Promise<{ success: boolean; id?: number; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    if (!input.name?.trim()) return { success: false, message: "اسم المرقي العقاري مطلوب" };

    const now = new Date().toISOString();
    const res = await client.execute({
      sql: `INSERT INTO promoters (name, commercial_register, approval_number, phone, bank_name, bank_rib, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        input.name.trim(),
        input.commercialRegister?.trim() || null,
        input.approvalNumber?.trim() || null,
        input.phone?.trim() || null,
        input.bankName?.trim() || null,
        input.bankRib?.trim() || null,
        now,
      ],
    });

    revalidatePath("/promoters");
    revalidatePath("/payments/new");
    revalidatePath("/payouts/new");
    return { success: true, id: Number(res.rows[0].id) };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ أثناء إضافة المرقي" };
  }
}

export async function getProjectsAction(promoterId?: number): Promise<ProjectDto[]> {
  await ensureDbInitialized();
  const client = getRawClient();

  let query = `SELECT * FROM projects`;
  const args: number[] = [];
  if (promoterId) {
    query += ` WHERE promoter_id = ?`;
    args.push(promoterId);
  }
  query += ` ORDER BY id DESC`;

  const res = await client.execute({ sql: query, args });

  return res.rows.map((row) => ({
    id: Number(row.id),
    promoterId: Number(row.promoter_id),
    name: String(row.name),
    buildingPermitNumber: row.building_permit_number ? String(row.building_permit_number) : null,
    fgcmpiCertificateNumber: row.fgcmpi_certificate_number ? String(row.fgcmpi_certificate_number) : null,
    fgcmpiExpiryDate: row.fgcmpi_expiry_date ? String(row.fgcmpi_expiry_date) : null,
    currentProgressPercentage: Number(row.current_progress_percentage || 0),
  }));
}

export async function createProjectAction(input: {
  promoterId: number;
  name: string;
  buildingPermitNumber?: string;
  fgcmpiCertificateNumber?: string;
  fgcmpiExpiryDate?: string;
  currentProgressPercentage?: number;
}): Promise<{ success: boolean; id?: number; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();

    if (!input.promoterId) return { success: false, message: "يجب تحديد المرقي العقاري" };
    if (!input.name?.trim()) return { success: false, message: "اسم المشروع مطلوب" };

    const now = new Date().toISOString();
    const res = await client.execute({
      sql: `INSERT INTO projects (promoter_id, name, building_permit_number, fgcmpi_certificate_number, fgcmpi_expiry_date, current_progress_percentage, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        input.promoterId,
        input.name.trim(),
        input.buildingPermitNumber?.trim() || null,
        input.fgcmpiCertificateNumber?.trim() || null,
        input.fgcmpiExpiryDate?.trim() || null,
        input.currentProgressPercentage || 0,
        now,
      ],
    });

    revalidatePath("/promoters");
    return { success: true, id: Number(res.rows[0].id) };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ أثناء إضافة المشروع" };
  }
}

export async function getBuyersAction() {
  await ensureDbInitialized();
  const client = getRawClient();

  const res = await client.execute("SELECT * FROM buyers ORDER BY full_name ASC");
  return res.rows.map((r) => ({
    id: Number(r.id),
    fullName: String(r.full_name),
    nationalId: r.national_id ? String(r.national_id) : null,
    phone: r.phone ? String(r.phone) : null,
    address: r.address ? String(r.address) : null,
  }));
}

export async function createBuyerAction(input: {
  fullName: string;
  nationalId?: string;
  phone?: string;
  address?: string;
}): Promise<{ success: boolean; id?: number; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();
    if (!input.fullName?.trim()) return { success: false, message: "اسم المكتتب مطلوب" };

    const now = new Date().toISOString();
    const res = await client.execute({
      sql: `INSERT INTO buyers (full_name, national_id, phone, address, created_at)
            VALUES (?, ?, ?, ?, ?) RETURNING id`,
      args: [input.fullName.trim(), input.nationalId?.trim() || null, input.phone?.trim() || null, input.address?.trim() || null, now],
    });

    return { success: true, id: Number(res.rows[0].id) };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ" };
  }
}

/**
 * زر تعبئة البيانات التجريبية السريعة (اختياري بنقرة زر للتجربة الفورية):
 * يضيف مرقيين ومشروعين و3 صكوك مودعة لاختبار التحصيل والصرف في ثوانٍ!
 */
export async function seedSampleDataAction(): Promise<{ success: boolean; message?: string }> {
  try {
    await ensureDbInitialized();
    const client = getRawClient();
    const now = new Date().toISOString();
    const today = now.split("T")[0];

    // 1. إضافة مرقي
    const p1 = await client.execute({
      sql: `INSERT INTO promoters (name, commercial_register, approval_number, phone, bank_name, bank_rib, created_at)
            VALUES ('شركة الترقية العقارية الباهية SARL', '16/00-098231B19', 'AGR-LOG-2022-441', '041 33 22 11', 'البنك الوطني الجزائري BNA', '001 00234 0000123456 89', ?) RETURNING id`,
      args: [now],
    });
    const promoterId1 = Number(p1.rows[0].id);

    const p2 = await client.execute({
      sql: `INSERT INTO promoters (name, مؤسسة الأندلس للإنجاز العقاري EURL, commercial_register, approval_number, phone, bank_name, bank_rib, created_at)
            VALUES ('مؤسسة الأندلس للإنجاز العقاري EURL', '31/00-456789A21', 'AGR-LOG-2023-112', '041 55 66 77', 'القرض الشعبي الجزائري CPA', '004 00120 0000987654 32', ?) RETURNING id`,
      args: [now],
    });
    const promoterId2 = Number(p2.rows[0].id);

    // 2. مشاريع
    const prj1 = await client.execute({
      sql: `INSERT INTO projects (promoter_id, name, building_permit_number, fgcmpi_certificate_number, fgcmpi_expiry_date, current_progress_percentage, created_at)
            VALUES (?, 'إقامة الياسمين (80 مسكن ترقوي)', 'PC/2023/182', 'FGCMPI-CERT-2024-889', '2027-12-31', 45, ?) RETURNING id`,
      args: [promoterId1, now],
    });
    const projectId1 = Number(prj1.rows[0].id);

    // 3. مكتتب وعقد
    const b1 = await client.execute({
      sql: `INSERT INTO buyers (full_name, national_id, phone, address, created_at)
            VALUES ('بلقاسم بن عيسى', '198531012345678901', '0661 12 34 56', 'وهران، حي السلام', ?) RETURNING id`,
      args: [now],
    });
    const buyerId1 = Number(b1.rows[0].id);

    const c1 = await client.execute({
      sql: `INSERT INTO vefa_contracts (project_id, buyer_id, unit_number, unit_type, contract_reference, contract_date, total_price_cents, created_at)
            VALUES (?, ?, 'شقة F4 عمارة B رقم 12', 'شقة', 'عقد توثيقي رقم 184/2025', '2025-04-12', 1400000000, ?) RETURNING id`,
      args: [projectId1, buyerId1, now],
    });
    const contractId1 = Number(c1.rows[0].id);

    // 4. تدفقات واردة
    // صك 1: محصل وجاهز للصرف (4,000,000 دج)
    await client.execute({
      sql: `INSERT INTO incoming_payments 
        (promoter_id, contract_id, buyer_name, unit_number, amount_cents, payment_method, reference_number, bank_name, drawer_name, payment_type, deposit_date, clearance_date, status, created_at)
        VALUES (?, ?, 'بلقاسم بن عيسى', 'شقة F4 رقم 12', 400000000, 'CHECK', '0084512', 'CPA وهران', 'بلقاسم بن عيسى', 'قسط هيكل 20%', ?, ?, 'CLEARED', ?)`,
      args: [promoterId1, contractId1, today, today, now],
    });

    // صك 2: محصل وجاهز للصرف (2,500,000 دج)
    await client.execute({
      sql: `INSERT INTO incoming_payments 
        (promoter_id, contract_id, buyer_name, unit_number, amount_cents, payment_method, reference_number, bank_name, drawer_name, payment_type, deposit_date, clearance_date, status, created_at)
        VALUES (?, ?, 'فاطمة الزهراء قادري', 'شقة F3 رقم 05', 250000000, 'CHECK', '0091833', 'BNA العقيد لطفي', 'فاطمة الزهراء قادري', 'قسط أساسات 15%', ?, ?, 'CLEARED', ?)`,
      args: [promoterId1, contractId1, today, today, now],
    });

    // صك 3: مودع ولم يظهر في الكشف بعد (3,000,000 دج)
    await client.execute({
      sql: `INSERT INTO incoming_payments 
        (promoter_id, buyer_name, unit_number, amount_cents, payment_method, reference_number, bank_name, drawer_name, payment_type, deposit_date, status, created_at)
        VALUES (?, 'عبد القادر منصوري', 'محل تجاري رقم 02', 300000000, 'CHECK', '0073290', 'BEA الصنوبر', 'عبد القادر منصوري', 'قسط حجز 20%', ?, 'DEPOSITED', ?)`,
      args: [promoterId2, today, now],
    });

    // قيود دفتر الحركات
    await client.execute({
      sql: `INSERT INTO journal_entries (entry_type, debit_cents, credit_cents, operator, description, timestamp)
            VALUES 
              ('INFLOW_CLEARANCE', 0, 400000000, 'النظام', 'تحصيل صك رقم 0084512', ?),
              ('INFLOW_CLEARANCE', 0, 250000000, 'النظام', 'تحصيل صك رقم 0091833', ?),
              ('INFLOW_DEPOSIT', 0, 0, 'النظام', 'إيداع صك رقم 0073290 (قيد الانتظار)', ?)`,
      args: [now, now, now],
    });

    revalidatePath("/");
    revalidatePath("/payments");
    revalidatePath("/promoters");
    revalidatePath("/payouts/new");
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "خطأ" };
  }
}
