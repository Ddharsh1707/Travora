package com.traveldesk.backend.config;

import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.auth.UserRepository;
import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.company.CompanyRepository;
import com.traveldesk.backend.employee.Employee;
import com.traveldesk.backend.employee.EmployeeRepository;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.beans.factory.annotation.Value;

import java.util.List;

@Configuration
public class DataInitializer {

    private record SeedEmployee(String empNumber, String fullName, String department, String designation) {}

    private static final List<SeedEmployee> SEED_EMPLOYEES = List.of(
            new SeedEmployee("AGR0001", "Suresh Babu Dangeti", "Petroleum Operations", "Executive"),
            new SeedEmployee("AGR0003", "Ganesh Kakarla", "Site Operations", "Site Engineer"),
            new SeedEmployee("AGR0007", "Anil Kukreja", "Operations", "Manager"),
            new SeedEmployee("AGR0009", "Ramana M", "Operations", "Operations Executive"),
            new SeedEmployee("MISPL0001", "Umamaheswari Yandapalli", "Corporate Management", "Director"),
            new SeedEmployee("MISPL0002", "Kalyan Swaroop Yandapalli", "Executive Management", "Managing Director"),
            new SeedEmployee("MISPL0003", "Himani Agarwal", "Finance & Accounts", "Finance Manager"),
            new SeedEmployee("MISPL0007", "Sirisha Vegaraju", "Administration", "Executive Admin"),
            new SeedEmployee("MISPL0014", "Vijaya Kumar Bgam", "Project Engineering", "Senior Project Engineer"),
            new SeedEmployee("MISPL0016", "P Satheesh", "Field Engineering", "Project Lead"),
            new SeedEmployee("MISPL0020", "Satya Prasad B", "Procurement", "Procurement Manager"),
            new SeedEmployee("MISPL0027", "M Murali Dhara Reddy", "Infrastructure Planning", "General Manager"),
            new SeedEmployee("MISPL0130", "Deena Raju Karra", "Commercial & Contracts", "Commercial Manager"),
            new SeedEmployee("MISPL0164", "D Vasantha Lakshmi", "Human Resources", "HR Head"),
            new SeedEmployee("MISPL0275", "Sulamangalam Dinesh Kumar", "Quality Assurance", "QA/QC Lead"),
            new SeedEmployee("MISPL0333", "Mohan Jagatha", "Logistics & Supply", "Supply Chain Executive"),
            new SeedEmployee("MISPL0372", "Vidyasagar Gorantala", "Civil & Structural", "Structural Engineer"),
            new SeedEmployee("MISPL0387", "Thenmozhi S", "Design & Drafting", "Senior Design Engineer"),
            new SeedEmployee("MISPL0402", "G Yathish Sai Krishna Posi", "Instrumentation", "Instrumentation Engineer"),
            new SeedEmployee("MISPL0409", "Ravi Raghavendra Durga Prasad K", "Electrical & Instrumentation", "Project Manager"),
            new SeedEmployee("MISPL0415", "Kranthi Bharkam", "Mechanical Systems", "Mechanical Engineer"),
            new SeedEmployee("MISPL0423", "Rammohan Gubbala", "Safety & HSE", "HSE Officer"),
            new SeedEmployee("MISPL0429", "Uppu Durga Rao", "Piping Engineering", "Piping Lead"),
            new SeedEmployee("MISPL0430", "Malaya Kumar", "Planning & Controls", "Planning Engineer"),
            new SeedEmployee("MISPL0440", "Dileep Kumar Gode", "Maintenance & Reliability", "Site Supervisor"),
            new SeedEmployee("MISPL0466", "Panthangi Shashidhar", "Operations Coordination", "Operations Lead"),
            new SeedEmployee("MISPL0485", "Sumanth Krishna Gaddam", "Technology & Systems", "Systems Engineer")
    );

    @Bean
    CommandLineRunner initializeUsers(
            UserRepository userRepository,
            EmployeeRepository employeeRepository,
            CompanyRepository companyRepository,
            PasswordEncoder passwordEncoder,
            javax.sql.DataSource dataSource,
            @Value("${TRAVORA_ADMIN_USERNAME:admin}") String adminUsername,
            @Value("${TRAVORA_ADMIN_PASSWORD:password}") String adminPassword
    ) {
        return args -> {
            // Sanitize legacy null values in imported travel ledger if table exists
            if (dataSource != null) {
                try (var conn = dataSource.getConnection();
                     var stmt = conn.createStatement()) {
                    stmt.executeUpdate("UPDATE imported_travel_records SET leg_sequence = 1 WHERE leg_sequence IS NULL");
                    stmt.executeUpdate("UPDATE imported_travel_records SET is_credit_note = FALSE WHERE is_credit_note IS NULL");
                    stmt.executeUpdate("UPDATE imported_travel_records SET is_zero_fare_transit = FALSE WHERE is_zero_fare_transit IS NULL");
                    stmt.executeUpdate("UPDATE imported_travel_records SET travel_category = 'DOMESTIC_FLIGHT' WHERE travel_category IS NULL");
                    stmt.executeUpdate("UPDATE imported_travel_records SET original_currency = 'INR' WHERE original_currency IS NULL");
                    stmt.executeUpdate("UPDATE imported_travel_records SET source_row_number = 1 WHERE source_row_number IS NULL");
                    stmt.executeUpdate("UPDATE imported_travel_records SET imported = FALSE WHERE imported IS NULL");
                    stmt.executeUpdate("UPDATE imported_travel_records SET net_cost = cost WHERE net_cost IS NULL AND cost IS NOT NULL");
                } catch (Exception ignored) {}
            }

            // 0. Seed Default Company (MISPL)
            Company defaultCompany = companyRepository.findByCode("MISPL").orElseGet(() -> {
                Company c = new Company("Mahathi Infra Services Pvt. Ltd.", "MISPL", "mahathiinfra.com");
                return companyRepository.save(c);
            });

            // 1. Seed or synchronize ADMIN
            if (adminUsername != null && !adminUsername.isBlank()) {
                User admin = userRepository.findByUsername(adminUsername).orElse(null);
                if (admin == null) {
                    admin = new User();
                    admin.setUsername(adminUsername);
                    admin.setPassword(passwordEncoder.encode(adminPassword));
                    admin.setRole(Role.ADMIN);
                    admin.setActive(true);
                    admin.setCompany(defaultCompany);
                    userRepository.save(admin);
                } else if (admin.getCompany() == null) {
                    admin.setCompany(defaultCompany);
                    userRepository.save(admin);
                }
            }

            // 2. Seed or synchronize TRAVEL DESK: Employee ID 123456, Password: mahathi
            User desk = userRepository.findByUsername("123456").orElse(null);
            if (desk == null) {
                desk = new User();
                desk.setUsername("123456");
                desk.setPassword(passwordEncoder.encode("mahathi"));
                desk.setRole(Role.TRAVEL_DESK);
                desk.setEmployeeId("123456");
                desk.setActive(true);
                desk.setCompany(defaultCompany);
                userRepository.save(desk);
            } else {
                boolean modified = false;
                if (desk.getRole() != Role.TRAVEL_DESK) {
                    desk.setRole(Role.TRAVEL_DESK);
                    modified = true;
                }
                if (desk.getCompany() == null) {
                    desk.setCompany(defaultCompany);
                    modified = true;
                }
                if (!desk.isActive()) {
                    desk.setActive(true);
                    modified = true;
                }
                if (modified) {
                    userRepository.save(desk);
                }
            }

            // 3. Seed or synchronize APPROVER: Employee ID 654321, Password: mahathi1
            User approver = userRepository.findByUsername("654321").orElse(null);
            if (approver == null) {
                approver = new User();
                approver.setUsername("654321");
                approver.setPassword(passwordEncoder.encode("mahathi1"));
                approver.setRole(Role.APPROVER);
                approver.setEmployeeId("654321");
                approver.setActive(true);
                approver.setCompany(defaultCompany);
                userRepository.save(approver);
            } else {
                boolean modified = false;
                if (approver.getRole() != Role.APPROVER) {
                    approver.setRole(Role.APPROVER);
                    modified = true;
                }
                if (approver.getCompany() == null) {
                    approver.setCompany(defaultCompany);
                    modified = true;
                }
                if (!approver.isActive()) {
                    approver.setActive(true);
                    modified = true;
                }
                if (modified) {
                    userRepository.save(approver);
                }
            }

            // 4. Seed 27 EMPLOYEES: Login ID = employeeNumber, Password = employeeNumber
            for (SeedEmployee se : SEED_EMPLOYEES) {
                if (employeeRepository.findByEmployeeId(se.empNumber).isEmpty()) {
                    Employee emp = new Employee();
                    emp.setEmployeeId(se.empNumber);
                    emp.setName(se.fullName);
                    emp.setDepartment(se.department);
                    emp.setDesignation(se.designation);
                    emp.setCompany(defaultCompany);
                    employeeRepository.save(emp);
                }

                if (!userRepository.existsByUsername(se.empNumber)) {
                    User u = new User();
                    u.setUsername(se.empNumber);
                    u.setPassword(passwordEncoder.encode(se.empNumber));
                    u.setRole(Role.EMPLOYEE);
                    u.setEmployeeId(se.empNumber);
                    u.setActive(true);
                    u.setCompany(defaultCompany);
                    userRepository.save(u);
                }
            }
        };
    }
}
