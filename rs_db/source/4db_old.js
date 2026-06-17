// cspell:ignore dbio
// db receive ps_request, get ps_result from dbio, check sync, distribute result to ps
//     ledger manage   - ledger/db_ledger.json
//                     - ledger/ps_ledger.json
//     sync  output    - db_summary
//           input     - db_sync
//     ps    input     - ps_request from each ps servers
//           return    - ps_result_sync 
//     dbio  output    - ps_request_array
//           input     - ps_result_array
//     log             - log/yy/mm/log_db_summary_dd/jsonl
//     dash manage     - exchange/ps_request.json
//                     - exchange/ps_result.json

const fs = require("fs");
const ip = require("ip");
const crypto = require("crypto");
const ws = require("ws"); // to rs_sync
const par = JSON.parse(fs.readFileSync("par.json"));
const db_id = par.rs_id;
const rs_total = par.rs_total;
const ps_total = par.ps_total;
const ts_total = par.ts_total

let ps_id = 0
let db_ledger = {}
let ps_ledger_array = [];
let time = "";
let hash = "";
let tick = 0
let summary_tick = 1000000000
let state = "start"
let ps_request = [];
let ps_result = [];
let ps_result_sync = []
let ps_rx_cnt = [];
let ps_tx_cnt = [];
let rs_link = [];
let ps_link = [];
let ws_rs = [];
let wss_ps = [];
let rs_rx_cnt = [];
let rs_tx_cnt = [];
let db_summary = {};
let db_sync = [];
let rs_ip = [];
let db_ptr = 0;
let gen_db_summary_cnt = 0
let in_json = {}
let next_chain = ""
let t_index = 0
let sys_disp = []
let disp_row = 30
let wait = 0
let chain = ""
let vote = 0
let db_ps_port = par.db_ps_port[db_id];
let meter = []
let i = 0;
for (i = 0; i < 100; i++) meter[i] = "\x1b[1;30m|"

function init() {
  for (i = 0; i < disp_row; i++) sys_disp[i] = {}
  db_ledger = JSON.parse(fs.readFileSync("ledger/db_ledger.json"));
  tick = db_ledger.tick
  db_ptr = db_ledger.in_total
  ps_ledger_array = JSON.parse(fs.readFileSync("ledger/ps_ledger.json"));
  next_chain = db_ledger.chain
  for (i = 0; i < rs_total; i++) {
    db_sync[i] = { tick }
    rs_link[i] = " ... ";
    rs_tx_cnt[i] = 0;
    rs_rx_cnt[i] = 0;
    connect_sync(i);
  }
  ps_result = JSON.parse(fs.readFileSync("ledger/ps_ledger.json"));
  ps_request = JSON.parse(fs.readFileSync("ledger/ps_ledger.json"));
  for (i = 0; i < ps_total; i++) {
    if (ps_result[i] != undefined) {
      ps_result[i].tick = tick
      ps_result[i].ps_next_chain = ps_ledger_array[i].ps_chain
    }
    ps_link[i] = " ... ";
    ps_rx_cnt[i] = 0;
    ps_tx_cnt[i] = 0;
  }
  connect_dbio()
}

function load_meter(start, color) {
  t2 = Date.now()
  t1 = "" + start
  t1 = t1.substring(10, 12)
  t2 = "" + t2
  t2 = t2.substring(10, 12)
  start = Number(t1)
  end = Number(t2)
  if (end == start) end = start + 1
  if (end < start) {
    end = (100 - start) + end
    start = 10
  }
  for (i = start; i < end; i++) meter[i] = color
}

// ps
const wss = new (require("ws").Server)({ port: db_ps_port });
function valid_ps_request() {
  try {
    if (ps_id >= ps_total) return false;
    if (in_json.ps_chain == ps_ledger_array[ps_id].ps_chain) return true
    if (in_json.ps_chain == ps_result[ps_id].ps_next_chain) return true
  } catch (e) { return false }
  return false
}
wss.on("connection", function (webSocket) {
  webSocket.on("message", function (message) {
    try {
      in_json = JSON.parse(message);
      ps_id = in_json.ps_id;
      ps_link[ps_id] = "conn";
      ps_rx_cnt[ps_id]++
      if (valid_ps_request()) {
        ps_request[ps_id] = in_json;
        ps_request[ps_id].tick = tick

      }
      webSocket.send(JSON.stringify(ps_result_sync[ps_id]));
      ps_tx_cnt[ps_id]++;
    } catch (e) { }
  });
  webSocket.on("close", function () {
    for (i = 0; i < ps_total; i++) {
      delete wss_ps[i];
      ps_link[i] = " ... ";
    }
  });
});

// to dbio
let dbio_link = " ... "
let dbio_rx = 0
let dbio_tx = 0
let dbio_ip = ""
async function connect_dbio() {
  let dbio_port = par.dbio_db_port[db_id];
  let dbio_ip = par.rs_ip_array[db_id] + dbio_port
  ws_dbio = new ws(dbio_ip);
  ws_dbio.onopen = function () {
    dbio_link = "conn";
  };
  ws_dbio.onmessage = function (event) {
    dbio_rx++;
    input = JSON.parse(event.data)
    ps_result = input
  };
  ws_dbio.onclose = function (e) {
    setTimeout(function () {
      dbio_link = " ... ";
      connect_dbio();
    }, 1000);
  };
  ws_dbio.onerror = function (e) {
    setTimeout(function () {
      dbio_link = " err";
    }, 1000);
  };
}

// to sync
let sync_ip = []
async function connect_sync(rs_index) {
  rs_ip[rs_index] = par.rs_ip_array[rs_index];
  let port = par.sync_db_port[db_id]
  sync_ip[rs_index] = rs_ip[rs_index] + port
  ws_rs[rs_index] = new ws(sync_ip[rs_index]);
  ws_rs[rs_index].onopen = function () {
    rs_link[rs_index] = "conn";
  };
  ws_rs[rs_index].onmessage = function (event) {
    rx_buf = JSON.parse(event.data)
    rs_index = rx_buf.rs_id
    rs_rx_cnt[rs_index]++;
    db_sync[rs_index] = rx_buf;
  };
  ws_rs[rs_index].onclose = function (e) {
    setTimeout(function () {
      rs_link[rs_index] = " ... ";
      connect_sync(rs_index);
    }, 1000);
  };
  ws_rs[rs_index].onerror = function (e) {
    setTimeout(function () {
      rs_link[rs_index] = " err";
    }, 1000);
  };
}

function display() {
  dt = new Date();
  str = dt.toISOString().substring(11, 19)
  if (time != str) {
    console.clear();
    console.log("\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    time = str;
    m_str = ""
    for (i = 0; i < 100; i++) m_str = m_str + meter[i]
    console.log(m_str)
    for (i = 0; i < 100; i++) meter[i] = "\x1b[1;37m|"
    this_ip = ip.address()
    console.log("\x1b[1;33m db-" + db_id + ";\x1b[1;35m ip-" + this_ip + "; port-" + db_ps_port + "\x1b[1;37m" + "\x1b[1;32m  ps_total = " + ps_total + "; ts_total = " + ts_total + "\x1b[1;37m");
    console.table(sys_disp);
    d_array = [];
    console.log("\x1b[1;35m db_sync \x1b[1;37m");
    // d_array = JSON.parse(JSON.stringify(db_sync));
    for (i = 0; i < 2; i++) {
      d_array[i] = {}
      d_array[i].sync_ip = sync_ip[i]
      d_array[i].rs_link = rs_link[i];
      d_array[i].rs_tx_cnt = rs_tx_cnt[i];
      d_array[i].rs_rx_cnt = rs_rx_cnt[i];
      d_array[i].tick = db_sync[i].tick
      d_array[i].chain = db_sync[i].chain
      d_array[i].next_chain = db_sync[i].next_chain
    }
    console.table(d_array);
    console.log("\x1b[1;33m db_summary (to 9 rs) \x1b[1;37m");
    console.table({ db_summary });
    console.log("\x1b[1;32m db_ledger = \x1b[1;37m");
    console.table({ db_ledger });
    console.log("\x1b[1;35m ps_ledger_array \x1b[1;37m");
    d_array = [];
    for (i = 0; i < 3; i++) {
      d_array[i] = ps_ledger_array[i];
    }
    console.table(d_array);
    console.log("\x1b[1;35m ps interface  \x1b[1;37m");
    d_array = [];
    for (i = 0; i < 3; i++) {
      ps_id_ = i;
      ps_link_ = ps_link[i];
      ps_rx_cnt_ = ps_rx_cnt[i];
      ps_tx_cnt_ = ps_tx_cnt[i];
      d_array[i] = { ps_id_, db_ps_port, ps_link_, ps_rx_cnt_, ps_tx_cnt_};
    }
    console.table(d_array);
    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")

    console.log("\x1b[1;31m ps_request[i] to dbio \x1b[1;32m  dbio_ip = \x1b[1;37m" + dbio_ip + "\x1b[1;31m ; total ps_request = \x1b[1;37m");
    d_array = [];
    for (i = 0; i < 5; i++) { if (ps_request[i] != undefined) d_array[i] = ps_request[i]; }
    console.table(d_array);


    console.log("\x1b[1;32m ps_request[0].ts_request[0..] = \x1b[1;37m");
    d_array = [];
    for (i = 0; i < 3; i++) { try { d_array[i] = ps_request[0].ts_request[i]; } catch (e) { d_array[i] = {} } }
    console.table(d_array);

    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    console.log("\x1b[1;31m ps_result[i] (wait for sync) \x1b[1;37m");
    d_array = [];
    for (i = 0; i < 5; i++)  d_array[i] = ps_result[i];
    console.table(d_array);

    console.log("\x1b[1;32mps_result[0].ts_result[0..] = \x1b[1;37m");
    d_array = [];
    for (i = 0; i < 3; i++)  try {
      d_array[i] = ps_result[0].ts_result[i];
    } catch (e) { d_array[i] = {} }
    console.table(d_array);

    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    console.log("\x1b[1;31mps_result_sync[i] = (sync to send TS) \x1b[1;37m");
    d_array = [];
    try { for (i = 0; i < 5; i++) d_array[i] = ps_result_sync[i]; } catch (e) { d_array[i] = {} }
    console.table(d_array);

    console.log("\x1b[1;32m ps_result_sync[i].ps_ledger = \x1b[1;37m");
    d_array = [];
    for (i = 0; i < 5; i++) {
      d_array[i] = {}
      if (ps_result_sync[i] != undefined) d_array[i] = ps_result_sync[i].ps_ledger;
    }
    console.table(d_array);
  }
  summary_tick = db_summary.tick
  try { req0 = ps_request[0].ps_thread } catch (e) { req0 = 0 }
  try { req2 = ps_request[2].ps_thread } catch (e) { req2 = 0 }
  try { res0 = ps_result[0].ps_thread } catch (e) { res0 = 0 }
  try { res2 = ps_result[2].ps_thread } catch (e) { res2 = 0 }
  sys_disp[t_index] = { time, state, tick, summary_tick, req0, res0, req2, res2, dbio_link, dbio_op_cnt, dbio_tx, dbio_rx, vote, wait };
  t_index = Number(time.substring(6, 9))
  if (t_index >= disp_row) t_index = t_index - 30
  sys_disp[t_index] = {}
}

function save_files() {
  if (tick > db_summary.tick) {
    try { fs.writeFileSync("ledger/db_ledger.json", JSON.stringify(db_ledger)); } catch (e) { }
    try { fs.writeFileSync("ledger/ps_ledger.json", JSON.stringify(ps_ledger_array)); } catch (e) { }
    try { fs.writeFileSync("exchange/sync.json", JSON.stringify(db_sync[0])) } catch (e) { }
    try { fs.writeFileSync("exchange/ps_request.json", JSON.stringify(ps_request)); } catch (e) { }
    try { fs.writeFileSync("exchange/ps_result.json", JSON.stringify(ps_result)); } catch (e) { }
    dt = new Date();
    str = dt.toISOString().substring(0, 11)
    yy = Number(str.substring(0, 4))
    mm = Number(str.substring(5, 7))
    dd = Number(str.substring(8, 10))
    console.log("yy = " + yy + "; mm = " + mm + "; dd = " + dd)
    log_filename = "log/" + yy + "/" + mm + "/" + "log_db_summary_" + dd + ".jsonl";
    try { fs.appendFileSync(log_filename, JSON.stringify(json) + "\n"); } catch (e) { }
    str = JSON.stringify(db_summary)
    data_str = str + "\n";
    try { fs.appendFileSync(log_filename, data_str); } catch (e) { }
  }
}

function gen_db_summary() {
  if (summary_tick != tick) {
    summary_tick = tick
    start_db_ptr = db_ptr;
    for (i = 0; i < ps_total; i++) pwd = chain + JSON.stringify(ps_result[i])
    pwd = pwd + tick + JSON.stringify(db_ledger)
    hash = crypto.createHash("sha256").update(pwd).digest("hex");
    next_chain = hash.substring(0, 16);
    ledger = db_ledger
    db_summary = { tick, db_id, chain, next_chain, hash, ledger }
    gen_db_summary_cnt++
  }
}

function send_db_summary() {
  send_cnt = 0
  for (i = 0; i < rs_total; i++) {
    try {
      send_cnt++
      db_summary.rs_id = i;
      try { ws_rs[i].send(JSON.stringify(db_summary)); } catch (e) { connect_sync(i) }
      rs_tx_cnt[i]++;
    } catch (e) { connect_sync(i) }
  }
  if (send_cnt >= rs_total) return true
  return false
}

let dbio_op_cnt = 0

function gen_dbio() {
  if (dbio_link == "conn") {
    send_dbio_req = []
    for (i = 0; i < ps_total; i++) {
      if (ps_request[i] != undefined) {
        if (ps_request[i].ps_next_chain == undefined) { ps_request[i] = {} } else {
          ps_request[i].tick = tick
          send_dbio_req[i] = ps_request[i]
          dbio_op_cnt++
        }
      }
    }
  }
}

function send_dbio() {
  if (dbio_op_cnt > 0) {
    dbio_op_cnt = 0
    try { ws_dbio.send(JSON.stringify(send_dbio_req)) } catch (e) { connect_dbio() }
    dbio_tx++
  }
}

function rs_sync() {
  if (tick != db_sync[db_id].tick) {
    vote = 0
    test_tick = db_sync[db_id].tick
    for (i = 0; i < rs_total; i++) {
      if (db_sync[i].tick == test_tick) { vote++ }
    }
    if (vote == 9) {
      tick = db_sync[db_id].tick
      chain = db_sync[db_id].next_chain
      return true
    }
  }
  return false
}

function ledger_valid(ledger) {
  if (ledger.in_total > 0) return true
  if (ledger.q_total > 0) return true
  if (ledger.in_err > 0) return true
  if (ledger.q_err > 0) return true
  return false
}

function update_ledger() {
  for (i = 0; i < ps_total; i++) {
    try {
      if (ps_result[i].ps_chain == ps_request[i].ps_chain) {
        if (ledger_valid(ps_result[i].ps_ledger)) {
          if (ps_ledger_array[i].ps_thread != ps_result[i].ps_thread) {
            ps_ledger_array[i].ps_thread = ps_result[i].ps_thread
            ps_ledger_array[i].ps_chain = ps_result[i].ps_next_chain

            ps_ledger_array[i].in_total = ps_ledger_array[i].in_total + ps_result[i].ps_ledger.in_total
            ps_ledger_array[i].q_total = ps_ledger_array[i].q_total + ps_result[i].ps_ledger.q_total
            ps_ledger_array[i].in_err = ps_ledger_array[i].in_err + ps_result[i].ps_ledger.in_err
            ps_ledger_array[i].q_err = ps_ledger_array[i].q_err + ps_result[i].ps_ledger.q_err

            db_ledger.in_total = db_ledger.in_total + ps_result[i].ps_ledger.in_total
            db_ledger.q_total = db_ledger.q_total + ps_result[i].ps_ledger.q_total
            db_ledger.in_err = db_ledger.in_err + ps_result[i].ps_ledger.in_err
            db_ledger.q_err = db_ledger.q_err + ps_result[i].ps_ledger.q_err

            ps_ledger = ps_ledger_array[i]
            ts_result = ps_result[i].ts_result
            ps_result_sync[i] = { tick, db_id, ps_ledger, ts_result }
          }
        }
      }
    } catch (e) { }
  }
  db_ledger.tick = tick
  db_ledger.chain = next_chain
  save_files()
}

async function main() {
  t1 = Date.now()
  display();
  wait++
  vote = "."
  switch (state) {
    case "start":
      gen_db_summary()
      send_db_summary()
      if (rs_sync()) state = "wait_new_tick_sync"
      break;

    case "wait_ps":
      gen_dbio()
      if (wait > 4) {
        send_dbio()
        state = "wait_dbio"
      }
      break;

    case "wait_dbio":
      if (wait > 7) {
        gen_db_summary()
        send_db_summary()
        wait = 0
        state = "wait_new_tick_sync"
      }
      break;

    case "wait_new_tick_sync":
      if (rs_sync()) {
        update_ledger()
        wait = 0
        state = "wait_ps"
      } else send_db_summary()
      break;
  }
  load_meter(t1, "\x1b[1;31m|")
}

init();
setInterval(main, 1000);
