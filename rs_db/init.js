// init_rs          - gen ps_request for rs_test; for 4db_test, and 6sync_test
//                  - run with init
//
// ps_request_array = [{ps_id, ps_thread, ps_chain, ps_next_chain, ts_request_array}, ... ]
// ps_request       = {ps_id, ps_thread, ps_chain, ps_next_chain, ts_request_array}
// ts_request_array = [{ts_id, nft, service}, ...]
// ts_request       = {ts_id, nft, service}
//
// ps_result_array  = [{ ps_ledger, ts_result_array }, ... ]
// ps_ledger        = { ps_id, ps_thread, ps_chain, in_total, q_total, in_err, q_err }
// ts_result_array  = [{ ts_id, nft, service, result_id  }, ...]

// rbas init for both rs and ps
// db[nft]             = { tick, dao }
// database.jsonl      = { nft, tick, dao }
// sync                = { tick, chain, next_chain, hash }
// rs_summary          = { rs_id, tick, chain, next_chain, hash, db_summary }
// db_summary[i]       = { db_id, tick, chain, next_chain, hash, ledger }
// db_ledger           = { tick, chain, in_err, in_total, q_err, q_total }
// ps_ledger_array[i]  = { ps_id, ps_thread, ps_chain, in_total, q_total, in_err, q_err }

// fs.writeFileSync("db/database.jsonl", JSON.stringify(ps_root))
// fs.writeFileSync("ledger/db_ledger.json", JSON.stringify(db_ledger))
// fs.writeFileSync("ledger/ps_ledger.json", JSON.stringify(ps_ledger))
// fs.writeFileSync("exchange/sync.json", JSON.stringify(sync))
// fs.writeFileSync("exchange/rs_summary.json", JSON.stringify(rs_summary))
// fs.writeFileSync("exchange/db_summary.json", JSON.stringify(db_summary))
// fs.writeFileSync("exchange/new_nft.json", JSON.stringify(new_nft))
// fs.writeFileSync("exchange/db_disp.json", JSON.stringify(db_disp))

//#region const
const fs = require("fs");
const fsExtra = require("fs-extra");
const crypto = require("crypto");

const par = JSON.parse(fs.readFileSync("par.json"));
const ps_total = par.ps_total
const ts_total = par.ts_total
const ps_skip = 1
const ts_skip = 1

let tick = 1000000000
let hash = par.seed_hash
let ps_root = []
let ps_ledger = []

console.clear()
time = Date().substring(4, 24);
console.log("\n\n time = " + time)
fsExtra.emptyDirSync("log");
fsExtra.emptyDirSync("exchange");
fsExtra.emptyDirSync("db");
fsExtra.emptyDirSync("ps_result");
fsExtra.emptyDirSync("ledger");

nft = par.hash
dao = "root_rbas"
db = { nft, tick, dao }
filename = "db/database.jsonl"
fs.appendFileSync(filename, JSON.stringify(db) + "\n")
// setup ps_root, ps_ledger, ledger
t1 = Date.now()
in_err = 0
in_total = 0
q_err = 0
q_total = 0
ps_thread = 0
db_disp = []
new_nft = []
ps_init_key = []
//#endregion

//#region init_ps_ledger
for (i = 0; i < 1000; i++) {
  pwd = hash + "." + i
  nft = crypto.createHash("sha256").update(pwd).digest("hex")
  ps_init_key[i] = nft
  ps_id = i
  ps_root[i] = nft
  dao = "root_ps_" + i
  db = { nft, tick, dao }
  db_disp[i] =  { nft }
  new_nft[i] =  { nft, tick, dao }
  filename = "db/database.jsonl"
  fs.appendFileSync(filename, JSON.stringify(db) + "\n")
  ps_chain = nft.substring(0, 16)
  ps_ledger[i] = { ps_id, ps_thread, ps_chain, in_total, q_total, in_err, q_err }
}
chain = hash.substring(0, 16)
db_ledger = { tick, chain, in_err, in_total, q_err, q_total }
ledger = { tick, chain, in_err, in_total, q_err, q_total }
fs.writeFileSync("ps_init_key.json", JSON.stringify(ps_init_key))
fs.writeFileSync("ledger/db_ledger.json", JSON.stringify(db_ledger))
fs.writeFileSync("ledger/ps_ledger.json", JSON.stringify(ps_ledger))
fs.writeFileSync("exchange/new_nft.json", JSON.stringify(new_nft))
fs.writeFileSync("exchange/db_disp.json", JSON.stringify(db_disp))

t2 = Date.now()
time = t2 - t1
console.log("\n  setup ps_root, ps_ledger time = " + time)
//#endregion

//#region init_exchange log
chain = hash.substring(0, 8)
next_chain = chain
sync = { tick, chain, next_chain, hash }
fs.writeFileSync("exchange/sync.json", JSON.stringify(sync))

db_summary = []
for (i = 0; i < 9; i++) {
  db_id = i
  db_summary[i] = { db_id, tick, chain, next_chain, hash, ledger }
}
fs.writeFileSync("exchange/db_summary.json", JSON.stringify(db_summary))

rs_id = par.id
rs_summary = { rs_id, tick, chain, next_chain, hash, db_summary }
fs.writeFileSync("exchange/rs_summary.json", JSON.stringify(rs_summary))

for (i = 2026; i < 2028; i++) {
  dir_name = "log/" + i
  try { fs.mkdirSync(dir_name) } catch (e) { }
  for (j = 1; j < 13; j++) {
    dir_name = "log/" + i + "/" + j
    try { fs.mkdirSync(dir_name) } catch (e) { }
  }
}
//#endregion

//#region init_test (test data generation removed)
console.log("\n  setup complete. Test data generation removed.")
console.log("  3dbio_db.js will generate its own test requests dynamically.\n")
//#endregion