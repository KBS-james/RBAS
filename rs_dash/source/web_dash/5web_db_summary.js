// web db_io
let ps_total = 0;
const ts_total = 10;

let dash_id = 0
let new_nft = []
let nft_cnt = 0
let log_ptr = 0
let in_total = 0
let tick = 1000000000
let disp_ptr = 0
let disp_buf = []
let last_db_ptr = 0
function init() {
    document.getElementById("nft_cnt").textContent = 0
    document.getElementById("in_total").textContent = "-"
    document.getElementById("q_total").textContent = "-"
    document.getElementById("in_err").textContent = "-"
    document.getElementById("q_err").textContent = "-"
    document.getElementById("logo").textContent = "DB summary-"
    document.getElementById("tick").textContent = "-"
    document.getElementById("hash").textContent = "-"
    in_total = 0

    for (i = 0; i < 20; i++) {
        document.getElementsByClassName("time")[i].textContent = "."
        document.getElementsByClassName("tick")[i].textContent = "."
        document.getElementsByClassName("added")[i].textContent = "."
        document.getElementsByClassName("in_total")[i].textContent = "."
    }
    nft = "-"
    dao = "."
    for (i = 0; i < 40; i++) {
        db_ptr = i
        disp_buf[i] = { db_ptr, nft, dao }
        document.getElementsByClassName("index")[i].textContent = "-"
        document.getElementsByClassName("nft")[i].textContent = "-"
        document.getElementsByClassName("dao")[i].textContent = "-"
        document.getElementsByClassName("tick_")[i].textContent = "-"
    }
}

function disp_database() {
    new_nft = disp_json.new_nft;
    nft_cnt = 0
    if (new_nft.length > 0) nft_cnt = new_nft.length
    document.getElementById("nft_cnt").textContent = nft_cnt
    if (nft_cnt == 0) return

    for (i = 0; i < nft_cnt; i++) {
        if (new_nft[i].db_ptr > last_db_ptr) {
            last_db_ptr = new_nft[i].db_ptr
            disp_buf[log_ptr] = new_nft[i]
            log_ptr++
            log_ptr = log_ptr % 40
        }
    }
    for (i = 0; i < 40; i++) {
        document.getElementsByClassName("index")[i].textContent = disp_buf[i].db_ptr
        document.getElementsByClassName("nft")[i].textContent = disp_buf[i].nft
        tick_ = disp_buf[i].tick
        if (tick_ > 100000000) document.getElementsByClassName("tick_")[i].textContent = disp_buf[i].tick
        document.getElementsByClassName("dao")[i].textContent = disp_buf[i].dao
    }
    document.getElementsByClassName("index")[log_ptr].textContent = "-"
    document.getElementsByClassName("nft")[log_ptr].textContent = "-"
    document.getElementsByClassName("dao")[log_ptr].textContent = "-"
    document.getElementsByClassName("tick_")[log_ptr].textContent = "-"
}

function time_disp() {
    dt = new Date();
    d = dt.toISOString().substring(0, 10);
    t = dt.toISOString().substring(11, 19)
    time = d + " " + t
    document.getElementById("time").textContent = time;
    document.getElementsByClassName("time")[disp_ptr].textContent = time.substring(11, 24)
    document.getElementsByClassName("tick")[disp_ptr].textContent = tick
    if (nft_cnt == undefined) nft_cnt = 0
    document.getElementsByClassName("added")[disp_ptr].textContent = nft_cnt
    document.getElementsByClassName("in_total")[disp_ptr].textContent = in_total
    disp_ptr++
    disp_ptr = disp_ptr % 20
    document.getElementsByClassName("time")[disp_ptr].textContent = "."
    document.getElementsByClassName("tick")[disp_ptr].textContent = "."
    document.getElementsByClassName("added")[disp_ptr].textContent = "."
    document.getElementsByClassName("in_total")[disp_ptr].textContent = "."
    document.getElementById("logo").textContent = "RS-" + dash_id + " : DB summary";
}

function db_summary_disp() {
    if (tick != disp_json.db_summary.tick) {
        tick = disp_json.db_summary.tick
        if (tick == 1000000000) init()
        document.getElementById("tick").textContent = tick
        document.getElementById("hash").textContent = disp_json.db_summary.hash.substring(0, 32) + " " + disp_json.db_summary.hash.substring(32, 64)
        in_total = disp_json.db_summary.ledger.in_total
        document.getElementById("in_total").textContent = in_total
        document.getElementById("q_total").textContent = disp_json.db_summary.ledger.q_total
        document.getElementById("in_err").textContent = disp_json.db_summary.ledger.in_err
        document.getElementById("q_err").textContent = disp_json.db_summary.ledger.q_err
        if (disp_json.new_nft != undefined) disp_database()
    }
}

async function db_summary() {
    time_disp()
    const res = await fetch("/db_summary", { method: "POST" });
    disp_json = await res.json();
    dash_id = disp_json.dash_id
    db_summary_disp()
}

init()
setInterval(db_summary, 1000);
