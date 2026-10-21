import { Game, MODES, createCatalog, shuffled } from './game.js';

const $ = (selector, root = document) => root.querySelector(selector);
const e = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const paths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  cards: '<rect x="7" y="3" width="13" height="17" rx="3"/><path d="M4 7 2.5 18a3 3 0 0 0 2.6 3.4l9.4 1"/><path d="M11 9h5m-5 4h3"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l3 2M9 2h6m-3 0v4m6 1 2-2"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" stroke-width="3"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.6 2.6 0 1 1 4 2.2c-1 .6-1.5 1.3-1.5 2.8m0 4h.01"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m10 2-.7 3-2 .9L4.5 5 2 9l2.3 2v2L2 15l2.5 4 2.8-.9 2 .9.7 3h4l.7-3 2-.9 2.8.9 2.5-4-2.3-2v-2L22 9l-2.5-4-2.8.9-2-.9-.7-3Z"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 6"/>',
  wifi: '<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0m-3 4h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  play: '<path d="m8 4 13 8-13 8Z"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0Zm0 2H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5m-4 1v6m-4 1h8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  skip: '<path d="m4 5 12 7-12 7ZM20 5v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5Zm5 3a8 8 0 0 1 0 10m3-13a12 12 0 0 1 0 16"/>',
  spark: '<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
const button = (action, label, cls = 'button primary', extra = '') => `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const colors = ['violet', 'orange', 'mint', 'pink', 'blue', 'yellow', 'rose', 'teal'];
const plural = (n, one, few, many) => n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
const cardsText = n => `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`;
const storageKey = `znat-v1:${new URL('.', import.meta.url).pathname}`;
let catalog, game = null, screen = 'home', selectedMode = 'classic', modal = null, offlineReady = false, updateReady = false;
let query = '', category = 'Все темы', toastTimeout, audioContext, installPrompt, lastFocused, savedState;
let preferences = { sound: true, motion: true };
let config = { mode: 'classic', cardCount: 20, slot: 1, names: ['Игрок 1', 'Игрок 2'] };
let history = [];

function readSaved() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; }
  catch { return {}; }
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, config, preferences, history: history.slice(0, 20), game: game?.snapshot() ?? null }));
    return true;
  } catch { toast('Не удалось сохранить партию. Проверьте свободное место.'); return false; }
}

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('visible'), 3200);
}

function feedback(type = 'tap') {
  if (!preferences.sound) return;
  // Web Audio is synthesized locally and only unlocked by a player's interaction.
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const now = audioContext.currentTime;
    const notes = type === 'success' ? [523.25, 659.25, 783.99] : type === 'win' ? [523.25, 659.25, 783.99, 1046.5] : type === 'miss' ? [220] : [640];
    notes.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      const start = now + i * 0.07;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.045, start + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + 0.15);
    });
  } catch { /* Audio is an enhancement; game rules never depend on it. */ }
}

function applyPreferences() {
  document.documentElement.classList.toggle('reduce-motion', !preferences.motion);
}

function header(inGame = false) {
  return `<header class="header"><a class="brand" href="#" data-action="home" aria-label="Аббревиатуры — на главную">Аббревиатуры<span>✳</span></a>
    ${inGame ? `<div class="header-actions">${button('hint', icon('book'), 'icon-button', 'aria-label="Справочник-подсказка"')}${button('pause', icon('pause'), 'icon-button', 'aria-label="Приостановить игру"')}</div>` : `<div class="header-actions"><span class="offline-pill" id="offline-status">${icon(offlineReady ? 'check' : 'download')}<span>${offlineReady ? 'Можно офлайн' : 'Готовим офлайн'}</span></span>${button('settings', icon('settings'), 'icon-button', 'aria-label="Настройки"')}</div>`}
  </header>`;
}

function navigation() {
  return `<nav class="bottom-nav" aria-label="Основная навигация">${[['home', 'cards', 'Играть'], ['dictionary', 'book', 'Справочник'], ['rules', 'help', 'Правила']].map(([target, symbol, name]) => button(`navigate:${target}`, `${icon(symbol)}<span>${name}</span>`, `nav-item ${screen === target ? 'active' : ''}`, screen === target ? 'aria-current="page"' : '')).join('')}</nav>`;
}

function deckArt() {
  return `<div class="deck-art" aria-hidden="true"><span class="art-orbit orbit-one"></span><span class="art-orbit orbit-two"></span><span class="art-spark spark-one">✳</span><span class="art-spark spark-two">✦</span><div class="mini-card card-mint"><span>03 / 50</span><b>ЗОЖ</b><small>ЗНАКОМО?</small></div><div class="mini-card card-orange"><span>02 / 50</span><b>МФЦ</b><small>А КАК РАСШИФРОВАТЬ?</small></div><div class="mini-card card-violet"><span>01 / 50 <i>✦</i></span><b>АББРЕВИАТУРЫ<span>?</span></b><small>БОЛЬШЕ, ЧЕМ БУКВЫ</small></div><span class="art-label">Твоя очередь удивлять ${icon('spark')}</span></div>`;
}

function home() {
  const resumable = game && game.phase !== 'finished';
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="tiny-star">✳</span> БОЛЬШЕ, ЧЕМ ПРОСТО БУКВЫ</div><h1>Всё знакомо.<br><span>А что значит?</span></h1><p>Соберите друзей. Расшифруйте привычное.<br>И пусть победит самый любопытный.</p><div class="hero-meta"><span>${icon('people')} 1–8 игроков</span><span>${icon('timer')} от 5 минут</span><span class="age">14+</span></div></div>${deckArt()}</section>
    ${resumable ? `<div class="resume-banner"><div class="resume-icon">${icon('play')}</div><div><b>Ваша партия ждёт</b><span>${e(MODES[game.mode].title)} · осталось ${cardsText(game.deck.length)}</span></div>${button('continue', `Продолжить ${icon('arrow')}`, 'button small primary')}</div>` : ''}
    <section class="mode-section"><div class="section-heading"><div><span class="eyebrow">КАКОЙ СЕГОДНЯ ПЛАН?</span><h2>Выберите настроение</h2></div><span class="mode-count">4 способа играть</span></div><div class="mode-grid">${Object.entries(MODES).map(([key, mode]) => `<button class="mode-tile ${mode.color} ${key === selectedMode ? 'selected' : ''}" data-action="mode:${key}" aria-pressed="${key === selectedMode}"><span class="mode-top"><span class="mode-icon">${icon(mode.icon)}</span><span class="mode-check">${icon('check')}</span></span><b>${mode.title}</b><span class="mode-subtitle">${mode.subtitle}</span></button>`).join('')}</div>
    <div class="start-row"><div class="deck-note"><span class="deck-number">250</span><span>аббревиатур<br><strong>и столько же открытий</strong></span></div>${button('setup', `Начать игру ${icon('arrow')}`, 'button primary start-button')}</div></section>
    <div class="home-footnote"><span>Один телефон. Целая компания.</span><span>Без регистрации и интернета ${icon('spark')}</span></div>`;
}

function setup() {
  const mode = MODES[config.mode];
  return `<section class="narrow setup-page"><div class="page-heading">${button('navigate:home', icon('back'), 'icon-button', 'aria-label="Назад"')}<div><span class="eyebrow">ПАРА ШТРИХОВ — И ИГРАЕМ</span><h1>Собираем компанию</h1></div></div>
  <div class="selected-mode ${mode.color}"><span class="mode-icon">${icon(mode.icon)}</span><div><b>${mode.title}</b><p>${e(mode.rules)}</p></div></div>
  <section class="setup-block"><div class="section-heading"><h2>Кто играет?</h2><span id="player-count">${config.names.length} / 8</span></div><div class="players-inputs">${config.names.map((name, i) => `<div class="player-input"><span class="avatar ${colors[i]}">${i + 1}</span><label class="sr-only" for="player-${i}">Имя игрока ${i + 1}</label><input id="player-${i}" data-player="${i}" value="${e(name)}" maxlength="24" autocomplete="off" enterkeyhint="done">${config.names.length > (config.mode === 'first' ? 2 : 1) ? button(`remove-player:${i}`, icon('close'), 'icon-button subtle', `aria-label="Удалить игрока ${i + 1}"`) : ''}</div>`).join('')}</div>${config.names.length < 8 ? button('add-player', `${icon('plus')} Добавить игрока`, 'text-button add-player') : ''}<p class="field-hint">${config.mode === 'first' ? 'Ведущим может быть любой из игроков. После ответа он отметит, кто угадал первым.' : 'Передавайте телефон по кругу. Можно играть и одному.'}</p></section>
  <section class="setup-block"><div class="section-heading"><h2>Размер колоды</h2><span class="value-badge" id="card-count-label">${cardsText(config.cardCount)}</span></div><label class="sr-only" for="card-count">Количество карточек</label><input id="card-count" type="range" min="10" max="50" step="1" value="${config.cardCount}" style="--range:${(config.cardCount - 10) * 2.5}%"><div class="range-labels"><span>10 · короткая партия</span><span>50 · большой вечер</span></div></section>
  ${config.mode !== 'random' ? `<section class="setup-block"><div class="section-heading"><h2>Номер на карточке</h2><span class="muted">${config.slot} из 5</span></div><div class="slot-picker" role="group" aria-label="Номер аббревиатуры">${[1,2,3,4,5].map(n => button(`slot:${n}`, String(n).padStart(2, '0'), `slot ${config.slot === n ? 'selected' : ''}`, `aria-pressed="${config.slot === n}"`)).join('')}</div><p class="field-hint">На каждой карточке пять сокращений. Этот номер выбирает, какое отгадывать в партии.</p></section>` : `<div class="info-strip">${icon('dice')} Номер аббревиатуры выберет кубик — он уже в игре.</div>`}
  ${button('start', `Всё готово. Поехали! ${icon('arrow')}`, 'button primary full')}<p class="bottom-hint">Отвечайте вслух, затем сверяйтесь с карточкой.<br>Все игровые инструменты уже внутри.</p></section>`;
}

function scores() {
  return `<div class="scoreboard" aria-label="Счёт игроков">${game.players.map((player, i) => `<div class="score-player ${game.current === i && game.mode !== 'first' ? 'current' : ''}"><span class="avatar ${colors[i]}">${e(player.name.slice(0, 1).toLocaleUpperCase('ru'))}</span><span>${e(player.name)}</span><strong>${player.score}</strong></div>`).join('')}</div>`;
}

function handoff() {
  const first = game.mode === 'first', timed = game.mode === 'timed';
  return `<div class="handoff-content"><div class="handoff-decoration" aria-hidden="true"><span class="handoff-ring"></span><div class="big-avatar ${colors[game.current]}">${first ? icon('bolt') : e(game.player.name.slice(0, 1).toLocaleUpperCase('ru'))}</div><span class="handoff-star">✳</span></div><span class="eyebrow">${first ? 'ВСЕ ГОТОВЫ?' : 'ПЕРЕДАЙТЕ ТЕЛЕФОН'}</span><h1>${first ? 'Кто быстрее?' : e(game.player.name)}</h1><p>${first ? 'Ведущий читает сокращение.<br>Остальные отвечают вслух.' : timed ? 'Ваша минута славы.<br>Таймер пойдёт, когда будете готовы.' : 'Выдохните. Вы наверняка это знаете.<br>Одна карточка — одно открытие.'}</p>${button('begin', `${timed ? 'Начать минуту' : first ? 'Все готовы' : 'Я готов'} ${icon('arrow')}`, 'button primary full')}${button('end-request', 'Завершить партию', 'text-button muted')}</div>`;
}

function die() {
  const face = game.die;
  return `<div class="dice-scene"><div class="dice-object ${face ? 'rolled' : ''}" aria-hidden="true"><span>${face || '?'}</span><i></i><i></i></div><span class="eyebrow">${face === 6 ? 'БЫВАЕТ И ТАК' : 'НЕМНОГО МАГИИ СЛУЧАЯ'}</span><h1>${face === 6 ? 'Шестёрка! Передышка.' : 'Какой номер ваш?'}</h1><p>${face === 6 ? 'Этот ход пропускаете.<br>Карточка остаётся в колоде.' : 'От 1 до 5 — номер на карточке.<br>Шестёрка — пропуск хода.'}</p>${button(face === 6 ? 'skip-die' : 'roll', `${face === 6 ? 'Передать ход' : 'Бросить кубик'} ${icon(face === 6 ? 'arrow' : 'dice')}`, 'button primary full')}</div>`;
}

function flashcard() {
  const entry = game.entry;
  return `<div class="card-stage"><div class="card-under under-two"></div><div class="card-under under-one"></div><div class="flip-card ${game.revealed ? 'flipped' : ''}" data-card="${game.card.id}">
  <div class="card-face card-front" aria-hidden="${game.revealed}"><div class="card-topline"><span class="card-category">${e(entry.category)}</span><span class="entry-number">0${game.slot}</span></div><div class="card-question"><span class="eyebrow">КАК ЭТО РАСШИФРОВАТЬ?</span><h1 class="abbreviation ${entry.text.length > 6 ? 'long' : ''}">${e(entry.text)}</h1><span class="question-dots" aria-hidden="true"><i></i><i></i><i></i></span></div><div class="card-bottomline"><span>АББРЕВИАТУРЫ<span class="tiny-star">✳</span></span><div class="card-slots">${[1,2,3,4,5].map(n => `<i class="${n === game.slot ? 'active' : ''}"></i>`).join('')}</div></div></div>
  <div class="card-face card-back" aria-hidden="${!game.revealed}"><div class="card-topline"><span class="card-category">ПРОВЕРИМ?</span>${icon('spark')}</div><div class="answer-content"><span class="answer-abbreviation">${e(entry.text)}</span><h2>${e(entry.answer)}</h2>${entry.note ? `<p>${e(entry.note)}</p>` : ''}</div><div class="card-bottomline"><span>ТЕПЕРЬ ВЫ ЗНАЕТЕ</span>${icon('check')}</div></div></div></div>`;
}

function gameActions() {
  if (!game.revealed) return `<div class="game-actions">${button('reveal', `Проверить ответ ${icon('arrow')}`, 'button primary full')}${game.mode === 'timed' ? button('skip', `${icon('skip')} Пропустить карточку`, 'text-button muted') : '<p class="field-hint center">Сначала назовите ответ вслух</p>'}</div>`;
  if (game.mode === 'first') return `<div class="game-actions"><span class="eyebrow center">КТО ОТВЕТИЛ ПЕРВЫМ?</span><div class="winner-buttons">${game.players.map((player, i) => button(`award:${player.id}`, `<span class="avatar ${colors[i]}">${e(player.name.slice(0,1))}</span>${e(player.name)} ${icon('plus')}`, 'winner-button')).join('')}</div>${button('incorrect', 'Никто не угадал', 'text-button muted')}</div>`;
  return `<div class="game-actions"><div class="judge-buttons">${button('incorrect', `${icon('close')} Не угадал`, 'button secondary')}${button('correct', `${icon('check')} Верно!`, 'button success')}</div><p class="field-hint center">${game.mode === 'timed' ? 'Следующая карточка — сразу после ответа' : 'Честная игра — самая интересная'}</p></div>`;
}

function play() {
  const isTimed = game.mode === 'timed';
  return `<section class="play-page narrow"><div class="game-topbar"><span class="game-mode ${MODES[game.mode].color}">${icon(MODES[game.mode].icon)} ${MODES[game.mode].title}</span><span class="deck-remaining">${icon('cards')} ${game.deck.length} / ${game.initialDeck.length}</span></div>${scores()}
  ${game.phase === 'handoff' ? handoff() : `<div class="turn-label"><span>${game.mode === 'first' ? 'Кто первым назовёт ответ?' : `Ходит <b>${e(game.player.name)}</b>`}</span>${isTimed ? '<span id="timer" class="timer" role="timer" aria-label="Осталось времени">1:00</span>' : `<span class="slot-label">${game.mode === 'random' ? 'Кубик выбирает' : `Аббревиатура № ${game.config.slot}`}</span>`}</div>${isTimed ? '<div class="timer-track"><div id="timer-progress"></div></div>' : ''}${game.mode === 'random' && (!game.die || game.die === 6) ? die() : `${flashcard()}${gameActions()}`}`}</section>`;
}

function results() {
  const winners = game.winners, tied = winners.length > 1;
  const anyScore = game.awarded.length > 0;
  const standings = [...game.players].sort((a,b) => b.score - a.score);
  return `<section class="narrow results-page"><div class="results-art" aria-hidden="true"><span>✦</span><div>${icon('trophy')}</div><span>✳</span></div><span class="eyebrow">${anyScore ? 'ВОТ ЭТО ПАРТИЯ!' : 'ХОРОШЕЕ НАЧАЛО'}</span><h1>${!anyScore ? 'Главное — любопытство' : game.players.length === 1 ? 'Знаний стало больше!' : tied ? 'Победила дружба!' : `${e(winners[0].name)} — победитель!`}</h1><p>${anyScore ? `Разгадано ${cardsText(game.awarded.length)}. Теперь эти буквы точно что-то значат.` : 'В следующий раз знакомых сокращений станет ещё больше.'}</p><div class="results-table">${standings.map(player => `<div class="result-row ${player.score === standings[0].score && anyScore ? 'first-place' : ''}"><span class="place">${standings.filter(other => other.score > player.score).length + 1}</span><span class="avatar ${colors[player.id]}">${e(player.name.slice(0,1))}</span><b>${e(player.name)}</b><strong>${player.score}<small>${plural(player.score, 'карточка', 'карточки', 'карточек')}</small></strong>${player.score === standings[0].score && anyScore ? icon('trophy') : ''}</div>`).join('')}</div>${button('rematch', `Ещё одну? ${icon('arrow')}`, 'button primary full')}${button('home', 'На главную', 'text-button muted')}<div class="confetti" aria-hidden="true">${Array.from({length:24},(_,i) => `<i style="--i:${i};--x:${(i * 43) % 100}%;--c:${['#7854ed','#c9ed88','#f6aa7b','#e6b8d8'][i % 4]}"></i>`).join('')}</div></section>`;
}

function dictionaryList() {
  const q = query.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const entries = catalog.entries.filter(entry => (category === 'Все темы' || entry.category === category) && `${entry.text} ${entry.answer}`.toLocaleLowerCase('ru').replaceAll('ё', 'е').includes(q));
  return `<div class="dictionary-count">${entries.length} ${plural(entries.length, 'аббревиатура', 'аббревиатуры', 'аббревиатур')}</div>${entries.length ? entries.map(entry => `<details class="dictionary-item"><summary><span>${e(entry.text)}</span><small>${e(entry.category)}</small>${icon('plus')}</summary><div><p>${e(entry.answer)}</p>${entry.note ? `<small>${e(entry.note)}</small>` : ''}</div></details>`).join('') : `<div class="empty-state">${icon('search')}<h2>Пока не нашлось</h2><p>Попробуйте другое сокращение или сбросьте тему.</p></div>`}`;
}

function dictionary(inModal = false) {
  return `<section class="dictionary-page ${inModal ? '' : 'narrow'}"><div class="page-heading"><div><span class="eyebrow">ПОДСКАЗКИ РАЗРЕШАЮТСЯ</span><h1>${inModal ? 'Заглянем в справочник' : 'Буквы со смыслом'}</h1></div></div><p class="page-lead">250 сокращений, которые встречаются в России.<br>Нажмите на любое, чтобы узнать больше.</p><div class="search-field">${icon('search')}<label class="sr-only" for="dictionary-search">Поиск по сокращению или расшифровке</label><input id="dictionary-search" type="search" placeholder="Например, МФЦ или космос" value="${e(query)}" autocomplete="off"></div><div class="category-picker"><label class="sr-only" for="category">Тема</label><select id="category">${['Все темы', ...new Set(catalog.entries.map(entry => entry.category))].map(theme => `<option ${theme === category ? 'selected' : ''}>${e(theme)}</option>`).join('')}</select><span>Нажмите, чтобы раскрыть ответ ${icon('back')}</span></div><div id="dictionary-list">${dictionaryList()}</div></section>`;
}

function rules() {
  return `<section class="narrow rules-page"><span class="eyebrow">ПЯТЬ МИНУТ — И ВСЁ ПОНЯТНО</span><h1>Знакомые буквы.<br><span class="purple-text">Новые открытия.</span></h1><p class="page-lead">Настольная викторина теперь в вашем телефоне.<br>Никаких дополнительных карточек и кубиков.</p><div class="rules-steps">${[['01', 'Соберите компанию', 'От 1 до 8 игроков, один телефон. Выберите режим и от 10 до 50 карточек. На каждой — пять аббревиатур.'], ['02', 'Выберите свой номер', 'От 1 до 5: по нему играем всю партию. В «Рандоме» номер каждый раз выбирает встроенный кубик.'], ['03', 'Отвечайте и проверяйте', 'Произнесите расшифровку вслух. Откройте ответ и честно отметьте результат. Угадали — карточка ваша; нет — вниз колоды.'], ['04', 'Соберите больше всех', 'Играем, пока не разберём всю колоду. В режиме «На время» передаём ход каждую минуту. Побеждает тот, у кого больше карточек.']].map(([number,title,text]) => `<div class="rule-step"><span>${number}</span><div><h2>${title}</h2><p>${text}</p></div></div>`).join('')}</div><h2 class="rules-mode-title">Четыре способа провести вечер</h2>${Object.entries(MODES).map(([key,mode]) => `<details class="mode-rule"><summary><span class="mode-icon ${mode.color}">${icon(mode.icon)}</span><b>${mode.title}</b>${icon('plus')}</summary><p>${e(mode.rules)}</p></details>`).join('')}<div class="rules-note">${icon('book')}<p>Забыли сокращение? Справочник доступен прямо во время игры. В режиме «На время» подсказка ставит таймер на паузу — договоритесь об этом до старта.</p></div><div class="rules-note subtle-note"><p>14+. Используем распространённые значения сокращений: в других областях они могут отличаться. Набор составлен специально для приложения и не воспроизводит карточки печатной игры.</p></div>${button('navigate:home', `Давайте играть ${icon('arrow')}`, 'button primary full')}</section>`;
}

function render(focusHeading = false) {
  applyPreferences();
  const inGame = screen === 'game' && game;
  if (inGame && game.phase === 'finished') recordResult();
  $('#app').innerHTML = `<div class="app-shell ${inGame ? 'in-game' : ''}">${header(inGame && game.phase !== 'finished')}<main id="main" class="page ${screen}-screen">${screen === 'setup' ? setup() : screen === 'dictionary' ? dictionary() : screen === 'rules' ? rules() : inGame ? (game.phase === 'finished' ? results() : play()) : home()}</main>${inGame || screen === 'setup' ? '' : navigation()}<footer class="desktop-footer"><span>Аббревиатуры — интереснее вместе.</span><span>Сделано для любопытных ${icon('spark')}</span></footer></div>`;
  if (focusHeading) {
    const heading = $('main h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  fitAnswer();
  updateTimer();
  if (inGame && game.phase === 'paused' && !modal) showModal('pause');
}

function recordResult() {
  if (!history.some(item => item.id === game.id)) {
    history.unshift({ id: game.id, date: Date.now(), mode: game.mode, correct: game.awarded.length, players: game.players });
    save();
  }
}

function navigate(target) {
  closeModal(); screen = target; query = ''; category = 'Все темы'; render(true);
}

function updateTimer() {
  if (!game || game.mode !== 'timed') return;
  const seconds = Math.ceil(game.timeLeft() / 1000);
  const timer = $('#timer'), progress = $('#timer-progress');
  if (timer) { timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`; timer.classList.toggle('urgent', seconds <= 10); }
  if (progress) { progress.style.transform = `scaleX(${game.timeLeft() / 60000})`; progress.classList.toggle('urgent', seconds <= 10); }
}

function fitAnswer() {
  if (screen !== 'game' || !game?.revealed) return;
  const stage = $('.card-stage'), answer = $('.card-back');
  if (!stage || !answer) return;
  stage.style.height = '';
  // Preserve readable type on short screens instead of clipping a long expansion.
  const needed = Math.ceil(answer.scrollHeight) + 2;
  if (needed > stage.clientHeight) stage.style.height = `${needed}px`;
}

function modalContent(type) {
  if (type === 'settings') return `<span class="eyebrow">ПО ВАШИМ ПРАВИЛАМ</span><h2 id="modal-title">Пара настроек</h2><div class="setting-row"><div><b>Звуки игры</b><p>Небольшие ноты для больших открытий</p></div><label class="switch"><input id="sound-setting" type="checkbox" ${preferences.sound ? 'checked' : ''} aria-label="Звуки игры"><span></span></label></div><div class="setting-row"><div><b>Анимации</b><p>Карточки, кубик и маленькая победа</p></div><label class="switch"><input id="motion-setting" type="checkbox" ${preferences.motion ? 'checked' : ''} aria-label="Анимации"><span></span></label></div><p class="field-hint">Системная настройка «Уменьшение движения» тоже учитывается.</p><div class="offline-info">${icon(offlineReady ? 'check' : 'download')}<div><b>${offlineReady ? 'Готово к игре без интернета' : 'Подготавливаем офлайн-режим'}</b><p>${offlineReady ? 'Все 250 аббревиатур уже на устройстве.' : 'Для сохранения приложения откройте его по HTTPS или localhost.'}</p></div></div>${updateReady ? '<p class="field-hint">Доступно обновление. Оно установится после закрытия всех окон игры.</p>' : ''}${button('install', `${icon('download')} Установить приложение`, 'button secondary full')}<p class="privacy-note">Без аккаунтов, рекламы и отправки ваших данных.<br>Партия сохраняется только на этом устройстве.</p>`;
  if (type === 'install') return `<div class="install-icon">${icon('download')}</div><h2 id="modal-title">Аббревиатуры всегда под рукой</h2><p class="page-lead">На iPhone откройте игру в Safari:</p><ol class="install-steps"><li>Нажмите <b>«Поделиться»</b> — квадрат со стрелкой вверх.</li><li>Выберите <b>«На экран Домой»</b>.</li><li>Нажмите <b>«Добавить»</b> и откройте игру с новой иконки.</li></ol><div class="info-strip">${icon('wifi')} При первом запуске с иконки дождитесь отметки «Можно офлайн». После этого интернет не нужен.</div><p class="field-hint">В Chrome и других браузерах используйте пункт «Установить приложение» в меню.</p>`;
  if (type === 'pause') return `<div class="pause-symbol">${icon('pause')}</div><span class="eyebrow">НИКУДА НЕ СПЕШИМ</span><h2 id="modal-title">Небольшая пауза</h2><p class="page-lead">Партия сохранена. Продолжим, когда<br>все будут готовы.</p>${button('resume', `Продолжить ${icon('play')}`, 'button primary full')}${button('hint', `${icon('book')} Подсмотреть в справочник`, 'button secondary full')}${button('leave', 'Вернуться на главную', 'text-button muted')}${button('end-request', 'Завершить эту партию', 'text-button muted')}`;
  if (type === 'end') return `<h2 id="modal-title">Подвести итоги сейчас?</h2><p class="page-lead">Сравним карточки, которые уже собрали. Результат партии останется на устройстве.</p>${button('end-confirm', 'Завершить и показать счёт', 'button primary full')}${button('close-modal', 'Продолжить играть', 'button secondary full')}`;
  if (type === 'new-game') return `<h2 id="modal-title">Начать новую партию?</h2><p class="page-lead">Ваша текущая партия ещё не завершена. Новая игра заменит её.</p>${button('start-confirm', 'Начать новую', 'button primary full')}${button('close-modal', 'Сохранить текущую', 'button secondary full')}`;
  if (type === 'hint') return `<h2 id="modal-title" class="sr-only">Справочник-подсказка</h2>${dictionary(true)}${button('close-modal', 'Вернуться к партии', 'button primary full sticky-modal-button')}`;
  return '';
}

function showModal(type) {
  if (!modal) lastFocused = document.activeElement;
  modal = type;
  const isHint = type === 'hint';
  $('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal ${isHint ? 'wide-modal' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-handle"></div>${button('close-modal', icon('close'), 'icon-button modal-close', 'aria-label="Закрыть окно"')}${modalContent(type)}</section></div>`;
  document.body.classList.add('modal-open'); $('#app').inert = true;
  const first = $('.modal input, .modal button'); first?.focus({ preventScroll: true });
}

function closeModal() {
  const previous = modal; modal = null;
  $('#modal-root').innerHTML = ''; document.body.classList.remove('modal-open'); $('#app').inert = false;
  if (lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
  // Hints and confirmation dialogs never secretly consume a timed round.
  if (game?.phase === 'paused' && screen === 'game' && ['hint', 'end'].includes(previous)) showModal('pause');
}

function changeGame(action, sound = 'tap') {
  if (action()) { feedback(sound); save(); render(); }
  else { save(); render(); }
}

function startGame() {
  config.names = config.names.map((name,i) => name.trim() || `Игрок ${i + 1}`);
  game = new Game(config, shuffled(catalog.cards));
  modal = null; $('#modal-root').innerHTML = ''; document.body.classList.remove('modal-open'); $('#app').inert = false;
  screen = 'game'; save(); feedback(); render(true);
}

async function act(action) {
  const [name, value] = action.split(':');
  switch (name) {
    case 'navigate': navigate(value); break;
    case 'home':
      if (screen === 'game' && game?.phase !== 'finished') { game.pause(); save(); }
      navigate('home'); break;
    case 'mode':
      selectedMode = value;
      document.querySelectorAll('.mode-tile').forEach(tile => {
        const selected = tile.dataset.action === `mode:${value}`;
        tile.classList.toggle('selected', selected); tile.setAttribute('aria-pressed', String(selected));
      });
      feedback(); break;
    case 'setup':
      config.mode = selectedMode;
      if (config.mode === 'first' && config.names.length < 2) config.names.push('Игрок 2');
      navigate('setup'); break;
    case 'slot': config.slot = Number(value); feedback(); save(); render(); break;
    case 'add-player':
      if (config.names.length < 8) { config.names.push(`Игрок ${config.names.length + 1}`); save(); render(); $(`#player-${config.names.length - 1}`)?.focus(); }
      break;
    case 'remove-player':
      if (config.names.length > (config.mode === 'first' ? 2 : 1)) { config.names.splice(Number(value),1); save(); render(); }
      break;
    case 'start': if (game && game.phase !== 'finished') showModal('new-game'); else startGame(); break;
    case 'start-confirm': startGame(); break;
    case 'continue': screen = 'game'; render(true); break;
    case 'begin': changeGame(() => game.begin()); break;
    case 'reveal': changeGame(() => game.reveal()); break;
    case 'correct': case 'award':
      changeGame(() => game.answer(true, name === 'award' ? Number(value) : null), 'success');
      if (game.phase === 'finished') feedback('win');
      break;
    case 'incorrect': changeGame(() => game.answer(false), 'miss'); break;
    case 'skip': changeGame(() => game.skip()); break;
    case 'roll': {
      const el = $('.dice-object');
      if (!el || el.classList.contains('rolling')) break;
      el.classList.add('rolling'); feedback();
      const bytes = new Uint32Array(1); crypto.getRandomValues(bytes);
      // Rejection sampling avoids modulo bias, including for the skip face.
      const max = 0x100000000 - (0x100000000 % 6);
      while (bytes[0] >= max) crypto.getRandomValues(bytes);
      const rolled = bytes[0] % 6 + 1;
      const reduced = !preferences.motion || matchMedia('(prefers-reduced-motion: reduce)').matches;
      const id = game.id;
      setTimeout(() => { if (game?.id === id && screen === 'game') changeGame(() => game.roll(rolled)); }, reduced ? 0 : 480);
      break;
    }
    case 'skip-die': changeGame(() => game.skipDie()); break;
    case 'pause': game.pause(); save(); render(); if (game.phase !== 'paused') showModal('pause'); break;
    case 'resume':
      modal = null; $('#modal-root').innerHTML = ''; document.body.classList.remove('modal-open'); $('#app').inert = false;
      game.resume(); save(); render(); break;
    case 'settings': showModal('settings'); break;
    case 'close-modal': {
      const wasPause = modal === 'pause'; closeModal();
      if (wasPause && game?.phase === 'paused') { game.resume(); save(); render(); }
      break;
    }
    case 'hint':
      if (game?.phase === 'playing') { game.pause(); save(); }
      query = ''; category = 'Все темы'; showModal('hint'); break;
    case 'leave':
      modal = null; closeModal(); screen = 'home'; save(); render(true); break;
    case 'end-request':
      if (game?.phase === 'playing') { game.pause(); save(); }
      showModal('end'); break;
    case 'end-confirm':
      game.finish(); modal = null; closeModal(); screen = 'game'; save(); feedback('win'); render(true); break;
    case 'rematch': config = structuredClone(game.config); navigate('setup'); break;
    case 'install':
      if (installPrompt) {
        await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null;
      } else showModal('install');
      break;
  }
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  event.preventDefault(); act(target.dataset.action).catch(() => toast('Не получилось выполнить действие. Попробуйте ещё раз.'));
});

document.addEventListener('input', event => {
  const target = event.target;
  if (target.hasAttribute('data-player')) { config.names[Number(target.dataset.player)] = target.value; save(); }
  if (target.id === 'card-count') { config.cardCount = Number(target.value); $('#card-count-label').textContent = cardsText(config.cardCount); target.style.setProperty('--range', `${(config.cardCount - 10) * 2.5}%`); save(); }
  if (target.id === 'dictionary-search') { query = target.value; $('#dictionary-list').innerHTML = dictionaryList(); }
});

document.addEventListener('change', event => {
  if (event.target.id === 'category') { category = event.target.value; $('#dictionary-list').innerHTML = dictionaryList(); }
  if (event.target.id === 'sound-setting') { preferences.sound = event.target.checked; save(); if (preferences.sound) feedback('success'); }
  if (event.target.id === 'motion-setting') { preferences.motion = event.target.checked; applyPreferences(); save(); }
});

document.addEventListener('keydown', event => {
  if (!modal) return;
  if (event.key === 'Escape') { event.preventDefault(); act('close-modal'); return; }
  if (event.key !== 'Tab') return;
  const elements = [...$('.modal').querySelectorAll('button, input, select, summary, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
  const first = elements[0], last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});

function backgroundSave() {
  if (game?.phase === 'playing') { game.pause(); save(); if (screen === 'game') render(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundSave(); });
window.addEventListener('pagehide', backgroundSave);
window.addEventListener('resize', fitAnswer, { passive: true });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('offline', () => { if (offlineReady) toast('Вы офлайн. Играем дальше!'); });
setInterval(() => {
  if (screen !== 'game' || game?.phase !== 'playing') return;
  if (game.tick()) { feedback('miss'); save(); render(true); }
  else updateTimer();
}, 200);

async function prepareOffline() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const watchUpdate = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) updateReady = true; });
    };
    registration.addEventListener('updatefound', watchUpdate); watchUpdate();
    await navigator.serviceWorker.ready;
    offlineReady = true;
    const el = $('#offline-status');
    if (el) el.innerHTML = `${icon('check')}<span>Можно офлайн</span>`;
    // Persistence is best-effort: denied requests do not prevent offline play.
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    const el = $('#offline-status'); if (el) el.innerHTML = `${icon('wifi')}<span>Офлайн не сохранён</span>`;
  }
}

async function boot() {
  try {
    const response = await fetch('./data/abbreviations.json');
    if (!response.ok) throw new Error('Не удалось загрузить карточки.');
    catalog = createCatalog(await response.json());
    savedState = readSaved();
    if (savedState.version === 1) {
      if (typeof savedState.preferences?.sound === 'boolean') preferences.sound = savedState.preferences.sound;
      if (typeof savedState.preferences?.motion === 'boolean') preferences.motion = savedState.preferences.motion;
      if (savedState.config) config = new Game(savedState.config, catalog.cards).config;
      game = Game.restore(savedState.game, catalog.cards);
      if (Array.isArray(savedState.history)) history = savedState.history.filter(item => typeof item?.id === 'string').slice(0,20);
    }
    selectedMode = config.mode;
    render(); prepareOffline();
  } catch (error) {
    $('#app').innerHTML = `<div class="boot error-screen"><span class="brand">Аббревиатуры<span>✳</span></span><h1>Не получилось открыть игру</h1><p>${e(error.message)}</p><p>Для первого запуска нужен интернет. Затем дождитесь отметки «Можно офлайн».</p><button class="button primary" onclick="location.reload()">Попробовать ещё раз</button></div>`;
  }
}

boot();
