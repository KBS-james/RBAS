/**
 * RBAS DB Sync Dashboard Controller
 * Optimized version with OOP architecture and error handling
 */

const CONFIG = {
    RS_COUNT: 9,
    DISP_ROW: 30,
    REFRESH_INTERVAL: 1000,
    API_ENDPOINT: '/db_sync',
    TICK_THRESHOLD: 1000000001
};

class DBDashboard {
    constructor() {
        this.rsId = 0;
        this.tick = 1000000000;
        this.time = '.';
        this.status = '- - - - - - - - -';
        this.rsSummary = { tick: this.tick, status: this.status };
        this.dashId = 0;
        this.dispPtr = 0;
        this.isOnline = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        // Cache DOM elements
        this.elements = {
            logo: document.getElementById('logo'),
            rsId: document.getElementById('rs_id'),
            version: document.getElementById('version'),
            time: document.getElementById('time'),
            chain: document.getElementById('chain'),
            nextChain: document.getElementById('next_chain'),
            block: document.getElementById('block'),
            rsTick: document.getElementById('rs_tick'),
            status: document.getElementById('status'),
            rsInTotal: document.getElementById('rs_in_total'),
            rsInErr: document.getElementById('rs_in_err'),
            rsQTotal: document.getElementById('rs_q_total'),
            rsQErr: document.getElementById('rs_q_err'),
            statusIndicator: document.getElementById('status-indicator'),
            errorMessage: document.getElementById('error-message'),
            // DB status elements
            dbTicks: document.querySelectorAll('.db_tick'),
            blocks: document.querySelectorAll('.block'),
            dbInTotals: document.querySelectorAll('.db_in_total'),
            dbInErrs: document.querySelectorAll('.db_in_err'),
            dbQTotals: document.querySelectorAll('.db_q_total'),
            dbQErrs: document.querySelectorAll('.db_q_err'),
            // Log elements (cached by row)
            logElements: {}
        };
        
        // Cache log elements by row
        for (let row = 0; row < CONFIG.DISP_ROW; row++) {
            this.elements.logElements[row] = {
                time: document.querySelector(`h7.time[data-row="${row}"]`),
                tick: document.querySelector(`h7.tick[data-row="${row}"]`),
                status: document.querySelector(`h7.status[data-row="${row}"]`),
                inTotal: document.querySelector(`h7.in_total[data-row="${row}"]`),
                qTotal: document.querySelector(`h7.q_total[data-row="${row}"]`),
                inErr: document.querySelector(`h7.in_err[data-row="${row}"]`),
                qErr: document.querySelector(`h7.q_err[data-row="${row}"]`),
                rs1Hash: document.querySelector(`h7.rs1_hash[data-row="${row}"]`),
                rs2Hash: document.querySelector(`h7.rs2_hash[data-row="${row}"]`),
                rs3Hash: document.querySelector(`h7.rs3_hash[data-row="${row}"]`),
                rs4Hash: document.querySelector(`h7.rs4_hash[data-row="${row}"]`),
                rs5Hash: document.querySelector(`h7.rs5_hash[data-row="${row}"]`),
                rs6Hash: document.querySelector(`h7.rs6_hash[data-row="${row}"]`),
                rs7Hash: document.querySelector(`h7.rs7_hash[data-row="${row}"]`),
                rs8Hash: document.querySelector(`h7.rs8_hash[data-row="${row}"]`),
                rs9Hash: document.querySelector(`h7.rs9_hash[data-row="${row}"]`),
                chain: document.querySelector(`h7.chain[data-row="${row}"]`),
                nextChain: document.querySelector(`h7.next_chain[data-row="${row}"]`)
            };
        }
        
        this.init();
    }

    init() {
        // Initialize display
        this.clearAllRows();
        
        // Start update loop
        this.intervalId = setInterval(() => this.update(), CONFIG.REFRESH_INTERVAL);
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => this.destroy());
        
        console.log('DB Dashboard initialized');
    }

    clearAllRows() {
        for (let i = 0; i < CONFIG.DISP_ROW; i++) {
            this.clearRow(i);
        }
    }

    clearRow(rowIndex) {
        const log = this.elements.logElements[rowIndex];
        if (!log) return;
        
        Object.values(log).forEach(el => {
            if (el) el.textContent = '.';
        });
    }

    formatTime(date) {
        const d = date.toISOString().substring(0, 10);
        const t = date.toISOString().substring(11, 19);
        return `${d} ${t}`;
    }

    truncateString(str, length = 6) {
        if (!str || str === 'null' || str === 'undefined' || str === '') {
            return '.';
        }
        return str.substring(0, length) + ' ..';
    }

    truncateHash(str, length = 8) {
        if (!str || str === 'null' || str === 'undefined' || str === '') {
            return '.';
        }
        return str.substring(0, length) + ' ...';
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

    displayLog() {
        const log = this.elements.logElements[this.dispPtr];
        if (!log) return;

        const summary = this.rsSummary;
        const dbSummary = summary.db_summary?.[this.rsId];
        
        if (!dbSummary) return;

        // Update current row
        if (log.time) log.time.textContent = this.time.substring(12, 21);
        if (log.tick) log.tick.textContent = this.tick;
        if (log.status) log.status.textContent = summary.status;
        if (log.inTotal) log.inTotal.textContent = dbSummary.ledger?.in_total ?? '.';
        if (log.qTotal) log.qTotal.textContent = dbSummary.ledger?.q_total ?? '.';
        if (log.inErr) log.inErr.textContent = dbSummary.ledger?.in_err ?? '.';
        if (log.qErr) log.qErr.textContent = dbSummary.ledger?.q_err ?? '.';
        if (log.chain) log.chain.textContent = this.truncateString(dbSummary.chain);
        if (log.nextChain) log.nextChain.textContent = this.truncateString(dbSummary.next_chain);

        // Update all 9 RS hashes
        for (let i = 0; i < 9; i++) {
            const hashEl = log[`rs${i+1}Hash`];
            if (hashEl && summary.db_summary?.[i]) {
                hashEl.textContent = this.truncateHash(summary.db_summary[i].hash);
            }
        }

        // Calculate next pointer and clear it
        const seconds = parseInt(this.time.substring(17, 19)) || 0;
        this.dispPtr = seconds % CONFIG.DISP_ROW;
        this.clearRow(this.dispPtr);
    }

    displayUpdate() {
        if (!this.rsSummary || !this.rsSummary.db_summary) {
            console.warn('No data available for display update');
            return;
        }

        this.rsId = this.rsSummary.rs_id ?? 0;
        this.tick = this.rsSummary.tick ?? 0;

        // Update header info
        if (this.elements.logo) {
            this.elements.logo.innerHTML = `RS-${this.dashId} : DB_Sync <span class="status-indicator ${this.isOnline ? 'online' : ''}" id="status-indicator"></span>`;
            this.elements.statusIndicator = document.getElementById('status-indicator');
        }
        
        if (this.elements.rsTick) this.elements.rsTick.textContent = this.tick;
        if (this.elements.status) this.elements.status.textContent = this.rsSummary.status;

        // Clear all rows if tick is invalid
        if (this.tick <= CONFIG.TICK_THRESHOLD) {
            this.clearAllRows();
            return;
        }

        const dbSummary = this.rsSummary.db_summary[this.rsId];
        if (!dbSummary) return;

        // Update main display
        if (this.elements.chain) this.elements.chain.textContent = dbSummary.chain?.substring(0, 16) ?? '.';
        if (this.elements.nextChain) this.elements.nextChain.textContent = dbSummary.next_chain?.substring(0, 16) ?? '.';
        if (this.elements.block) {
            const hash = dbSummary.hash ?? '';
            this.elements.block.textContent = hash.substring(0, 32) + ' ' + hash.substring(32, 64);
        }
        
        if (this.elements.rsInTotal) this.elements.rsInTotal.textContent = dbSummary.ledger?.in_total ?? '.';
        if (this.elements.rsInErr) this.elements.rsInErr.textContent = dbSummary.ledger?.in_err ?? '.';
        if (this.elements.rsQTotal) this.elements.rsQTotal.textContent = dbSummary.ledger?.q_total ?? '.';
        if (this.elements.rsQErr) this.elements.rsQErr.textContent = dbSummary.ledger?.q_err ?? '.';

        // Update each DB status (9 DBs)
        for (let i = 0; i < CONFIG.RS_COUNT; i++) {
            const db = this.rsSummary.db_summary[i];
            if (!db) continue;

            const dbTickEl = document.querySelector(`h6.db_tick[data-db="${i}"]`);
            const blockEl = document.querySelector(`h6.block[data-db="${i}"]`);
            const inTotalEl = document.querySelector(`h6.db_in_total[data-db="${i}"]`);
            const inErrEl = document.querySelector(`h6.db_in_err[data-db="${i}"]`);
            const qTotalEl = document.querySelector(`h6.db_q_total[data-db="${i}"]`);
            const qErrEl = document.querySelector(`h6.db_q_err[data-db="${i}"]`);

            if (dbTickEl) dbTickEl.textContent = db.tick ?? '.';
            if (blockEl) blockEl.textContent = this.truncateHash(db.hash, 10);
            if (inTotalEl) inTotalEl.textContent = db.ledger?.in_total ?? '.';
            if (inErrEl) inErrEl.textContent = db.ledger?.in_err ?? '.';
            if (qTotalEl) qTotalEl.textContent = db.ledger?.q_total ?? '.';
            if (qErrEl) qErrEl.textContent = db.ledger?.q_err ?? '.';
        }

        // Update log display
        this.displayLog();
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
            this.rsSummary = rxJson.rs_summary;
            this.dashId = rxJson.dash_id;
            
            // Validate response
            if (!this.rsSummary || !this.rsSummary.db_summary) {
                throw new Error('Invalid response format: missing db_summary');
            }
            
            this.displayUpdate();
            
            // Reset retry count on success
            this.retryCount = 0;
            this.setOnlineStatus(true);
            
            console.log('DB data updated:', {
                dash_id: this.dashId,
                rs_id: this.rsId,
                tick: this.tick,
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
        
        if (this.time !== str) {
            this.time = str;
            if (this.elements.time) {
                this.elements.time.textContent = this.time;
            }
            this.fetchData();
        }
    }

    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            console.log('DB Dashboard destroyed');
        }
    }

    refresh() {
        this.fetchData();
    }

    getCurrentData() {
        return this.rsSummary;
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dbDashboard = new DBDashboard();
    
    // Expose for debugging
    window.getDBData = () => window.dbDashboard?.getCurrentData();
    window.refreshDB = () => window.dbDashboard?.refresh();
});

// Handle visibility change
document.addEventListener('visibilitychange', () => {
    if (window.dbDashboard) {
        if (document.hidden) {
            console.log('Tab hidden, DB updates paused');
        } else {
            console.log('Tab visible, DB updates resumed');
            window.dbDashboard.refresh();
        }
    }
});