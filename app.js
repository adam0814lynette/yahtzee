const STORAGE_KEY = 'minimalist-yahtzee-state-v2';
        const THEME_STORAGE_KEY = 'minimalist-yahtzee-dark-mode';
        const MAX_UNDO = 10;

        let setupPlayers = [
            { name: 'Player 1', type: 'human' }
        ];
        let players = [];
        let currentPlayerIndex = 0;
        let currentRound = 1;
        let dice = freshDice();
        let rollsLeft = 3;
        let hasRolled = false;
        let undoStack = [];
        let aiThinking = false;
        let gameActive = false;
        let darkMode = localStorage.getItem(THEME_STORAGE_KEY) === 'true';

        const CATEGORIES = {
            ones: { id: 'ones', name: 'Ones', section: 'upper', calc: (d) => sumMatch(d, 1) },
            twos: { id: 'twos', name: 'Twos', section: 'upper', calc: (d) => sumMatch(d, 2) },
            threes: { id: 'threes', name: 'Threes', section: 'upper', calc: (d) => sumMatch(d, 3) },
            fours: { id: 'fours', name: 'Fours', section: 'upper', calc: (d) => sumMatch(d, 4) },
            fives: { id: 'fives', name: 'Fives', section: 'upper', calc: (d) => sumMatch(d, 5) },
            sixes: { id: 'sixes', name: 'Sixes', section: 'upper', calc: (d) => sumMatch(d, 6) },
            threeKind: { id: 'threeKind', name: '3 of a Kind', section: 'lower', calc: (d) => hasKind(d, 3) ? sumAll(d) : 0 },
            fourKind: { id: 'fourKind', name: '4 of a Kind', section: 'lower', calc: (d) => hasKind(d, 4) ? sumAll(d) : 0 },
            fullHouse: { id: 'fullHouse', name: 'Full House', section: 'lower', calc: (d) => isFullHouse(d) ? 25 : 0 },
            smStraight: { id: 'smStraight', name: 'Sm Straight', section: 'lower', calc: (d) => isStraight(d, 4) ? 30 : 0 },
            lgStraight: { id: 'lgStraight', name: 'Lg Straight', section: 'lower', calc: (d) => isStraight(d, 5) ? 40 : 0 },
            yahtzee: { id: 'yahtzee', name: 'Yahtzee', section: 'lower', calc: (d) => hasKind(d, 5) ? 50 : 0 },
            chance: { id: 'chance', name: 'Chance', section: 'lower', calc: (d) => sumAll(d) }
        };

        function freshDice() {
            return Array.from({ length: 5 }, (_, i) => ({ id: i, value: 1, held: false }));
        }

        function applyPreset(mode) {
            if (mode === 'local') {
                setupPlayers = setupPlayers.map((p, i) => ({ name: p.name && !p.name.startsWith('AI') ? p.name : `Player ${i + 1}`, type: 'human' }));
            } else {
                if (setupPlayers.length < 2) {
                    setupPlayers.push({ name: 'AI 1', type: 'ai' });
                }
                setupPlayers = setupPlayers.map((p, i) => i === 0
                    ? { name: p.name && !p.name.startsWith('AI') ? p.name : 'Player 1', type: 'human' }
                    : { name: p.name && p.name.startsWith('AI') ? p.name : `AI ${i}`, type: 'ai' });
            }
            renderSetup();
        }

        function setPlayerCount(value) {
            const count = Number(value);
            while (setupPlayers.length < count) {
                const i = setupPlayers.length;
                setupPlayers.push({ name: `Player ${i + 1}`, type: 'human' });
            }
            setupPlayers = setupPlayers.slice(0, count);
            if (!setupPlayers.some(p => p.type === 'human')) setupPlayers[0].type = 'human';
            renderSetup();
        }

        function updateSetupName(index, value) {
            setupPlayers[index].name = value.trim() || `Player ${index + 1}`;
        }

        function updateSetupType(index, value) {
            setupPlayers[index].type = value;
            if (!setupPlayers.some(p => p.type === 'human')) setupPlayers[index].type = 'human';
            if (setupPlayers[index].name.startsWith('AI') && value === 'human') setupPlayers[index].name = `Player ${index + 1}`;
            if (setupPlayers[index].name.startsWith('Player') && value === 'ai') setupPlayers[index].name = `AI ${index}`;
            renderSetup();
        }

        function renderSetup() {
            document.getElementById('player-count').value = String(setupPlayers.length);
            document.getElementById('dark-mode-toggle').checked = darkMode;
            document.getElementById('player-config').innerHTML = setupPlayers.map((player, i) => `
                <div class="grid grid-cols-[1fr_96px] gap-2">
                    <input value="${escapeHtml(player.name)}" oninput="updateSetupName(${i}, this.value)" class="secondary-action min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-3 text-base" aria-label="Player ${i + 1} name">
                    <select onchange="updateSetupType(${i}, this.value)" class="secondary-action rounded-lg border border-slate-300 bg-white px-2 py-3 text-sm font-semibold" aria-label="Player ${i + 1} type">
                        <option value="human" ${player.type === 'human' ? 'selected' : ''}>Local</option>
                        <option value="ai" ${player.type === 'ai' ? 'selected' : ''}>AI</option>
                    </select>
                </div>
            `).join('');
            document.getElementById('continue-btn').classList.toggle('hidden', !hasSavedGame());
        }

        function setDarkMode(enabled) {
            darkMode = enabled;
            localStorage.setItem(THEME_STORAGE_KEY, String(darkMode));
            applyTheme();
            renderSetup();
        }

        function applyTheme() {
            document.body.classList.toggle('dark-mode', darkMode);
        }

        function startGame() {
            players = setupPlayers.map((p, i) => ({
                name: p.name || `Player ${i + 1}`,
                type: p.type,
                scores: {},
                yahtzeeBonusCount: 0
            }));
            currentPlayerIndex = 0;
            currentRound = 1;
            undoStack = [];
            aiThinking = false;
            gameActive = true;
            resetTurn();
            showScreen('game');
            saveGame();
            updateUI();
            scheduleAiTurn();
        }

        function resetTurn() {
            dice = freshDice();
            rollsLeft = 3;
            hasRolled = false;
        }

        function rollDice() {
            if (rollsLeft === 0 || isAiTurn()) return;
            animateDice();
            document.getElementById('roll-btn').disabled = true;

            setTimeout(() => {
                rollOpenDice();
                rollsLeft--;
                hasRolled = true;
                saveGame();
                updateUI();
            }, 400);
        }

        function animateDice() {
            document.querySelectorAll('.die').forEach(el => {
                if (!el.classList.contains('held')) el.classList.add('rolling');
            });
        }

        function rollOpenDice() {
            dice.forEach(d => {
                if (!d.held) d.value = Math.floor(Math.random() * 6) + 1;
            });
        }

        function toggleDie(id) {
            if (isAiTurn() || rollsLeft === 3 || (rollsLeft === 0 && !hasRolled)) return;
            dice[id].held = !dice[id].held;
            saveGame();
            updateUI();
        }

        function scoreCategory(categoryId) {
            if (isAiTurn()) return;
            commitScore(categoryId, true);
        }

        function commitScore(categoryId, allowUndo) {
            if (!hasRolled) return;

            const player = players[currentPlayerIndex];
            if (player.scores[categoryId] !== undefined) return;

            if (allowUndo) {
                undoStack.push(getSnapshot());
                undoStack = undoStack.slice(-MAX_UNDO);
            }

            const score = CATEGORIES[categoryId].calc(dice);
            if (hasKind(dice, 5) && player.scores.yahtzee === 50 && categoryId !== 'yahtzee') {
                player.yahtzeeBonusCount++;
            }

            player.scores[categoryId] = score;
            nextTurn();
        }

        function nextTurn() {
            currentPlayerIndex++;
            if (currentPlayerIndex >= players.length) {
                currentPlayerIndex = 0;
                currentRound++;
            }

            if (currentRound > 13) {
                endGame();
            } else {
                resetTurn();
                saveGame();
                updateUI();
                scheduleAiTurn();
            }
        }

        async function scheduleAiTurn() {
            if (!isAiTurn() || aiThinking) return;
            aiThinking = true;
            updateUI();
            await sleep(450);

            while (isAiTurn() && gameActive) {
                await playAiTurn();
                await sleep(450);
            }

            aiThinking = false;
            updateUI();
        }

        async function playAiTurn() {
            while (rollsLeft > 0) {
                if (!isAiTurn()) return;
                rollOpenDice();
                rollsLeft--;
                hasRolled = true;
                if (rollsLeft > 0) applyAiHolds();
                saveGame();
                updateUI();
                await sleep(450);
            }
            if (!hasRolled) return;
            const categoryId = chooseAiCategory(players[currentPlayerIndex]);
            await sleep(250);
            commitScore(categoryId, false);
        }

        function applyAiHolds() {
            const c = counts(dice);
            const target = Object.keys(c).map(Number).sort((a, b) => c[b] - c[a] || b - a)[0];
            dice = dice.map(d => ({ ...d, held: d.value === target }));
        }

        function chooseAiCategory(player) {
            const openCategories = Object.values(CATEGORIES).filter(cat => player.scores[cat.id] === undefined);
            const upperScore = calculateTotals(player).upperTotal;
            let best = openCategories[0];
            let bestValue = -1;

            openCategories.forEach(cat => {
                let value = cat.calc(dice);
                if (cat.section === 'upper' && upperScore < 63) value += Math.min(value, 18) * 0.4;
                if (cat.id === 'yahtzee' && value === 0) value -= 12;
                if ((cat.id === 'lgStraight' || cat.id === 'fullHouse') && value === 0) value -= 6;
                if (value > bestValue) {
                    bestValue = value;
                    best = cat;
                }
            });

            return best.id;
        }

        function undoScore() {
            if (aiThinking || undoStack.length === 0) return;
            const snapshot = undoStack.pop();
            restoreSnapshot(snapshot);
            saveGame();
            updateUI();
            scheduleAiTurn();
        }

        function getSnapshot() {
            return cloneState({
                players,
                currentPlayerIndex,
                currentRound,
                dice,
                rollsLeft,
                hasRolled
            });
        }

        function restoreSnapshot(snapshot) {
            players = cloneState(snapshot.players);
            currentPlayerIndex = snapshot.currentPlayerIndex;
            currentRound = snapshot.currentRound;
            dice = cloneState(snapshot.dice);
            rollsLeft = snapshot.rollsLeft;
            hasRolled = snapshot.hasRolled;
            gameActive = true;
            aiThinking = false;
            showScreen('game');
        }

        function endGame() {
            gameActive = false;
            localStorage.removeItem(STORAGE_KEY);
            showScreen('game-over');

            const standings = players
                .map(p => ({ ...p, ...calculateTotals(p) }))
                .sort((a, b) => b.total - a.total);

            document.getElementById('final-standings').innerHTML = standings.map((p, i) => `
                <div class="flex justify-between items-center p-4 rounded-lg ${i === 0 ? 'bg-slate-950 text-white shadow-md' : 'bg-slate-100 border border-slate-200'}">
                    <span class="font-semibold">${i === 0 ? 'Winner: ' : ''}${escapeHtml(p.name)}</span>
                    <span class="${i === 0 ? 'text-2xl font-light' : 'text-xl font-light'}">${p.total}</span>
                </div>
            `).join('');
        }

        function resetGame() {
            gameActive = false;
            undoStack = [];
            localStorage.removeItem(STORAGE_KEY);
            showScreen('setup');
            renderSetup();
        }

        function confirmNewGame() {
            if (confirm('Start a new game? Current progress will be cleared.')) resetGame();
        }

        function saveGame() {
            if (!gameActive) return;
            const state = {
                players,
                currentPlayerIndex,
                currentRound,
                dice,
                rollsLeft,
                hasRolled,
                undoStack,
                gameActive: true
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }

        function hasSavedGame() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                return Boolean(saved && saved.gameActive && Array.isArray(saved.players));
            } catch {
                return false;
            }
        }

        function loadSavedGame() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (!saved || !Array.isArray(saved.players)) return;
                players = saved.players;
                currentPlayerIndex = saved.currentPlayerIndex;
                currentRound = saved.currentRound;
                dice = saved.dice;
                rollsLeft = saved.rollsLeft;
                hasRolled = saved.hasRolled;
                undoStack = saved.undoStack || [];
                gameActive = true;
                aiThinking = false;
                showScreen('game');
                updateUI();
                scheduleAiTurn();
            } catch {
                localStorage.removeItem(STORAGE_KEY);
                renderSetup();
            }
        }

        function showScreen(screen) {
            document.getElementById('setup-screen').classList.toggle('hidden', screen !== 'setup');
            document.getElementById('game-screen').classList.toggle('hidden', screen !== 'game');
            document.getElementById('game-over-screen').classList.toggle('hidden', screen !== 'game-over');
        }

        const counts = (d) => { const c = {}; d.forEach(die => c[die.value] = (c[die.value] || 0) + 1); return c; };
        const sumMatch = (d, val) => d.filter(die => die.value === val).reduce((s, die) => s + die.value, 0);
        const sumAll = (d) => d.reduce((s, die) => s + die.value, 0);
        const hasKind = (d, n) => Object.values(counts(d)).some(c => c >= n);
        const isFullHouse = (d) => {
            const c = Object.values(counts(d));
            return (c.includes(3) && c.includes(2)) || c.includes(5);
        };
        const isStraight = (d, length) => {
            const vals = [...new Set(d.map(die => die.value))].sort();
            let maxSeq = 1, currentSeq = 1;
            for (let i = 1; i < vals.length; i++) {
                if (vals[i] === vals[i - 1] + 1) currentSeq++;
                else {
                    maxSeq = Math.max(maxSeq, currentSeq);
                    currentSeq = 1;
                }
            }
            return Math.max(maxSeq, currentSeq) >= length;
        };

        function calculateTotals(player) {
            const upperTotal = Object.values(CATEGORIES)
                .filter(c => c.section === 'upper')
                .reduce((sum, c) => sum + (player.scores[c.id] || 0), 0);
            const upperBonus = upperTotal >= 63 ? 35 : 0;
            const lowerTotal = Object.values(CATEGORIES)
                .filter(c => c.section === 'lower')
                .reduce((sum, c) => sum + (player.scores[c.id] || 0), 0);
            const yahtzeeBonus = player.yahtzeeBonusCount * 100;
            return {
                upperTotal,
                upperBonus,
                lowerTotal,
                yahtzeeBonus,
                total: upperTotal + upperBonus + lowerTotal + yahtzeeBonus
            };
        }

        function generateDieFace(value) {
            const dots = {
                1: ['col-start-2 row-start-2'],
                2: ['col-start-1 row-start-1', 'col-start-3 row-start-3'],
                3: ['col-start-1 row-start-1', 'col-start-2 row-start-2', 'col-start-3 row-start-3'],
                4: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-3', 'col-start-3 row-start-3'],
                5: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-2 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3'],
                6: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-2', 'col-start-3 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3']
            };
            return `<div class="grid grid-cols-3 grid-rows-3 gap-0.5 w-full h-full p-1.5 place-items-center">
                ${dots[value].map(pos => `<div class="die-dot ${pos}"></div>`).join('')}
            </div>`;
        }

        function updateUI() {
            if (!players.length) return;
            const player = players[currentPlayerIndex];
            const totals = calculateTotals(player);
            const aiTurn = isAiTurn();

            document.getElementById('player-turn').textContent = `${player.name}${player.type === 'ai' ? ' (AI)' : ''}`;
            document.getElementById('round-info').textContent = `Round ${currentRound} / 13`;
            document.getElementById('turn-status').textContent = aiTurn ? 'AI turn in progress' : '';
            document.getElementById('current-score').textContent = totals.total;
            document.getElementById('undo-btn').disabled = undoStack.length === 0 || aiThinking;

            document.getElementById('dice-container').innerHTML = dice.map((d, i) => `
                <div onclick="toggleDie(${i})" class="die w-11 h-11 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center ${aiTurn ? 'cursor-default' : 'cursor-pointer'} ${d.held ? 'held' : ''}">
                    ${hasRolled ? generateDieFace(d.value) : '<span class="text-slate-400 font-semibold">?</span>'}
                </div>
            `).join('');

            document.getElementById('roll-text').textContent = aiTurn ? 'AI Rolling' : (hasRolled && rollsLeft > 0 ? 'Roll Again' : (rollsLeft === 0 ? 'Out of Rolls' : 'Roll Dice'));
            document.getElementById('rolls-left').textContent = `${rollsLeft} Left`;
            document.getElementById('roll-btn').disabled = aiTurn || rollsLeft === 0;

            const renderScoreItem = (cat) => {
                const isScored = player.scores[cat.id] !== undefined;
                const possibleScore = hasRolled ? cat.calc(dice) : '';
                const score = isScored ? player.scores[cat.id] : possibleScore;
                const scoreClasses = isScored
                    ? 'bg-slate-700 text-white'
                    : (hasRolled ? (score === 0 ? 'bg-rose-100 text-rose-800' : 'bg-blue-700 text-white') : 'bg-slate-100 text-slate-400');
                const rowClasses = isScored
                    ? 'bg-slate-200 border-slate-500 text-slate-950'
                    : (hasRolled && !aiTurn
                        ? 'bg-blue-50 border-blue-500 text-slate-950 cursor-pointer active:scale-95'
                        : 'bg-white border-slate-200 text-slate-400');

                return `
                    <div onclick="scoreCategory('${cat.id}')" class="score-row px-2 py-1.5 min-h-8 rounded-lg border flex justify-between items-center gap-1 transition ${rowClasses}">
                        <span class="text-xs font-semibold leading-tight truncate">${cat.name}</span>
                        <span class="min-w-7 text-center px-1.5 py-0.5 rounded-md text-xs font-bold ${scoreClasses}">${score}</span>
                    </div>
                `;
            };

            document.getElementById('upper-scores').innerHTML = Object.values(CATEGORIES).filter(c => c.section === 'upper').map(renderScoreItem).join('');
            document.getElementById('lower-scores').innerHTML = Object.values(CATEGORIES).filter(c => c.section === 'lower').map(renderScoreItem).join('');
            document.getElementById('upper-bonus').textContent = totals.upperBonus ? `${totals.upperTotal}/63 +35` : `${totals.upperTotal}/63`;
            document.getElementById('upper-bonus').className = totals.upperBonus ? 'font-bold text-green-700' : 'font-medium text-slate-600';
        }

        function isAiTurn() {
            return gameActive && players[currentPlayerIndex] && players[currentPlayerIndex].type === 'ai';
        }

        function cloneState(value) {
            return JSON.parse(JSON.stringify(value));
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        applyTheme();
        renderSetup();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
