package com.traveldesk.backend.config;

import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

@Configuration
public class FlywayConfig {

    private static final Logger log = LoggerFactory.getLogger(FlywayConfig.class);

    @Bean
    @ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true", matchIfMissing = true)
    public Flyway flyway(DataSource dataSource,
                         @Value("${spring.flyway.baseline-on-migrate:true}") boolean baselineOnMigrate) {
        log.info("Initializing Flyway and executing database schema migrations...");
        try {
            Flyway flyway = Flyway.configure()
                    .dataSource(dataSource)
                    .baselineOnMigrate(baselineOnMigrate)
                    .locations("classpath:db/migration")
                    .outOfOrder(true)
                    .load();
            flyway.migrate();
            log.info("Flyway database schema migrations completed successfully.");
            return flyway;
        } catch (Exception e) {
            log.warn("Flyway migration encountered an exception: {}. Continuing application startup with JPA DDL.", e.getMessage());
            return Flyway.configure().dataSource(dataSource).load();
        }
    }
}
