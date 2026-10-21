export const MODES = {
  classic: { title: 'По очереди', subtitle: 'Без спешки, по кругу', icon: 'cards', color: 'violet',
    rules: 'Расшифровывайте аббревиатуры по очереди. Верный ответ — карточка ваша. Ошибка — карточка уходит вниз колоды. Играем, пока не разберём всю стопку. Побеждает тот, кто собрал больше карточек.' },
  timed: { title: 'На время', subtitle: 'Минута, чтобы удивить', icon: 'timer', color: 'orange',
    rules: 'У вас 60 секунд: отгадывайте по одной аббревиатуре с каждой карточки. Трудную можно пропустить. После минуты передайте телефон следующему игроку. Продолжайте по кругу, пока не разберёте всю колоду. Побеждает тот, кто собрал больше карточек.' },
  first: { title: 'Кто первый', subtitle: 'Знаешь? Отвечай!', icon: 'bolt', color: 'mint',
    rules: 'Ведущий читает аббревиатуру вслух. Кто первым назвал верную расшифровку, забирает карточку. После проверки ведущий отмечает победителя. Если не угадал никто, карточка возвращается вниз колоды.' },
  random: { title: 'Рандом', subtitle: 'Доверьтесь кубику', icon: 'dice', color: 'pink',
    rules: 'Перед каждым ходом бросьте кубик: от 1 до 5 — номер аббревиатуры на карточке, 6 — пропуск хода. Верный ответ приносит карточку, при ошибке она уходит вниз колоды. После каждого хода передайте телефон следующему игроку.' }
};

export function createCatalog(entries) {
  if (!Array.isArray(entries) || entries.length !== 250) throw new Error('В наборе должно быть 250 аббревиатур.');
  const ids = new Set(), texts = new Set(), groups = new Map();
  for (const entry of entries) {
    if (!Number.isInteger(entry.id) || !['text', 'answer', 'category'].every(key => typeof entry[key] === 'string' && entry[key].trim()) || ids.has(entry.id) || texts.has(entry.text.toLocaleUpperCase('ru'))) {
      throw new Error('Набор карточек повреждён.');
    }
    ids.add(entry.id); texts.add(entry.text.toLocaleUpperCase('ru'));
    if (!groups.has(entry.category)) groups.set(entry.category, []);
    groups.get(entry.category).push(entry);
  }
  const themes = [...groups.values()];
  if (themes.length !== 5 || themes.some(group => group.length !== 50)) throw new Error('Нужно пять тем по 50 аббревиатур.');
  const cards = Array.from({ length: 50 }, (_, index) => ({
    id: index + 1,
    entries: Array.from({ length: 5 }, (_, slot) => themes[(slot + index) % 5][index])
  }));
  return { entries, cards };
}

export function shuffled(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class Game {
  constructor(config, cards) {
    const names = Array.isArray(config.names) && config.names.length ? config.names.slice(0, 8) : ['Игрок 1'];
    this.config = {
      mode: Object.hasOwn(MODES, config.mode) ? config.mode : 'classic',
      cardCount: Math.min(50, Math.max(10, Math.round(Number(config.cardCount) || 20))),
      slot: Math.min(5, Math.max(1, Math.round(Number(config.slot) || 1))),
      names: names.map((name, i) => String(name).trim().slice(0, 24) || `Игрок ${i + 1}`)
    };
    this.id = globalThis.crypto.randomUUID();
    this.players = this.config.names.map((name, id) => ({ id, name, score: 0 }));
    this.deck = cards.slice(0, this.config.cardCount).map(card => card.id);
    this.initialDeck = [...this.deck];
    this.cards = new Map(cards.map(card => [card.id, card]));
    this.current = 0;
    this.phase = this.deck.length ? 'handoff' : 'finished';
    this.revealed = false;
    this.die = null;
    this.deadline = null;
    this.remaining = 60000;
    this.completedTurns = 0;
    this.awarded = [];
  }

  get mode() { return this.config.mode; }
  get player() { return this.players[this.current]; }
  get card() { return this.cards.get(this.deck[0]); }
  get slot() { return this.mode === 'random' ? (this.die && this.die < 6 ? this.die : null) : this.config.slot; }
  get entry() { return this.slot ? this.card?.entries[this.slot - 1] : null; }
  get winners() {
    const max = Math.max(...this.players.map(player => player.score));
    return this.players.filter(player => player.score === max);
  }

  timeLeft(now = Date.now()) {
    return this.deadline === null ? this.remaining : Math.max(0, Math.min(60000, this.deadline - now));
  }

  begin(now = Date.now()) {
    if (this.phase !== 'handoff') return false;
    this.phase = 'playing';
    if (this.mode === 'timed') { this.remaining = 60000; this.deadline = now + 60000; }
    return true;
  }

  canAct(now) { this.tick(now); return this.phase === 'playing' && this.deck.length > 0; }

  reveal(now = Date.now()) {
    if (!this.canAct(now) || !this.entry || this.revealed) return false;
    this.revealed = true; return true;
  }

  roll(value, now = Date.now()) {
    if (!this.canAct(now) || this.mode !== 'random' || this.die !== null || !Number.isInteger(value) || value < 1 || value > 6) return false;
    this.die = value; return true;
  }

  skipDie() {
    if (this.phase !== 'playing' || this.mode !== 'random' || this.die !== 6) return false;
    this.nextPlayer(); return true;
  }

  answer(correct, winnerID = null, now = Date.now()) {
    if (!this.canAct(now) || !this.revealed || !this.entry) return false;
    const winner = this.mode === 'first' && correct ? this.players.find(player => player.id === winnerID) : this.player;
    if (!winner) return false;
    const card = this.deck.shift();
    if (correct) { winner.score++; this.awarded.push(card); }
    else this.deck.push(card);
    this.clearCard();
    if (!this.deck.length) this.finish();
    else if (this.mode === 'classic' || this.mode === 'random') this.nextPlayer();
    return true;
  }

  skip(now = Date.now()) {
    if (!this.canAct(now) || this.mode !== 'timed') return false;
    this.deck.push(this.deck.shift()); this.clearCard(); return true;
  }

  tick(now = Date.now()) {
    if (this.phase !== 'playing' || this.mode !== 'timed' || this.deadline === null || now < this.deadline) return false;
    this.completedTurns++;
    this.nextPlayer();
    return true;
  }

  pause(now = Date.now()) {
    this.tick(now);
    if (this.phase !== 'playing') return false;
    this.remaining = this.timeLeft(now); this.deadline = null; this.phase = 'paused'; return true;
  }

  resume(now = Date.now()) {
    if (this.phase !== 'paused') return false;
    this.phase = 'playing';
    if (this.mode === 'timed') this.deadline = now + this.remaining;
    return true;
  }

  clearCard() { this.revealed = false; this.die = null; }
  nextPlayer() {
    this.current = (this.current + 1) % this.players.length;
    this.clearCard(); this.deadline = null; this.remaining = 60000; this.phase = 'handoff';
  }
  finish() { this.phase = 'finished'; this.deadline = null; this.revealed = false; }

  snapshot() {
    const { cards, ...state } = this;
    return { version: 1, ...structuredClone(state) };
  }

  static restore(snapshot, cards, now = Date.now()) {
    try {
      if (!snapshot || snapshot.version !== 1 || typeof snapshot.id !== 'string' || !snapshot.config || !Object.hasOwn(MODES, snapshot.config.mode)) return null;
      const game = new Game(snapshot.config, cards);
      const validIDs = new Set(cards.map(card => card.id));
      if (!Array.isArray(snapshot.initialDeck) || snapshot.initialDeck.length !== game.config.cardCount || snapshot.initialDeck.some(id => !validIDs.has(id))) return null;
      if (!Array.isArray(snapshot.deck) || !Array.isArray(snapshot.awarded)) return null;
      const all = [...snapshot.deck, ...snapshot.awarded];
      if (all.length !== snapshot.initialDeck.length || new Set(all).size !== all.length || all.some(id => !snapshot.initialDeck.includes(id))) return null;
      if (!Array.isArray(snapshot.players) || snapshot.players.length !== game.players.length || snapshot.players.some((p, i) => p.id !== i || p.name !== game.players[i].name || !Number.isInteger(p.score) || p.score < 0)) return null;
      if (snapshot.players.reduce((sum, p) => sum + p.score, 0) !== snapshot.awarded.length) return null;
      if (!Number.isInteger(snapshot.current) || !game.players[snapshot.current]) return null;
      if (!['handoff', 'playing', 'paused', 'finished'].includes(snapshot.phase) || (!snapshot.deck.length && snapshot.phase !== 'finished')) return null;
      if (!Number.isFinite(snapshot.remaining) || snapshot.remaining < 0 || snapshot.remaining > 60000) return null;
      if (snapshot.deadline !== null && !Number.isFinite(snapshot.deadline)) return null;
      if (!Number.isSafeInteger(snapshot.completedTurns) || snapshot.completedTurns < 0) return null;
      if (snapshot.die !== null && (!Number.isInteger(snapshot.die) || snapshot.die < 1 || snapshot.die > 6 || game.mode !== 'random')) return null;
      if (typeof snapshot.revealed !== 'boolean') return null;
      for (const key of ['id', 'players', 'deck', 'initialDeck', 'current', 'phase', 'revealed', 'die', 'deadline', 'remaining', 'completedTurns', 'awarded']) game[key] = structuredClone(snapshot[key]);
      // Recover active games paused; background time never silently consumes a round.
      if (game.phase === 'playing') game.pause(now);
      return game;
    } catch { return null; }
  }
}
