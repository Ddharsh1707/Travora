package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.util.List;

public record DestinationAnalysis(
        List<DestinationMetric> topDestinations,
        List<RouteMetric> topRoutes,
        long domesticTrips,
        BigDecimal domesticSpend,
        long internationalTrips,
        BigDecimal internationalSpend
) {
    public record DestinationMetric(
            String destination,
            long tripCount,
            BigDecimal totalSpend,
            BigDecimal avgCost
    ) {}

    public record RouteMetric(
            String origin,
            String destination,
            String routeLabel,
            long tripCount,
            BigDecimal totalSpend,
            BigDecimal avgCost
    ) {}
}

