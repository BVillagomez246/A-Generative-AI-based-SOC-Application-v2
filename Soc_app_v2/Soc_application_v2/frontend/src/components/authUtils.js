// Client-side, localStorage-based auth - no backend/main.py involved at
// all, as requested. Passwords are hashed with SHA-256 before storage,
// but this is NOT real security: anyone with access to this browser's
// dev tools can read localStorage directly. Fine for a personal/demo
// login where you're the only user - not a substitute for real
// server-side authentication if this were ever used for real accounts.

const STORAGE_KEY = 'soc_users';

export const hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const getUsers = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
};

const saveUsers = (users) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    } catch (e) {
        // storage unavailable - registration won't persist this session
    }
};

export const registerUser = async (email, password) => {
    const users = getUsers();
    const normalizedEmail = email.trim().toLowerCase();

    if (users.some((u) => u.email === normalizedEmail)) {
        return { success: false, error: 'An account with this email already exists.' };
    }

    const passwordHash = await hashPassword(password);
    users.push({ email: normalizedEmail, passwordHash });
    saveUsers(users);

    return { success: true };
};

export const loginUser = async (email, password) => {
    const users = getUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    const match = users.find(
        (u) => u.email === normalizedEmail && u.passwordHash === passwordHash
    );

    return { success: !!match };
};
