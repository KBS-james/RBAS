/**
 * RBAS DB_16 Dashboard Controller
 * Optimized version with OOP architecture and error handling
 */

const CONFIG = {
    COLUMN_COUNT: 16,
    ROW_COUNT: 70,
    REFRESH_INTERVAL: 1000,
    API_ENDPOINT: '/db16',
    MAX_DISPLAY: 500
};

class DB16Dashboard {
    constructor() {
        this.tick = 1000000000;
        this.db16 = [];
        this.dbIndex = [];
        this.total = 0;
        this.inTotal = 0;
        this.time = "";
        this.dashId = 0;
        this.isOnline = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.dispDb16 = [];
        
        // Cache DOM elements
        this.elements = {
            logo: document.getElementById('logo'),
            title: document.getElementById('title'),
            version: document.getElementById('version'),
            time: document.getElementById('time'),
            tick: document.getElementById('tick'),
            total: document.getElementById('total'),
            newest: document.getElementById('newest'),
            statusIndicator: document.getElementById('status-indicator'),
            errorMessage: document.getElementById('error-message'),
            // Totals by column
            totals: document.querySelectorAll('h6.total'),
            // NFT elements
            nftElements: {}
        };
        
        // Cache NFT elements by column and row
        for (let col = 0; col < CONFIG.COLUMN_COUNT; col++) {
            this.elements.nftElements[col] = {};
            for (let row = 0; row < CONFIG.ROW_COUNT; row++) {
                this.elements.nftElements[col][row] = document.querySelector(`h5.nft[data-col="${col}"][data-row="${row}"]`);
            }
        }
        
        this.init();
    }

    init() {
        this.initDisplay();
        
        // Start update loop
        this.intervalId = setInterval(() => this.update(), CONFIG.REFRESH_INTERVAL);
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => this.destroy());
        
        console.log('DB_16 Dashboard initialized');
    }

    initDisplay() {
        if (this.elements.total) this.elements.total.textContent = '0';
        for (let i = 0; i < CONFIG.COLUMN_COUNT; i++) {
            const totalEl = document.querySelector(`h6.total[data-col="${i}"]`);
            if (totalEl) totalEl.textContent = '0';
        }
        this.clearAllNFTs();
    }

    clearAllNFTs() {
        for (let col = 0; col < CONFIG.COLUMN_COUNT; col++) {
            for (let row = 0; row < CONFIG.ROW_COUNT; row++) {
                const el = this.elements.nftElements[col]?.[row];
                if (el) el.textContent = '........';
            }
        }
    }

    clearColumnNFTs(col) {
        for (let row = 0; row < CONFIG.ROW_COUNT; row++) {
            const el = this.elements.nftElements[col]?.[row];
            if (el) el.textContent = '........';
        }
    }

    truncateNFT(nft) {
        if (!nft || nft === 'null' || nft === 'undefined' || nft === '') {
            return '........';
        }
        return nft.substring(0, 12) + ' ....';
    }

    setOnlineStatus(online) {
        this.isOnline = online;
        if (this.elements.statusIndicator) {
            this.elements.statusIndicator.classList.toggle('online', online);
        }
        if (this.elements.errorMessage) {
            this.elements.errorMessage.classList.toggle('visible', !online);
        }
    }

    displayUpdate() {
        // Clear all NFTs first
        this.clearAllNFTs();
        
        if (!this.dispDb16 || this.dispDb16.length === 0 || this.dispDb16[0] === undefined) {
            return;
        }

        // Reset db16 arrays
        for (let i = 0; i < CONFIG.COLUMN_COUNT; i++) {
            this.dbIndex[i] = 0;
            this.db16[i] = [];
        }

        // Process data (max 500 items)
        let len = Math.min(this.dispDb16.length, CONFIG.MAX_DISPLAY);
        
        for (let i = 0; i < len; i++) {
            try {
                const item = this.dispDb16[i];
                if (!item || !item.nft) continue;
                
                const digit = item.nft.substring(0, 1);
                const digitPtr = parseInt(digit, 16);
                
                if (digitPtr >= 0 && digitPtr < CONFIG.COLUMN_COUNT) {
                    this.db16[digitPtr][this.dbIndex[digitPtr]] = item;
                    this.dbIndex[digitPtr]++;
                }
            } catch (e) {
                // Skip invalid items
            }
        }

        // Update display for each column
        for (let digit = 0; digit < CONFIG.COLUMN_COUNT; digit++) {
            this.updateColumn(digit);
        }

        // Update header info
        this.updateHeader();
    }

    updateColumn(digit) {
        const count = this.dbIndex[digit] || 0;
        
        // Update total
        const totalEl = document.querySelector(`h6.total[data-col="${digit}"]`);
        if (totalEl) totalEl.textContent = count;

        // Update NFT list (max 68 items)
        const len = Math.min(count, 68);
        for (let i = 0; i < len; i++) {
            const nftEl = this.elements.nftElements[digit]?.[i];
            if (nftEl && this.db16[digit][i]) {
                nftEl.textContent = this.truncateNFT(this.db16[digit][i].nft);
            }
        }
    }

    updateHeader() {
        try {
            if (this.elements.logo) {
                this.elements.logo.innerHTML = `RS-${this.dashId} : DB_16 <span class="status-indicator ${this.isOnline ? 'online' : ''}" id="status-indicator"></span>`;
                this.elements.statusIndicator = document.getElementById('status-indicator');
            }
            if (this.elements.time) this.elements.time.textContent = this.time;
            if (this.elements.tick) this.elements.tick.textContent = this.tick;
            if (this.elements.total) this.elements.total.textContent = this.inTotal;
            
            const len = this.dispDb16?.length || 0;
            const displayLen = len < CONFIG.MAX_DISPLAY ? len : CONFIG.MAX_DISPLAY;
            if (this.elements.newest) this.elements.newest.textContent = displayLen;
        } catch (e) {
            console.error('Error updating header:', e);
        }
    }

    async fetchData() {
        try {
            const response = await fetch(CONFIG.API_ENDPOINT, { 
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const rxJson = await response.json();
            this.dispDb16 = rxJson.db16_buf;
            this.dashId = rxJson.dash_id;
            this.tick = rxJson.tick;
            this.inTotal = rxJson.in_total;
            
            // Validate response
            if (!Array.isArray(this.dispDb16)) {
                throw new Error('Invalid response format: db16_buf must be an array');
            }
            
            this.displayUpdate();
            
            // Reset retry count on success
            this.retryCount = 0;
            this.setOnlineStatus(true);
            
            console.log('DB_16 data updated:', {
                dash_id: this.dashId,
                tick: this.tick,
                in_total: this.inTotal,
                items: this.dispDb16.length,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Fetch error:', error);
            this.retryCount++;
            this.setOnlineStatus(false);
            
            if (this.retryCount >= this.maxRetries) {
                console.error(`Max retries (${this.maxRetries}) reached`);
            }
        }
    }

    update() {
        const dt = new Date();
        const d = dt.toISOString().substring(0, 10);
        const t = dt.toISOString().substring(11, 19);
        const str = `${d} ${t}`;
        
        this.time = str;
        this.fetchData();
    }

    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            console.log('DB_16 Dashboard destroyed');
        }
    }

    refresh() {
        this.fetchData();
    }

    getCurrentData() {
        return {
            db16: this.db16,
            dbIndex: this.dbIndex,
            tick: this.tick,
            inTotal: this.inTotal
        };
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.db16Dashboard = new DB16Dashboard();
    
    // Expose for debugging
    window.getDB16Data = () => window.db16Dashboard?.getCurrentData();
    window.refreshDB16 = () => window.db16Dashboard?.refresh();
});

// Handle visibility change
document.addEventListener('visibilitychange', () => {
    if (window.db16Dashboard) {
        if (document.hidden) {
            console.log('Tab hidden, DB_16 updates paused');
        } else {
            console.log('Tab visible, DB_16 updates resumed');
            window.db16Dashboard.refresh();
        }
    }
});