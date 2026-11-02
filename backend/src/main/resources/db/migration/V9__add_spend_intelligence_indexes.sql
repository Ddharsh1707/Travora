-- ==========================================================================
-- V9: Add performance indexes for Travel Spend Intelligence & Analytics
-- Optimizes company-scoped aggregations, department/vendor metrics, and employee ledger lookups
-- ==========================================================================

CREATE INDEX IF NOT EXISTS idx_imported_records_spend 
    ON imported_travel_records(company_id, imported, cost);

CREATE INDEX IF NOT EXISTS idx_imported_records_emp_ident 
    ON imported_travel_records(company_id, imported, raw_employee_identifier);

CREATE INDEX IF NOT EXISTS idx_imported_records_dept 
    ON imported_travel_records(company_id, imported, department);

CREATE INDEX IF NOT EXISTS idx_imported_records_provider 
    ON imported_travel_records(company_id, imported, provider);

CREATE INDEX IF NOT EXISTS idx_imported_records_locations 
    ON imported_travel_records(company_id, imported, to_location, from_location);
