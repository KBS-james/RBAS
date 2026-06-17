// dbio tester - Continuous test client
// Generates its own ps_request dynamically
// Pattern: 
//   1. BATCH INPUT: ALL PS × ALL TS as INPUT in one tick
//   2. BATCH QUERY: ALL PS × ALL TS as QUERY in next tick
//   3. INDIVIDUAL: INPUT → QUERY for each PS/TS (one per second)
//   4. Repeat cycle

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

// Thread tracking
let cycle_number = 0;           // Current cycle number
let ps_threads = [];            // Current ps_thread for each PS
let ts_threads = [];            // Current ts_thread for each TS (per PS)
let ps_chains = [];             // Current chain for each PS
let ts_chains = [];             // Current chain for each TS (per PS)

// NFT tracking for queries (store NFTs created by inputs)
let created_nfts = [];          // Stores NFTs created by each PS/TS combination
let created_nft_count = 0;

// Test generation state
let current_ps_id = 0;
let current_ts_id = 0;
let is_input = true;            // true = input, false = query (alternates)
let ws_dbio = null;
let waiting_for_response = false;
let test_active = true;
let total_inputs = 0;
let total_queries = 0;
let total_errors = 0;
let last_send_time = 0;

// Mode tracking
let phase = "BATCH_INPUT";      // "BATCH_INPUT", "BATCH_QUERY", or "INDIVIDUAL"
let batch_input_sent = false;
let batch_query_sent = false;
let individual_complete = false;
let individual_step_count = 0;
let total_individual_steps = ps_total * ts_total * 2; // *2 for input+query pair

// Load PS init keys for NFT generation
let ps_init_key = [];
try {
    ps_init_key = JSON.parse(fs.readFileSync("ps_init_key.json"));
} catch (e) {
    console.log("Warning: ps_init_key.json not found, using fallback");
}

function init() {
    for (let i = 0; i < 30; i++) sys_disp[i] = {};
    reset_individual_state();
    connect_dbio();
}

function reset_individual_state() {
    for (let i = 0; i < ps_total; i++) {
        ps_request[i] = null;
        if (!ps_threads[i]) ps_threads[i] = 1;
        if (!ps_chains[i]) ps_chains[i] = crypto.createHash("sha256").update(`${tick}.${i}`).digest("hex").substring(0, 16);
        if (!ts_threads[i]) ts_threads[i] = [];
        if (!ts_chains[i]) ts_chains[i] = [];
        if (!created_nfts[i]) created_nfts[i] = [];
        for (let j = 0; j < ts_total; j++) {
            if (!ts_threads[i][j]) ts_threads[i][j] = 1;
            if (!ts_chains[i][j]) ts_chains[i][j] = crypto.createHash("sha256").update(`${tick}.${i}.${j}`).digest("hex").substring(0, 16);
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
    
    console.log(`\n📦 Generating BATCH ${service_type.toUpperCase()} request with ALL PS (0-${ps_total-1}) and ALL TS (0-${ts_total-1}) at tick ${tick}\n`);
    
    for (let ps_id = 0; ps_id < ps_total; ps_id++) {
        let ts_request_array = [];
        
        for (let ts_id = 0; ts_id < ts_total; ts_id++) {
            let service = service_type;
            let nft;
            let current_ts_thread = ts_threads[ps_id][ts_id];
            
            if (service === "query") {
                // Use the NFT that was previously created by input
                if (created_nfts[ps_id][ts_id]) {
                    nft = created_nfts[ps_id][ts_id];
                } else {
                    // Fallback: generate a test NFT
                    nft = generate_nft(ps_id, ts_id, "input", current_ts_thread, tick - 1);
                }
            } else {
                // Input: generate new NFT
                nft = generate_nft(ps_id, ts_id, "input", current_ts_thread, tick);
                created_nfts[ps_id][ts_id] = nft;
                created_nft_count++;
            }
            
            let current_ts_chain = ts_chains[ps_id][ts_id];
            let next_ts_pwd = `${tick + 1}.${ps_id}.${ts_id}.${current_ts_thread + 1}`;
            let ts_next_chain = crypto.createHash("sha256").update(next_ts_pwd).digest("hex").substring(0, 16);
            
            ts_request_array[ts_id] = {
                ts_id: ts_id,
                ts_thread: current_ts_thread,
                ts_chain: current_ts_chain,
                ts_next_chain: ts_next_chain,
                nft: nft,
                service: service
            };
            
            // Update TS thread for next time
            ts_threads[ps_id][ts_id]++;
            let update_ts_pwd = `${tick + 1}.${ps_id}.${ts_id}.${ts_threads[ps_id][ts_id]}`;
            ts_chains[ps_id][ts_id] = crypto.createHash("sha256").update(update_ts_pwd).digest("hex").substring(0, 16);
        }
        
        // Update PS thread for batch
        let current_ps_chain = ps_chains[ps_id];
        let current_ps_thread = ps_threads[ps_id];
        let next_ps_pwd = `${tick + 1}.${ps_id}.${current_ps_thread + 1}`;
        let ps_next_chain = crypto.createHash("sha256").update(next_ps_pwd).digest("hex").substring(0, 16);
        
        batch_ps_request[ps_id] = {
            ps_id: ps_id,
            tick: tick,
            ps_thread: current_ps_thread,
            ps_chain: current_ps_chain,
            ps_next_chain: ps_next_chain,
            ts_request: ts_request_array
        };
        
        // Update PS thread for next time
        ps_threads[ps_id]++;
        let update_ps_pwd = `${tick + 1}.${ps_id}.${ps_threads[ps_id]}`;
        ps_chains[ps_id] = crypto.createHash("sha256").update(update_ps_pwd).digest("hex").substring(0, 16);
    }
    
    return batch_ps_request;
}

function generate_individual_request() {
    let new_ps_request = [];
    let service = is_input ? "input" : "query";
    let nft;
    let current_ts_thread = ts_threads[current_ps_id][current_ts_id];
    
    if (service === "query") {
        // Use the NFT that was previously created by input for this PS/TS
        if (created_nfts[current_ps_id][current_ts_id]) {
            nft = created_nfts[current_ps_id][current_ts_id];
        } else {
            // Fallback: generate a test NFT if no created NFT exists
            nft = generate_nft(current_ps_id, current_ts_id, "input", current_ts_thread, tick);
        }
    } else {
        // Input: generate a new unique NFT
        nft = generate_nft(current_ps_id, current_ts_id, "input", current_ts_thread, tick);
        // Store it for future query
        created_nfts[current_ps_id][current_ts_id] = nft;
        created_nft_count++;
    }
    
    let current_ts_chain = ts_chains[current_ps_id][current_ts_id];
    
    // Generate next TS chain for the next request
    let next_ts_pwd = `${tick + 1}.${current_ps_id}.${current_ts_id}.${current_ts_thread + 1}`;
    let ts_next_chain = crypto.createHash("sha256").update(next_ts_pwd).digest("hex").substring(0, 16);
    
    // Create the TS request with thread tracking
    let ts_request_entry = {
        ts_id: current_ts_id,
        ts_thread: current_ts_thread,
        ts_chain: current_ts_chain,
        ts_next_chain: ts_next_chain,
        nft: nft,
        service: service
    };
    
    // Build the TS request array (only this one TS request)
    let ts_request_array = [];
    ts_request_array[current_ts_id] = ts_request_entry;
    
    // Update PS chain for this request
    let current_ps_chain = ps_chains[current_ps_id];
    let current_ps_thread = ps_threads[current_ps_id];
    
    // Generate next PS chain
    let next_ps_pwd = `${tick + 1}.${current_ps_id}.${current_ps_thread + 1}`;
    let ps_next_chain = crypto.createHash("sha256").update(next_ps_pwd).digest("hex").substring(0, 16);
    
    // Create the PS request with thread tracking
    new_ps_request[current_ps_id] = {
        ps_id: current_ps_id,
        tick: tick,
        ps_thread: current_ps_thread,
        ps_chain: current_ps_chain,
        ps_next_chain: ps_next_chain,
        ts_request: ts_request_array
    };
    
    return new_ps_request;
}

function update_threads_after_individual_request() {
    // Increment TS thread for the current TS
    ts_threads[current_ps_id][current_ts_id]++;
    
    // Update TS chain
    let next_ts_pwd = `${tick + 1}.${current_ps_id}.${current_ts_id}.${ts_threads[current_ps_id][current_ts_id]}`;
    ts_chains[current_ps_id][current_ts_id] = crypto.createHash("sha256").update(next_ts_pwd).digest("hex").substring(0, 16);
}

function advance_individual_test_state() {
    // Alternate between input and query
    is_input = !is_input;
    individual_step_count++;
    
    if (is_input) {
        // After completing a pair (input + query), move to next TS
        current_ts_id++;
        
        if (current_ts_id >= ts_total) {
            // Completed all TS for current PS, update PS thread
            ps_threads[current_ps_id]++;
            
            // Update PS chain
            let next_ps_pwd = `${tick + 1}.${current_ps_id}.${ps_threads[current_ps_id]}`;
            ps_chains[current_ps_id] = crypto.createHash("sha256").update(next_ps_pwd).digest("hex").substring(0, 16);
            
            // Move to next PS
            current_ts_id = 0;
            current_ps_id++;
            
            if (current_ps_id >= ps_total) {
                // Completed all PS - individual phase complete!
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
        
        // Log result statistics
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
            
            // After batch input, move to batch query
            phase = "BATCH_QUERY";
            batch_input_sent = false;
            
            console.log(`\n🔄 Next: BATCH QUERY at tick ${tick + 1}\n`);
        } else if (phase === "BATCH_QUERY") {
            console.log(`\n📦 BATCH QUERY RESPONSE RECEIVED at tick ${tick}:`);
            console.log(`   Queries: ${result_stats.queries}, Errors: ${result_stats.errors}`);
            
            // After batch query, move to individual phase
            phase = "INDIVIDUAL";
            batch_query_sent = false;
            reset_individual_state();
            cycle_number++;
            
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
                }
            }
        }
        
        // Append to record file
        let record_entry = {
            timestamp: Date.now(),
            tick: tick,
            cycle: cycle_number,
            phase: phase,
            ps_id: current_ps_id,
            ts_id: current_ts_id,
            service: is_input ? "input" : "query",
            result: ps_result
        };
        
        try {
            fs.appendFileSync("test_data/record.json", JSON.stringify(record_entry) + "\n");
        } catch (e) {
            try {
                fs.mkdirSync("test_data", { recursive: true });
                fs.appendFileSync("test_data/record.json", JSON.stringify(record_entry) + "\n");
            } catch (e2) {}
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
    
    ps_request = generate_individual_request();
    
    try {
        ws_dbio.send(JSON.stringify(ps_request));
        dbio_tx++;
        waiting_for_response = true;
        last_send_time = Date.now();
        
        let service_name = is_input ? "INPUT" : "QUERY";
        let step_info = `[${individual_step_count + 1}/${total_individual_steps}]`;
        console.log(`\n📤 ${service_name} ${step_info} | PS[${current_ps_id}] | TS[${current_ts_id}] | Tick: ${tick}`);
        
        update_threads_after_individual_request();
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
    
    // Header
    console.log("\n" + "═".repeat(80));
    console.log("  DBIO CONTINUOUS TEST CLIENT - " + time);
    console.log("═".repeat(80));
    
    // Connection Status
    let this_ip = ip.address();
    console.log("\n📡 CONNECTION STATUS");
    console.log("   ├─ DBIO Server: " + dbio_ip);
    console.log("   ├─ Client IP:   " + this_ip);
    console.log("   ├─ Connection:  " + (dbio_link === "conn" ? "✅ CONNECTED" : "⏳ WAITING..."));
    console.log("   ├─ TX Count:    " + dbio_tx);
    console.log("   └─ RX Count:    " + dbio_rx);
    
    // System Stats
    console.log("\n📊 SYSTEM STATISTICS");
    console.log("   ├─ PS Total:      " + ps_total);
    console.log("   ├─ TS Total:      " + ts_total);
    console.log("   ├─ Current Tick:  " + tick);
    console.log("   ├─ Cycle Number:  " + cycle_number);
    console.log("   ├─ NFTs Created:  " + created_nft_count);
    console.log("   ├─ Total Inputs:  " + total_inputs);
    console.log("   ├─ Total Queries: " + total_queries);
    console.log("   └─ Total Errors:  " + total_errors);
    
    // Current Phase
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
    
    // Thread Summary
    console.log("\n🧵 THREAD SUMMARY (first 5 PS)");
    console.log("   " + "─".repeat(68));
    console.log("   PS ID | PS Thread | TS0 Thread | TS1 Thread | TS2 Thread");
    console.log("   " + "─".repeat(68));
    for (let i = 0; i < Math.min(5, ps_total); i++) {
        let ts0 = ts_threads[i] ? (ts_threads[i][0] || 0) : 0;
        let ts1 = ts_threads[i] ? (ts_threads[i][1] || 0) : 0;
        let ts2 = ts_threads[i] ? (ts_threads[i][2] || 0) : 0;
        console.log(`   ${String(i).padStart(5)} | ${String(ps_threads[i]).padStart(9)} | ${String(ts0).padStart(10)} | ${String(ts1).padStart(10)} | ${String(ts2).padStart(10)}`);
    }
    
    // Recent Activity
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
    
    // Footer
    console.log("\n" + "═".repeat(80));
    if (dbio_link !== "conn") {
        console.log("⏳ Waiting for DBIO connection... (will auto-reconnect)");
    } else if (phase === "BATCH_INPUT") {
        console.log("📦 Phase 1/3: Sending BATCH INPUT (ALL PS × ALL TS)");
    } else if (phase === "BATCH_QUERY") {
        console.log("📦 Phase 2/3: Sending BATCH QUERY (ALL PS × ALL TS)");
    } else {
        console.log("🔄 Phase 3/3: Individual requests (1/sec) → Then repeat cycle | Press Ctrl+C to stop");
    }
    console.log("═".repeat(80) + "\n");
    
    // Update system display
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

// Main test loop - runs once per second
function test_loop() {
    // Increment tick EVERY second
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
        // INDIVIDUAL phase
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

// Initialize and start
console.log("\n🚀 Starting DBIO Continuous Test Client");
console.log("   Pattern:");
console.log("   1. BATCH INPUT:  ALL PS × ALL TS as INPUT");
console.log("   2. BATCH QUERY:  ALL PS × ALL TS as QUERY");
console.log("   3. INDIVIDUAL:   INPUT → QUERY for each PS/TS (1/sec)");
console.log("   4. Repeat cycle");
console.log("   Tick increments EVERY second\n");
init();
setInterval(test_loop, 1000);

// Handle graceful shutdown
process.on('SIGINT', function() {
    console.log("\n\n📝 Saving state before exit...");
    let test_par = {
        tick: tick,
        cycle_number: cycle_number,
        phase: phase,
        ps_threads: ps_threads,
        ts_threads: ts_threads,
        created_nfts: created_nfts,
        sys_disp: sys_disp,
        stats: {
            total_inputs: total_inputs,
            total_queries: total_queries,
            total_errors: total_errors,
            created_nfts: created_nft_count,
            final_tick: tick
        }
    };
    
    try {
        fs.mkdirSync("ps_0", { recursive: true });
        fs.writeFileSync("ps_0/test_par.json", JSON.stringify(test_par, null, 2));
        console.log("✅ State saved to ps_0/test_par.json");
    } catch (e) {
        console.log("⚠️ Could not save state: " + e.message);
    }
    
    console.log("👋 Shutting down...\n");
    process.exit(0);
});