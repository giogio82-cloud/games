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

    // --- Game State Variables ---
    let score, level, gameInterval, gameRunning, gameOverMessage;
    let gameState = 'normal'; // 'normal' or 'bossFight'
    let balls = [], targets = [], fallingObstacles = [], particles = [], stars = [], enemyProjectiles = [];
    let lastScore = 0, highScore = 0, playerName = "Guest";

    // --- Game Constants ---
    const initialBallRadius = 10;
    const targetRadius = 15;
    const levelUpScoreThreshold = 100;
    const backgroundOverlayColors = ['rgba(0,0,0,0)', 'rgba(20,0,40,0.2)', 'rgba(40,0,20,0.2)', 'rgba(0,40,0,0.2)', 'rgba(40,40,0,0.2)'];

    // --- Player & Boss Objects ---
    let player = { width: 40, height: 60, x: 0, y: 0, speed: 7, dx: 0, lives: 3, invulnerable: false };
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
        boss = {
            x: cssWidth / 2 - 50, y: 50, width: 100, height: 50,
            health: 20, maxHealth: 20, speed: 2, direction: 1,
            shootCooldown: 120
        };
    }

    // --- Creation Functions ---
    function createTarget() { 
        if (level >= 3) return;
        const cssWidth = canvas.width / (window.devicePixelRatio || 1); const cssHeight = canvas.height / (window.devicePixelRatio || 1);
        const x = Math.random() * (cssWidth - targetRadius * 2) + targetRadius;
        const y = Math.random() * (cssHeight / 2 - targetRadius * 2) + targetRadius;
        targets.push({ x: x, y: y, radius: targetRadius, hit: false, color: getRandomColor() });
    }
    function createFallingObstacle() { 
        if (level < 2) return;
        const spawnChance = 0.01 + level * 0.005;
        const speed = 1.5 + (level >= 5 ? (level - 4) * 0.5 : 0);
        if (Math.random() < spawnChance) {
            const cssWidth = canvas.width / (window.devicePixelRatio || 1);
            const x = Math.random() * cssWidth;
            fallingObstacles.push({ x: x, y: 0, radius: getCurrentObstacleRadius(), speed: speed });
        }
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

        drawPlayer();
        drawEntities(balls, '#e67e22');
        drawParticles();

        if (gameState === 'normal') {
             if (level < 3) drawEntities(targets.filter(t => !t.hit), null);
             drawEntities(fallingObstacles, '#AAA');
        } else if (gameState === 'bossFight') {
            drawBoss();
            drawEntities(enemyProjectiles, 'red');
        }
        if (!gameRunning) drawGameOverScreen();
    }
    
    function drawStars() { ctx.fillStyle = '#FFF'; stars.forEach(star => { ctx.beginPath(); ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2); ctx.fill(); }); }
    
    function drawPlayer() {
        if (player.invulnerable && Math.floor(Date.now() / 100) % 2 === 0) return; // Blinking
        const dollX = player.x + player.width / 2; const dollY = player.y + player.height;
        ctx.fillStyle = '#34495e'; ctx.fillRect(dollX - 10, dollY - 30, 20, 30);
        ctx.fillStyle = '#ecf0f1'; ctx.beginPath(); ctx.arc(dollX, dollY - 40, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#95a5a6'; ctx.fillRect(dollX - 2.5, dollY - 35, 5, -15);
    }
    
    function drawBoss() {
        if (!boss) return;
        ctx.fillStyle = 'purple'; ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
        const barWidth = boss.width; const barHeight = 10;
        ctx.fillStyle = '#555'; ctx.fillRect(boss.x, boss.y - barHeight - 5, barWidth, barHeight);
        ctx.fillStyle = 'red'; ctx.fillRect(boss.x, boss.y - barHeight - 5, barWidth * (boss.health / boss.maxHealth), barHeight);
    }
    
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
    }
    
    function updateStars() { const cssHeight = canvas.height / (window.devicePixelRatio || 1); stars.forEach(star => { star.y += star.speed; if (star.y > cssHeight) star.y = 0; }); }
    function updateParticles() { for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.life--; if (p.life <= 0) particles.splice(i, 1); } }
    function movePlayer() { player.x += player.dx; const cssWidth = canvas.width / (window.devicePixelRatio || 1); if (player.x < 0) player.x = 0; if (player.x + player.width > cssWidth) player.x = cssWidth - player.width; }
    
    function updateBalls() {
        for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i]; ball.y += ball.vy; if (ball.y < 0) { balls.splice(i, 1); continue; }
            if (gameState === 'normal' && level < 3) {
                for (let j = targets.length - 1; j >= 0; j--) {
                    const target = targets[j];
                    if (!target.hit && checkCollision(ball, target)) {
                        createExplosion(target.x, target.y, target.color);
                        target.hit = true; score += 10; scoreDisplay.textContent = score;
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
    });
    document.addEventListener('keyup', (e) => {
        if ((e.key === 'ArrowRight' || e.key === 'd') && player.dx > 0) player.dx = 0;
        if ((e.key === 'ArrowLeft' || e.key === 'a') && player.dx < 0) player.dx = 0;
    });

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
    loadGameData();
    initGame();
});