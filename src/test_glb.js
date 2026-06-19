import fs from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';

const dom = new JSDOM();
global.window = dom.window;
global.document = dom.window.document;
global.self = global;

const gltfData = fs.readFileSync('./assets/models/sls_amg_63_black_series.glb').buffer;
const loader = new GLTFLoader();
loader.parse(gltfData, '', (gltf) => {
  const wheel = gltf.scene.getObjectByName('wheel_FL');
  if (wheel) {
    console.log('Position:', wheel.position);
    console.log('Rotation:', wheel.rotation);
    console.log('Scale:', wheel.scale);
    wheel.geometry.computeBoundingBox();
    console.log('BoundingBox:', wheel.geometry.boundingBox);
  } else {
    console.log('wheel_FL not found');
  }
});
