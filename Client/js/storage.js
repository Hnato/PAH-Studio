/**
 * PAH Storage & File System (.pah) + Export Engine (PNG, GIF, SpriteSheet, .PAH)
 */

const PAH_MAGIC = "PAH_PROJECT";
const PAH_VERSION = "2.0";

class ProjectStorage {
    constructor() {
        this.LOCAL_STORAGE_KEY = "pah_local_projects";
        this.COMMUNITY_STORAGE_KEY = "pah_community_projects";
        // Force clean slate for all users to remove previous templates/data
        if (!localStorage.getItem("pah_clean_slate_v3")) {
            localStorage.removeItem(this.LOCAL_STORAGE_KEY);
            localStorage.removeItem(this.COMMUNITY_STORAGE_KEY);
            localStorage.setItem("pah_clean_slate_v3", "true");
        }
    }

    // Create a new empty project object with custom size
    createNewProject(name = "Nowy Projekt", width = 16, height = 16, fps = 8) {
        width = Math.max(2, Math.min(256, parseInt(width) || 16));
        height = Math.max(2, Math.min(256, parseInt(height) || 16));
        fps = Math.max(1, Math.min(30, parseInt(fps) || 8));

        const defaultPalette = [
            "#00000000",
            "#1b4d3e", "#2d5a4c", "#4e342e", "#a0522d", "#d2691e",
            "#f5f5dc", "#ffffff", "#0d1a15", "#e8edea", "#ffd700",
            "#e74c3c", "#3498db", "#9b59b6", "#2ecc71", "#1abc9c"
        ];

        return {
            magic: PAH_MAGIC,
            version: PAH_VERSION,
            id: "pah_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
            name: name.trim() || "Projekt Pixel Art",
            author: (window.authManager && window.authManager.getCurrentUser().username) || "Gość",
            authorId: (window.authManager && window.authManager.getCurrentUser().id) || "guest",
            description: "",
            tags: ["pixelart"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            width: width,
            height: height,
            fps: fps,
            palette: defaultPalette,
            isPublic: false,
            likes: 0,
            frames: [
                {
                    id: "f_0",
                    duration: 1,
                    data: new Array(width * height).fill("#00000000")
                }
            ]
        };
    }

    serializeProject(project) {
        if (!project) return "";
        const clone = JSON.parse(JSON.stringify(project));
        clone.magic = PAH_MAGIC;
        clone.version = PAH_VERSION;
        clone.updatedAt = new Date().toISOString();
        return JSON.stringify(clone, null, 2);
    }

    deserializeProject(rawText) {
        try {
            if (!rawText || typeof rawText !== "string") {
                throw new Error("Pusty lub nieprawidłowy format tekstu.");
            }
            const data = JSON.parse(rawText.trim());

            if (data.magic !== PAH_MAGIC && !data.frames && !data.width) {
                throw new Error("Nieprawidłowy plik projektu PAH.");
            }

            const width = Math.max(2, Math.min(256, parseInt(data.width) || 16));
            const height = Math.max(2, Math.min(256, parseInt(data.height) || 16));
            const fps = Math.max(1, Math.min(30, parseInt(data.fps) || 8));
            const name = data.name || "Zaimportowany Projekt";
            const author = data.author || "Nieznany Twórca";
            const palette = Array.isArray(data.palette) && data.palette.length > 0 ? data.palette : ["#00000000", "#1b4d3e", "#a0522d", "#ffffff", "#0d1a15"];
            
            let frames = [];
            if (Array.isArray(data.frames) && data.frames.length > 0) {
                frames = data.frames.map((f, idx) => {
                    let frameData = f.data;
                    if (!Array.isArray(frameData) || frameData.length !== width * height) {
                        frameData = new Array(width * height).fill("#00000000");
                    }
                    return {
                        id: f.id || `f_${idx}`,
                        duration: f.duration || 1,
                        data: frameData
                    };
                });
            } else {
                frames = [{ id: "f_0", duration: 1, data: new Array(width * height).fill("#00000000") }];
            }

            return {
                magic: PAH_MAGIC,
                version: PAH_VERSION,
                id: data.id || ("pah_" + Date.now()),
                name: name,
                author: author,
                authorId: data.authorId || "guest",
                description: data.description || "",
                tags: Array.isArray(data.tags) ? data.tags : ["pixelart"],
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                width: width,
                height: height,
                fps: fps,
                palette: palette,
                isPublic: !!data.isPublic,
                likes: data.likes || 0,
                frames: frames
            };
        } catch (err) {
            console.error("Błąd deserializacji PAH:", err);
            throw new Error("Nie udało się odczytać projektu PAH: " + err.message);
        }
    }

    saveLocalProject(project) {
        const projects = this.getLocalProjects();
        project.updatedAt = new Date().toISOString();
        const index = projects.findIndex(p => p.id === project.id);
        if (index >= 0) {
            projects[index] = project;
        } else {
            projects.unshift(project);
        }
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(projects));
        return project;
    }

    getLocalProjects() {
        try {
            const raw = localStorage.getItem(this.LOCAL_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    deleteLocalProject(id) {
        let projects = this.getLocalProjects();
        projects = projects.filter(p => p.id !== id);
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(projects));
    }

    // Community Projects System (Server Database + Local Fallback)
    async fetchCommunityProjects() {
        try {
            const res = await fetch("/api/community");
            if (res.ok) {
                const list = await res.json();
                localStorage.setItem(this.COMMUNITY_STORAGE_KEY, JSON.stringify(list));
                return list;
            }
        } catch (e) {}
        return this.getCommunityProjects();
    }

    getCommunityProjects() {
        try {
            const raw = localStorage.getItem(this.COMMUNITY_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    async publishToCommunity(project, description = "", tags = []) {
        if (!window.authManager || !window.authManager.isLoggedIn()) {
            throw new Error("Tylko zalogowani użytkownicy mogą publikować projekty.");
        }
        const user = window.authManager.getCurrentUser();
        const clone = JSON.parse(JSON.stringify(project));
        clone.isPublic = true;
        clone.description = description || clone.description || "Projekt stworzony w PAH Studio";
        clone.tags = tags.length > 0 ? tags : ["pixelart", "animacja"];
        clone.publishedAt = new Date().toISOString();
        clone.author = user.username || "Użytkownik";
        clone.authorId = user.id || "usr";

        try {
            const res = await fetch("/api/community", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(clone)
            });

            if (res.ok) {
                const saved = await res.json();
                const community = this.getCommunityProjects();
                const idx = community.findIndex(p => p.id === saved.id);
                if (idx >= 0) community[idx] = saved;
                else community.unshift(saved);
                localStorage.setItem(this.COMMUNITY_STORAGE_KEY, JSON.stringify(community));
                return saved;
            } else {
                const err = await res.json().catch(() => ({ message: "Błąd zapisu na serwerze." }));
                throw new Error(err.message || "Błąd publikacji na serwerze.");
            }
        } catch (serverErr) {
            if (serverErr.message && !serverErr.message.includes("Failed to fetch")) {
                throw serverErr;
            }
            // Local fallback
            const community = this.getCommunityProjects();
            const existingIdx = community.findIndex(p => p.id === clone.id);
            if (existingIdx >= 0) community[existingIdx] = clone;
            else community.unshift(clone);
            localStorage.setItem(this.COMMUNITY_STORAGE_KEY, JSON.stringify(community));
            return clone;
        }
    }

    async likeCommunityProject(projectId) {
        if (!window.authManager || !window.authManager.isLoggedIn()) {
            return { success: false, message: "Musisz być zalogowany, aby polubić projekt." };
        }
        const user = window.authManager.getCurrentUser();

        try {
            const res = await fetch(`/api/community/${projectId}/like`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id })
            });

            if (res.ok) {
                const data = await res.json();
                // Update local cache
                const community = this.getCommunityProjects();
                const proj = community.find(p => p.id === projectId);
                if (proj) {
                    proj.likes = data.likes;
                    if (!Array.isArray(proj.likedBy)) proj.likedBy = [];
                    if (data.isLiked && !proj.likedBy.includes(user.id)) proj.likedBy.push(user.id);
                    else if (!data.isLiked) proj.likedBy = proj.likedBy.filter(u => u !== user.id);
                    localStorage.setItem(this.COMMUNITY_STORAGE_KEY, JSON.stringify(community));
                }
                return data;
            }
        } catch (e) {}

        // Local fallback
        const community = this.getCommunityProjects();
        const proj = community.find(p => p.id === projectId);
        if (!proj) return { success: false, message: "Nie znaleziono projektu." };

        if (!Array.isArray(proj.likedBy)) proj.likedBy = [];
        const idx = proj.likedBy.indexOf(user.id);
        let isLiked = false;
        if (idx >= 0) {
            proj.likedBy.splice(idx, 1);
            proj.likes = Math.max(0, (proj.likes || 1) - 1);
            isLiked = false;
        } else {
            proj.likedBy.push(user.id);
            proj.likes = (proj.likes || 0) + 1;
            isLiked = true;
        }

        localStorage.setItem(this.COMMUNITY_STORAGE_KEY, JSON.stringify(community));
        return { success: true, likes: proj.likes, isLiked };
    }

    async fetchCommunityComments(projectId) {
        try {
            const res = await fetch(`/api/community/${projectId}/comments`);
            if (res.ok) return await res.json();
        } catch (e) {}
        return [];
    }

    async addCommunityComment(projectId, text) {
        if (!window.authManager?.isLoggedIn()) return false;
        const user = window.authManager.getCurrentUser();
        try {
            const res = await fetch(`/api/community/${projectId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, username: user.username, text })
            });
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    // Copy to clipboard
    async copyProjectToClipboard(project) {
        const text = this.serializeProject(project);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
    }

    // Reliable .pah file downloader
    downloadPahFile(project) {
        try {
            const text = this.serializeProject(project);
            const safeName = (project.name || "projekt").replace(/[/\\?%*:|"<>]/g, "_").trim() || "projekt";
            const fileName = safeName + ".pah";
            
            const blob = new Blob([text], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 500);
            return true;
        } catch (e) {
            console.error("Błąd pobierania .pah:", e);
            if (window.app) window.app.showDialog("Pobieranie", "Nie udało się pobrać pliku: " + e.message);
            return false;
        }
    }

    // Export Frame as PNG
    exportFramePng(frameData, width, height, scale = 16, fileName = "pixel_art.png") {
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const color = frameData[y * width + x];
                if (color && color !== "#00000000" && color !== "transparent") {
                    ctx.fillStyle = color;
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }

        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 300);
    }

    // Export Sprite Sheet PNG
    exportSpriteSheetPng(project, scale = 8, fileName = "spritesheet.png") {
        const numFrames = project.frames.length;
        const width = project.width;
        const height = project.height;

        const canvas = document.createElement("canvas");
        canvas.width = numFrames * width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        project.frames.forEach((frame, fIdx) => {
            const offsetX = fIdx * width * scale;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const color = frame.data[y * width + x];
                    if (color && color !== "#00000000" && color !== "transparent") {
                        ctx.fillStyle = color;
                        ctx.fillRect(offsetX + x * scale, y * scale, scale, scale);
                    }
                }
            }
        });

        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 300);
    }

    // Export Animated GIF
    exportAnimatedGif(project, scale = 8, fileName = "animation.gif") {
        if (!window.PAHGifEncoder) {
            if (window.app) window.app.showDialog("Eksport GIF", "Brak modułu kodowania GIF.");
            return;
        }

        const width = project.width * scale;
        const height = project.height * scale;
        const fps = project.fps || 8;
        const delayMs = Math.round(1000 / fps);

        const encoder = new window.PAHGifEncoder(width, height);
        encoder.setDelay(delayMs);
        encoder.setRepeat(0); // infinite loop

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        project.frames.forEach(frame => {
            ctx.clearRect(0, 0, width, height);
            for (let y = 0; y < project.height; y++) {
                for (let x = 0; x < project.width; x++) {
                    const color = frame.data[y * project.width + x];
                    if (color && color !== "#00000000" && color !== "transparent") {
                        ctx.fillStyle = color;
                        ctx.fillRect(x * scale, y * scale, scale, scale);
                    }
                }
            }
            encoder.addFrame(ctx);
        });

        const gifBlob = encoder.render();
        const url = URL.createObjectURL(gifBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 500);
    }

}

window.projectStorage = new ProjectStorage();
