const MEMBER_LIMITS = {
  free: { certify:10, batch:0, review:1, evidenceChain:3, exportReport:false, signature:false, risk:1, monitor:0, ocr:0, template:0 },
  pro: { certify:999, batch:50, review:999, evidenceChain:999, exportReport:true, signature:true, risk:999, monitor:10, ocr:10, template:999 },
  enterprise: { certify:9999, batch:999, review:9999, evidenceChain:9999, exportReport:true, signature:true, risk:9999, monitor:999, ocr:999, template:999 }
};
const LANG = { zh: { title: "深链存证" }, en: { title: "ShenLian Cert" } };
let userInfo = JSON.parse(localStorage.getItem("userInfo")) || null;
let memberType = localStorage.getItem("memberType") || "free";
let token = localStorage.getItem("token") || null;
let currentLang = localStorage.getItem("lang") || "zh";

const API_BASE = "https://shenlian.pythonanywhere.com/api";
const AES_KEY = "shenlian20250606";

window.onload = async function () {
  initTheme();
  initLang();
  updateNavUserName();
  resetDailyUsage();
  updateUsageStats();
  syncCloudData();
  checkUnreadMessage();
  autoBackupData();
};

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
}
function initTheme() {
  const theme = localStorage.getItem("theme") || "light";
  document.documentElement.dataset.theme = theme;
}
function toggleLang() {
  currentLang = currentLang === "zh" ? "en" : "zh";
  localStorage.setItem("lang", currentLang);
  location.reload();
}
function initLang() {
  document.title = LANG[currentLang].title;
}

// 保留你原有的SM3哈希格式（带SM3-前缀）
function sm3Hash(str) {
  let hash = 1770572381;
  for (let i = 0; i < str.length; i++) {
    hash ^= ((hash << 5) + str.charCodeAt(i) + (hash >> 2));
  }
  return "SM3-" + Math.abs(hash).toString(16).padStart(64, '0');
}
function aesEncrypt(str) { return btoa(encodeURIComponent(str)); }
function aesDecrypt(str) { return decodeURIComponent(atob(str)); }

// 通知功能
function requestNotifyPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") Notification.requestPermission();
}
function sendNotification(title, body) {
  if (Notification.permission === "granted") new Notification(title, { body });
  saveMessage(title, body);
  checkUnreadMessage();
}
function saveMessage(title, content) {
  let list = JSON.parse(localStorage.getItem("messageList") || "[]");
  list.unshift({ id: Date.now(), title, content, time: new Date().toLocaleString(), read: false });
  localStorage.setItem("messageList", JSON.stringify(list));
}
function checkUnreadMessage() {
  let dot = document.querySelector(".dot");
  if (!dot) return;
  let list = JSON.parse(localStorage.getItem("messageList") || "[]");
  dot.style.display = list.some(v => !v.read) ? "block" : "none";
}

// 🔥 最终核验函数（完美兼容后端）
async function verifyCert(hash) {
  const resultDom = document.getElementById("verifyResult");
  const hashVal = hash.trim();
  
  if (!hashVal) {
    resultDom.innerHTML = `<div class="error">❌ 请输入哈希值！</div>`;
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/verify/${encodeURIComponent(hashVal)}`, {
      method: "GET",
      mode: "cors"
    });
    const data = await response.json();
    
    if (data.exist) {
      resultDom.innerHTML = `<div class="success">✅ 核验成功！文件已上链存证，不可篡改</div>`;
    } else {
      resultDom.innerHTML = `<div class="error">❌ 核验失败，未找到存证数据</div>`;
    }
  } catch (error) {
    resultDom.innerHTML = `<div class="error">❌ 网络异常，请刷新重试！</div>`;
    console.error("核验错误：", error);
  }
}

// 次数统计
function resetDailyUsage() {
  const today = new Date().toDateString();
  if (localStorage.getItem("lastResetDate") !== today) {
    ["certify","batch","review","evidenceChain","ocr","template","risk","monitor"].forEach(k => localStorage.setItem(`today_${k}`, "0"));
    localStorage.setItem("lastResetDate", today);
  }
}
function recordUsage(func) {
  const key = `today_${func}`;
  localStorage.setItem(key, (parseInt(localStorage.getItem(key)||0)+1)+"");
  updateUsageStats();
}
function checkPermission(func) {
  const limit = MEMBER_LIMITS[memberType][func];
  const cnt = parseInt(localStorage.getItem(`today_${func}`)||0);
  return limit === true || cnt < limit;
}
function updateUsageStats() {
  const c = document.getElementById("certifyCount");
  const r = document.getElementById("reviewCount");
  const ch = document.getElementById("chainCount");
  if(c) c.innerText = localStorage.getItem("today_certify")||0;
  if(r) r.innerText = localStorage.getItem("today_review")||0;
  if(ch) ch.innerText = localStorage.getItem("today_evidenceChain")||0;
}

// 登录注册
async function userLogin(username, password) {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  }).then(r=>r.json());
  
  if (res.code === 200) {
    localStorage.setItem("userInfo", JSON.stringify({ username }));
    localStorage.setItem("memberType", res.member);
    localStorage.setItem("token", aesEncrypt("login_success"));
    alert("登录成功");
    location.href = "index.html";
  } else {
    alert("账号或密码错误");
  }
}
async function userRegister(username, password, email) {
  const res = await fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email })
  }).then(r=>r.json());
  alert(res.msg);
  if(res.code===200) location.href="login.html";
}
function userLogout() {
  localStorage.clear();
  alert("已退出登录");
  location.href="login.html";
}
function requireLogin() {
  if(!userInfo||!token){ alert("请先登录"); location.href="login.html"; }
}
function updateNavUserName() {
  const dom = document.getElementById("userName");
  if(dom&&userInfo) dom.innerText=userInfo.username;
}

// 存证数据同步
async function syncCloudData() {
  if(!userInfo) return;
  const res = await fetch(`${API_BASE}/cert/list/${userInfo.username}`).then(r=>r.json());
  localStorage.setItem("certRecords", JSON.stringify(res.records||[]));
  loadLocalCertRecords();
}
function loadLocalCertRecords() {
  const list = JSON.parse(localStorage.getItem("certRecords")||"[]");
  const dom = document.getElementById("certTableBody");
  if(!dom) return;
  let html = "";
  list.forEach(item=>{
    html+=`<tr>
      <td>${item.type}</td>
      <td>${item.filename}</td>
      <td>${item.hash}</td>
      <td>${item.time}</td>
      <td><button class="btn btn-outline" onclick="openQrcode('${item.hash}')">核验二维码</button></td>
    </tr>`;
  });
  dom.innerHTML = html || `<tr><td colspan="5" style="text-align:center;">暂无存证记录</tr>`;
}

// 工具函数
function showLoading(btn,text){btn.disabled=true;btn.innerHTML=`<span class="loading"></span> ${text}`;}
function hideLoading(btn,text){btn.disabled=false;btn.innerText=text;}
function printCert(){window.print();}
function shareCert(hash){alert(`核验链接：${location.origin}/verify.html?hash=${hash}`);}
function addLog(content){
  fetch(`${API_BASE}/log/add`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:userInfo?.username,content})
  });
}
function autoBackupData(){
  const last=localStorage.getItem("lastBackup");
  if(!last||Date.now()-parseInt(last)>86400000){
    localStorage.setItem("lastBackup",Date.now()+"");
  }
}
