-- ==========================================================================
-- V11: Sanitize Null Ledger Fields for Production Compatibility
-- ==========================================================================

UPDATE imported_travel_records SET leg_sequence = 1 WHERE leg_sequence IS NULL;
UPDATE imported_travel_records SET is_credit_note = FALSE WHERE is_credit_note IS NULL;
UPDATE imported_travel_records SET is_zero_fare_transit = FALSE WHERE is_zero_fare_transit IS NULL;
UPDATE imported_travel_records SET travel_category = 'DOMESTIC_FLIGHT' WHERE travel_category IS NULL;
UPDATE imported_travel_records SET original_currency = 'INR' WHERE original_currency IS NULL;
UPDATE imported_travel_records SET source_row_number = 1 WHERE source_row_number IS NULL;
UPDATE imported_travel_records SET imported = FALSE WHERE imported IS NULL;
UPDATE imported_travel_records SET net_cost = cost WHERE net_cost IS NULL AND cost IS NOT NULL;
