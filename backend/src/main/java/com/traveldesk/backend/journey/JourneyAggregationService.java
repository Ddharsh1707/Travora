package com.traveldesk.backend.journey;

import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.importdata.ImportBatch;
import com.traveldesk.backend.importdata.ImportedTravelRecord;
import com.traveldesk.backend.importdata.ImportedTravelRecordRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

@Service
public class JourneyAggregationService {

    private static final Logger log = LoggerFactory.getLogger(JourneyAggregationService.class);

    private final DerivedJourneyRepository journeyRepository;
    private final ImportedTravelRecordRepository recordRepository;

    public JourneyAggregationService(
            DerivedJourneyRepository journeyRepository,
            ImportedTravelRecordRepository recordRepository
    ) {
        this.journeyRepository = journeyRepository;
        this.recordRepository = recordRepository;
    }

    /**
     * Reconstruct multi-leg parent journeys from confirmed imported travel records.
     * Groups connecting legs (e.g. HYD -> BOM and BOM -> ROB) into a single parent DerivedJourney.
     * Preserves zero-fare connecting transit legs without double-counting finances.
     */
    @Transactional
    public List<DerivedJourney> reconstructJourneysForBatch(ImportBatch batch, List<ImportedTravelRecord> records) {
        if (records == null || records.isEmpty()) {
            return Collections.emptyList();
        }

        Company company = batch.getCompany();

        // Filter records that are flights and confirmed
        List<ImportedTravelRecord> flightRecords = records.stream()
                .filter(r -> "FLIGHT".equalsIgnoreCase(r.getTravelMode()) ||
                             "DOMESTIC_FLIGHT".equalsIgnoreCase(r.getTravelCategory()) ||
                             "INTERNATIONAL_FLIGHT".equalsIgnoreCase(r.getTravelCategory()))
                .filter(r -> r.getTravelDate() != null && r.getFromLocation() != null && r.getToLocation() != null)
                .toList();

        if (flightRecords.isEmpty()) {
            return Collections.emptyList();
        }

        // Group by passenger and travel date (or primary ticket reference prefix)
        Map<String, List<ImportedTravelRecord>> byPassengerDate = new LinkedHashMap<>();
        for (ImportedTravelRecord r : flightRecords) {
            String pax = r.getRawEmployeeName() != null ? r.getRawEmployeeName().trim().toUpperCase() : "UNKNOWN";
            String dateKey = r.getTravelDate().toString();
            String pnr = (r.getTicketReference() != null && !r.getTicketReference().isBlank())
                    ? r.getTicketReference().trim().split("[-/\\s]")[0]
                    : "NO_PNR";

            String groupKey = String.format("%s|%s|%s", pax, dateKey, pnr);
            byPassengerDate.computeIfAbsent(groupKey, k -> new ArrayList<>()).add(r);
        }

        List<DerivedJourney> savedJourneys = new ArrayList<>();

        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byPassengerDate.entrySet()) {
            List<ImportedTravelRecord> legs = entry.getValue();
            if (legs.isEmpty()) continue;

            // Sort legs by source row number or sequence
            legs.sort(Comparator.comparingInt(ImportedTravelRecord::getSourceRowNumber));

            ImportedTravelRecord firstLeg = legs.get(0);
            ImportedTravelRecord lastLeg = legs.get(legs.size() - 1);

            String passengerName = firstLeg.getRawEmployeeName() != null ? firstLeg.getRawEmployeeName() : "Passenger";
            String origin = firstLeg.getFromLocation();
            String destination = lastLeg.getToLocation();
            LocalDate startDate = firstLeg.getTravelDate();
            LocalDate endDate = lastLeg.getReturnDate() != null ? lastLeg.getReturnDate() : lastLeg.getTravelDate();

            String pnr = firstLeg.getTicketReference();

            BigDecimal gross = BigDecimal.ZERO;
            BigDecimal refunds = BigDecimal.ZERO;

            for (int i = 0; i < legs.size(); i++) {
                ImportedTravelRecord leg = legs.get(i);
                leg.setLegSequence(i + 1);

                BigDecimal amt = leg.getNetCost() != null ? leg.getNetCost() : leg.getCost();
                if (leg.isCreditNote() || (amt != null && amt.compareTo(BigDecimal.ZERO) < 0)) {
                    if (amt != null) refunds = refunds.add(amt.abs());
                } else if (!leg.isZeroFareTransit() && amt != null && amt.compareTo(BigDecimal.ZERO) > 0) {
                    gross = gross.add(amt.abs());
                }
            }

            BigDecimal net = gross.subtract(refunds);
            String journeyType = legs.size() > 1 ? "MULTI_CITY" : (firstLeg.getReturnDate() != null ? "ROUND_TRIP" : "ONE_WAY");
            String uid = String.format("JRN-%d-%s-%s-%s", company.getId(), startDate, passengerName.replaceAll("[^A-Za-z0-9]", ""), UUID.randomUUID().toString().substring(0, 8));

            DerivedJourney journey = new DerivedJourney();
            journey.setCompany(company);
            journey.setJourneyUid(uid);
            journey.setPrimaryPnr(pnr);
            journey.setEmployee(firstLeg.getEmployee());
            journey.setPassengerName(passengerName);
            journey.setJourneyType(journeyType);
            journey.setOrigin(origin);
            journey.setDestination(destination);
            journey.setStartDate(startDate);
            journey.setEndDate(endDate);
            journey.setTotalLegs(legs.size());
            journey.setGrossSpend(gross);
            journey.setTotalRefunds(refunds);
            journey.setNetSpend(net);

            journey = journeyRepository.save(journey);
            savedJourneys.add(journey);

            // Link legs to this journey
            for (ImportedTravelRecord leg : legs) {
                leg.setJourney(journey);
            }
        }

        return savedJourneys;
    }
}

