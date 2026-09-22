import * as THREE from 'three';
import type { BodyName } from '../solar-data';
import type { EarthObserverView } from './earth-observer-view';
import type { BodyScene } from './body-scene';
import type { Landmark } from './types';
import { readEarthGridAt } from './earth-overlays';

export type SceneInputController = { dispose(): void };

export function bindSceneInput(options: {
  canvas: HTMLCanvasElement;
  host: HTMLDivElement;
  camera: THREE.Camera;
  bodyScene: BodyScene;
  observerView: EarthObserverView;
  focus: (name: BodyName) => void;
  zoomObserver: (delta: number) => void;
  onSelect: (name: BodyName | null) => void;
  onLandmarkSelect: (selection: { landmark: Landmark; x: number; y: number } | null) => void;
  onContextLost: () => void;
  onError: (message: string) => void;
}): SceneInputController {
  const { canvas, host, camera, bodyScene, observerView, focus, zoomObserver, onSelect, onLandmarkSelect, onContextLost, onError } = options;
  const pointer = new THREE.Vector2(), start = new THREE.Vector2(), end = new THREE.Vector2();
  const raycaster = new THREE.Raycaster(); raycaster.params.Line = { threshold: 0.035 };
  const gridTooltip = document.createElement('div'); gridTooltip.className = 'earth-grid-tooltip'; gridTooltip.hidden = true; host.appendChild(gridTooltip);
  const setPointerFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return rect;
  };
  const pointerDown = (event: PointerEvent) => {
    start.set(event.clientX, event.clientY);
    if (!observerView.active) return;
    observerView.beginDrag(event.clientX, event.clientY);
    canvas.setPointerCapture?.(event.pointerId);
    gridTooltip.hidden = true;
  };
  const pointerMove = (event: PointerEvent) => {
    if (observerView.active) {
      observerView.moveDrag(event.clientX, event.clientY);
      gridTooltip.hidden = true;
      return;
    }
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const rect = setPointerFromEvent(event);
    const hit = raycaster.intersectObject(bodyScene.earthGridLine, false)[0];
    if (!hit) { gridTooltip.hidden = true; return; }
    const local = bodyScene.earth.mesh.worldToLocal(hit.point.clone()).normalize();
    const cameraDirection = bodyScene.earth.mesh.worldToLocal(camera.position.clone()).sub(local).normalize();
    if (local.dot(cameraDirection) <= 0) { gridTooltip.hidden = true; return; }
    const reading = readEarthGridAt(local);
    gridTooltip.textContent = reading.label;
    const measurement = document.createElement('span'); measurement.className = reading.className; measurement.textContent = reading.measurement;
    gridTooltip.appendChild(measurement);
    gridTooltip.style.left = `${event.clientX - rect.left + 14}px`;
    gridTooltip.style.top = `${event.clientY - rect.top + 14}px`;
    gridTooltip.hidden = false;
  };
  const pointerLeave = () => { observerView.endDrag(); gridTooltip.hidden = true; };
  const pointerUp = (event: PointerEvent) => {
    if (observerView.active) {
      observerView.endDrag();
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture?.(event.pointerId);
      return;
    }
    end.set(event.clientX, event.clientY);
    if (start.distanceTo(end) > 5) return;
    setPointerFromEvent(event);
    // Only select the body mesh; Earth children include grid and landmark objects.
    const hit = raycaster.intersectObjects(bodyScene.objects.map((item) => item.mesh), false)[0];
    const landmarkHit = raycaster.intersectObjects(bodyScene.earthLandmarkMeshes, false)[0];
    const landmarkLocal = landmarkHit ? bodyScene.earth.mesh.worldToLocal(landmarkHit.point.clone()).normalize() : null;
    const landmarkCameraDirection = landmarkLocal ? bodyScene.earth.mesh.worldToLocal(camera.position.clone()).sub(landmarkLocal).normalize() : null;
    if (landmarkHit && landmarkLocal && landmarkCameraDirection && landmarkLocal.dot(landmarkCameraDirection) > 0) {
      const rect = canvas.getBoundingClientRect();
      const popupWidth = Math.min(280, rect.width - 24);
      const x = Math.max(12, Math.min(event.clientX - rect.left + 14, rect.width - popupWidth - 12));
      const y = Math.max(12, Math.min(event.clientY - rect.top + 14, rect.height - 210));
      onSelect('Earth'); onLandmarkSelect({ landmark: landmarkHit.object.userData.landmark as Landmark, x, y });
      return;
    }
    onLandmarkSelect(null);
    if (hit) { const name = hit.object.userData.name as BodyName; focus(name); onSelect(name); }
  };
  const pointerCancel = (event: PointerEvent) => {
    observerView.endDrag();
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture?.(event.pointerId);
  };
  const wheel = (event: WheelEvent) => {
    if (!observerView.active) return;
    event.preventDefault(); zoomObserver(Math.sign(event.deltaY) * 4);
  };
  const contextLost = (event: Event) => {
    event.preventDefault(); onContextLost();
    onError('The graphics connection was interrupted. Reload the page to restart the model.');
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerleave', pointerLeave);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('webglcontextlost', contextLost);
  return {
    dispose() {
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerleave', pointerLeave); canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerCancel); canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('webglcontextlost', contextLost); gridTooltip.remove();
    },
  };
}
