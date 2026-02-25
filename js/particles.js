/**
 * Constellation Particle System
 * Floating dots with connecting lines, mouse-interactive
 */
(function () {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let mouse = { x: null, y: null, radius: 150 };
    let animationId;
    let width, height;

    // Config
    const CONFIG = {
        particleDensity: 0.00025, // particles per pixel²
        minParticles: 80,
        maxParticles: 500,
        particleMinSize: 0.8,
        particleMaxSize: 2.2,
        speed: 0.3,
        lineDistance: 120,
        lineOpacity: 0.1,
        particleOpacity: 0.5,
        mouseInfluence: 0.02,
    };

    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.size = Math.random() * (CONFIG.particleMaxSize - CONFIG.particleMinSize) + CONFIG.particleMinSize;
            this.speedX = (Math.random() - 0.5) * CONFIG.speed;
            this.speedY = (Math.random() - 0.5) * CONFIG.speed;
            this.opacity = Math.random() * CONFIG.particleOpacity + 0.1;
        }

        update() {
            // Mouse interaction
            if (mouse.x !== null && mouse.y !== null) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < mouse.radius) {
                    const force = (mouse.radius - dist) / mouse.radius;
                    this.speedX -= dx * force * CONFIG.mouseInfluence;
                    this.speedY -= dy * force * CONFIG.mouseInfluence;
                }
            }

            // Apply velocity with damping
            this.x += this.speedX;
            this.y += this.speedY;
            this.speedX *= 0.99;
            this.speedY *= 0.99;

            // Re-add slight drift
            this.speedX += (Math.random() - 0.5) * 0.01;
            this.speedY += (Math.random() - 0.5) * 0.01;

            // Clamp speed
            const maxSpeed = CONFIG.speed * 2;
            this.speedX = Math.max(-maxSpeed, Math.min(maxSpeed, this.speedX));
            this.speedY = Math.max(-maxSpeed, Math.min(maxSpeed, this.speedY));

            // Wrap edges
            if (this.x < -10) this.x = width + 10;
            if (this.x > width + 10) this.x = -10;
            if (this.y < -10) this.y = height + 10;
            if (this.y > height + 10) this.y = -10;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
            ctx.fill();
        }
    }

    function drawLines() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < CONFIG.lineDistance) {
                    const opacity = (1 - dist / CONFIG.lineDistance) * CONFIG.lineOpacity;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }

        // Lines from mouse to nearby particles
        if (mouse.x !== null && mouse.y !== null) {
            for (let i = 0; i < particles.length; i++) {
                const dx = mouse.x - particles[i].x;
                const dy = mouse.y - particles[i].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < mouse.radius) {
                    const opacity = (1 - dist / mouse.radius) * 0.15;
                    ctx.beginPath();
                    ctx.moveTo(mouse.x, mouse.y);
                    ctx.lineTo(particles[i].x, particles[i].y);
                    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        particles.forEach(p => {
            p.update();
            p.draw();
        });

        drawLines();
        animationId = requestAnimationFrame(animate);
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // Recalculate particle count
        const targetCount = Math.max(
            CONFIG.minParticles,
            Math.min(CONFIG.maxParticles, Math.floor(width * height * CONFIG.particleDensity))
        );

        // Add or remove particles
        while (particles.length < targetCount) {
            particles.push(new Particle());
        }
        while (particles.length > targetCount) {
            particles.pop();
        }
    }

    // Events
    function onMouseMove(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    }

    function onMouseLeave() {
        mouse.x = null;
        mouse.y = null;
    }

    function onTouchMove(e) {
        if (e.touches.length > 0) {
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
        }
    }

    function onTouchEnd() {
        mouse.x = null;
        mouse.y = null;
    }

    // Visibility API - pause when tab not visible
    function onVisibilityChange() {
        if (document.hidden) {
            cancelAnimationFrame(animationId);
        } else {
            animate();
        }
    }

    // Init
    function init() {
        resize();
        animate();

        window.addEventListener('resize', resize);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('touchmove', onTouchMove, { passive: true });
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('visibilitychange', onVisibilityChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
