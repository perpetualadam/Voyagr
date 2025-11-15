/**
 * @file Notifications Service Module - Handles notifications
 * @module modules/services/notifications
 */

/**
 * NotificationsService class - Manages notifications
 * @class NotificationsService
 */
export class NotificationsService {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.position = config.position || 'top-right';
        this.duration = config.duration || 3000;
        this.notifications = [];
        this.maxNotifications = config.maxNotifications || 5;
    }

    /**
     * Show notification
     * @param {string} message - Notification message
     * @param {string} type - Notification type (info/success/warning/error)
     * @param {Object} options - Additional options
     * @returns {string} Notification ID
     */
    show(message, type = 'info', options = {}) {
        if (!this.enabled) return null;

        const id = `notif_${Date.now()}_${Math.random()}`;
        const notification = {
            id,
            message,
            type,
            timestamp: Date.now(),
            duration: options.duration || this.duration,
            action: options.action || null
        };

        this.notifications.push(notification);

        // Limit notifications
        if (this.notifications.length > this.maxNotifications) {
            this.notifications.shift();
        }

        // Auto-dismiss
        if (notification.duration > 0) {
            setTimeout(() => this.dismiss(id), notification.duration);
        }

        return id;
    }

    /**
     * Show info notification
     * @param {string} message - Message
     * @param {Object} options - Options
     * @returns {string} Notification ID
     */
    info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    /**
     * Show success notification
     * @param {string} message - Message
     * @param {Object} options - Options
     * @returns {string} Notification ID
     */
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    /**
     * Show warning notification
     * @param {string} message - Message
     * @param {Object} options - Options
     * @returns {string} Notification ID
     */
    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    /**
     * Show error notification
     * @param {string} message - Message
     * @param {Object} options - Options
     * @returns {string} Notification ID
     */
    error(message, options = {}) {
        return this.show(message, 'error', options);
    }

    /**
     * Dismiss notification
     * @param {string} id - Notification ID
     */
    dismiss(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
    }

    /**
     * Dismiss all notifications
     */
    dismissAll() {
        this.notifications = [];
    }

    /**
     * Get all notifications
     * @returns {Array} All notifications
     */
    getAll() {
        return [...this.notifications];
    }

    /**
     * Enable notifications
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Disable notifications
     */
    disable() {
        this.enabled = false;
    }

    /**
     * Request permission for browser notifications
     * @async
     * @returns {Promise<string>} Permission status
     */
    async requestPermission() {
        if (!('Notification' in window)) {
            console.warn('Browser notifications not supported');
            return 'denied';
        }

        if (Notification.permission === 'granted') {
            return 'granted';
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission;
        }

        return 'denied';
    }

    /**
     * Show browser notification
     * @param {string} title - Notification title
     * @param {Object} options - Notification options
     */
    showBrowserNotification(title, options = {}) {
        if (Notification.permission === 'granted') {
            new Notification(title, options);
        }
    }
}

