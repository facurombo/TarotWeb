document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let currentDeck = [];
    let deckPosition = 0;
    let questionsAsked = 0;
    let cardsToSelect = 0;
    let selectedCards = [];
    let isSelectionPhase = false;
    let currentQuestion = '';

    // --- Session Memory (por ronda) ---
    let sessionMemory = {
        history: [],             // [{ question, cards, summary, resources }]
        usedResources: new Set() // recursos/consejos ya sugeridos en la ronda
    };

    // --- DOM Elements ---
    const subtitle = document.getElementById('subtitle');
    const initialSetup = document.getElementById('initial-setup');
    const roundContainer = document.getElementById('round-container');
    const questionStep = document.getElementById('question-step');
    const selectionStep = document.getElementById('selection-step');
    const resultsContainer = document.getElementById('results-container');
    const loader = document.getElementById('loader');
    const selectedCardsContainer = document.getElementById('selected-cards-container');

    const shuffleButton = document.getElementById('shuffle-button');
    const askButton = document.getElementById('ask-button');

    const userNameInput = document.getElementById('user-name');
    const initialQuestionInput = document.getElementById('initial-question');
    const seedTextInput = document.getElementById('seed-text');
    const cardCountInput = document.getElementById('card-count');
    const nextQuestionInput = document.getElementById('next-question');

    const questionCounterText = document.getElementById('question-counter-text');
    const selectionCountText = document.getElementById('selection-count');
    const facedownCardsContainer = document.getElementById('facedown-cards-container');

    // --- Session Lock (por dia) ---
    const SESSION_LOCK_KEY = 'tarotSessionLockDate';
    const initialSubtitleText = subtitle ? subtitle.textContent : '';

    function getTodayKey() {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${today.getFullYear()}-${month}-${day}`;
    }

    function setSessionInputsDisabled(isDisabled) {
        [shuffleButton, askButton, nextQuestionInput, userNameInput, initialQuestionInput, seedTextInput, cardCountInput].forEach(el => {
            if (el) el.disabled = isDisabled;
        });
    }

    function applySessionLock() {
        setSessionInputsDisabled(true);
        if (subtitle) {
            subtitle.textContent = 'El oraculo solo responde tres preguntas por dia. Vuelve manana.';
        }
        roundContainer.classList.add('hidden');
        selectionStep.classList.add('hidden');
        questionStep.classList.add('hidden');
        loader.classList.add('hidden');
        isSelectionPhase = false;
    }

    function lockSessionForToday() {
        localStorage.setItem(SESSION_LOCK_KEY, getTodayKey());
        applySessionLock();
    }

    function isSessionLockedForToday() {
        return localStorage.getItem(SESSION_LOCK_KEY) === getTodayKey();
    }

    function clearSessionLockIfNewDay() {
        const storedDate = localStorage.getItem(SESSION_LOCK_KEY);
        const today = getTodayKey();
        if (storedDate && storedDate !== today) {
            localStorage.removeItem(SESSION_LOCK_KEY);
        }
    }

    function restoreUnlockedState() {
        setSessionInputsDisabled(false);
        if (subtitle) {
            subtitle.textContent = initialSubtitleText;
        }
    }

    function initializeSessionLock() {
        clearSessionLockIfNewDay();
        if (isSessionLockedForToday()) {
            applySessionLock();
        } else {
            restoreUnlockedState();
        }
    }

    // --- Audio Handling ---
    const backgroundMusic = document.getElementById('background-music');
    const muteButton = document.getElementById('mute-button');
    const textInputs = [userNameInput, initialQuestionInput, seedTextInput];
    let musicStarted = false;

    function startMusic() {
        if (!musicStarted && backgroundMusic) {
            backgroundMusic.play().catch(error => {
                console.log('La reproduccion automatica fue bloqueada por el navegador.');
            });
            musicStarted = true;
        }
    }

    textInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', startMusic, { once: true });
        }
    });

    if (muteButton && backgroundMusic) {
        muteButton.addEventListener('click', () => {
            backgroundMusic.muted = !backgroundMusic.muted;
            muteButton.textContent = backgroundMusic.muted ? 'Mute' : 'Sonido';
        });
    }

    // --- API & Deck Config ---
    const GEMINI_API_KEY = 'AIzaSyDE2UN-_UBFEGnFaCJywyWAwaklzqyUEdA'; // ¡REEMPLAZAR!
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    const fullDeck = [
        'El Loco', 'El Mago', 'La Sacerdotisa', 'La Emperatriz', 'El Emperador', 'El Sumo Sacerdote',
        'Los Enamorados', 'El Carro', 'La Justicia', 'El Ermitaño', 'La Rueda de la Fortuna',
        'La Fuerza', 'El Colgado', 'La Muerte', 'La Templanza', 'El Diablo',
        'La Torre', 'La Estrella', 'La Luna', 'El Sol', 'El Juicio', 'El Mundo',
        'As de Bastos', '2 de Bastos', '3 de Bastos', '4 de Bastos', '5 de Bastos', '6 de Bastos', '7 de Bastos', '8 de Bastos', '9 de Bastos', '10 de Bastos', 'Sota de Bastos', 'Caballo de Bastos', 'Reina de Bastos', 'Rey de Bastos',
        'As de Copas', '2 de Copas', '3 de Copas', '4 de Copas', '5 de Copas', '6 de Copas', '7 de Copas', '8 de Copas', '9 de Copas', '10 de Copas', 'Sota de Copas', 'Caballo de Copas', 'Reina de Copas', 'Rey de Copas',
        'As de Espadas', '2 de Espadas', '3 de Espadas', '4 de Espadas', '5 de Espadas', '6 de Espadas', '7 de Espadas', '8 de Espadas', '9 de Espadas', '10 de Espadas', 'Sota de Espadas', 'Caballo de Espadas', 'Reina de Espadas', 'Rey de Espadas',
        'As de Oros', '2 de Oros', '3 de Oros', '4 de Oros', '5 de Oros', '6 de Oros', '7 de Oros', '8 de Oros', '9 de Oros', '10 de Oros', 'Sota de Oros', 'Caballo de Oros', 'Reina de Oros', 'Rey de Oros'
    ];

    // --- Seed & Shuffle Logic (robusto, sin negativos) ---
    function stringToSeed(str) {
        let h = 2166136261 >>> 0; // FNV-1a
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function createSeededRandom(seed) {
        const s = (seed >>> 0) || 0x9E3779B1; // fallback si es 0
        return mulberry32(s);
    }

    function shuffle(array, randomFunc) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(randomFunc() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    // --- Helpers de memoria/parseo ---
    function stripAndParseMeta(text) {
        const re = /<!--META:(.*?)-->/s;
        const m = text.match(re);
        let meta = null;
        if (m) {
            try { meta = JSON.parse(m[1]); } catch {}
        }
        return { cleanText: text.replace(re, '').trim(), meta };
    }

    function getPreviousContext() {
        const prevQ = sessionMemory.history.map((h, i) =>
            `#${i + 1} Pregunta: "${h.question}". Cartas: ${h.cards.join(', ')}. Resumen: ${h.summary || 'N/A'}.`
        );
        const used = Array.from(sessionMemory.usedResources);
        return {
            summaries: prevQ.join('\n'),
            usedResourcesList: used.length ? used.join(', ') : 'Ninguno'
        };
    }

    // --- Main App Flow ---
    if (shuffleButton) {
        shuffleButton.addEventListener('click', () => {
            if (isSessionLockedForToday()) {
                applySessionLock();
                return;
            }

            const name = userNameInput.value.trim();
            const question = initialQuestionInput.value.trim();
            const seedText = seedTextInput.value.trim() || new Date().toDateString();
            const cardCount = parseInt(cardCountInput.value, 10);

            if (!name || !question) {
                alert('Por favor, ingresa tu nombre y la pregunta inicial.');
                return;
            }
            currentQuestion = question;

            if (isNaN(cardCount) || cardCount <= 0 || cardCount > 10) {
                alert('Por favor, ingresa un numero valido de cartas por tirada (entre 1 y 10).');
                return;
            }
            cardsToSelect = cardCount;

            sessionMemory = { history: [], usedResources: new Set() };

            currentDeck = shuffle([...fullDeck], createSeededRandom(stringToSeed(name + question + seedText)));

            if (currentDeck.length !== 78 || currentDeck.some(card => card === undefined)) {
                console.error('Error en el mazo barajado.', currentDeck);
                alert('Ocurrio un error critico al preparar el mazo. Refresca la pagina.');
                return;
            }

            deckPosition = 0;
            questionsAsked = 0;

            initialSetup.classList.add('hidden');
            roundContainer.classList.remove('hidden');
            resultsContainer.innerHTML = '';
            selectedCardsContainer.innerHTML = '';
            updateQuestionCounter();

            if ((currentDeck.length - deckPosition) < 21) {
                alert('No quedan suficientes cartas. Mezcla de nuevo.');
                initialSetup.classList.remove('hidden');
                roundContainer.classList.add('hidden');
                return;
            }

            selectedCards = [];
            isSelectionPhase = true;

            if (subtitle) {
                subtitle.textContent = `Selecciona ${cardsToSelect} carta(s) para tu pregunta.`;
            }
            questionStep.classList.add('hidden');
            selectionStep.classList.remove('hidden');
            selectionCountText.textContent = cardsToSelect;

            displayFaceDownCards();
        });
    }

    if (askButton) {
        askButton.addEventListener('click', () => {
            if (isSessionLockedForToday()) {
                applySessionLock();
                return;
            }

            const nextQuestion = nextQuestionInput.value.trim();
            if (!nextQuestion) {
                alert('Por favor, escribe tu siguiente pregunta.');
                return;
            }
            currentQuestion = nextQuestion;
            nextQuestionInput.value = '';

            if ((currentDeck.length - deckPosition) < 21) {
                alert('No quedan suficientes cartas en el mazo para otra tirada.');
                return;
            }

            selectedCards = [];
            isSelectionPhase = true;
            selectedCardsContainer.innerHTML = '';

            if (subtitle) {
                subtitle.textContent = `Selecciona ${cardsToSelect} carta(s) para tu pregunta.`;
            }
            questionStep.classList.add('hidden');
            selectionStep.classList.remove('hidden');
            selectionCountText.textContent = cardsToSelect;

            displayFaceDownCards();
        });
    }

    function displayFaceDownCards() {
        facedownCardsContainer.innerHTML = '';
        const cardsForSelection = currentDeck.slice(deckPosition, deckPosition + 21);

        cardsForSelection.forEach((cardName, index) => {
            const cardElement = document.createElement('div');
            cardElement.classList.add('card-facedown');
            cardElement.dataset.cardName = cardName;
            cardElement.dataset.cardIndex = deckPosition + index;

            cardElement.addEventListener('click', handleCardSelection);
            facedownCardsContainer.appendChild(cardElement);
        });
    }

    function handleCardSelection(event) {
        if (!isSelectionPhase || selectedCards.length >= cardsToSelect) return;

        const selectedCardElement = event.currentTarget;
        const cardName = selectedCardElement.dataset.cardName;

        if (selectedCardElement.classList.contains('selected')) return;

        selectedCardElement.classList.add('selected');

        const revealedCard = document.createElement('div');
        revealedCard.classList.add('card-revealed');
        revealedCard.textContent = cardName;
        selectedCardsContainer.appendChild(revealedCard);

        selectedCards.push(cardName);

        if (selectedCards.length === cardsToSelect) {
            isSelectionPhase = false;
            if (subtitle) {
                subtitle.textContent = 'Interpretando tu tirada...';
            }
            facedownCardsContainer.querySelectorAll('.card-facedown:not(.selected)').forEach(card => card.classList.add('selected'));
            getAndDisplayInterpretation();
        }
    }

    async function getAndDisplayInterpretation() {
        loader.classList.remove('hidden');
        selectionStep.classList.add('hidden');

        const interpretation = await getInterpretation(userNameInput.value, currentQuestion, selectedCards);

        const { cleanText, meta } = stripAndParseMeta(interpretation);
        if (meta) {
            const resources = Array.isArray(meta.recursos_sugeridos) ? meta.recursos_sugeridos : [];
            resources.forEach(r => sessionMemory.usedResources.add(r));
            sessionMemory.history.push({
                question: currentQuestion,
                cards: [...selectedCards],
                summary: meta.resumen_breve || '',
                resources
            });
        }

        loader.classList.add('hidden');

        const resultBlock = document.createElement('div');
        resultBlock.innerHTML = `<h3>Tirada ${questionsAsked + 1}</h3><div class="interpretation-block">${cleanText}</div>`;
        resultsContainer.prepend(resultBlock);

        questionsAsked++;
        updateQuestionCounter();

        deckPosition += 21;

        if (questionsAsked >= 3) {
            lockSessionForToday();
            initialSetup.classList.remove('hidden');
        } else {
            if (subtitle) {
                subtitle.textContent = 'Puedes hacer otra pregunta para continuar la ronda.';
            }
            questionStep.classList.remove('hidden');
        }
    }

    function updateQuestionCounter() {
        questionCounterText.textContent = `Pregunta ${questionsAsked + 1} de 3`;
    }

    async function getInterpretation(userName, userQuestion, cards) {
        const cardList = cards.join(', ');
        const { summaries, usedResourcesList } = getPreviousContext();

        const prompt = `
Eres un tarotista profesional. Responde en español rioplatense, con calidez y claridad.

Contexto del consultante:
- Nombre: ${userName}
- Pregunta actual: "${userQuestion}"
- Cartas seleccionadas (en orden): ${cardList}

Memoria de esta ronda:
${summaries || 'Sin datos (esta es la primera tirada de la ronda)'}

Recursos/consejos ya sugeridos (NO repetir): ${usedResourcesList}

Instrucciones de estilo:
1) EXACTAMENTE 4 párrafos, sin viñetas ni listas, sin emojis.
2) Usa las cartas para tejer una narrativa cohesionada.
3) Manten consistencia con lo ya conversado y evita redundancias.
4) Cierra con acciones concretas o recursos NUEVOS (máx. 3).

Agrega este bloque oculto al final para memoria (no lo muestres al usuario):

<!--META:{
  "resumen_breve": "1-2 frases que sinteticen la respuesta para memoria futura",
  "recursos_sugeridos": ["recurso1","recurso2","recurso3"]
}-->
`.trim();

        try {
            const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 800
                    }
                })
            });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            const data = await response.json();
            return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No hay respuesta del oraculo.';
        } catch (error) {
            console.error('Error al contactar al oraculo:', error);
            return 'El oraculo no puede responder. Revisa la consola (F12) y tu API Key.';
        }
    }

    initializeSessionLock();
});

