"use strict";
// ============================================================
// Сущности: игрок, спутник-мотылёк, враги, предметы, платформы
// ============================================================

class Player {
  constructor(x, y, abilities) {
    this.w = 22; this.h = 40;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumps = 0;           // использованные прыжки в воздухе
    this.abilities = abilities;
    this.dashT = 0;
    this.dashCd = 0;
    this.airDashUsed = false;
    this.hp = 3;
    this.inv = 0;             // неуязвимость после урона
    this.dead = false;
    this.deadT = 0;
    this.anim = new Animator("felar");
    this.anim.set("idle");
    this.carrier = null;      // движущаяся платформа под ногами
    this.wasOnGround = false;
  }

  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get cx() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }

  hurt(knockDir) {
    if (this.inv > 0 || this.dead) return;
    this.hp--;
    SFX.hurt();
    Particles.spawn(this.cx, this.y + this.h / 2, { n: 10, color: "#ff8f6b", speed: 140, glow: true });
    if (this.hp <= 0) { this.die(); return; }
    this.inv = 1.2;
    this.vx = knockDir * 240;
    this.vy = -340;
    this.anim.set("hurt", true);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 0;
    this.vx = 0; this.vy = 0;
    SFX.death();
    this.anim.set("death", true);
    Particles.spawn(this.cx, this.y + this.h / 2, { n: 18, color: "#ffe9a3", speed: 160, gravity: -60, glow: true, life: 0.9 });
  }

  update(dt, level) {
    if (this.dead) { this.deadT += dt; this.anim.update(dt); return; }
    const P = PHYS;
    this.inv = Math.max(0, this.inv - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);

    const L = Input.held("left"), R = Input.held("right");
    const dir = (R ? 1 : 0) - (L ? 1 : 0);
    if (dir !== 0) this.facing = dir;

    // --- рывок ---
    if (Input.hit("dash") && this.abilities.dash && this.dashCd <= 0 &&
        (this.onGround || !this.airDashUsed)) {
      this.dashT = P.dashTime;
      this.dashCd = P.dashCooldown;
      if (!this.onGround) this.airDashUsed = true;
      this.vx = this.facing * P.dashSpeed;
      this.vy = 0;
      SFX.dash();
      this.anim.set("dash", true);
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      Particles.spawn(this.cx - this.facing * 10, this.bottom - 12,
        { n: 2, color: "#bfeee6", speed: 30, gravity: 0, life: 0.3, glow: true });
    } else {
      // --- горизонталь ---
      const target = dir * P.runSpeed;
      const a = dir !== 0 ? P.accel : P.friction;
      if (this.vx < target) this.vx = Math.min(target, this.vx + a * dt);
      else if (this.vx > target) this.vx = Math.max(target, this.vx - a * dt);
      // --- гравитация ---
      this.vy = Math.min(P.maxFall, this.vy + P.gravity * dt);
      if (!Input.held("jump") && this.vy < 0) this.vy *= 1 - (1 - P.jumpCut) * dt * 14;
    }

    // --- прыжок ---
    if (Input.hit("jump")) this.jumpBuf = P.jumpBuffer;
    if (this.jumpBuf > 0) {
      if (this.onGround || this.coyote > 0) {
        this.vy = P.jumpVel;
        this.jumpBuf = 0; this.coyote = 0;
        this.onGround = false;
        SFX.jump();
        this.anim.set("jump", true);
        Particles.spawn(this.cx, this.bottom, { n: 5, color: "#9aa89a", speed: 60, gravity: 120, life: 0.35 });
      } else if (this.abilities.doubleJump && this.jumps < 1) {
        this.vy = P.jumpVel * 0.92;
        this.jumps++;
        this.jumpBuf = 0;
        SFX.djump();
        this.anim.set("doublejump", true);
        Particles.spawn(this.cx, this.bottom, { n: 8, color: "#7fd4ff", speed: 90, gravity: 40, life: 0.4, glow: true });
      }
    }

    // --- движение и коллизии с тайлами ---
    this.wasOnGround = this.onGround;
    this.moveAndCollide(dt, level);

    if (this.onGround) {
      this.jumps = 0;
      this.airDashUsed = false;
      this.coyote = PHYS.coyote;
      if (!this.wasOnGround) {
        SFX.land();
        Particles.spawn(this.cx, this.bottom, { n: 4, color: "#9aa89a", speed: 50, gravity: 100, life: 0.3 });
      }
    }

    // --- выбор анимации ---
    if (this.dashT > 0) this.anim.set("dash");
    else if (this.inv > 0.85) this.anim.set("hurt");
    else if (!this.onGround) {
      if (this.anim.anim === "doublejump" && !this.anim.done) { /* доигрываем */ }
      else this.anim.set(this.vy < 0 ? "jump" : "fall");
    }
    else if (Math.abs(this.vx) > 30) this.anim.set("run");
    else this.anim.set("idle");
    this.anim.update(dt);
  }

  moveAndCollide(dt, level) {
    // по X
    this.x += this.vx * dt;
    let r = this.rect;
    for (const t of level.solidsNear(r)) {
      if (!aabb(r, t)) continue;
      if (this.vx > 0) this.x = t.x - this.w;
      else if (this.vx < 0) this.x = t.x + t.w;
      this.vx = 0;
      r = this.rect;
    }
    this.x = clamp(this.x, 0, level.pw - this.w);

    // по Y
    const prevBottom = this.bottom;
    this.y += this.vy * dt;
    this.onGround = false;
    this.carrier = null;
    r = this.rect;
    for (const t of level.solidsNear(r)) {
      if (!aabb(r, t)) continue;
      if (this.vy > 0) { this.y = t.y - this.h; this.vy = 0; this.onGround = true; }
      else if (this.vy < 0) { this.y = t.y + t.h; this.vy = 0; }
      r = this.rect;
    }
    // one-way платформы (тайлы '=')
    if (this.vy >= 0) {
      for (const t of level.onewaysNear(r)) {
        if (r.x < t.x + t.w && r.x + r.w > t.x &&
            prevBottom <= t.y + 6 && this.bottom >= t.y && this.bottom <= t.y + 20) {
          this.y = t.y - this.h;
          this.vy = 0;
          this.onGround = true;
        }
      }
    }
  }

  draw(ctx) {
    const blink = this.inv > 0 && Math.floor(this.inv * 12) % 2 === 0;
    if (blink && !this.dead) return;
    this.anim.draw(ctx, this.cx, this.bottom + 4, this.facing < 0);
  }
}

// ---------------- Мотылёк-спутник ----------------
class Moth {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.anim = new Animator("moth");
    this.anim.set("fly");
    this.t = 0;
  }
  update(dt, player, talking) {
    this.t += dt;
    const tx = player.cx - player.facing * 30;
    const ty = player.y - 26 + Math.sin(this.t * 2.2) * 6;
    this.vx = lerp(this.vx, (tx - this.x) * 4, dt * 6);
    this.vy = lerp(this.vy, (ty - this.y) * 4, dt * 6);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.anim.set(talking ? "talk" : "fly");
    this.anim.update(dt);
  }
  draw(ctx) {
    this.anim.draw(ctx, this.x, this.y + 16, this.vx < -10);
  }
}

// ---------------- Враги ----------------
class Walker {
  constructor(x, y, sheetName) {
    this.w = 30; this.h = 26;
    this.x = x; this.y = y;
    this.dir = -1;
    this.speed = sheetName === "sentry" ? 45 : 60;
    this.anim = new Animator(sheetName);
    this.anim.set("walk");
    this.deadT = -1;
  }
  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get alive() { return this.deadT < 0; }
  squash() {
    this.deadT = 0;
    this.anim.set("squash", true);
    SFX.stomp();
    Particles.spawn(this.x + this.w / 2, this.y + this.h / 2,
      { n: 10, color: "#c9d8c0", speed: 120, life: 0.5 });
  }
  update(dt, level) {
    this.anim.update(dt);
    if (!this.alive) { this.deadT += dt; return; }
    // гравитация к земле
    this.y += 300 * dt;
    let r = this.rect;
    let grounded = false;
    for (const t of level.solidsNear(r)) {
      if (aabb(r, t) && r.y + r.h - t.y < 20) {
        this.y = t.y - this.h; grounded = true;
      }
    }
    // патруль: разворот у стены или обрыва
    const step = this.speed * dt * this.dir;
    const aheadX = this.dir > 0 ? this.x + this.w + 2 : this.x - 2;
    const wall = level.solidAtPx(aheadX, this.y + this.h - 8);
    const floor = level.solidAtPx(aheadX, this.y + this.h + 8) ||
                  level.onewayAtPx(aheadX, this.y + this.h + 8);
    if (grounded && (wall || !floor)) this.dir *= -1;
    else this.x += step;
  }
  draw(ctx) {
    if (!this.alive && this.deadT > 0.4) return;
    this.anim.draw(ctx, this.x + this.w / 2, this.y + this.h + 2, this.dir > 0);
  }
}

class Flyer {
  constructor(x, y, sheetName) {
    this.w = 24; this.h = 20;
    this.x0 = x; this.y0 = y;
    this.x = x; this.y = y;
    this.t = Math.random() * 6;
    this.ax = TILE * 3;   // амплитуда по X
    this.ay = TILE * 0.6;
    this.anim = new Animator(sheetName);
    this.anim.set("fly");
    this.deadT = -1;
    this.vy = 0;
  }
  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get alive() { return this.deadT < 0; }
  squash() {
    this.deadT = 0;
    this.anim.set("squash", true);
    SFX.stomp();
    Particles.spawn(this.x + this.w / 2, this.y + this.h / 2,
      { n: 10, color: "#b8a8e0", speed: 120, life: 0.5 });
  }
  update(dt) {
    this.anim.update(dt);
    if (!this.alive) {
      this.deadT += dt;
      this.vy += 900 * dt;
      this.y += this.vy * dt;
      return;
    }
    this.t += dt;
    this.prevX = this.x;
    this.x = this.x0 + Math.sin(this.t * 1.4) * this.ax;
    this.y = this.y0 + Math.sin(this.t * 3.1) * this.ay;
  }
  draw(ctx) {
    if (!this.alive && this.deadT > 0.5) return;
    this.anim.draw(ctx, this.x + this.w / 2, this.y + this.h + 4, this.x < (this.prevX || this.x));
  }
}

// ---------------- Движущаяся платформа ----------------
class MovingPlatform {
  constructor(x, y, vertical) {
    this.w = 96; this.h = 14;
    this.x0 = x; this.y0 = y;
    this.x = x; this.y = y;
    this.vertical = vertical;
    this.range = vertical ? TILE * 3.5 : TILE * 5;
    this.t = 0;
    this.dx = 0; this.dy = 0;
  }
  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update(dt) {
    this.t += dt;
    const k = Math.sin(this.t * 1.1) * this.range;
    const nx = this.vertical ? this.x0 : this.x0 + k;
    const ny = this.vertical ? this.y0 + k : this.y0;
    this.dx = nx - this.x; this.dy = ny - this.y;
    this.x = nx; this.y = ny;
  }
  draw(ctx, ch) {
    const ts = Assets.tileset(ch);
    for (let i = 0; i < 3; i++)
      ctx.drawImage(ts, 2 * TILE, 0, TILE, TILE, this.x + i * TILE, this.y - 2, TILE, TILE);
  }
}

// ---------------- Предметы ----------------
class Shard {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 20; this.h = 24;
    this.taken = false;
    this.anim = new Animator("shard");
    this.anim.set("spin");
    this.anim.t = Math.random();
  }
  get rect() { return { x: this.x - 10, y: this.y - 12, w: this.w, h: this.h }; }
  update(dt) { this.anim.update(dt); }
  take() {
    this.taken = true;
    SFX.pickup();
    Particles.spawn(this.x, this.y, { n: 10, color: "#ffe9a3", speed: 110, gravity: -80, glow: true, life: 0.6 });
  }
  draw(ctx) { if (!this.taken) this.anim.draw(ctx, this.x, this.y + 16); }
}

class Checkpoint {
  constructor(x, y) {
    this.x = x; this.y = y; // y — уровень земли
    this.w = 30; this.h = 60;
    this.lit = false;
    this.anim = new Animator("lantern");
    this.anim.set("off");
  }
  get rect() { return { x: this.x - 15, y: this.y - 60, w: this.w, h: this.h }; }
  light() {
    if (this.lit) return;
    this.lit = true;
    SFX.check();
    this.anim.set("ignite", true);
    Particles.spawn(this.x, this.y - 46, { n: 14, color: "#ffe9a3", speed: 100, gravity: -60, glow: true, life: 0.8 });
  }
  update(dt) {
    this.anim.update(dt);
    if (this.lit && this.anim.anim === "ignite" && this.anim.done) this.anim.set("on");
  }
  draw(ctx) { this.anim.draw(ctx, this.x, this.y); }
}

class Portal {
  constructor(x, y) {
    this.x = x; this.y = y; // y — уровень земли
    this.w = 60; this.h = 90;
    this.anim = new Animator("portal");
    this.anim.set("idle");
  }
  get rect() { return { x: this.x - 30, y: this.y - 90, w: this.w, h: this.h }; }
  update(dt) {
    this.anim.update(dt);
    if (Math.random() < 0.1)
      Particles.spawn(this.x + (Math.random() - 0.5) * 50, this.y - 40,
        { n: 1, color: "#c8b8ff", speed: 30, gravity: -70, glow: true, life: 1 });
  }
  draw(ctx) { this.anim.draw(ctx, this.x, this.y); }
}
