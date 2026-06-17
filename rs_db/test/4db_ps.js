// db tester 
// sim ps gen ps_request to test db
  

"use strict";

const fs = require("fs");
const ip = require("ip");
const crypto = require("crypto");
const ws = require("ws"); 
const par = JSON.parse(fs.readFileSync("par.json"));
const db_id = par.rs_id;
const ps_total = par.ps_total; 
const ts_total = par.ts_total; 

let time = "";
let tick = 1000000000;
let ps_request = [];  
let ps_result = {};   
let disp_ptr = 0;
let sys_disp = [];
let state = "initializing";
let disp_row = 30; 
let db_link = " ... ";
let db_rx = 0;
let db_tx = 0;
let db_ip = "";
let ws_db = null;
let need_send = false; 

// Track time boundary for structural validation checks
let last_count_check = 0;
// Track initial process chains from day data file
let ps_init_day_data = [];

function init() {
    for (let i = 0; i < disp_row; i++) sys_disp[i] = {};
    load_request_from_file();
    connect_db();
    
    // Check to send ps_request once every 10ms
    setInterval(send_ps, 10);
}

function load_request_from_file() {
    try {
        // Requirement: Load data from ps_init_day.json 
        if (fs.existsSync("ps_init_day.json")) {
            try {
                let dayData = JSON.parse(fs.readFileSync("ps_init_day.json", "utf8"));
                if (Array.isArray(dayData)) {
                    ps_init_day_data = dayData;
                } else if (typeof dayData === "object" && dayData !== null) {
                    ps_init_day_data = Object.values(dayData);
                } else {
                    ps_init_day_data = [dayData];
                }
            } catch (err) {
                ps_init_day_data = [];
            }
        }

        if (fs.existsSync("exchange/ps_request.json")) {
            let data = JSON.parse(fs.readFileSync("exchange/ps_request.json", "utf8"));
            let incoming = Array.isArray(data) ? data : [];
            
            const now = Date.now();
            // Only check ps_total count and structural compliance every 5 seconds
            if (now - last_count_check >= 5000 || ps_request.length === 0) {
                last_count_check = now;
                
                if (incoming.length !== ps_total) {
                    if (incoming.length > ps_total) {
                        incoming = incoming.slice(0, ps_total);
                    } else {
                        while (incoming.length < ps_total) {
                            incoming.push({
                                ps_id: incoming.length,
                                ps_thread: 0,
                                tick: tick,
                                ps_chain: "",
                                ps_next_chain: "",
                                ts_request: []
                            });
                        }
                    }
                }
                
                for (let i = 0; i < ps_total; i++) {
                    if (!incoming[i] || typeof incoming[i] !== "object") {
                        incoming[i] = { ps_id: i, ps_thread: 0, tick: tick, ps_chain: "", ps_next_chain: "", ts_request: [] };
                    }
                    incoming[i].ps_id = i;
                    
                    if (!incoming[i].ts_request || !Array.isArray(incoming[i].ts_request)) {
                        incoming[i].ts_request = [];
                    }
                    
                    if (incoming[i].ts_request.length !== ts_total) {
                        if (incoming[i].ts_request.length > ts_total) {
                            incoming[i].ts_request = incoming[i].ts_request.slice(0, ts_total);
                        } else {
                            while (incoming[i].ts_request.length < ts_total) {
                                let ts_id = incoming[i].ts_request.length;
                                incoming[i].ts_request.push({
                                    ts_id: ts_id,
                                    ts_thread: 0,
                                    service: "input",
                                    ts_chain: "",
                                    ts_next_chain: "",
                                    nft: ""
                                });
                            }
                        }
                    }
                }
                ps_request = incoming;
            } else {
                // Outside the 5-second check, safely merge variables without mutating array layout lengths
                if (incoming.length > 0) {
                    for (let i = 0; i < ps_request.length; i++) {
                        if (incoming[i]) {
                            ps_request[i].tick = incoming[i].tick || ps_request[i].tick;
                        }
                    }
                }
            }
        }
        if (ps_request[0] && ps_request[0].tick) {
            tick = ps_request[0].tick;
        }
    } catch (e) {
        state = "error_reading_file";
    }
}

function generate_next_request() {
    state = "generating_request";
    load_request_from_file(); 

    tick++;

    for (let i = 0; i < ps_request.length; i++) {
        ps_request[i].tick = tick;
        
        if (ps_request[i].ps_next_chain) {
            ps_request[i].ps_chain = ps_request[i].ps_next_chain;
        } else {
            // Requirement: Fallback to leading 8 digits/characters of data from ps_init_day.json
            if (ps_init_day_data && ps_init_day_data[i] !== undefined) {
                ps_request[i].ps_chain = String(ps_init_day_data[i]).substring(0, 8);
            } else {
                ps_request[i].ps_chain = crypto.createHash("sha256").update(`${par.seed_hash}.${tick}.${i}`).digest("hex").substring(0, 16);
            }
        }

        ps_request[i].ps_thread = (ps_request[i].ps_thread || 0) + 1;
        
        let next_ps_pwd = `${tick + 1}.${i}.${ps_request[i].ps_thread + 1}`;
        ps_request[i].ps_next_chain = crypto.createHash("sha256").update(next_ps_pwd).digest("hex").substring(0, 16);
        
        ps_request[i].ts_request = ps_request[i].ts_request.map((req, idx) => {
            if (typeof req !== "object" || req === null) {
                req = { ts_id: idx, ts_thread: 0, service: "input", ts_chain: "", ts_next_chain: "", nft: "" };
            }
            req.ts_id = idx;
            req.ts_thread = (req.ts_thread || 0) + 1;
            req.service = (req.service === "input") ? "query" : "input";
            
            if (req.ts_next_chain) {
                req.ts_chain = req.ts_next_chain;
            } else {
                req.ts_chain = crypto.createHash("sha256").update(`${par.seed_hash}.${tick}.${i}.${idx}`).digest("hex").substring(0, 16);
            }

            if (req.service === "input") {
                let input_str = `${req.ts_chain}${ps_request[i].ps_thread}${i}${req.ts_id}`;
                req.nft = crypto.createHash("sha256").update(input_str).digest("hex");
                req.ts_next_chain = req.nft.substring(0, 8);
            } else {
                req.ts_next_chain = req.ts_chain;
            }
            
            return req;
        });
    }

    // Save ps_request to exchange/ps_request.json after each generation
    try {
        fs.writeFileSync("exchange/ps_request.json", JSON.stringify(ps_request, null, 4));
    } catch (e) {
        state = "error_writing_file";
    }

    need_send = true; 
}

function send_ps() {
    if (!need_send) return;

    if (db_link === "conn" && ws_db && ws_db.readyState === ws.OPEN) {
        if (ps_request && ps_request.length > 0) {
            try {
                state = "sending_request";
                for (let i = 0; i < ps_request.length; i++) {
                    ws_db.send(JSON.stringify(ps_request[i]));
                    db_tx++;
                }
                need_send = false; 
            } catch (err) {
                state = "transmission_error";
            }
        }
    } else {
        state = "waiting_for_connection";
    }
}

async function connect_db() {
    const port = par.db_ps_port[db_id];
    db_ip = par.rs_ip_array[db_id] + port;
    ws_db = new ws(db_ip);

    ws_db.onopen = function () {
        db_link = "conn";
        state = "connected";
        generate_next_request();
    };

    ws_db.onmessage = function (event) {
        try {
            ps_result = JSON.parse(event.data);
            db_rx++;
            db_link = "conn";
            state = "result_received";
            generate_next_request();
        } catch (e) {
            state = "parse_result_error";
            need_send = true; 
        }
    };

    ws_db.onclose = function () {
        setTimeout(function () {
            db_link = " ... ";
            state = "disconnected";
            connect_db();
        }, 1000);
    };

    ws_db.onerror = function () {
        setTimeout(function () {
            db_link = " ... ";
            state = "connection_error";
        }, 1000);
    };
}

function display() {
    const d = new Date();
    const str = "" + d;
    if (time !== str.substring(4, 24)) {
        time = str.substring(4, 24);
    }
    
    disp_ptr = d.getSeconds() % 30;
    
    sys_disp[disp_ptr] = { time, state, tick, db_link, db_tx, db_rx };
    sys_disp[(disp_ptr + 1) % 30] = {};

    console.clear();
    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|");
    console.log("\x1b[1;31m 4db_ps reactive test : \x1b[1;32m " + time + "\x1b[1;31m dynamic loop \x1b[1;37m");
    
    const status_summary = { db_ip, db_tx, db_rx, tick, ps_total, ts_total, state, disp_ptr, need_send };
    console.table({ status_summary });
    console.log("\n\x1b[1;34m sys_disp (Modulo 30 Ring History Buffer), disp_ptr = \x1b[1;37m" + disp_ptr);
    console.table(sys_disp);

    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|");
    console.log("\n\x1b[1;34m ps_request batch array structural context \x1b[1;32m  db_ip = \x1b[1;37m" + db_ip);
    console.table(ps_request); 
    
    if (ps_request[0] && ps_request[0].ts_request) {
        console.log("\x1b[1;32m ts_request contents breakdown for ps_id [0]: \x1b[1;37m");
        console.table(ps_request[0].ts_request);
    }

    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|");
    console.log("\n\x1b[1;34m ps_result metadata mapping \x1b[1;37m");
    if (Array.isArray(ps_result)) {
        console.table(ps_result);
    } else {
        console.table([ps_result]);
    }
    console.log("\n");
}

init();
setInterval(display, 1000);