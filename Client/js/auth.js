/**
 * PAH Auth & User Accounts v3 - Server Database SQLite + Local Backup
 * Handles registration, login, profiles (avatar, bio, featured works toggle), and account projects.
 */

class AuthManager {
    constructor() {
        this.USERS_KEY = "pah_registered_users";
        this.CURRENT_USER_KEY = "pah_current_session_user";
        this.currentUser = this.loadCurrentSession();
        this.listeners = [];
        this.cachedAccountProjects = [];
    }

    loadCurrentSession() {
        try {
            const raw = localStorage.getItem(this.CURRENT_USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    isLoggedIn() {
        return this.currentUser !== null && !this.currentUser.isGuest;
    }

    getCurrentUser() {
        if (this.currentUser) {
            return {
                id: this.currentUser.id,
                username: this.currentUser.username,
                avatarIcon: this.currentUser.avatarIcon || "fa-user-astronaut",
                avatarColor: this.currentUser.avatarColor || "#ffd700",
                bio: this.currentUser.bio || "",
                featuredEnabled: this.currentUser.featuredEnabled !== false,
                featuredProjectIds: Array.isArray(this.currentUser.featuredProjectIds) ? this.currentUser.featuredProjectIds : [],
                createdAt: this.currentUser.createdAt,
                isGuest: false
            };
        }
        return {
            username: "Gość",
            isGuest: true,
            id: "guest",
            avatarIcon: "fa-user",
            avatarColor: "#999",
            bio: "",
            featuredEnabled: false,
            featuredProjectIds: []
        };
    }

    async register(username, password) {
        username = username ? username.trim() : "";
        if (!username || username.length < 3) {
            throw new Error("Nazwa użytkownika musi mieć co najmniej 3 znaki.");
        }
        if (!password || password.length < 3) {
            throw new Error("Hasło musi mieć co najmniej 3 znaki.");
        }

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: "Błąd rejestracji." }));
                throw new Error(err.message || "Błąd rejestracji.");
            }

            const user = await res.json();
            this.currentUser = { ...user, isGuest: false };
            localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(this.currentUser));
            this.notifyListeners();
            return this.currentUser;
        } catch (serverErr) {
            if (serverErr.message && !serverErr.message.includes("Failed to fetch")) {
                throw serverErr;
            }
            const users = this.getRegisteredUsers();
            if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
                throw new Error("Użytkownik o takiej nazwie już istnieje.");
            }
            const newUser = {
                id: "usr_" + Date.now(),
                username: username,
                passwordHash: btoa(password),
                createdAt: new Date().toISOString(),
                avatarIcon: "fa-user-astronaut",
                avatarColor: "#ffd700",
                bio: "",
                featuredEnabled: true,
                featuredProjectIds: []
            };
            users.push(newUser);
            localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
            return this.login(username, password);
        }
    }

    async login(username, password) {
        username = username ? username.trim() : "";
        if (!username || !password) {
            throw new Error("Wprowadź nazwę użytkownika i hasło.");
        }

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: "Nieprawidłowa nazwa użytkownika lub hasło." }));
                throw new Error(err.message || "Nieprawidłowa nazwa użytkownika lub hasło.");
            }

            const user = await res.json();
            this.currentUser = { ...user, isGuest: false };
            localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(this.currentUser));
            this.notifyListeners();
            this.fetchAccountProjects();
            return this.currentUser;
        } catch (serverErr) {
            if (serverErr.message && !serverErr.message.includes("Failed to fetch")) {
                throw serverErr;
            }
            const users = this.getRegisteredUsers();
            const found = users.find(u => u.username.toLowerCase() === username.toLowerCase() && (u.passwordHash === btoa(password) || u.passwordHash === password));
            if (!found) {
                throw new Error("Nieprawidłowa nazwa użytkownika lub hasło.");
            }
            this.currentUser = {
                id: found.id,
                username: found.username,
                avatarIcon: found.avatarIcon || "fa-user-astronaut",
                avatarColor: found.avatarColor || "#ffd700",
                bio: found.bio || "",
                featuredEnabled: found.featuredEnabled !== false,
                featuredProjectIds: found.featuredProjectIds || [],
                createdAt: found.createdAt,
                isGuest: false
            };
            localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(this.currentUser));
            this.notifyListeners();
            return this.currentUser;
        }
    }

    logout() {
        this.currentUser = null;
        this.cachedAccountProjects = [];
        localStorage.removeItem(this.CURRENT_USER_KEY);
        this.notifyListeners();
    }

    async updateProfile(updates) {
        if (!this.isLoggedIn()) return false;
        
        try {
            const res = await fetch("/api/auth/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: this.currentUser.id, ...updates })
            });
            if (res.ok) {
                const user = await res.json();
                this.currentUser = { ...this.currentUser, ...user };
                localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(this.currentUser));
                this.notifyListeners();
                return true;
            }
        } catch (e) {}

        // Local update fallback
        if (updates.avatarIcon) this.currentUser.avatarIcon = updates.avatarIcon;
        if (updates.avatarColor) this.currentUser.avatarColor = updates.avatarColor;
        if (updates.bio !== undefined) this.currentUser.bio = updates.bio;
        if (updates.featuredEnabled !== undefined) this.currentUser.featuredEnabled = updates.featuredEnabled;
        if (updates.featuredProjectIds) this.currentUser.featuredProjectIds = updates.featuredProjectIds;
        localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(this.currentUser));
        this.notifyListeners();
        return true;
    }

    getFeaturedProjectIds() {
        if (!this.isLoggedIn()) return [];
        return Array.isArray(this.currentUser.featuredProjectIds) ? this.currentUser.featuredProjectIds : [];
    }

    isFeaturedEnabled() {
        if (!this.isLoggedIn()) return false;
        return this.currentUser.featuredEnabled !== false;
    }

    setFeaturedEnabled(enabled) {
        if (!this.isLoggedIn()) return;
        this.currentUser.featuredEnabled = !!enabled;
        localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(this.currentUser));
        this.updateProfile({ featuredEnabled: !!enabled });
    }

    toggleFeaturedProject(projectId) {
        if (!this.isLoggedIn()) return [];
        const ids = [...this.getFeaturedProjectIds()];
        const idx = ids.indexOf(projectId);
        if (idx >= 0) ids.splice(idx, 1);
        else ids.push(projectId);
        this.currentUser.featuredProjectIds = ids;
        localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(this.currentUser));
        this.updateProfile({ featuredProjectIds: ids });
        return ids;
    }

    async fetchPublicProfile(userId) {
        try {
            const res = await fetch(`/api/users/${userId}`);
            if (res.ok) return await res.json();
        } catch (e) {}
        return null;
    }

    async saveAccountProject(project) {
        if (!this.isLoggedIn()) return false;
        const clone = JSON.parse(JSON.stringify(project));
        clone.author = this.currentUser.username;
        clone.authorId = this.currentUser.id;
        clone.updatedAt = new Date().toISOString();

        try {
            const res = await fetch(`/api/users/${this.currentUser.id}/projects`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(clone)
            });
            if (res.ok) {
                const saved = await res.json();
                const idx = this.cachedAccountProjects.findIndex(p => p.id === saved.id);
                if (idx >= 0) this.cachedAccountProjects[idx] = saved;
                else this.cachedAccountProjects.unshift(saved);
                return true;
            }
        } catch (e) {}

        const idx = this.cachedAccountProjects.findIndex(p => p.id === clone.id);
        if (idx >= 0) this.cachedAccountProjects[idx] = clone;
        else this.cachedAccountProjects.unshift(clone);
        return true;
    }

    async fetchAccountProjects() {
        if (!this.isLoggedIn()) return [];
        try {
            const res = await fetch(`/api/users/${this.currentUser.id}/projects`);
            if (res.ok) {
                this.cachedAccountProjects = await res.json();
                return this.cachedAccountProjects;
            }
        } catch (e) {}
        return this.cachedAccountProjects;
    }

    getAccountProjects() {
        return this.cachedAccountProjects || [];
    }

    async deleteAccountProject(projectId) {
        if (!this.isLoggedIn()) return false;
        try {
            await fetch(`/api/users/${this.currentUser.id}/projects/${projectId}`, { method: "DELETE" });
        } catch (e) {}
        this.cachedAccountProjects = this.cachedAccountProjects.filter(p => p.id !== projectId);
        return true;
    }

    getRegisteredUsers() {
        try {
            const raw = localStorage.getItem(this.USERS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    onAuthChange(callback) {
        this.listeners.push(callback);
    }

    notifyListeners() {
        this.listeners.forEach(cb => {
            try { cb(this.getCurrentUser()); } catch (e) { console.error(e); }
        });
    }
}

window.authManager = new AuthManager();
