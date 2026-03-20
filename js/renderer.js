import { lerp } from './utils.js';

const METERS_TO_PX = 6; // 1 meter = 6 pixels

export class Renderer {
  constructor(canvas, { interactive = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = { x: 0, zoom: 1 };
    this.time = 0;
    this.interactive = interactive;

    // Colors
    this.colors = {
      bg: '#0f0f1a',
      road: '#1a1a2e',
      roadEdge: '#2a2a3e',
      laneMarking: '#e2c044',
      shoulder: '#141425',
    };

    this._resize();
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);

    if (interactive) {
      // Drag to pan
      this._dragging = false;
      this._dragStartX = 0;
      canvas.addEventListener('mousedown', (e) => {
        this._dragging = true;
        this._dragStartX = e.clientX;
      });
      this._moveHandler = (e) => {
        if (!this._dragging) return;
        const dx = e.clientX - this._dragStartX;
        this.camera.x -= dx / (METERS_TO_PX * this.camera.zoom);
        this._dragStartX = e.clientX;
      };
      this._upHandler = () => { this._dragging = false; };
      window.addEventListener('mousemove', this._moveHandler);
      window.addEventListener('mouseup', this._upHandler);

      // Zoom with wheel
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.camera.zoom = Math.max(0.3, Math.min(3, this.camera.zoom * factor));
      }, { passive: false });
    }
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
    if (this._moveHandler) window.removeEventListener('mousemove', this._moveHandler);
    if (this._upHandler) window.removeEventListener('mouseup', this._upHandler);
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

    ctx.restore();
  }

  /** Auto-fit camera to show the full road */
  autoFit(road) {
    this.camera.x = road.roadLength / 2;
    const roadPixels = road.roadLength * METERS_TO_PX;
    this.camera.zoom = Math.min(this.w / roadPixels, 1.5);
  }

  /** Draw a label and stats overlay on top of the canvas */
  renderOverlay(label, stats) {
    const { ctx } = this;
    const W = this.w;

    // Country label — top left
    ctx.save();
    ctx.fillStyle = 'rgba(15, 15, 26, 0.7)';
    ctx.fillRect(0, 0, W, 26);
    ctx.font = '600 13px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#e2c044';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 8, 13);

    // Stats bar — bottom
    const barH = 22;
    const barY = this.h - barH;
    ctx.fillStyle = 'rgba(15, 15, 26, 0.75)';
    ctx.fillRect(0, barY, W, barH);

    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    const y = barY + barH / 2;
    const items = [
      { label: 'Flow', value: Math.round(stats.flowRate).toLocaleString(), color: '#2ecc71' },
      { label: 'Speed', value: Math.round(stats.avgSpeed) + ' km/h', color: '#3498db' },
      { label: 'Density', value: Math.round(stats.density) + '/km', color: '#e2c044' },
    ];
    const spacing = W / items.length;
    items.forEach((item, i) => {
      const x = spacing * i + 8;
      ctx.fillStyle = '#8888a0';
      ctx.fillText(item.label, x, y);
      const labelW = ctx.measureText(item.label + ' ').width;
      ctx.fillStyle = item.color;
      ctx.fillText(item.value, x + labelW, y);
    });
    ctx.restore();
  }
}
