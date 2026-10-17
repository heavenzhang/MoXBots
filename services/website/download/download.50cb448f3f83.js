(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  let macHash = '';
  let windowsHash = '';

  const setMacPending = message => {
    document.body.dataset.releaseReady = 'false';
    macHash = '';
    byId('download-link').hidden = true;
    byId('download-link').removeAttribute('href');
    byId('download-pending').hidden = false;
    byId('release-details').hidden = true;
    byId('release-status').textContent = message;
    byId('release-version').textContent = '—';
    byId('release-size').textContent = '—';
  };

  const setWindowsPending = message => {
    document.body.dataset.windowsReleaseReady = 'false';
    windowsHash = '';
    byId('windows-download-link').hidden = true;
    byId('windows-download-link').removeAttribute('href');
    byId('windows-download-pending').hidden = false;
    byId('windows-release-details').hidden = true;
    byId('windows-release-status').textContent = message;
    byId('windows-release-version').textContent = '—';
    byId('windows-release-size').textContent = '—';
  };

  const validateUrl = (value, platform) => {
    const url = new URL(value, location.href);
    if (url.username || url.password || url.search || url.hash) throw new Error('invalid download URL');
    if (platform === 'mac' && !(
      (url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith('/heavenzhang/MoXBots/releases/download/')) ||
      (url.origin === location.origin && url.pathname.startsWith('/download/packages/'))
    )) throw new Error('invalid macOS download URL');
    if (platform === 'windows' && !(url.origin === location.origin && url.pathname.startsWith('/download/packages/'))) {
      throw new Error('invalid Windows download URL');
    }
    return url;
  };

  const renderMac = release => {
    if (release?.status === 'preparing') {
      setMacPending('新试用包正在准备');
      return;
    }
    if (release?.status !== 'ready' || !/^[0-9a-f]{64}$/.test(release.sha256 || '') ||
        !/^[0-9a-f]{40}$/.test(release.sourceCommit || '') ||
        typeof release.version !== 'string' || !release.version.trim() ||
        !Number.isSafeInteger(release.bytes) || release.bytes <= 0 ||
        release.signed !== true || typeof release.notarized !== 'boolean') throw new Error('invalid macOS release');

    const url = validateUrl(release.url, 'mac');
    const link = byId('download-link');
    link.href = url.href;
    link.hidden = false;
    byId('download-pending').hidden = true;
    byId('release-status').textContent = 'macOS 试用包已完成签名与文件校验';
    byId('release-version').textContent = release.version;
    byId('release-size').textContent = (release.bytes / 1_000_000).toFixed(1) + ' MB';
    byId('release-note').textContent = release.notarized
      ? 'Developer ID 已签名，已通过 Apple 公证。当前仍为试用版，请查看对应发行说明。'
      : 'Developer ID 已签名，尚未经过 Apple 公证。系统可能阻止首次打开；请先阅读下方安装说明。';
    byId('release-signing').textContent = release.notarized ? 'Developer ID · 已公证' : 'Developer ID · 未公证';
    byId('release-source').textContent = release.sourceCommit.slice(0, 12);
    byId('release-source').href = 'https://github.com/heavenzhang/MoXBots/tree/' + release.sourceCommit;
    const tag = url.hostname === 'github.com' ? url.pathname.split('/')[5] : '';
    byId('release-notes').href = tag
      ? 'https://github.com/heavenzhang/MoXBots/releases/tag/' + tag
      : 'https://github.com/heavenzhang/MoXBots/releases';
    macHash = release.sha256;
    byId('release-sha').textContent = macHash;
    byId('release-details').hidden = false;
    document.body.dataset.releaseReady = 'true';
  };

  const renderWindows = release => {
    if (!release) {
      setWindowsPending('Windows 安装包暂未提供');
      return;
    }
    if (release.status === 'preparing') {
      setWindowsPending('Windows 安装包正在准备');
      return;
    }
    if (release.status !== 'ready' || !/^[0-9a-f]{64}$/.test(release.sha256 || '') ||
        !/^[0-9a-f]{40}$/.test(release.sourceCommit || '') ||
        typeof release.version !== 'string' || !release.version.trim() ||
        !Number.isSafeInteger(release.bytes) || release.bytes <= 0 ||
        !['Valid', 'NotSigned'].includes(release.authenticodeStatus) ||
        typeof release.analyticsEnabled !== 'boolean' || release.windowsUpdaterSupported !== false) {
      throw new Error('invalid Windows release');
    }

    const url = validateUrl(release.url, 'windows');
    const link = byId('windows-download-link');
    link.href = url.href;
    link.hidden = false;
    byId('windows-download-pending').hidden = true;
    byId('windows-release-status').textContent = release.authenticodeStatus === 'Valid'
      ? 'Windows x64 安装包已校验并完成代码签名'
      : 'Windows x64 安装包已校验 · 未签名';
    byId('windows-release-version').textContent = release.version;
    byId('windows-release-size').textContent = (release.bytes / 1_000_000).toFixed(1) + ' MB';
    const notes = [];
    if (release.authenticodeStatus === 'NotSigned') notes.push('此试用包未进行 Authenticode 代码签名，Windows 可能显示“未知发布者”或 SmartScreen 提示。请先核对 SHA-256，确认信任后再运行。');
    if (!release.analyticsEnabled) notes.push('本构建未启用统计上报。');
    notes.push('Windows 自动更新尚未开放；后续版本需要从本页手动下载。');
    byId('windows-release-note').textContent = notes.join(' ');
    byId('windows-signing').textContent = release.authenticodeStatus === 'Valid' ? '已签名' : '未签名';
    byId('windows-updater').textContent = '未开放 · 本包仅供手动下载';
    byId('windows-analytics').textContent = release.analyticsEnabled ? '已启用' : '未启用';
    byId('windows-source').textContent = release.sourceCommit.slice(0, 12);
    byId('windows-source').href = 'https://github.com/heavenzhang/MoXBots/tree/' + release.sourceCommit;
    windowsHash = release.sha256;
    byId('windows-release-sha').textContent = windowsHash;
    byId('windows-release-details').hidden = false;
    document.body.dataset.windowsReleaseReady = 'true';
  };

  const load = async () => {
    byId('release-retry').hidden = true;
    setMacPending('正在读取版本信息…');
    setWindowsPending('正在读取版本信息…');
    let manifest;
    try {
      const response = await fetch(document.body.dataset.releaseManifest || 'releases.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('release unavailable');
      manifest = await response.json();
      if (manifest.schemaVersion !== 1 || manifest.channel !== 'trial') throw new Error('unsupported release');
    } catch {
      setMacPending('暂时无法读取可用版本');
      setWindowsPending('暂时无法读取可用版本');
      byId('release-retry').hidden = false;
      return;
    }
    try { renderMac(manifest.macArm64); } catch { setMacPending('暂时无法读取可用版本'); }
    try { renderWindows(manifest.windowsX64); } catch { setWindowsPending('暂时无法读取 Windows 版本'); }
  };

  byId('release-retry').addEventListener('click', () => { void load(); });
  byId('copy-sha').addEventListener('click', async () => {
    if (!macHash) return;
    try {
      await navigator.clipboard.writeText(macHash);
      byId('copy-status').textContent = 'SHA-256 已复制';
    } catch {
      byId('copy-status').textContent = '复制未成功，请选中上方校验值手动复制。';
    }
  });
  byId('windows-copy-sha').addEventListener('click', async () => {
    if (!windowsHash) return;
    try {
      await navigator.clipboard.writeText(windowsHash);
      byId('windows-copy-status').textContent = 'SHA-256 已复制';
    } catch {
      byId('windows-copy-status').textContent = '复制未成功，请选中上方校验值手动复制。';
    }
  });
  void load();
})();
