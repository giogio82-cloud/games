document.addEventListener('DOMContentLoaded', () => {
    // --- Get DOM Elements ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('score');
    const levelDisplay = document.getElementById('level');
    const livesDisplay = document.getElementById('lives');
    const playerNameDisplay = document.getElementById('playerName');
    const lastScoreDisplay = document.getElementById('lastScore');
    const highScoreDisplay = document.getElementById('highScore');
    const restartButton = document.getElementById('restartButton');

    // --- Audio Context for Sound Effects ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // --- DOM HUD container (white area under the canvas) ---
    // Prefer existing static HUDs in HTML (fallback) to avoid duplicates
    let hudContainer = document.getElementById('gameHUDs');
    let laserHUDDiv = document.getElementById('laserHUD');
    let debugHUDDiv = document.getElementById('debugHUD');
    let bonusHUDDiv = document.getElementById('bonusHUD');
    let herzHUDDiv = document.getElementById('herzHUD');
    if (!hudContainer) {
        hudContainer = document.createElement('div');
        hudContainer.id = 'gameHUDs';
        hudContainer.style.cssText = 'background:#fff;padding:12px;margin-top:8px;display:flex;gap:8px;border-radius:6px;align-items:center;flex-wrap:wrap;min-height:64px;box-sizing:border-box;position:relative;z-index:10;border:1px solid #ddd;';
        laserHUDDiv = document.createElement('div');
        laserHUDDiv.className = 'hud-box';
        laserHUDDiv.style.cssText = 'padding:6px;background:#000;color:#0ff;border:2px solid #0ff;border-radius:4px;min-width:140px;text-align:left;';
        debugHUDDiv = document.createElement('div');
        debugHUDDiv.className = 'hud-box';
        debugHUDDiv.style.cssText = 'padding:6px;background:#000;color:#fff;border:1px solid #fff;border-radius:4px;min-width:180px;text-align:left;';
        bonusHUDDiv = document.createElement('div');
        bonusHUDDiv.className = 'hud-box';
        bonusHUDDiv.style.cssText = 'padding:6px;background:#000;color:#ff0;border:2px solid #ff0;border-radius:4px;min-width:160px;text-align:left;';
        herzHUDDiv = document.createElement('div');
        herzHUDDiv.className = 'hud-box';
        herzHUDDiv.style.cssText = 'padding:6px;background:#000;color:#ff6699;border:2px solid #ff6699;border-radius:4px;min-width:200px;text-align:left;';
        laserHUDDiv.textContent = 'Laser: --';
        debugHUDDiv.textContent = 'Debug: --';
        bonusHUDDiv.textContent = 'Bonus: --';
        herzHUDDiv.textContent = 'Herzlevel: --';
        hudContainer.appendChild(laserHUDDiv);
        hudContainer.appendChild(debugHUDDiv);
        hudContainer.appendChild(bonusHUDDiv);
        hudContainer.appendChild(herzHUDDiv);
        // insert HUD container reliably after canvas and match width
        try {
            if (canvas && canvas.insertAdjacentElement) {
                canvas.insertAdjacentElement('afterend', hudContainer);
            } else if (canvas && canvas.parentNode) {
                canvas.parentNode.insertBefore(hudContainer, canvas.nextSibling);
            }
            try { hudContainer.style.width = canvas.style.width || (canvas.getBoundingClientRect().width + 'px'); } catch (e) {}
            console.log('HUD container inserted.');
        } catch (e) { console.error('Failed to insert HUD container', e); }
    } else {
        // ensure hud elements exist (if HTML provided them but script needs refs)
        laserHUDDiv = laserHUDDiv || hudContainer.querySelector('.hud-box') || document.createElement('div');
        debugHUDDiv = debugHUDDiv || hudContainer.querySelectorAll('.hud-box')[1] || document.createElement('div');
        bonusHUDDiv = bonusHUDDiv || hudContainer.querySelectorAll('.hud-box')[2] || document.createElement('div');
        herzHUDDiv = herzHUDDiv || document.getElementById('herzHUD') || document.createElement('div');
        console.log('Using existing HUD container from HTML.');
    }

    // --- Game State Variables ---
    let score, level, gameInterval, gameRunning, gameOverMessage;
    let gameState = 'normal'; // 'normal' or 'bossFight'
    let balls = [], targets = [], fallingObstacles = [], particles = [], stars = [], enemyProjectiles = [];
    let lastScore = 0, highScore = 0, playerName = "Guest";

    // --- Image Assets ---
    let playerImage = new Image();
    let bossImageLevel5 = new Image();
    let bossImageLevel10 = new Image();
    let imagesLoadedCount = 0;
    const totalImages = 3;

    function loadImage(img, src) {
        img.onload = () => {
            imagesLoadedCount++;
            if (img === playerImage) {
                // Adjust player dimensions to image dimensions
                player.width = img.width;
                player.height = img.height;
            }
            if (imagesLoadedCount === totalImages) {
                // All images loaded, start the game
                loadGameData();
                initGame();
            }
        };
        img.onerror = () => {
            console.error(`Failed to load image: ${src}`);
            imagesLoadedCount++; // Still count as loaded to avoid blocking game, but log error
            if (imagesLoadedCount === totalImages) {
                loadGameData();
                initGame();
            }
        };
        img.src = src;
    }

    // --- Game Constants ---
    const initialBallRadius = 10;
    const targetRadius = 15;
    const levelUpScoreThreshold = 100;
    const backgroundOverlayColors = ['rgba(0,0,0,0)', 'rgba(20,0,40,0.2)', 'rgba(40,0,20,0.2)', 'rgba(0,40,0,0.2)', 'rgba(40,40,0,0.2)'];
    const bossScale = 0.2; // 20% of original image size

    // --- Player & Boss Objects ---
    let player = { width: 80, height: 80, x: 0, y: 0, speed: 7, dx: 0, dy: 0, lives: 3, invulnerable: false };

    // --- Laser (K) mechanic ---
    let laserActive = false; // laser currently firing
    let laserAvailable = true; // can be fired (not in cooldown)
    let laserDeactivateAt = 0; // timestamp when current laser firing will end
    let laserCooldownEnd = 0; // timestamp when cooldown ends and laser becomes available
    const laserDuration = 5000; // milliseconds the laser fires
    const laserCooldown = 10000; // milliseconds after firing before it can be used again
    const laserWidth = 8; // visual beam width in pixels
    const laserDamagePerSecond = 5; // damage applied to boss per second

    // --- Whirlwind (W) mechanic ---
    let whirlwindUsed = false; // can only be used once per game
    let whirlwindActive = false;
    let whirlwindEndAt = 0;
    const whirlwindDuration = 2000; // milliseconds visual duration
    const whirlwindScorePerTarget = 10;
    const whirlwindScorePerObstacle = 5;

    // --- Teleport / Bonus Level (T) ---
    let bonusActive = false;
    let bonusEndAt = 0;
    const bonusDuration = 20000; // milliseconds in bonus level (shortened)
    // backup current arrays/state to restore after bonus
    let _backupTargets = null;
    let _backupFalling = null;
    let _backupEnemyProjectiles = null;
    let _backupBalls = null;
    let _backupGameState = null;
    // Bonus NPC (friendly person who grants a whirlwind)
    let bonusNPC = null;
    let bonusNPCCollected = false;
    let bonusNPCNearby = false;
    let interactionMessage = '';
    let interactionMessageEnd = 0;
    // --- Herzlevel (Q) ---
    let herzActive = false;
    let herzEndAt = 0;
    const herzDuration = 60000; // duration for herzlevel
    let herzNPC = null;
    let herzTask = null; // { killsNeeded, reward }
    let herzKillsCount = 0;
    // Maze variables for bonus level
    let mazeCols = 0, mazeRows = 0, cellSize = 40;
    let mazeGrid = null; // will hold cells with walls
    let wallRects = []; // array of wall rectangles for collision
    let boss = null;

    // --- Sound Synthesis Function ---
    function playSound(type) {
        try {
            if (!audioCtx || audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            if (!audioCtx) return;
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            if (type === 'shoot') {
                oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
                gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            } else if (type === 'explosion' || type === 'hit') {
                oscillator.type = 'noise'; gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
            } else if (type === 'playerHit') {
                oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
                gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            }
            else if (type === 'levelUp') {
                oscillator.type = 'square'; oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
                gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.2);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
            } else if (type === 'gameOver') {
                oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
                gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.5);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            }

            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);
        } catch (e) {
            console.error("Web Audio API error:", e);
        }
    }
    
    // --- Particle & Star Systems ---
    function createExplosion(x, y, color) {
        for (let i = 0; i < 20; i++) { particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, radius: Math.random() * 3 + 1, color: color, life: 50 }); }
        playSound('explosion');
    }
    
    function createStars() {
        stars = [];
        if(!canvas.width) return;
        const cssWidth = canvas.width / (window.devicePixelRatio || 1); 
        const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        for(let i = 0; i < 100; i++) { stars.push({ x: Math.random() * cssWidth, y: Math.random() * cssHeight, radius: Math.random() * 1.5, speed: Math.random() * 0.5 + 0.2 }); }
    }

    // --- Load Data & Setup ---
    function loadGameData() {
        if (localStorage.getItem('skyShooter_highScore')) highScore = parseInt(localStorage.getItem('skyShooter_highScore'));
        if (localStorage.getItem('skyShooter_playerName')) playerName = localStorage.getItem('skyShooter_playerName');
    }

    function setupCanvas() {
        const rect = canvas.getBoundingClientRect();
        const cssWidth = rect.width;
        const cssHeight = Math.min(cssWidth * 0.6, 400);
        const dpr = window.devicePixelRatio || 1;
        canvas.width = cssWidth * dpr; canvas.height = cssHeight * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssHeight}px`;
        player.x = (cssWidth / 2) - (player.width / 2);
        player.y = cssHeight - player.height - 10;
        createStars();
    }

    // --- Game Initialization / Reset ---
    function initGame() {
        score = 0; level = 1; gameState = 'normal'; boss = null;
        balls = []; targets = []; fallingObstacles = []; particles = []; enemyProjectiles = [];
        player.lives = 3; player.invulnerable = false;
        gameRunning = true; gameOverMessage = '';

        if (playerName === "Guest" || !localStorage.getItem('skyShooter_playerName')) {
            let nameInput = prompt("Please enter your name:");
            if (nameInput && nameInput.trim() !== "") {
                playerName = nameInput.trim();
                localStorage.setItem('skyShooter_playerName', playerName);
            }
        }
        playerNameDisplay.textContent = playerName;
        scoreDisplay.textContent = score; levelDisplay.textContent = level; livesDisplay.textContent = player.lives;
        lastScoreDisplay.textContent = lastScore; highScoreDisplay.textContent = highScore;
        restartButton.style.display = 'none';

        setupCanvas();
        if (level < 3) { for (let i = 0; i < 5; i++) createTarget(); }
        if (gameInterval) clearInterval(gameInterval);
        gameInterval = setInterval(gameLoop, 1000 / 60);
    }

    // --- Level, State, and Player Hit Management ---
    function levelUp() {
        level++; levelDisplay.textContent = level; playSound('levelUp');
        if (level === 3) targets = [];
        if (level === 5) startBossFight();
    }
    
    function handlePlayerHit() {
        if (player.invulnerable) return;
        playSound('playerHit');
        player.lives--;
        livesDisplay.textContent = player.lives;
        createExplosion(player.x + player.width / 2, player.y + player.height / 2, 'white');
        if (player.lives <= 0) {
            endGame("You ran out of lives!");
        } else {
            player.invulnerable = true;
            setTimeout(() => { player.invulnerable = false; }, 2000);
        }
    }

    function startBossFight() {
        gameState = 'bossFight';
        fallingObstacles = [];
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        let bossImg = null;
        let bossWidth = 100;
        let bossHeight = 100; // Default size, adjust based on image if loaded

        if (level === 5 && bossImageLevel5.complete && bossImageLevel5.naturalHeight !== 0) {
            bossImg = bossImageLevel5;
            bossWidth = bossImg.width * bossScale;
            bossHeight = bossImg.height * bossScale;
        } else if (level === 10 && bossImageLevel10.complete && bossImageLevel10.naturalHeight !== 0) {
            bossImg = bossImageLevel10;
            bossWidth = bossImg.width * bossScale;
            bossHeight = bossImg.height * bossScale;
        }
        
        // Ensure boss dimensions are set, even if image not loaded, to prevent division by zero
        if (bossWidth === 0) bossWidth = 100;
        if (bossHeight === 0) bossHeight = 100;

        boss = {
            x: cssWidth / 2 - bossWidth / 2, y: 50, width: bossWidth, height: bossHeight,
            health: 20, maxHealth: 20, speed: 2, direction: 1,
            shootCooldown: 120, image: bossImg // Store the image to be drawn
        };
    }

    // --- Creation Functions ---
    function createTarget() { 
        if (level >= 3) return;
        console.log('createTarget called');
        const cssWidth = canvas.width / (window.devicePixelRatio || 1); const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        const x = Math.random() * (cssWidth - targetRadius * 2) + targetRadius;
        const y = Math.random() * (cssHeight / 2 - targetRadius * 2) + targetRadius;
        targets.push({ x: x, y: y, radius: targetRadius, hit: false, color: getRandomColor() });
    }
    function createFallingObstacle() { 
        console.log('createFallingObstacle called');
        if (level < 2) return;
        const spawnChance = 0.01 + level * 0.005;
        const speed = 1.5 + (level >= 5 ? (level - 4) * 0.5 : 0);
        if (Math.random() < spawnChance) {
            const cssWidth = canvas.width / (window.devicePixelRatio || 1);
            const x = Math.random() * cssWidth;
            fallingObstacles.push({ x: x, y: 0, radius: getCurrentObstacleRadius(), speed: speed });
        }
    }
    // spawn a test target at a safe position
    function spawnTestTarget() {
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        const x = Math.max(targetRadius, Math.min(cssWidth - targetRadius, player.x + player.width / 2));
        const y = Math.max(targetRadius, Math.min(cssHeight / 2 - targetRadius, player.y - 100));
        targets.push({ x: x, y: y, radius: targetRadius, hit: false, color: getRandomColor() });
        console.log('spawnTestTarget:', x, y, 'targets length', targets.length);
    }

    // --- Teleport / Bonus Level functions ---
    function activateTeleport() {
        if (bonusActive) return;
        bonusActive = true;
        bonusEndAt = Date.now() + bonusDuration;
        // backup current game arrays/state
        _backupTargets = targets.slice();
        _backupFalling = fallingObstacles.slice();
        _backupEnemyProjectiles = enemyProjectiles.slice();
        _backupBalls = balls.slice();
        _backupGameState = gameState;

        // clear current enemies and balls
        targets = [];
        fallingObstacles = [];
        enemyProjectiles = [];
        balls = [];

        // spawn several bonus-only targets (worth more)
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        for (let i = 0; i < 12; i++) {
            const x = Math.random() * (cssWidth - targetRadius * 2) + targetRadius;
            const y = Math.random() * (cssHeight / 2 - targetRadius * 2) + targetRadius;
            targets.push({ x: x, y: y, radius: targetRadius, hit: false, color: '#ffd700', bonus: true });
        }
        // spawn a friendly NPC somewhere in bonus area
        const npcX = Math.random() * (cssWidth - 80) + 40;
        const npcY = Math.random() * (cssHeight / 2 - 80) + 40;
        bonusNPC = { x: npcX, y: npcY, radius: 18, color: '#00cc66' };
        bonusNPCCollected = false;
        // set game state to bonus so draw/update handle correctly
        gameState = 'bonus';
        // ensure any maze data is cleared (we've removed the maze for the bonus level)
        mazeGrid = null; wallRects = [];

        // end bonus after duration
        setTimeout(() => { endTeleport(); }, bonusDuration);
    }

    function endTeleport() {
        bonusActive = false;
        // clear bonus targets and restore backups
        targets = _backupTargets || [];
        fallingObstacles = _backupFalling || [];
        enemyProjectiles = _backupEnemyProjectiles || [];
        balls = _backupBalls || [];
        gameState = _backupGameState || 'normal';
        _backupTargets = _backupFalling = _backupEnemyProjectiles = _backupBalls = _backupGameState = null;
        // clear bonus NPC state
        bonusNPC = null; bonusNPCCollected = false;
        interactionMessage = ''; interactionMessageEnd = 0;
        // clear maze data
        mazeGrid = null; wallRects = [];
    }
    
    // --- Herzlevel functions ---
    function checkHerzCompletion() {
        if (!herzActive || !herzTask) return;
        if (herzKillsCount >= herzTask.killsNeeded) {
            // award lives
            player.lives += herzTask.reward;
            livesDisplay.textContent = player.lives;
            interactionMessage = `Aufgabe erfüllt! +${herzTask.reward} Leben.`;
            interactionMessageEnd = Date.now() + 3000;
            // end herz level and restore
            endHerzLevel();
        }
    }

    function activateHerzLevel() {
        if (herzActive) return;
        herzActive = true; herzEndAt = Date.now() + herzDuration; herzTask = null; herzKillsCount = 0;
        // backup
        _backupTargets = targets.slice(); _backupFalling = fallingObstacles.slice(); _backupEnemyProjectiles = enemyProjectiles.slice(); _backupBalls = balls.slice(); _backupGameState = gameState;
        targets = []; fallingObstacles = []; enemyProjectiles = []; balls = [];
        // spawn a friendly NPC in center-ish
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        const nx = cssWidth / 2; const ny = Math.max(60, cssHeight / 3);
        herzNPC = { x: nx, y: ny, radius: 20, color: '#ff6699' };
        gameState = 'herz';
        interactionMessage = 'Herzlevel: Sprich mit dem freundlichen Typen (I) um eine Aufgabe zu wählen.';
        interactionMessageEnd = Date.now() + 5000;
        // auto-end after duration if not completed
        setTimeout(() => { if (herzActive) endHerzLevel(); }, herzDuration);
    }

    function endHerzLevel() {
        herzActive = false; herzTask = null; herzKillsCount = 0; herzNPC = null;
        // restore backups
        targets = _backupTargets || []; fallingObstacles = _backupFalling || []; enemyProjectiles = _backupEnemyProjectiles || []; balls = _backupBalls || [];
        gameState = _backupGameState || 'normal';
        _backupTargets = _backupFalling = _backupEnemyProjectiles = _backupBalls = _backupGameState = null;
    }
    function getCurrentObstacleRadius() { return 8 + (level * 1.5); }
    function getRandomColor() { return ['#e74c3c', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6'][Math.floor(Math.random() * 5)]; }

    // --- Drawing Functions ---
    function draw() {
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cssWidth, cssHeight);
        drawStars();
        const overlayIndex = Math.floor(((level - 1) / 2)) % backgroundOverlayColors.length;
        ctx.fillStyle = backgroundOverlayColors[overlayIndex];
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        // (maze removed)
        drawPlayer();
        drawEntities(balls, '#e67e22');
        drawParticles();
        // Draw laser beam (if active) so it overlays entities
        drawLaser();

        if (gameState === 'normal') {
             if (level < 3) drawEntities(targets.filter(t => !t.hit), null);
             drawEntities(fallingObstacles, '#AAA');
        } else if (gameState === 'bossFight') {
            drawBoss();
            drawEntities(enemyProjectiles, 'red');
        }
        // Update DOM HUDs (laser/debug/bonus) instead of drawing on canvas
        updateHUDs();
        drawBonusNPC();
        drawInteractionMessage();
        if (!gameRunning) drawGameOverScreen();
    }

    // --- Update DOM HUDs ---
    function updateHUDs() {
        try {
            const now = Date.now();
            // Laser HUD
            let laserText = '';
            if (laserActive) {
                const remaining = Math.max(0, Math.ceil((laserDeactivateAt - now) / 1000));
                laserText = `Laser: ON (${remaining}s)`;
            } else if (laserAvailable) {
                laserText = 'Laser: READY (K)';
            } else {
                const remaining = Math.max(0, Math.ceil((laserCooldownEnd - now) / 1000));
                laserText = `Laser CD: ${remaining}s`;
            }
            laserHUDDiv.textContent = laserText;

            // Debug HUD
            const rect = canvas.getBoundingClientRect();
            const debugLines = [];
            debugLines.push(`targets: ${targets.length}`);
            debugLines.push(`falling: ${fallingObstacles.length}`);
            debugLines.push(`whirlwind: ${whirlwindUsed ? 'USED' : 'READY (W)'}`);
            debugLines.push(`bonus: ${bonusActive ? 'ACTIVE' : 'READY (T)'}`);
            debugLines.push(`canvas: ${Math.round(rect.width)}x${Math.round(rect.height)}`);
            debugHUDDiv.textContent = debugLines.join(' | ');

            // Bonus HUD
            let bonusText = '';
            if (bonusActive) {
                const remaining = Math.max(0, Math.ceil((bonusEndAt - now) / 1000));
                bonusText = `BONUS: ${remaining}s`;
            } else {
                bonusText = `Bonus (T): ${bonusActive ? 'ACTIVE' : 'READY'}`;
            }
            bonusHUDDiv.textContent = bonusText;
            // Herz HUD
            try {
                if (herzActive) {
                    if (herzTask) {
                        herzHUDDiv.textContent = `Herz: ${herzKillsCount}/${herzTask.killsNeeded} Kills`;
                    } else {
                        herzHUDDiv.textContent = 'Herz: Sprich mit NPC (I) um Aufgabe zu wählen';
                    }
                } else {
                    herzHUDDiv.textContent = 'Herz (Q): READY';
                }
            } catch (e) { /* ignore */ }
        } catch (e) {
            // ignore HUD update errors
        }
    }
    
    function drawStars() { ctx.fillStyle = '#FFF'; stars.forEach(star => { ctx.beginPath(); ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2); ctx.fill(); }); }
    
    function drawPlayer() {
        if (player.invulnerable && Math.floor(Date.now() / 100) % 2 === 0) return; // Blinking
        if (playerImage.complete && playerImage.naturalHeight !== 0) {
            ctx.drawImage(playerImage, player.x, player.y, player.width, player.height);
        } else {
            // Fallback to drawing a placeholder if image is not yet loaded or failed
            ctx.fillStyle = 'blue';
            ctx.fillRect(player.x, player.y, player.width, player.height);
        }
    }
    
    function drawBoss() {
        if (!boss) return;
        if (boss.image) {
            ctx.drawImage(boss.image, boss.x, boss.y, boss.width, boss.height);
        } else {
            // Fallback to drawing a placeholder if image is not available
            ctx.fillStyle = 'purple';
            ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
        }
        const barWidth = boss.width; const barHeight = 10;
        ctx.fillStyle = '#555'; ctx.fillRect(boss.x, boss.y - barHeight - 5, barWidth, barHeight);
        ctx.fillStyle = 'red'; ctx.fillRect(boss.x, boss.y - barHeight - 5, barWidth * (boss.health / boss.maxHealth), barHeight);
    }

    // --- Laser Drawing ---
    function drawLaser() {
        if (!laserActive) return;
        const beamX = player.x + player.width / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,255,255,0.25)';
        ctx.shadowColor = 'rgba(0,255,255,0.9)';
        ctx.shadowBlur = 20;
        ctx.fillRect(beamX - laserWidth / 2, 0, laserWidth, player.y);
        ctx.restore();
    }

    // --- Whirlwind Drawing ---
    function drawWhirlwind() {
        if (!whirlwindActive) return;
        const now = Date.now();
        const elapsed = Math.max(0, Math.min(whirlwindDuration, whirlwindEndAt - now));
        const t = 1 - (elapsed / whirlwindDuration);
        // radius grows from player outwards
        const maxR = Math.max(canvas.width, canvas.height) * 0.8;
        const r = 30 + t * maxR;
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = `rgba(200,200,255,${0.25 * (1 - t)})`;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // --- Draw Bonus NPC ---
    function drawBonusNPC() {
        if (!bonusActive || !bonusNPC || bonusNPCCollected) return;
        const cx = bonusNPC.x; const cy = bonusNPC.y; const r = bonusNPC.radius;
        ctx.save();
        // body
        ctx.fillStyle = bonusNPC.color || '#0f0';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        // simple face
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx - r/3, cy - r/6, r/6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + r/3, cy - r/6, r/6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy + r/8, r/3, 0, Math.PI); ctx.fill();
        ctx.restore();
        // show interact hint when nearby
        if (bonusNPCNearby) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(cx - 60, cy - r - 30, 120, 22);
            ctx.fillStyle = '#fff'; ctx.font = '12px Arial'; ctx.textAlign = 'center'; ctx.fillText('Drücke I um zu interagieren', cx, cy - r - 16);
            ctx.restore();
        }
    }

    // --- Helper: map playerName DOM to canvas coordinates ---
    function getPlayerNameCanvasPos() {
        try {
            const rect = canvas.getBoundingClientRect();
            const el = playerNameDisplay;
            if (!el) return { x: 8, y: 8, w: 100, h: 24 };
            const er = el.getBoundingClientRect();
            let x = er.left - rect.left;
            let y = er.top - rect.top;
            const w = er.width || 100;
            const h = er.height || 24;
            // clamp inside canvas
            x = Math.max(6, Math.min(x, rect.width - w - 6));
            y = Math.max(6, Math.min(y, rect.height - h - 6));
            return { x: x, y: y, w: w, h: h };
        } catch (e) {
            return { x: 8, y: 8, w: 100, h: 24 };
        }
    }

    // --- Bonus HUD (migrated to DOM) ---
    function drawBonusHUD() { return; }

    // --- Interaction Message ---
    function drawInteractionMessage() {
        if (!interactionMessage) return;
        if (Date.now() > interactionMessageEnd) { interactionMessage = ''; return; }
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cssWidth/2 - 220, cssHeight - 60, 440, 40);
        ctx.fillStyle = '#fff'; ctx.font = '16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(interactionMessage, cssWidth/2, cssHeight - 40);
        ctx.restore();
    }

    // --- Laser HUD (migrated to DOM) ---
    function drawLaserHUD() { return; }

    // --- Debug HUD (migrated to DOM) ---
    function drawDebugHUD() { return; }
    
    function drawEntities(entities, defaultColor) { entities.forEach(entity => { ctx.fillStyle = entity.color || defaultColor; ctx.beginPath(); ctx.arc(entity.x, entity.y, entity.radius, 0, Math.PI * 2); ctx.fill(); }); }
    function drawParticles() { particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life / 50; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1.0; }
    
    function drawGameOverScreen() {
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, cssWidth, cssHeight);
        ctx.fillStyle = 'white'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', cssWidth / 2, cssHeight / 2 - 20);
        ctx.font = '20px Arial'; ctx.fillText(gameOverMessage, cssWidth / 2, cssHeight / 2 + 20);
        ctx.font = '16px Arial'; ctx.fillText(`Final Score: ${score}`, cssWidth / 2, cssHeight / 2 + 50);
        ctx.fillText(`Your Best Score: ${highScore}`, cssWidth / 2, cssHeight / 2 + 80);
    }

    // --- Update Functions ---
    function update() {
        if (!gameRunning) return;
        movePlayer(); updateBalls(); updateParticles(); updateStars();
        if (gameState === 'normal') { updateFallingObstacles(); createFallingObstacle(); }
        else if (gameState === 'bossFight') { updateBoss(); updateEnemyProjectiles(); }
        updateLaser();
        updateWhirlwind();
        updateBonusNPC();
    }

    // --- Laser Update / Collision Handling ---
    function updateLaser() {
        // ensure laserActive follows timestamp in case timers drift
        if (!laserActive && laserDeactivateAt > Date.now()) laserActive = true;
        if (laserActive && laserDeactivateAt && Date.now() > laserDeactivateAt) {
            laserActive = false;
        }
        if (!laserActive) return;
        const beamX = player.x + player.width / 2;
        // Damage targets and falling obstacles that intersect with beam
        for (let i = targets.length - 1; i >= 0; i--) {
            const t = targets[i];
            const dx = Math.abs(t.x - beamX);
            if (dx <= (laserWidth / 2 + t.radius) && t.y < player.y) {
                createExplosion(t.x, t.y, t.color);
                targets.splice(i, 1);
                if (herzActive) { herzKillsCount++; checkHerzCompletion(); }
                score += 10; scoreDisplay.textContent = score;
                if (score > 0 && Math.floor(score / levelUpScoreThreshold) >= level) levelUp();
            }
        }
        for (let i = fallingObstacles.length - 1; i >= 0; i--) {
            const o = fallingObstacles[i];
            const dx = Math.abs(o.x - beamX);
            if (dx <= (laserWidth / 2 + o.radius) && o.y < player.y) {
                createExplosion(o.x, o.y, '#AAA');
                fallingObstacles.splice(i, 1);
                score += 5; scoreDisplay.textContent = score;
                if (score > 0 && Math.floor(score / levelUpScoreThreshold) >= level) levelUp();
            }
        }
        // Damage boss if in boss fight
        if (boss) {
            const bossCenterX = boss.x + boss.width / 2;
            const dxBoss = Math.abs(bossCenterX - beamX);
            if (dxBoss <= (laserWidth / 2 + boss.width / 2)) {
                // apply damage per frame based on seconds
                const damageThisFrame = laserDamagePerSecond / 60;
                boss.health -= damageThisFrame;
                if (boss.health <= 0) {
                    createExplosion(boss.x + boss.width / 2, boss.y + boss.height / 2, 'purple');
                    score += 500; boss = null; gameState = 'normal'; levelUp();
                }
            }
        }
    }
    
    function updateStars() { const cssHeight = canvas.height / (window.devicePixelRatio || 1); stars.forEach(star => { star.y += star.speed; if (star.y > cssHeight) star.y = 0; }); }
    function updateParticles() { for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.life--; if (p.life <= 0) particles.splice(i, 1); } }
    function movePlayer() {
        const prev = { x: player.x, y: player.y };
        player.x += player.dx;
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        if (player.x < 0) player.x = 0; if (player.x + player.width > cssWidth) player.x = cssWidth - player.width;
        // allow vertical movement only in bonus state
        if (gameState === 'bonus') {
            player.y += player.dy;
            if (player.y < 0) player.y = 0;
            if (player.y + player.height > cssHeight) player.y = cssHeight - player.height;
        }
        // maze was removed — no wall collision checks here
    }
    
    function updateBalls() {
        for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i]; ball.y += ball.vy; if (ball.y < 0) { balls.splice(i, 1); continue; }
            if ((gameState === 'normal' && level < 3) || gameState === 'bonus') {
                for (let j = targets.length - 1; j >= 0; j--) {
                    const target = targets[j];
                    if (!target.hit && checkCollision(ball, target)) {
                        createExplosion(target.x, target.y, target.color);
                        target.hit = true;
                        if (herzActive) { herzKillsCount++; checkHerzCompletion(); }
                        // bonus targets give more points
                        score += target.bonus ? 50 : 10;
                        scoreDisplay.textContent = score;
                        if (score > 0 && Math.floor(score / levelUpScoreThreshold) >= level) levelUp();
                        balls.splice(i, 1);
                        setTimeout(() => { if (targets.includes(target)) { targets.splice(j, 1); createTarget(); } }, 200);
                        break;
                    }
                }
            }
            if (gameState === 'bossFight' && boss && checkCollision(ball, boss)) {
                boss.health--; playSound('hit'); balls.splice(i, 1);
                if (boss.health <= 0) {
                    createExplosion(boss.x + boss.width / 2, boss.y + boss.height / 2, 'purple');
                    score += 500; boss = null; gameState = 'normal'; levelUp();
                }
            }
        }
    }
    
    function updateFallingObstacles() {
        for (let i = fallingObstacles.length - 1; i >= 0; i--) {
            const obs = fallingObstacles[i]; obs.y += obs.speed;
            if (checkCollision(obs, player)) { handlePlayerHit(); if (!gameRunning) return; }
            for (let j = balls.length - 1; j >= 0; j--) {
                if(checkCollision(obs, balls[j])) {
                    createExplosion(obs.x, obs.y, '#AAA');
                    if(fallingObstacles[i]) fallingObstacles.splice(i, 1); 
                    balls.splice(j, 1);
                    score += 5; scoreDisplay.textContent = score;
                    if (score > 0 && Math.floor(score / levelUpScoreThreshold) >= level) levelUp();
                    break;
                }
            }
            if (obs && obs.y > canvas.height / (window.devicePixelRatio || 1)) fallingObstacles.splice(i, 1);
        }
    }

    function updateBoss() {
        if (!boss) return;
        boss.x += boss.speed * boss.direction;
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        if (boss.x <= 0 || boss.x + boss.width >= cssWidth) boss.direction *= -1;
        boss.shootCooldown--;
        if (boss.shootCooldown <= 0) {
            const pX = boss.x + boss.width / 2; const pY = boss.y + boss.height;
            const angle = Math.atan2((player.y + player.height / 2) - pY, (player.x + player.width / 2) - pX);
            enemyProjectiles.push({ x: pX, y: pY, radius: 5, vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4 });
            boss.shootCooldown = 90;
        }
    }

    function updateEnemyProjectiles() {
        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
            const p = enemyProjectiles[i]; p.x += p.vx; p.y += p.vy;
            if (checkCollision(p, player)) { handlePlayerHit(); enemyProjectiles.splice(i, 1); }
            else if (p.y > canvas.height / (window.devicePixelRatio || 1) || p.y < 0 || p.x < 0 || p.x > canvas.width / (window.devicePixelRatio || 1)) { enemyProjectiles.splice(i, 1); }
        }
    }
    
    function checkCollision(circle, rectOrCircle) {
        if (rectOrCircle.radius !== undefined) { // Circle-Circle
            const dx = circle.x - rectOrCircle.x; const dy = circle.y - rectOrCircle.y;
            return Math.sqrt(dx * dx + dy * dy) < circle.radius + rectOrCircle.radius;
        } else { // Circle-Rectangle (for player)
            const rect = rectOrCircle;
            const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
            const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
            const dx = circle.x - closestX; const dy = circle.y - closestY;
            return (dx * dx + dy * dy) < (circle.radius * circle.radius);
        }
    }

    function gameLoop() { update(); draw(); }

    function endGame(message) {
        if (!gameRunning) return; playSound('gameOver'); gameRunning = false;
        gameOverMessage = message; lastScore = score;
        lastScoreDisplay.textContent = lastScore;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('skyShooter_highScore', highScore);
            highScoreDisplay.textContent = highScore;
        }
        restartButton.style.display = 'block';
    }
    
    canvas.addEventListener('click', (e) => { 
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        if (gameRunning) shoot(e.clientX, e.clientY); 
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'd') player.dx = player.speed;
        if (e.key === 'ArrowLeft' || e.key === 'a') player.dx = -player.speed;
        if (e.key === 'ArrowUp') player.dy = -player.speed;
        if (e.key === 'ArrowDown') player.dy = player.speed;
        // Laser activation on 'k' press
        if ((e.key === 'k' || e.key === 'K') && laserAvailable && !laserActive && gameRunning) {
            activateLaser();
        }
        // Manual spawn for testing
        if ((e.key === 'g' || e.key === 'G') && gameRunning) {
            spawnTestTarget();
        }
        // Whirlwind activation on 'w' (one-time use)
        if ((e.key === 'w' || e.key === 'W') && gameRunning && !whirlwindUsed) {
            activateWhirlwind();
        }
        // Teleport to bonus on 't'
        if ((e.key === 't' || e.key === 'T') && gameRunning && !bonusActive) {
            activateTeleport();
        }
        // Activate Herzlevel on 'q'
        if ((e.key === 'q' || e.key === 'Q') && gameRunning && !herzActive) {
            activateHerzLevel();
        }
        // Choose Herz task when pressing 1 or 2 (after talking to NPC)
        if ((e.key === '1' || e.key === '2') && gameRunning && herzActive && !herzTask) {
            if (e.key === '1') {
                herzTask = { killsNeeded: 10, reward: 2 };
            } else {
                herzTask = { killsNeeded: 20, reward: 4 };
            }
            herzKillsCount = 0;
            interactionMessage = `Aufgabe angenommen: ${herzTask.killsNeeded} Kills → +${herzTask.reward} Leben.`;
            interactionMessageEnd = Date.now() + 4000;
        }
        // Interact with bonus NPC using 'i' (check distance at press as fallback)
        if ((e.key === 'i' || e.key === 'I') && gameRunning) {
            // Herzlevel interaction
            if (herzActive && herzNPC) {
                const px = player.x + player.width / 2; const py = player.y + player.height / 2;
                const dx = px - herzNPC.x; const dy = py - herzNPC.y; const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist <= (herzNPC.radius + 48)) {
                    interactionMessage = 'Wähle: 1 = einfache (10 Kills → +2 Leben), 2 = schwere (20 Kills → +4 Leben).';
                    interactionMessageEnd = Date.now() + 6000;
                } else {
                    interactionMessage = 'Du bist zu weit weg vom freundlichen Typen.';
                    interactionMessageEnd = Date.now() + 2000;
                }
                return;
            }
            // Bonus NPC interaction
            if (bonusActive && bonusNPC && !bonusNPCCollected) {
                console.log('i pressed - attempting interaction');
                const near = isPlayerNearNPC();
                if (near) {
                    // Grant whirlwind on explicit interaction
                    bonusNPCCollected = true;
                    bonusNPC = null;
                    whirlwindUsed = false; // grant an extra whirlwind
                    playSound('levelUp');
                    createExplosion(player.x + player.width / 2, player.y + player.height / 2, 'white');
                    interactionMessage = 'Der freundliche Mensch schenkt dir einen Wirbelsturm!';
                    interactionMessageEnd = Date.now() + 3000;
                    console.log('Interacted with bonus NPC: whirlwind granted');
                } else {
                    interactionMessage = 'Du bist zu weit weg, nähere dich dem Menschen.';
                    interactionMessageEnd = Date.now() + 2000;
                    console.log('Interacted with bonus NPC: too far');
                }
            }
        }
        }
    });
    document.addEventListener('keyup', (e) => {
        if ((e.key === 'ArrowRight' || e.key === 'd') && player.dx > 0) player.dx = 0;
        if ((e.key === 'ArrowLeft' || e.key === 'a') && player.dx < 0) player.dx = 0;
        if (e.key === 'ArrowUp' && player.dy < 0) player.dy = 0;
        if (e.key === 'ArrowDown' && player.dy > 0) player.dy = 0;
    });

    // --- Laser control functions ---
    function activateLaser() {
        if (!laserAvailable || laserActive) return;
        laserActive = true; laserAvailable = false;
        const now = Date.now();
        laserDeactivateAt = now + laserDuration;
        laserCooldownEnd = laserDeactivateAt + laserCooldown;
        playSound('shoot');
        // Stop after duration
        setTimeout(() => {
            laserActive = false;
            // start cooldown (availability will be updated when cooldown ends)
            setTimeout(() => { laserAvailable = true; }, laserCooldown);
        }, laserDuration);
    }

    // --- Whirlwind control functions ---
    function activateWhirlwind() {
        if (whirlwindUsed || whirlwindActive) return;
        whirlwindUsed = true; whirlwindActive = true;
        whirlwindEndAt = Date.now() + whirlwindDuration;
        playSound('levelUp');

        // Kill all current enemies and award score
        const killedTargets = targets.length;
        const killedObstacles = fallingObstacles.length;
        for (let i = 0; i < targets.length; i++) {
            const t = targets[i]; createExplosion(t.x, t.y, t.color);
        }
        for (let i = 0; i < fallingObstacles.length; i++) {
            const o = fallingObstacles[i]; createExplosion(o.x, o.y, '#AAA');
        }
        // clear arrays
        targets = [];
        fallingObstacles = [];
        // remove enemy projectiles
        enemyProjectiles.forEach(p => createExplosion(p.x, p.y, 'red'));
        enemyProjectiles = [];

        // award score
        score += (killedTargets * whirlwindScorePerTarget) + (killedObstacles * whirlwindScorePerObstacle);
        scoreDisplay.textContent = score;

        // count kills for herzlevel if active
        if (herzActive && killedTargets > 0) {
            herzKillsCount += killedTargets;
            checkHerzCompletion();
        }

        // After the whirlwind visual finishes, spawn the boss immediately
        setTimeout(() => {
            whirlwindActive = false;
            // Ensure boss fight starts now
            startBossFight();
        }, whirlwindDuration);
    }

    function updateWhirlwind() {
        if (!whirlwindActive) return;
        // ensure it ends if time passed
        if (Date.now() > whirlwindEndAt) {
            whirlwindActive = false;
        }
    }

    // --- Bonus NPC Update ---
    function updateBonusNPC() {
        if (!bonusActive || !bonusNPC || bonusNPCCollected) { bonusNPCNearby = false; return; }
        // check proximity between NPC (circle) and player (rect)
        const cx = bonusNPC.x; const cy = bonusNPC.y; const r = bonusNPC.radius;
        const playerCenterX = player.x + player.width / 2; const playerCenterY = player.y + player.height / 2;
        const dx = playerCenterX - cx; const dy = playerCenterY - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        // consider nearby if within r + 40 pixels
        bonusNPCNearby = dist <= (r + 40);
    }

    // --- Maze generation (recursive backtracker) and helpers ---
    function initBonusMaze() {
        const cssWidth = canvas.width / (window.devicePixelRatio || 1);
        const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        // determine cols/rows to fit top half of canvas (bonus area)
        // make corridors wider by increasing base cell size relative to canvas
        cellSize = Math.max(36, Math.min(64, Math.floor(cssWidth / 10)));
        mazeCols = Math.max(7, Math.floor(cssWidth / cellSize));
        mazeRows = Math.max(7, Math.floor((cssHeight / 2) / cellSize));
        // ensure odd dimensions for nicer mazes
        if (mazeCols % 2 === 0) mazeCols--;
        if (mazeRows % 2 === 0) mazeRows--;
        // initialize grid: each cell has walls: top,right,bottom,left and visited flag
        mazeGrid = new Array(mazeRows);
        for (let r = 0; r < mazeRows; r++) {
            mazeGrid[r] = new Array(mazeCols);
            for (let c = 0; c < mazeCols; c++) {
                mazeGrid[r][c] = { r: r, c: c, walls: [true, true, true, true], visited: false };
            }
        }
        // carve
        const stack = [];
        const start = mazeGrid[0][0]; start.visited = true;
        stack.push(start);
        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors = [];
            const dirs = [ [-1,0,0,2], [0,1,1,3], [1,0,2,0], [0,-1,3,1] ];
            for (const [dr,dc,wallIdx,oppIdx] of dirs) {
                const nr = current.r + dr; const nc = current.c + dc;
                if (nr >= 0 && nr < mazeRows && nc >= 0 && nc < mazeCols && !mazeGrid[nr][nc].visited) {
                    neighbors.push({cell: mazeGrid[nr][nc], wallIdx, oppIdx});
                }
            }
            if (neighbors.length > 0) {
                const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
                // remove wall between current and pick.cell
                current.walls[pick.wallIdx] = false;
                pick.cell.walls[pick.oppIdx] = false;
                pick.cell.visited = true;
                stack.push(pick.cell);
            } else {
                stack.pop();
            }
        }
        // ensure entrance and exit are open so player can move
        if (mazeGrid[0] && mazeGrid[0][0]) {
            mazeGrid[0][0].walls[0] = false; // top
            mazeGrid[0][0].walls[3] = false; // left
        }
        const exitCellIdxR = mazeRows - 1; const exitCellIdxC = mazeCols - 1;
        if (mazeGrid[exitCellIdxR] && mazeGrid[exitCellIdxR][exitCellIdxC]) {
            mazeGrid[exitCellIdxR][exitCellIdxC].walls[2] = false; // bottom
            mazeGrid[exitCellIdxR][exitCellIdxC].walls[1] = false; // right
        }

        // build wall rectangle list for collisions and draw
        wallRects = [];
        const offsetX = (cssWidth - mazeCols * cellSize) / 2;
        const offsetY = 0; // draw at top area
        for (let r = 0; r < mazeRows; r++) {
            for (let c = 0; c < mazeCols; c++) {
                const cell = mazeGrid[r][c];
                const x = offsetX + c * cellSize; const y = offsetY + r * cellSize;
                // wall thickness scales with cell size but stays at least 2px
                const half = Math.max(2, Math.floor(cellSize * 0.08));
                // walls: top,right,bottom,left -> add rects
                if (cell.walls[0]) wallRects.push({ x: x, y: y, w: cellSize, h: half });
                if (cell.walls[1]) wallRects.push({ x: x + cellSize - half, y: y, w: half, h: cellSize });
                if (cell.walls[2]) wallRects.push({ x: x, y: y + cellSize - half, w: cellSize, h: half });
                if (cell.walls[3]) wallRects.push({ x: x, y: y, w: half, h: cellSize });
            }
        }
        // place player at entrance center
        const entranceX = offsetX + cellSize / 2; const entranceY = offsetY + cellSize / 2;
        player.x = Math.max(0, entranceX - player.width / 2);
        player.y = Math.max(0, entranceY - player.height / 2);
        // place NPC at exit (bottom-right cell center)
        const exitCell = mazeGrid[mazeRows - 1][mazeCols - 1];
        const npcX = offsetX + (mazeCols - 1) * cellSize + cellSize / 2;
        const npcY = offsetY + (mazeRows - 1) * cellSize + cellSize / 2;
        bonusNPC = { x: npcX, y: npcY, radius: Math.max(14, cellSize / 3), color: '#00cc66' };
        bonusNPCCollected = false; bonusNPCNearby = false;
        // mark bonus active and set bonus timer
        bonusActive = true;
        bonusEndAt = Date.now() + bonusDuration;
    }

    // drawMaze is intentionally disabled — bonus level no longer shows a maze
    function drawMaze() { return; }

    function rectsIntersect(a, b) { return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h); }

    function isPlayerNearNPC() {
        if (!bonusActive || !bonusNPC || bonusNPCCollected) return false;
        const cx = bonusNPC.x; const cy = bonusNPC.y; const r = bonusNPC.radius;
        const playerCenterX = player.x + player.width / 2; const playerCenterY = player.y + player.height / 2;
        const dx = playerCenterX - cx; const dy = playerCenterY - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        return dist <= (r + 48); // slightly larger tolerance
    }

    function shoot(clientX, clientY) {
        playSound('shoot');
        const rect = canvas.getBoundingClientRect();
        const clickX = clientX - rect.left;
        const clickY = clientY - rect.top;
        const ballStartX = player.x + player.width / 2;
        const ballStartY = player.y + player.height / 2;
        let finalTargetY = clickY;
        if (clickY > ballStartY) finalTargetY = ballStartY - 100;
        const angle = Math.atan2(finalTargetY - ballStartY, clickX - ballStartX);
        const speed = 10;
        balls.push({ x: ballStartX, y: ballStartY, radius: initialBallRadius, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
        if (score >= 200) {
            balls.push({ x: ballStartX, y: ballStartY, radius: initialBallRadius, vx: Math.cos(angle - 0.2) * speed, vy: Math.sin(angle - 0.2) * speed });
            balls.push({ x: ballStartX, y: ballStartY, radius: initialBallRadius, vx: Math.cos(angle + 0.2) * speed, vy: Math.sin(angle + 0.2) * speed });
        }
    }

    // --- Load game data and initialize ---
    // Call loadImage for each image
    loadImage(playerImage, "/static/images/ufo.png");
    loadImage(bossImageLevel5, "/static/images/boss_level5.png");
    loadImage(bossImageLevel10, "/static/images/boss_level10.png");
});