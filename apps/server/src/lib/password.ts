import crypto from 'crypto';

const ALGO = 'pbkdf2';
const ITERATIONS = 150000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

function toHex(buffer: Buffer) {
    return buffer.toString('hex');
}

export function hashPassword(password: string) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
    return `${ALGO}$${ITERATIONS}$${salt}$${toHex(derived)}`;
}

export function verifyPassword(password: string, storedValue: string) {
    if (!storedValue.includes('$')) {
        return password === storedValue;
    }

    const [algo, iterationsRaw, salt, hash] = storedValue.split('$');

    if (algo !== ALGO || !iterationsRaw || !salt || !hash) {
        return password === storedValue;
    }

    const iterations = Number(iterationsRaw);
    if (!Number.isFinite(iterations) || iterations <= 0) {
        return false;
    }

    const candidate = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);
    const expected = Buffer.from(hash, 'hex');

    if (candidate.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(candidate, expected);
}

export function splitDisplayName(fullName?: string | null) {
    const normalized = String(fullName ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
        return { firstName: '', lastName: '' };
    }

    const [firstName, ...rest] = normalized.split(' ');
    return {
        firstName,
        lastName: rest.join(' '),
    };
}
