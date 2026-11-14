const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

function readAsset(relativePath) {
  const fullPath = path.join(__dirname, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function injectCustomUI(webContents) {
  const currentUrl = webContents.getURL();
  let parsedUrl;
  try {
    parsedUrl = new URL(currentUrl);
  } catch {
    return;
  }

  if (parsedUrl.hostname !== 'portal.uit.edu.vn') return;

  const combinedCss = [
    readAsset('styles/shell.css'),
    readAsset('styles/trang-chu.css'),
    readAsset('styles/login.css'),
    readAsset('styles/ho-so.css'),
  ].join('\n');

  if (combinedCss.trim()) {
    webContents.insertCSS(combinedCss).catch(console.error);
  }

  // UIT Logo
  const brandPath = path.join(__dirname, 'assets/uit-logo-white.png');
  let brandBase = '';
  if (fs.existsSync(brandPath)) {
    const bitmap = fs.readFileSync(brandPath);
    brandBase = `data:image/png;base64,${bitmap.toString('base64')}`;
  }

  const shellHtml = readAsset('layouts/shell.html');
  const shellJs = readAsset('scripts/shell.js');
  const trangChuJs = readAsset('scripts/trang-chu.js');

  const bootstrapCode = `
    (() => {
      if (!window.__UIT_SHELL_HTML__) { window.__UIT_SHELL_HTML__ = ${JSON.stringify(shellHtml)}; }
      if (!window.__UIT_BRAND__)      { window.__UIT_BRAND__ = ${JSON.stringify(brandBase)}; }
      ${shellJs}
      ${trangChuJs}
    })();
  `;

  webContents.executeJavaScript(bootstrapCode).catch(console.error);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' ? { 
      titleBarOverlay: 
      {
        color: 'rgba(0,0,0,0)',
        symbolColor: '#74b1be',
        height: 82
      },
    } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    frame: true
  });

  // Block UMA assistant scripts, styles, and API calls
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://uma.uit.edu.vn/*', '*://*.uma.uit.edu.vn/*'] },
    (details, callback) => callback({ cancel: true })
  );

  /*
    const cookie = {
        url: 'https://portal.uit.edu.vn',
        name: 'ums_portal_session',
        value: 
        'Fe26.2*1*6ace319173d04142678c239dd779e93643138c9119444bdb5cb8cb24f8bd04ff*3eigataXIWe3fOmSAJqa2Q*5nW3T8GBW_sQpeC2KmQqJozuU30OR3Tc3xaVm3sOpZjg1VMjyWpMcIylHi0P2PvGNyiIC_bcwXFZsZbDD_QruHhF6rSSL2HIs6Kf3pi_aDReImFKS05GBlwNIYL2d-Rg-xCRwazqNbZUqGLkc6KUAFwN8uF28RbzVVL_bswhH69ubwvD4yoT2LW3BN2FlxIZcrKerW-_LDC6HjgUMDVfR9L0wpOIoj-Zv5uVFqKiZbiF6RQbuQfu2B5e8gjuaJ9dzVQy6JB7W8shs3VlP6nLmQK-z_3sapP4cFHQlJXnjQ65jutkOKgbQqnMjRuzrL11yU1hV7567HraVxBEsX3zg8pQo6t5cqWlkaX_t4NJ8c0y_tNaA-D55wCheTcIDI3YKDE_7Z5sw7YGmEuTQX7-KY4JqsV_33jhRlrbLGwSPLcDkrEsqfi6htAY39-peR0iu9GrOX_F4AkHHwR3dChbp-xNjro9izuksB8e0c--RCo9lsX-z8Ifi_12g6-K32dmIZfB1cEuImLio5_Y8sWFu5YxGISIu_yjLHnsX6UUSnRN4lAe9UMDcf8AaNCm4cvBOfxaNW5OjqMgV4VQ3fQkzQPzXoVp1E4wYjiSRkr2Jv50GWP_MGuLzPSEAG__L6AzdQGlXbQE949NBICYKnE7hJAm9kltdjV3xWQ6eNYKdUVeMRs-vyBquuR0ptDcbpkFsW4lP5g7YMnyiliADQNDT4louvTQfkCzRsia6JBbr1piSqa1WntNAuynOgxhf3F8Ro4fpM5BbE2RyTovnPR5RzXnZjGe3tZJy2TcA-KEBpHVq9pVgVm3A5LX_BahOX9ke41gkP5ymCdBP4-P1jvhRxdt47-w_r8bcQnQIoKfRfRiIrqniK1e_zogV3sVOn9KiWGDYLkutgTNMbXCLvhd40k7M0A7y69zwM_g0fo2Dc6_GbbysiMpJ3SD2wzkpphZca65tpfn9PZsJ4DUnSldocXNVrdAIF84T6s9GAhT_bPxOxm7YPaG9Ju1ae4KNj1grhF0yRiHc71Khv1fbXXmnrJl-m-87kYZIFsLAQTLuSCU98J3sq-g52UD6HNyVKxmMODMbqncg9AXy-SDA2WxsqaDwBVGvE15IRYwyUOqzFLu1iCwOkOtKeZW2fOcZOYTRfS7Lm_D9x_53_MPItucR-6wm2AqTih2rxWupP_riEYV76ATBgHSI5mVzC4EVHdtbjsYcAmcjWJEcPeMTQs-sCSxCG2mUTbqJ0v_11PpJXn3q0pWR9MqaPVyM2PPHNpaSm78xRQ3MttRfLclQZUZGlINKXHjZSqWqDBz_q0xAOtq57mqCvDoxnjfnynEQmX84b2t0TDRwSV7PcmJvGU-bPAjOIXGv6ne_97bXhkPg3umnBhF0Zmw7O_DYQTUSTWkCRPbo_99sjqvTcn9f5fVCtXg1FVlNVd6x6TuN-rBAh2x50cL_Zy6iKjWiHKoFtQ_7tuytjKTKzCcP0Tx-KbAmNrryAX3ubZ7kD_vH2SdmNkT7rNbCK-tZIbBs4UTEa5dzV7NPzoDmbD2B84-MfBEpDDNWGN3ThOmO04CwA1ukA0tTeLod135VKytaQ0AaOrbQh2roeEtc2Lfe_6mRO2sseH9vycH-2YDm7QSSN0z4Qm1unr_8ME6lzXg1euQfrByHaHjHEW5TC0F6o6pa-VmYMnZSNDkhwJsP1QKefQ9S1vJMIJJQsY3BkkPRHeM7mu4zsm6EZE3grIqWPC-zIPdUuFZltTeBlGi2Cj98F3yDSkX4SDTc1kGN66fxErVEWaz8KliY9xs14lhwekaNOWTtl_dZDU9T3TVCuLGHPLCzHcj5R6Jay5dALXkb0mqqHFzA7MAVdeh1U1LRzWpxBuPP4LzzwOGKIAz5QO0RTbIGK1wRcJDN43AYfeOGINIgL4_Rs-UUa2epSBBcNhkrjjdmXuaqoUfOYpEiPG3Sf1ZEevU6c_0wiLPX7Q8PbP4ZrDdjcSqz_jmWnA8HPjaSKkUN7uXjXsysBRqNDp_mJOUDc9FLY6fxyJ9OvPDkyDe43C3_n5S0Sl7glir2RMujpS4GIpW-BH9H_6ZUOCEAFbDFZzUOar0QfyF-bnU4xYlg1BqkWgWBQpeCC0A_TVgsWVRLJGbpDPD4f_soyguTKDfEWxV6VY4CTkL5xYZHWttpaRbez3zKeRn4vVP0rBWwb8sVGV_Ad1Q2FEiMJAZfX8K1PyftceIHsmL42RVDk7dUh9qDvZtM7DH5fyFiixG0yqroa2Y7wj0O4NyiWR4_i2s8784-21URSQB_U0M_ZJnTutTh6aopw4zjD1VVe0YPV7AQ4TxklccV1esgMsj0ffzQwWOjeOl9QlXaALvMjk7UkDQL04G6D1tKHr6aNUlwT-5oLYnr8_cP6bmJSOeN47eSjzlv2s8rtRqwgL78g9og40hRqgBfQFB6jVjBkntMOit39LVBDQqarjZ_WfLhjCvatKdxRBs0ysrQXCrbEX9xi-zyCSfIG-GQ_2cgb5GNI9MLVxcLRRSU5llMSOC_0TAS2mVG-Wa4fEO6OCT3wWlP0c5QG0MCzV9qkyviav7feTQalGuXTT3jhSWj71q38H4OTPxXNvw_56A1Rbi0yHcU8PeEC7vOfOz-PaeM4UlQADo-ad48fjUROwIvJs2q39u_clpRezwZh5ZRECQEaD-u9dGfctR9WiF6Di9s2WGdyumcRGP5IMGP4LevUslQPkfeppZW9_GCphUIKAd9k4aky2ofZ0Np47qk2x3-iTCFfh90mx0OBc-oMKl2SfP7vw6tHXGPMQwL-yMvhyBrORPkbmqI3RhtDqC0LhRa0CQy00EbWPTmy2jSiORKf53lv3cuy6ht9XVsQW3h9YR8U97O2mvyl2P_egZ8XSdP-b16ioHXDXgCfcCgA8UQNTDYEYWEWV7vlxX8lHWlD_2PfR7YouWw4B43dyzw6QZovBvM6qzRg*1795745219103*67551b655a863a2d0a6738ac7cb87c47e00cdb077e61634edb2c0bc5580688b1*_YzciGsepO84SBm9Ln1z6e9HKOoODvXFIaVjUvuCj3I~2'
        ,
        domain: 'portal.uit.edu.vn',
        path: '/'
    };

  session.defaultSession.cookies.set(cookie).then(() => {
    mainWindow.loadURL('https://portal.uit.edu.vn/trang-chu');
  }).catch((error) => {
    console.error('Failed to set cookie:', error);
  });*/
  mainWindow.loadURL('https://portal.uit.edu.vn/login');

  mainWindow.webContents.on('dom-ready', () => {
    injectCustomUI(mainWindow.webContents);
  });

  mainWindow.webContents.on('did-navigate-in-page', () => {
    mainWindow.webContents.executeJavaScript(`
      if (window.__updateCustomRouteState) window.__updateCustomRouteState();
    `).catch(console.error);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});