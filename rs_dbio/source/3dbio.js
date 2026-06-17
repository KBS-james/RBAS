// dbio : input and query to database
// All chain and next_chain are first 8 characters (indices 0-7) of SHA256 hash

//#region const 
const fs = require("fs");
const ip = require("ip");
const crypto = require("crypto");
const par = JSON.parse(fs.readFileSync("par.json"));
const ps_total = par.ps_total;
const ts_total = par.ts_total
const db_id = par.rs_id   

let time = "";
let in_total = 0
let q_total = 0
let in_err = 0
let q_err = 0
let tick = 1000000000;
let ps_request = [];
let ps_result = [];
let ps_thread_array = []
let ts_result_array = []
let meter = []

let db_link = " ---";
let db_rx = 0
let db_tx = 0
let database = [];
let db_disp = [];
let db_disp_max = 500;
let db_disp_ptr = 0
let new_nft = []
let new_nft_ptr = 0
let db = [];
let db_ptr = 0;
let sys_disp = []
let disp_ptr = 0
let disp_row = 30

let recent_ts_requests = []
let recent_ts_results = []
const MAX_RECENT = 10

//#endregion

function get_hash_8chars(data) {
    return crypto.createHash("sha256").update(data).digest("hex").substring(0, 8);
}

function init() {
  filename = "DB/database.jsonl";
  const fileContent = fs.readFileSync(filename, "utf-8");
  const lines = fileContent.split("\n").filter((line) => line.trim());
  database = lines.map((line) => JSON.parse(line));
  db_ptr = database.length;
  database.forEach((item, i) => {
    const key = String(item.nft);
    const dao = item.dao;
    const tick = item.tick
    db[key] = { tick, dao };
  });

  for (i = 0; i < disp_row; i++) sys_disp[i] = {}

  for (i = 0; i < ps_total; i++) {
    ps_thread_array[i] = 0
    ps_result[i] = {}
    ts_result_array[i] = []
  }
  
  try {
    db_disp = JSON.parse(fs.readFileSync("exchange/db_disp.json"))
    db_disp_ptr = db_disp.length
  } catch(e) { db_disp = []; db_disp_ptr = 0 }
  
  try {
    new_nft = JSON.parse(fs.readFileSync("exchange/new_nft.json"))
    new_nft_ptr = new_nft.length
  } catch(e) { new_nft = []; new_nft_ptr = 0 }
  
  for (i = 0; i < 100; i++) meter[i] = "\x1b[1;30m|"
  
  for (let i = 0; i < MAX_RECENT; i++) {
    recent_ts_requests[i] = {}
    recent_ts_results[i] = {}
  }
}

let dbio_db_port = par.dbio_db_port[db_id];
const wss = new (require("ws").Server)({ port: dbio_db_port });
wss.on("connection", function (webSocket) {
  db_link = "conn"

  webSocket.on("message", function (message) {
    ps_request = JSON.parse(message);
    db_rx++
    if (db_rx > 100) db_rx = 0
    gen_ps_result()
    webSocket.send(JSON.stringify(ps_result));
    db_tx++;
    if (db_tx > 100) db_tx = 0
  });

  webSocket.on("close", function () {
    db_link = " ...."
  });
});

function valid_ts(i, j) {
  if (ps_request[i] == undefined) return false
  if (ps_request[i].ts_request == undefined) return false
  if (ps_request[i].ts_request[j] == undefined) return false
  if (ps_request[i].ts_request[j] == null) return false
  if (ps_request[i].ts_request[j] == {}) return false
  return true
}

function update_new_nft(item) {
  db_disp[db_disp_ptr] = item
  new_nft[new_nft_ptr] = item
  db_disp_ptr++
  new_nft_ptr++
  if (db_disp_ptr >= db_disp_max) db_disp_ptr = 0
}

function gen_ts_result(i, j) {
  let result_id = "_"
  let request = ps_request[i].ts_request[j]
  let nft = request.nft
  let service = request.service
  let ts_id = request.ts_id
  let ts_thread = request.ts_thread  
  let ts_chain = request.ts_chain
  let ts_next_chain = request.ts_next_chain
  
  if (service === "input") {
    if (db[nft] != undefined) {
      result_id = "error";
      in_err++;
    } else {
      let dao = i + "." + j;
      db[nft] = { tick, dao };
      database[db_ptr] = { nft, tick, dao };
      update_new_nft({ nft, tick, dao })
      new_db_str = new_db_str + JSON.stringify(database[db_ptr]) + "\n";
      db_ptr++;
      in_total++;
      result_id = tick + "." + dao;
    }
  }
  if (service === "query") {
    let db_data = db[nft]
    if (db_data == undefined) {
      result_id = "error";
      q_err++;
    } else {
      result_id = db_data.tick + "." + db_data.dao;
      q_total++;
    }
  }
  
  ts_result_array[i][j] = { 
    ts_id: ts_id,
    ts_thread: ts_thread,
    ts_chain: ts_chain,
    ts_next_chain: ts_next_chain,
    nft: nft,
    service: service,
    result_id: result_id
  }
  
  add_to_recent_requests(i, j, request, nft, ts_chain, ts_next_chain)
  add_to_recent_results(i, j, service, result_id, ts_chain, ts_next_chain)
}

function add_to_recent_requests(ps_id, ts_id, request, nft, ts_chain, ts_next_chain) {
  const entry = {
    ps_id: ps_id,
    ts_id: ts_id,
    service: request.service,
    nft_short: nft ? nft.substring(0, 16) + "..." : "???",
    ts_thread: request.ts_thread || 0,
    ts_chain: ts_chain,
    ts_next_chain: ts_next_chain,
    tick: tick
  }
  recent_ts_requests.unshift(entry)
  if (recent_ts_requests.length > MAX_RECENT) {
    recent_ts_requests.pop()
  }
}

function add_to_recent_results(ps_id, ts_id, service, result_id, ts_chain, ts_next_chain) {
  let status = result_id === "error" ? "❌ ERROR" : "✓ OK"
  let result_short = result_id === "error" ? "FAILED" : (result_id.length > 20 ? result_id.substring(0, 20) + "..." : result_id)
  
  const entry = {
    ps_id: ps_id,
    ts_id: ts_id,
    service: service,
    status: status,
    result: result_short,
    ts_chain: ts_chain,
    ts_next_chain: ts_next_chain,
    tick: tick
  }
  recent_ts_results.unshift(entry)
  if (recent_ts_results.length > MAX_RECENT) {
    recent_ts_results.pop()
  }
}

function valid_ps(i) {
  if (ps_request[i] == undefined) return false
  if (ps_request[i] == {}) return false
  if (ps_request[i] == null) return false
  if (ps_request[i].ps_thread == undefined) return false
  if (ps_request[i].ps_chain == undefined) return false
  if (ps_request[i].tick == undefined) return false
  tick = ps_request[i].tick
  ps_thread_array[i] = ps_request[i].ps_thread
  return true
}

let new_db_str = ""

function gen_ps_result() {
  t1 = Date.now()
  new_db_str = ""
  new_nft = []
  new_nft_ptr = 0
  
  for (i = 0; i < ps_total; i++) {
    if (valid_ps(i)) {
      let ps_in_total = 0;
      let ps_q_total = 0
      let ps_in_err = 0
      let ps_q_err = 0
      
      for (j = 0; j < ts_total; j++) {
        ts_result_array[i][j] = {}
        if (valid_ts(i, j)) {
          gen_ts_result(i, j)
          if (ps_request[i].ts_request[j].service === "input") {
            ps_in_total += (ts_result_array[i][j].result_id === "error" ? 0 : 1)
            ps_in_err += (ts_result_array[i][j].result_id === "error" ? 1 : 0)
          } else {
            ps_q_total += (ts_result_array[i][j].result_id === "error" ? 0 : 1)
            ps_q_err += (ts_result_array[i][j].result_id === "error" ? 1 : 0)
          }
        }
      }
      
      let ps_id = ps_request[i].ps_id
      let ps_chain = ps_request[i].ps_chain
      let ps_next_chain = ps_request[i].ps_next_chain
      let ps_thread = ps_request[i].ps_thread
      let ps_tick = ps_request[i].tick
      
      let ps_ledger = { in_total: ps_in_total, q_total: ps_q_total, in_err: ps_in_err, q_err: ps_q_err }
      let ts_result = ts_result_array[i]
      
      ps_result[i] = { 
        ps_id: ps_id,
        tick: ps_tick,
        ps_thread: ps_thread,
        ps_chain: ps_chain,
        ps_next_chain: ps_next_chain,
        ps_ledger: ps_ledger,
        ts_result: ts_result
      }
    }
  }
  
  filename = "DB/database.jsonl";
  try {
    fs.appendFileSync(filename, new_db_str);
    fs.writeFileSync("exchange/db_disp.json", JSON.stringify(db_disp))
  } catch (e) { }

  try { fs.writeFileSync("exchange/new_nft.json", JSON.stringify(new_nft)) } catch (e) { }
  load_meter(t1, "\x1b[1;32m|")
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

async function display() {
  dt = new Date();
  d = dt.toISOString().substring(0, 10);
  t = dt.toISOString().substring(11, 19)
  str = d + " " + t
  if (time != str) {
    time = str;
    t1 = Date.now()

    console.clear();
    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    this_ip = ip.address()
    m_str = ""
    for (i = 0; i < 100; i++) m_str = m_str + meter[i]
    console.log(m_str)
    for (i = 0; i < 100; i++) meter[i] = "\x1b[1;37m|"

    console.log("\n\x1b[1;33m dbio - " + db_id + ";\x1b[1;35m ip-" + this_ip + " dbio_db_port =" + dbio_db_port + "\x1b[1;32m ps_total = " + ps_total + "; ts_total = " + ts_total + "; \x1b[1;31m Ver-" + par.version + "\x1b[1;37m");

    console.log("\x1b[1;31m sys_disp \x1b[1;37m");
    console.table(sys_disp);
    
    d_array = [];
    console.log("\x1b[1;35m database (most recent 5) \x1b[1;37m");
    for (i = 0; i < 5; i++) {
      j = db_ptr - i - 1
      if (j > 0) {
        d_array[i] = JSON.parse(JSON.stringify(database[j]));
        d_array[i].db_ptr = j
      }
    }
    console.table(d_array);
    
    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    
    console.log("\n\x1b[1;36m📤 10 MOST RECENT TS_REQUESTS (chain = first 8 chars) \x1b[1;37m");
    if (recent_ts_requests.length > 0 && Object.keys(recent_ts_requests[0]).length > 0) {
      console.table(recent_ts_requests);
    } else {
      console.log("   (no requests processed yet)");
    }
    
    console.log("\n\x1b[1;36m📥 10 MOST RECENT TS_RESULTS (chain = first 8 chars) \x1b[1;37m");
    if (recent_ts_results.length > 0 && Object.keys(recent_ts_results[0]).length > 0) {
      console.table(recent_ts_results);
    } else {
      console.log("   (no results yet)");
    }
    
    console.log("\n\x1b[1;33m|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|=========|")
    
    console.log("\n\x1b[1;31m ps_request (first 5 ps, chain = first 8 chars) \x1b[1;37m");
    d_array = [];
    for (i = 0; i < Math.min(5, ps_total); i++) {
      if (ps_request[i]) {
        d_array[i] = {
          ps_id: ps_request[i].ps_id,
          ps_thread: ps_request[i].ps_thread,
          ps_chain: ps_request[i].ps_chain,
          ps_next_chain: ps_request[i].ps_next_chain,
          ts_count: ps_request[i].ts_request ? Object.keys(ps_request[i].ts_request).filter(k => ps_request[i].ts_request[k]).length : 0
        };
      } else {
        d_array[i] = { ps_id: i, ps_thread: "-", ps_chain: "-", ps_next_chain: "-", ts_count: 0 };
      }
    }
    console.table(d_array);
    
    console.log("\n\x1b[1;32m ps_result (first 5 ps, echoing request with result) \x1b[1;37m");
    d_array = [];
    for (i = 0; i < Math.min(5, ps_total); i++) {
      if (ps_result[i]) {
        d_array[i] = {
          ps_id: ps_result[i].ps_id,
          ps_thread: ps_result[i].ps_thread,
          ps_chain: ps_result[i].ps_chain,
          ps_next_chain: ps_result[i].ps_next_chain,
          in_total: ps_result[i].ps_ledger?.in_total || 0,
          in_err: ps_result[i].ps_ledger?.in_err || 0,
          q_total: ps_result[i].ps_ledger?.q_total || 0,
          q_err: ps_result[i].ps_ledger?.q_err || 0
        };
      } else {
        d_array[i] = { ps_id: i, ps_thread: "-", ps_chain: "-", ps_next_chain: "-", in_total: 0, in_err: 0, q_total: 0, q_err: 0 };
      }
    }
    console.table(d_array);

    sys_disp[disp_ptr] = { 
      tick, 
      time, 
      db_ptr, 
      db_link, 
      db_rx, 
      db_tx, 
      new_nft_ptr, 
      db_disp_ptr,
      recent_req: recent_ts_requests.length,
      recent_res: recent_ts_results.length
    };
    disp_ptr = Number(time.substring(17, 20))
    if (disp_ptr >= 30) { disp_ptr = disp_ptr - 30 }
    sys_disp[disp_ptr] = {}

    load_meter(t1, "\x1b[1;31m|")
  }
}

init();
setInterval(display, 100);