// dash_tester - simulate 9 rs servers 
// send sync.json every 1 second
// wss connect to dash at rs_dash_port + i + i * 100
// Tick is calculated based on current UTC time
// Console output updates every 1 second

const crypto = require("crypto");
const fs = require("fs");
const tickModule = require("./tickModule.js");

// Get current tick based on current UTC time using tickModule
function getCurrentTick() {
    const now = new Date();
    const tick = tickModule.dateToTick(now);
    return tick;
}

// Load configuration
let par;
try {
    par = JSON.parse(fs.readFileSync("par.json"));
} catch (e) {
    console.error("Error loading par.json:", e);
    // Create default config
    par = {
        rs_id: 0,
        ps_total: 1000,
        ts_total: 1000,
        ps_skip: 30,
        ts_skip: 999,
        sync_dash_port: [8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008],
        version: "1.0"
    };
    console.log("Using default configuration");
}

const id = par.rs_id;
const ps_total = par.ps_total || 1000;
const ts_total = par.ts_total || 1000;
const ps_skip = par.ps_skip || 30;
const ts_skip = par.ts_skip || 999;

// Get initial tick from current time
let tick = getCurrentTick();
let ps_thread = 0;
let ts_thread = 0;
let time = "";
let chain = "b7829550dedb85bd";
let next_chain = "ba2482535c95b23f";
let gen_dash_sync_cnt = 0;
let dash_rx = [];
let dash_tx = [];
let rs_summary = {};
let dash_connection = [];
let dash_req = [];
let ps_result = [];
let ts_result_array = [];
let ts_ledger_array = [];
let ps_ledger_array = [];
let init_nft = [];
let ledger = {};
let result = {};
let ts_id = 0;
let result_id = "";
let service = "input";
let status = "0 0 0 0 0 0 0 0 0";
let db_summary = {};
let ps_ledger = {};
let hash = "";
let rs_id = 0;
let dash_sync = [];
let wss = [];
let state = 0;
let loop = 0;
let nft_ptr = 0;
let db_ptr = 0;
let path = "";
let activePorts = [];

// Initialize arrays
for (let i = 0; i < 9; i++) {
    dash_connection[i] = " ----";
    dash_rx[i] = 0;
    dash_tx[i] = 0;
    dash_req[i] = {};
}

// Create directories if they don't exist
const dirs = ["exchange", "ps_result", "ledger"];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// WebSocket server for each RS
for (let i = 0; i < 9; i++) {
    const port_rs_dash = par.sync_dash_port ? par.sync_dash_port[i] : 8000 + i;
    activePorts.push(port_rs_dash);
    
    try {
        wss[i] = new (require("ws").Server)({ port: port_rs_dash });
        
        wss[i].on("connection", function (webSocket) {
            const wsIndex = i;
            
            webSocket.on("message", function (message) {
                try {
                    const input = JSON.parse(message);
                    const rsId = input.rs_id;
                    dash_req[rsId] = input;
                    wss[rsId] = webSocket;
                    dash_connection[rsId] = " conn";
                    dash_rx[rsId]++;
                } catch (e) {
                    // Silent error
                }
            });

            webSocket.on("close", function () {
                dash_connection[wsIndex] = " ----";
            });
            
            webSocket.on("error", function (err) {
                // Silent error
            });
        });
        
        console.log(`✓ WebSocket server RS${i} listening on port ${port_rs_dash}`);
    } catch (e) {
        console.error(`✗ Failed to start WebSocket server RS${i} on port ${port_rs_dash}:`, e.message);
    }
}

function disp() {
    const d = new Date();
    const str = d.toString();
    time = str.substring(4, 24);
    
    // Clear console and move cursor to top
    console.clear();
    
    // Header
    console.log("\x1b[1;36m" + "=".repeat(110) + "\x1b[0m");
    console.log(`\x1b[1;35m RBAS DASH SYNC SIMULATOR - 9 RS Servers \x1b[1;32m${time}\x1b[1;33m v${par.version || "1.0"} \x1b[0m`);
    console.log("\x1b[1;36m" + "=".repeat(110) + "\x1b[0m");
    
    // Active Ports Display
    console.log("\x1b[1;33m Active WebSocket Ports:\x1b[0m");
    let portStr = "";
    for (let i = 0; i < activePorts.length; i++) {
        const status = dash_connection[i] === " conn" ? "🟢" : "⚫";
        portStr += ` ${status} RS${i}:${activePorts[i]} `;
        if ((i + 1) % 5 === 0) portStr += "\n";
    }
    console.log(portStr);
    
    // Current tick info using tickModule
    const tickTimeStr = tickModule.tickToISOString(tick);
    console.log("\n\x1b[1;33m" + "-".repeat(110) + "\x1b[0m");
    console.log(`\x1b[1;33m Current Tick: \x1b[1;37m${tick} \x1b[1;33m| UTC Time: \x1b[1;37m${tickTimeStr}\x1b[0m`);
    console.log(`\x1b[1;33m State: \x1b[1;37m${state} \x1b[1;33m| Loop: \x1b[1;37m${loop} \x1b[1;33m| PS Thread: \x1b[1;37m${ps_thread} \x1b[1;33m| TS Thread: \x1b[1;37m${ts_thread}\x1b[0m`);
    console.log("\x1b[1;33m" + "-".repeat(110) + "\x1b[0m");
    
    // Dash connections
    console.log("\n\x1b[1;32m RS Connection Status:\x1b[0m");
    let connStr = "";
    for (let i = 0; i < 9; i++) {
        const statusIcon = dash_connection[i] === " conn" ? "🟢" : "⚫";
        connStr += ` ${statusIcon} RS${i}:${dash_connection[i]} `;
    }
    console.log(connStr);
    
    // Dash RX/TX counts
    console.log("\n\x1b[1;32m RS Statistics (RX/TX):\x1b[0m");
    for (let i = 0; i < 9; i++) {
        process.stdout.write(` RS${i}: ${String(dash_rx[i]).padStart(6)}/${String(dash_tx[i]).padStart(6)}  `);
        if ((i + 1) % 4 === 0) console.log();
    }
    console.log();
    
    // Dash sync status
    console.log("\n\x1b[1;32m Last Dash Sync:\x1b[0m");
    if (dash_sync.length > 0) {
        const lastSync = dash_sync[0];
        const syncTimeStr = tickModule.tickToISOString(lastSync?.tick || tick);
        console.log(`   Tick: ${lastSync?.tick || tick} | Time: ${syncTimeStr}`);
        console.log(`   Chain: ${lastSync?.chain || chain.substring(0, 16)}...`);
        console.log(`   Next:  ${lastSync?.next_chain || next_chain.substring(0, 16)}...`);
    }
    
    // Ledger summary
    console.log("\n\x1b[1;32m Ledger Summary:\x1b[0m");
    console.log(`   In Total: ${ledger.in_total || 0} | In Err: ${ledger.in_err || 0}`);
    console.log(`   Q Total: ${ledger.q_total || 0} | Q Err: ${ledger.q_err || 0}`);
    
    // Chain info
    console.log("\n\x1b[1;32m Chain Info:\x1b[0m");
    console.log(`   Current Chain: ${chain.substring(0, 16)}...`);
    console.log(`   Next Chain:    ${next_chain.substring(0, 16)}...`);
    
    // Footer
    console.log("\n\x1b[1;36m" + "=".repeat(110) + "\x1b[0m");
    console.log("\x1b[1;90m Press Ctrl+C to stop | Updates every 1 second | Listening on ports: " + activePorts.join(", ") + "\x1b[0m");
}

function init() {
    // Update tick to current time
    tick = getCurrentTick();
    
    for (let i = 0; i < 9; i++) {
        rs_id = i;
        dash_sync[i] = { tick, tickTime: tickModule.tickToISOString(tick), chain, next_chain, rs_id };
    }
    
    for (let i = 0; i < ps_total; i = i + ps_skip) {
        ps_ledger_array[i] = ledger;
        ts_ledger_array[i] = [];
        ts_result_array[i] = [];
        
        for (let j = 0; j < ts_total; j = j + ts_skip) {
            ts_ledger_array[i][j] = ledger;
            const ts_ledger = ts_ledger_array[i][j];
            result = {};
            ts_id = j;
            const ts_chain = "";
            const ts_next_chain = "";
            ts_result_array[i][j] = { ts_id, ts_thread, ts_chain, ts_next_chain, ts_ledger, result };
            const dao = "" + 2 * i + "." + j;
            nft = crypto.createHash("sha256").update(dao).digest("hex");
            init_nft[i] = { nft, tick, tickTime: tickModule.tickToISOString(tick), dao };
        }
    }
}

function gen_dash_sync() {
    // Update tick to current time
    tick = getCurrentTick();
    
    const pwd = "" + chain + tick;
    chain = dash_sync[0]?.next_chain || chain;
    hash = crypto.createHash("sha256").update(pwd).digest("hex");
    next_chain = hash.substring(0, 16);
    
    for (let i = 0; i < 9; i++) {
        rs_id = i;
        dash_sync[i] = { tick, tickTime: tickModule.tickToISOString(tick), chain, next_chain, rs_id };
    }
    
    try {
        fs.writeFileSync("exchange/dash_sync.json", JSON.stringify(dash_sync, null, 2));
    } catch (e) {
        // Silent error
    }
    gen_dash_sync_cnt++;
}

let ptr = 0;
let db_disp = [];
init();

async function dash_test_rs_end() {
    // Update tick to current time at the start of each cycle
    tick = getCurrentTick();
    
    switch (state) {
        case 0:
            loop++;
            const in_total = loop;
            const q_total = loop;
            const in_err = loop;
            const q_err = loop;
            ledger = { in_total, q_total, in_err, q_err };
            state++;
            break;

        case 1:
            gen_dash_sync();
            status = "0 0 0 0 0 0 0 0 0";
            rs_summary = { rs_id, tick,  status, db_summary };
            try {
                fs.writeFileSync("exchange/rs_summary.json", JSON.stringify(rs_summary, null, 2));
            } catch (e) {
                // Silent error
            }
            state++;
            break;

        case 2:
            for (let i = 0; i < 9; i++) {
                const db_id = i;
                db_summary[i] = { db_id, tick, hash, chain, next_chain, ledger };
            }
            status = "- - - - - - - - -";
            rs_summary = { rs_id, tick, status, db_summary };
            try {
                fs.writeFileSync("exchange/rs_summary.json", JSON.stringify(rs_summary, null, 2));
            } catch (e) {
                // Silent error
            }
            state++;
            break;

        case 3:
            ps_thread++;
            ts_thread++;

            for (let i = 0; i < ps_total; i = i + ps_skip) {
                if (ledger) ledger.in_total = (ledger.in_total || 0) + 1;
                ts_result_array[i] = [];
                
                for (let j = 0; j < ts_total; j = j + ts_skip) {
                    ts_id = j;
                    if (ts_ledger_array[i] && ledger) ts_ledger_array[i][j] = { ...ledger };
                    const result_id_str = "" + tick + "." + i + "." + j;
                    const nft = crypto.createHash("sha256").update(result_id_str).digest("hex");
                    const serviceStr = "input";
                    const resultObj = { nft, service: serviceStr, result_id: result_id_str };
                    const ts_ledger = ts_ledger_array[i]?.[j] || {};
                    const ts_chain = "";
                    const ts_next_chain = nft.substring(0, 16);
                    ts_result_array[i][j] = { ts_id, ts_thread, ts_chain, ts_next_chain, ts_ledger, result: resultObj };
                }
                
                if (ps_ledger_array[i]) {
                    ps_ledger_array[i] = { ...ledger, ps_thread };
                }
                const ps_id = i;
                const ps_chain = chain;
                const ps_next_chain = next_chain;
                const ps_ledger_data = ps_ledger_array[i] || {};
                const ts_result = ts_result_array[i] || [];
                ps_result[i] = { tick, ps_id, ps_thread, ps_chain, ps_next_chain, ps_ledger: ps_ledger_data, ts_result };

                const file_name = `ps_result/ps_result_${i}.json`;
                try {
                    fs.writeFileSync(file_name, JSON.stringify(ps_result[i], null, 2));
                } catch (e) {
                    // Silent error
                }
            }
            state++;
            break;

        case 4:
            for (let i = 0; i < ps_total; i++) {
                for (let j = 0; j < ts_total; j++) {
                    if (ts_ledger_array[i] && ledger) {
                        ts_ledger_array[i][j] = JSON.parse(JSON.stringify(ledger));
                        ts_ledger_array[i][j].ts_thread = i;
                    }
                }
            }
            state++;
            break;

        case 5:
            const ledger_file_name = "ledger/ps_ledger.json";
            try {
                fs.writeFileSync(ledger_file_name, JSON.stringify(ps_ledger_array, null, 2));
            } catch (e) {
                // Silent error
            }
            state++;
            break;

        case 6:
            const dbDisp = [];
            for (let i = 0; i < 500; i++) {
                const pwd = "." + loop + ptr;
                const nft = crypto.createHash("sha256").update(pwd).digest("hex");
                dbDisp[i] = { nft };
                ptr++;
                if (ptr >= 1000) ptr = ptr - 923;
            }
            try {
                fs.writeFileSync("exchange/db_disp.json", JSON.stringify(dbDisp, null, 2));
            } catch (e) {
                // Silent error
            }
            state++;
            break;

        case 7:
            const newNft = [];
            for (let i = 0; i < 7; i++) {
                const dao = "8." + i ;
                pwd = dao + tick
                nft = crypto.createHash("sha256").update(pwd).digest("hex");
                newNft[i] = { nft, tick,  dao };
                newNft[i].db_ptr = db_ptr;
                db_ptr++;
            }
            try {
                fs.writeFileSync("exchange/new_nft.json", JSON.stringify(newNft, null, 2));
            } catch (e) {
                // Silent error
            }
            state++;
            break;

        case 8:
            for (let i = 0; i < ps_total; i = i + ps_skip) {
                const file_name = `ledger/ts_ledger_${i}.json`;
                try {
                    if (ts_ledger_array[i]) {
                        fs.writeFileSync(file_name, JSON.stringify(ts_ledger_array[i], null, 2));
                    }
                } catch (e) {
                    // Silent error
                }
            }
            state++;
            break;

        case 9:
            for (let i = 0; i < 9; i++) {
                if (dash_connection[i] === " conn" && wss[i]) {
                    try {
                        const currentTick = getCurrentTick();
                        const syncData = { 
                            ...dash_sync[i], 
                            tick: currentTick,
                            tickTime: tickModule.tickToISOString(currentTick)
                        };
                        wss[i].send(JSON.stringify(syncData));
                        dash_tx[i]++;
                    } catch (e) {
                        // Silent error
                    }
                }
            }
            state = 0;
            break;
    }
    
    // Update console display every second
    disp();
}

// Run every 1 second
setInterval(dash_test_rs_end, 1000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.clear();
    console.log("\n\x1b[1;33m" + "=".repeat(60) + "\x1b[0m");
    console.log("\x1b[1;31m SHUTTING DOWN... \x1b[0m");
    console.log("\x1b[1;33m" + "=".repeat(60) + "\x1b[0m");
    console.log(`\x1b[1;32m Final Statistics:\x1b[0m`);
    console.log(`   Total Loops: ${loop}`);
    console.log(`   Total Dash Sync Generated: ${gen_dash_sync_cnt}`);
    console.log(`   Final Tick: ${tick} (${tickModule.tickToISOString(tick)})`);
    console.log(`   Active Ports: ${activePorts.join(", ")}`);
    console.log("");
    
    for (let i = 0; i < wss.length; i++) {
        if (wss[i]) {
            wss[i].close();
        }
    }
    process.exit(0);
});