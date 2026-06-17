// sync : control tick 
//     db     input      - db_summary (ws connect par.port_rs_db)
//            db_summary = [{db_id, tick, chain, next_chain, hash, ledger }]
//            output     - sync
//            sync       = {tick, chain, next_chain, sync_id, db_id }
//     dash   input      - dash_request (ws connect par.port_rs_dash)
//            output     - sync
//            sync       = {tick, chain, next_chain, sync_id, dash_id }
//     log               - log/yy/mm/log_rs_summary_dd.jsonl

"use strict"
const fs = require("fs");
const par = JSON.parse(fs.readFileSync("par.json"));
const rs_id = par.rs_id
// const rs_id = Number(process.argv[2]);
const min_vote = par.min_vote
const ip = require("ip");
const rs_total = par.rs_total

let db_id = rs_id;
let dash_id = 0;
let tick_time = [];
let tick = 1000000000;
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
let rs_summary_disp = {};
let log_filename = "";
let sys_disp = []
let disp_row = 30
let state = "init"
let sys_disp_ptr = 0

function init() {
  filename = "exchange/rs_summary.json"
  try { rs_summary = JSON.parse(fs.readFileSync(filename)); } catch (e) { }
  db_summary = rs_summary.db_summary
  hash = db_summary[rs_id].hash;
  chain = db_summary[rs_id].chain;
  next_chain = db_summary[rs_id].next_chain;
  tick = rs_summary.tick;
  tick_time[tick] = rs_summary.time;
  sync = { tick, rs_id, chain, next_chain };
  for (i = 0; i < disp_row; i++) sys_disp[i] = {}
  for (i = 0; i < rs_total; i++) {
    dash_connection[i] = "----";
    db_link[i] = "----";
    db_rx[i] = 0;
    db_tx[i] = 0;
    dash_req_rx[i] = 0;
    dash_tx[i] = 0;
  }
}

// dash link
function dash_req_valid(input) {
  if (input.chain == sync.chain) return true
  else return true
}
let port_rs_dash = par.sync_dash_port[rs_id];
var wss_dash = new (require("ws").Server)({ port: port_rs_dash })
wss_dash.on("connection", function (webSocket) {
  webSocket.on("message", function (message) {
    input = JSON.parse(message);
    dash_id = input.dash_id;
    dash_connection[dash_id] = "conn";
    dash_req[dash_id] = input;
    if (dash_req_valid(input)) {
      dash_req_rx[dash_id]++
      reply = JSON.parse(JSON.stringify(sync))
      reply.dash_id = dash_id
      webSocket.send(JSON.stringify(reply));
      dash_tx[dash_id]++;
    } 
  });
  webSocket.on("close", function () {
    dash_connection[dash_id] = "----";
    console.log("dash link deleted: " + dash_id);
  });
});

// db link
let port_rs_db = par.sync_db_port[rs_id];
let wss_db = new (require("ws").Server)({ port: port_rs_db })
wss_db.on("connection", function (webSocket) {
  webSocket.on("message", function (message) {
    input = JSON.parse(message);
    try {
      db_id = input.db_id;
      db_link[db_id] = "conn";
      db_rx[db_id]++;
      db_summary[db_id] = input;
    } catch (e) { }
    reply = JSON.parse(JSON.stringify(sync))
    reply.db_id = db_id
    if (reply.tick == input.tick) reply.tick = "sync"
    webSocket.send(JSON.stringify(reply));
    db_tx[db_id]++;
  });
  webSocket.on("close", function () {
    db_link[db_id] = "----";
    console.log("db link deleted: " + db_id);
  });
});

function display() {
  dt = new Date();
  str = dt.toISOString().substring(11, 19)
  if (time != str) {
    time = str;
    console.clear();
    console.log(".")
    console.log("\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    this_ip = ip.address()
    console.log("sync " + rs_id + ";\x1b[1;35m ip-" + this_ip + "; dash_port-" + port_rs_dash + "; db_port-" + port_rs_db + "; \x1b[1;31mver-" + "\x1b[1;32m UTC-" + time + "; \x1b[1;31m Ver-" + par.version + "\x1b[1;37m");
    console.log("\x1b[1;35m" + "sys_disp = " + "\x1b[1;37m");
    console.table(sys_disp);
    parameter = { rs_total, this_ip, port_rs_db, port_rs_dash, min_vote, hash, vote }
    console.table({ parameter });
    console.log("\x1b[1;32m sync \x1b[1;37m   ");
    console.table({ sync });
    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    console.log("db_link \x1b[1;37m   ");
    disp = []
    for (i = 0; i < 9; i++) {
      disp[i] = {}
      disp[i].db_link = db_link[i]
      disp[i].db_rx = db_rx[i]
      disp[i].db_tx = db_tx[i]
    }
    console.table(disp);
    console.log("\x1b[1;32m rs_summary \x1b[1;37m   ");
    console.table({ rs_summary });
    console.log("\x1b[1;32m db_summary \x1b[1;37m   ");
    console.table(db_summary);
    console.log("\x1b[1;32m rs_summary.db_summary[0].ledger \x1b[1;37m   ");
    try { d_json = rs_summary.db_summary[0].ledger; } catch (e) { }
    console.table({ d_json });
    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    console.log("dash_connection \x1b[1;37m   ");
    for (i = 0; i < 9; i++) {
      disp[i] = {}
      disp[i].dash_connection = dash_connection[i]
      disp[i].dash_req_rx = dash_req_rx[i]
      disp[i].dash_tx = dash_tx[i]
    }
    console.table(disp);
    console.log("\x1b[1;32m dash_req \x1b[1;37m   ");
    console.table(dash_req);
  }
  summary_tick = db_summary[0].tick
  sys_disp[sys_disp_ptr] = { time, state, db_status, vote, tick, summary_tick, gen_cnt, chain, next_chain, t_index };
  sys_disp_ptr = parseInt(time.substring(6, 8))
  sys_disp_ptr = sys_disp_ptr % disp_row
  sys_disp[sys_disp_ptr] = {}
}

const EPOCH = new Date('2020-01-01T00:00:00Z'); // 基准 UTC 时刻
const BASE_TICK = 1000000000;

function utcToTick() {
    const now = new Date();              // 当前 UTC 时间
    const seconds = (now - EPOCH) / 1000; // 从基准起的总秒数
    return BASE_TICK + Math.floor(seconds / 10);
}

function gen_sync() {
   tick = utcToTick(); 
  status = db_status;
  chain = next_chain
  next_chain = hash.substring(0, 16);
  rs_summary = { rs_id, tick, time, status, chain, next_chain, db_summary };
  rs_summary_disp = { rs_id, tick, time, status, chain, next_chain };
  filename = "exchange/rs_summary.json"
  try { fs.writeFileSync(filename, JSON.stringify(rs_summary)); } catch (e) { }
  dt = new Date();
  str = dt.toISOString().substring(0, 11)
  yy = Number(str.substring(0, 4))
  mm = Number(str.substring(5, 7))
  dd = Number(str.substring(8, 10))
  log_filename = "log/" + yy + "/" + mm + "/" + "log_rs_summary_" + dd + ".jsonl";
  try { fs.appendFileSync(log_filename, JSON.stringify(rs_summary) + "\n"); } catch (e) { }
  gen_cnt++;
  sync = { tick, rs_id, chain, next_chain };
  filename = "exchange/sync.json"
  try { fs.writeFileSync(filename, JSON.stringify(sync)); } catch (e) { }
}

function db_vote() {
  if (db_summary[rs_id] == undefined) return false;
  hash = db_summary[rs_id].hash;
  db_status = " ";
  for (i = 0; i < rs_total; i++) {
    if (db_summary[i].hash == hash) {
      vote++;
      db_status = db_status + "O ";
    } else {
      db_status = db_status + ". ";
    }
  }
  if ((vote >= min_vote) && (db_summary[rs_id].tick >= tick)) return true
  return false
}

let disp_hold = 0
let t_index = 0
async function sync_main() {
  str = "" + new Date();
  t_index = Number(str.substring(23, 24))
  if (disp_hold > 0) disp_hold--
  if (disp_hold == 0) db_status = " - - - - - - - - - "
  vote = 0
  switch (state) {
    case "init":
      init();
      state = "wait_t"
      break;

    case "wait_t":
      if (t_index == 0) {
        if (db_vote()) {
          disp_hold = 2;
          state = "gen_new_sync"
        }
      }
      break;

    case "gen_new_sync":
      gen_sync()
      state = "wait_t"
      break;
  }
  display();
}

setInterval(sync_main, 1000);
