/* ============================================
   SIMULADO BB — CESGRANRIO
   app.js — Lógica completa da aplicação
   ============================================ */

/* ---- ESTADO GLOBAL ---- */
const state = {
  config: { qty: 5, subject: 'Aleatório', timePerQ: 120 },
  questions: [],
  current: 0,
  answers: {},       // { index: 'A' }
  revealed: {},      // { index: true }
  timerInterval: null,
  totalTimerInterval: null,
  timeLeft: 0,
  maxTime: 0,
  paused: false,
  totalTime: 0,
  reviewMode: false,
};

/* ---- TEXTOS DE LOADING ---- */
const loadingMessages = [
  'Gerando questões no estilo Cesgranrio...',
  'Calibrando dificuldade para Escriturário BB...',
  'Elaborando gabaritos e explicações...',
  'Finalizando o simulado...',
];
let loadingMsgInterval = null;

/* ---- INICIALIZAÇÃO ---- */
document.addEventListener('DOMContentLoaded', () => {
  setupChips('qty-opts', 'qty', parseInt);
  setupChips('subj-opts', 'subject', String);
  setupChips('time-opts', 'timePerQ', parseInt);
  document.getElementById('btn-start').addEventListener('click', startSimulado);
  loadHistory();
});

/* ---- CHIPS DE CONFIGURAÇÃO ---- */
function setupChips(groupId, key, parse) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.config[key] = parse(btn.dataset.val);
    });
  });
}

/* ---- NAVEGAÇÃO DE TELAS ---- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ---- INICIAR SIMULADO ---- */
async function startSimulado() {
  clearAllTimers();
  state.questions = [];
  state.answers = {};
  state.revealed = {};
  state.current = 0;
  state.totalTime = 0;
  state.paused = false;
  state.reviewMode = false;

  showScreen('screen-loading');
  animateLoadingMessages();

  const { qty, subject } = state.config;
  const subjectPrompt = subject === 'Aleatório'
    ? `Distribua as ${qty} questões entre estas disciplinas: Língua Portuguesa, Matemática Financeira, Conhecimentos Bancários, Raciocínio Lógico e Atualidades do Mercado Financeiro.`
    : `Todas as ${qty} questões devem ser da disciplina: ${subject}.`;

  const prompt = `Você é um especialista em elaboração de questões de concurso público, com profundo conhecimento da banca Cesgranrio e do edital do Banco do Brasil para o cargo de Escriturário.

Gere exatamente ${qty} questões de múltipla escolha no estilo exato da Cesgranrio. ${subjectPrompt}

REGRAS OBRIGATÓRIAS:
1. Cada questão deve ter exatamente 5 alternativas (A, B, C, D, E)
2. Estilo Cesgranrio: enunciados objetivos e contextualizados
3. Inclua explicação do gabarito (2-3 linhas didáticas)
4. Distribua bem os gabaritos (A até E)

Responda SOMENTE com JSON puro:
{
  "questions": [
    {
      "id": 1,
      "subject": "nome da disciplina",
      "text": "enunciado",
      "options": [
        {"letter": "A", "text": "texto A"},
        {"letter": "B", "text": "texto B"},
        {"letter": "C", "text": "texto C"},
        {"letter": "D", "text": "texto D"},
        {"letter": "E", "text": "texto E"}
      ],
      "correct": "letra",
      "explanation": "explicação"
    }
  ]
}`;

  const url = 'https://jjrfqbcxjecodnvxcyvi.supabase.co/functions/v1/swift-task';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let rawText = data.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(rawText);

    state.questions = parsed.questions;
    clearInterval(loadingMsgInterval);
    startQuiz();

  } catch (err) {
    clearInterval(loadingMsgInterval);
    console.error('Erro:', err);
    document.getElementById('screen-loading').innerHTML = `
      <div style="text-align:center; padding: 2rem;">
        <p style="color:#ff5a5a;">Erro ao gerar questões: ${err.message}</p>
        <button class="btn-ghost" onclick="showScreen('screen-home')">← Voltar</button>
      </div>
    `;
  }
}

/* ---- LOADING MESSAGES ---- */
function animateLoadingMessages() {
  let i = 0;
  const el = document.getElementById('loading-text');
  if (el) el.textContent = loadingMessages[0];
  loadingMsgInterval = setInterval(() => {
    i = (i + 1) % loadingMessages.length;
    if (el) el.textContent = loadingMessages[i];
  }, 2000);
}

/* ---- INICIAR QUIZ ---- */
function startQuiz() {
  showScreen('screen-quiz');
  document.getElementById('quiz-discipline-badge').textContent = 'Simulado BB · Cesgranrio';
  document.getElementById('quiz-subtitle').textContent =
    state.config.subject === 'Aleatório' ? 'Disciplinas variadas' : state.config.subject;

  // Garante que não haja intervalo duplicado
  clearInterval(state.totalTimerInterval);
  state.totalTimerInterval = setInterval(() => {
    if (!state.paused) state.totalTime++;
  }, 1000);

  renderQuestion();
  startQuestionTimer();
}

/* ---- RENDER QUESTÃO ---- */
function renderQuestion() {
  const { questions, current, answers, revealed } = state;
  const q = questions[current];
  if (!q) return;

  document.getElementById('q-counter').textContent = `Questão ${current + 1} de ${questions.length}`;
  document.getElementById('q-answered-count').textContent = `${Object.keys(answers).length} respondidas`;
  document.getElementById('prog-fill').style.width = `${(Object.keys(answers).length / questions.length) * 100}%`;

  document.getElementById('q-num').textContent = String(current + 1).padStart(2, '0');
  document.getElementById('q-subject-tag').textContent = q.subject;
  document.getElementById('q-text').textContent = q.text;

  renderOptions(q, current);
  renderExplanation(q, current);
  renderDots();
  updateNavButtons();
}

function renderOptions(q, idx) {
  const container = document.getElementById('q-options');
  container.innerHTML = '';
  const userAnswer = state.answers[idx];
  const isRevealed = state.revealed[idx];

  q.options.forEach(opt => {
    const div = document.createElement('div');
    div.className = 'option';
    if (isRevealed) {
      if (opt.letter === q.correct) div.classList.add('revealed-correct');
      else if (opt.letter === userAnswer) div.classList.add('wrong');
    } else if (opt.letter === userAnswer) {
      div.classList.add('selected');
    }
    div.innerHTML = `<span class="opt-letter">${opt.letter}</span><span class="opt-text">${opt.text}</span>`;
    if (!isRevealed) div.addEventListener('click', () => selectAnswer(opt.letter));
    container.appendChild(div);
  });
}

function selectAnswer(letter) {
  if (state.revealed[state.current]) return;
  state.answers[state.current] = letter;
  state.revealed[state.current] = true;
  clearInterval(state.timerInterval);
  renderQuestion();
}

function renderExplanation(q, idx) {
  const box = document.getElementById('q-explanation');
  if (state.revealed[idx]) {
    const isCorrect = state.answers[idx] === q.correct;
    box.style.display = 'block';
    box.innerHTML = `<strong>Gabarito: ${q.correct}</strong>${isCorrect ? ' ✓' : ' ✗'} — ${q.explanation}`;
  } else {
    box.style.display = 'none';
  }
}

function renderDots() {
  const container = document.getElementById('nav-dots');
  container.innerHTML = '';
  state.questions.forEach((q, i) => {
    const dot = document.createElement('button');
    dot.className = `dot ${i === state.current ? 'current' : ''}`;
    if (state.revealed[i]) dot.classList.add(state.answers[i] === q.correct ? 'correct' : 'wrong');
    dot.addEventListener('click', () => {
      state.current = i;
      renderQuestion();
      if (!state.revealed[i]) startQuestionTimer();
    });
    container.appendChild(dot);
  });
}

/* ---- NAVEGAÇÃO ENTRE QUESTÕES ---- */
function goQ(dir) {
  if (dir === 1 && state.current === state.questions.length - 1) {
    confirmFinish();
    return;
  }
  state.current = Math.max(0, Math.min(state.questions.length - 1, state.current + dir));
  renderQuestion();
  if (!state.revealed[state.current]) startQuestionTimer();
  else clearInterval(state.timerInterval);
}

function updateNavButtons() {
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  btnPrev.style.opacity = state.current === 0 ? '0.3' : '1';
  btnPrev.style.pointerEvents = state.current === 0 ? 'none' : 'auto';
  btnNext.textContent = state.current === state.questions.length - 1 ? 'Finalizar ✓' : 'Próxima →';
}

/* ---- TIMER ---- */
function startQuestionTimer() {
  clearInterval(state.timerInterval);
  const row = document.getElementById('timer-row');
  const fill = document.getElementById('timer-bar-fill');
  if (state.config.timePerQ === 0) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  state.timeLeft = state.config.timePerQ;
  state.maxTime = state.config.timePerQ;
  state.paused = false;
  updatePauseBtn();
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    if (state.paused) return;
    state.timeLeft--;
    updateTimerDisplay();
    fill.style.width = `${(state.timeLeft / state.maxTime) * 100}%`;
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      if (!state.revealed[state.current]) { state.revealed[state.current] = true; renderQuestion(); }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(state.timeLeft / 60), s = state.timeLeft % 60;
  document.getElementById('timer-display').textContent = `${m}:${String(s).padStart(2, '0')}`;
}

function togglePause() { state.paused = !state.paused; updatePauseBtn(); }
function updatePauseBtn() { document.getElementById('btn-pause').textContent = state.paused ? '▶ Continuar' : '⏸ Pausar'; }

/* ---- FINALIZAR ---- */
function confirmFinish() {
  if (Object.keys(state.answers).length < state.questions.length) {
    if (!confirm("Há questões em branco. Deseja finalizar?")) return;
  }
  clearAllTimers();
  showResults();
}

function clearAllTimers() {
  clearInterval(state.timerInterval);
  clearInterval(state.totalTimerInterval);
  clearInterval(loadingMsgInterval);
}

/* ---- RESULTADOS ---- */
function showResults() {
  showScreen('screen-result');
  const total = state.questions.length;
  const correct = state.questions.filter((q, i) => state.answers[i] === q.correct).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  document.getElementById('res-score').textContent = `${pct}%`;
  document.getElementById('res-correct').textContent = correct;
  document.getElementById('res-time').textContent = `${Math.floor(state.totalTime / 60)}min`;
  renderBreakdown();
  saveToHistory(pct, correct, total);
}

function renderBreakdown() {
  const subjects = {};
  state.questions.forEach((q, i) => {
    if (!subjects[q.subject]) subjects[q.subject] = { correct: 0, total: 0 };
    subjects[q.subject].total++;
    if (state.answers[i] === q.correct) subjects[q.subject].correct++;
  });
  document.getElementById('subject-breakdown').innerHTML = Object.entries(subjects).map(([name, data]) => `
    <div class="sb-row">
      <span>${name}</span>
      <span>${Math.round((data.correct / data.total) * 100)}%</span>
    </div>
  `).join('');
}

/* ---- HISTÓRICO ---- */
function saveToHistory(pct, correct, total) {
  const history = getHistory();
  history.unshift({ date: new Date().toLocaleString(), subject: state.config.subject, pct, correct, total });
  localStorage.setItem('simulado-bb-history', JSON.stringify(history.slice(0, 10)));
}

function getHistory() {
  return JSON.parse(localStorage.getItem('simulado-bb-history') || '[]');
}

function loadHistory() {
  /* Implementação básica para popular a lista se necessário */
}

function clearHistory() {
  localStorage.removeItem('simulado-bb-history');
}