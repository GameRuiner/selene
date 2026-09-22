import * as THREE from 'three';
import { Body, GeoMoon, GeoVector, Observer, ObserverVector, type Vector } from 'astronomy-engine';

export type CelestialMapper = {
  updateBasis(date: Date): void;
  sceneEastDirection(): THREE.Vector3;
  mapDirection(source: THREE.Vector3, target: THREE.Vector3): THREE.Vector3;
  moonPosition(date: Date, target: THREE.Vector3): THREE.Vector3;
  bodyPosition(body: Body, date: Date, target: THREE.Vector3): THREE.Vector3;
  observerPosition(date: Date, latitude: number, longitude: number, target: THREE.Vector3): THREE.Vector3;
};

export function createCelestialMapper(options: { earthPosition: THREE.Vector3; sceneNorth: THREE.Vector3; origin: THREE.Vector3; sceneAU: number }): CelestialMapper {
  const { earthPosition, sceneNorth, origin, sceneAU } = options;
  const exactNorth = new THREE.Vector3(0, 0, 1);
  const exactSunEquator = new THREE.Vector3(), exactEast = new THREE.Vector3(), exactRight = new THREE.Vector3();
  const sceneSunEquator = new THREE.Vector3(), sceneEast = new THREE.Vector3(), sceneRight = new THREE.Vector3();
  const exactDirection = new THREE.Vector3(), mappedDirection = new THREE.Vector3();
  const sourceVector = new THREE.Vector3();

  const updateBasis = (date: Date) => {
    const astronomicalSun = GeoVector(Body.Sun, date, true);
    exactSunEquator.set(astronomicalSun.x, astronomicalSun.y, astronomicalSun.z).normalize();
    exactEast.copy(exactNorth).addScaledVector(exactSunEquator, -exactNorth.dot(exactSunEquator)).normalize();
    exactRight.crossVectors(exactSunEquator, exactEast).normalize();
    sceneSunEquator.copy(origin).sub(earthPosition).normalize();
    sceneEast.copy(sceneNorth).addScaledVector(sceneSunEquator, -sceneNorth.dot(sceneSunEquator)).normalize();
    sceneRight.crossVectors(sceneSunEquator, sceneEast).normalize();
  };
  const mapDirection = (source: THREE.Vector3, target: THREE.Vector3) => {
    target.copy(sceneSunEquator).multiplyScalar(source.dot(exactSunEquator));
    target.addScaledVector(sceneEast, source.dot(exactEast));
    target.addScaledVector(sceneRight, source.dot(exactRight));
    return target;
  };
  const mapVector = (vector: Vector, date: Date, target: THREE.Vector3) => {
    updateBasis(date);
    exactDirection.set(vector.x, vector.y, vector.z);
    mapDirection(exactDirection, mappedDirection).multiplyScalar(sceneAU);
    return target.copy(earthPosition).add(mappedDirection);
  };
  return {
    updateBasis,
    sceneEastDirection: () => sceneEast,
    mapDirection,
    moonPosition(date, target) { return mapVector(GeoMoon(date), date, target); },
    bodyPosition(body, date, target) { return mapVector(GeoVector(body, date, true), date, target); },
    observerPosition(date, latitude, longitude, target) {
      const vector = ObserverVector(date, new Observer(latitude, longitude, 0), false);
      sourceVector.set(vector.x, vector.y, vector.z);
      updateBasis(date);
      mapDirection(sourceVector, mappedDirection).normalize();
      return target.copy(mappedDirection);
    },
  };
}
