/* --------------------------------------------------
   TEACHER ZONE: EDIT VARIABLES HERE TO HACK THE GAME
   -------------------------------------------------- */
const GameConfig = {
    speed: 5.4,
    playerSpeed: 0.45, // Reduced from 0.8 for finer control
    playerEmoji: "🏂", // Snowboarder (Kid in winter gear)
    obstacleEmoji: "⚪",      // Snowball
    snowmanEmoji: "☃️",
    collisionMargin: 15, // Increased from 5 for fairer hitboxes
    bgColors: ["#e0f7fa", "#b2ebf2"],
    snowman: {
        cooldown: 10000,
        chaseDuration: 5000,
        speedMultiplier: 0.6,
        avoidanceRadius: 200,
        avoidanceWeight: 2.5
    }
};

/* --------------------------------------------------
   GAME ENGINE (DO NOT TOUCH BELOW THIS LINE)
   -------------------------------------------------- */

class InputHandler {
    constructor() {
        this.keys = {};
        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup', e => this.keys[e.key] = false);
    }
}

class Entity {
    constructor(id, x, y, emoji) {
        this.element = document.getElementById(id);
        if (!this.element) {
            this.element = document.createElement('div');
            this.element.id = id;
            document.getElementById('game-container').appendChild(this.element);
        }
        this.x = x;
        this.y = y;
        this.element.innerText = emoji;
    }

    getRect() {
        return this.element.getBoundingClientRect();
    }
}

class Player extends Entity {
    constructor(game) {
        super('player', 50, 80, GameConfig.playerEmoji);
        this.game = game;
        this.element.style.top = this.y + '%';
        this.element.style.left = this.x + '%';
    }

    update() {
        if (!this.game.active) return;

        const speed = GameConfig.playerSpeed;
        const keys = this.game.input.keys;

        // Horizontal
        if (keys['ArrowLeft'] && this.x > 5) this.x -= speed;
        if (keys['ArrowRight'] && this.x < 95) this.x += speed;

        // Vertical
        if (keys['ArrowUp'] && this.y > 5) this.y -= speed;
        if (keys['ArrowDown'] && this.y < 95) this.y += speed;

        this.updateView();
    }

    updateView() {
        this.element.style.left = this.x + '%';
        this.element.style.top = this.y + '%';
    }
}

class Snowman extends Entity {
    constructor() {
        super('snowman', 50, -100, GameConfig.snowmanEmoji);
        this.y = -100; // px
        this.phase = 'COOLDOWN';
        this.timer = 0;
        this.element.style.display = 'none';
    }

    update(dt, player, obstacleManager, containerRect) {
        this.timer += dt;

        if (this.phase === 'COOLDOWN') {
            if (this.timer >= GameConfig.snowman.cooldown) {
                this.spawn();
            }
        } else if (this.phase === 'CHASE') {
            if (this.timer >= GameConfig.snowman.chaseDuration) {
                this.despawn(true);
                return true; // Success
            }
            this.move(player, obstacleManager, containerRect);
        } else if (this.phase === 'LEAVING') {
            this.y += GameConfig.speed * 2;
            this.updateView();
            if (this.y > window.innerHeight) {
                this.reset();
            }
        }
        return false;
    }

    spawn() {
        this.phase = 'CHASE';
        this.timer = 0;
        this.x = Math.random() * 90;
        this.y = -100;
        this.element.style.display = 'block';
        this.updateView();
    }

    despawn(success) {
        if (success) {
            this.phase = 'LEAVING';
        } else {
            this.reset();
        }
        this.timer = 0;
    }

    reset() {
        this.phase = 'COOLDOWN';
        this.element.style.display = 'none';
        this.timer = 0;
    }

    move(player, obstacleManager, containerRect) {
        // --- STEERING BEHAVIOR ---
        const playerRect = player.getRect();

        // 1. Goal Force (Towards Player)
        const targetX = playerRect.left - containerRect.left;
        const targetY = playerRect.top - containerRect.top;

        let currentX = (this.x / 100) * containerRect.width;
        let currentY = this.y;

        let goalDx = targetX - currentX;
        let goalDy = targetY - currentY;
        const goalDist = Math.sqrt(goalDx * goalDx + goalDy * goalDy);

        if (goalDist > 0) {
            goalDx /= goalDist;
            goalDy /= goalDist;
        }

        // 2. Avoidance Force (Away from Trees)
        let avoidDx = 0;
        let avoidDy = 0;

        obstacleManager.obstacles.forEach(obs => {
            const obsRect = obs.el.getBoundingClientRect();
            const obsX = obsRect.left - containerRect.left;
            const obsY = obsRect.top - containerRect.top;

            const dx = currentX - obsX;
            const dy = currentY - obsY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < GameConfig.snowman.avoidanceRadius && dist > 0) {
                const force = (GameConfig.snowman.avoidanceRadius - dist) / GameConfig.snowman.avoidanceRadius;
                avoidDx += (dx / dist) * force;
                avoidDy += (dy / dist) * force;
            }
        });

        // 3. Combine Forces
        let moveDx = goalDx + (avoidDx * GameConfig.snowman.avoidanceWeight);
        let moveDy = goalDy + (avoidDy * GameConfig.snowman.avoidanceWeight);

        const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);
        if (moveDist > 0) {
            moveDx /= moveDist;
            moveDy /= moveDist;
        }

        // Apply Speed
        const speed = GameConfig.speed * GameConfig.snowman.speedMultiplier;
        currentX += moveDx * speed;
        currentY += moveDy * speed;

        // Update Position
        this.x = (currentX / containerRect.width) * 100;
        this.y = currentY;
        this.updateView();

        // Check Tree Collisions (Fallback if avoidance fails)
        const snowmanRect = this.getRect();
        obstacleManager.checkCollisionAndRemove(snowmanRect);
    }

    updateView() {
        this.element.style.left = this.x + '%';
        this.element.style.top = this.y + 'px';
    }
}

class ObstacleManager {
    constructor(container) {
        this.container = container;
        this.obstacles = [];
    }

    spawn(score) {
        let extraTrees = 0;
        while (score >= 5 * (extraTrees + 1) * (extraTrees + 2) / 2) {
            extraTrees++;
        }
        const numObstacles = 2 + extraTrees;

        const positions = [];
        for (let i = 0; i < numObstacles; i++) {
            let pos;
            let attempts = 0;
            let valid = false;
            while (!valid && attempts < 10) {
                pos = Math.random() * 90;
                valid = true;
                for (let existing of positions) {
                    if (Math.abs(pos - existing) < 15) valid = false;
                }
                attempts++;
            }
            positions.push(pos);
        }

        positions.forEach(pos => {
            const el = document.createElement('div');
            el.classList.add('obstacle');
            el.innerText = GameConfig.obstacleEmoji;
            el.style.left = pos + '%';
            const startY = -60 - Math.random() * 400;
            el.style.top = startY + 'px';
            this.container.appendChild(el);
            this.obstacles.push({ el, y: startY });
        });
    }

    update() {
        let scoreIncrement = 0;
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            let obs = this.obstacles[i];
            obs.y += GameConfig.speed;
            obs.el.style.top = obs.y + 'px';

            if (obs.y > window.innerHeight) {
                obs.el.remove();
                this.obstacles.splice(i, 1);
                scoreIncrement++;
            }
        }
        return scoreIncrement;
    }

    checkCollision(rect, margin) {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            const oRect = obs.el.getBoundingClientRect();

            if (rect.left + margin < oRect.right - margin &&
                rect.right - margin > oRect.left + margin &&
                rect.top + margin < oRect.bottom - margin &&
                rect.bottom - margin > oRect.top + margin) {
                return true;
            }
        }
        return false;
    }

    checkCollisionAndRemove(rect) {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            const oRect = obs.el.getBoundingClientRect();

            if (rect.left < oRect.right && rect.right > oRect.left &&
                rect.top < oRect.bottom && rect.bottom > oRect.top) {
                obs.el.remove();
                this.obstacles.splice(i, 1);
            }
        }
    }
}

class Game {
    constructor() {
        this.container = document.getElementById('game-container');
        this.scoreEl = document.getElementById('score');
        this.finalScoreEl = document.getElementById('final-score');
        this.gameOverEl = document.getElementById('game-over');

        this.input = new InputHandler();
        this.player = new Player(this);
        this.snowman = new Snowman();
        this.obstacles = new ObstacleManager(this.container);

        this.score = 0;
        this.active = true;
        this.lastTime = 0;

        // Init styles
        document.body.style.background = `linear-gradient(${GameConfig.bgColors[0]}, ${GameConfig.bgColors[1]})`;

        // Start loop
        setInterval(() => { if (this.active) this.obstacles.spawn(this.score); }, 1000);
        requestAnimationFrame(t => this.loop(t));
    }

    loop(timestamp) {
        if (!this.active) return;
        if (!this.lastTime) this.lastTime = timestamp;
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Update Player (Input)
        this.player.update();

        const scoreInc = this.obstacles.update();
        if (scoreInc > 0) {
            this.score += scoreInc;
            this.scoreEl.innerText = this.score;
        }

        // Player Collision
        if (this.obstacles.checkCollision(this.player.getRect(), GameConfig.collisionMargin)) {
            this.endGame();
        }

        // Snowman Logic
        const success = this.snowman.update(dt, this.player, this.obstacles, this.container.getBoundingClientRect());
        if (success) {
            this.score += 50;
            this.scoreEl.innerText = this.score;
        }

        // Snowman vs Player Collision
        const sRect = this.snowman.getRect();
        const pRect = this.player.getRect();
        const hitMargin = 10;

        if (this.snowman.element.style.display !== 'none' &&
            pRect.left + hitMargin < sRect.right - hitMargin &&
            pRect.right - hitMargin > sRect.left + hitMargin &&
            pRect.top + hitMargin < sRect.bottom - hitMargin &&
            pRect.bottom - hitMargin > sRect.top + hitMargin) {
            this.endGame();
        }

        requestAnimationFrame(t => this.loop(t));
    }

    endGame() {
        this.active = false;
        this.finalScoreEl.innerText = this.score;
        this.gameOverEl.style.display = 'block';
    }
}

// Start Game
const game = new Game();
