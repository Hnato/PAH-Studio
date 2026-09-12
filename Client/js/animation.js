/**
 * PAH Animation & Timeline Engine
 * Controls frames, playback loop, FPS timing, onion skinning, and live preview rendering.
 */

class AnimationEngine {
    constructor() {
        this.isPlaying = false;
        this.currentFrameIndex = 0;
        this.fps = 8;
        this.loop = true;
        this.onionSkinEnabled = false;
        this.onionSkinOpacity = 0.35;
        this.lastFrameTime = 0;
        this.animationTimer = null;
        this.onFrameChangeCallback = null;
        this.onTimelineUpdateCallback = null;
    }

    init(project) {
        this.project = project;
        this.fps = project.fps || 8;
        this.currentFrameIndex = 0;
        this.pause();
    }

    getCurrentFrame() {
        if (!this.project || !this.project.frames || this.project.frames.length === 0) return null;
        if (this.currentFrameIndex >= this.project.frames.length) {
            this.currentFrameIndex = this.project.frames.length - 1;
        }
        return this.project.frames[this.currentFrameIndex];
    }

    setCurrentFrameIndex(idx) {
        if (!this.project || !this.project.frames) return;
        if (idx >= 0 && idx < this.project.frames.length) {
            this.currentFrameIndex = idx;
            if (this.onFrameChangeCallback) this.onFrameChangeCallback(this.currentFrameIndex);
        }
    }

    addFrame(afterIndex = null) {
        if (!this.project) return;
        const w = this.project.width;
        const h = this.project.height;
        const newFrame = {
            id: "f_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
            duration: 1,
            data: new Array(w * h).fill("#00000000")
        };

        const targetIdx = afterIndex !== null ? afterIndex + 1 : this.project.frames.length;
        this.project.frames.splice(targetIdx, 0, newFrame);
        this.currentFrameIndex = targetIdx;

        if (this.onTimelineUpdateCallback) this.onTimelineUpdateCallback();
        if (this.onFrameChangeCallback) this.onFrameChangeCallback(this.currentFrameIndex);
        return newFrame;
    }

    duplicateFrame(index = null) {
        if (!this.project || this.project.frames.length === 0) return;
        const srcIdx = index !== null ? index : this.currentFrameIndex;
        const srcFrame = this.project.frames[srcIdx];
        if (!srcFrame) return;

        const newFrame = {
            id: "f_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
            duration: srcFrame.duration || 1,
            data: [...srcFrame.data]
        };

        this.project.frames.splice(srcIdx + 1, 0, newFrame);
        this.currentFrameIndex = srcIdx + 1;

        if (this.onTimelineUpdateCallback) this.onTimelineUpdateCallback();
        if (this.onFrameChangeCallback) this.onFrameChangeCallback(this.currentFrameIndex);
        return newFrame;
    }

    deleteFrame(index = null) {
        if (!this.project || this.project.frames.length <= 1) {
            return false; // Nie usuwamy ostatniej klatki
        }
        const delIdx = index !== null ? index : this.currentFrameIndex;
        this.project.frames.splice(delIdx, 1);

        if (this.currentFrameIndex >= this.project.frames.length) {
            this.currentFrameIndex = this.project.frames.length - 1;
        }

        if (this.onTimelineUpdateCallback) this.onTimelineUpdateCallback();
        if (this.onFrameChangeCallback) this.onFrameChangeCallback(this.currentFrameIndex);
        return true;
    }

    moveFrame(fromIndex, toIndex) {
        if (!this.project || fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= this.project.frames.length || toIndex < 0 || toIndex >= this.project.frames.length) return;

        const [frame] = this.project.frames.splice(fromIndex, 1);
        this.project.frames.splice(toIndex, 0, frame);
        this.currentFrameIndex = toIndex;

        if (this.onTimelineUpdateCallback) this.onTimelineUpdateCallback();
        if (this.onFrameChangeCallback) this.onFrameChangeCallback(this.currentFrameIndex);
    }

    setFps(fps) {
        this.fps = Math.max(1, Math.min(30, fps));
        if (this.project) this.project.fps = this.fps;
        if (this.isPlaying) {
            this.pause();
            this.play();
        }
    }

    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        const interval = 1000 / this.fps;

        this.animationTimer = setInterval(() => {
            if (!this.project || !this.project.frames || this.project.frames.length === 0) return;
            let nextIndex = this.currentFrameIndex + 1;
            if (nextIndex >= this.project.frames.length) {
                if (this.loop) {
                    nextIndex = 0;
                } else {
                    this.pause();
                    return;
                }
            }
            this.setCurrentFrameIndex(nextIndex);
        }, interval);
    }

    pause() {
        this.isPlaying = false;
        if (this.animationTimer) {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
        }
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
        return this.isPlaying;
    }

    stepForward() {
        this.pause();
        if (!this.project || !this.project.frames) return;
        let nextIndex = (this.currentFrameIndex + 1) % this.project.frames.length;
        this.setCurrentFrameIndex(nextIndex);
    }

    stepBackward() {
        this.pause();
        if (!this.project || !this.project.frames) return;
        let prevIndex = (this.currentFrameIndex - 1 + this.project.frames.length) % this.project.frames.length;
        this.setCurrentFrameIndex(prevIndex);
    }

    // Get frames for Onion Skinning
    getOnionSkinFrames() {
        if (!this.onionSkinEnabled || !this.project || this.project.frames.length <= 1) {
            return { prev: null, next: null };
        }
        const prevIdx = this.currentFrameIndex > 0 ? this.currentFrameIndex - 1 : null;
        const nextIdx = this.currentFrameIndex < this.project.frames.length - 1 ? this.currentFrameIndex + 1 : null;

        return {
            prev: prevIdx !== null ? this.project.frames[prevIdx].data : null,
            next: nextIdx !== null ? this.project.frames[nextIdx].data : null
        };
    }
}

window.animationEngine = new AnimationEngine();
