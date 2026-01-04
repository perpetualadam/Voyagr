/**
 * AR Navigation Module
 * Uses WebXR for augmented reality navigation overlays
 * Falls back to camera-based overlay if WebXR not available
 * 
 * @module modules/ar-navigation
 */

/**
 * ARNavigator class - Handles AR-based navigation overlays
 */
export class ARNavigator {
    constructor(config = {}) {
        this.isSupported = this.checkSupport();
        this.isActive = false;
        this.xrSession = null;
        this.xrReferenceSpace = null;
        this.gl = null;
        this.currentInstruction = null;
        this.currentHeading = 0;
        this.currentPosition = null;

        // Fallback mode uses camera + canvas overlay
        this.fallbackMode = config.fallbackMode !== false;
        this.videoElement = null;
        this.canvasElement = null;
        this.canvasContext = null;
        this.animationFrameId = null;

        // Callbacks
        this.onError = config.onError || console.error;
        this.onStatusChange = config.onStatusChange || (() => { });
    }

    /**
     * Check if WebXR AR is supported
     */
    checkSupport() {
        if ('xr' in navigator) {
            return true;
        }
        console.log('[AR] WebXR not available in this browser');
        return false;
    }

    /**
     * Check if immersive-ar session is available
     */
    async isARSupported() {
        if (!this.isSupported) return false;

        try {
            const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
            console.log('[AR] immersive-ar supported:', isSupported);
            return isSupported;
        } catch (err) {
            console.log('[AR] Error checking AR support:', err);
            return false;
        }
    }

    /**
     * Start AR session
     * @returns {Object} Result with success status
     */
    async start() {
        // First try WebXR
        if (this.isSupported) {
            const arSupported = await this.isARSupported();
            if (arSupported) {
                return this.startWebXR();
            }
        }

        // Fallback to camera overlay mode
        if (this.fallbackMode) {
            return this.startFallbackMode();
        }

        return {
            success: false,
            error: 'AR not supported on this device',
            fallback: false
        };
    }

    /**
     * Start WebXR immersive-ar session
     */
    async startWebXR() {
        try {
            this.onStatusChange('requesting');

            // Request immersive-ar session
            this.xrSession = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['dom-overlay', 'hit-test'],
                domOverlay: { root: document.getElementById('arOverlay') }
            });

            this.isActive = true;
            this.onStatusChange('active');

            // Set up session end handler
            this.xrSession.addEventListener('end', () => {
                this.isActive = false;
                this.xrSession = null;
                this.onStatusChange('ended');
                console.log('[AR] WebXR session ended');
            });

            // Get reference space
            this.xrReferenceSpace = await this.xrSession.requestReferenceSpace('local-floor');

            console.log('[AR] WebXR session started successfully');
            return { success: true, mode: 'webxr' };

        } catch (err) {
            console.error('[AR] Failed to start WebXR:', err);
            this.onError(err);

            // Try fallback
            if (this.fallbackMode) {
                return this.startFallbackMode();
            }

            return { success: false, error: err.message };
        }
    }

    /**
     * Start fallback camera overlay mode
     * Uses getUserMedia for camera and canvas for overlays
     */
    async startFallbackMode() {
        try {
            this.onStatusChange('requesting-camera');

            // Request camera permission
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',  // Rear camera
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });

            // Create AR overlay container if not exists
            let arContainer = document.getElementById('arContainer');
            if (!arContainer) {
                arContainer = document.createElement('div');
                arContainer.id = 'arContainer';
                arContainer.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 9999;
                    background: black;
                `;
                document.body.appendChild(arContainer);
            }

            // Create video element for camera feed
            this.videoElement = document.createElement('video');
            this.videoElement.id = 'arVideo';
            this.videoElement.srcObject = stream;
            this.videoElement.setAttribute('playsinline', '');
            this.videoElement.setAttribute('autoplay', '');
            this.videoElement.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
            `;
            arContainer.appendChild(this.videoElement);
            await this.videoElement.play();

            // Create canvas for AR overlays
            this.canvasElement = document.createElement('canvas');
            this.canvasElement.id = 'arCanvas';
            this.canvasElement.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
            `;
            arContainer.appendChild(this.canvasElement);

            this.canvasContext = this.canvasElement.getContext('2d');
            this.resizeCanvas();

            // Create close button
            const closeBtn = document.createElement('button');
            closeBtn.id = 'arCloseBtn';
            closeBtn.innerHTML = '✕ Close AR';
            closeBtn.style.cssText = `
                position: absolute;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                border: none;
                border-radius: 25px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                z-index: 10000;
            `;
            closeBtn.onclick = () => this.stop();
            arContainer.appendChild(closeBtn);

            // Create instruction display
            const instructionDiv = document.createElement('div');
            instructionDiv.id = 'arInstruction';
            instructionDiv.style.cssText = `
                position: absolute;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%);
                padding: 15px 25px;
                background: rgba(25, 118, 210, 0.9);
                color: white;
                border-radius: 12px;
                font-size: 18px;
                font-weight: 600;
                text-align: center;
                max-width: 80%;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;
            arContainer.appendChild(instructionDiv);

            // Start render loop
            this.isActive = true;
            this.onStatusChange('active-fallback');
            this.startRenderLoop();

            // Listen for device orientation
            this.startOrientationTracking();

            console.log('[AR] Fallback camera mode started');
            return { success: true, mode: 'fallback' };

        } catch (err) {
            console.error('[AR] Failed to start camera:', err);
            this.onError(err);

            if (err.name === 'NotAllowedError') {
                return { success: false, error: 'Camera permission denied' };
            }

            return { success: false, error: err.message };
        }
    }

    /**
     * Resize canvas to match viewport
     */
    resizeCanvas() {
        if (this.canvasElement) {
            this.canvasElement.width = window.innerWidth;
            this.canvasElement.height = window.innerHeight;
        }
    }

    /**
     * Start device orientation tracking for compass heading
     */
    startOrientationTracking() {
        if ('DeviceOrientationEvent' in window) {
            // Request permission on iOS 13+
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(permission => {
                        if (permission === 'granted') {
                            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
                        }
                    })
                    .catch(console.error);
            } else {
                window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
            }
        }
    }

    /**
     * Handle device orientation event
     */
    handleOrientation(event) {
        // Get compass heading (alpha is compass direction when device is flat)
        if (event.webkitCompassHeading !== undefined) {
            // iOS
            this.currentHeading = event.webkitCompassHeading;
        } else if (event.alpha !== null) {
            // Android - alpha is 0-360, but 0 is where device was at start
            this.currentHeading = 360 - event.alpha;
        }
    }

    /**
     * Start the AR render loop
     */
    startRenderLoop() {
        const render = () => {
            if (!this.isActive) return;

            this.renderAROverlay();
            this.animationFrameId = requestAnimationFrame(render);
        };

        render();
    }

    /**
     * Render AR navigation overlay
     */
    renderAROverlay() {
        if (!this.canvasContext || !this.canvasElement) return;

        const ctx = this.canvasContext;
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (!this.currentInstruction) return;

        // Calculate arrow direction based on turn instruction
        const direction = this.currentInstruction.direction || 'straight';
        const distance = this.currentInstruction.distance || 0;

        // Draw navigation arrow
        this.drawNavigationArrow(ctx, width, height, direction, distance);

        // Update instruction text
        const instructionDiv = document.getElementById('arInstruction');
        if (instructionDiv) {
            const distText = distance > 0 ? `In ${this.formatDistance(distance)} - ` : '';
            instructionDiv.textContent = `${distText}${this.currentInstruction.instruction || 'Follow route'}`;
        }
    }

    /**
     * Draw navigation arrow on canvas
     */
    drawNavigationArrow(ctx, width, height, direction, distance) {
        const centerX = width / 2;
        const centerY = height / 2 - 50;
        const arrowSize = Math.min(width, height) * 0.15;

        ctx.save();
        ctx.translate(centerX, centerY);

        // Rotation based on direction
        const rotations = {
            'straight': 0,
            'slight-right': Math.PI / 6,
            'right': Math.PI / 2,
            'sharp-right': Math.PI * 2 / 3,
            'slight-left': -Math.PI / 6,
            'left': -Math.PI / 2,
            'sharp-left': -Math.PI * 2 / 3,
            'u-turn': Math.PI,
            'destination': 0
        };

        const rotation = rotations[direction] || 0;
        ctx.rotate(rotation);

        // Draw arrow shape
        ctx.beginPath();

        if (direction === 'destination') {
            // Draw destination marker (circle with flag)
            ctx.arc(0, 0, arrowSize * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(76, 175, 80, 0.9)';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Flag emoji
            ctx.font = `${arrowSize * 0.6}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🏁', 0, 0);
        } else {
            // Draw arrow
            ctx.moveTo(0, -arrowSize);
            ctx.lineTo(arrowSize * 0.6, arrowSize * 0.3);
            ctx.lineTo(arrowSize * 0.2, arrowSize * 0.3);
            ctx.lineTo(arrowSize * 0.2, arrowSize);
            ctx.lineTo(-arrowSize * 0.2, arrowSize);
            ctx.lineTo(-arrowSize * 0.2, arrowSize * 0.3);
            ctx.lineTo(-arrowSize * 0.6, arrowSize * 0.3);
            ctx.closePath();

            // Gradient fill
            const gradient = ctx.createLinearGradient(0, -arrowSize, 0, arrowSize);
            gradient.addColorStop(0, 'rgba(25, 118, 210, 0.95)');
            gradient.addColorStop(1, 'rgba(13, 71, 161, 0.95)');
            ctx.fillStyle = gradient;
            ctx.fill();

            // White border
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Glow effect
            ctx.shadowColor = 'rgba(25, 118, 210, 0.5)';
            ctx.shadowBlur = 20;
        }

        ctx.restore();

        // Draw distance if close
        if (distance > 0 && distance < 500) {
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 3;
            ctx.strokeText(this.formatDistance(distance), centerX, centerY + arrowSize + 40);
            ctx.fillText(this.formatDistance(distance), centerX, centerY + arrowSize + 40);
        }
    }

    /**
     * Format distance for display
     */
    formatDistance(meters) {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        }
        return `${Math.round(meters)} m`;
    }

    /**
     * Update current navigation instruction
     */
    updateInstruction(instruction) {
        this.currentInstruction = instruction;
    }

    /**
     * Update current GPS position
     */
    updatePosition(lat, lon) {
        this.currentPosition = { lat, lon };
    }

    /**
     * Stop AR session
     */
    async stop() {
        this.isActive = false;

        // Stop WebXR session
        if (this.xrSession) {
            await this.xrSession.end();
            this.xrSession = null;
        }

        // Stop fallback mode
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        if (this.videoElement) {
            const stream = this.videoElement.srcObject;
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            this.videoElement.remove();
            this.videoElement = null;
        }

        if (this.canvasElement) {
            this.canvasElement.remove();
            this.canvasElement = null;
        }

        const arContainer = document.getElementById('arContainer');
        if (arContainer) {
            arContainer.remove();
        }

        // Remove orientation listener
        window.removeEventListener('deviceorientation', this.handleOrientation);

        this.onStatusChange('stopped');
        console.log('[AR] Session stopped');
    }

    /**
     * Check if AR is currently active
     */
    isARActive() {
        return this.isActive;
    }
}

// Create and export singleton instance
let arNavigatorInstance = null;

export function getARNavigator(config = {}) {
    if (!arNavigatorInstance) {
        arNavigatorInstance = new ARNavigator(config);
    }
    return arNavigatorInstance;
}

export default ARNavigator;
