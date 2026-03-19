import { lerp } from './utils.js';

const METERS_TO_PX = 6; // 1 meter = 6 pixels

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = { x: 0, zoom: 1 };
    this.time = 0;

    // Colors
    this.colors = {
      bg: '#0f0f1a',
      road: '#1a1a2e',
      roadEdge: '#2a2a3e',
      laneMarking: '#e2c044',
      shoulder: '#141425',
      crash: '#ff6b6b',
      crashGlow: 'rgba(255, 107, 107, 0.3)',
    };

    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Drag to pan
    this._dragging = false;
    this._dragStartX = 0;
    canvas.addEventListener('mousedown', (e) => {
      this._dragging = true;
      this._dragStartX = e.clientX;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._dragStartX;
      this.camera.x -= dx / (METERS_TO_PX * this.camera.zoom);
      this._dragStartX = e.clientX;
    });
    window.addEventListener('mouseup', () => { this._dragging = false; });

    // Zoom with wheel
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.camera.zoom = Math.max(0.3, Math.min(3, this.camera.zoom * factor));
    }, { passive: false });
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = devicePixelRatio;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._cssWidth = rect.width;
    this._cssHeight = rect.height;
  }

  get w() { return this._cssWidth || this.canvas.width; }
  get h() { return this._cssHeight || this.canvas.height; }

  /** Convert simulation x (meters) to screen CSS pixels */
  simToScreenX(simX, road) {
    let dx = road.distAhead(this.camera.x, simX);
    return (this.w / 2) + dx * METERS_TO_PX * this.camera.zoom;
  }

  /** Convert simulation y (meters from road top) to screen CSS pixels */
  simToScreenY(simY, road) {
    const roadHeightPx = road.totalWidth * METERS_TO_PX * this.camera.zoom;
    const roadTopY = (this.h - roadHeightPx) / 2;
    return roadTopY + simY * METERS_TO_PX * this.camera.zoom;
  }

  render(simulation) {
    const { ctx, canvas } = this;
    const road = simulation.road;
    this.time = simulation.time;

    const scale = METERS_TO_PX * this.camera.zoom;
    const roadHeightPx = road.totalWidth * scale;
    const W = this.w;
    const H = this.h;
    const roadTopY = (H - roadHeightPx) / 2;

    // Clear
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, W, H);

    // Shoulder strips
    const shoulderH = 20 * this.camera.zoom;
    ctx.fillStyle = this.colors.shoulder;
    ctx.fillRect(0, roadTopY - shoulderH, W, shoulderH);
    ctx.fillRect(0, roadTopY + roadHeightPx, W, shoulderH);

    // Road surface
    ctx.fillStyle = this.colors.road;
    ctx.fillRect(0, roadTopY, W, roadHeightPx);

    // Road edges
    ctx.strokeStyle = this.colors.laneMarking;
    ctx.lineWidth = 3 * this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(0, roadTopY);
    ctx.lineTo(W, roadTopY);
    ctx.moveTo(0, roadTopY + roadHeightPx);
    ctx.lineTo(W, roadTopY + roadHeightPx);
    ctx.stroke();

    // Lane dashes
    ctx.setLineDash([12 * this.camera.zoom, 18 * this.camera.zoom]);
    ctx.lineDashOffset = -(this.camera.x * scale) % (30 * this.camera.zoom);
    ctx.lineWidth = 1.5 * this.camera.zoom;
    ctx.strokeStyle = this.colors.laneMarking + '99';
    for (let i = 1; i < road.laneCount; i++) {
      const y = roadTopY + i * road.laneWidth * scale;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw vehicles
    for (const v of simulation.vehicles) {
      this._drawVehicle(v, road, scale, roadTopY);
    }
  }

  _drawVehicle(v, road, scale, roadTopY) {
    const { ctx } = this;
    const screenX = this.simToScreenX(v.x, road);
    const screenY = this.simToScreenY(v.effectiveY, road);
    const w = v.length * scale;
    const h = v.width * scale;

    // Skip if off screen
    if (screenX + w < -50 || screenX - w > this.w + 50) return;

    // Vehicle body
    ctx.save();
    ctx.translate(screenX, screenY);

    if (v.crashed) {
      // Crash glow
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 8);
      ctx.shadowColor = this.colors.crash;
      ctx.shadowBlur = 15 * pulse;
      ctx.fillStyle = this.colors.crash;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowBlur = 0;

      // X mark
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      const s = Math.min(w, h) * 0.3;
      ctx.beginPath();
      ctx.moveTo(-s, -s);
      ctx.lineTo(s, s);
      ctx.moveTo(s, -s);
      ctx.lineTo(-s, s);
      ctx.stroke();
    } else {
      // Normal vehicle
      const radius = Math.min(w * 0.15, h * 0.3);
      ctx.fillStyle = v.color;

      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, radius);
      ctx.fill();

      // Headlight
      ctx.fillStyle = 'rgba(255, 255, 200, 0.8)';
      const hlSize = Math.max(2, h * 0.2);
      ctx.fillRect(w / 2 - hlSize, -h * 0.25, hlSize, h * 0.15);
      ctx.fillRect(w / 2 - hlSize, h * 0.1, hlSize, h * 0.15);

      // Behavior indicator (tiny colored dot)
      const indicatorColors = {
        optimal: '#2ecc71',
        centerHog: '#f39c12',
        aggressive: '#e74c3c',
        cautious: '#3498db',
      };
      ctx.fillStyle = indicatorColors[v.behavior.presetKey] || '#fff';
      ctx.beginPath();
      ctx.arc(-w / 2 + 3, 0, Math.max(1.5, h * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
