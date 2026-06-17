// web do_ps 

let dash_id = 0
let req_json = {}
let ps_summary = {}
let post_cnt = 0
let disp_ptr = 0

function clear_log(i) {
    document.getElementsByClassName("time")[i].textContent = "-"
    document.getElementsByClassName("tick")[i].textContent = "-"
    document.getElementsByClassName("chain")[i].textContent = "-"
    document.getElementsByClassName("next_chain")[i].textContent = "-"
}

function fill_count() {
    ps_ledger = ps_summary.ps_ledger
    ps_total = ps_ledger.length
    for (i = 0; i < ps_total; i++) {
        if (ps_ledger[i] != undefined) {
            document.getElementsByClassName("ps_in_total")[i].textContent = ps_ledger[i].in_total
            document.getElementsByClassName("ps_q_total")[i].textContent = ps_ledger[i].q_total
            document.getElementsByClassName("ps_thread")[i].textContent = ps_ledger[i].ps_thread
        }
    }
}

function init() {
    for (i = 0; i < 1000; i++) {
        document.getElementsByClassName("ps_thread")[i].textContent = 0
        document.getElementsByClassName("ps_in_total")[i].textContent = 0
        document.getElementsByClassName("ps_q_total")[i].textContent = 0
    }
    for (i = 0; i < 40; i++) {
        document.getElementsByClassName("time")[i].textContent = "-"
        document.getElementsByClassName("tick")[i].textContent = "-"
        document.getElementsByClassName("chain")[i].textContent = "-"
        document.getElementsByClassName("next_chain")[i].textContent = "-"
    }
    tick = 1000000000
    ts_result_array = []
    ps_result = []
    ts_index = 1
    service = "input"
    for (i = 0; i < 1000; i++) {
        ts_result_array[i] = []
        for (j = 0; j < 1; j++) {
            ts_id = j
            in_total = ts_index
            in_err = 0
            q_total = 0
            q_err = 0
            user_id = 0
            nft = "38b6aba0e9981a603fd951228f5b2dac7c8315f017aeb6f55a04aaf815469d01"
            ts_ledger = { in_total, in_err, q_total, q_err }
            result_id = "" + tick + "." + i + "." + j + "." + user_id
            result = { user_id, nft, service, result_id }
            ts_result_array[i][j] = { ts_id, ts_index, result, ts_ledger }
        }
        ts_result = ts_result_array[i]
        in_total = ts_index * 1000
        ps_ledger = { in_total, in_err, q_total, q_err }
        ps_result[i] = { tick, ps_ledger, ts_result }
    }
    chain = "9a912413024f8687a4b856cf"
    next_chain = chain
    in_total = ts_index * 1000000
    ledger = { in_total, in_err, q_total, q_err }
    ps_summary = { tick, chain, next_chain, ledger, ps_result }
}

function update_webpage() {
    dt = new Date();
    d = dt.toISOString().substring(0, 10);
    t = dt.toISOString().substring(11, 19)
    timeDisp = d + " " + t

    document.getElementById("logo").textContent = "RS-" + dash_id + " : PS summary";
    document.getElementById("time").textContent = timeDisp;
    tick = ps_summary.tick
    console.log("ps_summary = ")
    console.log(ps_summary)
    document.getElementById("tick").textContent = tick
    try {
        document.getElementById("in_total").textContent = ps_summary.db_summary.ledger.in_total
        document.getElementById("in_err").textContent = ps_summary.db_summary.ledger.in_err
        document.getElementById("q_total").textContent = ps_summary.db_summary.ledger.q_total
        document.getElementById("q_err").textContent = ps_summary.db_summary.ledger.q_err
        document.getElementById("chain").textContent = ps_summary.db_summary.chain.substring(0, 8) + "...";
        document.getElementById("next_chain").textContent = ps_summary.db_summary.next_chain.substring(0, 8) + "...";
    } catch (e) { }
    try {
        time = timeDisp.substring(11, 19)
        document.getElementsByClassName("time")[disp_ptr].textContent = time
        document.getElementsByClassName("tick")[disp_ptr].textContent = tick
        document.getElementsByClassName("chain")[disp_ptr].textContent = ps_summary.db_summary.chain.substring(0, 8) + "...";
        document.getElementsByClassName("next_chain")[disp_ptr].textContent = ps_summary.db_summary.next_chain.substring(0, 8) + "...";
        disp_ptr = (disp_ptr + 1) % 40
        clear_log(disp_ptr)

    } catch (e) { }

    fill_count()
}

init();

async function web_dbps() {
    const res = await fetch("/ps_summary", { method: "POST" });
    ps_summary = await res.json();
    dash_id = ps_summary.dash_id
    update_webpage();
}
setInterval(web_dbps, 1000);
