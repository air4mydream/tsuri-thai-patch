/* Presentation adapter for the existing, unmodified Rom Patcher JS runtime.
 * Original Famicom BPS is pinned by SHA-256. ROM processing stays local. */
'use strict';
window.addEventListener('load', () => {
  const get = id => document.getElementById(id);
  const status = get('famicom-status');
  const input = get('rom-patcher-input-file-rom');
  const apply = get('rom-patcher-button-apply');
  const result = get('famicom-result');
  let started = false;
  let failed = false;
  let validSource = false;
  let patchReady = false;
  function message(text, error = false) {
    status.textContent = text;
    status.className = error ? 'status error' : 'status';
  }
  function step(current) {
    ['source', 'check', 'save'].forEach((name, index) => {
      get('step-' + name).className = index < current ? 'done' : index === current ? 'current' : '';
    });
  }
  function fail(text) {
    failed = true;
    message(text + '\nกรุณาโหลดหน้าเว็บใหม่และตรวจว่าอัปโหลดไฟล์ครบทุกโฟลเดอร์', true);
    input.disabled = true;
    apply.disabled = true;
  }
  const waiting = setTimeout(() => fail('เครื่องมือยังเริ่มทำงานไม่สำเร็จ'), 30000);
  async function loadPatch() {
    if (started || failed) return;
    started = true;
    clearTimeout(waiting);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      if (!window.crypto || !window.crypto.subtle) throw new Error('กรุณาเปิดเครื่องมือผ่านเว็บไซต์ HTTPS');
      message('กำลังตรวจไฟล์แพตช์ภาษาไทย…');
      const response = await fetch('./patches/patch_th.bps', {
        method: 'GET', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: controller.signal
      });
      if (!response.ok) throw new Error('โหลดแพตช์ไม่สำเร็จ (' + response.status + ')');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== 3751) throw new Error('ขนาดแพตช์ Famicom ไม่ตรงกับชุดเดิม');
      const digest = Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes)),
        n => n.toString(16).padStart(2, '0')).join('');
      if (digest !== '4feccc4cf31490e7f8e2618aa816d5bab30c2bb9c4f169d2f13ff13db0114883') {
        throw new Error('ไฟล์แพตช์ไม่ตรงกับฉบับภาษาไทยที่รองรับ');
      }
      const patch = new BinFile(bytes);
      patch.fileName = 'patch_th.bps';
      RomPatcherWeb.providePatchFile(patch);
      patchReady = true;
      if (!input.files || !input.files.length) {
        message('แพตช์ภาษาไทยพร้อมใช้งาน เลือก ROM ต้นฉบับเพื่อเริ่มต้น');
      }
    } catch (error) {
      fail(error.name === 'AbortError' ? 'โหลดแพตช์ใช้เวลานานเกินไป' : error.message);
    } finally {
      clearTimeout(timer);
    }
  }
  // Keep the apply label in Thai when the original engine updates its busy state.
  function translateButton() {
    const text = apply.textContent.trim();
    if (text === 'Apply patch') apply.textContent = 'ตรวจสอบและแปะแพตช์ →';
    else if (text === 'Applying patch...') {
      const spinner = apply.querySelector('.rom-patcher-spinner');
      apply.textContent = '';
      if (spinner) apply.appendChild(spinner);
      apply.appendChild(document.createTextNode(' กำลังแปะแพตช์…'));
    }
  }
  const buttonObserver = new MutationObserver(translateButton);
  buttonObserver.observe(apply, { childList: true, subtree: true, characterData: true });
  translateButton();
  const errorObserver = new MutationObserver(() => {
    const text = get('rom-patcher-error-message').textContent.trim();
    if (text) {
      const translated = /checksum mismatch|Invalid input ROM/i.test(text)
        ? 'ROM ไม่ตรงกับต้นฉบับญี่ปุ่นที่รองรับ กรุณาตรวจไฟล์อีกครั้ง'
        : 'แปะแพตช์ไม่สำเร็จ: ' + text;
      message(translated, true);
      result.hidden = true;
    }
  });
  errorObserver.observe(get('rom-patcher-error-message'), { childList: true, subtree: true, characterData: true });
  input.addEventListener('change', () => {
    validSource = false;
    result.hidden = true;
    step(0);
    if (!failed && input.files && input.files.length) {
      message(patchReady ? 'กำลังตรวจ ROM ต้นฉบับ…' : 'กำลังเตรียมแพตช์และตรวจ ROM…');
    }
  });
  apply.addEventListener('click', () => {
    if (validSource && !failed) {
      result.hidden = true;
      step(1);
      message('กำลังแปะแพตช์ภาษาไทย…');
    }
  });
  try {
    RomPatcherWeb.initialize({
      language: 'en',
      requireValidation: true,
      fixChecksum: false,
      outputSuffix: true,
      allowDropFiles: false,
      oninitialize: loadPatch,
      onloadrom: () => { result.hidden = true; },
      onvalidaterom: (rom, valid) => {
        if (failed) { input.disabled = true; apply.disabled = true; return; }
        validSource = !!valid && rom.fileSize === 131088;
        if (validSource) {
          step(1);
          message('ROM ตรงกับต้นฉบับที่รองรับ พร้อมแปะแพตช์ภาษาไทย');
        } else {
          apply.disabled = true;
          step(0);
          message('ROM ไม่ตรงกับต้นฉบับญี่ปุ่นที่รองรับ กรุณาตรวจไฟล์อีกครั้ง', true);
        }
      },
      onpatch: rom => {
        if (rom.fileSize !== 131088 || rom.hashCRC32() !== 0xb6d4d383) {
          fail('ผลลัพธ์ภาษาไทยไม่ตรงกับแพตช์ที่รองรับ จึงหยุดการบันทึกไฟล์');
          throw new Error('Famicom output CRC32 mismatch; download blocked');
        }
        // Engine calls this before saving; normalize only the download filename.
        rom.fileName = 'TsuriKichiSanpei_BlueMarlin_TH.nes';
        step(3);
        result.hidden = false;
        get('famicom-output-name').textContent = rom.fileName;
        message('แปะแพตช์สำเร็จ เปิดไฟล์ .nes ฉบับไทยด้วยอีมู Famicom เพื่อเริ่มเล่น');
      }
    });
  } catch (error) {
    clearTimeout(waiting);
    fail(error.message);
  }

  get('copy-cheat').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('0037:00');
      get('copy-status').textContent = 'คัดลอกแล้ว นำไปวางในช่อง Codes ของ Mesen ได้เลย';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(get('freeze-tension-code'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      get('copy-status').textContent = 'กด Ctrl+C หรือแตะค้างที่สูตรเพื่อคัดลอก 0037:00';
    }
  });
});
