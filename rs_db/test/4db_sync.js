// db_tester - simulate 9 rs_sync servers 
// db_tester - simulate dbio server

"use strict";

const { exec } = require("child_process");
// 1. Import your deterministic tick utility module
const tickModule = require("./tickModule.js");

function syncOperatingSystemClock() {
    const platform = process.platform;

    let command = "";

    if (platform === "win32") {
        // Windows: Start time service and force resync
        command = "net start w32time && w32tm /resync";
    } else if (platform === "darwin") {
        // macOS: Query atomic apple servers
        command = "sudo sntp -sS time.apple.com";
    } else if (platform === "linux") {
        // Linux: Restart systemd-timesyncd daemon
        command = "sudo systemctl restart systemd-timesyncd";
    } else {
        console.error(`❌ Unsupported operating system platform: ${platform}`);
        return;
    }

    console.log(`Executing time sync command for ${platform}...`);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Sync Failed: Ensure your Node process has Administrative/Root privileges.`);
            console.error(error.message);
            return;
        }
        if (stderr) console.warn(`Warning: ${stderr}`);
        console.log(`\x1b[1;32m   OS Clock Synchronized Successfully!\x1b[1;37m`);
        console.log(stdout);
    });
}


const crypto = require("crypto");
const fs = require("fs");
const par = JSON.parse(fs.readFileSync("par.json"));
const id = par.rs_id;
const ps_total = par.ps_total;

let tick = 1000000000;
let time = "";
let chain = "b7829550dedb85bd";
let next_chain = "ba2482535c95b23f";
let db_rx = Array(9).fill(0);
let db_tx = Array(9).fill(0);
let db_link = Array(9).fill(" ----");
let db_sync = [];
let dbio_link = "---";
let dbio_tx = 0;
let dbio_rx = 0;
let state = 0;
let loop = 0;
let db_summary = [];
let t_index = 0;
let sys_disp = [];
const disp_row = 30;
let ps_request = [];
let ps_result = [];
let ps_ledger = {};
const dbio_db_port = par.dbio_db_port[id];

function init() {
    // Run the sync
    syncOperatingSystemClock();
    for (let i = 0; i < disp_row; i++) sys_disp[i] = {};
    for (let i = 0; i < 9; i++) {
        db_rx[i] = 0;
        db_tx[i] = 0;
        db_link[i] = " ----";
        const rs_id = i;
        db_summary[i] = {};
        db_sync[i] = { tick, chain, next_chain, rs_id };
        ps_request[i] = {};
        ps_result[i] = {};
    }
    const sync = JSON.parse(fs.readFileSync("exchange/sync.json"));
    
    // Set baseline tick from file, though it will update live during execution loop
    tick = sync.tick; 
    
    const in_total = 0;
    const q_total = 0;
    const in_err = 0;
    const q_err = 0;
    ps_ledger = { in_total, q_total, in_err, q_err };
}

// wss_sync
const wss_sync = [];
for (let i = 0; i < 9; i++) {
    const port_sync_db = par.sync_db_port[i];
    const current_rs_id = i; 

    wss_sync[i] = new (require("ws").Server)({ port: port_sync_db });
    wss_sync[i].on("connection", function (webSocket) {

        webSocket.on("message", function (message) {
            const input = JSON.parse(message);
            const msg_rs_id = input.rs_id; 

            db_summary[msg_rs_id] = input;
            db_link[msg_rs_id] = " conn";
            db_rx[msg_rs_id]++;

            const local_chain = input.chain;
            const local_next_chain = input.next_chain;

            db_sync[msg_rs_id] = { tick, chain: local_chain, next_chain: local_next_chain, rs_id: msg_rs_id };
            webSocket.send(JSON.stringify(db_sync[msg_rs_id]));
            db_tx[msg_rs_id]++;
        });

        webSocket.on("close", function () {
            db_link[current_rs_id] = " ----";
        });
    });
}

// wss dbio
const wss_dbio = new (require("ws").Server)({ port: dbio_db_port });
wss_dbio.on("connection", function (webSocket) {
    dbio_link = "conn";

    webSocket.on("message", function (message) {
        ps_request = JSON.parse(message);
        dbio_rx++;
        ps_result = JSON.parse(JSON.stringify(ps_request));

        for (let i = 0; i < ps_total; i++) {
            if (ps_result[i] !== undefined) {
                if (ps_result[i].ts_request !== undefined) {
                    ps_ledger.in_total++;
                    ps_result[i].ts_result = ps_result[i].ts_request;
                    delete ps_result[i].ts_request;
                    ps_result[i].ps_ledger = ps_ledger;
                }
            }
        }
        webSocket.send(JSON.stringify(ps_result));
        dbio_tx++;
    });

    webSocket.on("close", function () {
        dbio_link = " ....";
    });
});

function disp() {
    const dt = new Date();
    const str = dt.toISOString().substring(11, 19);

    if (time !== str) {
        time = str;
        console.clear();
        console.log("\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|\x1b[1;37m");
        console.log(`\n\x1b[1;35m 4db_test - sync_end - sim all 9 rs_sync servers \x1b[1;32m${time}\x1b[1;33m ${par.version} \x1b[1;37m`);

        let next_index = Number(time.substring(6, 8)); 
        if (next_index >= disp_row) next_index = next_index - 30;
        sys_disp[next_index] = {};

        console.table(sys_disp);
        const d_json = { port_sync_db: par.sync_db_port[id], dbio_db_port, tick, state, loop };
        console.table({ d_json });
        console.log("\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|\x1b[1;37m");
        console.log("\n\x1b[1;32m db_link = \x1b[1;37m");
        console.table({ db_link });
        console.log("\x1b[1;32m rs_servers db_rx = \x1b[1;37m");
        console.table({ db_rx });
        console.log("\x1b[1;32m rs_servers db_tx = \x1b[1;37m");
        console.table({ db_tx });
        console.log("\n\x1b[1;32m db_sync = \x1b[1;37m");
        console.table(db_sync);
        console.log("\n\x1b[1;32m db_summary = \x1b[1;37m");
        console.table(db_summary);
        console.log("\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|\x1b[1;37m");
        console.log("\n\x1b[1;32m dbio interface = \x1b[1;37m");
        const dbio_json = { dbio_db_port, dbio_link, dbio_rx, dbio_tx };
        console.table({ dbio_json });
        console.log("\n\x1b[1;31m ps_request \x1b[1;37m");
        console.table(ps_request);
        console.log("\n\x1b[1;31m ps_result \x1b[1;37m");
        console.table(ps_result);

        sys_disp[t_index] = { time, state, tick, loop };
        t_index = next_index;
    }
}

init();

async function db_test_rs_end() {
    try { 
        // 2. Generate the precise structural ledger tick using true UTC wall-clock time
        tick = tickModule.dateToTick(new Date());
        
        disp(); 
    } catch (e) {
        console.error("Tick Generation Error:", e.message);
    }
    
    loop++;
    // 3. Removed the hardcoded conditional switch logic, as tick calculation is now deterministic.
}

setInterval(db_test_rs_end, 1000);