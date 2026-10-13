import type { Client } from "@libsql/client";

export async function initDatabaseTables(client: Client) {
  // Execute schema creation
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'SDC',
      account_number TEXT NOT NULL,
      treasury_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS checkbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      series_prefix TEXT,
      start_number INTEGER NOT NULL,
      end_number INTEGER NOT NULL,
      current_number INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS check_dispositions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkbook_id INTEGER NOT NULL REFERENCES checkbooks(id),
      check_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      payout_id INTEGER,
      void_reason TEXT,
      operator TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS promoters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      commercial_register TEXT,
      approval_number TEXT,
      phone TEXT,
      email TEXT,
      bank_name TEXT,
      bank_rib TEXT,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promoter_id INTEGER NOT NULL REFERENCES promoters(id),
      name TEXT NOT NULL,
      building_permit_number TEXT,
      fgcmpi_certificate_number TEXT,
      fgcmpi_expiry_date TEXT,
      current_progress_percentage INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS buyers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      national_id TEXT,
      phone TEXT,
      address TEXT,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS vefa_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      buyer_id INTEGER NOT NULL REFERENCES buyers(id),
      unit_number TEXT NOT NULL,
      unit_type TEXT NOT NULL DEFAULT 'شقة',
      contract_reference TEXT NOT NULL,
      contract_date TEXT,
      total_price_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS incoming_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promoter_id INTEGER NOT NULL REFERENCES promoters(id),
      contract_id INTEGER REFERENCES vefa_contracts(id),
      buyer_name TEXT NOT NULL,
      unit_number TEXT,
      amount_cents INTEGER NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CHECK',
      reference_number TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      drawer_name TEXT NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'قسط بيع على التصاميم',
      deposit_date TEXT NOT NULL,
      clearance_date TEXT,
      status TEXT NOT NULL DEFAULT 'DEPOSITED',
      notes TEXT,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promoter_id INTEGER NOT NULL REFERENCES promoters(id),
      checkbook_id INTEGER NOT NULL REFERENCES checkbooks(id),
      check_number INTEGER NOT NULL,
      total_amount_cents INTEGER NOT NULL,
      issued_date TEXT NOT NULL,
      issued_by_operator TEXT NOT NULL,
      notes TEXT,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      cancel_reason TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS payout_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payout_id INTEGER NOT NULL REFERENCES payouts(id),
      incoming_payment_id INTEGER NOT NULL REFERENCES incoming_payments(id),
      allocated_amount_cents INTEGER NOT NULL,
      notes TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_type TEXT NOT NULL,
      incoming_payment_id INTEGER,
      payout_id INTEGER,
      debit_cents INTEGER NOT NULL DEFAULT 0,
      credit_cents INTEGER NOT NULL DEFAULT 0,
      operator TEXT NOT NULL,
      description TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS treasury_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      statement_number TEXT,
      starting_balance_cents INTEGER NOT NULL DEFAULT 0,
      ending_balance_cents INTEGER NOT NULL DEFAULT 0,
      is_closed INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT,
      closed_by_operator TEXT,
      reopen_reason TEXT,
      imported_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS statement_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL REFERENCES treasury_statements(id),
      operation_date TEXT NOT NULL,
      value_date TEXT,
      description TEXT NOT NULL,
      reference_number TEXT,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      is_matched INTEGER NOT NULL DEFAULT 0,
      matched_payment_id INTEGER,
      matched_payout_id INTEGER
    );`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_table TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL
    );`,
  ];

  for (const sql of ddlStatements) {
    await client.execute(sql);
  }

  // Ensure default operators exist
  const existingOperators = await client.execute("SELECT COUNT(*) as cnt FROM operators");
  const count = Number(existingOperators.rows[0].cnt);
  if (count === 0) {
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO operators (name, role, pin_hash, is_active, created_at) VALUES 
        (?, ?, ?, 1, ?),
        (?, ?, ?, 1, ?)`,
      args: [
        "الأستاذ رحال يونس (الموثق)", "NOTARY", "1234", now,
        "الكاتب الأول / المحاسب", "SENIOR_CLERK", "0000", now
      ],
    });
  }

  // Ensure default SDC account exists
  const existingAccounts = await client.execute("SELECT COUNT(*) as cnt FROM accounts");
  const accCount = Number(existingAccounts.rows[0].cnt);
  if (accCount === 0) {
    const now = new Date().toISOString();
    const res = await client.execute({
      sql: "INSERT INTO accounts (name, type, account_number, treasury_name, created_at) VALUES (?, 'SDC', ?, ?, ?) RETURNING id",
      args: ["حساب الزبائن - SDC", "400.088.192/45", "الخزينة العمومية الرئيسية", now],
    });
    const accountId = Number(res.rows[0]?.id || 1);

    // Create initial active checkbook
    await client.execute({
      sql: `INSERT INTO checkbooks (account_id, series_prefix, start_number, end_number, current_number, is_active, created_at)
            VALUES (?, 'TX', 100001, 100050, 100001, 1, ?)`,
      args: [accountId, now],
    });
  }
}
