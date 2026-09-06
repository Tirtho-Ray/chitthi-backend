import * as argon2 from 'argon2';
import {
    timingSafeEqual,
    randomBytes,
    createHmac,
    createCipheriv,
    createDecipheriv,
    createHash,
} from 'crypto';

/**
 * SecurityUtil — Production-grade cryptographic utility
 * Covers: hashing, comparison, OTP, recovery codes, HMAC pepper
 */
export class SecurityUtil {
    private static readonly encryptionVersion = 'enc:v1';

    // ─── Argon2id Config (env-driven, fail-fast) ───────────────────────────────
    private static readonly argonOptions: argon2.Options = {
        type: argon2.argon2id,
        memoryCost: parseInt(process.env.ARGON_MEMORY_COST ?? '65536'),   // 64MB
        timeCost: parseInt(process.env.ARGON_TIME_COST ?? '3'),
        parallelism: parseInt(process.env.ARGON_PARALLELISM ?? '4'),
    };

    // ─── Pepper (HMAC-based, never stored in DB) ────────────────────────────────
    /**
     * Apply HMAC pepper BEFORE hashing.
     * Even if DB is leaked, attacker needs the pepper key too.
     */
    private static applyPepper(data: string): string {
        const pepper = process.env.HASH_PEPPER;
        if (!pepper) return data; // Graceful degradation in dev
        return createHmac('sha256', pepper).update(data).digest('hex');
    }

    // ─── Hash ───────────────────────────────────────────────────────────────────
    /**
     * Hash sensitive data (passwords, tokens) with argon2id + pepper.
     * param data — plain text to hash
     * param usePepper — set false for non-password data (OTPs, tokens)
     */
    static async hashData(data: string, usePepper = true): Promise<string> {
        if (!data) throw new Error('Cannot hash empty data');
        const input = usePepper ? SecurityUtil.applyPepper(data) : data;
        return argon2.hash(input, SecurityUtil.argonOptions);
    }

    /**
     * Verify argon2id hash.
     * param data — plain text
     * param hash — stored hash
     * param usePepper — must match what was used during hashing
     */
    static async compareData(
        data: string,
        hash: string,
        usePepper = true,
    ): Promise<boolean> {
        if (!data || !hash) return false;
        try {
            const input = usePepper ? SecurityUtil.applyPepper(data) : data;
            return await argon2.verify(hash, input);
        } catch {
            return false;
        }
    }

    // ─── Timing-Safe String Comparison ─────────────────────────────────────────
    /**
     * Constant-time string comparison — prevents timing attacks.
     * Pads both inputs to the same fixed length before compare
     * so length difference itself is NOT leaked.
     */
    static safeCompare(a: string, b: string): boolean {
        if (!a || !b) return false;
        const MAX_LEN = 256;
        const bufA = Buffer.from(a.padEnd(MAX_LEN, '\0').slice(0, MAX_LEN));
        const bufB = Buffer.from(b.padEnd(MAX_LEN, '\0').slice(0, MAX_LEN));
        // timingSafeEqual checks bytes — length equality checked separately
        return timingSafeEqual(bufA, bufB) && a.length === b.length;
    }

    // ─── OTP Generation ─────────────────────────────────────────────────────────
    /**
     * Cryptographically secure numeric OTP.
     * Uses rejection sampling to eliminate modulo bias.
     * param length — OTP digit count (default: 6)
     */
    static generateOTP(length = 6): string {
        const digits = '0123456789';
        const result: string[] = [];
        // Rejection sampling — eliminates bias from modulo
        while (result.length < length) {
            const byte = randomBytes(1)[0];
            if (byte < 250) {  // 250 = floor(256/10)*10 — reject rest
                result.push(digits[byte % 10]);
            }
        }
        return result.join('');
    }

    // ─── Recovery Codes ─────────────────────────────────────────────────────────
    /**
     * Generate human-readable recovery codes (XXXXX-XXXXX format).
     * Returns { plain, hashed } — store hashed, show plain ONCE to user.
     * param count — number of codes (default: 8)
     */
    static async generateRecoveryCodes(
        count = 8,
    ): Promise<{ plain: string[]; hashed: string[] }> {
        const plain = Array.from({ length: count }, () => {
            const part = () => randomBytes(4).toString('hex').toUpperCase();
            return `${part().slice(0, 5)}-${part().slice(0, 5)}`;
        });

        const hashed = await Promise.all(
            plain.map(code => SecurityUtil.hashData(code, false)), // No pepper for recovery codes
        );

        return { plain, hashed };
    }

    /**
     * Verify a recovery code against an array of hashed codes.
     * Returns index of matched code (for invalidation) or -1.
     */
    static async verifyRecoveryCode(
        input: string,
        hashedCodes: string[],
    ): Promise<number> {
        for (let i = 0; i < hashedCodes.length; i++) {
            const match = await SecurityUtil.compareData(input, hashedCodes[i], false);
            if (match) return i;
        }
        return -1;
    }

    // ─── Secure Random ──────────────────────────────────────────────────────────
    /**
     * Generate a cryptographically secure random token (URL-safe base64).
     * Use for: email verification links, password reset tokens, etc.
     */
    static generateSecureToken(byteLength = 32): string {
        return randomBytes(byteLength)
            .toString('base64url'); // URL-safe, no padding issues
    }

    /**
     * Encrypt reversible secrets like third-party OAuth tokens before storing them.
     */
    static encryptSensitive(data: string): string {
        if (!data) throw new Error('Cannot encrypt empty data');

        const keyMaterial =
            process.env.OAUTH_TOKEN_ENCRYPTION_KEY ||
            process.env.DATA_ENCRYPTION_KEY ||
            process.env.APP_ENCRYPTION_KEY;

        if (!keyMaterial) {
            throw new Error(
                'Missing OAuth token encryption key. Set OAUTH_TOKEN_ENCRYPTION_KEY (or DATA_ENCRYPTION_KEY / APP_ENCRYPTION_KEY).',
            );
        }

        const key = createHash('sha256').update(keyMaterial).digest();
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([
            cipher.update(data, 'utf8'),
            cipher.final(),
        ]);
        const tag = cipher.getAuthTag();

        return [
            SecurityUtil.encryptionVersion,
            iv.toString('base64url'),
            tag.toString('base64url'),
            encrypted.toString('base64url'),
        ].join(':');
    }

    static decryptSensitive(payload: string): string {
        if (!payload) throw new Error('Cannot decrypt empty data');

        const keyMaterial =
            process.env.OAUTH_TOKEN_ENCRYPTION_KEY ||
            process.env.DATA_ENCRYPTION_KEY ||
            process.env.APP_ENCRYPTION_KEY;

        if (!keyMaterial) {
            throw new Error(
                'Missing OAuth token encryption key. Set OAUTH_TOKEN_ENCRYPTION_KEY (or DATA_ENCRYPTION_KEY / APP_ENCRYPTION_KEY).',
            );
        }

        const [version, ivB64, tagB64, cipherB64] = payload.split(':');
        if (version !== SecurityUtil.encryptionVersion || !ivB64 || !tagB64 || !cipherB64) {
            throw new Error('Invalid encrypted payload format');
        }

        const key = createHash('sha256').update(keyMaterial).digest();
        const decipher = createDecipheriv(
            'aes-256-gcm',
            key,
            Buffer.from(ivB64, 'base64url'),
        );
        decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));

        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(cipherB64, 'base64url')),
            decipher.final(),
        ]);

        return decrypted.toString('utf8');
    }

    /**
     * Generate a UUID-style device fingerprint seed.
     */
    static generateDeviceId(): string {
        return randomBytes(16).toString('hex');
    }
}
