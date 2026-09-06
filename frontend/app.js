import { validateScheduleForm } from './formValidation.js';

const WORKER_URL = 'https://insta-scheduler.eu-hansclaudio.workers.dev';
const GITHUB_OWNER = 'Integrius';
const GITHUB_REPO = 'insta-scheduler';

const form = document.getElementById('schedule-form');
const passwordInput = document.getElementById('password');
const videoInput = document.getElementById('video');
const preview = document.getElementById('preview');
const accountSelect = document.getElementById('account');
const dateInput = document.getElementById('date');
const hintInput = document.getElementById('hint');
const captionField = document.getElementById('caption');
const generateCaptionButton = document.getElementById('generate-caption');
const formErrors = document.getElementById('form-errors');
const formStatus = document.getElementById('form-status');
const queueList = document.getElementById('queue-list');

async function loadAccounts() {
  const password = passwordInput.value;
  if (!password) return;

  const res = await fetch(`${WORKER_URL}/accounts`, {
    headers: { 'x-app-password': password },
  });
  if (!res.ok) {
    accountSelect.innerHTML = '<option value="">Falha ao carregar contas</option>';
    return;
  }
  const { accounts } = await res.json();
  accountSelect.innerHTML = accounts
    .map(account => `<option value="${account.id}">${account.username}</option>`)
    .join('');
}

passwordInput.addEventListener('change', loadAccounts);

videoInput.addEventListener('change', () => {
  if (videoInput.files[0]) {
    preview.src = URL.createObjectURL(videoInput.files[0]);
    preview.hidden = false;
  }
});

const CAPTURE_FRAME_TIMEOUT_MS = 5000;

function captureFrameAsBase64() {
  return new Promise((resolve, reject) => {
    if (preview.readyState < 1) {
      reject(new Error('Aguarde o vídeo carregar antes de gerar a legenda.'));
      return;
    }
    let settled = false;
    const cleanup = () => {
      preview.removeEventListener('seeked', handleSeeked);
      clearTimeout(timeoutId);
    };
    const handleSeeked = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const canvas = document.createElement('canvas');
      canvas.width = preview.videoWidth;
      canvas.height = preview.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(dataUrl.split(',')[1]);
    };
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Tempo esgotado ao capturar o quadro do vídeo. Tente novamente.'));
    }, CAPTURE_FRAME_TIMEOUT_MS);
    preview.addEventListener('seeked', handleSeeked);
    preview.currentTime = Math.min(preview.duration * 0.4, preview.duration - 0.1);
  });
}

generateCaptionButton.addEventListener('click', async () => {
  formErrors.textContent = '';
  if (!videoInput.files[0]) {
    formErrors.textContent = 'Selecione um vídeo antes de gerar a legenda.';
    return;
  }
  if (!passwordInput.value) {
    formErrors.textContent = 'Digite a senha antes de gerar a legenda.';
    return;
  }

  generateCaptionButton.disabled = true;
  generateCaptionButton.textContent = 'Gerando…';
  try {
    const frameBase64 = await captureFrameAsBase64();
    const res = await fetch(`${WORKER_URL}/caption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value, hint: hintInput.value, frame_base64: frameBase64 }),
    });
    if (!res.ok) throw new Error(`Falha ao gerar legenda (${res.status})`);
    const { caption } = await res.json();
    captionField.value = caption;
  } catch (err) {
    formErrors.textContent = err.message;
  } finally {
    generateCaptionButton.disabled = false;
    generateCaptionButton.textContent = 'Gerar legenda';
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  formErrors.textContent = '';
  formStatus.textContent = '';

  const errors = validateScheduleForm({
    videoSelected: Boolean(videoInput.files[0]),
    accountId: accountSelect.value,
    date: dateInput.value,
    caption: captionField.value,
    password: passwordInput.value,
  });

  if (errors.length > 0) {
    formErrors.textContent = errors.join('\n');
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  formStatus.textContent = 'Enviando vídeo…';

  try {
    const body = new FormData();
    body.set('password', passwordInput.value);
    body.set('account_id', accountSelect.value);
    body.set('date', dateInput.value);
    body.set('caption', captionField.value);
    body.set('video', videoInput.files[0]);

    const res = await fetch(`${WORKER_URL}/schedule`, { method: 'POST', body });
    if (!res.ok) throw new Error(`Falha ao agendar (${res.status})`);

    formStatus.textContent = 'Publicação agendada com sucesso!';
    form.reset();
    preview.hidden = true;
    await loadQueue();
  } catch (err) {
    formErrors.textContent = err.message;
  } finally {
    submitButton.disabled = false;
  }
});

async function loadQueue() {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/queue.json`,
      { cache: 'no-store' }
    );
    const queue = await res.json();
    queueList.innerHTML = queue
      .map(entry => `<li>${entry.date} — ${entry.status} — ${entry.caption.slice(0, 60)}</li>`)
      .join('') || '<li>Fila vazia.</li>';
  } catch {
    queueList.innerHTML = '<li>Não foi possível carregar a fila.</li>';
  }
}

loadQueue();
