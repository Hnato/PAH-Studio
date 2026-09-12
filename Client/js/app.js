/**
 * PAH App Controller v2.2 (Parrot core 2.2)
 * Fullscreen pixel editor, SQLite database, Guest protection, 256x256 previews,
 * Dedicated sidebar tool settings, Community comments & Clone to library.
 */

class PAHApp {
    constructor() {
        this.currentProject = null;
        this.presetPalettes = {
            hnato_forest: { name: "Leśna Hnato", colors: ["#00000000","#1b4d3e","#2d5a4c","#4e342e","#a0522d","#d2691e","#f5f5dc","#ffffff","#0d1a15","#e8edea","#ffd700","#e74c3c","#3498db","#9b59b6","#2ecc71","#1abc9c"] },
            gameboy: { name: "Game Boy", colors: ["#00000000","#0f380f","#306230","#8bac0f","#9bbc0f"] },
            pico8: { name: "PICO-8", colors: ["#00000000","#000000","#1D2B53","#7E2553","#008751","#AB5236","#5F574F","#C2C3C7","#FFF1E8","#FF004D","#FFA300","#FFEC27","#00E436","#29ADFF","#83769C","#FF77A8","#FFCCAA"] },
            cyberpunk: { name: "Cyberpunk", colors: ["#00000000","#080114","#1a0826","#ff007f","#00f0ff","#ffe600","#7122fa","#ffffff","#38ef7d","#ff3366"] },
            grayscale: { name: "Skala Szarości", colors: ["#00000000","#000000","#222222","#444444","#666666","#888888","#aaaaaa","#cccccc","#eeeeee","#ffffff"] }
        };
        this.avatarIcons = ["fa-user","fa-user-astronaut","fa-user-ninja","fa-user-secret","fa-ghost","fa-dragon","fa-cat","fa-dog","fa-crow","fa-hat-wizard","fa-robot","fa-skull-crossbones"];
        this.toolNames = {
            pencil: { name: "Ołówek", icon: "fa-pencil-alt" },
            eraser: { name: "Gumka", icon: "fa-eraser" },
            spray: { name: "Spray", icon: "fa-spray-can" },
            line: { name: "Linia", icon: "fa-slash" },
            rect: { name: "Prostokąt", icon: "fa-square" },
            circle: { name: "Okrąg", icon: "fa-circle" },
            shader: { name: "Cieniowanie", icon: "fa-adjust" },
            move: { name: "Przesuwanie", icon: "fa-arrows-alt" },
            select: { name: "Zaznaczanie", icon: "fa-vector-square" },
            bucket: { name: "Wypełnienie", icon: "fa-fill-drip" },
            eyedropper: { name: "Pipeta", icon: "fa-eye-dropper" },
            replace: { name: "Zastąp kolor", icon: "fa-exchange-alt" }
        };
    }

    init() {
        this.initTheme();
        this.initFireflies();

        // Override native alert
        window.alert = (msg) => this.showToast(msg, "info");

        // Create fresh project
        this.currentProject = window.projectStorage.createNewProject("Nowy Projekt", 16, 16, 8);

        const cw = document.getElementById("canvasWrapper");
        window.pixelEditor.init(cw, this.currentProject);
        window.animationEngine.init(this.currentProject);

        window.animationEngine.onFrameChangeCallback = () => {
            window.pixelEditor.renderAll();
            this.updateTimelineActiveState(window.animationEngine.currentFrameIndex);
        };
        window.animationEngine.onTimelineUpdateCallback = () => this.renderTimeline();

        const lg = document.getElementById("libraryProjectsGrid");
        window.projectLibrary.init(lg);

        this.currentView = "studio";
        this.publishFileProject = null;
        this.activeCommunityProject = null;
        this.dialogCallback = null;

        this.bindAll();
        this.setupDragAndDrop();
        this.updateProjectHeaderInfo();
        this.renderTimeline();
        this.renderPaletteSwatches();
        this.updateRGBSliders(window.pixelEditor.currentColor);
        this.applyAuthState(window.authManager.getCurrentUser());
        this.updateViewButtons("studio");
        this.setActiveTool("pencil");
    }

    // Theme
    initTheme() {
        const toggle = document.getElementById("themeCheckbox");
        const saved = localStorage.getItem("pah_theme") || "dark";
        if (saved === "dark") { document.documentElement.setAttribute("data-theme", "dark"); if (toggle) toggle.checked = true; }
        if (toggle) toggle.addEventListener("change", (e) => {
            const theme = e.target.checked ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", theme);
            localStorage.setItem("pah_theme", theme);
        });
    }

    // Fireflies
    initFireflies() {
        const c = document.getElementById("firefly-container");
        if (!c) return;
        for (let i = 0; i < 10; i++) this.spawnFirefly(c);
    }
    spawnFirefly(c) {
        const f = document.createElement("div");
        f.classList.add("firefly", Math.random() > 0.5 ? "firefly-path-1" : "firefly-path-2");
        f.style.left = Math.random() * window.innerWidth + "px";
        f.style.top = Math.random() * window.innerHeight + "px";
        f.style.animationDuration = (6 + Math.random() * 6) + "s";
        f.style.animationDelay = Math.random() * 3 + "s";
        c.appendChild(f);
        f.addEventListener("animationend", () => { f.remove(); this.spawnFirefly(c); });
    }

    bindAll() {
        this.bindHeader();
        this.bindNavTabs();
        this.bindToolbar();
        this.bindToolSettings();
        this.bindTimeline();
        this.bindPalette();
        this.bindRGBSliders();
        this.bindKeys();
        this.bindModals();
        this.bindAuth();
        this.bindProfileView();
    }

    // Header & Direct File I/O
    bindHeader() {
        const ti = document.getElementById("projectTitleInput");
        if (ti) {
            ti.value = this.currentProject.name;
            ti.addEventListener("change", (e) => {
                this.currentProject.name = e.target.value || "Projekt";
                this.saveCurrentProject();
            });
        }

        document.getElementById("btnHeaderDownloadPah")?.addEventListener("click", () => {
            if (window.projectStorage.downloadPahFile(this.currentProject)) {
                this.showToast(`Pobrano plik "${this.currentProject.name}.pah"!`, "success");
            }
        });

        const fileInput = document.getElementById("directPahFileInput");
        document.getElementById("btnHeaderUploadPah")?.addEventListener("click", () => {
            if (fileInput) fileInput.click();
        });

        fileInput?.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (file) this.loadFileObject(file);
            fileInput.value = "";
        });

        document.getElementById("newProjectBtn")?.addEventListener("click", () => this.openModal("newProjectModal"));
        document.getElementById("exportModalBtn")?.addEventListener("click", () => this.openModal("exportModal"));
        document.getElementById("cleanCanvasBtn")?.addEventListener("click", () => {
            this.showConfirm("Wyczyścić bieżącą planszę?", () => {
                window.pixelEditor.clearFrame();
                this.showToast("Wyczyszczono klatkę!", "info");
            });
        });
    }

    // Drag and Drop of .pah files
    setupDragAndDrop() {
        window.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
        window.addEventListener("drop", (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file && (file.name.endsWith(".pah") || file.name.endsWith(".json"))) {
                this.loadFileObject(file);
            }
        });
    }

    loadFileObject(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const proj = window.projectStorage.deserializeProject(ev.target.result);
                this.loadProject(proj);
                this.showToast(`Wczytano plik "${file.name}"!`, "success");
            } catch (err) {
                this.showDialog("Błąd pliku", "Nieprawidłowy plik .PAH: " + err.message);
            }
        };
        reader.readAsText(file);
    }

    // Navigation Tabs
    bindNavTabs() {
        const tabs = document.querySelectorAll(".nav-tab");
        const panels = document.querySelectorAll(".view-panel");

        tabs.forEach(tab => tab.addEventListener("click", () => {
            const view = tab.dataset.view;

            // Guest protection on library & profile
            if ((view === "library" || view === "profile") && (!window.authManager || !window.authManager.isLoggedIn())) {
                this.showToast("Tylko zalogowani użytkownicy mają dostęp do tej sekcji!", "info");
                this.openModal("authModal");
                return;
            }

            this.currentView = view;
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            panels.forEach(p => p.classList.toggle("active", p.id === view + "View"));

            this.updateViewButtons(view);

            if (view === "library") { this.renderLibrary("all"); }
            else if (view === "community") { this.renderLibrary("community"); }
            else if (view === "profile") { this.renderProfileView(); }
            else { window.projectLibrary.stopAllPreviewLoops(); window.pixelEditor.renderAll(); }
        }));

        document.querySelectorAll(".filter-btn").forEach(btn => btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            this.renderLibrary(btn.dataset.filter || "all");
        }));

        document.getElementById("librarySearchInput")?.addEventListener("input", (e) => {
            window.projectLibrary.searchQuery = e.target.value.toLowerCase().trim();
            this.renderLibrary(window.projectLibrary.activeFilter || "all");
        });

        document.getElementById("communitySearchInput")?.addEventListener("input", (e) => {
            window.projectLibrary.searchQuery = e.target.value.toLowerCase().trim();
            window.projectLibrary.render("community");
        });

        const handlePublishClick = () => {
            if (!window.authManager || !window.authManager.isLoggedIn()) {
                this.showToast("Zaloguj się, aby publikować projekty w społeczności!", "info");
                this.openModal("authModal");
                return;
            }
            this.openPublishModal();
        };

        document.getElementById("publishBtn")?.addEventListener("click", handlePublishClick);
        document.getElementById("libraryPublishBtn")?.addEventListener("click", handlePublishClick);
    }

    // View-dependent button visibility: Buttons shown ONLY in editor
    updateViewButtons(view) {
        const isEditor = (view === "studio");
        document.querySelectorAll(".editor-only-feature").forEach(el => {
            el.style.display = isEditor ? "" : "none";
        });
    }

    renderLibrary(source) {
        window.projectLibrary.render(source);
    }

    // Toolbar
    bindToolbar() {
        document.querySelectorAll(".tool-btn[data-tool]").forEach(btn => btn.addEventListener("click", () => {
            const tool = btn.dataset.tool;
            if (!tool) return;
            this.setActiveTool(tool);
        }));

        const symX = document.getElementById("symmetryXBtn");
        if (symX) symX.addEventListener("click", () => { window.pixelEditor.symmetryX = !window.pixelEditor.symmetryX; symX.classList.toggle("active", window.pixelEditor.symmetryX); });

        const symY = document.getElementById("symmetryYBtn");
        if (symY) symY.addEventListener("click", () => { window.pixelEditor.symmetryY = !window.pixelEditor.symmetryY; symY.classList.toggle("active", window.pixelEditor.symmetryY); });

        const grid = document.getElementById("gridToggleBtn");
        if (grid) { grid.classList.add("active"); grid.addEventListener("click", () => { window.pixelEditor.showGrid = !window.pixelEditor.showGrid; grid.classList.toggle("active", window.pixelEditor.showGrid); window.pixelEditor.renderGrid(); }); }

        document.getElementById("zoomInBtn")?.addEventListener("click", () => window.pixelEditor.zoomIn());
        document.getElementById("zoomOutBtn")?.addEventListener("click", () => window.pixelEditor.zoomOut());
        document.getElementById("centerCanvasBtn")?.addEventListener("click", () => window.pixelEditor.centerCanvas());

        document.getElementById("flipHBtn")?.addEventListener("click", () => window.pixelEditor.flipHorizontal());
        document.getElementById("flipVBtn")?.addEventListener("click", () => window.pixelEditor.flipVertical());
        document.getElementById("clearFrameBtn")?.addEventListener("click", () => {
            this.showConfirm("Wyczyścić klatkę?", () => window.pixelEditor.clearFrame());
        });
        document.getElementById("invertColorsBtn")?.addEventListener("click", () => window.pixelEditor.invertColors());

        document.getElementById("undoBtn")?.addEventListener("click", () => window.pixelEditor.undo());
        document.getElementById("redoBtn")?.addEventListener("click", () => window.pixelEditor.redo());

        // Grid size
        const gsW = document.getElementById("gridSizeW");
        const gsH = document.getElementById("gridSizeH");
        document.getElementById("applyGridSizeBtn")?.addEventListener("click", () => {
            const w = parseInt(gsW?.value) || 16;
            const h = parseInt(gsH?.value) || 16;
            window.pixelEditor.resizeGrid(w, h);
            this.updateProjectHeaderInfo();
            this.saveCurrentProject();
            this.showToast(`Zmieniono rozmiar na ${w}x${h} px`, "info");
        });
    }

    setActiveTool(tool) {
        document.querySelectorAll(".tool-btn[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === tool));
        window.pixelEditor.activeTool = tool;

        // Update active tool title in sidebar
        const toolMeta = this.toolNames[tool] || { name: tool, icon: "fa-sliders-h" };
        const nameEl = document.getElementById("activeToolName");
        if (nameEl) {
            nameEl.innerHTML = `<i class="fas ${toolMeta.icon}"></i> Ustawienia: ${toolMeta.name}`;
        }

        // Show matching settings group
        document.querySelectorAll(".tool-settings-group").forEach(grp => {
            grp.style.display = (grp.id === `settings_${tool}`) ? "block" : "none";
        });
    }

    // Dedicated settings for all tools
    bindToolSettings() {
        // 1. Pencil
        const penNum = document.getElementById("penSizeSelect");
        const penSlider = document.getElementById("penSizeSlider");
        const penPresets = document.querySelectorAll("#brushPresetsGrid .brush-preset-btn");
        const penShape = document.getElementById("pencilShapeSelect");

        const setPenSize = (size) => {
            size = Math.max(1, Math.min(512, parseInt(size) || 1));
            window.pixelEditor.penSize = size;
            if (penNum) penNum.value = size;
            if (penSlider) penSlider.value = size;
            penPresets.forEach(btn => btn.classList.toggle("active", parseInt(btn.dataset.size) === size));
        };
        if (penNum) penNum.addEventListener("input", (e) => setPenSize(e.target.value));
        if (penSlider) penSlider.addEventListener("input", (e) => setPenSize(e.target.value));
        penPresets.forEach(btn => btn.addEventListener("click", () => setPenSize(btn.dataset.size)));
        if (penShape) penShape.addEventListener("change", (e) => { window.pixelEditor.pencilShape = e.target.value; });

        // 2. Eraser
        const eraNum = document.getElementById("eraserSizeSelect");
        const eraSlider = document.getElementById("eraserSizeSlider");
        const eraPresets = document.querySelectorAll("#eraserPresetsGrid .brush-preset-btn");
        const eraShape = document.getElementById("eraserShapeSelect");

        const setEraserSize = (size) => {
            size = Math.max(1, Math.min(512, parseInt(size) || 1));
            window.pixelEditor.eraserSize = size;
            if (eraNum) eraNum.value = size;
            if (eraSlider) eraSlider.value = size;
            eraPresets.forEach(btn => btn.classList.toggle("active", parseInt(btn.dataset.size) === size));
        };
        if (eraNum) eraNum.addEventListener("input", (e) => setEraserSize(e.target.value));
        if (eraSlider) eraSlider.addEventListener("input", (e) => setEraserSize(e.target.value));
        eraPresets.forEach(btn => btn.addEventListener("click", () => setEraserSize(btn.dataset.size)));
        if (eraShape) eraShape.addEventListener("change", (e) => { window.pixelEditor.eraserShape = e.target.value; });

        // 3. Spray
        const sprayRInput = document.getElementById("sprayRadiusInput");
        const sprayRSlider = document.getElementById("sprayRadiusSlider");
        const setSprayRadius = (val) => {
            val = Math.max(2, Math.min(128, parseInt(val) || 8));
            window.pixelEditor.sprayRadius = val;
            if (sprayRInput) sprayRInput.value = val;
            if (sprayRSlider) sprayRSlider.value = val;
        };
        if (sprayRInput) sprayRInput.addEventListener("input", (e) => setSprayRadius(e.target.value));
        if (sprayRSlider) sprayRSlider.addEventListener("input", (e) => setSprayRadius(e.target.value));

        const sprayDInput = document.getElementById("sprayDensityInput");
        const sprayDSlider = document.getElementById("sprayDensitySlider");
        const setSprayDensity = (val) => {
            val = Math.max(1, Math.min(50, parseInt(val) || 6));
            window.pixelEditor.sprayDensity = val;
            if (sprayDInput) sprayDInput.value = val;
            if (sprayDSlider) sprayDSlider.value = val;
        };
        if (sprayDInput) sprayDInput.addEventListener("input", (e) => setSprayDensity(e.target.value));
        if (sprayDSlider) sprayDSlider.addEventListener("input", (e) => setSprayDensity(e.target.value));

        // 4. Line
        const lineWInput = document.getElementById("lineWidthInput");
        const lineWSlider = document.getElementById("lineWidthSlider");
        const setLineWidth = (val) => {
            val = Math.max(1, Math.min(64, parseInt(val) || 1));
            window.pixelEditor.lineWidth = val;
            if (lineWInput) lineWInput.value = val;
            if (lineWSlider) lineWSlider.value = val;
        };
        if (lineWInput) lineWInput.addEventListener("input", (e) => setLineWidth(e.target.value));
        if (lineWSlider) lineWSlider.addEventListener("input", (e) => setLineWidth(e.target.value));
        document.getElementById("lineCapSelect")?.addEventListener("change", (e) => { window.pixelEditor.lineCap = e.target.value; });

        // 5. Rect
        const rectFill = document.getElementById("rectFillSelect");
        const rectBorder = document.getElementById("rectBorderInput");
        if (rectFill) rectFill.addEventListener("change", (e) => {
            window.pixelEditor.rectFillMode = e.target.value;
            const bRow = document.getElementById("rectBorderRow");
            if (bRow) bRow.style.display = (e.target.value === "fill") ? "none" : "flex";
        });
        if (rectBorder) rectBorder.addEventListener("input", (e) => {
            window.pixelEditor.rectBorderWidth = Math.max(1, parseInt(e.target.value) || 1);
        });

        // 6. Circle
        const circleFill = document.getElementById("circleFillSelect");
        const circleBorder = document.getElementById("circleBorderInput");
        if (circleFill) circleFill.addEventListener("change", (e) => {
            window.pixelEditor.circleFillMode = e.target.value;
            const bRow = document.getElementById("circleBorderRow");
            if (bRow) bRow.style.display = (e.target.value === "fill") ? "none" : "flex";
        });
        if (circleBorder) circleBorder.addEventListener("input", (e) => {
            window.pixelEditor.circleBorderWidth = Math.max(1, parseInt(e.target.value) || 1);
        });

        // 7. Shader
        document.getElementById("shaderModeSelect")?.addEventListener("change", (e) => {
            window.pixelEditor.shaderMode = e.target.value;
        });
        const shaderStr = document.getElementById("shaderStrengthSlider");
        const shaderStrDisp = document.getElementById("shaderStrengthDisplay");
        if (shaderStr) shaderStr.addEventListener("input", (e) => {
            const val = parseInt(e.target.value) || 15;
            window.pixelEditor.shaderStrength = val;
            if (shaderStrDisp) shaderStrDisp.textContent = val + "%";
        });
        document.getElementById("shaderSizeInput")?.addEventListener("input", (e) => {
            window.pixelEditor.shaderSize = Math.max(1, Math.min(64, parseInt(e.target.value) || 1));
        });
    }

    // Timeline
    bindTimeline() {
        document.getElementById("playAnimationBtn")?.addEventListener("click", () => {
            const playing = window.animationEngine.togglePlay();
            const btn = document.getElementById("playAnimationBtn");
            if (btn) btn.innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        });
        document.getElementById("stepBackBtn")?.addEventListener("click", () => window.animationEngine.stepBackward());
        document.getElementById("stepForwardBtn")?.addEventListener("click", () => window.animationEngine.stepForward());
        document.getElementById("addNewFrameBtn")?.addEventListener("click", () => { window.animationEngine.addFrame(); this.saveCurrentProject(); });
        document.getElementById("duplicateFrameBtn")?.addEventListener("click", () => { window.animationEngine.duplicateFrame(); this.saveCurrentProject(); });
        document.getElementById("deleteFrameBtn")?.addEventListener("click", () => {
            if (window.animationEngine.deleteFrame()) this.saveCurrentProject();
            else this.showToast("Nie można usunąć jedynej klatki!", "error");
        });

        const fpsSlider = document.getElementById("fpsRangeInput");
        const fpsVal = document.getElementById("fpsValueDisplay");
        if (fpsSlider) {
            fpsSlider.value = this.currentProject.fps || 8;
            if (fpsVal) fpsVal.textContent = fpsSlider.value;
            fpsSlider.addEventListener("input", (e) => {
                const fps = parseInt(e.target.value);
                if (fpsVal) fpsVal.textContent = fps;
                window.animationEngine.setFps(fps);
                this.saveCurrentProject();
            });
        }

        document.getElementById("onionSkinToggle")?.addEventListener("change", (e) => {
            window.animationEngine.onionSkinEnabled = e.target.checked;
            window.pixelEditor.renderOnionSkin();
        });
    }

    renderTimeline() {
        const strip = document.getElementById("framesStrip");
        if (!strip || !this.currentProject) return;
        strip.innerHTML = "";
        const curIdx = window.animationEngine.currentFrameIndex;

        this.currentProject.frames.forEach((frame, idx) => {
            const card = document.createElement("div");
            card.className = `frame-card ${idx === curIdx ? "active" : ""}`;
            card.innerHTML = `
                <div class="frame-actions-overlay">
                    <button class="frame-mini-btn btn-dup" title="Duplikuj"><i class="fas fa-copy"></i></button>
                    <button class="frame-mini-btn btn-del" title="Usuń"><i class="fas fa-times"></i></button>
                </div>
                <canvas class="frame-thumb" id="thumb_${idx}" width="${this.currentProject.width}" height="${this.currentProject.height}"></canvas>
                <span class="frame-number">#${idx + 1}</span>`;

            card.addEventListener("click", (e) => { if (!e.target.closest(".frame-mini-btn")) window.animationEngine.setCurrentFrameIndex(idx); });
            card.querySelector(".btn-dup").addEventListener("click", (e) => { e.stopPropagation(); window.animationEngine.duplicateFrame(idx); this.saveCurrentProject(); });
            card.querySelector(".btn-del").addEventListener("click", (e) => { e.stopPropagation(); if (window.animationEngine.deleteFrame(idx)) this.saveCurrentProject(); });
            strip.appendChild(card);

            const tc = card.querySelector(`#thumb_${idx}`);
            if (tc) {
                const ctx = tc.getContext("2d");
                ctx.imageSmoothingEnabled = false;
                for (let y = 0; y < this.currentProject.height; y++) for (let x = 0; x < this.currentProject.width; x++) {
                    const c = frame.data[y * this.currentProject.width + x];
                    if (c && c !== "#00000000") { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
                }
            }
        });
    }

    updateTimelineActiveState(activeIdx) {
        document.querySelectorAll(".frame-card").forEach((c, i) => c.classList.toggle("active", i === activeIdx));
    }

    // Palette
    bindPalette() {
        const ci = document.getElementById("colorPickerInput");
        const hi = document.getElementById("colorHexInput");
        if (ci) ci.addEventListener("input", (e) => this.updateCurrentColor(e.target.value));
        if (hi) hi.addEventListener("change", (e) => { let h = e.target.value.trim(); if (!h.startsWith("#")) h = "#" + h; this.updateCurrentColor(h); });

        document.getElementById("addSwatchBtn")?.addEventListener("click", () => {
            const c = window.pixelEditor.currentColor;
            if (!this.currentProject.palette.includes(c)) {
                this.currentProject.palette.push(c);
                this.renderPaletteSwatches();
                this.saveCurrentProject();
            }
        });

        document.getElementById("presetPaletteSelect")?.addEventListener("change", (e) => {
            const p = this.presetPalettes[e.target.value];
            if (p) { this.currentProject.palette = [...p.colors]; this.renderPaletteSwatches(); this.saveCurrentProject(); }
        });
    }

    // RGB Sliders
    bindRGBSliders() {
        ["R", "G", "B"].forEach(ch => {
            const slider = document.getElementById(`rgb${ch}Slider`);
            const valEl = document.getElementById(`rgb${ch}Val`);
            if (slider) slider.addEventListener("input", () => {
                if (valEl) valEl.textContent = slider.value;
                const r = parseInt(document.getElementById("rgbRSlider")?.value || 0);
                const g = parseInt(document.getElementById("rgbGSlider")?.value || 0);
                const b = parseInt(document.getElementById("rgbBSlider")?.value || 0);
                const hex = "#" + [r, g, b].map(v => ("0" + v.toString(16)).slice(-2)).join("");
                this.updateCurrentColor(hex, true);
            });
        });
    }

    updateRGBSliders(hex) {
        if (!hex || hex.length < 7) return;
        const r = parseInt(hex.substr(1, 2), 16) || 0;
        const g = parseInt(hex.substr(3, 2), 16) || 0;
        const b = parseInt(hex.substr(5, 2), 16) || 0;
        const rs = document.getElementById("rgbRSlider"), gs = document.getElementById("rgbGSlider"), bs = document.getElementById("rgbBSlider");
        if (rs) { rs.value = r; document.getElementById("rgbRVal").textContent = r; }
        if (gs) { gs.value = g; document.getElementById("rgbGVal").textContent = g; }
        if (bs) { bs.value = b; document.getElementById("rgbBVal").textContent = b; }
    }

    updateCurrentColor(hex, fromSliders = false) {
        window.pixelEditor.currentColor = hex;
        const sb = document.getElementById("currentColorBox");
        const hi = document.getElementById("colorHexInput");
        const ci = document.getElementById("colorPickerInput");
        if (sb) sb.style.backgroundColor = hex;
        if (hi) hi.value = hex;
        if (ci && hex.length === 7) ci.value = hex;
        if (!fromSliders) this.updateRGBSliders(hex);
        document.querySelectorAll(".palette-swatch").forEach(s => s.classList.toggle("active", s.dataset.color?.toLowerCase() === hex.toLowerCase()));
    }

    renderPaletteSwatches() {
        const grid = document.getElementById("paletteSwatchesGrid");
        if (!grid || !this.currentProject) return;
        grid.innerHTML = "";
        (this.currentProject.palette || []).forEach(color => {
            const s = document.createElement("div");
            s.className = "palette-swatch";
            s.dataset.color = color;
            if (color === "#00000000" || color === "transparent") {
                s.style.background = "linear-gradient(45deg,#ccc 25%,#888 25%,#888 50%,#ccc 50%,#ccc 75%,#888 75%)";
                s.style.backgroundSize = "6px 6px";
                s.title = "Przezroczysty";
            } else {
                s.style.backgroundColor = color;
                s.title = color;
            }
            if (color.toLowerCase() === window.pixelEditor.currentColor.toLowerCase()) s.classList.add("active");
            s.addEventListener("click", () => this.updateCurrentColor(color));
            grid.appendChild(s);
        });
    }

    // Keyboard shortcuts
    bindKeys() {
        window.addEventListener("keydown", (e) => {
            if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
            const k = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? window.pixelEditor.redo() : window.pixelEditor.undo(); return; }
            if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); window.pixelEditor.redo(); return; }
            if ((e.ctrlKey || e.metaKey) && k === "s") { e.preventDefault(); this.saveCurrentProject(); this.showToast("Zapisano!", "success"); return; }
            if ((e.ctrlKey || e.metaKey) && k === "c") { e.preventDefault(); window.pixelEditor.copySelection(); return; }
            if ((e.ctrlKey || e.metaKey) && k === "x") { e.preventDefault(); window.pixelEditor.cutSelection(); return; }
            if ((e.ctrlKey || e.metaKey) && k === "v") { e.preventDefault(); window.pixelEditor.pasteClipboard(); return; }
            if (e.code === "Space") { e.preventDefault(); document.getElementById("playAnimationBtn")?.click(); return; }
            if (k === "escape") { window.pixelEditor.clearSelection(); return; }
            if (k === "delete" && window.pixelEditor.selection) {
                window.pixelEditor.cutSelection();
                window.pixelEditor.clipboard = null;
                return;
            }
            const toolMap = { b: "pencil", p: "pencil", e: "eraser", g: "bucket", i: "eyedropper", l: "line", u: "rect", r: "rect", c: "circle", k: "shader", s: "spray", q: "replace", m: "select", v: "move" };
            if (toolMap[k]) { this.setActiveTool(toolMap[k]); }
        });
    }

    // Modals
    bindModals() {
        document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
            let isBackdropMousedown = false;
            backdrop.addEventListener("mousedown", (e) => {
                isBackdropMousedown = (e.target === backdrop);
            });
            backdrop.addEventListener("mouseup", (e) => {
                if (isBackdropMousedown && e.target === backdrop) {
                    this.closeAllModals();
                }
                isBackdropMousedown = false;
            });
        });

        document.querySelectorAll(".close-modal-btn").forEach(btn => {
            btn.addEventListener("click", () => this.closeAllModals());
        });

        document.querySelectorAll(".modal-box").forEach(box => {
            box.addEventListener("mousedown", (e) => e.stopPropagation());
            box.addEventListener("click", (e) => e.stopPropagation());
        });

        // Show/Hide Password Eye Toggle
        document.querySelectorAll(".btn-toggle-pw").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetId = btn.dataset.target;
                const input = document.getElementById(targetId);
                if (!input) return;
                const isPw = input.type === "password";
                input.type = isPw ? "text" : "password";
                const icon = btn.querySelector("i");
                if (icon) icon.className = isPw ? "fas fa-eye-slash" : "fas fa-eye";
            });
        });

        // Auth Tabs Switching
        const showAuthSection = (section) => {
            const loginSec = document.getElementById("authLoginSection");
            const regSec = document.getElementById("authRegisterSection");
            const tabLogin = document.getElementById("tabBtnLogin");
            const tabReg = document.getElementById("tabBtnRegister");

            if (section === "register") {
                if (loginSec) loginSec.style.display = "none";
                if (regSec) regSec.style.display = "block";
                tabLogin?.classList.remove("active");
                tabReg?.classList.add("active");
            } else {
                if (loginSec) loginSec.style.display = "block";
                if (regSec) regSec.style.display = "none";
                tabLogin?.classList.add("active");
                tabReg?.classList.remove("active");
            }
        };

        document.getElementById("tabBtnLogin")?.addEventListener("click", () => showAuthSection("login"));
        document.getElementById("tabBtnRegister")?.addEventListener("click", () => showAuthSection("register"));
        document.getElementById("linkSwitchToRegister")?.addEventListener("click", (e) => { e.preventDefault(); showAuthSection("register"); });
        document.getElementById("linkSwitchToLogin")?.addEventListener("click", (e) => { e.preventDefault(); showAuthSection("login"); });

        // New project
        document.getElementById("createProjectForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("newProjectName").value || "Nowy Projekt";
            const w = parseInt(document.getElementById("newProjectWidth").value) || 16;
            const h = parseInt(document.getElementById("newProjectHeight").value) || 16;
            const fps = parseInt(document.getElementById("newProjectFps").value) || 8;
            const proj = window.projectStorage.createNewProject(name, w, h, fps);
            this.loadProject(proj);
            this.closeAllModals();
            this.showToast(`Utworzono planszę "${name}" (${w}x${h})!`, "success");
        });

        // Export buttons
        document.getElementById("btnExportPublish")?.addEventListener("click", () => {
            this.closeAllModals();
            if (!window.authManager || !window.authManager.isLoggedIn()) {
                this.showToast("Zaloguj się, aby publikować projekty w społeczności!", "info");
                this.openModal("authModal");
                return;
            }
            this.openPublishModal();
        });
        document.getElementById("btnExportPahFile")?.addEventListener("click", () => {
            if (window.projectStorage.downloadPahFile(this.currentProject)) this.showToast("Pobrano plik .pah!", "success");
        });
        document.getElementById("btnExportPngFrame")?.addEventListener("click", () => {
            const scale = parseInt(document.getElementById("exportScaleSelect")?.value) || 8;
            const frame = window.animationEngine.getCurrentFrame();
            if (frame) { window.projectStorage.exportFramePng(frame.data, this.currentProject.width, this.currentProject.height, scale); this.showToast("Pobrano klatkę PNG!", "success"); }
        });
        document.getElementById("btnExportSpriteSheet")?.addEventListener("click", () => {
            const scale = parseInt(document.getElementById("exportScaleSelect")?.value) || 8;
            window.projectStorage.exportSpriteSheetPng(this.currentProject, scale);
            this.showToast("Pobrano Sprite Sheet!", "success");
        });
        document.getElementById("btnExportGif")?.addEventListener("click", () => {
            const scale = parseInt(document.getElementById("exportScaleSelect")?.value) || 8;
            window.projectStorage.exportAnimatedGif(this.currentProject, scale);
            this.showToast("Pobrano animację GIF!", "success");
        });

        document.getElementById("saveToAccountBtn")?.addEventListener("click", async () => {
            if (!window.authManager || !window.authManager.isLoggedIn()) {
                this.showToast("Zaloguj się, aby zapisać projekt na swoim koncie!", "info");
                this.openModal("authModal");
                return;
            }
            await window.authManager.saveAccountProject(this.currentProject);
            this.showToast("Zapisano do biblioteki konta!", "success");
        });

        // Publish to community
        document.getElementById("publishCommunityBtn")?.addEventListener("click", async () => {
            if (!window.authManager || !window.authManager.isLoggedIn()) {
                this.showToast("Tylko zalogowani użytkownicy mogą publikować!", "error");
                this.openModal("authModal");
                return;
            }

            const desc = document.getElementById("publishDesc")?.value || "";
            const tags = (document.getElementById("publishTags")?.value || "pixelart").split(",").map(t => t.trim()).filter(Boolean);
            const sourceVal = document.getElementById("publishSourceSelect")?.value || "current";

            let projectToPublish = this.currentProject;

            if (sourceVal === "file") {
                if (!this.publishFileProject) {
                    this.showDialog("Publikacja", "Najpierw wybierz plik .pah!");
                    return;
                }
                projectToPublish = this.publishFileProject;
            } else if (sourceVal !== "current") {
                const allProjects = window.projectStorage.getLocalProjects();
                const found = allProjects.find(p => p.id === sourceVal);
                if (found) {
                    projectToPublish = found;
                } else if (window.authManager && window.authManager.isLoggedIn()) {
                    const accProjects = window.authManager.getAccountProjects();
                    const accFound = accProjects.find(p => p.id === sourceVal);
                    if (accFound) projectToPublish = accFound;
                }
            }

            const publishBtn = document.getElementById("publishCommunityBtn");
            if (publishBtn) publishBtn.disabled = true;
            try {
                await window.projectStorage.publishToCommunity(projectToPublish, desc, tags);
                this.closeAllModals();
                this.publishFileProject = null;
                this.showToast("Opublikowano w społeczności!", "success");

                const commTab = document.querySelector('.nav-tab[data-view="community"]');
                if (commTab) commTab.click();
                else await this.renderLibrary("community");
            } catch (err) {
                this.showDialog("Błąd publikacji", err.message);
            } finally {
                if (publishBtn) publishBtn.disabled = false;
            }
        });

        // Publish file selection
        document.getElementById("publishSelectFileBtn")?.addEventListener("click", () => {
            document.getElementById("publishPahFileInput")?.click();
        });

        document.getElementById("publishPahFileInput")?.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    this.publishFileProject = window.projectStorage.deserializeProject(ev.target.result);
                    const nameEl = document.getElementById("publishFileName");
                    if (nameEl) nameEl.textContent = file.name;
                } catch (err) {
                    this.showDialog("Błąd pliku", "Nieprawidłowy plik .PAH: " + err.message);
                }
            };
            reader.readAsText(file);
            e.target.value = "";
        });

        document.getElementById("publishSourceSelect")?.addEventListener("change", (e) => {
            const fg = document.getElementById("publishFileGroup");
            if (fg) fg.style.display = e.target.value === "file" ? "block" : "none";
        });

        this.bindCommunityModal();
        this.bindDialogModal();
    }

    bindDialogModal() {
        document.getElementById("dialogConfirmBtn")?.addEventListener("click", () => {
            const cb = this.dialogCallback;
            this.dialogCallback = null;
            this.closeAllModals();
            if (cb) cb();
        });
        document.getElementById("dialogCancelBtn")?.addEventListener("click", () => {
            this.dialogCallback = null;
            this.closeAllModals();
        });
    }

    bindCommunityModal() {
        document.getElementById("communityProjectOpenBtn")?.addEventListener("click", () => {
            if (!this.activeCommunityProject) return;
            this.closeAllModals();
            this.loadProject(JSON.parse(JSON.stringify(this.activeCommunityProject)));
        });

        document.getElementById("communityProjectSaveBtn")?.addEventListener("click", async () => {
            if (this.activeCommunityProject) {
                await this.saveCommunityProjectToLibrary(this.activeCommunityProject);
            }
        });

        document.getElementById("communityProjectDownloadBtn")?.addEventListener("click", () => {
            if (this.activeCommunityProject) window.projectStorage.downloadPahFile(this.activeCommunityProject);
        });

        document.getElementById("communityProjectLikeBtn")?.addEventListener("click", async () => {
            if (!this.activeCommunityProject) return;
            if (!window.authManager?.isLoggedIn()) {
                this.showToast("Zaloguj się, aby polubić projekt!", "info");
                this.openModal("authModal");
                return;
            }
            const res = await window.projectStorage.likeCommunityProject(this.activeCommunityProject.id);
            if (res.success) {
                this.activeCommunityProject.likes = res.likes;
                const btn = document.getElementById("communityProjectLikeBtn");
                if (btn) {
                    btn.innerHTML = `<i class="fas fa-heart"></i> <span>${res.likes}</span>`;
                    btn.style.color = res.isLiked ? "#e74c3c" : "";
                }
            }
        });

        document.getElementById("communityProjectAuthorBtn")?.addEventListener("click", () => {
            if (!this.activeCommunityProject) return;
            this.openPublicProfile(this.activeCommunityProject.authorId, this.activeCommunityProject.author);
        });

        document.getElementById("btnCommentLogin")?.addEventListener("click", () => {
            this.closeAllModals();
            this.openModal("authModal");
        });

        document.getElementById("communityCommentSubmitBtn")?.addEventListener("click", () => this.submitCommunityComment());
    }

    async saveCommunityProjectToLibrary(project) {
        if (!project) return;
        const clone = JSON.parse(JSON.stringify(project));
        clone.id = "proj_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
        if (!clone.name.includes("Kopia")) clone.name = clone.name + " (Kopia)";
        clone.updatedAt = new Date().toISOString();
        clone.createdAt = new Date().toISOString();
        clone.isPublic = false;

        window.projectStorage.saveLocalProject(clone);
        if (window.authManager?.isLoggedIn()) {
            await window.authManager.saveAccountProject(clone);
        }
        this.showToast(`Zapisano "${clone.name}" do Twojej biblioteki!`, "success");
    }

    openModal(id) { document.getElementById(id)?.classList.add("active"); }
    closeAllModals() { document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("active")); }

    openPublishModal(preSelectId) {
        const select = document.getElementById("publishSourceSelect");
        if (select) {
            select.innerHTML = '<option value="current">Bieżący projekt z edytora</option>';
            const localProjects = window.projectStorage.getLocalProjects();
            localProjects.forEach(p => {
                const opt = document.createElement("option");
                opt.value = p.id;
                opt.textContent = p.name || "Bez nazwy";
                select.appendChild(opt);
            });
            if (window.authManager && window.authManager.isLoggedIn()) {
                const accProjects = window.authManager.getAccountProjects();
                accProjects.forEach(p => {
                    if (!localProjects.some(lp => lp.id === p.id)) {
                        const opt = document.createElement("option");
                        opt.value = p.id;
                        opt.textContent = (p.name || "Bez nazwy") + " (Konto)";
                        select.appendChild(opt);
                    }
                });
            }
            const fileOpt = document.createElement("option");
            fileOpt.value = "file";
            fileOpt.textContent = "Wgraj plik .pah";
            select.appendChild(fileOpt);

            if (preSelectId) {
                select.value = preSelectId;
            }
        }
        this.publishFileProject = null;
        const fg = document.getElementById("publishFileGroup");
        if (fg) fg.style.display = (preSelectId === "file") ? "block" : "none";
        const fn = document.getElementById("publishFileName");
        if (fn) fn.textContent = "";
        this.openModal("publishModal");
    }

    // Auth & Guest Protection
    bindAuth() {
        document.getElementById("userProfileBadge")?.addEventListener("click", () => {
            if (window.authManager.isLoggedIn()) {
                document.querySelector('.nav-tab[data-view="profile"]')?.click();
            } else {
                this.openModal("authModal");
            }
        });

        document.getElementById("profileLoginBtn")?.addEventListener("click", () => this.openModal("authModal"));

        document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;
            try {
                const user = await window.authManager.login(
                    document.getElementById("loginUsername").value,
                    document.getElementById("loginPassword").value
                );
                this.closeAllModals();
                this.applyAuthState(user);
                this.showToast(`Zalogowano jako ${user.username}!`, "success");
            } catch (err) {
                this.showDialog("Logowanie", err.message);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });

        document.getElementById("registerForm")?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;
            try {
                const user = await window.authManager.register(
                    document.getElementById("registerUsername").value,
                    document.getElementById("registerPassword").value
                );
                this.closeAllModals();
                this.applyAuthState(user);
                this.showToast(`Konto utworzone! Witaj, ${user.username}!`, "success");
            } catch (err) {
                this.showDialog("Rejestracja", err.message);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });

        document.getElementById("logoutBtn")?.addEventListener("click", () => {
            window.authManager.logout();
            this.applyAuthState(window.authManager.getCurrentUser());
            this.showToast("Wylogowano", "info");
            document.querySelector('.nav-tab[data-view="studio"]')?.click();
        });

        window.authManager.onAuthChange((user) => this.applyAuthState(user));
    }

    applyAuthState(user) {
        const isLoggedIn = window.authManager.isLoggedIn();
        const badge = document.getElementById("userProfileBadge");

        if (badge) {
            if (isLoggedIn) {
                badge.innerHTML = `<i class="fas ${user.avatarIcon || 'fa-user-check'}" style="color:${user.avatarColor || '#ffd700'}"></i> <span>${user.username}</span>`;
            } else {
                badge.innerHTML = '<i class="fas fa-user"></i> <span>Gość (Zaloguj)</span>';
            }
        }

        document.querySelectorAll(".user-only-feature").forEach(el => {
            el.style.display = isLoggedIn ? (el.tagName === "BUTTON" ? "inline-flex" : "block") : "none";
        });
        document.querySelectorAll(".guest-only-feature").forEach(el => {
            el.style.display = isLoggedIn ? "none" : (el.tagName === "BUTTON" ? "inline-flex" : "block");
        });

        if (!isLoggedIn && (this.currentView === "library" || this.currentView === "profile")) {
            document.querySelector('.nav-tab[data-view="studio"]')?.click();
        }

        if (isLoggedIn && this.currentView === "profile") {
            this.renderProfileView();
        }
    }

    // Profile View
    bindProfileView() {
        const avatarGrid = document.getElementById("avatarPickerGrid");
        if (avatarGrid) {
            avatarGrid.innerHTML = "";
            this.avatarIcons.forEach(icon => {
                const opt = document.createElement("div");
                opt.className = "avatar-option";
                opt.innerHTML = `<i class="fas ${icon}"></i>`;
                opt.addEventListener("click", () => {
                    avatarGrid.querySelectorAll(".avatar-option").forEach(o => o.classList.remove("active"));
                    opt.classList.add("active");
                });
                opt.dataset.icon = icon;
                avatarGrid.appendChild(opt);
            });
        }

        document.getElementById("editProfileToggleBtn")?.addEventListener("click", () => {
            const sec = document.getElementById("profileEditSection");
            const btn = document.getElementById("editProfileToggleBtn");
            if (sec) {
                const isHidden = sec.style.display === "none";
                sec.style.display = isHidden ? "block" : "none";
                if (btn) btn.innerHTML = isHidden
                    ? '<i class="fas fa-times"></i> Zamknij edycję'
                    : '<i class="fas fa-edit"></i> Edytuj profil';
            }
        });

        document.getElementById("profileFeaturedToggle")?.addEventListener("change", (e) => {
            window.authManager.setFeaturedEnabled(e.target.checked);
            this.renderProfileView();
            this.showToast(e.target.checked ? "Włączono sekcję najlepszych prac." : "Wyłączono sekcję najlepszych prac.", "info");
        });

        document.getElementById("saveProfileBtn")?.addEventListener("click", () => {
            if (!window.authManager.isLoggedIn()) { this.showToast("Musisz się zalogować!", "error"); return; }
            const activeAvatar = document.querySelector(".avatar-option.active");
            const bio = document.getElementById("profileBioInput")?.value || "";
            const color = document.getElementById("profileColorInput")?.value || "#ffd700";
            const featuredEnabled = document.getElementById("profileFeaturedToggle")?.checked ?? true;
            const updates = { bio, avatarColor: color, featuredEnabled };
            if (activeAvatar) updates.avatarIcon = activeAvatar.dataset.icon;
            window.authManager.updateProfile(updates);
            this.renderProfileView();
            this.showToast("Profil zaktualizowany!", "success");
        });
    }

    renderProfileView() {
        const user = window.authManager.getCurrentUser();
        const el = (id) => document.getElementById(id);

        const editSec = el("profileEditSection");
        if (editSec) editSec.style.display = "none";
        const editBtn = el("editProfileToggleBtn");
        if (editBtn) editBtn.innerHTML = '<i class="fas fa-edit"></i> Edytuj profil';

        if (el("profileAvatarDisplay")) el("profileAvatarDisplay").innerHTML = `<i class="fas ${user.avatarIcon || 'fa-user'}" style="color:${user.avatarColor || '#ffd700'}"></i>`;
        if (el("profileNameDisplay")) el("profileNameDisplay").textContent = user.username;
        if (el("profileBioDisplay")) el("profileBioDisplay").textContent = user.bio || "Brak opisu...";
        if (el("profileBioInput")) el("profileBioInput").value = user.bio || "";
        if (el("profileColorInput")) el("profileColorInput").value = user.avatarColor || "#ffd700";

        const featuredToggle = el("profileFeaturedToggle");
        if (featuredToggle) featuredToggle.checked = user.featuredEnabled !== false;

        document.querySelectorAll(".avatar-option").forEach(o => o.classList.toggle("active", o.dataset.icon === user.avatarIcon));

        const projGrid = document.getElementById("profileProjectsGrid");
        const featuredGrid = document.getElementById("profileFeaturedGrid");
        const featuredSection = document.getElementById("profileFeaturedSection");

        if (window.authManager.isLoggedIn()) {
            const myProjects = window.authManager.getAccountProjects();
            const localProjects = window.projectStorage.getLocalProjects();
            const allMine = [...myProjects];
            localProjects.forEach(p => {
                if (!allMine.some(x => x.id === p.id)) allMine.push(p);
            });
            const featuredIds = window.authManager.getFeaturedProjectIds();

            if (el("profileProjectCount")) el("profileProjectCount").textContent = allMine.length + " projektów";

            if (projGrid) {
                projGrid.innerHTML = "";
                window.projectLibrary.container = projGrid;
                allMine.forEach(p => {
                    const card = window.projectLibrary.createProjectCard(
                        { ...p, source: "local" },
                        { allowFeature: true, isFeatured: featuredIds.includes(p.id) }
                    );
                    projGrid.appendChild(card);
                    window.projectLibrary.startCardLivePreview(p, card);
                });
                window.projectLibrary.container = document.getElementById("libraryProjectsGrid");
            }

            if (featuredGrid && featuredSection) {
                if (user.featuredEnabled === false) {
                    featuredSection.style.display = "none";
                } else {
                    featuredSection.style.display = "block";
                    featuredGrid.innerHTML = "";
                    const featured = allMine.filter(p => featuredIds.includes(p.id));
                    if (featured.length === 0) {
                        featuredGrid.innerHTML = '<p style="grid-column:1/-1;color:var(--text2);text-align:center;padding:20px;">Oznacz gwiazdką swoje projekty powyżej, aby wyróżnić je w swoim profilu.</p>';
                    } else {
                        featured.forEach(p => {
                            const card = window.projectLibrary.createProjectCard(
                                { ...p, source: "local" },
                                { allowFeature: true, isFeatured: true }
                            );
                            featuredGrid.appendChild(card);
                            window.projectLibrary.startCardLivePreview(p, card);
                        });
                    }
                }
            }
        }
    }

    // Project IO
    loadProject(project) {
        this.currentProject = project;
        window.pixelEditor.setProject(this.currentProject);
        window.animationEngine.init(this.currentProject);
        this.updateProjectHeaderInfo();
        this.renderTimeline();
        this.renderPaletteSwatches();
        document.querySelector('.nav-tab[data-view="studio"]')?.click();
        this.saveCurrentProject();
    }

    saveCurrentProject() {
        if (!this.currentProject) return;
        window.projectStorage.saveLocalProject(this.currentProject);
        if (window.authManager.isLoggedIn()) window.authManager.saveAccountProject(this.currentProject);
    }

    updateProjectHeaderInfo() {
        const ti = document.getElementById("projectTitleInput");
        if (ti) ti.value = this.currentProject.name;
        const sd = document.getElementById("currentSizeDisplay");
        if (sd) sd.textContent = `${this.currentProject.width}x${this.currentProject.height}`;
        const gsW = document.getElementById("gridSizeW");
        const gsH = document.getElementById("gridSizeH");
        if (gsW) gsW.value = this.currentProject.width;
        if (gsH) gsH.value = this.currentProject.height;
    }

    // Toasts & Dialogs
    showToast(msg, type = "info") {
        const c = document.getElementById("toast-container");
        if (!c) return;
        const t = document.createElement("div");
        t.className = "toast";
        const icons = { success: "fa-check-circle", error: "fa-exclamation-triangle", info: "fa-info-circle" };
        t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
        c.appendChild(t);
        setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, 2800);
    }

    showDialog(title, message) {
        const titleEl = document.getElementById("dialogTitle");
        const msgEl = document.getElementById("dialogMessage");
        const cancelBtn = document.getElementById("dialogCancelBtn");
        const confirmBtn = document.getElementById("dialogConfirmBtn");
        if (titleEl) titleEl.innerHTML = `<i class="fas fa-circle-info"></i> ${title}`;
        if (msgEl) msgEl.textContent = message;
        if (cancelBtn) cancelBtn.style.display = "none";
        if (confirmBtn) confirmBtn.textContent = "OK";
        this.dialogCallback = null;
        this.openModal("dialogModal");
    }

    showConfirm(message, onConfirm) {
        const titleEl = document.getElementById("dialogTitle");
        const msgEl = document.getElementById("dialogMessage");
        const cancelBtn = document.getElementById("dialogCancelBtn");
        const confirmBtn = document.getElementById("dialogConfirmBtn");
        if (titleEl) titleEl.innerHTML = '<i class="fas fa-question-circle"></i> Potwierdzenie';
        if (msgEl) msgEl.textContent = message;
        if (cancelBtn) cancelBtn.style.display = "";
        if (confirmBtn) confirmBtn.textContent = "Tak";
        this.dialogCallback = onConfirm;
        this.openModal("dialogModal");
    }

    openCommunityProject(project) {
        this.activeCommunityProject = project;
        const titleEl = document.getElementById("communityProjectTitle");
        const metaEl = document.getElementById("communityProjectMeta");
        const descEl = document.getElementById("communityProjectDesc");
        const tagsEl = document.getElementById("communityProjectTags");
        const likeBtn = document.getElementById("communityProjectLikeBtn");
        const authorBtn = document.getElementById("communityProjectAuthorBtn");
        const commentWrap = document.getElementById("communityCommentFormWrap");
        const guestNotice = document.getElementById("communityCommentGuestNotice");

        if (titleEl) titleEl.textContent = project.name || "Projekt";
        if (authorBtn) {
            authorBtn.innerHTML = `<i class="fas fa-user"></i> <span>${this.esc(project.author || "Autor")}</span>`;
        }
        if (metaEl) {
            const date = new Date(project.publishedAt || project.updatedAt || project.createdAt).toLocaleDateString("pl-PL");
            metaEl.textContent = `${project.frames?.length || 1} kl. · ${project.fps || 8} FPS · ${project.width}x${project.height} · ${date}`;
        }
        if (descEl) descEl.textContent = project.description || "Brak opisu.";
        if (tagsEl) {
            tagsEl.innerHTML = (project.tags || []).map(t => `<span class="tag">${window.projectLibrary.esc(t)}</span>`).join("");
        }
        if (likeBtn) {
            likeBtn.innerHTML = `<i class="fas fa-heart"></i> <span>${project.likes || 0}</span>`;
            const uid = window.authManager?.isLoggedIn() ? window.authManager.getCurrentUser().id : null;
            likeBtn.style.color = (uid && Array.isArray(project.likedBy) && project.likedBy.includes(uid)) ? "#e74c3c" : "";
        }

        const isUser = window.authManager?.isLoggedIn();
        if (commentWrap) commentWrap.style.display = isUser ? "flex" : "none";
        if (guestNotice) guestNotice.style.display = isUser ? "none" : "block";

        this.renderCommunityPreview(project);
        this.loadCommunityComments(project.id);
        this.openModal("communityProjectModal");
    }

    renderCommunityPreview(project) {
        const canvas = document.getElementById("communityProjectPreviewCanvas");
        if (!canvas || !project?.frames?.length) return;
        canvas.width = project.width;
        canvas.height = project.height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        let idx = 0;
        const draw = (fi) => {
            const f = project.frames[fi];
            if (!f?.data) return;
            ctx.clearRect(0, 0, project.width, project.height);
            for (let y = 0; y < project.height; y++) {
                for (let x = 0; x < project.width; x++) {
                    const c = f.data[y * project.width + x];
                    if (c && c !== "#00000000") { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
                }
            }
        };
        draw(0);
        if (this._communityPreviewTimer) clearInterval(this._communityPreviewTimer);
        if (project.frames.length > 1) {
            this._communityPreviewTimer = setInterval(() => {
                idx = (idx + 1) % project.frames.length;
                draw(idx);
            }, 1000 / (project.fps || 8));
        }
    }

    async loadCommunityComments(projectId) {
        const list = document.getElementById("communityCommentsList");
        if (!list) return;
        list.innerHTML = '<p style="color:var(--text2);font-size:0.9rem;">Ładowanie komentarzy...</p>';
        const comments = await window.projectStorage.fetchCommunityComments(projectId);
        if (!comments.length) {
            list.innerHTML = '<p style="color:var(--text2);font-size:0.95rem;padding:6px 0;">Brak komentarzy. Bądź pierwszy!</p>';
            return;
        }
        list.innerHTML = comments.map(c => `
            <div class="comment-card">
                <div class="comment-card-header">
                    <span class="comment-card-author"><i class="fas fa-comment-dots"></i> ${window.projectLibrary.esc(c.username)}</span>
                    <span>${new Date(c.createdAt).toLocaleString("pl-PL")}</span>
                </div>
                <div style="font-size:1.05rem;line-height:1.3;">${window.projectLibrary.esc(c.text)}</div>
            </div>`).join("");
    }

    async submitCommunityComment() {
        if (!this.activeCommunityProject) return;
        if (!window.authManager?.isLoggedIn()) {
            this.showToast("Zaloguj się, aby komentować!", "info");
            this.openModal("authModal");
            return;
        }
        const input = document.getElementById("communityCommentInput");
        const text = input?.value?.trim();
        if (!text) {
            this.showDialog("Komentarz", "Wpisz treść komentarza.");
            return;
        }
        const ok = await window.projectStorage.addCommunityComment(this.activeCommunityProject.id, text);
        if (ok) {
            if (input) input.value = "";
            await this.loadCommunityComments(this.activeCommunityProject.id);
            this.showToast("Dodano komentarz!", "success");
        }
    }

    async openPublicProfile(authorId, authorName) {
        if (!authorId || authorId === "guest") {
            this.showDialog("Profil", "Brak publicznego profilu dla tego projektu (autor: Gość).");
            return;
        }
        const profile = await window.authManager.fetchPublicProfile(authorId);
        const user = profile || { username: authorName || "Autor", bio: "Brak opisu...", avatarIcon: "fa-user", avatarColor: "#ffd700", featuredEnabled: true, featuredProjectIds: [] };

        const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
        set("publicProfileAvatarDisplay", `<i class="fas ${user.avatarIcon || "fa-user"}" style="color:${user.avatarColor || "#ffd700"}"></i>`);
        const nameEl = document.getElementById("publicProfileNameDisplay");
        if (nameEl) nameEl.textContent = user.username || authorName;
        const bioEl = document.getElementById("publicProfileBioDisplay");
        if (bioEl) bioEl.textContent = user.bio || "Brak opisu...";

        const community = window.projectStorage.getCommunityProjects().filter(p => p.authorId === authorId || p.author === authorName);
        const countEl = document.getElementById("publicProfileProjectCount");
        if (countEl) countEl.textContent = community.length + " opublikowanych prac";

        const featuredIds = user.featuredProjectIds || [];
        const featuredGrid = document.getElementById("publicProfileFeaturedGrid");
        const featuredSec = document.getElementById("publicProfileFeaturedSection");
        const projectsGrid = document.getElementById("publicProfileProjectsGrid");

        if (featuredGrid && featuredSec) {
            if (user.featuredEnabled === false) {
                featuredSec.style.display = "none";
            } else {
                featuredSec.style.display = "block";
                featuredGrid.innerHTML = "";
                const featured = community.filter(p => featuredIds.includes(p.id));
                if (!featured.length) {
                    featuredGrid.innerHTML = '<p style="grid-column:1/-1;color:var(--text2);text-align:center;padding:12px;">Autor nie wyróżnił jeszcze prac.</p>';
                } else {
                    featured.forEach(p => {
                        const card = window.projectLibrary.createProjectCard({ ...p, source: "community" });
                        featuredGrid.appendChild(card);
                        window.projectLibrary.startCardLivePreview(p, card);
                    });
                }
            }
        }
        if (projectsGrid) {
            projectsGrid.innerHTML = "";
            if (!community.length) {
                projectsGrid.innerHTML = '<p style="grid-column:1/-1;color:var(--text2);text-align:center;padding:12px;">Brak opublikowanych prac.</p>';
            } else {
                community.forEach(p => {
                    const card = window.projectLibrary.createProjectCard({ ...p, source: "community" });
                    projectsGrid.appendChild(card);
                    window.projectLibrary.startCardLivePreview(p, card);
                });
            }
        }
        this.openModal("publicProfileModal");
    }

    toggleFeaturedProject(projectId) {
        if (!window.authManager?.isLoggedIn()) return;
        const ids = window.authManager.toggleFeaturedProject(projectId);
        this.showToast(ids.includes(projectId) ? "Dodano do najlepszych prac!" : "Usunięto z najlepszych prac.", "info");
        this.renderProfileView();
    }

    updateTimelineView() {
        this.renderTimeline();
    }

    esc(s) { return window.projectLibrary ? window.projectLibrary.esc(s) : (s || ""); }
}

document.addEventListener("DOMContentLoaded", () => { window.app = new PAHApp(); window.app.init(); });
