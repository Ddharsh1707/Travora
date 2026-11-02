package com.traveldesk.backend.importdata;

import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.auth.UserRepository;
import com.traveldesk.backend.common.PaginatedResponse;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Optional;

@RestController
@RequestMapping("/api/imports")
public class ImportController {

    private final ImportService importService;
    private final UserRepository userRepository;

    public ImportController(ImportService importService, UserRepository userRepository) {
        this.importService = importService;
        this.userRepository = userRepository;
    }

    private User getAuthenticatedUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getName())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User is not authenticated");
        }
        return userRepository.findByUsername(auth.getName()).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User account not found")
        );
    }

    /**
     * Upload an Excel or CSV file to create a PREVIEW batch.
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK')")
    public ResponseEntity<ImportBatchResponse> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "sheet", required = false) String sheet
    ) {
        User user = getAuthenticatedUser();
        try {
            ImportBatchResponse response = importService.uploadAndPreview(file, sheet, user);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse spreadsheet: " + e.getMessage());
        }
    }

    /**
     * List all import batches for the user's company.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK')")
    public ResponseEntity<PaginatedResponse<ImportBatchResponse>> listBatches(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        User user = getAuthenticatedUser();
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(100, Math.max(1, size)));
        Page<ImportBatchResponse> result = importService.listBatches(user, pageable);
        return ResponseEntity.ok(PaginatedResponse.from(result));
    }

    /**
     * Get details of a specific batch.
     */
    @GetMapping("/{batchId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK')")
    public ResponseEntity<ImportBatchResponse> getBatch(@PathVariable Long batchId) {
        User user = getAuthenticatedUser();
        try {
            return ResponseEntity.ok(importService.getBatch(batchId, user));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    /**
     * Get paginated preview records for a batch.
     */
    @GetMapping("/{batchId}/records")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK')")
    public ResponseEntity<PaginatedResponse<ImportedRecordResponse>> getRecords(
            @PathVariable Long batchId,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        User user = getAuthenticatedUser();
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(100, Math.max(1, size)), Sort.by("sourceRowNumber").ascending());
        try {
            Page<ImportedRecordResponse> result = importService.getPreviewRecords(batchId, search, status, user, pageable);
            return ResponseEntity.ok(PaginatedResponse.from(result));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    /**
     * Update column mappings and re-process records.
     */
    @PutMapping("/{batchId}/mapping")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK')")
    public ResponseEntity<ImportBatchResponse> updateMapping(
            @PathVariable Long batchId,
            @Valid @RequestBody UpdateMappingRequest request
    ) {
        User user = getAuthenticatedUser();
        try {
            return ResponseEntity.ok(importService.updateMapping(batchId, request.columnMapping(), user));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to re-map spreadsheet: " + e.getMessage());
        }
    }

    /**
     * Confirm and import selected records.
     */
    @PostMapping("/{batchId}/confirm")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK')")
    public ResponseEntity<ImportResultResponse> confirmImport(
            @PathVariable Long batchId,
            @RequestBody(required = false) ConfirmImportRequest request
    ) {
        User user = getAuthenticatedUser();
        try {
            var selectedIds = request != null ? request.recordIds() : null;
            return ResponseEntity.ok(importService.confirmImport(batchId, selectedIds, user));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
    }

    /**
     * Search authoritative imported travel records.
     */
    @GetMapping("/travel-history")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER')")
    public ResponseEntity<PaginatedResponse<ImportedRecordResponse>> searchTravelHistory(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        User user = getAuthenticatedUser();
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(100, Math.max(1, size)), Sort.by("travelDate").descending().and(Sort.by("id").descending()));
        Page<ImportedRecordResponse> result = importService.searchTravelHistory(user, employeeId, fromDate, toDate, search, pageable);
        return ResponseEntity.ok(PaginatedResponse.from(result));
    }

    /**
     * Export imported travel records to CSV with formula injection protection.
     */
    @GetMapping("/travel-history/export")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER')")
    public ResponseEntity<byte[]> exportTravelHistory(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate
    ) {
        User user = getAuthenticatedUser();
        String csv = importService.exportTravelHistoryCsv(user, employeeId, fromDate, toDate, search);
        byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"travel_history_" + LocalDate.now() + ".csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(bytes);
    }
}

