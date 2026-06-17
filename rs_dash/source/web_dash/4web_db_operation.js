// web db_io - optimized with white text compatibility
let ps_total = 0;
const ts_total = 10;

let index = 0;
let ts_id = 0;
let dash_id = 0;
let ps_thread = ".";
let time = "";
let in_total = 0;
let in_err = 0;
let q_total = 0;
let q_err = 0;
let nft = ".";
let ps_chain = ".";
let ps_next_chain = ps_chain;
let loop = 0;
let post_cnt = 0;
let ps_result = [];
let disp_ptr = 0;
let ps_ptr = 0;

// Get all elements by class name (original approach)
function clear_ps_log() {
  for (k = 0; k < 5; k++) {
    ptr = Number((k * 10) + disp_ptr);
    const logTime = document.getElementsByClassName("log_time")[ptr];
    const logPsThread = document.getElementsByClassName("log_ps_thread")[ptr];
    const logChain = document.getElementsByClassName("log_chain")[ptr];
    const logNextChain = document.getElementsByClassName("log_next_chain")[ptr];
    
    if (logTime) logTime.textContent = " .";
    if (logPsThread) logPsThread.textContent = " .";
    if (logChain) logChain.textContent = " .";
    if (logNextChain) logNextChain.textContent = " .";
  }
}

function clear_ts_result() {
  for (k = 0; k < 10; k++) {
    i = Number((ps_ptr * 10) + k);
    const threadEl = document.getElementsByClassName("thread")[i];
    const nftEl = document.getElementsByClassName("nft")[i];
    const serviceEl = document.getElementsByClassName("service")[i];
    const resultIdEl = document.getElementsByClassName("result_id")[i];
    const inTotalEl = document.getElementsByClassName("in_total")[i];
    const inErrEl = document.getElementsByClassName("in_err")[i];
    const qTotalEl = document.getElementsByClassName("q_total")[i];
    const qErrEl = document.getElementsByClassName("q_err")[i];
    
    if (threadEl) threadEl.textContent = " .";
    if (nftEl) nftEl.textContent = " .";
    if (serviceEl) serviceEl.textContent = " .";
    if (resultIdEl) resultIdEl.textContent = " .";
    if (inTotalEl) inTotalEl.textContent = " .";
    if (inErrEl) inErrEl.textContent = " .";
    if (qTotalEl) qTotalEl.textContent = " .";
    if (qErrEl) qErrEl.textContent = ".";
  }
}

function disp_ts_result() {
  if (ps_result[ps_ptr] == undefined) return;
  
  for (ts_id = 0; ts_id < 10; ts_id++) {
    index = ps_ptr * 10 + ts_id;
    if (ps_result[ps_ptr].ts_result[ts_id] != undefined) {
      try {
        const threadEl = document.getElementsByClassName("thread")[index];
        const nftEl = document.getElementsByClassName("nft")[index];
        const serviceEl = document.getElementsByClassName("service")[index];
        const resultIdEl = document.getElementsByClassName("result_id")[index];
        const inErrEl = document.getElementsByClassName("in_err")[index];
        const qTotalEl = document.getElementsByClassName("q_total")[index];
        const qErrEl = document.getElementsByClassName("q_err")[index];
        const inTotalEl = document.getElementsByClassName("in_total")[index];
        
        if (threadEl) threadEl.textContent = ps_result[ps_ptr].ts_result[ts_id].ts_thread;
        if (nftEl) nftEl.textContent = ps_result[ps_ptr].ts_result[ts_id].result.nft.substring(0, 16) + "...";
        if (serviceEl) serviceEl.textContent = ps_result[ps_ptr].ts_result[ts_id].result.service;
        if (resultIdEl) resultIdEl.textContent = ps_result[ps_ptr].ts_result[ts_id].result.result_id;
        if (inErrEl) inErrEl.textContent = ps_result[ps_ptr].ts_result[ts_id].ts_ledger.in_err;
        if (qTotalEl) qTotalEl.textContent = ps_result[ps_ptr].ts_result[ts_id].ts_ledger.q_total;
        if (qErrEl) qErrEl.textContent = ps_result[ps_ptr].ts_result[ts_id].ts_ledger.q_err;
        if (inTotalEl) inTotalEl.textContent = ps_result[ps_ptr].ts_result[ts_id].ts_ledger.in_total;
      } catch (e) { }
    }
  }
}

function disp_log() {
  console.log(ps_result);
  
  for (ps_ptr = 0; ps_ptr < 5; ps_ptr++) {
    if (ps_result[ps_ptr] != undefined) {
      ps_thread = ps_result[ps_ptr].ps_thread;
      ptr = ps_ptr * 10 + disp_ptr;
      
      const logTime = document.getElementsByClassName("log_time")[ptr];
      const logPsThread = document.getElementsByClassName("log_ps_thread")[ptr];
      const logChain = document.getElementsByClassName("log_chain")[ptr];
      const logNextChain = document.getElementsByClassName("log_next_chain")[ptr];
      
      if (logTime) logTime.textContent = time.substring(12, 20);
      if (logPsThread) logPsThread.textContent = ps_thread;
      if (logChain) logChain.textContent = ps_result[ps_ptr].ps_chain;
      if (logNextChain) logNextChain.textContent = ps_result[ps_ptr].ps_next_chain;
    }
    disp_ts_result();
  }
  
  disp_ptr++;
  if (disp_ptr >= 10) disp_ptr = 0;
  clear_ps_log();
}

function dbio_disp() {
  dt = new Date();
  d = dt.toISOString().substring(0, 10);
  t = dt.toISOString().substring(11, 19);
  time = d + " " + t;
  
  const timeEl = document.getElementById("time");
  const logoEl = document.getElementById("logo");
  const statusIndicator = document.getElementById("status-indicator");
  
  if (timeEl) timeEl.textContent = "UTC time " + time;
  if (logoEl) {
    logoEl.innerHTML = "RS-" + dash_id + " : DB_operation <span class='status-indicator online' id='status-indicator'></span>";
  }
  
  // Update PS summaries (5 PS sections, each with 2 groups of elements)
  for (i = 0; i < 5; i++) {
    const psThreadEl = document.getElementsByClassName("ps_thread")[i];
    const chainEl = document.getElementsByClassName("chain")[i];
    const nextChainEl = document.getElementsByClassName("next_chain")[i];
    const inputTotalEl = document.getElementsByClassName("input_total")[i];
    const inputErrorEl = document.getElementsByClassName("input_error")[i];
    const queryTotalEl = document.getElementsByClassName("query_total")[i];
    const queryErrorEl = document.getElementsByClassName("query_error")[i];
    
    if (psThreadEl) psThreadEl.textContent = " .";
    if (chainEl) chainEl.textContent = " .";
    if (nextChainEl) nextChainEl.textContent = " .";
    if (inputTotalEl) inputTotalEl.textContent = " .";
    if (inputErrorEl) inputErrorEl.textContent = " .";
    if (queryTotalEl) queryTotalEl.textContent = " .";
    if (queryErrorEl) queryErrorEl.textContent = " .";
    
    try {
      result = ps_result[i];
      if (psThreadEl) psThreadEl.textContent = result.ps_thread;
      if (chainEl) chainEl.textContent = result.ps_chain;
      if (nextChainEl) nextChainEl.textContent = result.ps_next_chain;
      if (inputTotalEl) inputTotalEl.textContent = result.ps_ledger.in_total;
      if (inputErrorEl) inputErrorEl.textContent = result.ps_ledger.in_err;
      if (queryTotalEl) queryTotalEl.textContent = result.ps_ledger.q_total;
      if (queryErrorEl) queryErrorEl.textContent = result.ps_ledger.q_err;
    } catch (e) { }
  }
  
  disp_log();
}

function init() {
  try {
    for (disp_ptr = 0; disp_ptr < 10; disp_ptr++) clear_ps_log();
    for (ps_ptr = 0; ps_ptr < 10; ps_ptr++) clear_ts_result();
  } catch (e) { }
}

async function web_db_io() {
  loop++;
  dbio_disp();
  
  try {
    res = await fetch("/dbio", { method: "POST" });
    rx_json = await res.json();
    dash_id = rx_json.dash_id;
    ps_result = rx_json.dbio_disp;
  } catch (e) {
    console.error("Fetch error:", e);
  }
}

init();
setInterval(web_db_io, 1000);