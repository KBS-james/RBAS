// web db_io
let ps_id = 0
let dash_id = 0
let req_json = { ps_id }
let ts_init = {}
let ts_ledger = []
let ps_ledger = []
let disp_json = {}

function clear_ps(i) {
    document.getElementsByClassName("ps_thread")[i].textContent = '-';
    document.getElementsByClassName("ps_in_total")[i].textContent = '-';
    document.getElementsByClassName("ps_q_total")[i].textContent = '-';
    document.getElementsByClassName("ps_in_err")[i].textContent = '-';
    document.getElementsByClassName("ps_q_err")[i].textContent = '-';
}

function clear_ts(i) {
    document.getElementsByClassName("ts_thread")[i].textContent = '-';
    document.getElementsByClassName("ts_in_total")[i].textContent = '-';
    document.getElementsByClassName("ts_q_total")[i].textContent = '-';
    document.getElementsByClassName("ts_in_err")[i].textContent = '-';
    document.getElementsByClassName("ts_q_err")[i].textContent = '-';
}

function disp_ps_ledger() {
    for (i = 0; i < 1000; i++) {
        if (disp_json.ps_ledger[i] != undefined) {
            document.getElementsByClassName("ps_thread")[i].textContent = disp_json.ps_ledger[i].ps_thread
            document.getElementsByClassName("ps_in_total")[i].textContent = disp_json.ps_ledger[i].in_total
            document.getElementsByClassName("ps_q_total")[i].textContent = disp_json.ps_ledger[i].q_total
            document.getElementsByClassName("ps_in_err")[i].textContent = disp_json.ps_ledger[i].in_err
            document.getElementsByClassName("ps_q_err")[i].textContent = disp_json.ps_ledger[i].q_err
        }
    }
}

function disp_ts_ledger(ps_id) {
    ts_ledger = disp_json.ts_ledger
    for (i = 0; i < 1000; i++) {
        if (ts_ledger[i] != undefined) {
            document.getElementsByClassName("ts_thread")[i].textContent = ts_ledger[i].ts_thread
            document.getElementsByClassName("ts_in_total")[i].textContent = ts_ledger[i].in_total
            document.getElementsByClassName("ts_q_total")[i].textContent = ts_ledger[i].q_total
            document.getElementsByClassName("ts_in_err")[i].textContent = ts_ledger[i].in_err
            document.getElementsByClassName("ts_q_err")[i].textContent = ts_ledger[i].q_err
        } else {
            document.getElementsByClassName("ts_thread")[i].textContent = "-"
            document.getElementsByClassName("ts_in_total")[i].textContent = "-"
            document.getElementsByClassName("ts_q_total")[i].textContent = "-"
            document.getElementsByClassName("ts_in_err")[i].textContent = "-"
            document.getElementsByClassName("ts_q_err")[i].textContent = "-"
        }
    }
}

function init() {
    tick = 0
    ts_thread = '-'
    in_total = '-'
    q_total = '-'
    in_err = '-'
    q_err = '-'
    ledger = { in_total, q_total, in_err, q_err }
    for (i = 0; i < 1000; i++) {
        document.getElementsByClassName("ps_id")[i].textContent = i;
        document.getElementsByClassName("ts_id")[i].textContent = i;
        ts_init[i] = { ts_thread, in_total, q_total, in_err, q_err }
        clear_ps(i)
        clear_ts(i)
    }
    disp_json = { tick, ledger, ps_ledger, ts_ledger }
}

var listItems = document.querySelectorAll("ul li");

listItems.forEach(function (item) {
    item.onclick = function (e) {
        console.log("mouse clicked")
        ps_id = this.innerText;
        console.log(ps_id)
        document.getElementById("ps_id").textContent = "PS-" + ps_id
    }
});

async function post_ledger() {
    const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req_json),
    };
    try { res = await fetch("/ledger_summary", options) } catch (e) { post_cnt = 0 };
    disp_json = await res.json();
    console.log("disp_json = ")
    console.log(disp_json)
}

init()

async function disp_ledger() {
    ps_id = Number(ps_id)
    req_json = { ps_id }
    post_ledger();
    dash_id = disp_json.dash_id
    dt = new Date();
    d = dt.toISOString().substring(0, 10);
    t = dt.toISOString().substring(11, 19)
    time = d + " " + t
    document.getElementById("logo").textContent = "RS-" + dash_id + " : Ledger summary";
    document.getElementById("time").textContent = "UTC time " + time;
    document.getElementById("in_total").textContent = disp_json.ledger.in_total
    document.getElementById("q_total").textContent = disp_json.ledger.q_total
    document.getElementById("in_err").textContent = disp_json.ledger.in_err
    document.getElementById("q_err").textContent = disp_json.ledger.q_err
    document.getElementById("tick").textContent = disp_json.tick
    disp_ps_ledger();
    disp_ts_ledger();
}

setInterval(disp_ledger, 1000);

