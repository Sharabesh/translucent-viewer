const Translucent =  require('./translucent.js');
const MRI = require("./mri.js");

const THREE = require('three');
THREE.SubdivisionModifier = require('three-subdivision-modifier');
THREE.TrackballControls = require('three-trackballcontrols');
THREE.PLYLoader = require('three-ply-loader');

class TranslucentCluster {

        // init the scene
        init = async (pars) => {
            var { elemId } = pars;
            this.tr = new Translucent();
            await this.tr.init(pars);
            this.configureCubeEdges();
        };

        tr = null; // translucent brain

        cmap = {
            dims: []
        };

        flagDataLoaded = null;

        createEmptyData = async (dim) => {
            const data = new Float32Array(dim[0]*dim[1]*dim[2]);
            let i;
            for(i=0;i<dim[0]*dim[1]*dim[2];i++) {
                data[i] = 0;
            }
            this.cmap={data:data, dims:dim, level:0.1};
            this.updateMesh(this.cmap);
            this.flagDataLoaded=true;
        };

        createTestData = async (path) => {
            var m = MRI();
            await m.init();
            await m.loadMRIFromPath(path);
            this.cmap={data:m.data, dims:m.dim, level:0.06};
            this.updateMesh(this.cmap);
            this.flagDataLoaded=true;
        };


        cube_edges = new Int32Array(24);


        edge_table = new Int32Array(256);

        configureCubeEdges = () => {
            var k = 0;
            for(var i=0; i<8; ++i) {
                for(var j=1; j<=4; j<<=1) {
                    var p = i^j;
                    if(i <= p) {
                        this.cube_edges[k++] = i;
                        this.cube_edges[k++] = p;
                    }
                }
            }
            for(var i=0; i<256; ++i) {
                var em = 0;
                for(var j=0; j<24; j+=2) {
                    var a = !!(i & (1<<this.cube_edges[j]));
                    var b = !!(i & (1<<this.cube_edges[j+1]));
                    em |= a !== b ? (1 << (j >> 1)) : 0;
                }
                this.edge_table[i] = em;
            }
        };

        buffer = new Int32Array(4096);


        SurfaceNets = (data, dims, level) => {
            var vertices = [];
            var faces = [];
            var n = 0;
            var x = new Int32Array(3);
            var R = new Int32Array([1, (dims[0]+1), (dims[0]+1)*(dims[1]+1)]);
            var grid = new Float32Array(8);
            var buf_no = 1;

            if(R[2] * 2 > this.buffer.length)
                this.buffer = new Int32Array(R[2] * 2);

            for(x[2]=0; x[2]<dims[2]-1; ++x[2], n+=dims[0], buf_no ^= 1, R[2]=-R[2])
            {
                var m = 1 + (dims[0]+1) * (1 + buf_no * (dims[1]+1));
                for(x[1]=0; x[1]<dims[1]-1; ++x[1], ++n, m+=2)
                for(x[0]=0; x[0]<dims[0]-1; ++x[0], ++n, ++m)
                {
                    var mask = 0, g = 0, idx = n;
                    for(var k=0; k<2; ++k, idx += dims[0]*(dims[1]-2))
                    for(var j=0; j<2; ++j, idx += dims[0]-2)
                    for(var i=0; i<2; ++i, ++g, ++idx)
                    {
                        var p = data[idx]-level;
                        grid[g] = p;
                        mask |= (p < 0) ? (1<<g) : 0;
                    }
                    if(mask === 0 || mask === 0xff)
                        continue;
                    var edge_mask = this.edge_table[mask];
                    var v = [0.0,0.0,0.0];
                    var e_count = 0;
                    for(var i=0; i<12; ++i) {
                        if(!(edge_mask & (1<<i)))
                            continue;
                        ++e_count;
                        var e0 = this.cube_edges[ i<<1 ]; // Unpack vertices
                        var e1 = this.cube_edges[(i<<1)+1];
                        var g0 = grid[e0]; // Unpack grid values
                        var g1 = grid[e1];
                        var t  = g0 - g1; // Compute point of intersection
                        if(Math.abs(t) > 1e-6)
                            t = g0 / t;
                        else
                            continue;
                        for(var j=0, k=1; j<3; ++j, k<<=1) {
                            var a = e0 & k;
                            var b = e1 & k;
                            if(a !== b)
                                v[j] += a ? 1.0 - t : t;
                            else
                                v[j] += a ? 1.0 : 0;
                        }
                    }
                    var s = 1.0 / e_count;
                    for(var i=0; i<3; ++i)
                        v[i] = x[i] + s * v[i];
                    this.buffer[m] = vertices.length;
                    vertices.push(v);
                    for(var i=0; i<3; ++i) {
                        if(!(edge_mask & (1<<i)) )
                            continue;
                        var iu = (i+1)%3;
                        var iv = (i+2)%3;
                        if(x[iu] === 0 || x[iv] === 0)
                            continue;
                        var du = R[iu];
                        var dv = R[iv];
                        if(mask & 1) {
                            faces.push([this.buffer[m], this.buffer[m-du-dv], this.buffer[m-du]]);
                            faces.push([this.buffer[m], this.buffer[m-dv], this.buffer[m-du-dv]]);
                        }
                        else {
                            faces.push([this.buffer[m], this.buffer[m-du-dv], this.buffer[m-dv]]);
                            faces.push([this.buffer[m], this.buffer[m-du], this.buffer[m-du-dv]]);
                        }
                    }
                }
            }
            return {
                vertices,
                faces
            };
        };

        cluster = {
            vertices: [],
            faces: []
        };

        surfacemesh = null;


        updateMesh = async (field)  => {
            if(typeof this.surfacemesh !== 'undefined') {
                this.tr.scene.remove( this.surfacemesh );
            }

            this.cmap = field;

            //Create surface mesh
            this.cluster = new THREE.Geometry();

            var start = (new Date()).getTime();
            var result = this.SurfaceNets(field.data,field.dims,field.level);
            var end = (new Date()).getTime();

            this.cluster.vertices.length = 0;
            this.cluster.faces.length = 0;

            for(var i=0; i<result.vertices.length; ++i) {
                var v = result.vertices[i];
                var z=0.5;
                this.cluster.vertices.push(new THREE.Vector3(v[0]*z, v[1]*z, v[2]*z));
            }

            for(var i=0; i<result.faces.length; ++i) {
                var f = result.faces[i];
                if(f.length === 3) {
                    this.cluster.faces.push(new THREE.Face3(f[0], f[1], f[2]));
                } else if(f.length === 4) {
                    this.cluster.faces.push(new THREE.Face4(f[0], f[1], f[2], f[3]));
                } else {
                    //Polygon needs to be subdivided
                }
            }
        
            var cb = new THREE.Vector3(), ab = new THREE.Vector3();
            cb.crossSelf=function(a){
                var b=this.x,c=this.y,d=this.z;
                this.x=c*a.z-d*a.y;
                this.y=d*a.x-b*a.z;
                this.z=b*a.y-c*a.x;
                return this;
            };
    
            for (var i=0; i<this.cluster.faces.length; ++i) {
                var f = this.cluster.faces[i];
                var vA = this.cluster.vertices[f.a];
                var vB = this.cluster.vertices[f.b];
                var vC = this.cluster.vertices[f.c];
                cb.subVectors(vC, vB);
                ab.subVectors(vA, vB);
                cb.crossSelf(ab);
                cb.normalize();
                f.normal.copy(cb)
            }

            this.cluster.verticesNeedUpdate = true;
            this.cluster.elementsNeedUpdate = true;
            this.cluster.normalsNeedUpdate = true;

            this.cluster.computeBoundingBox();
            this.cluster.computeBoundingSphere();

            // toon shader
            var material = new THREE.ShaderMaterial({
                uniforms: { 
                    coeficient: {type: 'f', value: 1.0},
                    power: {type: 'f', value: 2},
                    glowColor: {type: 'c', value: new THREE.Color('black')},
                    glowColor2: {type: 'c', value: new THREE.Color('red')},
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
                                    'uniform vec3 glowColor2;',
                                    'uniform float coeficient;',
                                    'uniform float power;',
                                    'varying vec3 vVertexNormal;',
                                    'varying vec3 vVertexWorldPosition;',
                                    'varying vec4 vFragColor;',
                                    'void main(){',
                                    '  vec3 worldCameraToVertex= vVertexWorldPosition - cameraPosition;',
                                    '  vec3 viewCameraToVertex = (viewMatrix * vec4(worldCameraToVertex, 0.0)).xyz;',
                                    '  viewCameraToVertex = normalize(viewCameraToVertex);',
                                    '  float intensity = pow(coeficient + dot(vVertexNormal, viewCameraToVertex), power);',
                                    '   intensity=(intensity>0.33)?((intensity>0.66)?1.0:0.33):0.0;',
                                    '  gl_FragColor = vec4(glowColor*(intensity)+glowColor2*(1.0-intensity), 1.0);',
                                    '}',
                                ].join('\n')
            });
            this.surfacemesh=new THREE.Mesh( this.cluster, material );
            this.tr.scene.add( this.surfacemesh );

            // hack
            this.surfacemesh.position.x = -field.dims[0]/4.0;
            this.surfacemesh.position.y = -field.dims[1]/4.0;
            this.surfacemesh.position.z = -field.dims[2]/4.0;
        };
}

