-- ============================================================================
-- EduCore LMS - Authentication Module
-- Schema: auth
-- Tables: login_attempts, refresh_tokens, sessions, password_resets,
--         email_verifications, phone_verifications
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE auth.login_status_enum AS ENUM ('success', 'failed', 'blocked');
CREATE TYPE auth.token_status_enum AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE auth.verification_status_enum AS ENUM ('pending', 'verified', 'expired', 'failed');

-- ============================================================================
-- TABLE: login_attempts
-- Purpose: Track every login attempt for security monitoring.
-- Why: Brute-force detection, compliance, security auditing.
-- Business Rules: Immutable; kept 30 days, then deleted (manage.py cleanup_login_attempts). Rate limiting based on failed attempts.
-- Relationships: belongs to user (N:1)
-- ============================================================================

CREATE TABLE auth.login_attempts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID REFERENCES foundation.organizations(id) ON DELETE SET NULL,
    user_id             UUID REFERENCES foundation.users(id) ON DELETE SET NULL,
    email               VARCHAR(255),
    phone               VARCHAR(20),
    status              auth.login_status_enum NOT NULL,
    ip_address          INET NOT NULL,
    user_agent          TEXT,
    failure_reason      VARCHAR(100),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()

    -- Immutable: no updated_at or deleted_at
);

CREATE INDEX idx_login_attempts_user ON auth.login_attempts(user_id, created_at DESC);
CREATE INDEX idx_login_attempts_ip ON auth.login_attempts(ip_address, created_at DESC);
CREATE INDEX idx_login_attempts_org ON auth.login_attempts(organization_id, created_at DESC);
CREATE INDEX idx_login_attempts_email ON auth.login_attempts(email, created_at DESC) WHERE email IS NOT NULL;

-- Sample Record:
-- user_id: ..., status: 'success', ip_address: '192.168.1.1', created_at: '2026-06-29T14:30:00Z'

-- ============================================================================
-- TABLE: refresh_tokens
-- Purpose: Store refresh tokens for JWT-based authentication.
-- Why: Enables secure token rotation without re-authentication.
-- Business Rules: Token revoked on logout/rotation. Max 5 active per user.
-- Relationships: belongs to user (N:1)
-- Cascade: CASCADE on user delete (tokens become invalid)
-- ============================================================================

CREATE TABLE auth.refresh_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES foundation.users(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES foundation.organizations(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255) NOT NULL,
    device_info         VARCHAR(500),
    ip_address          INET,
    status              auth.token_status_enum NOT NULL DEFAULT 'active',
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    revoked_reason      VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash),
    CONSTRAINT chk_refresh_tokens_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_refresh_tokens_user ON auth.refresh_tokens(user_id, status);
CREATE INDEX idx_refresh_tokens_hash ON auth.refresh_tokens(token_hash) WHERE status = 'active';
CREATE INDEX idx_refresh_tokens_expires ON auth.refresh_tokens(expires_at) WHERE status = 'active';

-- ============================================================================
-- TABLE: sessions
-- Purpose: Active user sessions for session-based auth or tracking.
-- Why: Session management, concurrent login limits, forced logout.
-- Business Rules: Auto-expire after inactivity. Max sessions per user configurable.
-- Relationships: belongs to user (N:1)
-- ============================================================================

CREATE TABLE auth.sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES foundation.users(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES foundation.organizations(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255) NOT NULL,
    ip_address          INET,
    user_agent          TEXT,
    device_type         VARCHAR(50),
    device_name         VARCHAR(255),
    location            VARCHAR(255),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    ended_at            TIMESTAMPTZ,
    end_reason          VARCHAR(50),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sessions_token UNIQUE (token_hash),
    CONSTRAINT chk_sessions_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_sessions_user_active ON auth.sessions(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_org ON auth.sessions(organization_id) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_expires ON auth.sessions(expires_at) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_last_activity ON auth.sessions(last_activity_at) WHERE is_active = TRUE;

-- ============================================================================
-- TABLE: password_resets
-- Purpose: Track password reset requests and token validity.
-- Why: Secure password recovery flow with expiration and single-use tokens.
-- Business Rules: Token valid for 1 hour. Only latest token is valid per user.
-- Relationships: belongs to user (N:1)
-- ============================================================================

CREATE TABLE auth.password_resets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES foundation.users(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES foundation.organizations(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255) NOT NULL,
    ip_address          INET,
    expires_at          TIMESTAMPTZ NOT NULL,
    used_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_password_resets_token UNIQUE (token_hash),
    CONSTRAINT chk_password_resets_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_password_resets_user ON auth.password_resets(user_id, created_at DESC);
CREATE INDEX idx_password_resets_token ON auth.password_resets(token_hash) WHERE used_at IS NULL;

-- ============================================================================
-- TABLE: email_verifications
-- Purpose: Email address verification with OTP/token.
-- Why: Ensure email ownership before granting access.
-- Business Rules: Code valid for 15 min. Max 3 attempts per code.
-- Relationships: belongs to user (N:1)
-- ============================================================================

CREATE TABLE auth.email_verifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES foundation.users(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES foundation.organizations(id) ON DELETE CASCADE,
    email               VARCHAR(255) NOT NULL,
    code                VARCHAR(10) NOT NULL,
    token_hash          VARCHAR(255),
    attempts            SMALLINT NOT NULL DEFAULT 0,
    max_attempts        SMALLINT NOT NULL DEFAULT 3,
    status              auth.verification_status_enum NOT NULL DEFAULT 'pending',
    expires_at          TIMESTAMPTZ NOT NULL,
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_email_verif_attempts CHECK (attempts <= max_attempts),
    CONSTRAINT chk_email_verif_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_email_verifications_user ON auth.email_verifications(user_id, status);
CREATE INDEX idx_email_verifications_code ON auth.email_verifications(email, code) WHERE status = 'pending';

-- ============================================================================
-- TABLE: phone_verifications
-- Purpose: Phone number verification via SMS OTP.
-- Why: Ensure phone ownership; phone is primary auth in some regions.
-- Business Rules: OTP valid for 5 min. Max 3 attempts. Cooldown between sends.
-- Relationships: belongs to user (N:1)
-- ============================================================================

CREATE TABLE auth.phone_verifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES foundation.users(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES foundation.organizations(id) ON DELETE CASCADE,
    phone               VARCHAR(20) NOT NULL,
    code                VARCHAR(10) NOT NULL,
    attempts            SMALLINT NOT NULL DEFAULT 0,
    max_attempts        SMALLINT NOT NULL DEFAULT 3,
    status              auth.verification_status_enum NOT NULL DEFAULT 'pending',
    expires_at          TIMESTAMPTZ NOT NULL,
    verified_at         TIMESTAMPTZ,
    sent_via            VARCHAR(20) NOT NULL DEFAULT 'sms',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_phone_verif_attempts CHECK (attempts <= max_attempts),
    CONSTRAINT chk_phone_verif_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_phone_verifications_user ON auth.phone_verifications(user_id, status);
CREATE INDEX idx_phone_verifications_code ON auth.phone_verifications(phone, code) WHERE status = 'pending';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER trg_refresh_tokens_updated_at BEFORE UPDATE ON auth.refresh_tokens
    FOR EACH ROW EXECUTE FUNCTION foundation.update_updated_at();

CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON auth.sessions
    FOR EACH ROW EXECUTE FUNCTION foundation.update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE auth.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.phone_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON auth.refresh_tokens
    USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY tenant_isolation ON auth.sessions
    USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY tenant_isolation ON auth.password_resets
    USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY tenant_isolation ON auth.email_verifications
    USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY tenant_isolation ON auth.phone_verifications
    USING (organization_id = current_setting('app.current_org_id')::UUID);
