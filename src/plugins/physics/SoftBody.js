import { parsePath, renderPath } from '../PathMorph.js';
import { tweenManager } from '../../core/TweenManager.js';
import { reportError } from '../../core/Config.js';
import { getOwnerWindow } from '../../core/TargetResolver.js';

export function applySoftBody(target, config = {}) {
  const killFns = [];
  const elements = typeof target === 'string' ? document.querySelectorAll(target) : (target.length !== undefined ? target : [target]);
  const stiffness = config.stiffness ?? 150;
  const damping = config.damping ?? 12;
  const mass = config.mass ?? 1;
  const neighborStiffness = config.neighborStiffness ?? 300; // how rigidly they hold their shape relative to neighbors
  const pullRadius = config.pullRadius ?? 100; // Mouse influence radius
  const pullForce = config.pullForce ?? 150; // How hard mouse repels them
  const interactive = config.interactive ?? true; // Listen to hover

  // Resolve interactors (elements that should push the soft body)
  const interactors = [];
  if (config.interactors) {
    const list = Array.isArray(config.interactors) ? config.interactors : [config.interactors];
    list.forEach(item => {
      if (typeof item === 'string') interactors.push(...document.querySelectorAll(item));
      else interactors.push(item);
    });
  }

  // Extract all <path> elements, even if the user passed an <svg> container
  const paths = [];
  elements.forEach(el => {
    if (el.tagName.toLowerCase() === 'path') {
      paths.push(el);
    } else if (typeof el.querySelectorAll === 'function') {
      paths.push(...el.querySelectorAll('path'));
    }
  });

  if (paths.length === 0) {
    reportError('[Tensa] SoftBody: No <path> elements found in the target(s). Ensure the target is an SVG with <path> children.');
    return;
  }

  paths.forEach(el => {
    const startD = el.getAttribute('d');
    if (!startD) return;

    // Parse path into cubic beziers
    const parsed = parsePath(startD);
    if (!parsed || !parsed.beziers || parsed.beziers.length === 0) return;

    // We will treat every x,y coordinate pair as a "node".
    // parsed.startX, startY is the first node.
    // parsed.beziers is an array of [x1,y1, x2,y2, x,y, ...]
    const nodes = [];
    const beziers = [];

    const startNode = {
      x: parsed.startX, y: parsed.startY,
      vx: 0, vy: 0,
      baseX: parsed.startX, baseY: parsed.startY
    };
    nodes.push(startNode);

    for (let i = 0; i < parsed.beziers.length; i += 6) {
      const x1 = parsed.beziers[i];
      const y1 = parsed.beziers[i+1];
      const x2 = parsed.beziers[i+2];
      const y2 = parsed.beziers[i+3];
      const x = parsed.beziers[i+4];
      const y = parsed.beziers[i+5];

      const prevNode = nodes[nodes.length - 1];
      
      let currNode;
      if (Math.abs(x - startNode.baseX) < 0.1 && Math.abs(y - startNode.baseY) < 0.1) {
        currNode = startNode;
      } else {
        currNode = { x, y, vx: 0, vy: 0, baseX: x, baseY: y };
        nodes.push(currNode);
      }

      beziers.push({
        isControl: true,
        node: prevNode,
        offsetX: x1 - prevNode.baseX,
        offsetY: y1 - prevNode.baseY
      });

      beziers.push({
        isControl: true,
        node: currNode,
        offsetX: x2 - currNode.baseX,
        offsetY: y2 - currNode.baseY
      });

      beziers.push({
        isAnchor: true,
        node: currNode
      });
    }

    const isClosed = beziers.length > 0 && beziers[beziers.length - 1].node === startNode;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.prevNode = i > 0 ? nodes[i - 1] : (isClosed ? nodes[nodes.length - 1] : nodes[i]);
      n.nextNode = i < nodes.length - 1 ? nodes[i + 1] : (isClosed ? nodes[0] : nodes[i]);
      
      const dx = n.nextNode.baseX - n.prevNode.baseX;
      const dy = n.nextNode.baseY - n.prevNode.baseY;
      n.baseAngle = Math.atan2(dy, dx);
      n.baseDist = Math.sqrt(dx * dx + dy * dy);
    }

    // Stop any conflicting animations
    tweenManager.stop([el], ['d', 'morphPath']);

    // Track mouse interaction
    let mouseX = -9999;
    let mouseY = -9999;
    
    // Find the closest SVG root to attach mouse listener
    const svg = el.ownerSVGElement;
    let pt = svg ? svg.createSVGPoint() : null;

    const onMove = (e) => {
      if (!svg || !pt) return;
      pt.x = e.clientX;
      pt.y = e.clientY;
      // Convert to SVG coordinate space
      const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
      mouseX = svgP.x;
      mouseY = svgP.y;
    };
    
    // We want the jelly to react even when the pointer is outside the SVG
    if (interactive) {
      getOwnerWindow(el).addEventListener('pointermove', onMove);
    }

    // Allow programmatic impacts
    el.punch = (x, y, force = pullForce, radius = pullRadius) => {
      const radiusSq = radius * radius;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const dx = node.x - x;
        const dy = node.y - y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < radiusSq && distSq > 0.1) {
          const dist = Math.sqrt(distSq);
          const intensity = 1 - (dist / radius);
          // Apply instant velocity impulse instead of continuous force
          node.vx += (dx / dist) * (force / mass) * intensity * 0.05; // 0.05 is to scale it nicely
          node.vy += (dy / dist) * (force / mass) * intensity * 0.05;
        }
      }
      wakeUp();
    };

    let lastTime = performance.now();
    let rafId = null;

    const tick = (time) => {
      const dt = Math.min((time - lastTime) / 1000, 0.03); // Cap dt
      lastTime = time;

      let isMoving = false;

      // Resolve interactor positions
      const activeInteractors = [];
      if (interactors.length > 0 && svg && pt) {
        for (let j = 0; j < interactors.length; j++) {
          const rect = interactors[j].getBoundingClientRect();
          pt.x = rect.left + rect.width / 2;
          pt.y = rect.top + rect.height / 2;
          const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
          // We rely entirely on the global pullRadius for interactors now
          activeInteractors.push({ x: svgP.x, y: svgP.y, radius: pullRadius }); 
        }
      }

      // Calculate forces
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        
        let forceX = 0;
        let forceY = 0;

        // 1. Spring towards base position
        forceX += -stiffness * (node.x - node.baseX);
        forceY += -stiffness * (node.y - node.baseY);

        // 2. Spring towards neighbors (closed loop)
        const prev = nodes[i === 0 ? nodes.length - 1 : i - 1];
        const distBaseX_prev = node.baseX - prev.baseX;
        const distBaseY_prev = node.baseY - prev.baseY;
        forceX += -neighborStiffness * ((node.x - prev.x) - distBaseX_prev);
        forceY += -neighborStiffness * ((node.y - prev.y) - distBaseY_prev);

        const next = nodes[i === nodes.length - 1 ? 0 : i + 1];
        const distBaseX_next = node.baseX - next.baseX;
        const distBaseY_next = node.baseY - next.baseY;
        forceX += -neighborStiffness * ((node.x - next.x) - distBaseX_next);
        forceY += -neighborStiffness * ((node.y - next.y) - distBaseY_next);

        // 3. Mouse Repulsion
        const dx = node.x - mouseX;
        const dy = node.y - mouseY;
        const distSq = dx * dx + dy * dy;
        const pullRadiusSq = pullRadius * pullRadius;
        
        if (distSq < pullRadiusSq && distSq > 0.1) {
          const dist = Math.sqrt(distSq);
          const intensity = 1 - (dist / pullRadius); // 0 to 1
          
          forceX += (dx / dist) * pullForce * intensity;
          forceY += (dy / dist) * pullForce * intensity;
        }

        // 3.5 Interactor Repulsion
        for (let j = 0; j < activeInteractors.length; j++) {
          const inter = activeInteractors[j];
          const idx = node.x - inter.x;
          const idy = node.y - inter.y;
          const idistSq = idx * idx + idy * idy;
          const iradSq = inter.radius * inter.radius;
          
          if (idistSq < iradSq && idistSq > 0.1) {
            const idist = Math.sqrt(idistSq);
            const intensity = 1 - (idist / inter.radius); 
            
            forceX += (idx / idist) * pullForce * intensity;
            forceY += (idy / idist) * pullForce * intensity;
          }
        }

        // 4. Damping
        forceX -= damping * node.vx;
        forceY -= damping * node.vy;

        // Euler integration
        const ax = forceX / mass;
        const ay = forceY / mass;
        node.vx += ax * dt;
        node.vy += ay * dt;
      }

      // Apply velocities
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        node.x += node.vx * dt;
        node.y += node.vy * dt;

        if (Math.abs(node.vx) > 0.05 || Math.abs(node.vy) > 0.05 || Math.abs(node.x - node.baseX) > 0.05 || Math.abs(node.y - node.baseY) > 0.05) {
          isMoving = true;
        }
      }

      // Reconstruct Path
      const currentStart = [nodes[0].x, nodes[0].y];
      const currentBeziers = [];
      for (let i = 0; i < beziers.length; i++) {
        const b = beziers[i];
        if (b.isAnchor) {
          currentBeziers.push(b.node.x, b.node.y);
        } else {
          const n = b.node;
          const dx = n.nextNode.x - n.prevNode.x;
          const dy = n.nextNode.y - n.prevNode.y;
          const currAngle = Math.atan2(dy, dx);
          const currDist = Math.sqrt(dx * dx + dy * dy);
          
          let deltaAngle = currAngle - n.baseAngle;
          let scale = n.baseDist > 0.001 ? currDist / n.baseDist : 1;
          
          const cos = Math.cos(deltaAngle) * scale;
          const sin = Math.sin(deltaAngle) * scale;
          
          const rotX = b.offsetX * cos - b.offsetY * sin;
          const rotY = b.offsetX * sin + b.offsetY * cos;
          
          currentBeziers.push(n.x + rotX, n.y + rotY);
        }
      }

      let pathString = renderPath(currentStart, currentBeziers);
      if (isClosed) pathString += ' Z';
      el.setAttribute('d', pathString);

      config.onUpdate?.({ isMoving });

      if (isMoving || mouseX !== -9999 || interactors.length > 0) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };

    // Keep it running or wake up on move
    const wakeUp = () => {
      if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    if (interactive) {
      getOwnerWindow(el).addEventListener('pointermove', wakeUp);
    }
    wakeUp();

    killFns.push(() => {
      if (rafId) cancelAnimationFrame(rafId);
      if (interactive) {
        getOwnerWindow(el).removeEventListener('pointermove', onMove);
        getOwnerWindow(el).removeEventListener('pointermove', wakeUp);
      }
    });
  });

  return {
    kill() {
      killFns.forEach(fn => fn());
    }
  };
}
