/* Local-only SHA-1 checker. The selected File is sent only to a same-origin Worker.
 * No upload, fetch, analytics, localStorage or IndexedDB operations. */
'use strict';
(() => {
  const workerUrl = new URL('./sha1-worker-v1.7.js', document.currentScript.src);
  const games = [
    { id: 'famicom', label: 'Famicom · ภาค บลูมาร์ลิน', size: 131088,
      sha1: 'A326FD5F72219316375E44633B9548F6BA7FFD8F' },
    { id: 'ps1', label: 'PS1 · สิงห์นักตก', size: 266077056,
      sha1: 'F31C11A9004E851D6710B9B7C088AF1195EA1C65' }
  ];
  const panel = document.querySelector('[data-rom-sha1-checker]');
  if (!panel) return;
  const get = name => panel.querySelector('[data-checker-' + name + ']');
  const input = get('file'), select = get('game'), start = get('start'), cancel = get('cancel');
  const status = get('status'), progress = get('progress'), progressWrap = get('progress-wrap');
  const result = get('result'), expected = get('expected');
  let worker = null, generation = 0;

  function showStatus(text, error = false) {
    status.textContent = text;
    status.className = error ? 'status error' : 'status';
  }
  function updateExpected() {
    const game = games.find(g => g.id === select.value);
    expected.textContent = game ? game.sha1 : 'เทียบกับต้นฉบับ Famicom และ PS1 ที่เว็บนี้รองรับ';
  }
  function finish() {
    if (worker) worker.terminate();
    worker = null;
    input.disabled = false;
    select.disabled = false;
    start.disabled = !input.files.length;
    cancel.hidden = true;
  }
  function clearResult() {
    result.hidden = true;
    result.removeAttribute('data-match');
    progressWrap.hidden = true;
    progress.value = 0;
  }
  function displayResult(message, selected) {
    if (!/^[0-9A-F]{40}$/.test(message.sha1) || !Number.isSafeInteger(message.size)) {
      showStatus('ผลตรวจไม่สมบูรณ์ กรุณาลองใหม่อีกครั้ง', true);
      finish();
      return;
    }
    get('hash').textContent = message.sha1;
    get('size').textContent = message.size.toLocaleString('th-TH') + ' ไบต์';
    const match = games.find(g => g.size === message.size && g.sha1 === message.sha1);
    const accepted = !!match && (selected === 'auto' || selected === match.id);
    result.dataset.match = accepted ? 'yes' : 'no';
    get('verdict').textContent = accepted
      ? 'ตรงกับต้นฉบับที่รองรับ · ' + match.label
      : match
        ? 'ไฟล์นี้เป็น ' + match.label + ' แต่ไม่ใช่เกมที่เลือกไว้'
        : 'ไม่ตรงกับรอมต้นฉบับที่รองรับ';
    get('explanation').textContent = accepted
      ? 'SHA-1 และขนาดไฟล์ตรงกัน สามารถนำไฟล์นี้ไปตรวจและแปะแพตช์ในหน้าเกมได้'
      : 'ตรวจว่าคุณแตก ZIP/7z แล้ว และเลือก .nes หรือ .bin ต้นฉบับญี่ปุ่นก่อนแปะแพตช์ การเปลี่ยนชื่อไฟล์ไม่ทำให้ค่า SHA-1 เปลี่ยน';
    result.hidden = false;
    progress.value = 100;
    get('percent').textContent = '100%';
    showStatus('ตรวจ SHA-1 เสร็จแล้ว ไฟล์ถูกอ่านในอุปกรณ์นี้เท่านั้น');
    finish();
  }
  input.addEventListener('change', () => {
    generation++;
    finish();
    clearResult();
    const file = input.files[0];
    get('filename').textContent = file ? file.name : 'ยังไม่ได้เลือกไฟล์';
    showStatus(file ? 'พร้อมตรวจ SHA-1 กดปุ่มตรวจสอบเพื่อเริ่ม' : 'เลือกไฟล์ต้นฉบับจากเครื่องเพื่อเริ่มตรวจ');
  });
  select.addEventListener('change', () => { clearResult(); updateExpected(); });
  cancel.addEventListener('click', () => {
    generation++;
    finish();
    clearResult();
    showStatus('ยกเลิกการตรวจแล้ว ไฟล์ต้นฉบับไม่ได้ถูกแก้ไข');
  });
  start.addEventListener('click', () => {
    const file = input.files[0];
    if (!file || worker) return;
    clearResult();
    if (typeof Worker !== 'function') {
      showStatus('เบราว์เซอร์นี้ยังไม่รองรับเครื่องมือตรวจไฟล์ กรุณาใช้เบราว์เซอร์รุ่นปัจจุบัน', true);
      return;
    }
    const jobId = ++generation;
    const selected = select.value;
    try {
      worker = new Worker(workerUrl);
      worker.onmessage = event => {
        const m = event.data || {};
        if (m.jobId !== generation || jobId !== generation) return;
        if (m.type === 'progress') {
          const percent = m.total ? Math.min(99, Math.floor(m.done / m.total * 100)) : 0;
          progress.value = percent;
          get('percent').textContent = percent + '%';
        } else if (m.type === 'done') displayResult(m, selected);
        else if (m.type === 'error') {
          showStatus('อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์จากเครื่องอีกครั้ง', true);
          finish();
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        if (jobId !== generation) return;
        showStatus('เริ่มตรวจไฟล์ไม่สำเร็จ กรุณาโหลดหน้าเว็บใหม่แล้วลองอีกครั้ง', true);
        finish();
      };
      input.disabled = true;
      select.disabled = true;
      start.disabled = true;
      cancel.hidden = false;
      progressWrap.hidden = false;
      showStatus('กำลังอ่านไฟล์และคำนวณ SHA-1 ในอุปกรณ์นี้…');
      worker.postMessage({ file, jobId });
    } catch {
      showStatus('เริ่มตรวจไฟล์ไม่สำเร็จ กรุณาโหลดหน้าเว็บใหม่แล้วลองอีกครั้ง', true);
      finish();
    }
  });
  window.addEventListener('pagehide', () => { generation++; finish(); });
  updateExpected();
  start.disabled = !input.files.length;
})();
