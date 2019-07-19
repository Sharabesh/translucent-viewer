const $ = require('jquery');

const THREE = require('three');
THREE.SubdivisionModifier = require('three-subdivision-modifier');
THREE.TrackballControls = require('three-trackballcontrols');
THREE.PLYLoader = require('three-ply-loader');

class Translucent {

    brain = null;
    scene = null;
    renderer = null;
    composer = null;
    camera = null;
    cameraControl =  null;
    light = null;

    // init the scene
    init = async (pars) => {
        var {elemId} = pars;
        let backgroundColor = 0xffffff;
        let brainColor = 'black';
        if(typeof pars.backgroundColor !== 'undefined') {
            backgroundColor = pars.backgroundColor;
        }
        if(typeof pars.brainColor !== 'undefined') {
            brainColor = pars.brainColor;
        }
        return new Promise( (resolve, reject)  => {
                // init renderer
                this.renderer = new THREE.WebGLRenderer({
                    antialias: true, // to get smoother output
                    preserveDrawingBuffer: true // to allow screenshot
                });
                this.renderer.setPixelRatio( window.devicePixelRatio );
                this.renderer.setClearColor( backgroundColor, 1 );
                var width=$('#'+elemId).width();
                var height=$('#'+elemId).height();
                this.renderer.setSize(width,height);
                $('#'+elemId).get(0).appendChild(this.renderer.domElement);

                // create a scene
                this.scene = new THREE.Scene();

                // add a camera to the scene
                this.camera = new THREE.PerspectiveCamera(35, width / height,10, 100 );
                this.camera.position.set(0, 0, 40);
                this.scene.add(this.camera);

                // add a trackball camera contol
//                  this.cameraControls = new THREE.OrbitControls( this.camera, document.getElementById(elemId) )
                this.cameraControls = new THREE.TrackballControls( this.camera, document.getElementById(elemId) )
                this.cameraControls.rotateSpeed=10;

                // add light
                this.light = new THREE.AmbientLight( Math.random() * 0xffffff );
                this.scene.add( this.light );
                this.light = new THREE.PointLight( 0xffffff,2,80 );
                this.light.position.copy( this.camera.position );
                this.scene.add( this.light );
                this.cameraControls.addEventListener('change', () => {
                    this.light.position.copy( this.camera.position );
                    //this.render();
                } );

                // add the translucent brain mesh
                var oReq = new XMLHttpRequest();
                oReq.open('GET', './lrh3.ply', true);
                oReq.responseType='text';
                oReq.onload = function(oEvent) {
                    var tmp=this.response;
                    var buffergeometry=new THREE.PLYLoader().parse(tmp);
                    var geometry = new THREE.Geometry().fromBufferGeometry(buffergeometry);
                    geometry.mergeVertices();
                    geometry.sourceType = 'ply';

                    geometry.computeFaceNormals();
                    geometry.computeVertexNormals();

                    // translucent shader
                    var material = new THREE.ShaderMaterial({
                        uniforms: {
                            coeficient: {type: 'f', value: 1.0},
                            power: {type: 'f', value: 2},
                            glowColor: {type: 'c', value: new THREE.Color(brainColor)},
                        },
                        vertexShader: [ 'varying vec3 vVertexWorldPosition;',
                                            'varying vec3 vVertexNormal;',
                                            'void main(){',
                                            '  vVertexNormal = normalize(normalMatrix * normal);',
                                            '  vVertexWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
                                            '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                                            '}',
                                            ].join('\n'),
                        fragmentShader: [ 'uniform vec3 glowColor;',
                                            'uniform float coeficient;',
                                            'uniform float power;',
                                            'varying vec3 vVertexNormal;',
                                            'varying vec3 vVertexWorldPosition;',
                                            'varying vec4 vFragColor;',
                                            'void main(){',
                                            '  vec3 worldCameraToVertex= vVertexWorldPosition - cameraPosition;',
                                            '  vec3 viewCameraToVertex = (viewMatrix * vec4(worldCameraToVertex, 0.0)).xyz;',
                                            '  viewCameraToVertex = normalize(viewCameraToVertex);',
                                            '  float intensity = pow(coeficient+dot(vVertexNormal, viewCameraToVertex), power);',
                                            '  gl_FragColor = vec4(glowColor*intensity, intensity);',
                                            '}',
                                        ].join('\n'),
                        transparent: true,
                        depthWrite: false,
                    });
                    var modifier = new THREE.SubdivisionModifier(1);
                    geometry = modifier.modify(geometry);

                    // hack
                    for(var i=0;i<geometry.vertices.length;i++)
                    {
                        geometry.vertices[i].x*=0.14;
                        geometry.vertices[i].y*=0.14;
                        geometry.vertices[i].z*=0.14;
                        geometry.vertices[i].y+=3;
                        geometry.vertices[i].z-=2;
                    }

                    this.brain=new THREE.Mesh(geometry,material);
                    this.scene.add(this.brain);

                    this.animate();
                    //this.render();

                    resolve();
                };
                oReq.onerror=function() {
                    console.error('ERROR');
                    reject();
                };
                oReq.send();
            });

    };

    // animation loop
    animate = () => {
        requestAnimationFrame( this.animate );
        this.render();
    };
    // render the scene
    render = () => {
        this.cameraControls.update();
        this.renderer.render( this.scene, this.camera );
    }
}
