/**
 * Google Plus Codes Input Component
 * Provides UI for entering and validating Plus Codes
 */

class GooglePlusCodesInput {
    constructor(service) {
        this.service = service;
        this.inputElement = null;
        this.suggestionsElement = null;
        this.lastInput = '';
    }

    /**
     * Create input field with validation
     * @returns {HTMLElement}
     */
    createInputField() {
        const container = document.createElement('div');
        container.className = 'plus-codes-input-container';
        container.style.marginBottom = '10px';

        // Input field
        this.inputElement = document.createElement('input');
        this.inputElement.type = 'text';
        this.inputElement.placeholder = 'Enter Plus Code (e.g., 8FWC+5X)';
        this.inputElement.className = 'destination-input';
        this.inputElement.style.width = '100%';
        this.inputElement.style.padding = '10px';
        this.inputElement.style.marginBottom = '5px';
        this.inputElement.style.borderRadius = '4px';
        this.inputElement.style.border = '1px solid #ddd';

        // Add input validation
        this.inputElement.addEventListener('input', (e) => this.handleInput(e));
        this.inputElement.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSubmit();
            }
        });

        // Suggestions container
        this.suggestionsElement = document.createElement('div');
        this.suggestionsElement.className = 'plus-codes-suggestions';
        this.suggestionsElement.style.display = 'none';
        this.suggestionsElement.style.maxHeight = '150px';
        this.suggestionsElement.style.overflowY = 'auto';
        this.suggestionsElement.style.backgroundColor = '#f5f5f5';
        this.suggestionsElement.style.borderRadius = '4px';
        this.suggestionsElement.style.marginTop = '5px';

        container.appendChild(this.inputElement);
        container.appendChild(this.suggestionsElement);

        return container;
    }

    /**
     * Handle input changes
     * @private
     */
    handleInput(event) {
        const value = event.target.value.trim().toUpperCase();
        this.lastInput = value;

        if (value.length === 0) {
            this.suggestionsElement.style.display = 'none';
            return;
        }

        // Validate Plus Code format
        if (this.service.isValidCode(value)) {
            this.showValidation(true, 'Valid Plus Code');
        } else if (value.length >= 4) {
            // Show partial validation
            this.showValidation(false, 'Enter at least 6 characters (e.g., 8FWC+5X)');
        }
    }

    /**
     * Show validation feedback
     * @private
     */
    showValidation(isValid, message) {
        this.suggestionsElement.style.display = 'block';
        this.suggestionsElement.innerHTML = `
            <div style="padding: 8px; color: ${isValid ? '#4CAF50' : '#FF9800'}; font-size: 12px;">
                ${isValid ? '✓' : '⚠'} ${message}
            </div>
        `;
    }

    /**
     * Handle form submission
     * @private
     */
    handleSubmit() {
        const code = this.lastInput;
        if (!this.service.isValidCode(code)) {
            this.showValidation(false, 'Invalid Plus Code format');
            return;
        }

        try {
            const result = this.service.decode(code);
            this.onCodeSelected(result);
        } catch (error) {
            this.showValidation(false, `Error: ${error.message}`);
        }
    }

    /**
     * Called when a valid code is selected
     * Override this in parent component
     * @param {object} result - {lat, lon, accuracy, code}
     */
    onCodeSelected(result) {
        console.log('Plus Code selected:', result);
        // This will be overridden by parent component
    }

    /**
     * Get the current input value
     * @returns {string}
     */
    getValue() {
        return this.inputElement ? this.inputElement.value.trim() : '';
    }

    /**
     * Set the input value
     * @param {string} value
     */
    setValue(value) {
        if (this.inputElement) {
            this.inputElement.value = value;
        }
    }

    /**
     * Clear the input
     */
    clear() {
        if (this.inputElement) {
            this.inputElement.value = '';
            this.suggestionsElement.style.display = 'none';
        }
    }

    /**
     * Focus the input
     */
    focus() {
        if (this.inputElement) {
            this.inputElement.focus();
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GooglePlusCodesInput;
}

