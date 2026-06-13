# Security Audit: AI Gateway

## Date: 2026-06-01
## Scope: src/lib/aiGateway.ts

---

## Findings

### HIGH: API Key Logging
- **Location:** `validateKey()` function, `console.log("Key accepted:", key.slice(0, 6) + "...")`
- **Risk:** First 6 characters of API keys logged to console. On Android, accessible via `adb logcat`.
- **Fix:** Remove `console.log`. Use `maskKey()` if logging needed for debugging.

### MEDIUM: Unencrypted Key Storage
- **Location:** `AsyncStorage` (key-value store, no encryption)
- **Risk:** Keys stored in plaintext. Physical device access = key extraction.
- **Fix:** Use `expo-secure-store` or encrypt with device key before storing.

### MEDIUM: No Key Rotation
- **Location:** `saveKey()` function
- **Risk:** Old keys never invalidated. Compromised keys remain valid indefinitely.
- **Fix:** Add key expiration/rotation mechanism.

### LOW: No Rate Limiting on Validation
- **Location:** `validateKey()` calls `discoverModels()` which hits provider API
- **Risk:** Rapid validation attempts could trigger provider rate limits
- **Fix:** Add debounce or cooldown between validation attempts

---

## Recommendations

| Priority | Action |
|----------|--------|
| HIGH | Remove `console.log` from `validateKey` |
| MEDIUM | Migrate from AsyncStorage to expo-secure-store |
| MEDIUM | Add key rotation/expiration |
| LOW | Add rate limiting on validation |
