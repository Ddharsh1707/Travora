-- ==========================================================================
-- V10: Add Project Intelligence, Multi-Allocation Ledger, Aliases & Journeys
-- Supports Decision 1 (Option B), Decision 2 (Option B), Decision 3 (Option A), Decision 4 (Option A)
-- ==========================================================================

-- 1. Projects & Cost Centers
CREATE TABLE IF NOT EXISTS projects (
    id              BIGSERIAL PRIMARY KEY,
    company_id      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_code    VARCHAR(50) NOT NULL,
    project_name    VARCHAR(255) NOT NULL,
    client_name     VARCHAR(255),
    location        VARCHAR(255),
    budget_amount   NUMERIC(14, 2),
    budget_currency VARCHAR(10) DEFAULT 'INR',
    status          VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_projects_company_code UNIQUE (company_id, project_code)
);

CREATE INDEX IF NOT EXISTS idx_projects_company_status ON projects(company_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_company_name   ON projects(company_id, project_name);

-- 2. Travel Record Project Allocations (Decision 1 - Option B)
CREATE TABLE IF NOT EXISTS travel_record_project_allocations (
    id                          BIGSERIAL PRIMARY KEY,
    company_id                  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    imported_travel_record_id   BIGINT NOT NULL REFERENCES imported_travel_records(id) ON DELETE CASCADE,
    project_id                  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    allocated_amount            NUMERIC(14, 2) NOT NULL,
    currency                    VARCHAR(10) DEFAULT 'INR',
    allocation_source           VARCHAR(50) DEFAULT 'SPREADSHEET_MATRIX',
    created_at                  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allocations_company_proj   ON travel_record_project_allocations(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_allocations_record         ON travel_record_project_allocations(imported_travel_record_id);

-- 3. Canonical Passenger Alias Mapping
CREATE TABLE IF NOT EXISTS imported_passenger_aliases (
    id                  BIGSERIAL PRIMARY KEY,
    company_id          BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    raw_name_string     VARCHAR(500) NOT NULL,
    normalized_name     VARCHAR(500) NOT NULL,
    employee_id         BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    match_rule          VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    confidence          VARCHAR(20) NOT NULL DEFAULT 'HIGH',
    verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_passenger_alias_company_raw UNIQUE (company_id, raw_name_string)
);

CREATE INDEX IF NOT EXISTS idx_passenger_aliases_lookup  ON imported_passenger_aliases(company_id, raw_name_string);
CREATE INDEX IF NOT EXISTS idx_passenger_aliases_emp     ON imported_passenger_aliases(company_id, employee_id);

-- 4. Derived Multi-Leg Journeys (Decision 4 - Option A)
CREATE TABLE IF NOT EXISTS derived_journeys (
    id                  BIGSERIAL PRIMARY KEY,
    company_id          BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    journey_uid         VARCHAR(100) NOT NULL,
    primary_pnr         VARCHAR(100),
    employee_id         BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    passenger_name      VARCHAR(500) NOT NULL,
    journey_type        VARCHAR(30) NOT NULL DEFAULT 'ONE_WAY',
    origin              VARCHAR(255) NOT NULL,
    destination         VARCHAR(255) NOT NULL,
    start_date          DATE NOT NULL,
    end_date            DATE,
    total_legs          INTEGER NOT NULL DEFAULT 1,
    gross_spend         NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_refunds       NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_spend           NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    currency            VARCHAR(10) DEFAULT 'INR',
    created_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_journeys_company_uid UNIQUE (company_id, journey_uid)
);

CREATE INDEX IF NOT EXISTS idx_journeys_company_dates     ON derived_journeys(company_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_journeys_company_passenger ON derived_journeys(company_id, passenger_name);
CREATE INDEX IF NOT EXISTS idx_journeys_company_emp       ON derived_journeys(company_id, employee_id);

-- 5. Extend employees for Safe Unverified Identity Staging (Decision 2 - Option B)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'VERIFIED';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS source_import_batch_id BIGINT REFERENCES import_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_verification ON employees(company_id, verification_status);

-- 6. Extend imported_travel_records for Financial Reconciliation & Hierarchy
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS journey_id BIGINT REFERENCES derived_journeys(id) ON DELETE SET NULL;
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS is_credit_note BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS original_ticket_reference VARCHAR(255);
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS net_cost NUMERIC(14, 2) DEFAULT 0.00;
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS is_zero_fare_transit BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS leg_sequence INTEGER DEFAULT 1;
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS travel_category VARCHAR(50) NOT NULL DEFAULT 'DOMESTIC_FLIGHT';
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS source_worksheet VARCHAR(255);
ALTER TABLE imported_travel_records ADD COLUMN IF NOT EXISTS original_currency VARCHAR(10) DEFAULT 'INR';

-- Populate net_cost for legacy records where net_cost is 0 or null
UPDATE imported_travel_records SET net_cost = cost WHERE net_cost = 0.00 AND cost IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_imported_records_proj      ON imported_travel_records(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_imported_records_journey   ON imported_travel_records(journey_id);
CREATE INDEX IF NOT EXISTS idx_imported_records_category  ON imported_travel_records(company_id, travel_category);
CREATE INDEX IF NOT EXISTS idx_imported_records_cn        ON imported_travel_records(company_id, is_credit_note);

