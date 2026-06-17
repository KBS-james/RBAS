// sync : control tick 
"use strict"
const fs = require("fs");
const par = JSON.parse(fs.readFileSync("par.json"));
const tickModule = require("./tickModule.js");
const rs_id = par.rs_id
const min_vote = par.min_vote
const ip = require("ip");
const rs_total = par.rs_total

let db_id = rs_id;
let dash_id = 0;
let tick_time = [];
let tick = tickModule.START_TICK;
let time = "";
let hash = "";
let chain = "";
let next_chain = "";
let dash_req_rx = [];
let dash_tx = [];
let db_rx = [];
let db_tx = [];
let gen_cnt = 0;
let db_link = [];
let dash_connection = [];
let db_status = " - - - - - - - - - ";
let status = db_status;
let db_summary = [];
let dash_req = [];
let sync = {};
let vote = 0;
let rs_summary = {};
let log_filename = "";
let sys_disp = []
let disp_row = 30
let state = "init"
let sys_disp_ptr = 0
let last_display_time = ""
let start_time = Date.now();
let consensus_reached_this_tick = false;
let last_db_next_chain = [];  // 记录每个 DB 上次的 next_chain
let chain_error = [];
let db_ws_status = [];
let dash_ws_status = [];
let db_last_msg_time = [];
let dash_last_msg_time = [];

function init() {
  for (let i = 0; i < rs_total; i++) {
    db_summary[i] = null;
    last_db_next_chain[i] = null;
    chain_error[i] = false;
    db_ws_status[i] = "DISCONNECTED";
    dash_ws_status[i] = "DISCONNECTED";
    db_last_msg_time[i] = 0;
    dash_last_msg_time[i] = 0;
  }
  
  let filename = "exchange/rs_summary.json"
  try { 
    rs_summary = JSON.parse(fs.readFileSync(filename)); 
    
    if (rs_summary.db_summary && rs_summary.db_summary[rs_id]) {
      hash = rs_summary.db_summary[rs_id].hash;
      chain = rs_summary.db_summary[rs_id].chain;
      next_chain = rs_summary.db_summary[rs_id].next_chain;
      db_summary = rs_summary.db_summary;
      
      for (let i = 0; i < rs_total; i++) {
        if (db_summary[i]) {
          last_db_next_chain[i] = db_summary[i].next_chain;
        }
      }
    } else {
      hash = par.seed_hash;
      chain = hash.substring(0, 16);
      next_chain = chain;
    }
    tick = rs_summary.tick || tickModule.START_TICK;
  } catch (e) { 
    hash = par.seed_hash;
    chain = hash.substring(0, 16);
    next_chain = chain;
    tick = tickModule.dateToTick(new Date());
    
    for (let i = 0; i < rs_total; i++) {
      db_summary[i] = {
        db_id: i,
        tick: tick,
        chain: chain,
        next_chain: next_chain,
        hash: hash,
        ledger: { in_total: 0, in_err: 0, q_total: 0, q_err: 0 }
      };
      last_db_next_chain[i] = next_chain;
    }
  }
  
  sync = { tick, rs_id, chain, next_chain };
  
  for (let i = 0; i < disp_row; i++) sys_disp[i] = {}
  for (let i = 0; i < rs_total; i++) {
    dash_connection[i] = "----";
    db_link[i] = "----";
    db_rx[i] = 0;
    db_tx[i] = 0;
    dash_req_rx[i] = 0;
    dash_tx[i] = 0;
  }
  vote = 0;
}

// dash link
let port_rs_dash = par.sync_dash_port[rs_id];
var wss_dash;
try {
  wss_dash = new (require("ws").Server)({ port: port_rs_dash })
  
  wss_dash.on("connection", function (webSocket) {
    let client_dash_id = null;
    
    webSocket.on("message", function (message) {
      try {
        // 检查消息是否为空
        if (!message || message.toString().trim() === "") {
          console.log("Empty dash message received");
          return;
        }
        
        let input = JSON.parse(message.toString());
        client_dash_id = input.dash_id;
        dash_id = client_dash_id;
        dash_connection[client_dash_id] = "conn";
        dash_ws_status[client_dash_id] = "CONNECTED";
        dash_last_msg_time[client_dash_id] = Date.now();
        dash_req[client_dash_id] = input;
        dash_req_rx[client_dash_id]++
        
        let reply = JSON.parse(JSON.stringify(sync))
        reply.dash_id = client_dash_id
        webSocket.send(JSON.stringify(reply));
        dash_tx[client_dash_id]++;
      } catch (e) {
        console.log("Dash message parse error: " + e.message);
      }
    });
    
    webSocket.on("close", function () {
      if (client_dash_id !== null) {
        dash_connection[client_dash_id] = "----";
        dash_ws_status[client_dash_id] = "DISCONNECTED";
      }
    });
  });
} catch (e) {
  console.log("✗ Error starting dash WebSocket: " + e.message);
}

// db link
let port_rs_db = par.sync_db_port[rs_id];
let wss_db;
try {
  wss_db = new (require("ws").Server)({ port: port_rs_db })
  
  wss_db.on("connection", function (webSocket) {
    let client_db_id = null;
    
    webSocket.on("message", function (message) {
      try {
        // 检查消息是否为空
        if (!message || message.toString().trim() === "") {
          console.log("Empty DB message received");
          return;
        }
        
        let input = JSON.parse(message.toString());
        client_db_id = input.db_id;
        db_id = client_db_id;
        db_link[client_db_id] = "conn";
        db_ws_status[client_db_id] = "CONNECTED";
        db_last_msg_time[client_db_id] = Date.now();
        db_rx[client_db_id]++;
        
        // 验证 chain 链式完整性
        // DB 发送的 chain 必须等于上一次收到的 next_chain
        let chain_valid = true;
        let error_msg = "";
        
        if (last_db_next_chain[client_db_id] !== null && last_db_next_chain[client_db_id] !== undefined) {
          if (input.chain !== last_db_next_chain[client_db_id]) {
            chain_valid = false;
            error_msg = `Chain mismatch: expected ${last_db_next_chain[client_db_id].substring(0,8)}, got ${input.chain.substring(0,8)}`;
            chain_error[client_db_id] = true;
            console.log(`\x1b[1;31m✗ DB[${client_db_id}] chain error: ${error_msg}\x1b[0m`);
          } else {
            chain_error[client_db_id] = false;
          }
        }
        
        // 更新 last_db_next_chain 为当前的 next_chain
        last_db_next_chain[client_db_id] = input.next_chain;
        
        if (chain_valid) {
          db_summary[client_db_id] = input;
          console.log(`\x1b[1;32m✓ DB[${client_db_id}] accepted: tick=${input.tick} chain=${input.chain.substring(0,8)} next=${input.next_chain.substring(0,8)}\x1b[0m`);
        } else {
          console.log(`\x1b[1;31m✗ DB[${client_db_id}] rejected: ${error_msg}\x1b[0m`);
        }
        
        let reply = JSON.parse(JSON.stringify(sync))
        reply.db_id = client_db_id
        reply.confirmed = true;
        
        webSocket.send(JSON.stringify(reply));
        db_tx[client_db_id]++;
        
      } catch (e) {
        console.log("DB message error: " + e.message);
        console.log("Raw message: " + message);
      }
    });
    
    webSocket.on("close", function () {
      if (client_db_id !== null) {
        db_link[client_db_id] = "----";
        db_ws_status[client_db_id] = "DISCONNECTED";
        chain_error[client_db_id] = false;
        console.log("DB client disconnected: " + client_db_id);
      }
    });
  });
} catch (e) {
  console.log("✗ Error starting db WebSocket: " + e.message);
}

function format_hash(hash_str) {
  if (!hash_str) return "none";
  if (hash_str.length <= 16) return hash_str;
  return hash_str.substring(0, 16) + "..." + hash_str.substring(hash_str.length - 4);
}

function format_tick_time(tick_val) {
  try {
    const time_obj = tickModule.tickToTime(tick_val);
    return `${time_obj.year}-${String(time_obj.month).padStart(2,'0')}-${String(time_obj.day).padStart(2,'0')} ${String(time_obj.hour).padStart(2,'0')}:${String(time_obj.minute).padStart(2,'0')}:${String(time_obj.second).padStart(2,'0')}`;
  } catch(e) {
    return "unknown";
  }
}

function get_ws_status_icon(status) {
  if (status === "CONNECTED") return "\x1b[1;32m●\x1b[0m";
  return "\x1b[1;31m○\x1b[0m";
}

function get_time_since(last_time) {
  if (last_time === 0) return "---";
  let seconds = Math.floor((Date.now() - last_time) / 1000);
  if (seconds < 60) return seconds + "s";
  return Math.floor(seconds / 60) + "m";
}

function display() {
  let dt = new Date();
  let current_str = dt.toISOString().substring(11, 19);
  
  if (last_display_time != current_str) {
    last_display_time = current_str;
    
    let uptime_sec = Math.floor((Date.now() - start_time) / 1000);
    let uptime_min = Math.floor(uptime_sec / 60);
    let uptime_hour = Math.floor(uptime_min / 60);
    uptime_sec = uptime_sec % 60;
    uptime_min = uptime_min % 60;
    
    console.clear();
    
    console.log("\x1b[1;36m════════════════════════════════════════════════════════════════════════════════════════════════════════════\x1b[0m");
    console.log("\x1b[1;33m                                RS SYNC NODE " + rs_id + " - CONSENSUS MONITOR");
    console.log("\x1b[1;36m════════════════════════════════════════════════════════════════════════════════════════════════════════════\x1b[0m");
    
    console.log("\x1b[1;32m▶ SYSTEM INFORMATION");
    console.log("  UTC Time:     \x1b[1;33m" + current_str);
    console.log("  Uptime:       \x1b[1;33m" + uptime_hour + "h " + uptime_min + "m " + uptime_sec + "s");
    console.log("  State:        \x1b[1;33m" + state);
    console.log("  Gen Count:    \x1b[1;33m" + gen_cnt);
    
    console.log("\x1b[1;35m▶ TICK INFORMATION");
    console.log("  Current Tick: \x1b[1;33m" + tick);
    console.log("  Tick Time:    \x1b[1;33m" + format_tick_time(tick));
    console.log("  Chain:        \x1b[1;33m" + chain);
    console.log("  Next Chain:   \x1b[1;33m" + next_chain);
    console.log("  Hash:         \x1b[1;33m" + format_hash(hash));
    
    console.log("\x1b[1;33m▶ CONSENSUS VOTING");
    console.log("  Votes:        \x1b[1;36m" + vote + "\x1b[0m/\x1b[1;33m" + rs_total + " (need " + min_vote + ")");
    
    let bar_length = 50;
    let filled = Math.floor((vote / rs_total) * bar_length);
    let bar = "\x1b[1;32m" + "█".repeat(filled) + "\x1b[1;31m" + "░".repeat(bar_length - filled) + "\x1b[0m";
    console.log("  Progress:     " + bar);
    
    let status_text = vote >= min_vote ? "\x1b[1;32mREADY\x1b[0m" : "\x1b[1;31mWAITING\x1b[0m";
    console.log("  Status:       " + status_text);
    
    // ========== WebSocket 连接状态 ==========
    console.log("\x1b[1;36m▶ WEBSOCKET CONNECTION STATUS");
    console.log("  ┌─────────────────────────────────────────────────────────────────────────────────────────┐");
    console.log("  │  DB Connections                                    │  Dash Connections                    │");
    console.log("  ├────┬───────────────┬───────────────┬───────────────┼────┬───────────────┬───────────────┤");
    console.log("  │ ID │ Status        │ Last Msg      │ RX/TX         │ ID │ Status        │ Last Msg      │");
    console.log("  ├────┼───────────────┼───────────────┼───────────────┼────┼───────────────┼───────────────┤");
    
    for (let i = 0; i < rs_total; i++) {
      let db_status_icon = get_ws_status_icon(db_ws_status[i]);
      let db_status_text = db_ws_status[i];
      let db_last_msg = get_time_since(db_last_msg_time[i]);
      let db_rx_tx = `${db_rx[i]}/${db_tx[i]}`;
      
      let dash_status_icon = get_ws_status_icon(dash_ws_status[i]);
      let dash_status_text = dash_ws_status[i];
      let dash_last_msg = get_time_since(dash_last_msg_time[i]);
      
      console.log(`  │ ${String(i).padStart(2)} │ ${db_status_icon} ${db_status_text.padEnd(13)} │ ${db_last_msg.padEnd(13)} │ ${db_rx_tx.padEnd(13)} │ ${String(i).padStart(2)} │ ${dash_status_icon} ${dash_status_text.padEnd(13)} │ ${dash_last_msg.padEnd(13)} │`);
    }
    console.log("  └────┴───────────────┴───────────────┴───────────────┴────┴───────────────┴───────────────┘");
    
    // ========== DB 节点详细状态 ==========
    let connected_dbs = 0;
    for (let i = 0; i < rs_total; i++) {
      if (db_link[i] === "conn") connected_dbs++;
    }
    
    console.log("\x1b[1;34m▶ DATABASE NODE DETAILS (" + connected_dbs + "/" + rs_total + " connected)");
    console.log("  ┌────┬────────┬────────────┬───────┬────────────┬────────────┬─────────────────────────────────┐");
    console.log("  │ ID │ Status │    Tick    │ Match │ Chain Valid│ Last Msg   │ Hash                            │");
    console.log("  ├────┼────────┼────────────┼───────┼────────────┼────────────┼─────────────────────────────────┤");
    
    for (let i = 0; i < rs_total; i++) {
      let status_icon = "";
      let match_icon = "";
      let chain_valid_icon = "";
      let tick_str = "---";
      let hash_str = "---";
      let last_msg = get_time_since(db_last_msg_time[i]);
      
      if (db_link[i] === "conn") {
        status_icon = "●";
        if (db_summary[i] && typeof db_summary[i] === 'object') {
          tick_str = db_summary[i].tick ? db_summary[i].tick.toString() : "---";
          hash_str = db_summary[i].hash ? format_hash(db_summary[i].hash) : "---";
          let is_match = (db_summary[i].hash == hash && db_summary[i].tick == tick);
          match_icon = is_match ? "✓" : "✗";
          chain_valid_icon = chain_error[i] ? "✗" : "✓";
        } else {
          match_icon = "?";
          chain_valid_icon = "?";
        }
      } else {
        status_icon = "○";
        match_icon = "-";
        chain_valid_icon = "-";
        last_msg = "---";
      }
      
      let colored_status = (db_link[i] === "conn") ? "\x1b[1;32m" + status_icon + "\x1b[0m" : "\x1b[1;31m" + status_icon + "\x1b[0m";
      let colored_match = "";
      if (match_icon === "✓") colored_match = "\x1b[1;32m✓\x1b[0m";
      else if (match_icon === "✗") colored_match = "\x1b[1;31m✗\x1b[0m";
      else if (match_icon === "?") colored_match = "\x1b[1;33m?\x1b[0m";
      else colored_match = "\x1b[1;30m-\x1b[0m";
      
      let colored_chain_valid = "";
      if (chain_valid_icon === "✓") colored_chain_valid = "\x1b[1;32m✓\x1b[0m";
      else if (chain_valid_icon === "✗") colored_chain_valid = "\x1b[1;31m✗\x1b[0m";
      else if (chain_valid_icon === "?") colored_chain_valid = "\x1b[1;33m?\x1b[0m";
      else colored_chain_valid = "\x1b[1;30m-\x1b[0m";
      
      console.log(`  │ ${String(i).padStart(2)} │   ${colored_status}   │ ${tick_str.padEnd(10)} │   ${colored_match}   │     ${colored_chain_valid}     │ ${last_msg.padEnd(10)} │ ${hash_str.padEnd(31)} │`);
    }
    console.log("  └────┴────────┴────────────┴───────┴────────────┴────────────┴─────────────────────────────────┘");
    
    // ========== 通信统计 ==========
    let total_db_rx = db_rx.reduce((a, b) => a + b, 0);
    let total_db_tx = db_tx.reduce((a, b) => a + b, 0);
    let total_dash_rx = dash_req_rx.reduce((a, b) => a + b, 0);
    let total_dash_tx = dash_tx.reduce((a, b) => a + b, 0);
    
    console.log("\x1b[1;36m▶ COMMUNICATION STATISTICS");
    console.log("  DB Traffic:   RX: " + total_db_rx + " msgs, TX: " + total_db_tx + " msgs");
    console.log("  Dash Traffic: RX: " + total_dash_rx + " msgs, TX: " + total_dash_tx + " msgs");
    
    // ========== 端口信息 ==========
    let this_ip = ip.address();
    console.log("\x1b[1;30m▶ NETWORK");
    console.log("  IP: " + this_ip);
    console.log("  Dash WebSocket Port: " + port_rs_dash);
    console.log("  DB WebSocket Port:   " + port_rs_db);
    console.log("\x1b[1;36m════════════════════════════════════════════════════════════════════════════════════════════════════════════\x1b[0m");
    
    if (connected_dbs == 0) {
      console.log("\n\x1b[1;33m⚠ No DB nodes connected. Run 'node 2sync_db.js' in another terminal.\x1b[0m");
    } else if (vote < min_vote) {
      console.log("\n\x1b[1;33m⏳ Waiting for " + (min_vote - vote) + " more vote(s) to reach consensus...\x1b[0m");
    } else if (vote >= min_vote && state == "wait_vote") {
      console.log("\n\x1b[1;32m✓ Consensus reached! Generating new sync state...\x1b[0m");
    }
    
    console.log("");
  }
}

function gen_sync() {
  console.log("\x1b[1;32m>>> Generating new sync state at tick " + tick + "\x1b[0m");
  
  status = db_status;
  chain = next_chain;
  next_chain = hash.substring(0, 16);
  rs_summary = { rs_id, tick, time, status, chain, next_chain, db_summary };
  
  let filename = "exchange/rs_summary.json"
  try { 
    fs.writeFileSync(filename, JSON.stringify(rs_summary, null, 2)); 
  } catch (e) { }
  
  gen_cnt++;
  sync = { tick, rs_id, chain, next_chain };
  let sync_filename = "exchange/sync.json"
  try { 
    fs.writeFileSync(sync_filename, JSON.stringify(sync, null, 2)); 
  } catch (e) { }
  
  let dt = new Date();
  let yy = dt.getUTCFullYear();
  let mm = dt.getUTCMonth() + 1;
  let dd = dt.getUTCDate();
  let log_dir = "log/" + yy + "/" + mm;
  try {
    if (!fs.existsSync("log")) fs.mkdirSync("log");
    if (!fs.existsSync("log/" + yy)) fs.mkdirSync("log/" + yy);
    if (!fs.existsSync(log_dir)) fs.mkdirSync(log_dir);
    log_filename = log_dir + "/log_rs_summary_" + dd + ".jsonl";
    fs.appendFileSync(log_filename, JSON.stringify(rs_summary) + "\n");
  } catch (e) { }
  
  vote = 0;
  consensus_reached_this_tick = false;
}

function db_vote() {
  if (db_summary[rs_id] == null || db_summary[rs_id] == undefined) {
    return false;
  }
  
  hash = db_summary[rs_id].hash;
  db_status = " ";
  vote = 0;
  
  for (let i = 0; i < rs_total; i++) {
    if (db_summary[i] && 
        db_summary[i].hash && 
        db_summary[i].hash == hash && 
        db_summary[i].tick == tick &&
        !chain_error[i]) {
      vote++;
      db_status = db_status + "O ";
    } else {
      db_status = db_status + ". ";
    }
  }
  
  if (vote >= min_vote) return true
  return false
}

// 每秒执行一次
function sync_loop() {
  let real_tick = tickModule.dateToTick(new Date());
  
  if (real_tick != tick) {
    console.log("\x1b[1;35m>>> Tick changing: " + tick + " -> " + real_tick + "\x1b[0m");
    tick = real_tick;
    sync.tick = tick;
    
    let sync_filename = "exchange/sync.json"
    try { 
      fs.writeFileSync(sync_filename, JSON.stringify(sync, null, 2)); 
    } catch (e) { }
  }
  
  switch (state) {
    case "init":
      init();
      state = "wait_vote"
      break;

    case "wait_vote":
      if (db_vote() && vote == rs_total && !consensus_reached_this_tick) {
        consensus_reached_this_tick = true;
        console.log("\x1b[1;32m!!! FULL CONSENSUS ACHIEVED with " + vote + " votes !!!\x1b[0m");
        state = "gen_new_sync"
      }
      break;

    case "gen_new_sync":
      gen_sync();
      state = "wait_vote"
      break;
  }
  
  display();
}

console.log("\n\x1b[1;36m════════════════════════════════════════════════════════════════════════════════════════════════════════════\x1b[0m");
console.log("\x1b[1;33m                                RS SYNC NODE " + rs_id + " - STARTING UP");
console.log("\x1b[1;36m════════════════════════════════════════════════════════════════════════════════════════════════════════════\x1b[0m");
console.log("\x1b[1;32m✓\x1b[0m Dash WebSocket: \x1b[1;33mws://" + ip.address() + ":" + port_rs_dash);
console.log("\x1b[1;32m✓\x1b[0m DB WebSocket:   \x1b[1;33mws://" + ip.address() + ":" + port_rs_db);
console.log("\x1b[1;32m✓\x1b[0m Sync Loop:      \x1b[1;33mEvery 1 second\x1b[0m");
console.log("\x1b[1;32m✓\x1b[0m Tick Update:    \x1b[1;33mEvery 10 seconds (auto from real time)\x1b[0m");
console.log("\x1b[1;32m✓\x1b[0m Chain Verify:   \x1b[1;33mdb.chain must equal last db.next_chain\x1b[0m");
console.log("\n\x1b[1;36mPress Ctrl+C to stop\x1b[0m\n");

setInterval(sync_loop, 1000);