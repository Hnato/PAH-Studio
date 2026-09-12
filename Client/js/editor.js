/**
 * PAH Pixel Art Canvas Editor Engine v2.2 (Parrot core 2.2)
 * Handles drawing, rich tool settings (pencil, eraser, spray, line, rect, circle, shader),
 * marching ants selection, frictionless move tool, zoom/pan, symmetry, undo/redo.
 */

class PixelEditor {
    constructor() {
        this.project = null;
        this.activeTool = "pencil";

        // Pencil & Eraser Settings
        this.penSize = 1;
        this.pencilShape = "square"; // "square" | "circle"
        this.eraserSize = 1;
        this.eraserShape = "square";

        // Spray Settings
        this.sprayRadius = 8;
        this.sprayDensity = 6;

        // Line Settings
        this.lineWidth = 1;
        this.lineCap = "square"; // "square" | "round"

        // Rect & Circle Settings
        this.rectFillMode = "stroke"; // "stroke" | "fill"
        this.rectBorderWidth = 1;
        this.circleFillMode = "stroke"; // "stroke" | "fill"
        this.circleBorderWidth = 1;

        // Shader Settings
        this.shaderMode = "lighten"; // "lighten" | "darken" | "saturate" | "desaturate"
        this.shaderStrength = 15; // 1 to 50 %
        this.shaderSize = 1; // 1 to 64 px

        // Colors & Global Options
        this.currentColor = "#1b4d3e";
        this.secondaryColor = "#00000000";
        this.symmetryX = false;
        this.symmetryY = false;
        this.showGrid = true;

        // Viewport & Pan
        this.zoom = 20;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;

        // Interaction State
        this.isDrawing = false;
        this.drawStartX = 0;
        this.drawStartY = 0;
        this.lastDrawX = null;
        this.lastDrawY = null;
        this.mouseGridX = 0;
        this.mouseGridY = 0;

        // Undo/Redo
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;

        // Selection & Move
        this.selection = null; // { x, y, w, h }
        this.clipboard = null; // { w, h, data: [] }
        this.selectionData = null; // lifted pixels
        this.isSelecting = false;
        this.isMovingSelection = false;
        this.isShiftingFrame = false;
        this.frameSnapshot = null;
        this.shiftStartX = 0;
        this.shiftStartY = 0;
        this.moveOffsetX = 0;
        this.moveOffsetY = 0;
        this.marchOffset = 0;
        this.marchTimer = null;

        // DOM
        this.wrapper = null;
        this.pixelCanvas = null;
        this.pixelCtx = null;
        this.onionCanvas = null;
        this.onionCtx = null;
        this.gridCanvas = null;
        this.gridCtx = null;
        this.previewCanvas = null;
        this.previewCtx = null;
        this.selectionCanvas = null;
        this.selectionCtx = null;
        this.viewport = null;
        this.scrollArea = null;
    }

    init(container, project) {
        this.project = project;
        this.wrapper = container;
        this.pixelCanvas = document.getElementById("pixelCanvas");
        this.pixelCtx = this.pixelCanvas.getContext("2d", { willReadFrequently: true });
        this.onionCanvas = document.getElementById("onionCanvas");
        this.onionCtx = this.onionCanvas.getContext("2d");
        this.gridCanvas = document.getElementById("gridCanvas");
        this.gridCtx = this.gridCanvas.getContext("2d");
        this.previewCanvas = document.getElementById("previewCanvas");
        this.previewCtx = this.previewCanvas.getContext("2d");
        this.selectionCanvas = document.getElementById("selectionCanvas");
        this.selectionCtx = this.selectionCanvas ? this.selectionCanvas.getContext("2d") : null;
        this.viewport = document.getElementById("canvasViewport");
        this.scrollArea = document.getElementById("canvasScrollArea");

        this.setupCanvases();
        this.setupEventListeners();
        this.centerCanvas();
        this.renderAll();
        this.startMarchingAnts();
    }

    setProject(project) {
        this.project = project;
        this.undoStack = [];
        this.redoStack = [];
        this.clearSelection();
        this.setupCanvases();
        this.centerCanvas();
        this.renderAll();
    }

    setupCanvases() {
        if (!this.project) return;
        const w = this.project.width;
        const h = this.project.height;
        [this.pixelCanvas, this.onionCanvas, this.gridCanvas, this.previewCanvas, this.selectionCanvas].forEach(c => {
            if (!c) return;
            c.width = w;
            c.height = h;
        });
        this.updateCanvasDisplaySize();
    }

    updateCanvasDisplaySize() {
        if (!this.project) return;
        const dW = this.project.width * this.zoom;
        const dH = this.project.height * this.zoom;
        [this.pixelCanvas, this.onionCanvas, this.gridCanvas, this.previewCanvas, this.selectionCanvas].forEach(c => {
            if (!c) return;
            c.style.width = dW + "px";
            c.style.height = dH + "px";
        });
        this.wrapper.style.width = dW + "px";
        this.wrapper.style.height = dH + "px";

        if (this.scrollArea) {
            this.scrollArea.style.minWidth = Math.max(dW + 1200, 2500) + "px";
            this.scrollArea.style.minHeight = Math.max(dH + 1200, 2500) + "px";
        }

        const z = this.zoom;
        const z2 = z * 2;
        this.wrapper.style.backgroundSize = `${z2}px ${z2}px`;
        this.wrapper.style.backgroundPosition = `0 0, 0 ${z}px, ${z}px -${z}px, -${z}px 0px`;

        this.renderGrid();
        this.renderSelection();
    }

    centerCanvas() {
        if (!this.viewport) return;
        requestAnimationFrame(() => {
            const left = Math.max(0, (this.viewport.scrollWidth - this.viewport.clientWidth) / 2);
            const top = Math.max(0, (this.viewport.scrollHeight - this.viewport.clientHeight) / 2);
            this.viewport.scrollLeft = left;
            this.viewport.scrollTop = top;
        });
    }

    setZoom(newZoom) {
        this.zoom = Math.max(2, Math.min(80, newZoom));
        this.updateCanvasDisplaySize();
    }

    zoomIn() { this.setZoom(this.zoom + 2); }
    zoomOut() { this.setZoom(this.zoom - 2); }

    screenToGrid(screenX, screenY) {
        if (!this.wrapper || !this.project) return { x: 0, y: 0, isInside: false };
        const rect = this.wrapper.getBoundingClientRect();
        const x = Math.floor((screenX - rect.left) / this.zoom);
        const y = Math.floor((screenY - rect.top) / this.zoom);
        return {
            x: Math.max(0, Math.min(this.project.width - 1, x)),
            y: Math.max(0, Math.min(this.project.height - 1, y)),
            isInside: screenX >= rect.left && screenX < rect.right && screenY >= rect.top && screenY < rect.bottom
        };
    }

    getCurrentFrame() {
        return window.animationEngine ? window.animationEngine.getCurrentFrame() : this.project?.frames[0];
    }

    // --- Rendering ---
    renderAll() {
        this.renderFrame();
        this.renderOnionSkin();
        this.renderGrid();
        this.renderSelection();
        this.updateLivePreviewBox();
    }

    renderFrame() {
        if (!this.pixelCtx || !this.project) return;
        const w = this.project.width;
        const h = this.project.height;
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.pixelCtx.clearRect(0, 0, w, h);
        const imgData = this.pixelCtx.createImageData(w, h);
        const data = imgData.data;
        for (let i = 0; i < frame.data.length; i++) {
            const rgba = this.hexToRgba(frame.data[i]);
            const idx = i * 4;
            data[idx] = rgba.r;
            data[idx + 1] = rgba.g;
            data[idx + 2] = rgba.b;
            data[idx + 3] = rgba.a;
        }
        this.pixelCtx.putImageData(imgData, 0, 0);
    }

    renderOnionSkin() {
        if (!this.onionCtx || !this.project) return;
        const w = this.project.width;
        const h = this.project.height;
        this.onionCtx.clearRect(0, 0, w, h);
        if (!window.animationEngine || !window.animationEngine.onionSkinEnabled) return;
        const { prev, next } = window.animationEngine.getOnionSkinFrames();
        const opacity = window.animationEngine.onionSkinOpacity || 0.3;
        if (prev) {
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const c = prev[y * w + x];
                if (c && c !== "#00000000") { this.onionCtx.fillStyle = `rgba(0,200,255,${opacity})`; this.onionCtx.fillRect(x, y, 1, 1); }
            }
        }
        if (next) {
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const c = next[y * w + x];
                if (c && c !== "#00000000") { this.onionCtx.fillStyle = `rgba(255,120,0,${opacity})`; this.onionCtx.fillRect(x, y, 1, 1); }
            }
        }
    }

    renderGrid() {
        if (!this.gridCtx || !this.project) return;
        const w = this.project.width;
        const h = this.project.height;
        this.gridCtx.clearRect(0, 0, w, h);
        if (!this.showGrid || this.zoom < 6) return;
        this.gridCtx.strokeStyle = "rgba(0,0,0,0.2)";
        this.gridCtx.lineWidth = 0.06;
        for (let x = 0; x <= w; x++) { this.gridCtx.beginPath(); this.gridCtx.moveTo(x, 0); this.gridCtx.lineTo(x, h); this.gridCtx.stroke(); }
        for (let y = 0; y <= h; y++) { this.gridCtx.beginPath(); this.gridCtx.moveTo(0, y); this.gridCtx.lineTo(w, y); this.gridCtx.stroke(); }
    }

    updateLivePreviewBox() {
        const lc = document.getElementById("livePreviewCanvas");
        if (!lc || !this.project) return;
        const ctx = lc.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const frame = this.getCurrentFrame();
        if (!frame) return;
        lc.width = this.project.width;
        lc.height = this.project.height;
        ctx.clearRect(0, 0, lc.width, lc.height);
        for (let y = 0; y < this.project.height; y++) for (let x = 0; x < this.project.width; x++) {
            const color = frame.data[y * this.project.width + x];
            if (color && color !== "#00000000") { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
        }
    }

    // --- History ---
    pushHistory() {
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.undoStack.push({
            frameIndex: window.animationEngine ? window.animationEngine.currentFrameIndex : 0,
            data: [...frame.data]
        });
        if (this.undoStack.length > this.maxUndoSteps) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.redoStack.push({ frameIndex: window.animationEngine ? window.animationEngine.currentFrameIndex : 0, data: [...frame.data] });
        const prev = this.undoStack.pop();
        if (window.animationEngine && prev.frameIndex !== window.animationEngine.currentFrameIndex) window.animationEngine.setCurrentFrameIndex(prev.frameIndex);
        const target = this.getCurrentFrame();
        target.data = [...prev.data];
        this.renderAll();
        if (window.app) window.app.updateTimelineView();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.undoStack.push({ frameIndex: window.animationEngine ? window.animationEngine.currentFrameIndex : 0, data: [...frame.data] });
        const next = this.redoStack.pop();
        if (window.animationEngine && next.frameIndex !== window.animationEngine.currentFrameIndex) window.animationEngine.setCurrentFrameIndex(next.frameIndex);
        const target = this.getCurrentFrame();
        target.data = [...next.data];
        this.renderAll();
        if (window.app) window.app.updateTimelineView();
    }

    // --- Pixel Manipulation ---
    setPixel(x, y, color) {
        if (!this.project || x < 0 || x >= this.project.width || y < 0 || y >= this.project.height) return;
        const frame = this.getCurrentFrame();
        if (!frame) return;
        frame.data[y * this.project.width + x] = color;
        if (this.symmetryX) frame.data[y * this.project.width + (this.project.width - 1 - x)] = color;
        if (this.symmetryY) frame.data[(this.project.height - 1 - y) * this.project.width + x] = color;
        if (this.symmetryX && this.symmetryY) frame.data[(this.project.height - 1 - y) * this.project.width + (this.project.width - 1 - x)] = color;
    }

    getPixel(x, y) {
        if (!this.project || x < 0 || x >= this.project.width || y < 0 || y >= this.project.height) return "#00000000";
        const frame = this.getCurrentFrame();
        return frame ? (frame.data[y * this.project.width + x] || "#00000000") : "#00000000";
    }

    // Drawing brush with square/circle shapes and up to 512px
    drawBrush(gx, gy, color, size = 1, shape = "square") {
        size = Math.max(1, Math.min(512, size || 1));
        if (size === 1) {
            this.setPixel(gx, gy, color);
            return;
        }
        const off = Math.floor(size / 2);
        const r2 = (size / 2) * (size / 2);

        for (let dy = 0; dy < size; dy++) {
            const py = gy - off + dy;
            if (py < 0 || py >= this.project.height) continue;
            for (let dx = 0; dx < size; dx++) {
                const px = gx - off + dx;
                if (px < 0 || px >= this.project.width) continue;
                if (shape === "circle") {
                    const cx = dx - off;
                    const cy = dy - off;
                    if (cx * cx + cy * cy > r2) continue;
                }
                this.setPixel(px, py, color);
            }
        }
    }

    drawLine(x0, y0, x1, y1, color, size = 1, shape = "square") {
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            this.drawBrush(x0, y0, color, size, shape);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    floodFill(sx, sy, targetColor, fillColor) {
        if (!this.project || targetColor === fillColor) return;
        const w = this.project.width, h = this.project.height;
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.pushHistory();
        const q = [[sx, sy]], visited = new Uint8Array(w * h);
        while (q.length > 0) {
            const [cx, cy] = q.pop();
            const idx = cy * w + cx;
            if (visited[idx]) continue;
            visited[idx] = 1;
            if (frame.data[idx] === targetColor) {
                frame.data[idx] = fillColor;
                if (cx > 0) q.push([cx - 1, cy]);
                if (cx < w - 1) q.push([cx + 1, cy]);
                if (cy > 0) q.push([cx, cy - 1]);
                if (cy < h - 1) q.push([cx, cy + 1]);
            }
        }
    }

    drawRectangle(x0, y0, x1, y1, color, fill = false, borderWidth = 1) {
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        const bw = Math.max(1, borderWidth || 1);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const isEdge = (x < minX + bw || x > maxX - bw || y < minY + bw || y > maxY - bw);
                if (fill || isEdge) {
                    this.setPixel(x, y, color);
                }
            }
        }
    }

    drawEllipse(x0, y0, x1, y1, color, fill = false, borderWidth = 1) {
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        const rx = (maxX - minX) / 2, ry = (maxY - minY) / 2;
        const cx = minX + rx, cy = minY + ry;
        if (rx <= 0 || ry <= 0) { this.drawLine(minX, minY, maxX, maxY, color); return; }

        const bw = Math.max(1, borderWidth || 1);
        const innerRx = Math.max(0, rx - bw);
        const innerRy = Math.max(0, ry - bw);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const outerDist = ((x - cx) / (rx || 1)) ** 2 + ((y - cy) / (ry || 1)) ** 2;
                if (outerDist <= 1.05) {
                    if (fill) {
                        this.setPixel(x, y, color);
                    } else {
                        const innerDist = innerRx > 0 && innerRy > 0 ? (((x - cx) / innerRx) ** 2 + ((y - cy) / innerRy) ** 2) : 0;
                        if (innerDist >= 1.0 || innerRx <= 0 || innerRy <= 0) {
                            this.setPixel(x, y, color);
                        }
                    }
                }
            }
        }
    }

    // --- Shader Tool with Options (Lighten, Darken, Saturate, Desaturate) ---
    applyShader(gx, gy) {
        const size = Math.max(1, this.shaderSize || 1);
        const off = Math.floor(size / 2);
        for (let dy = 0; dy < size; dy++) {
            const py = gy - off + dy;
            if (py < 0 || py >= this.project.height) continue;
            for (let dx = 0; dx < size; dx++) {
                const px = gx - off + dx;
                if (px < 0 || px >= this.project.width) continue;
                this._shadePixel(px, py);
            }
        }
    }

    _shadePixel(x, y) {
        const hex = this.getPixel(x, y);
        if (!hex || hex === "#00000000" || hex === "transparent") return;
        const c = this.hexToRgba(hex);
        const strength = (this.shaderStrength || 15) / 100;

        let r = c.r, g = c.g, b = c.b;
        if (this.shaderMode === "lighten") {
            r = Math.min(255, Math.round(r + (255 - r) * strength + 3));
            g = Math.min(255, Math.round(g + (255 - g) * strength + 3));
            b = Math.min(255, Math.round(b + (255 - b) * strength + 3));
        } else if (this.shaderMode === "darken") {
            r = Math.max(0, Math.round(r * (1 - strength) - 3));
            g = Math.max(0, Math.round(g * (1 - strength) - 3));
            b = Math.max(0, Math.round(b * (1 - strength) - 3));
        } else if (this.shaderMode === "saturate") {
            const hsl = this.rgbToHsl(r, g, b);
            hsl.s = Math.min(1, hsl.s + strength);
            const rgb = this.hslToRgb(hsl.h, hsl.s, hsl.l);
            r = rgb.r; g = rgb.g; b = rgb.b;
        } else if (this.shaderMode === "desaturate") {
            const hsl = this.rgbToHsl(r, g, b);
            hsl.s = Math.max(0, hsl.s - strength);
            const rgb = this.hslToRgb(hsl.h, hsl.s, hsl.l);
            r = rgb.r; g = rgb.g; b = rgb.b;
        }
        this.setPixel(x, y, this.rgbToHex(r, g, b));
    }

    // --- Spray Tool with Radius & Density ---
    applySpray(gx, gy, color) {
        const radius = Math.max(1, this.sprayRadius || 8);
        const count = Math.max(1, this.sprayDensity || 6);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius;
            const ox = Math.round(gx + Math.cos(angle) * dist);
            const oy = Math.round(gy + Math.sin(angle) * dist);
            if (ox >= 0 && ox < this.project.width && oy >= 0 && oy < this.project.height) {
                this.setPixel(ox, oy, color);
            }
        }
    }

    replaceColorAll(oldColor, newColor) {
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.pushHistory();
        for (let i = 0; i < frame.data.length; i++) {
            if (frame.data[i] === oldColor) frame.data[i] = newColor;
        }
        this.renderAll();
        if (window.app) window.app.updateTimelineView();
    }

    // --- Transformations ---
    flipHorizontal() {
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.pushHistory();
        const w = this.project.width, h = this.project.height;
        const nd = new Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nd[y * w + (w - 1 - x)] = frame.data[y * w + x];
        frame.data = nd;
        this.renderAll();
        if (window.app) window.app.updateTimelineView();
    }

    flipVertical() {
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.pushHistory();
        const w = this.project.width, h = this.project.height;
        const nd = new Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nd[(h - 1 - y) * w + x] = frame.data[y * w + x];
        frame.data = nd;
        this.renderAll();
        if (window.app) window.app.updateTimelineView();
    }

    clearFrame() {
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.pushHistory();
        frame.data.fill("#00000000");
        this.renderAll();
        if (window.app) window.app.updateTimelineView();
    }

    invertColors() {
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.pushHistory();
        for (let i = 0; i < frame.data.length; i++) {
            const hex = frame.data[i];
            if (hex && hex !== "#00000000") {
                const c = this.hexToRgba(hex);
                frame.data[i] = this.rgbToHex(255 - c.r, 255 - c.g, 255 - c.b);
            }
        }
        this.renderAll();
        if (window.app) window.app.updateTimelineView();
    }

    resizeGrid(newW, newH) {
        if (!this.project) return;
        newW = Math.max(2, Math.min(256, newW));
        newH = Math.max(2, Math.min(256, newH));
        const oldW = this.project.width, oldH = this.project.height;
        if (oldW === newW && oldH === newH) return;
        this.project.width = newW;
        this.project.height = newH;
        this.project.frames.forEach(frame => {
            const old = frame.data;
            const nd = new Array(newW * newH).fill("#00000000");
            for (let y = 0; y < Math.min(oldH, newH); y++) for (let x = 0; x < Math.min(oldW, newW); x++) nd[y * newW + x] = old[y * oldW + x];
            frame.data = nd;
        });
        this.setupCanvases();
        this.centerCanvas();
        this.renderAll();
        if (window.app) window.app.updateTimelineView();
    }

    // --- Selection & Marching Ants Outline ---
    startMarchingAnts() {
        if (this.marchTimer) clearInterval(this.marchTimer);
        this.marchTimer = setInterval(() => {
            this.marchOffset = (this.marchOffset + 1) % 8;
            this.renderSelection();
        }, 120);
    }

    renderSelection() {
        if (!this.selectionCtx || !this.project) return;
        const w = this.project.width, h = this.project.height;
        this.selectionCtx.clearRect(0, 0, w, h);
        if (!this.selection) return;
        const s = this.selection;
        
        this.selectionCtx.save();
        // Visible overlay fill
        this.selectionCtx.fillStyle = "rgba(46, 204, 113, 0.18)";
        this.selectionCtx.fillRect(s.x, s.y, s.w, s.h);

        // Marching ants outline
        const z = this.zoom || 20;
        const lw = 1 / z;
        this.selectionCtx.lineWidth = lw;
        this.selectionCtx.strokeStyle = "#ffffff";
        this.selectionCtx.setLineDash([3 / z, 3 / z]);
        this.selectionCtx.lineDashOffset = -this.marchOffset / z;
        this.selectionCtx.strokeRect(s.x, s.y, s.w, s.h);

        this.selectionCtx.strokeStyle = "#1b4d3e";
        this.selectionCtx.lineDashOffset = -(this.marchOffset + 3) / z;
        this.selectionCtx.strokeRect(s.x, s.y, s.w, s.h);
        this.selectionCtx.restore();
    }

    clearSelection() {
        if (this.selectionData) {
            this.stampSelection();
        }
        this.selection = null;
        this.selectionData = null;
        this.isMovingSelection = false;
        this.isSelecting = false;
        this.renderSelection();
    }

    getSelectionPixels() {
        if (!this.selection || !this.project) return null;
        const s = this.selection;
        const frame = this.getCurrentFrame();
        if (!frame) return null;
        const data = [];
        for (let y = 0; y < s.h; y++) {
            for (let x = 0; x < s.w; x++) {
                const sx = s.x + x, sy = s.y + y;
                if (sx >= 0 && sx < this.project.width && sy >= 0 && sy < this.project.height) {
                    data.push(frame.data[sy * this.project.width + sx]);
                } else {
                    data.push("#00000000");
                }
            }
        }
        return { w: s.w, h: s.h, data };
    }

    copySelection() {
        const pixels = this.getSelectionPixels();
        if (pixels) {
            this.clipboard = pixels;
            if (window.app) window.app.showToast("Skopiowano zaznaczenie!", "info");
        }
    }

    cutSelection() {
        const pixels = this.getSelectionPixels();
        if (!pixels || !this.selection) return;
        this.clipboard = pixels;
        this.pushHistory();
        const s = this.selection;
        const frame = this.getCurrentFrame();
        if (!frame) return;
        for (let y = 0; y < s.h; y++) {
            for (let x = 0; x < s.w; x++) {
                const sx = s.x + x, sy = s.y + y;
                if (sx >= 0 && sx < this.project.width && sy >= 0 && sy < this.project.height) {
                    frame.data[sy * this.project.width + sx] = "#00000000";
                }
            }
        }
        this.clearSelection();
        this.renderAll();
        if (window.app) { window.app.showToast("Wycięto zaznaczenie!", "info"); window.app.updateTimelineView(); }
    }

    pasteClipboard() {
        if (!this.clipboard || !this.project) return;
        this.pushHistory();
        const frame = this.getCurrentFrame();
        if (!frame) return;
        const px = this.mouseGridX || 0;
        const py = this.mouseGridY || 0;
        for (let y = 0; y < this.clipboard.h; y++) {
            for (let x = 0; x < this.clipboard.w; x++) {
                const tx = px + x, ty = py + y;
                if (tx >= 0 && tx < this.project.width && ty >= 0 && ty < this.project.height) {
                    const c = this.clipboard.data[y * this.clipboard.w + x];
                    if (c && c !== "#00000000") {
                        frame.data[ty * this.project.width + tx] = c;
                    }
                }
            }
        }
        this.selection = { x: px, y: py, w: this.clipboard.w, h: this.clipboard.h };
        this.renderAll();
        if (window.app) { window.app.showToast("Wklejono!", "info"); window.app.updateTimelineView(); }
    }

    liftSelection() {
        if (!this.selection || !this.project) return;
        if (this.selectionData) return;
        const s = this.selection;
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.pushHistory();
        const data = [];
        for (let y = 0; y < s.h; y++) {
            for (let x = 0; x < s.w; x++) {
                const sx = s.x + x, sy = s.y + y;
                if (sx >= 0 && sx < this.project.width && sy >= 0 && sy < this.project.height) {
                    data.push(frame.data[sy * this.project.width + sx]);
                    frame.data[sy * this.project.width + sx] = "#00000000";
                } else {
                    data.push("#00000000");
                }
            }
        }
        this.selectionData = { w: s.w, h: s.h, data };
    }

    stampSelection() {
        if (!this.selectionData || !this.selection || !this.project) return;
        const s = this.selection;
        const frame = this.getCurrentFrame();
        if (!frame) return;
        for (let y = 0; y < this.selectionData.h; y++) {
            for (let x = 0; x < this.selectionData.w; x++) {
                const tx = s.x + x, ty = s.y + y;
                if (tx >= 0 && tx < this.project.width && ty >= 0 && ty < this.project.height) {
                    const c = this.selectionData.data[y * this.selectionData.w + x];
                    if (c && c !== "#00000000") {
                        frame.data[ty * this.project.width + tx] = c;
                    }
                }
            }
        }
        this.selectionData = null;
        this.renderAll();
        if (window.app) window.app.updateTimelineView();
    }

    // --- Event Listeners & Move Tool Frictionless Logic ---
    setupEventListeners() {
        const viewport = this.viewport || this.wrapper.parentElement;

        const onDown = (e) => {
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                this.isPanning = true;
                this.panStartX = e.clientX + viewport.scrollLeft;
                this.panStartY = e.clientY + viewport.scrollTop;
                viewport.style.cursor = "grabbing";
                e.preventDefault();
                return;
            }
            if (e.button !== 0) return;

            const { x, y, isInside } = this.screenToGrid(e.clientX, e.clientY);
            if (!isInside && this.activeTool !== "move") return;

            this.isDrawing = true;
            this.drawStartX = x;
            this.drawStartY = y;
            this.lastDrawX = x;
            this.lastDrawY = y;

            if (this.activeTool === "select") {
                if (this.selection) {
                    const s = this.selection;
                    const inside = x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h;
                    if (inside) {
                        return;
                    }
                    if (this.selectionData) this.stampSelection();
                }
                this.isSelecting = true;
                this.selection = { x, y, w: 1, h: 1 };
                this.renderSelection();
            }
            else if (this.activeTool === "move") {
                // MOVE TOOL: Frictionless!
                if (this.selection) {
                    const s = this.selection;
                    const inside = x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h;
                    if (inside) {
                        this.isMovingSelection = true;
                        this.moveOffsetX = x - s.x;
                        this.moveOffsetY = y - s.y;
                        if (!this.selectionData) this.liftSelection();
                    } else {
                        // Stamp previous selection and immediately shift the whole canvas
                        if (this.selectionData) this.stampSelection();
                        this.selection = null;
                        this.startFrameShift(x, y);
                    }
                } else {
                    // No selection needed: immediate whole-frame move on drag!
                    this.startFrameShift(x, y);
                }
            }
            else if (this.activeTool === "pencil") {
                this.pushHistory();
                this.drawBrush(x, y, this.currentColor, this.penSize, this.pencilShape);
                this.renderAll();
            }
            else if (this.activeTool === "eraser") {
                this.pushHistory();
                this.drawBrush(x, y, "#00000000", this.eraserSize, this.eraserShape);
                this.renderAll();
            }
            else if (this.activeTool === "bucket") {
                this.floodFill(x, y, this.getPixel(x, y), this.currentColor);
                this.renderAll();
            }
            else if (this.activeTool === "eyedropper") {
                const p = this.getPixel(x, y);
                if (p && p !== "#00000000") {
                    this.currentColor = p;
                    if (window.app) window.app.updateCurrentColor(p);
                }
            }
            else if (this.activeTool === "shader") {
                this.pushHistory();
                this.applyShader(x, y);
                this.renderAll();
            }
            else if (this.activeTool === "spray") {
                this.pushHistory();
                this.applySpray(x, y, this.currentColor);
                this.renderAll();
            }
            else if (this.activeTool === "replace") {
                const oldC = this.getPixel(x, y);
                if (oldC && oldC !== "#00000000" && oldC !== this.currentColor) {
                    this.replaceColorAll(oldC, this.currentColor);
                }
            }
        };

        const onMove = (e) => {
            const { x, y } = this.screenToGrid(e.clientX, e.clientY);
            this.mouseGridX = x;
            this.mouseGridY = y;
            const coordEl = document.getElementById("canvasCoords");
            if (coordEl) coordEl.textContent = `X:${x} Y:${y}`;

            if (this.isPanning) {
                viewport.scrollLeft = this.panStartX - e.clientX;
                viewport.scrollTop = this.panStartY - e.clientY;
                return;
            }
            if (!this.isDrawing) return;

            if (this.activeTool === "select" && this.isSelecting) {
                const sx = Math.min(this.drawStartX, x), sy = Math.min(this.drawStartY, y);
                const sw = Math.abs(x - this.drawStartX) + 1, sh = Math.abs(y - this.drawStartY) + 1;
                this.selection = { x: sx, y: sy, w: sw, h: sh };
                this.renderSelection();
            }
            else if (this.activeTool === "move") {
                if (this.isMovingSelection && this.selection) {
                    const maxX = this.project.width - this.selection.w;
                    const maxY = this.project.height - this.selection.h;
                    this.selection.x = Math.max(0, Math.min(maxX, x - this.moveOffsetX));
                    this.selection.y = Math.max(0, Math.min(maxY, y - this.moveOffsetY));
                    this.renderFrame();
                    if (this.selectionData) {
                        for (let dy = 0; dy < this.selectionData.h; dy++) {
                            for (let dx = 0; dx < this.selectionData.w; dx++) {
                                const tx = this.selection.x + dx, ty = this.selection.y + dy;
                                if (tx >= 0 && tx < this.project.width && ty >= 0 && ty < this.project.height) {
                                    const c = this.selectionData.data[dy * this.selectionData.w + dx];
                                    if (c && c !== "#00000000") {
                                        this.pixelCtx.fillStyle = c;
                                        this.pixelCtx.fillRect(tx, ty, 1, 1);
                                    }
                                }
                            }
                        }
                    }
                    this.renderSelection();
                    this.updateLivePreviewBox();
                } else if (this.isShiftingFrame && this.frameSnapshot) {
                    const dx = x - this.shiftStartX;
                    const dy = y - this.shiftStartY;
                    const w = this.project.width, h = this.project.height;
                    const frame = this.getCurrentFrame();
                    if (frame) {
                        for (let py = 0; py < h; py++) {
                            for (let px = 0; px < w; px++) {
                                const srcX = (px - dx + w * 1000) % w;
                                const srcY = (py - dy + h * 1000) % h;
                                frame.data[py * w + px] = this.frameSnapshot[srcY * w + srcX];
                            }
                        }
                        this.renderAll();
                    }
                }
            }
            else if (this.activeTool === "pencil") {
                this.drawLine(this.lastDrawX, this.lastDrawY, x, y, this.currentColor, this.penSize, this.pencilShape);
                this.lastDrawX = x;
                this.lastDrawY = y;
                this.renderAll();
            }
            else if (this.activeTool === "eraser") {
                this.drawLine(this.lastDrawX, this.lastDrawY, x, y, "#00000000", this.eraserSize, this.eraserShape);
                this.lastDrawX = x;
                this.lastDrawY = y;
                this.renderAll();
            }
            else if (this.activeTool === "shader") {
                this.applyShader(x, y);
                this.renderAll();
            }
            else if (this.activeTool === "spray") {
                this.applySpray(x, y, this.currentColor);
                this.renderAll();
            }
            else if (["line", "rect", "circle"].includes(this.activeTool)) {
                this.previewCtx.clearRect(0, 0, this.project.width, this.project.height);
                this.previewCtx.fillStyle = this.currentColor;
                if (this.activeTool === "line") this._prevLine(this.drawStartX, this.drawStartY, x, y);
                else if (this.activeTool === "rect") this._prevRect(this.drawStartX, this.drawStartY, x, y);
                else if (this.activeTool === "circle") this._prevCircle(this.drawStartX, this.drawStartY, x, y);
            }
        };

        const onUp = (e) => {
            if (this.isPanning) {
                this.isPanning = false;
                viewport.style.cursor = "";
                return;
            }
            if (!this.isDrawing) return;
            this.isDrawing = false;

            const { x, y } = this.screenToGrid(e.clientX, e.clientY);
            this.previewCtx.clearRect(0, 0, this.project.width, this.project.height);

            if (this.activeTool === "select") {
                this.isSelecting = false;
                const sx = Math.min(this.drawStartX, x), sy = Math.min(this.drawStartY, y);
                const sw = Math.max(1, Math.abs(x - this.drawStartX) + 1);
                const sh = Math.max(1, Math.abs(y - this.drawStartY) + 1);
                this.selection = { x: sx, y: sy, w: sw, h: sh };
                this.renderSelection();
            }
            else if (this.activeTool === "move") {
                if (this.isMovingSelection) {
                    this.isMovingSelection = false;
                    if (this.selectionData) this.stampSelection();
                    else this.renderAll();
                } else if (this.isShiftingFrame) {
                    this.isShiftingFrame = false;
                    this.frameSnapshot = null;
                    this.renderAll();
                    if (window.app) window.app.updateTimelineView();
                }
            }
            else if (this.activeTool === "line") {
                this.pushHistory();
                this.drawLine(this.drawStartX, this.drawStartY, x, y, this.currentColor, this.lineWidth, this.lineCap);
                this.renderAll();
            }
            else if (this.activeTool === "rect") {
                this.pushHistory();
                this.drawRectangle(this.drawStartX, this.drawStartY, x, y, this.currentColor, this.rectFillMode === "fill", this.rectBorderWidth);
                this.renderAll();
            }
            else if (this.activeTool === "circle") {
                this.pushHistory();
                this.drawEllipse(this.drawStartX, this.drawStartY, x, y, this.currentColor, this.circleFillMode === "fill", this.circleBorderWidth);
                this.renderAll();
            }

            if (window.app) window.app.updateTimelineView();
        };

        // Smooth zoom to cursor
        viewport.addEventListener("wheel", (e) => {
            e.preventDefault();
            const before = this.screenToGrid(e.clientX, e.clientY);
            const delta = e.deltaY < 0 ? 2 : -2;
            this.setZoom(this.zoom + delta);
            const after = this.screenToGrid(e.clientX, e.clientY);
            viewport.scrollLeft += (after.x - before.x) * this.zoom;
            viewport.scrollTop += (after.y - before.y) * this.zoom;
        }, { passive: false });

        this.wrapper.addEventListener("mousedown", onDown);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);

        viewport.addEventListener("touchstart", (e) => {
            if (e.touches.length === 1) {
                const t = e.touches[0];
                onDown({ clientX: t.clientX, clientY: t.clientY, button: 0, preventDefault: () => {} });
            }
        }, { passive: false });

        window.addEventListener("touchmove", (e) => {
            if (e.touches.length === 1) {
                const t = e.touches[0];
                onMove({ clientX: t.clientX, clientY: t.clientY });
            }
        }, { passive: false });

        window.addEventListener("touchend", () => onUp({ clientX: 0, clientY: 0 }));
    }

    startFrameShift(x, y) {
        const frame = this.getCurrentFrame();
        if (!frame) return;
        this.pushHistory();
        this.isShiftingFrame = true;
        this.frameSnapshot = [...frame.data];
        this.shiftStartX = x;
        this.shiftStartY = y;
    }

    _prevLine(x0, y0, x1, y1) {
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        const lw = Math.max(1, this.lineWidth || 1);
        const off = Math.floor(lw / 2);

        while (true) {
            this.previewCtx.fillRect(x0 - off, y0 - off, lw, lw);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    _prevRect(x0, y0, x1, y1) {
        const nX = Math.min(x0, x1), xX = Math.max(x0, x1), nY = Math.min(y0, y1), xY = Math.max(y0, y1);
        const fill = this.rectFillMode === "fill";
        const bw = Math.max(1, this.rectBorderWidth || 1);

        for (let y = nY; y <= xY; y++) {
            for (let x = nX; x <= xX; x++) {
                const isEdge = (x < nX + bw || x > xX - bw || y < nY + bw || y > xY - bw);
                if (fill || isEdge) this.previewCtx.fillRect(x, y, 1, 1);
            }
        }
    }

    _prevCircle(x0, y0, x1, y1) {
        const nX = Math.min(x0, x1), xX = Math.max(x0, x1), nY = Math.min(y0, y1), xY = Math.max(y0, y1);
        const rx = (xX - nX) / 2, ry = (xY - nY) / 2, cx = nX + rx, cy = nY + ry;
        const fill = this.circleFillMode === "fill";
        const bw = Math.max(1, this.circleBorderWidth || 1);
        const inRx = Math.max(0, rx - bw), inRy = Math.max(0, ry - bw);

        for (let y = nY; y <= xY; y++) {
            for (let x = nX; x <= xX; x++) {
                const d = ((x - cx) / (rx || 1)) ** 2 + ((y - cy) / (ry || 1)) ** 2;
                if (d <= 1.05) {
                    if (fill) {
                        this.previewCtx.fillRect(x, y, 1, 1);
                    } else {
                        const inD = inRx > 0 && inRy > 0 ? (((x - cx) / inRx) ** 2 + ((y - cy) / inRy) ** 2) : 0;
                        if (inD >= 1.0 || inRx <= 0 || inRy <= 0) this.previewCtx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
    }

    // --- Color conversions ---
    hexToRgba(hex) {
        if (!hex || hex === "#00000000" || hex === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
        hex = hex.replace("#", "");
        if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
        if (hex.length === 6) return { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16), a: 255 };
        if (hex.length === 8) return { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16), a: parseInt(hex.substr(6, 2), 16) };
        return { r: 0, g: 0, b: 0, a: 255 };
    }

    rgbToHex(r, g, b) {
        const h = (c) => ("0" + Math.max(0, Math.min(255, c)).toString(16)).slice(-2);
        return `#${h(r)}${h(g)}${h(b)}`;
    }

    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, l };
    }

    hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }
}

window.pixelEditor = new PixelEditor();
