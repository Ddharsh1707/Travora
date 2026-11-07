package com.traveldesk.backend.ai.exception;

public class AIServiceException extends RuntimeException {

    private final String errorCode;
    private final boolean retryable;

    public AIServiceException(String message) {
        super(message);
        this.errorCode = "AI_ERROR";
        this.retryable = false;
    }

    public AIServiceException(String message, Throwable cause) {
        super(message, cause);
        this.errorCode = "AI_ERROR";
        this.retryable = false;
    }

    public AIServiceException(String message, String errorCode, boolean retryable) {
        super(message);
        this.errorCode = errorCode;
        this.retryable = retryable;
    }

    public AIServiceException(String message, String errorCode, boolean retryable, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
        this.retryable = retryable;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public boolean isRetryable() {
        return retryable;
    }
}

