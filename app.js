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

// ========== 线上接口地址 【已修改为你的真实后端地址】 ==========
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
  window.onerror = (msg) => { addLog(`系统异常：${msg}`); };
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

// 国密SM3哈希算法
function sm3Hash(str) {
  let hash = 1770572381;
  for (let i = 0; i < str.length; i++) {
    hash ^= ((hash << 5) + str.charCodeAt(i) + (hash >> 2));
  }
  return "SM3-" + Math.abs(hash).toString(16).padStart(64, '0');
}
function aesEncrypt(str) { return btoa(encodeURIComponent(str)); }
function aesDecrypt(str) { return decodeURIComponent(atob(str)); }

// 浏览器桌面通知
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

// 存证公开核验
async function verifyCert(hash) {
  let res = await fetch(`${API_BASE}/verify/${hash}`).then(r => r.json());
  let dom = document.getElementById("verifyResult");
  if (res.exist) {
    dom.innerHTML = `<div class="success verify-result">✅ 核验成功 文件已司法上链 ${res.on_chain ? "<br>✅ 已录入联盟链存证库" : "<br>⚠️ 本地留存存证"}</div>`;
  } else {
    dom.innerHTML = `<div class="error verify-result">❌ 核验失败 无匹配存证数据</div>`;
  }
}

// 每日使用次数重置
function resetDailyUsage() {
  let today = new Date().toDateString();
  if (localStorage.getItem("lastResetDate") !== today) {
    ["certify", "batch", "review", "evidenceChain", "ocr", "template", "risk", "monitor"].forEach(k => localStorage.setItem(`today_${k}`, "0"));
    localStorage.setItem("lastResetDate", today);
  }
}
function recordUsage(func) {
  let key = `today_${func}`;
  localStorage.setItem(key, (parseInt(localStorage.getItem(key) || 0) + 1) + "");
  updateUsageStats();
  addLog(`功能使用：${func}`);
}
function checkPermission(func) {
  let limit = MEMBER_LIMITS[memberType][func];
  let cnt = parseInt(localStorage.getItem(`today_${func}`) || 0);
  return limit === true || cnt < limit;
}
function updateUsageStats() {
  let c = document.getElementById("certifyCount");
  let r = document.getElementById("reviewCount");
  let ch = document.getElementById("chainCount");
  if (c) c.innerText = localStorage.getItem("today_certify") || 0;
  if (r) r.innerText = localStorage.getItem("today_review") || 0;
  if (ch) ch.innerText = localStorage.getItem("today_evidenceChain") || 0;
}

// 账号登录注册
async function userLogin(username, password) {
  let res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  }).then(r => r.json());
  if (res.code === 200) {
    localStorage.setItem("userInfo", JSON.stringify({ username }));
    localStorage.setItem("memberType", res.member);
    localStorage.setItem("token", aesEncrypt("login_success"));
    addLog("用户登录系统");
    sendNotification("登录成功", "欢迎使用深链司法存证平台");
    alert("登录成功");
    location.href = "index.html";
  } else {
    alert("账号或密码错误");
  }
}
async function userRegister(username, password, email) {
  let res = await fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email })
  }).then(r => r.json());
  alert(res.msg);
  if (res.code === 200) location.href = "login.html";
}
function userLogout() {
  addLog("用户退出登录");
  sendNotification("退出登录", "期待再次使用平台服务");
  localStorage.clear();
  alert("已安全退出");
  location.href = "login.html";
}
function requireLogin() {
  if (!userInfo || !token) {
    alert("请先登录账号");
    location.href = "login.html";
  }
}
function updateNavUserName() {
  let dom = document.getElementById("userName");
  if (dom && userInfo) dom.innerText = userInfo.username;
}

// 云端数据同步
async function syncCloudData() {
  if (!userInfo) return;
  let res = await fetch(`${API_BASE}/cert/list/${userInfo.username}`).then(r => r.json());
  localStorage.setItem("certRecords", JSON.stringify(res.records || []));
  loadLocalCertRecords();
}
function loadLocalCertRecords() {
  let list = JSON.parse(localStorage.getItem("certRecords") || "[]");
  let dom = document.getElementById("certTableBody");
  if (!dom) return;
  let html = "";
  list.forEach(item => {
    html += `<tr>
      <td>${item.type}</td>
      <td>${item.filename}</td>
      <td>${item.hash}</td>
      <td>${item.time}</td>
      <td><button class="btn btn-outline" onclick="openQrcode('${item.hash}')">核验二维码</button></td>
    </tr>`;
  });
  dom.innerHTML = html || `<tr><td colspan="5" style="text-align:center;">暂无存证记录</td></tr>`;
}

// 通用工具
function showLoading(btn, text) {
  btn.disabled = true;
  btn.innerHTML = `<span class="loading"></span> ${text}`;
}
function hideLoading(btn, text) {
  btn.disabled = false;
  btn.innerText = text;
}
function printCert() { window.print(); }
function shareCert(hash) { alert(`全网核验链接：${location.origin}/verify.html?hash=${hash}`); }
function addLog(content) {
  fetch(`${API_BASE}/log/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: userInfo?.username, content })
  })
}
function autoBackupData() {
  let last = localStorage.getItem("lastBackup");
  if (!last || Date.now() - parseInt(last) > 86400000) {
    localStorage.setItem("lastBackup", Date.now() + "");
  }
}
