// dbio tester - Continuous test client
// Chain Rules:
//   1. Each PS has its own independent ps_thread (increments EVERY time a PS request is sent)
//   2. Each TS has its own independent ts_thread (increments each time that TS is used)
//   3. ps_chain = last ps_next_chain from previous request (updates after each send)
//   4. ts_chain = last ts_next_chain from previous request (updates after each send)

const fs = require("fs");
const ip = require("ip");
const crypto = require("crypto");
const par = JSON.parse(fs.readFileSync("par.json"));
const ws = require("ws");

const ps_total = par.ps_total;
const ts_total = par.ts_total;
const db_id = par.rs_id;

// State variables
let time = "";
let tick = 1000000000;
let ps_request = [];
let ps_result = [];
let sys_disp = [];
let disp_ptr = 0;
let disp_row = 30;
let dbio_link = " ... ";
let dbio_rx = 0;
let dbio_tx = 0;
let dbio_ip = "";

// Independent tracking for each PS and each TS
let cycle_number = 0;
let ps_threads = [];           // Independent ps_thread for each PS (increments EVERY send)
let ts_threads = [];           // Independent ts_thread for each TS within each PS
let ps_chains = [];            // Current ps_chain for each PS (updated from last next_chain)
let ts_chains = [];            // Current ts_chain for each TS within each PS
let ps_next_chains = [];       // Last ps_next_chain for each PS
let ts_next_chains = [];       // Last ts_next_chain for each TS within each PS

// NFT tracking
let created_nfts = [];
let created_nft_count = 0;

// Test generation state
let current_ps_id = 0;
let current_ts_id = 0;
let is_input = true;
let ws_dbio = null;
let waiting_for_response = false;
let test_active = true;
let total_inputs = 0;
let total_queries = 0;
let total_errors = 0;
let last_send_time = 0;

// Mode tracking
let phase = "BATCH_INPUT";
let batch_input_sent = false;
let batch_query_sent = false;
let individual_complete = false;
let individual_step_count = 0;
let total_individual_steps = ps_total * ts_total * 2;

// Load PS init keys
let ps_init_key = [];
try {
    ps_init_key = JSON.parse(fs.readFileSync("ps_init_key.json"));
} catch (e) {
    console.log("Warning: ps_init_key.json not found, using fallback");
}

function get_hash_8chars(data) {
    return crypto.createHash("sha256").update(data).digest("hex").substring(0, 8);
}

function compute_next_chain(current_chain, request_data) {
    const data = current_chain + JSON.stringify(request_data);
    return get_hash_8chars(data);
}

function init() {
    for (let i = 0; i < 30; i++) sys_disp[i] = {};
    reset_record_file();
    initialize_ps_ts_state();
    connect_dbio();
}

function reset_record_file() {
    try {
        if (!fs.existsSync("test_data")) {
            fs.mkdirSync("test_data", { recursive: true });
        }
        // Initialize empty records array
        fs.writeFileSync("test_data/record.json", JSON.stringify({ 
            start_time: new Date().toISOString(),
            cycle_number: cycle_number,
            records: []
        }, null, 2));
        console.log(`\n📝 record.json reset for cycle ${cycle_number}\n`);
    } catch (e) {
        console.log(`⚠️ Could not reset record.json: ${e.message}`);
    }
}

function append_to_record(record_entry) {
    try {
        let existingData = { records: [] };
        if (fs.existsSync("test_data/record.json")) {
            try {
                const content = fs.readFileSync("test_data/record.json", "utf8");
                existingData = JSON.parse(content);
            } catch (e) {
                existingData = { records: [] };
            }
        }
        existingData.records.push(record_entry);
        fs.writeFileSync("test_data/record.json", JSON.stringify(existingData, null, 2));
    } catch (e) {
        console.log(`⚠️ Could not append to record.json: ${e.message}`);
    }
}

function initialize_ps_ts_state() {
    for (let i = 0; i < ps_total; i++) {
        ps_request[i] = null;
        
        // Initialize independent PS state
        if (!ps_threads[i]) ps_threads[i] = 1;
        if (!ps_chains[i]) ps_chains[i] = get_hash_8chars(`${tick}.ps.${i}.start`);
        if (!ps_next_chains[i]) ps_next_chains[i] = "";
        
        // Initialize independent TS state for this PS
        if (!ts_threads[i]) ts_threads[i] = [];
        if (!ts_chains[i]) ts_chains[i] = [];
        if (!ts_next_chains[i]) ts_next_chains[i] = [];
        if (!created_nfts[i]) created_nfts[i] = [];
        
        for (let j = 0; j < ts_total; j++) {
            if (!ts_threads[i][j]) ts_threads[i][j] = 1;
            if (!ts_chains[i][j]) ts_chains[i][j] = get_hash_8chars(`${tick}.ps${i}.ts${j}.start`);
            if (!ts_next_chains[i][j]) ts_next_chains[i][j] = "";
            if (!created_nfts[i][j]) created_nfts[i][j] = null;
        }
    }
    current_ps_id = 0;
    current_ts_id = 0;
    is_input = true;
    individual_step_count = 0;
    individual_complete = false;
}

function generate_nft(ps_id, ts_id, service, thread, current_tick) {
    let pwd = `${par.seed_hash}.${current_tick}.${ps_id}.${ts_id}.${service}.${thread}`;
    return crypto.createHash("sha256").update(pwd).digest("hex");
}

function generate_batch_request(service_type) {
    let batch_ps_request = [];
    
    console.log(`\n📦 Generating BATCH ${service_type.toUpperCase()} request at tick ${tick}\n`);
    
    for (let ps_id = 0; ps_id < ps_total; ps_id++) {
        let ts_request_array = [];
        
        // Use current independent PS state (already updated from previous next_chain)
        let current_ps_chain = ps_chains[ps_id];
        let current_ps_thread = ps_threads[ps_id];
        
        for (let ts_id = 0; ts_id < ts_total; ts_id++) {
            let service = service_type;
            let nft;
            
            // Use current independent TS state (already updated from previous next_chain)
            let current_ts_thread = ts_threads[ps_id][ts_id];
            let current_ts_chain = ts_chains[ps_id][ts_id];
            
            if (service === "query") {
                if (created_nfts[ps_id][ts_id]) {
                    nft = created_nfts[ps_id][ts_id];
                } else {
                    nft = generate_nft(ps_id, ts_id, "input", current_ts_thread, tick - 1);
                }
            } else {
                nft = generate_nft(ps_id, ts_id, "input", current_ts_thread, tick);
                created_nfts[ps_id][ts_id] = nft;
                created_nft_count++;
            }
            
            let ts_request_obj = {
                ts_id: ts_id,
                ts_thread: current_ts_thread,
                ts_chain: current_ts_chain,
                nft: nft,
                service: service
            };
            
            let ts_next_chain = compute_next_chain(current_ts_chain, ts_request_obj);
            
            ts_request_array[ts_id] = {
                ts_id: ts_id,
                ts_thread: current_ts_thread,
                ts_chain: current_ts_chain,
                ts_next_chain: ts_next_chain,
                nft: nft,
                service: service
            };
            
            // Store next_chain for later update
            ts_next_chains[ps_id][ts_id] = ts_next_chain;
        }
        
        let ps_request_obj = {
            ps_id: ps_id,
            ps_thread: current_ps_thread,
            ps_chain: current_ps_chain,
            ts_request: ts_request_array
        };
        
        let ps_next_chain = compute_next_chain(current_ps_chain, ps_request_obj);
        
        batch_ps_request[ps_id] = {
            ps_id: ps_id,
            tick: tick,
            ps_thread: current_ps_thread,
            ps_chain: current_ps_chain,
            ps_next_chain: ps_next_chain,
            ts_request: ts_request_array
        };
        
        // Store next_chain for later update
        ps_next_chains[ps_id] = ps_next_chain;
    }
    
    return batch_ps_request;
}

function update_batch_state_after_send() {
    // Update all PS and TS chains after batch send
    for (let ps_id = 0; ps_id < ps_total; ps_id++) {
        // Update PS chain to the next_chain we just computed
        if (ps_next_chains[ps_id]) {
            ps_chains[ps_id] = ps_next_chains[ps_id];
            ps_threads[ps_id]++;
        }
        
        // Update TS chains for this PS
        for (let ts_id = 0; ts_id < ts_total; ts_id++) {
            if (ts_next_chains[ps_id] && ts_next_chains[ps_id][ts_id]) {
                ts_chains[ps_id][ts_id] = ts_next_chains[ps_id][ts_id];
                ts_threads[ps_id][ts_id]++;
            }
        }
    }
}

function generate_individual_request() {
    let new_ps_request = [];
    let service = is_input ? "input" : "query";
    let nft;
    
    // Use current independent PS state (already updated from previous next_chain)
    let current_ps_chain = ps_chains[current_ps_id];
    let current_ps_thread = ps_threads[current_ps_id];
    
    // Use current independent TS state (already updated from previous next_chain)
    let current_ts_thread = ts_threads[current_ps_id][current_ts_id];
    let current_ts_chain = ts_chains[current_ps_id][current_ts_id];
    
    if (service === "query") {
        if (created_nfts[current_ps_id][current_ts_id]) {
            nft = created_nfts[current_ps_id][current_ts_id];
        } else {
            nft = generate_nft(current_ps_id, current_ts_id, "input", current_ts_thread, tick);
        }
    } else {
        nft = generate_nft(current_ps_id, current_ts_id, "input", current_ts_thread, tick);
        created_nfts[current_ps_id][current_ts_id] = nft;
        created_nft_count++;
    }
    
    let ts_request_obj = {
        ts_id: current_ts_id,
        ts_thread: current_ts_thread,
        ts_chain: current_ts_chain,
        nft: nft,
        service: service
    };
    
    let ts_next_chain = compute_next_chain(current_ts_chain, ts_request_obj);
    
    let ts_request_entry = {
        ts_id: current_ts_id,
        ts_thread: current_ts_thread,
        ts_chain: current_ts_chain,
        ts_next_chain: ts_next_chain,
        nft: nft,
        service: service
    };
    
    let ts_request_array = [];
    ts_request_array[current_ts_id] = ts_request_entry;
    
    let ps_request_obj = {
        ps_id: current_ps_id,
        ps_thread: current_ps_thread,
        ps_chain: current_ps_chain,
        ts_request: ts_request_array
    };
    
    let ps_next_chain = compute_next_chain(current_ps_chain, ps_request_obj);
    
    new_ps_request[current_ps_id] = {
        ps_id: current_ps_id,
        tick: tick,
        ps_thread: current_ps_thread,
        ps_chain: current_ps_chain,
        ps_next_chain: ps_next_chain,
        ts_request: ts_request_array
    };
    
    // Store next_chains for later update
    ps_next_chains[current_ps_id] = ps_next_chain;
    ts_next_chains[current_ps_id][current_ts_id] = ts_next_chain;
    
    return new_ps_request;
}

function update_individual_state_after_send() {
    // CRITICAL: Update PS chain to the next_chain we just computed
    if (ps_next_chains[current_ps_id]) {
        ps_chains[current_ps_id] = ps_next_chains[current_ps_id];
        ps_threads[current_ps_id]++;
    }
    
    // Update TS chain to the next_chain we just computed
    if (ts_next_chains[current_ps_id] && ts_next_chains[current_ps_id][current_ts_id]) {
        ts_chains[current_ps_id][current_ts_id] = ts_next_chains[current_ps_id][current_ts_id];
        ts_threads[current_ps_id][current_ts_id]++;
    }
}

function advance_individual_test_state() {
    is_input = !is_input;
    individual_step_count++;
    
    if (is_input) {
        current_ts_id++;
        
        if (current_ts_id >= ts_total) {
            current_ts_id = 0;
            current_ps_id++;
            
            if (current_ps_id >= ps_total) {
                current_ps_id = 0;
                individual_complete = true;
                console.log(`\n🎉 INDIVIDUAL PHASE COMPLETE!`);
                console.log(`   Steps completed: ${individual_step_count}/${total_individual_steps}`);
                console.log(`   Starting next cycle with BATCH INPUT\n`);
            }
        }
    }
}

async function connect_dbio() {
    let port = par.dbio_db_port[db_id];
    dbio_ip = par.rs_ip_array[db_id] + port;
    ws_dbio = new ws(dbio_ip);
    
    ws_dbio.onopen = function () {
        dbio_link = "conn";
        console.log(`\n✅ Connected to DBIO at ${dbio_ip}\n`);
        waiting_for_response = false;
    };
    
    ws_dbio.onmessage = function (event) {
        dbio_rx++;
        ps_result = JSON.parse(event.data);
        waiting_for_response = false;
        
        let result_stats = { inputs: 0, queries: 0, errors: 0 };
        for (let i = 0; i < ps_result.length; i++) {
            if (ps_result[i] && ps_result[i].ps_ledger) {
                result_stats.inputs += ps_result[i].ps_ledger.in_total || 0;
                result_stats.queries += ps_result[i].ps_ledger.q_total || 0;
                result_stats.errors += (ps_result[i].ps_ledger.in_err || 0) + (ps_result[i].ps_ledger.q_err || 0);
            }
        }
        
        total_inputs += result_stats.inputs;
        total_queries += result_stats.queries;
        total_errors += result_stats.errors;
        
        if (phase === "BATCH_INPUT") {
            console.log(`\n📦 BATCH INPUT RESPONSE RECEIVED at tick ${tick}:`);
            console.log(`   Inputs: ${result_stats.inputs}, Errors: ${result_stats.errors}`);
            
            // Update state after batch send
            update_batch_state_after_send();
            
            // Save complete ps_result to record
            append_to_record({
                timestamp: Date.now(),
                tick: tick,
                cycle: cycle_number,
                phase: "BATCH_INPUT",
                stats: result_stats,
                ps_request: JSON.parse(JSON.stringify(ps_request)), // Deep copy
                ps_result: JSON.parse(JSON.stringify(ps_result)),   // Deep copy
                ps_chains: [...ps_chains],
                ps_threads: [...ps_threads]
            });
            
            phase = "BATCH_QUERY";
            batch_input_sent = false;
            
            console.log(`\n🔄 Next: BATCH QUERY at tick ${tick + 1}\n`);
        } else if (phase === "BATCH_QUERY") {
            console.log(`\n📦 BATCH QUERY RESPONSE RECEIVED at tick ${tick}:`);
            console.log(`   Queries: ${result_stats.queries}, Errors: ${result_stats.errors}`);
            
            // Update state after batch send
            update_batch_state_after_send();
            
            // Save complete ps_result to record
            append_to_record({
                timestamp: Date.now(),
                tick: tick,
                cycle: cycle_number,
                phase: "BATCH_QUERY",
                stats: result_stats,
                ps_request: JSON.parse(JSON.stringify(ps_request)), // Deep copy
                ps_result: JSON.parse(JSON.stringify(ps_result)),   // Deep copy
                ps_chains: [...ps_chains],
                ps_threads: [...ps_threads]
            });
            
            phase = "INDIVIDUAL";
            batch_query_sent = false;
            initialize_ps_ts_state();
            cycle_number++;
            reset_record_file();
            
            console.log(`\n🔄 Starting INDIVIDUAL phase for cycle ${cycle_number} at tick ${tick}\n`);
        } else {
            // Individual request response
            if (ps_result[current_ps_id] && ps_result[current_ps_id].ts_result) {
                let ts_result = ps_result[current_ps_id].ts_result[current_ts_id];
                if (ts_result) {
                    let status = ts_result.result_id === "error" ? "❌" : "✓";
                    let service_type = !is_input ? "INPUT" : "QUERY";
                    let result_msg = ts_result.result_id === "error" ? "FAILED" : (service_type === "INPUT" ? "CREATED" : "FOUND");
                    console.log(`${status} ${service_type} | PS[${current_ps_id}] | TS[${current_ts_id}] | ${result_msg} | Tick: ${tick}`);
                    
                    // Save complete ps_result for individual request
                    append_to_record({
                        timestamp: Date.now(),
                        tick: tick,
                        cycle: cycle_number,
                        phase: "INDIVIDUAL",
                        ps_id: current_ps_id,
                        ts_id: current_ts_id,
                        service: service_type,
                        ps_request: JSON.parse(JSON.stringify(ps_request)), // Deep copy
                        ps_result: JSON.parse(JSON.stringify(ps_result)),   // Deep copy
                        result_id: ts_result.result_id,
                        success: ts_result.result_id !== "error"
                    });
                }
            }
        }
    };
    
    ws_dbio.onclose = function (e) {
        dbio_link = " ... ";
        console.log("\n⚠️ DBIO connection closed. Reconnecting in 1 second...");
        setTimeout(function () {
            connect_dbio();
        }, 1000);
    };
    
    ws_dbio.onerror = function (e) {
        dbio_link = " ... ";
        console.log("\n⚠️ DBIO connection error. Reconnecting in 1 second...");
        setTimeout(function () {
            connect_dbio();
        }, 1000);
    };
}

function send_batch_input() {
    if (waiting_for_response) {
        console.log("⏳ Still waiting for previous response, skipping...");
        return false;
    }
    
    if (dbio_link !== "conn") {
        console.log("⏳ Not connected to DBIO, waiting...");
        return false;
    }
    
    ps_request = generate_batch_request("input");
    
    try {
        ws_dbio.send(JSON.stringify(ps_request));
        dbio_tx++;
        waiting_for_response = true;
        last_send_time = Date.now();
        batch_input_sent = true;
        
        console.log(`\n📦 BATCH INPUT SENT: ALL ${ps_total} PS × ${ts_total} TS at tick ${tick}`);
        console.log(`   PS Chains used: ${ps_chains.map((c, i) => `PS[${i}]=${c}`).join(', ')}`);
        console.log(`   PS Threads used: ${ps_threads.map((t, i) => `PS[${i}]=${t}`).join(', ')}`);
        return true;
    } catch (e) {
        console.log(`❌ Batch input send error: ${e.message}`);
        waiting_for_response = false;
        return false;
    }
}

function send_batch_query() {
    if (waiting_for_response) {
        console.log("⏳ Still waiting for previous response, skipping...");
        return false;
    }
    
    if (dbio_link !== "conn") {
        console.log("⏳ Not connected to DBIO, waiting...");
        return false;
    }
    
    ps_request = generate_batch_request("query");
    
    try {
        ws_dbio.send(JSON.stringify(ps_request));
        dbio_tx++;
        waiting_for_response = true;
        last_send_time = Date.now();
        batch_query_sent = true;
        
        console.log(`\n📦 BATCH QUERY SENT: ALL ${ps_total} PS × ${ts_total} TS at tick ${tick}`);
        console.log(`   PS Chains used: ${ps_chains.map((c, i) => `PS[${i}]=${c}`).join(', ')}`);
        console.log(`   PS Threads used: ${ps_threads.map((t, i) => `PS[${i}]=${t}`).join(', ')}`);
        return true;
    } catch (e) {
        console.log(`❌ Batch query send error: ${e.message}`);
        waiting_for_response = false;
        return false;
    }
}

function send_individual_request() {
    if (waiting_for_response) {
        console.log("⏳ Still waiting for previous response, skipping...");
        return;
    }
    
    if (dbio_link !== "conn") {
        console.log("⏳ Not connected to DBIO, waiting...");
        return;
    }
    
    // Store current state for display
    let before_ps_chain = ps_chains[current_ps_id];
    let before_ps_thread = ps_threads[current_ps_id];
    let before_ts_chain = ts_chains[current_ps_id][current_ts_id];
    let before_ts_thread = ts_threads[current_ps_id][current_ts_id];
    
    ps_request = generate_individual_request();
    
    try {
        ws_dbio.send(JSON.stringify(ps_request));
        dbio_tx++;
        waiting_for_response = true;
        last_send_time = Date.now();
        
        let service_name = is_input ? "INPUT" : "QUERY";
        let step_info = `[${individual_step_count + 1}/${total_individual_steps}]`;
        console.log(`\n📤 ${service_name} ${step_info} | PS[${current_ps_id}] | TS[${current_ts_id}] | Tick: ${tick}`);
        console.log(`   PS: chain=${before_ps_chain} → next=${ps_request[current_ps_id]?.ps_next_chain} | thread=${before_ps_thread} → ${before_ps_thread + 1}`);
        console.log(`   TS: chain=${before_ts_chain} → next=${ps_request[current_ps_id]?.ts_request[current_ts_id]?.ts_next_chain} | thread=${before_ts_thread} → ${before_ts_thread + 1}`);
        
        // Update state immediately after sending (before response)
        update_individual_state_after_send();
        
        advance_individual_test_state();
    } catch (e) {
        console.log(`❌ Send error: ${e.message}`);
        waiting_for_response = false;
    }
}

function display() {
    const d = new Date();
    let str = "" + d;
    if (time != str.substring(4, 24)) {
        time = str.substring(4, 24);
    }
    
    console.clear();
    
    console.log("\n" + "═".repeat(80));
    console.log("  DBIO CONTINUOUS TEST CLIENT - " + time);
    console.log("═".repeat(80));
    
    let this_ip = ip.address();
    console.log("\n📡 CONNECTION STATUS");
    console.log("   ├─ DBIO Server: " + dbio_ip);
    console.log("   ├─ Client IP:   " + this_ip);
    console.log("   ├─ Connection:  " + (dbio_link === "conn" ? "✅ CONNECTED" : "⏳ WAITING..."));
    console.log("   ├─ TX Count:    " + dbio_tx);
    console.log("   └─ RX Count:    " + dbio_rx);
    
    console.log("\n📊 SYSTEM STATISTICS");
    console.log("   ├─ PS Total:      " + ps_total);
    console.log("   ├─ TS Total:      " + ts_total);
    console.log("   ├─ Current Tick:  " + tick);
    console.log("   ├─ Cycle Number:  " + cycle_number);
    console.log("   ├─ NFTs Created:  " + created_nft_count);
    console.log("   ├─ Total Inputs:  " + total_inputs);
    console.log("   ├─ Total Queries: " + total_queries);
    console.log("   └─ Total Errors:  " + total_errors);
    
    if (phase === "BATCH_INPUT") {
        console.log("\n🎯 CURRENT PHASE");
        console.log("   ├─ Phase:       📦 BATCH INPUT (ALL PS × ALL TS)");
        console.log("   ├─ Status:      " + (batch_input_sent ? "⏳ Waiting for response..." : "✅ Ready to send"));
        console.log("   └─ Next:        BATCH QUERY after response");
    } else if (phase === "BATCH_QUERY") {
        console.log("\n🎯 CURRENT PHASE");
        console.log("   ├─ Phase:       📦 BATCH QUERY (ALL PS × ALL TS)");
        console.log("   ├─ Status:      " + (batch_query_sent ? "⏳ Waiting for response..." : "✅ Ready to send"));
        console.log("   └─ Next:        INDIVIDUAL phase after response");
    } else {
        let next_service = is_input ? "INPUT" : "QUERY";
        let percent = Math.floor((individual_step_count / total_individual_steps) * 100);
        let bar_len = 30;
        let filled = Math.floor((percent / 100) * bar_len);
        let bar = "█".repeat(filled) + "░".repeat(bar_len - filled);
        
        console.log("\n🎯 CURRENT PHASE");
        console.log("   ├─ Phase:       🔄 INDIVIDUAL REQUESTS");
        console.log("   ├─ PS ID:       " + current_ps_id + " / " + (ps_total - 1));
        console.log("   ├─ TS ID:       " + current_ts_id + " / " + (ts_total - 1));
        console.log("   ├─ Next:        " + next_service);
        console.log("   ├─ Pattern:     INPUT → QUERY → INPUT → QUERY ...");
        console.log("   └─ Status:      " + (waiting_for_response ? "⏳ Waiting for response..." : "✅ Ready"));
        
        console.log(`\n   ├─ Progress:     ${bar} ${percent}%`);
        console.log(`   └─ Steps:       ${individual_step_count} / ${total_individual_steps}`);
    }
    
    console.log("\n🔗 CURRENT PS STATE (Chain = last NextChain)");
    console.log("   " + "─".repeat(70));
    console.log("   PS ID | PS Thread | PS Chain (current) | Will use for next request");
    console.log("   " + "─".repeat(70));
    for (let i = 0; i < ps_total; i++) {
        let ps_chain = ps_chains[i] || "?";
        console.log(`   ${String(i).padStart(5)} | ${String(ps_threads[i]).padStart(9)} | ${ps_chain.padEnd(18)} | ✓`);
    }
    
    console.log("\n🔗 CURRENT TS STATE (first 3 PS, first 3 TS)");
    console.log("   " + "─".repeat(70));
    console.log("   PS ID | TS ID | TS Thread | TS Chain (current) | Will use for next request");
    console.log("   " + "─".repeat(70));
    for (let i = 0; i < Math.min(3, ps_total); i++) {
        for (let j = 0; j < Math.min(3, ts_total); j++) {
            let ts_chain = (ts_chains[i] && ts_chains[i][j]) || "?";
            let ts_thread = (ts_threads[i] && ts_threads[i][j]) || 0;
            console.log(`   ${String(i).padStart(5)} | ${String(j).padStart(5)} | ${String(ts_thread).padStart(9)} | ${ts_chain.padEnd(18)} | ✓`);
        }
    }
    
    console.log("\n📋 RECENT ACTIVITY (last 10)");
    console.log("   " + "─".repeat(80));
    console.log("   idx | time           | Phase        | PS/TS  | Service | Tick    | Link | TX/RX");
    console.log("   " + "─".repeat(80));
    
    let start_idx = Math.max(0, disp_ptr - 10);
    for (let i = start_idx; i < disp_ptr && i < 30; i++) {
        let entry = sys_disp[i];
        if (entry && entry.time) {
            let link = entry.dbio_link === "conn" ? "✓" : "⋯";
            let phase_display = "";
            if (entry.phase === "BATCH_INPUT") phase_display = "BAT-IN";
            else if (entry.phase === "BATCH_QUERY") phase_display = "BAT-QRY";
            else phase_display = "INDIV";
            let ps_ts = (entry.phase === "BATCH_INPUT" || entry.phase === "BATCH_QUERY") ? "ALL" : `${entry.ps_id}/${entry.ts_id}`;
            console.log(`   ${String(i).padStart(3)} | ${entry.time} | ${phase_display.padEnd(11)} | ${ps_ts.padEnd(7)} | ${entry.service?.padEnd(7) || '?'.padEnd(7)} | ${String(entry.tick).slice(-8).padStart(8)} | ${link}   | ${entry.tx}/${entry.rx}`);
        }
    }
    
    console.log("\n" + "═".repeat(80));
    if (dbio_link !== "conn") {
        console.log("⏳ Waiting for DBIO connection... (will auto-reconnect)");
    } else if (phase === "BATCH_INPUT") {
        console.log("📦 Phase 1/3: BATCH INPUT - PS Chain updates to NextChain after send");
    } else if (phase === "BATCH_QUERY") {
        console.log("📦 Phase 2/3: BATCH QUERY - PS Chain updates to NextChain after send");
    } else {
        console.log("🔄 Phase 3/3: Individual - PS Chain = last NextChain from previous request | Press Ctrl+C to stop");
    }
    console.log("═".repeat(80) + "\n");
    
    let second = parseInt(time.substring(18, 20));
    disp_ptr = second % 30;
    sys_disp[disp_ptr] = {
        time: time,
        phase: phase,
        ps_id: current_ps_id,
        ts_id: current_ts_id,
        service: is_input ? "INPUT" : "QUERY",
        tick: tick,
        dbio_link: dbio_link,
        tx: dbio_tx,
        rx: dbio_rx
    };
}

function test_loop() {
    tick++;
    display();
    
    if (phase === "BATCH_INPUT") {
        if (!batch_input_sent && !waiting_for_response && dbio_link === "conn") {
            send_batch_input();
        } else if (waiting_for_response && (Date.now() - last_send_time) > 10000) {
            console.log("⚠️ Batch input timeout, resetting...");
            waiting_for_response = false;
            batch_input_sent = false;
        }
    } else if (phase === "BATCH_QUERY") {
        if (!batch_query_sent && !waiting_for_response && dbio_link === "conn") {
            send_batch_query();
        } else if (waiting_for_response && (Date.now() - last_send_time) > 10000) {
            console.log("⚠️ Batch query timeout, resetting...");
            waiting_for_response = false;
            batch_query_sent = false;
        }
    } else {
        if (individual_complete) {
            phase = "BATCH_INPUT";
            batch_input_sent = false;
            console.log(`\n🔄 Cycle ${cycle_number} complete! Starting new cycle with BATCH INPUT at tick ${tick}\n`);
        } else if (!waiting_for_response && dbio_link === "conn") {
            send_individual_request();
        } else if (waiting_for_response && (Date.now() - last_send_time) > 5000) {
            console.log("⚠️ Individual request timeout, resetting...");
            waiting_for_response = false;
        }
    }
}

console.log("\n🚀 Starting DBIO Continuous Test Client");
console.log("   Chain Rules:");
console.log("   - Each PS request uses current ps_chain (from previous next_chain)");
console.log("   - After sending, ps_chain updates to the next_chain for next request");
console.log("   - Each TS request uses current ts_chain (from previous next_chain)");
console.log("   - After sending, ts_chain updates to the next_chain for next request");
console.log("   - Complete ps_result saved to record.json");
console.log("   Pattern:");
console.log("   1. BATCH INPUT:  ALL PS × ALL TS as INPUT");
console.log("   2. BATCH QUERY:  ALL PS × ALL TS as QUERY");
console.log("   3. INDIVIDUAL:   INPUT → QUERY for each PS/TS (1/sec)");
console.log("   4. Repeat cycle\n");
init();
setInterval(test_loop, 1000);

// Graceful shutdown - no test_par saved
process.on('SIGINT', function() {
    console.log("\n\n📝 Saving final record before exit...");
    
    // Add final entry to record
    append_to_record({
        timestamp: Date.now(),
        event: "SHUTDOWN",
        tick: tick,
        cycle_number: cycle_number,
        phase: phase,
        total_inputs: total_inputs,
        total_queries: total_queries,
        total_errors: total_errors,
        created_nfts: created_nft_count
    });
    
    console.log("✅ Final state saved to record.json");
    console.log("👋 Shutting down...\n");
    process.exit(0);
});