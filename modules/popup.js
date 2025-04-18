document.addEventListener("DOMContentLoaded", function () {
  // 默认的bypass列表
  const defaultBypassList = [
    "127.0.0.1/8",
    "192.168.1.0/24",
    "::1",
    "localhost",
    ".net.nz",
  ];

  // 这个插件默认的浏览器存储的数据格式
  let initialSettings = {
    bypassList: [],
    httpPort: "8080",
    httpProxy: "example.com",
    httpsPort: "",
    httpsProxy: "",
    proxyEnabled: false,
    socksHost: "",
    socksPort: "",
    useForHttps: false,
  };

  /** ================== Step 1 ================== */
  // 得到插件的全部 HTML Element
  const noProxyToggle = document.getElementById("no-proxy-radio");

  // 手动直连的关键 HTML Element
  const manualProxyToggle = document.getElementById("manual-proxy-radio");
  const manualProxyOptionEl = document.getElementById("manual-proxy-direct");

  // 手动白名单的关键 HTML Element
  const manualProxyWhiteListToggle = document.getElementById(
    "manual-proxy-white-radio"
  );
  const manualProxyWhiteOptionEl =
    document.getElementById("manual-proxy-white");

  // 其他的配置参数
  const proxyConfiguration = document.getElementById("proxy-configuration");
  const proxyPanel = document.getElementById("proxy-panel");

  const httpProxyInput = document.getElementById("http-proxy");
  const httpPortInput = document.getElementById("http-port");
  const httpsProxyInput = document.getElementById("https-proxy");
  const httpsPortInput = document.getElementById("https-port");
  const bypassListInput = document.getElementById("bypass-list");
  const whiteListInput = document.getElementById("white-proxy-list");
  const useForHttpsCheckbox = document.getElementById("use-for-https");
  const applyButton = document.getElementById("apply-button");
  const cancelButton = document.getElementById("cancel-button");

  /** ================== Step 2 ================== */
  // 给插件的HTML Element注入监听事件 观察变化
  // 2.1 不使用代理和使用手动代理的互斥行为
  noProxyToggle.addEventListener("change", () => {
    // 主动触发一次使用手动代理的行为促使它去修改样式
    proxyConfiguration.classList.add("disabled");
    proxyPanel.classList.add("not-allowed");
    manualProxyOptionEl.style.cssText = "display: none;";
    manualProxyWhiteOptionEl.style.cssText = "display: none;";
  });

  manualProxyToggle.addEventListener("change", () => {
    if (manualProxyToggle.checked) {
      proxyConfiguration.classList.remove("disabled");
      proxyPanel.classList.remove("not-allowed");
      manualProxyOptionEl.style.cssText = "";
      manualProxyWhiteOptionEl.style.cssText = "display: none;";
    }
  });

  manualProxyWhiteListToggle.addEventListener("change", () => {
    if (manualProxyWhiteListToggle.checked) {
      proxyConfiguration.classList.remove("disabled");
      proxyPanel.classList.remove("not-allowed");
      manualProxyWhiteOptionEl.style.cssText = "";
      manualProxyOptionEl.style.cssText = "display: none;";
    }
  });

  // 2.2 HTTP 和 HTTPS 如果是共享状态的话需要同步更新数据
  httpProxyInput.addEventListener("input", () => {
    if (useForHttpsCheckbox.checked)
      httpsProxyInput.value = httpProxyInput.value;
  });

  httpPortInput.addEventListener("input", () => {
    if (useForHttpsCheckbox.checked) httpsPortInput.value = httpPortInput.value;
  });

  useForHttpsCheckbox.addEventListener("change", () => {
    if (useForHttpsCheckbox.checked) {
      httpsProxyInput.classList.add("disabled", "not-allowed");
      httpsPortInput.classList.add("disabled", "not-allowed");
      httpsProxyInput.value = httpProxyInput.value;
      httpsPortInput.value = httpPortInput.value;
    } else {
      httpsProxyInput.classList.remove("disabled", "not-allowed");
      httpsPortInput.classList.remove("disabled", "not-allowed");
    }
  });

  // 2.3 从 HTML Element 上拿出状态写入存储 并且需要立即生效设置
  applyButton.addEventListener("click", () => {
    // 获取用户输入
    const bypassList = bypassListInput.value
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);

    const whiteList = whiteListInput.value
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);

    const proxyHost = httpProxyInput.value || "example.com";
    const proxyPort = parseInt(httpPortInput.value) || 80;
    const useForHttps = useForHttpsCheckbox.checked;

    let proxyConfig = {};
    let proxyEnabledMode = "no-proxy";

    if (manualProxyToggle.checked) {
      proxyEnabledMode = "manual-direct";
      const finalBypassList = [
        ...new Set([...defaultBypassList, ...bypassList]),
      ];

      proxyConfig = {
        mode: "fixed_servers",
        rules: {
          singleProxy: {
            scheme: "http",
            host: proxyHost,
            port: proxyPort,
          },
          bypassList: finalBypassList,
        },
      };
    } else if (manualProxyWhiteListToggle.checked) {
      proxyEnabledMode = "manual-whitelist";

      // 构建 PAC 脚本，白名单走代理，其它全直连
      const pacScript = `
  function FindProxyForURL(url, host) {
    var whitelist = ${JSON.stringify(whiteList)};
    for (var i = 0; i < whitelist.length; i++) {
      if (shExpMatch(host, whitelist[i])) {
        return "PROXY ${proxyHost}:${proxyPort}";
      }
    }
    return "DIRECT";
  }
  `;

      proxyConfig = {
        mode: "pac_script",
        pacScript: {
          data: pacScript,
        },
      };
    }

    // 保存设置
    chrome.storage.sync.set(
      {
        proxyEnabled: proxyEnabledMode,
        httpProxy: proxyHost,
        httpPort: proxyPort.toString(),
        httpsProxy: useForHttps ? proxyHost : httpsProxyInput.value,
        httpsPort: useForHttps ? proxyPort.toString() : httpsPortInput.value,
        bypassList: bypassList,
        whiteList: whiteList,
        useForHttps: useForHttps,
        proxySettings: proxyConfig,
      },
      function () {
        if (proxyEnabledMode === "no-proxy") {
          chrome.proxy.settings.clear({ scope: "regular" }, function () {});
        } else {
          chrome.proxy.settings.set(
            {
              value: proxyConfig,
              scope: "regular",
            },
            function () {}
          );
        }
        window.close();
      }
    );
  });

  // 2.4 取消设置需要回退回存储中记录的状态
  cancelButton.addEventListener("click", () => {
    // 恢复到初始设置
    if (initialSettings.proxyEnabled) {
      if (initialSettings.proxyEnabled == "manual-direct")
        manualProxyToggle.checked = true;
      else if (initialSettings.proxyEnabled == "manual-whitelist")
        manualProxyWhiteListToggle.checked = true;
      else noProxyToggle.checked = true;
    }

    if (initialSettings.httpProxy)
      httpProxyInput.value = initialSettings.httpProxy;
    if (initialSettings.httpPort)
      httpPortInput.value = initialSettings.httpPort;
    if (initialSettings.httpsProxy)
      httpsProxyInput.value = initialSettings.httpsProxy;
    if (initialSettings.httpsPort)
      httpsPortInput.value = initialSettings.httpsPort;

    const userBypassList = initialSettings.bypassList
      ? initialSettings.bypassList
      : [];
    const combinedBypassList = [
      ...new Set([...defaultBypassList, ...userBypassList]),
    ];
    bypassListInput.value = combinedBypassList.join(", ");

    if (initialSettings.useForHttps !== undefined)
      useForHttpsCheckbox.checked = initialSettings.useForHttps;

    // 关闭 popup
    window.close();
  });

  /** ================== Step 3 ================== */
  // 入口函数 插件初始化的操作
  chrome.storage.sync.get(
    [
      "proxyEnabled",
      "httpProxy",
      "httpPort",
      "httpsProxy",
      "httpsPort",
      "socksHost",
      "socksPort",
      "bypassList",
      "whiteList",
      "useForHttps",
    ],
    function (result) {
      initialSettings = result;
      // 互斥的radio group选项
      if (result.proxyEnabled == "manual-direct") {
        manualProxyToggle.checked = true;
        manualProxyToggle.dispatchEvent(new Event("change"));
      } else if (result.proxyEnabled == "manual-whitelist") {
        manualProxyWhiteListToggle.checked = true;
        manualProxyWhiteListToggle.dispatchEvent(new Event("change"));
      } else {
        noProxyToggle.checked = true;
        noProxyToggle.dispatchEvent(new Event("change"));
      }

      if (result.httpProxy) httpProxyInput.value = result.httpProxy;
      if (result.httpPort) httpPortInput.value = result.httpPort;
      if (result.httpsProxy) httpsProxyInput.value = result.httpsProxy;
      if (result.httpsPort) httpsPortInput.value = result.httpsPort;

      // 合并不显示默认去掉的bypassList
      const userBypassList = result.bypassList ? result.bypassList : [];
      const combinedBypassList = userBypassList.filter(
        (item) => !defaultBypassList.includes(item)
      );

      bypassListInput.value = combinedBypassList.join(", ");
      if (result.whiteList) whiteListInput.value = result.whiteList.join(", ");

      if (result.useForHttps) useForHttpsCheckbox.checked = result.useForHttps;
      useForHttpsCheckbox.dispatchEvent(new Event("change"));
    }
  );
});
