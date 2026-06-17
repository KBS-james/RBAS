// sim 9 dash connection to 9 rs

const crypto = require("crypto");
const ws = require("ws");
const fs = require("fs");
const fsExtra = require('fs-extra');
const par = JSON.parse(fs.readFileSync("par.json"))
const sync_id = par.rs_id;

let tx_cnt = 0
let rx_cnt = 0
let loop = 0
let tick = 1000000000
let dash_tick = 0
let ws_dash = {};
let dash_link = {};
let dash_req = {}
let dash_sync = []
let time = ""
let dash_rs_ip = ""

function connect_dash_rs() {
    port = par.sync_dash_port[sync_id]
    dash_rs_ip = par.rs_ip_array[sync_id] + port
    console.log("dash_rs_ip = " + dash_rs_ip)
    ws_dash = new ws(dash_rs_ip);

    ws_dash.onopen = function () {
        dash_link = "conn";
    };

    ws_dash.onmessage = function (event) {
        input = JSON.parse(event.data);
        dash_id = input.dash_id
        dash_sync[dash_id] = input
        dash_tick = input.tick;
        rx_cnt++
    };
    ws_dash.onclose = function (e) {
        setTimeout(function () {
            dash_link = "----";
            connect_dash_rs();
        }, 1000);
    };
    ws_dash.onerror = function (e) { };
}

function init() {
    chain = par.seed_hash.substring(0, 16)
    next_chain = chain
    id = par.rs_id
    dash_req = { tick, chain, next_chain }
    connect_dash_rs();
}

function display() {
    const d = new Date();
    var str = "" + d;
    if (time != str.substring(4, 24)) {
        time = str.substring(4, 24);
        console.clear();
        console.log("\x1b[1;33m dash_end - sync_test \x1b[1;35m" + par.version + "\x1b[1;32m " + time + "\x1b[1;37m");
        rs_total = par.rs_total
        d_array = { rs_total, tick, loop, dash_tick, tx_cnt, rx_cnt }
        console.table({ d_array })
        console.table({ dash_rs_ip, dash_link })
        console.log("\n\x1b[1;35m dash_req \x1b[1;37m ");
        console.table({ dash_req })
        console.log("\n\x1b[1;35m dash_sync \x1b[1;37m ");
        console.table(dash_sync)
        console.log("\n")
    }
}

function update() {
    if (dash_tick > tick) {
        tick = dash_tick
        chain = dash_sync[0].chain
        next_chain = dash_sync[0].next_chain
        dash_req = { tick, chain, next_chain }
        rx_cnt++;
    }
}

function send_dash_req() {
    for (i = 0; i < 9; i++) {
        dash_id = i
        rs_id = sync_id
        dash_req = { tick, rs_id, dash_id, chain, next_chain }
        if (dash_link == "conn") {
            ws_dash.send(JSON.stringify(dash_req));
            tx_cnt++
        }
    }
}

init();
function test_dash() {
    loop++;
    display()
    update()
    send_dash_req()
}

setInterval(test_dash, 1000);
