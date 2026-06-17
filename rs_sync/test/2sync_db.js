// sync_tester
// sim 9 db to 1 sync
// send 9 db_summary to testing sync

const crypto = require("crypto");
const ws = require("ws");
const fs = require("fs");
const par = JSON.parse(fs.readFileSync("par.json"));
const rs_total = par.rs_total
const sync_id = par.rs_id;
let tx_cnt = 0;
let rx_cnt = 0;
let loop = 0;
let ws_db = {};
let db_link = "----";
let db_summary = [];
let db_sync = [];
let tick = 1000000000;
let db_tick = tick;
let time = Date().substring(4, 24);
let in_total = 0;
let in_err = 0;
let q_total = 0;
let q_err = 0;
let ledger = { in_total, in_err, q_total, q_err };
let rs_adr = "";
let chain = "38b6aba0e9981a60";
let next_chain = "38b6aba0e9981a60";
let hash = "38b6aba0e9981a6038b6aba0e9981a6038b6aba0e9981a6038b6aba0e9981a60"
let state = "send_db_summary"
let sys_disp = []
let sys_disp_ptr = 0
let disp_row = 30
let wait = 0
for (i = 0; i < disp_row; i++) sys_disp[i] = {}

function init() {
  connect_db_sync();
  filename = "exchange/rs_summary.json"
  rs_summary = JSON.parse(fs.readFileSync(filename));
  db_summary[0] = rs_summary.db_summary[0];
}

let port = 0
function connect_db_sync() {
  port = par.sync_db_port[sync_id]
  rs_adr = par.rs_ip_array[sync_id] + port;
  // console.log("rs_adr = " + rs_adr)
  ws_db = new ws(rs_adr);

  ws_db.onopen = function () {
    db_link = "conn";
  };

  ws_db.onmessage = function (event) {
    input = JSON.parse(event.data);
    if (input.tick != "sync") {
      tick = input.tick;
      // chain = next_chain;
    }
    db_id = input.db_id;
    db_sync[db_id] = input;
    db_link = "conn";
    rx_cnt++;
  };

  ws_db.onclose = function (e) {
    setTimeout(function () {
      db_link = "----";
      connect_db_sync(db_id);
    }, 1000);
  };

  ws_db.onerror = function (e) { db_link = " ----"; };
}

function display() {
  if (time != Date().substring(4, 24)) {
    time = Date().substring(4, 24);
    console.clear();
    console.log(
      "\x1b[1;33m sync-db " + sync_id + " test- \x1b[1;35m" +
      par.version +
      "\x1b[1;32m " +
      time + "\x1b[1;37m"
    );
    console.table({ port, db_link })
    console.log("\n\x1b[1;35m" + "sys_disp = " + "\x1b[1;37m");
    console.table(sys_disp);

    console.log("\n\x1b[1;35m db_sync \x1b[1;37m ");
    console.table(db_sync);
    console.log("\n\x1b[1;35m db_summary \x1b[1;37m ");
    console.table(db_summary);
    console.log("\n\x1b[1;35m db_summary[0].ledger \x1b[1;37m ");
    ledger = db_summary[0].ledger;
    console.table({ ledger });

    console.log("\n\x1b[1;35m db_sync[0] \x1b[1;37m ");
    console.table(db_sync[0]);
    console.log("\n");
    d = new Date();
    var str = "" + d;
    time_ = time.substring(12, 21)
    sys_disp[sys_disp_ptr] = { time_, state, tick, db_tick, loop, wait, tx_cnt, rx_cnt, chain, next_chain};
    t = str.substring(22, 24)
    num = parseInt(t, 10)
    sys_disp_ptr = num % disp_row
    sys_disp[sys_disp_ptr] = {}
  }
}

function send_db_summary() {
  db_tick = tick;
  in_total++
  in_err++
  q_total++
  q_err++
  ledger = { in_total, in_err, q_total, q_err };

  pwd = "" + db_summary.hash + tick;
  hash = crypto.createHash("sha256").update(pwd).digest("hex");
  chain = next_chain
  next_chain = hash.substring(0, 16);
  for (i = 0; i < rs_total; i++) {
    db_id = i
    db_summary[i] = { tick, sync_id, db_id, chain, next_chain, hash, ledger };
    if (db_link == "conn") {
      ws_db.send(JSON.stringify(db_summary[i]));
      tx_cnt++;
    }
  }
}

function all_db_sync() {
  if (db_sync[0] == undefined) return false
  for (i = 0; i < rs_total; i++) {
    if (db_sync[i].tick != tick) return false
  }
  if (tick <= db_tick) return false
  return true
}

init();

function db_sim() {
  wait++
  loop++;
  display();
  switch (state) {

    case "wait_sync":
      if (all_db_sync()) state = "send_db_summary"
      send_db_summary()
      break;

    case "send_db_summary":
      send_db_summary()
      state = "wait_sync"
      wait = 0
      break;
  }
}

setInterval(db_sim, 1000);
