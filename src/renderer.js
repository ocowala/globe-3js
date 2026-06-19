import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls, ThreeMFLoader } from 'three/examples/jsm/Addons.js';
import { getCurrentStack } from 'three/tsl';
/* 

   To display anything on 3.js we need:
   1. Scene
   2. Camera
   3. Renderer

 */

// Creating Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xD3D3D3); // light grey bg

// Creating Renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Creating Camera (make it follow car later on)
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 500);

// Fixing camera position for testing purposes
camera.position.set(10,10,10);
camera.lookAt(0,0,0);

// REQUIRED: add lighting to make car appear
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

// Creating Loader
const loader = new GLTFLoader();

// Creating Track (make into function later to incorporate new tracks)

let track;

const raycastLines = [];
const borderLineSegments = [];

loader.load('/models/track.glb', function ( gltf ) {
    console.log("Successfully added track\n");
    track = gltf.scene;
    scene.add(track);

    track.traverse((child) => {
      if(child.name.startsWith('Tree')){

        console.log(child.name);

        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);

        const halfWidth = 0.3;
        const halfHeight = 1.0;
        const halfDepth = 0.3;
        
        const box = new THREE.Box3(new THREE.Vector3(worldPos.x - halfWidth, worldPos.y, worldPos.z - halfDepth), 
                    new THREE.Vector3(worldPos.x + halfWidth, worldPos.y + halfHeight, worldPos.z + halfDepth));

        treeBoxes.push(box);


        const helper = new THREE.Box3Helper(box, 0xff0000);
        scene.add(helper);
      }
      // Highlight Track Borders
      if(child.name.startsWith("Curve")){

        
        const edges = new THREE.EdgesGeometry(child.geometry, 30);


        const borderLine = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color : 0x0000FF,
            linewidth : 1
          })
        );

        borderLine.position.copy(child.position);
        borderLine.rotation.copy(child.rotation);
        borderLine.scale.copy(child.scale);

        //borderLineSegments.push(borderLine);
        borderLineSegments.push(child);
        track.add(borderLine);

      }
    });
    
    // console.log(`treeBoxes built: ${treeBoxes.length}`); // should be > 0

    }, undefined, function ( error ) { 
        console.log("Track load failed\n", error);
    });


// Creating Car 

/* 

GOALS:

1. Separate chassis from wheels
2. Make FR and FL spin and rotate together but keep the same distance apart
3. Make RL and RR spin together (wheelSpinAngle) 
4. Make wheels move with the chassis as they are part of the entire car. 

*/

let carRoot = null;
let chassis = null;
let wheelFL = null;
let wheelFR = null;
let wheelBL = null
let wheelBR = null;

let wheelSpinAngle = 0;

// changes car pivot position from nose to center (half car length away) 0.97 units away
const HALF_CAR_LENGTH = 0.97;

// z : HALF_CAR_LENGTH
// these are hard-coded for the time-being. 
const START_POSITION = {x: 3.1197601161211472, y:0, z: -27.907496356427632};
const START_YAW = Math.PI / 4.0 - 0.05;

loader.load('/models/car_v2.glb', function ( gltf ) {
        carRoot = gltf.scene;
        
        
        

        // setting initial position and rotation
        carRoot.position.x = START_POSITION.x;
        carRoot.position.z = START_POSITION.z;
        carRoot.rotation.y = START_YAW;

        carRoot.children.forEach(child => {
          child.position.z += HALF_CAR_LENGTH;
        });

        // shift model origin to HALF_CAR_LENGTH from nose
        //carRoot.position.x = HALF_CAR_LENGTH;

        chassis = carRoot.getObjectByName("chassis");
        wheelFL = carRoot.getObjectByName("wheel_FL");
        wheelFR = carRoot.getObjectByName("wheel_FR");
        wheelBL = carRoot.getObjectByName("wheel_BL");
        wheelBR = carRoot.getObjectByName("wheel_BR");

        // With ZYX order for FL and FR, steer (z) is applied first in world space, then spin (Y) rotates around the steering axle. Reversed order.
        wheelFL.rotation.order = 'ZYX';
        wheelFR.rotation.order = 'ZYX';
        wheelBL.rotation.order = 'ZYX';
        wheelBR.rotation.order = 'ZYX';


       // JUST TO KNOW IF ITS STILL NOSE OR HALF CAR LENGTH

      const halfWidth = 0.3;
      const halfHeight = 1.0;
      const halfDepth = 0.3;

      const box = new THREE.Box3(new THREE.Vector3(START_POSITION.x - halfWidth, START_POSITION.y, START_POSITION.z - halfDepth), 
                    new THREE.Vector3(START_POSITION.x + halfWidth, START_POSITION.y + halfHeight, START_POSITION.z + halfDepth));

        //treeBoxes.push(box);


        const helper = new THREE.Box3Helper(box, 0xff0000);
        scene.add(helper);
        



        scene.add(carRoot);

        
    }, undefined, function ( error ){
        console.log("Car Load failed");
 
      });



const keyPressed = {};

// key pressed
window.addEventListener('keydown', (event) => {
  keyPressed[event.code] = true;
}, false);

// key released 
window.addEventListener('keyup', (event) => {
  keyPressed[event.code] = false;
}, false);

// properties of CAR object (update properties to update car state)

const CAR = {
  speed: 0,
  steeringAngle: 0,
  yaw: START_YAW, // world Y rotation in radians

  MAX_SPEED: 0.2,
  ACCELERATION: 0.01,
  BRAKE_FORCE: 0.003,
  // higher friction means lower mu_k in this case
  FRICTION: 0.97,

  MAX_STEER: Math.PI / 5.5, // approx 33 degrees
  STEER_SPEED: 0.03,
  STEER_RETURN: 0.06, 

  WHEEL_RADIUS: 0.23, // 0.23m from GLB file
};


/* 
    GOALS:
    1. Setup Collision Detection
    2. Collisions with Trees
    3. Collisions with White Track
    4. If car is not on track, reset the car onto the original starting point

    USED RAYCASTING (will use for RL later as well)
*/


// Collision Detection

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0); // unit vector down

function getGroundMeshBelow(){
  const origin = carRoot.position.clone();
  origin.y += 1;

  raycaster.set(origin, down);

  if(!track) return null;
  const hits = raycaster.intersectObject(track, true); // checks for intersections using raycaster
  
  if(hits.length == 0) return null; // floating over nothing
  return hits[0].object.name; // name of first mesh hit
}

let offTrackSeconds = 0;
let lastTime;
const treeBoxes = [];

function checkOnTrack(){
  const meshBelow = getGroundMeshBelow();
  console.log('meshBelow: ' + meshBelow);
  const onRoad = meshBelow !== null && meshBelow.includes('Curve');
  return onRoad;
  //const onRoad = meshBelow === 'Curve'; // exact name of GLB
}

function checkOffTrackCollision(onTrack, delta){
  if(!onTrack){
    offTrackSeconds += delta / 1000;

    if(offTrackSeconds >= 3){
      console.log("OFFTRACK COLLISION");
      handleCollision();
    }
  }
  else{
    offTrackSeconds = 0;
  }

}

function checkTreeCollision(){
  if(treeBoxes.length == 0) return;

  const carBox = new THREE.Box3().setFromObject(carRoot);


  for(const treeBox of treeBoxes){
    if(carBox.intersectsBox(treeBox)){
      handleCollision(); // reset car box to starting position
      console.log("TREE COLLISION OCCURRED");
      break;
    }
  }
}


function handleCollision(){
  // Reset position
  carRoot.position.set(START_POSITION.x, START_POSITION.y, START_POSITION.z);
  
  // Reset yaw
  CAR.yaw = START_YAW;
  carRoot.rotation.y = START_YAW;

  // Reset wheelSpinAngles and wheel rotations
  CAR.speed = 0;
  CAR.steeringAngle = 0;
  wheelSpinAngle = 0;
  wheelFL.rotation.y = 0;
  wheelFR.rotation.y = 0;
  wheelBL.rotation.y = 0;
  wheelBR.rotation.y = 0;
  wheelFL.rotation.z = 0;
  wheelFR.rotation.z = 0;

  // Reset off-track timer
  offTrackSeconds = 0;

  console.log("Collision occurred!");
}

/* 
        GOALS:
        1. Create 8 cardinal direction raycasts (higlighted and follows car)
        2. Using distance from raycast, log distance between car and track border from cardinal raycast.
*/

const cardinalRaycaster = new THREE.Raycaster();

// cardinalRaycaster.params.Line = { threshold : 1.0  };

const MAX_RAY_DIST = 20;

const rayMaterial = new THREE.LineBasicMaterial({ color : 0x00ff00, linewidth : 3});

for(let i = 0; i < 8; i++){
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(6);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const line = new THREE.Line(geometry, rayMaterial);
  scene.add(line);
  raycastLines.push(line);

}

function updateRaycasts() {

  const onTrack = checkOnTrack();

  raycastLines.forEach(line => { line.visible = onTrack; });

  if(!onTrack || borderLineSegments.length == 0) return;
  
  borderLineSegments.forEach(mesh => {
    mesh.updateMatrixWorld(true);
  });


  const origin = carRoot.position.clone();
  origin.y = 0.2;

  for(let i = 0; i < 8; i++){
    const angle = CAR.yaw + (i * Math.PI / 4.0);
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));

    // Cast rays at blue border segments
    cardinalRaycaster.set(origin, direction);

    const hits = cardinalRaycaster.intersectObjects(borderLineSegments, true);

    const dist = hits.length > 0 ? Math.min(hits[0].distance, MAX_RAY_DIST) : MAX_RAY_DIST;

    const endPt = origin.clone().addScaledVector(direction, dist);
    
    const pos = raycastLines[i].geometry.attributes.position;
    pos.setXYZ(0, origin.x, origin.y, origin.z);
    pos.setXYZ(1, endPt.x, endPt.y, endPt.z);
    pos.needsUpdate = true;

  }

}

















// Camera Follow 
// (-5,5, 8)
const CAM_OFFSET = new THREE.Vector3(0, 5, -8); // local offset behind car (0,5,-8)
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();


function animate(time){  
  if(!carRoot) {
      renderer.render(scene, camera);
      return;
    }
    
  // COLLISION DETECTION UPDATES

  const delta = lastTime !== null ? Math.min(time - lastTime, 100) : 16;
  //console.log("delta:" + delta);
  lastTime = time;
  const onTrack = checkOnTrack();
  checkOffTrackCollision(onTrack, delta);
  checkTreeCollision();
  updateRaycasts();

  // RAYCAST UPDATES
  




    // CONTROLS UPDATES
  
    //console.log(carRoot.position.x + " " + carRoot.position.z);

    // position car on x (LR) and z (FB) axis
    // rotate: steeringAngle (y-axis), spinAngle (x-axis)
    
    // updating CAR properties 
    const fwd = keyPressed['ArrowUp'] || keyPressed['KeyW'];
    const rev = keyPressed['ArrowDown'] || keyPressed['KeyS'];

    if(fwd){
      CAR.speed = Math.min(CAR.speed + CAR.ACCELERATION, CAR.MAX_SPEED);
    }
    else if(rev){
      CAR.speed = Math.max(CAR.speed - CAR.BRAKE_FORCE, -CAR.MAX_SPEED * 0.5);
    }
    else{
      // car slows down due to friction
      CAR.speed *= CAR.FRICTION;
      if(Math.abs(CAR.speed) < 0.0002) CAR.speed = 0;
    }

    const left = keyPressed['ArrowLeft'] || keyPressed['KeyA'];
    const right = keyPressed['ArrowRight'] || keyPressed['KeyD'];
    
    // steerFactor makes car less maneuverable at higher speeds
    const steerFactor = 1 - Math.abs(CAR.speed) / CAR.MAX_SPEED * 0.4;

    if(left){
      CAR.steeringAngle = Math.min(CAR.steeringAngle + CAR.STEER_SPEED * steerFactor, CAR.MAX_STEER);
    }
    else if(right){
      CAR.steeringAngle = Math.max(CAR.steeringAngle - CAR.STEER_SPEED * steerFactor, -CAR.MAX_STEER);
    }
    else{
      // wheels return to the center
      CAR.steeringAngle *= (1 - CAR.STEER_RETURN);
      if(Math.abs(CAR.steeringAngle) < 0.001) CAR.steeringAngle = 0;
    }

    // update yaw (reverse steering is flipped) only steer when car is moving
    if(Math.abs(CAR.speed) > 0.0005) {
      //const sign = CAR.speed > 0 ? 1 : -1;
      CAR.yaw += CAR.steeringAngle * CAR.speed * 0.75;
    } 

    // update carRoot properties with updated CAR state properties 

    carRoot.rotation.y = CAR.yaw;

    carRoot.position.x += Math.sin(CAR.yaw) * CAR.speed;
    carRoot.position.z += Math.cos(CAR.yaw) * CAR.speed;

    wheelSpinAngle += CAR.speed / CAR.WHEEL_RADIUS;

    wheelFL.rotation.x = wheelSpinAngle;
    wheelFR.rotation.x = wheelSpinAngle;
    wheelBL.rotation.x = wheelSpinAngle;
    wheelBR.rotation.x = wheelSpinAngle;
  
    wheelFL.rotation.y = CAR.steeringAngle;
    wheelFR.rotation.y = CAR.steeringAngle;


    // Following Camera

    const offset = CAM_OFFSET.clone();
    offset.applyEuler(new THREE.Euler(0, CAR.yaw, 0));

    camDesired.copy(carRoot.position).add(offset);
    camera.position.lerp(camDesired, 0.07); // smooth lag

    camTarget.copy(carRoot.position).add(new THREE.Vector3(0,1,0));
    camera.lookAt(camTarget);

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);