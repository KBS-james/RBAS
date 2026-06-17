// dash:- real time dashboard to public
//     init   
//     sync   output   - dash_request to 9 root_servers
//            input    - dash_sync from 9 root_servers
//     log             - log/yy/mm/log_rs_sync_dd.jsonl
//     manage HTTP     - web_pages from local root_server
//     http   input    - from web_port_dash with express 
//            output   
//            - "/rs_sync"; disp_rs_sync = { start_time, dash_id, dash_sync }
//            - "/db_sync"; disp_db_sync = { rs_summary, dash_id }
//            - "/db16", disp_db16 = { tick, dash_id, in_total, db16_buf }
//            - "/dbio" disp_db_operation = { dash_id, dbio_disp }
//            - "/db_summary" disp_db_summary = { dash_id, db_summary, new_nft }
//            - "/ps_summary"disp_ps_summary = { tick, db_summary, ps_ledger, dash_id }
//            - "/ledger_summary" = { tick, dash_id, web_ps_id, ledger, ps_ledger, ts_ledger }

const fs = require("fs");
const ip = require("ip");
const ws = require("ws");
const express = require("express");
const app = express();
const par = JSON.parse(fs.readFileSync("par.json"))
let ps_total = par.ps_total
let dash_id = par.rs_id

// const dash_id = Number(process.argv[2]);
let tick = 1000000000
let time = ""
let dash_sync = [];
let ws_rs = [];
let link_status = [];
let dash_req = [];
let rs_rx_cnt = 0;
let rs_tx_cnt = 0;

let w_rs_sync_req = 0
let w_db_sync_req = 0
let w_db_16_req = 0
let w_db_operation_req = 0
let w_db_summary_req = 0
let w_ps_summary_req = 0
let w_ledger_req = 0

let disp_rs_sync = {}
let disp_db_sync = {}
let disp_db_operation = {}
let disp_db16 = {}
let disp_db_summary = {}
let disp_ps_summary = {}
let disp_ledger_summary = {}

let dbio_disp = {}
let connect_try = []
let input = {}
let rs_summary = []
let db_summary = {}
let ps_result = []
let ledger = {}
let ps_ledger = []
let rs_ip = []
let web_rx_json = {}
let web_ps_id = 0
let err_code = "web rx error"
let web_port_dash = par.dash_port[dash_id]
let last_db_ptr = 0
app.use(express.static("source/web_dash"));
app.use(express.json());
app.listen(web_port_dash)

function init() {
  start_time = par.rbas_start_time
  filename = "exchange/rs_summary.json"
  for (i = 0; i < 9; i++) {
    link_status[i] = ".... ";
    connect_try[i] = 0
    dash_req[i] = {}
    dash_sync[i] = JSON.parse(fs.readFileSync(filename))
  }
  web_update()
  for (i = 0; i < par.rs_total; i++) connect_ws(i);
  filename = "exchange/sync.json"
  rs_summary = JSON.parse(fs.readFileSync(filename))
  filename = "exchange/db_disp.json"
  db16_buf = JSON.parse(fs.readFileSync(filename))
}

app.post("/rs_sync", async (req, res) => {
  try { web_rx_json = req.body } catch (e) { web_rx_json = { err_code, w_rs_sync_req } }
  w_rs_sync_req++
  res.json(disp_rs_sync);
});
app.post("/db_sync", async (req, res) => {
  try { web_rx_json = req.body } catch (e) { web_rx_json = { err_code, w_db_sync_req } }
  w_db_sync_req++
  res.json(disp_db_sync);
});
app.post("/db16", async (req, res) => {
  try { web_rx_json = req.body } catch (e) { web_rx_json = { err_code, w_db_sync_req } }
  w_db_16_req++
  res.json(disp_db16);
});
app.post("/dbio", async (req, res) => {
  try { web_rx_json = req.body } catch (e) { web_rx_json = { err_code, w_db_operation_req } }
  w_db_operation_req++
  res.json(disp_db_operation);
});
app.post("/db_summary", async (req, res) => {
  try { web_rx_json = req.body } catch (e) { web_rx_json = { err_code, w_ps_summary_req } }
  w_db_summary_req++
  res.json(disp_db_summary);
});
app.post("/ps_summary", async (req, res) => {
  try { web_rx_json = req.body } catch (e) { web_rx_json = { err_code, w_ps_summary_req } }
  w_ps_summary_req++
  res.json(disp_ps_summary);
});
app.post("/ledger_summary", async (req, res) => {
  try { web_rx_json = req.body } catch (e) { web_rx_json = { err_code, w_ledger_req } }
  w_ledger_req++
  web_ps_id = web_rx_json.ps_id
  res.json(disp_ledger_summary);
});

async function connect_ws(rs_index) {
  connect_try[rs_index]++
  port = par.sync_dash_port[rs_index]
  rs_ip[rs_index] = par.rs_ip_array[rs_index] + port
  ws_rs[rs_index] = new ws(rs_ip[rs_index]);
  ws_rs[rs_index].onopen = function () {
    link_status[rs_index] = " conn ";
  };

  ws_rs[rs_index].onmessage = function (event) {
    input = JSON.parse(event.data);
    rs_index = input.rs_id
    link_status[rs_index] = " conn ";
    input.dash_id = dash_id
    dash_sync[rs_index] = input
    tick = input.tick
    rs_rx_cnt++;
    if (rs_rx_cnt >= 100) rs_rx_cnt = 0
  };

  ws_rs[rs_index].onclose = function (e) {
    setTimeout(function () {
      link_status[rs_index] = " .... ";
      connect_ws(rs_index);
    }, 1000);
  };

  ws_rs[rs_index].onerror = function (e) {
  };
}

function display() {
  dt = new Date();
  d = dt.toISOString().substring(0, 10);
  t = dt.toISOString().substring(11, 19)
  time_str = d + " " + t
  if (time != time_str) {
    time = time_str;
    console.clear();
    console.log(".")
    this_ip = ip.address()
    console.log("\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    console.log("\x1b[1;33m dash-" + dash_id + ";\x1b[1;35m ip-" + this_ip + "; port-" + web_port_dash + "\x1b[1;32m UTC-" + time + "; \x1b[1;31m Ver-" + par.version + "\x1b[1;37m");
    dash_sta = { web_port_dash, tick, rs_tx_cnt, rs_rx_cnt, web_ps_id, last_db_ptr }
    console.table({ dash_sta })

    console.log("\x1b[1;32m RS interface  \x1b[1;37m");
    d_array = []
    for (i = 0; i < 9; i++) {
      rs_ip_ = rs_ip[i]
      link_status_ = link_status[i]
      connect_try_ = connect_try[i]
      d_array[i] = { rs_ip_, link_status_, connect_try_ }
    }
    console.table(d_array);
    console.log("\x1b[1;32m dash_req[0] = \x1b[1;37m");
    d_array = dash_req[0]
    console.table({ d_array });
  
    console.log("\x1b[1;32m web_disp_req total =  \x1b[1;37m");
    web_req_cnt = { w_rs_sync_req, w_db_sync_req, w_db_operation_req, w_ps_summary_req, w_db_16_req, w_db_summary_req, w_ledger_req }
    console.table({ web_req_cnt })

    console.log("\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    console.log("\x1b[1;31m 1. dash_sync = \x1b[1;37m");
    console.table(dash_sync);
    d_array = []
    console.log(" \x1b[1;31m 2. rs_summary = \x1b[1;37m");
    console.table({ rs_summary });
    console.log(" \x1b[1;32m rs_summary.db_summary[i] = \x1b[1;37m");
    for (i = 0; i < 3; i++) {
      try { d_array[i] = rs_summary.db_summary[i] } catch (e) { d_array[i] = {} }
    }
    console.table(d_array);
    for (i = 0; i < 3; i++) {
      try { d_array[i] = rs_summary.db_summary[i].ledger } catch (e) { d_array[i] = {} }
    }
    console.table(d_array);
    console.log(" \x1b[1;31m 3. disp_db_operation = \x1b[1;37m");
    console.table(disp_db_operation);

    console.log(" \x1b[1;32m dbio_disp - ps_result \x1b[1;37m");
    d_array = []
    console.table(dbio_disp);
    console.log(" \x1b[1;31m 4. disp_ps_summary = \x1b[1;37m");
    console.table({ disp_ps_summary })
    d_array = []
    console.log(" \x1b[1;31m 5. disp_db16 (up to db16_disp_max) = \x1b[1;37m");
    console.table({ disp_db16 })
    for (i = 0; i < 3; i++) {
      try { d_array[i] = db16_buf[i] } catch (e) { d_array[i] = {} }
    }
    console.table(d_array);
    d_array = []
    console.log(" \x1b[1;31m 6. ps_result[i].ps_ledger = \x1b[1;37m");
    for (i = 0; i < 2; i++) {
      try { d_array[i] = ps_result[i].ps_ledger } catch (e) { d_array[i] = {} }
    }
    console.table(d_array);
    d_array = []
    console.log(" \x1b[1;32m ps_result[0].ts_result[0] = \x1b[1;37m");
    for (i = 0; i < 2; i++) {
      try { d_array[i] = ps_result[0].ts_result[i] } catch (e) { d_array[i] = {} }
    }
    console.table(d_array);
    console.log(" \x1b[1;31m 7. disp_ledger_summary = \x1b[1;37m");
    console.table({ disp_ledger_summary })
  }
}

function poll_rs() {
  for (i = 0; i < par.rs_total; i++) {
    if (link_status[i] == " conn ") {
      dash_req[i] = dash_sync[i]
      dash_req[i].dash_id = dash_id
      dash_req[i].rs_id = i
      try { ws_rs[i].send(JSON.stringify(dash_req[i])) } catch (e) { connect_ws(i) }
      rs_tx_cnt++;
      if (rs_tx_cnt >= 100) rs_tx_cnt = 0
    }
  }
}

function get_ts_ledger(ps_index) {
  if (ps_index < ps_total) {
    filename = "ledger/ts_ledger_" + ps_index + ".json"
    try {reply = JSON.parse(fs.readFileSync(filename))} catch(e) {return {}}
    return reply
  }
  return {}
}

function get_ps_result(ps_index) {
  if (ps_index < ps_total) {
    filename = "ps_result/ps_result_" + ps_index + ".json"
    reply = JSON.parse(fs.readFileSync(filename))
    return reply
  }
  return {}
}

let last_tick = 0
function time_log(log) {
  dt = new Date();
  d = dt.toISOString().substring(0, 10);
  t = dt.toISOString().substring(11, 19)
  time_str = d + " " + t
  yy = Number(time_str.substring(0, 4))
  mm = Number(time_str.substring(5, 7))
  dd = Number(time_str.substring(8, 10))
  log_data = { t, log }
  filename = "log/" + yy + "/" + mm + "/log_rs_sync_" + dd + ".jsonl"
  fs.appendFileSync(filename, JSON.stringify(disp_rs_sync) + "\n")
}

function web_update() {
  // 1
  disp_rs_sync = { start_time, dash_id, dash_sync }
  try {
    if (last_tick != dash_sync[dash_id].tick) {
      last_tick = dash_sync[dash_id].tick
      time_log(dash_sync)
    }
  } catch (e) { }

  // 2
  filename = "exchange/rs_summary.json"
  try { rs_summary = JSON.parse(fs.readFileSync(filename)) } catch (e) { }
  disp_db_sync = { rs_summary, dash_id }

  // 3
  try {
    for (i = 0; i < 5; i++) {
      ps_result[i] = get_ps_result(i)
      dbio_disp[i] = ps_result[i]
    }
  } catch (e) { }
  disp_db_operation = { dash_id, dbio_disp }

  // 4
  filename = "ledger/ps_ledger.json"
  try {
    ps_ledger = JSON.parse(fs.readFileSync(filename))
    disp_ps_summary = { tick, db_summary, ps_ledger, dash_id }
  } catch (e) { }

  // 5
  filename = "exchange/db_disp.json"
  try {
    db16_buf = JSON.parse(fs.readFileSync(filename))
    in_total = rs_summary.db_summary[0].ledger.in_total
    disp_db16 = { tick, dash_id, in_total, db16_buf }
  } catch (e) { }

  // 6
  filename = "exchange/new_nft.json"
  try {
    new_nft = JSON.parse(fs.readFileSync(filename))
    db_summary = rs_summary.db_summary[dash_id]
    disp_db_summary = { dash_id, db_summary, new_nft }
  } catch (e) { }

  // 7
  try {
    ts_ledger = get_ts_ledger(web_ps_id)
    ledger = db_summary.ledger
    disp_ledger_summary = { tick, dash_id, web_ps_id, ledger, ps_ledger, ts_ledger }
  } catch (e) { }
}

init();

async function dash_main() {
  display();
  poll_rs()
  if (dash_sync[dash_id] != undefined) web_update()
}

setInterval(dash_main, 1000);
