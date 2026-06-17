const CONFIG = {
    RS_COUNT: 9,
    DISP_ROW: 30,
    REFRESH_INTERVAL: 1000,
    API_ENDPOINT: '/rs_sync',
    TICK_THRESHOLD: 1000000001
};

class RBASDashboard {
    constructor() {
        this.time = '';
        this.ptr = 0;
        this.dashDisp = null;
        this.isOnline = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        this.elements = {
            rbasTime: document.getElementById('rbas_time'),
            logo: document.getElementById('logo'),
            startTime: document.getElementById('start_time'),
            statusIndicator: document.getElementById('status-indicator'),
            errorMessage: document.getElementById('error-message'),
            ticks: Array.from({length: CONFIG.RS_COUNT}, (_, i) => 
                document.getElementById(`tick-${i}`)
            )
        };
        
        this.logElements = {};
        for (let rs = 0; rs < CONFIG.RS_COUNT; rs++) {
            this.logElements[rs] = {
                tick: document.querySelectorAll(`h6.rs_tick[data-rs="${rs}"]`),
                chain: document.querySelectorAll(`h6.chain[data-rs="${rs}"]`),
                nextChain: document.querySelectorAll(`h6.next_chain[data-rs="${rs}"]`)
            };
        }
        
        this.init();
    }

    init() {
        this.clearAllRows();
        this.intervalId = setInterval(() => this.update(), CONFIG.REFRESH_INTERVAL);
        window.addEventListener('beforeunload', () => this.destroy());
        console.log('RBAS Dashboard initialized');
    }

    clearAllRows() {
        for (let row = 0; row < CONFIG.DISP_ROW; row++) {
            this.clearRow(row);
        }
    }

    clearRow(rowIndex) {
        for (let rs = 0; rs < CONFIG.RS_COUNT; rs++) {
            const cells = this.logElements[rs];
            if (cells.tick[rowIndex]) cells.tick[rowIndex].textContent = '.';
            if (cells.chain[rowIndex]) cells.chain[rowIndex].textContent = '.';
            if (cells.nextChain[rowIndex]) cells.nextChain[rowIndex].textContent = '.';
        }
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
        return str.substring(0, length) + ' ...';
    }

    setOnlineStatus(online) {
        this.isOnline = online;
        if (this.elements.statusIndicator) {
            this.elements.statusIndicator.classList.toggle('online', online);
            this.elements.statusIndicator.classList.toggle('warning', !online && this.retryCount > 0);
        }
        if (this.elements.errorMessage) {
            this.elements.errorMessage.classList.toggle('visible', !online);
        }
    }

    updateTickDisplay(rsIndex, tick) {
        const tickEl = this.elements.ticks[rsIndex];
        if (!tickEl) return;

        const oldTick = tickEl.textContent;
        tickEl.textContent = tick;

        if (oldTick !== String(tick)) {
            tickEl.classList.remove('updated');
            void tickEl.offsetWidth;
            tickEl.classList.add('updated');
            setTimeout(() => tickEl.classList.remove('updated'), 500);
        }
    }

    updateLogRow(rsIndex, rowIndex, data) {
        const cells = this.logElements[rsIndex];
        if (!cells) return;

        const tick = data?.tick ?? '.';
        const chain = this.truncateString(data?.chain);
        const nextChain = this.truncateString(data?.next_chain);

        if (cells.tick[rowIndex]) cells.tick[rowIndex].textContent = tick;
        if (cells.chain[rowIndex]) cells.chain[rowIndex].textContent = chain;
        if (cells.nextChain[rowIndex]) cells.nextChain[rowIndex].textContent = nextChain;
    }

    displayUpdate() {
        if (!this.dashDisp || !this.dashDisp.dash_sync) {
            console.warn('No data available for display update');
            return;
        }

        let hasValidData = false;
        for (let i = 0; i < CONFIG.RS_COUNT; i++) {
            const sync = this.dashDisp.dash_sync[i];
            const tick = sync?.tick ?? 0;
            
            this.updateTickDisplay(i, tick);

            if (tick <= CONFIG.TICK_THRESHOLD) {
                this.clearRow(i);
            } else {
                hasValidData = true;
            }
        }

        const now = new Date();
        this.ptr = now.getSeconds() % CONFIG.DISP_ROW;

        for (let i = 0; i < CONFIG.RS_COUNT; i++) {
            const sync = this.dashDisp.dash_sync[i];
            this.updateLogRow(i, this.ptr, sync);
        }

        const nextPtr = (this.ptr + 1) % CONFIG.DISP_ROW;
        this.clearRow(nextPtr);

        return hasValidData;
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
            
            this.dashDisp = await response.json();
            
            if (!this.dashDisp.dash_sync || !Array.isArray(this.dashDisp.dash_sync)) {
                throw new Error('Invalid response format: missing dash_sync array');
            }
            
            if (this.dashDisp.dash_id !== undefined) {
                this.elements.logo.innerHTML = `RS-${this.dashDisp.dash_id} : RS_SYNC <span class="status-indicator online" id="status-indicator"></span>`;
                this.elements.statusIndicator = document.getElementById('status-indicator');
            }
            
            if (this.dashDisp.start_time) {
                this.elements.startTime.textContent = `RBAS start_time : ${this.dashDisp.start_time}`;
            }
            
            const hasData = this.displayUpdate();
            
            this.retryCount = 0;
            this.setOnlineStatus(true);
            
            console.log('Data updated:', {
                dash_id: this.dashDisp.dash_id,
                sync_count: this.dashDisp.dash_sync.length,
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
        const timeDisp = this.formatTime(dt);
        
        if (this.time !== timeDisp) {
            this.time = timeDisp;
            if (this.elements.rbasTime) {
                this.elements.rbasTime.textContent = `UTC time : ${timeDisp}`;
            }
            this.fetchData();
        }
    }

    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            console.log('RBAS Dashboard destroyed');
        }
    }

    refresh() {
        this.fetchData();
    }

    getCurrentData() {
        return this.dashDisp;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.rbasDashboard = new RBASDashboard();
    
    window.getRBASData = () => window.rbasDashboard?.getCurrentData();
    window.refreshRBAS = () => window.rbasDashboard?.refresh();
});

document.addEventListener('visibilitychange', () => {
    if (window.rbasDashboard) {
        if (document.hidden) {
            console.log('Tab hidden, updates paused');
        } else {
            console.log('Tab visible, updates resumed');
            window.rbasDashboard.refresh();
        }
    }
});