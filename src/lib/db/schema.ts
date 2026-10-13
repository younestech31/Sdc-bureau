import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// --- 1. المشغلون بالمكتب (Operators) ---
export const operators = sqliteTable("operators", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g. "الأستاذ رحال يونس - موثق", "الكاتب الأول"
  role: text("role").notNull(), // "NOTARY", "SENIOR_CLERK", "ACCOUNTANT"
  pinHash: text("pin_hash").notNull(), // PIN code for sensitive confirmations
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: text("created_at").notNull(),
});

// --- 2. حساب الخزينة العمومية (SDC Treasury Account) ---
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g. "حساب الزبائن - الخزينة الولائية"
  type: text("type").default("SDC").notNull(), // Strictly SDC for this system
  accountNumber: text("account_number").notNull(), // e.g. "400.123.456"
  treasuryName: text("treasury_name").notNull(), // e.g. "الخزينة الولائية لوهران"
  createdAt: text("created_at").notNull(),
});

// --- 3. دفاتر صكوك الخزينة (Treasury Checkbooks) ---
export const checkbooks = sqliteTable("checkbooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  seriesPrefix: text("series_prefix"), // بادئة السلسلة إن وجدت (e.g. "TX")
  startNumber: integer("start_number").notNull(),
  endNumber: integer("end_number").notNull(),
  currentNumber: integer("current_number").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: text("created_at").notNull(),
});

// سجل حالة كل رقم صك (مُصدَر، ملغي/محروق، مُحصّل في الكشف)
export const checkDispositions = sqliteTable("check_dispositions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  checkbookId: integer("checkbook_id").references(() => checkbooks.id).notNull(),
  checkNumber: integer("check_number").notNull(),
  status: text("status").notNull(), // "ISSUED", "VOIDED", "RECONCILED"
  payoutId: integer("payout_id"),
  voidReason: text("void_reason"), // سبب الإلغاء/الحرق
  operator: text("operator").notNull(),
  timestamp: text("timestamp").notNull(),
});

// --- 4. المرقيون والمشاريع (Promoters & VEFA Projects) ---
export const promoters = sqliteTable("promoters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // اسم شركة الترقية العقارية أو المرقي
  commercialRegister: text("commercial_register"), // السجل التجاري
  approvalNumber: text("approval_number"), // رقم الاعتماد الوزاري للترقية
  phone: text("phone"),
  email: text("email"),
  bankName: text("bank_name"), // البنك التجاري للمرقي (CPA, BNA, BEA, etc.)
  bankRib: text("bank_rib"), // رقم الحساب البنكي (RIB - 20 رقم)
  createdAt: text("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  promoterId: integer("promoter_id").references(() => promoters.id).notNull(),
  name: text("name").notNull(), // اسم المشروع السكني / العقاري
  buildingPermitNumber: text("building_permit_number"), // رخصة البناء
  fgcmpiCertificateNumber: text("fgcmpi_certificate_number"), // شهادة ضمان FGCMPI
  fgcmpiExpiryDate: text("fgcmpi_expiry_date"), // تاريخ نهاية شهادة الضمان (YYYY-MM-DD)
  currentProgressPercentage: integer("current_progress_percentage").default(0), // نسبة تقدم الأشغال المصرح بها %
  createdAt: text("created_at").notNull(),
});

// --- 5. المقتنون وعقود البيع على التصاميم (Buyers & VEFA Contracts) ---
export const buyers = sqliteTable("buyers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(), // اسم ولقب المكتتب / المشتري
  nationalId: text("national_id"), // رقم التعريف الوطني NIN
  phone: text("phone"),
  address: text("address"),
  createdAt: text("created_at").notNull(),
});

export const vefaContracts = sqliteTable("vefa_contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  buyerId: integer("buyer_id").references(() => buyers.id).notNull(),
  unitNumber: text("unit_number").notNull(), // رقم الشقة / المحل (e.g. "Appt A-14")
  unitType: text("unit_type").default("شقة").notNull(), // "شقة", "محل تجاري", "موقف سيارات"
  contractReference: text("contract_reference").notNull(), // رقم العقد التوثيقي ومجلده (e.g. "عقد رقم 42/2025")
  contractDate: text("contract_date"), // تاريخ توثيق العقد (YYYY-MM-DD)
  totalPriceCents: integer("total_price_cents").notNull(), // القيمة الإجمالية للعقد بالسنتيم
  createdAt: text("created_at").notNull(),
});

// --- 6. التدفقات الواردة (Incoming Inflows - صكوك وتحويلات المقتنين) ---
export const incomingPayments = sqliteTable("incoming_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  promoterId: integer("promoter_id").references(() => promoters.id).notNull(),
  contractId: integer("contract_id").references(() => vefaContracts.id), // اختياري عند الإيداع السريع
  buyerName: text("buyer_name").notNull(), // اسم المكتتب كما هو على الصك
  unitNumber: text("unit_number"), // رقم الوحدة السريعة
  amountCents: integer("amount_cents").notNull(), // المبلغ بالسنتيم الصحيح (1 دج = 100 سنتيم)
  paymentMethod: text("payment_method").default("CHECK").notNull(), // CHECK, CERTIFIED_CHECK, BANK_VIREMENT, TREASURY_TRANSFER
  referenceNumber: text("reference_number").notNull(), // رقم الصك أو رقم إشعار التحويل البنكي
  bankName: text("bank_name").notNull(), // البنك المصدر (CPA, BNA, BEA, BDL, BADR, Al Baraka, etc.)
  drawerName: text("drawer_name").notNull(), // الساحب (المشتري، بنك القرض CNEP، الصندوق CNL)
  paymentType: text("payment_type").default("قسط بيع على التصاميم").notNull(), // قسط حجز، قسط هيكل، قسط إتمام، إلخ
  depositDate: text("deposit_date").notNull(), // تاريخ الإيداع لدى الخزينة (YYYY-MM-DD)
  clearanceDate: text("clearance_date"), // تاريخ التحصيل الفعلي في كشف الخزينة (YYYY-MM-DD)
  status: text("status").default("DEPOSITED").notNull(), // DEPOSITED, CLEARED, BOUNCED
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// --- 7. صكوك الصرف المجمعة للمرقين (Promoter Payouts) ---
export const payouts = sqliteTable("payouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  promoterId: integer("promoter_id").references(() => promoters.id).notNull(),
  checkbookId: integer("checkbook_id").references(() => checkbooks.id).notNull(),
  checkNumber: integer("check_number").notNull(), // رقم صك الخزينة الصادر
  totalAmountCents: integer("total_amount_cents").notNull(), // إجمالي المبلغ المصروف بالسنتيم
  issuedDate: text("issued_date").notNull(), // تاريخ تحرير الصك (YYYY-MM-DD)
  issuedByOperator: text("issued_by_operator").notNull(), // اسم المشغل المعتمد
  notes: text("notes"),
  isCancelled: integer("is_cancelled", { mode: "boolean" }).default(false).notNull(),
  cancelReason: text("cancel_reason"),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").notNull(),
});

// بنود التخصيص لكل صك صرف (تخصيص جزئي أو كلي لكل تدفق وارد)
export const payoutItems = sqliteTable("payout_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payoutId: integer("payout_id").references(() => payouts.id).notNull(),
  incomingPaymentId: integer("incoming_payment_id").references(() => incomingPayments.id).notNull(),
  allocatedAmountCents: integer("allocated_amount_cents").notNull(), // المبلغ المقتطع بالسنتيم
  notes: text("notes"),
});

// --- 8. دفتر الحركات المحاسبي غير القابل للتعديل (Immutable Financial Journal Ledger) ---
export const journalEntries = sqliteTable("journal_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entryType: text("entry_type").notNull(), // INFLOW_DEPOSIT, INFLOW_CLEARANCE, PAYOUT_ISSUE, PAYOUT_REVERSAL, VOID_CHECK
  incomingPaymentId: integer("incoming_payment_id"),
  payoutId: integer("payout_id"),
  debitCents: integer("debit_cents").default(0).notNull(), // المبالغ الخارجة من SDC (الصرف للمرقي)
  creditCents: integer("credit_cents").default(0).notNull(), // المبالغ الداخلة لـ SDC (تحصيل المقتنين)
  operator: text("operator").notNull(),
  description: text("description").notNull(),
  timestamp: text("timestamp").notNull(),
});

// --- 9. كشوف الخزينة الشهرية والمصالحة (Treasury Statements & Bank Rec) ---
export const treasuryStatements = sqliteTable("treasury_statements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: integer("month").notNull(), // 1 - 12
  year: integer("year").notNull(), // e.g. 2026
  statementNumber: text("statement_number"),
  startingBalanceCents: integer("starting_balance_cents").default(0).notNull(),
  endingBalanceCents: integer("ending_balance_cents").default(0).notNull(),
  isClosed: integer("is_closed", { mode: "boolean" }).default(false).notNull(),
  closedAt: text("closed_at"),
  closedByOperator: text("closed_by_operator"),
  reopenReason: text("reopen_reason"),
  importedAt: text("imported_at").notNull(),
});

export const statementLines = sqliteTable("statement_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  statementId: integer("statement_id").references(() => treasuryStatements.id).notNull(),
  operationDate: text("operation_date").notNull(),
  valueDate: text("value_date"),
  description: text("description").notNull(),
  referenceNumber: text("reference_number"), // رقم الصك/التحويل
  type: text("type").notNull(), // "CREDIT" (تحصيل وارد) or "DEBIT" (صك صادر مخصوم)
  amountCents: integer("amount_cents").notNull(),
  isMatched: integer("is_matched", { mode: "boolean" }).default(false).notNull(),
  matchedPaymentId: integer("matched_payment_id"),
  matchedPayoutId: integer("matched_payout_id"),
});

// --- 10. سجل التدقيق الرقابي غير القابل للمحو (Audit Logs) ---
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  operator: text("operator").notNull(),
  action: text("action").notNull(), // "CLEAR_PAYMENT", "ISSUE_PAYOUT", "CANCEL_PAYOUT", "VOID_CHECK", "CLOSE_MONTH", "REOPEN_MONTH", "BACKUP"
  entityTable: text("entity_table").notNull(),
  entityId: integer("entity_id").notNull(),
  details: text("details"), // JSON serialized string with full payload & advisory warnings
  timestamp: text("timestamp").notNull(),
});
