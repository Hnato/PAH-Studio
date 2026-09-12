/**
 * PAH Library v2.2 - Real-Time Animated Previews, Community, Clone to Library & Profile tabs
 */

class ProjectLibrary {
    constructor() {
        this.container = null;
        this.activeFilter = "all";
        this.searchQuery = "";
        this.animationLoops = new Map();
    }

    init(containerEl) {
        this.container = containerEl;
    }

    stopAllPreviewLoops() {
        this.animationLoops.forEach(v => { if (v.timer) clearInterval(v.timer); });
        this.animationLoops.clear();
    }

    getFilteredProjects(source) {
        let projects = [];

        if (source === "community") {
            projects = window.projectStorage.getCommunityProjects().map(p => ({ ...p, source: "community" }));
        } else if (source === "account") {
            projects = (window.authManager && window.authManager.isLoggedIn() ? window.authManager.getAccountProjects() : []).map(p => ({ ...p, source: "account" }));
        } else {
            // local + templates
            const local = window.projectStorage.getLocalProjects();
            projects = local.map(p => ({ ...p, source: p.id.startsWith("template_") ? "template" : "local" }));

            if (source === "local") projects = projects.filter(p => p.source === "local");
            else if (source === "templates") projects = projects.filter(p => p.source === "template");
        }

        if (this.searchQuery) {
            projects = projects.filter(p =>
                (p.name && p.name.toLowerCase().includes(this.searchQuery)) ||
                (p.author && p.author.toLowerCase().includes(this.searchQuery)) ||
                (p.tags && p.tags.some(t => t.toLowerCase().includes(this.searchQuery)))
            );
        }

        return projects;
    }

    async render(source = "all") {
        this.stopAllPreviewLoops();
        let targetContainer = this.container;
        if (source === "community") {
            targetContainer = document.getElementById("communityProjectsGrid") || this.container;
        } else if (source === "account") {
            targetContainer = document.getElementById("profileProjectsGrid") || this.container;
        } else {
            targetContainer = document.getElementById("libraryProjectsGrid") || this.container;
        }
        if (!targetContainer) return;
        
        this.activeFilter = source;

        // Fetch fresh data from server
        if (source === "community") {
            await window.projectStorage.fetchCommunityProjects();
        } else if (source === "account" && window.authManager && window.authManager.isLoggedIn()) {
            await window.authManager.fetchAccountProjects();
        }

        targetContainer.innerHTML = "";

        let projects = [];
        if (source === "community") {
            projects = this.getFilteredProjects("community");
        } else if (source === "account") {
            projects = this.getFilteredProjects("account");
        } else if (source === "local" || source === "templates") {
            projects = this.getFilteredProjects(source);
        } else {
            projects = this.getFilteredProjects("all");
        }

        if (projects.length === 0) {
            targetContainer.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text2);">
                    <i class="fas fa-box-open" style="font-size:2.5rem;margin-bottom:12px;display:block;color:var(--secondary);"></i>
                    <p style="font-size:1.1rem;">Brak projektów w tej kategorii</p>
                </div>`;
            return;
        }

        projects.forEach(project => {
            const card = this.createProjectCard(project);
            targetContainer.appendChild(card);
            this.startCardLivePreview(project, card);
        });
    }

    createProjectCard(project, options = {}) {
        const card = document.createElement("div");
        card.className = "project-card";
        const isCommunity = project.source === "community";
        const date = new Date(project.updatedAt || project.createdAt).toLocaleDateString("pl-PL");
        const canFeature = !!options.allowFeature && !isCommunity;
        const isFeatured = !!options.isFeatured;

        card.innerHTML = `
            <div class="project-live-preview">
                <canvas id="preview_${project.id}" width="${project.width}" height="${project.height}"></canvas>
            </div>
            <div class="project-info">
                <h3 title="${this.esc(project.name)}">${this.esc(project.name)}</h3>
                <div class="project-meta">
                    <span>${project.frames.length} kl. · ${project.fps || 8} FPS · ${project.width}x${project.height}</span>
                    <span>${this.esc(project.author || "Gość")} · ${date}</span>
                </div>
                ${project.description ? `<p class="project-desc">${this.esc(project.description)}</p>` : ""}
                ${project.tags && project.tags.length > 0 ? `<div class="project-tags">${project.tags.map(t => `<span class="tag">${this.esc(t)}</span>`).join("")}</div>` : ""}
            </div>
            <div class="project-actions">
                <button class="pixel-btn btn-sm btn-primary btn-open"><i class="fas fa-paint-brush"></i> Otwórz</button>
                ${isCommunity ? `<button class="pixel-btn btn-sm btn-author"><i class="fas fa-user"></i> Autor</button>` : ""}
                ${isCommunity ? `<button class="pixel-btn btn-sm btn-accent btn-save-lib" title="Zapisz kopię w Mojej Bibliotece"><i class="fas fa-bookmark"></i></button>` : ""}
                <button class="pixel-btn btn-sm btn-copy"><i class="fas fa-copy"></i> Kopiuj</button>
                <button class="pixel-btn btn-sm btn-dl"><i class="fas fa-download"></i> .pah</button>
                ${isCommunity
                    ? `<button class="pixel-btn btn-sm btn-like"><i class="fas fa-heart"></i> ${project.likes || 0}</button>`
                    : `<button class="pixel-btn btn-sm btn-success btn-publish" title="Publikuj w Społeczności"><i class="fas fa-cloud-arrow-up"></i> Publikuj</button>
                       <button class="pixel-btn btn-sm btn-danger btn-delete"><i class="fas fa-trash-alt"></i></button>
                       ${canFeature ? `<button class="pixel-btn btn-sm featured-toggle-btn ${isFeatured ? "active" : ""}" title="Przełącz najlepszą pracę"><i class="fas fa-star"></i></button>` : ""}`
                }
            </div>`;

        card.querySelector(".btn-open").addEventListener("click", () => {
            if (!window.app) return;
            if (isCommunity) {
                window.app.openCommunityProject(project);
                return;
            }
            window.app.loadProject(JSON.parse(JSON.stringify(project)));
        });

        card.querySelector(".btn-author")?.addEventListener("click", () => {
            window.app?.openPublicProfile(project.authorId || null, project.author || "Autor");
        });

        card.querySelector(".btn-save-lib")?.addEventListener("click", async () => {
            await window.app?.saveCommunityProjectToLibrary(project);
        });

        card.querySelector(".btn-copy").addEventListener("click", async () => {
            await window.projectStorage.copyProjectToClipboard(project);
            if (window.app) window.app.showToast("Skopiowano kod .PAH!", "success");
        });

        card.querySelector(".btn-dl").addEventListener("click", () => {
            window.projectStorage.downloadPahFile(project);
        });

        if (isCommunity) {
            const currentUserId = (window.authManager && window.authManager.isLoggedIn()) ? window.authManager.getCurrentUser().id : null;
            const isLiked = Array.isArray(project.likedBy) && currentUserId && project.likedBy.includes(currentUserId);
            const likeBtn = card.querySelector(".btn-like");
            if (isLiked && likeBtn) {
                likeBtn.style.color = "#e74c3c";
            }

            likeBtn?.addEventListener("click", async (e) => {
                if (!window.authManager || !window.authManager.isLoggedIn()) {
                    if (window.app) {
                        window.app.showToast("Zaloguj się, aby polubić projekt!", "info");
                        window.app.openModal("authModal");
                    }
                    return;
                }
                const res = await window.projectStorage.likeCommunityProject(project.id);
                if (res.success) {
                    const btn = e.target.closest(".btn-like");
                    if (btn) {
                        btn.innerHTML = `<i class="fas fa-heart"></i> ${res.likes}`;
                        btn.style.color = res.isLiked ? "#e74c3c" : "";
                    }
                }
            });
        } else {
            card.querySelector(".btn-publish")?.addEventListener("click", () => {
                if (!window.authManager || !window.authManager.isLoggedIn()) {
                    if (window.app) {
                        window.app.showToast("Zaloguj się, aby publikować projekty w społeczności!", "info");
                        window.app.openModal("authModal");
                    }
                    return;
                }
                if (window.app) {
                    window.app.openPublishModal(project.id);
                }
            });
            card.querySelector(".btn-delete")?.addEventListener("click", () => {
                window.app?.showConfirm(`Usunąć "${project.name}"?`, () => {
                    if (project.source === "account") window.authManager.deleteAccountProject(project.id);
                    window.projectStorage.deleteLocalProject(project.id);
                    this.render(this.activeFilter);
                });
            });
            card.querySelector(".featured-toggle-btn")?.addEventListener("click", () => {
                window.app?.toggleFeaturedProject(project.id);
            });
        }

        return card;
    }

    startCardLivePreview(project, card) {
        const canvas = card ? card.querySelector("canvas") : document.getElementById(`preview_${project.id}`);
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        let idx = 0;

        const draw = (fi) => {
            const f = project.frames[fi];
            if (!f || !f.data) return;
            ctx.clearRect(0, 0, project.width, project.height);
            for (let y = 0; y < project.height; y++) for (let x = 0; x < project.width; x++) {
                const c = f.data[y * project.width + x];
                if (c && c !== "#00000000") { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
            }
        };
        draw(0);

        if (project.frames.length > 1) {
            const timer = setInterval(() => { idx = (idx + 1) % project.frames.length; draw(idx); }, 1000 / (project.fps || 8));
            this.animationLoops.set(project.id + "_" + Math.random(), { timer });
        }
    }

    esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
}

window.projectLibrary = new ProjectLibrary();
