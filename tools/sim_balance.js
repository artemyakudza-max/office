// Симулятор баланса «Цицеридиса»: гоняет РЕАЛЬНЫЙ код игры без браузера.
// Запуск: node tools/sim_balance.js
// Показывает по каждому раунду: время падения без игрока, при зажатии,
// выживаемость бота-игрока (человеческая скорость тапов) и среднее число
// попыток до полной победы — чтобы править баланс в js/config.js по числам.
const fs = require("fs");
const path = require("path");

eval(fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf8") +
	"\n;globalThis.CONFIG = CONFIG;");
globalThis.Input = { tapLeft: false, tapRight: false, leftHeld: false, rightHeld: false };
eval(fs.readFileSync(path.join(__dirname, "..", "js", "ciceridis.js"), "utf8") +
	"\n;globalThis.Ciceridis = Ciceridis;");

const c = CONFIG.ciceridis;
const DT = 1 / 60;

// Привести объект к состоянию «тост раунда n только начался»
function startRound(n) {
	Ciceridis.reset();
	Ciceridis.phase = "toast";
	Ciceridis.toastNum = n;
	Ciceridis.toastT = 0;
	Ciceridis.driftDir = Math.random() < 0.5 ? -1 : 1;
	Ciceridis.playerAngle = n >= c.selfFallFromRound ? Ciceridis.driftDir * c.startLeanDeg : 0;
	Ciceridis.angVel = 0;
	Ciceridis.gustT = 0;
	Ciceridis.nextGustSec = Ciceridis.gustInterval();
	Input.tapLeft = Input.tapRight = false;
	Input.leftHeld = Input.rightHeld = false;
	if (bot.hist) bot.hist = []; // сброс «памяти» бота между раундами
	pro.t = 0; pro.hist = []; // сброс таймера и памяти профи
}

// Играть раунд стратегией strategy(угол) до падения/конца; вернуть время и исход
function playRound(n, strategy) {
	startRound(n);
	let t = 0;
	while (Ciceridis.phase === "toast" && t < 30) {
		strategy(Ciceridis.swayAngle());
		Ciceridis.update(DT);
		t += DT;
	}
	return { t, survived: Ciceridis.phase !== "fall" };
}

// Бот-«средний игрок»: реакция с задержкой 0.25 с (видит угол из прошлого),
// не чаще ~3.5 тапов/сек, мёртвая зона 8°. Видит ВИДИМЫЙ угол (с фейком),
// как игрок — фейк провоцирует его нажать не в ту сторону
const bot = (angle) => {
	bot.hist = bot.hist || [];
	bot.hist.push(Ciceridis.swayAngle());
	if (bot.hist.length > 15) bot.hist.shift(); // 15 кадров = 0.25 с задержки
	bot.cool = (bot.cool || 0) - DT;
	if (bot.cool > 0) return;
	const a = bot.hist[0];
	if (a > 8) { Input.tapLeft = true; bot.cool = 0.285; }
	else if (a < -8) { Input.tapRight = true; bot.cool = 0.285; }
};

// Бот-«новичок»: реакция 0.4 с, ~2.5 тапов/сек, мёртвая зона 12°
const noob = (angle) => {
	noob.hist = noob.hist || [];
	noob.hist.push(Ciceridis.swayAngle());
	if (noob.hist.length > 24) noob.hist.shift(); // 24 кадра = 0.4 с задержки
	noob.cool = (noob.cool || 0) - DT;
	if (noob.cool > 0) return;
	const a = noob.hist[0];
	if (a > 12) { Input.tapLeft = true; noob.cool = 0.4; }
	else if (a < -12) { Input.tapRight = true; noob.cool = 0.4; }
};

// Бот-«профи»: реакция 0.05 с, ~8 тапов/сек, мёртвая зона 2°.
// Живой профи знает ритм дрожи и гасит именно свой наклон: вычисляет дрожь
// по формуле (sin от времени раунда) и отделяет её от наклона игрока
const pro = (angle) => {
	pro.t = (pro.t || 0) + DT;
	pro.hist = pro.hist || [];
	pro.hist.push(Ciceridis.swayAngle());
	if (pro.hist.length > 3) pro.hist.shift(); // 3 кадра = 0.05 с задержки
	pro.cool = (pro.cool || 0) - DT;
	if (pro.cool > 0) return;
	const amp = Ciceridis.swayAmp();
	const period = Ciceridis.swayPeriod();
	const sway = Math.sin(pro.t / period * Math.PI * 2) * amp;
	const a = pro.hist[0] - sway; // наклон игрока без дрожи
	if (a > 2) { Input.tapLeft = true; pro.cool = 0.12; }
	else if (a < -2) { Input.tapRight = true; pro.cool = 0.12; }
};

// Зажатие половины против начального наклона — проверка «автопилота»
const holdOpposite = () => {
	if (Ciceridis.driftDir > 0) Input.leftHeld = true;
	else Input.rightHeld = true;
};

function avg(arr) { return arr.reduce((s, x) => s + x, 0) / arr.length; }

console.log("раунд | без игрока | зажатие | новичок | средний | профи");
for (let n = 1; n <= c.totalRounds; n++) {
	const idle = avg([0, 1, 2, 3, 4].map(() => playRound(n, () => {}).t));
	const hold = avg([0, 1, 2, 3, 4].map(() => playRound(n, holdOpposite).t));
	const N = 400;
	const t0 = []; for (let i = 0; i < N; i++) t0.push(playRound(n, noob));
	const t1 = []; for (let i = 0; i < N; i++) t1.push(playRound(n, bot));
	const t2 = []; for (let i = 0; i < N; i++) t2.push(playRound(n, pro));
	const s0 = Math.round(100 * t0.filter(r => r.survived).length / N);
	const s1 = Math.round(100 * t1.filter(r => r.survived).length / N);
	const s2 = Math.round(100 * t2.filter(r => r.survived).length / N);
	console.log(
		`  ${n}   |  ${idle.toFixed(1)} с  | ${hold.toFixed(1)} с  |  ${s0}%  |  ${s1}%  |  ${s2}%`);
}

// Полный забег 1→10 профи: среднее число попыток до победы
let wins = 0;
const RUNS = 2000;
for (let i = 0; i < RUNS; i++) {
	let ok = true;
	for (let n = 1; n <= c.totalRounds && ok; n++) {
		if (!playRound(n, pro).survived) ok = false;
	}
	if (ok) wins++;
}
console.log(`\nПолных побед ПРОФИ: ${wins}/${RUNS} → в среднем попыток до победы: ~${Math.round(RUNS / Math.max(1, wins))}`);
