'use strict';

function TranslucentCluster() {
    var me = {
        tr: null, // translucent brain
        cmap: {
            dims: []
        },
        flagDataLoaded: null,
        createEmptyData: async function createEmptyData(dim) {
            const data = new Float32Array(dim[0]*dim[1]*dim[2]);
            let i;
            for(i=0;i<dim[0]*dim[1]*dim[2];i++) {
                data[i] = 0;
            }
            me.cmap={data:data, dims:dim, level:0.1};
            me.updateMesh(me.cmap);
            me.flagDataLoaded=true;
        },
        createTestData: async function createTestData(path) {
            var m = new MRI();
            await m.init();
            await m.loadMRIFromPath(path);
            me.cmap={data:m.data, dims:m.dim, level:0.06};
            me.updateMesh(me.cmap);
            me.flagDataLoaded=true;
        },
        cube_edges: new Int32Array(24),
        edge_table: new Int32Array(256),
        configureCubeEdges: function configureCubeEdges() {
            var k = 0;
            for(var i=0; i<8; ++i) {
                for(var j=1; j<=4; j<<=1) {
                    var p = i^j;
                    if(i <= p) {
                        me.cube_edges[k++] = i;
                        me.cube_edges[k++] = p;
                    }
                }
            }
            for(var i=0; i<256; ++i) {
                var em = 0;
                for(var j=0; j<24; j+=2) {
                    var a = !!(i & (1<<me.cube_edges[j]));
                    var b = !!(i & (1<<me.cube_edges[j+1]));
                    em |= a !== b ? (1 << (j >> 1)) : 0;
                }
                me.edge_table[i] = em;
            }
        },
        buffer: new Int32Array(4096),
        SurfaceNets: function SurfaceNets(data, dims, level) { 
            var vertices = [];
            var faces = [];
            var n = 0;
            var x = new Int32Array(3);
            var R = new Int32Array([1, (dims[0]+1), (dims[0]+1)*(dims[1]+1)]);
            var grid = new Float32Array(8);
            var buf_no = 1;

            if(R[2] * 2 > me.buffer.length)
                me.buffer = new Int32Array(R[2] * 2);

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
                    var edge_mask = me.edge_table[mask];
                    var v = [0.0,0.0,0.0];
                    var e_count = 0;
                    for(var i=0; i<12; ++i) {
                        if(!(edge_mask & (1<<i)))
                            continue;
                        ++e_count;
                        var e0 = me.cube_edges[ i<<1 ]; // Unpack vertices
                        var e1 = me.cube_edges[(i<<1)+1];
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
                    me.buffer[m] = vertices.length;
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
                            faces.push([me.buffer[m], me.buffer[m-du-dv], me.buffer[m-du]]);
                            faces.push([me.buffer[m], me.buffer[m-dv], me.buffer[m-du-dv]]);
                        }
                        else {
                            faces.push([me.buffer[m], me.buffer[m-du-dv], me.buffer[m-dv]]);
                            faces.push([me.buffer[m], me.buffer[m-du], me.buffer[m-du-dv]]);
                        }
                    }
                }
            }
            return {
                vertices: vertices,
                faces: faces
            };
        },
        cluster:{
            vertices: [],
            faces: []
        },
        surfacemesh:null,
        updateMesh: async function updateMesh(field) {
            if(typeof me.surfacemesh !== 'undefined') {
                me.tr.scene.remove( me.surfacemesh );
            }

            me.cmap = field;

            //Create surface mesh
            me.cluster = new THREE.Geometry();

            var start = (new Date()).getTime();
            var result = me.SurfaceNets(field.data,field.dims,field.level);
            var end = (new Date()).getTime();

            me.cluster.vertices.length = 0;
            me.cluster.faces.length = 0;

            for(var i=0; i<result.vertices.length; ++i) {
                var v = result.vertices[i];
                var z=0.5;
                me.cluster.vertices.push(new THREE.Vector3(v[0]*z, v[1]*z, v[2]*z));
            }

            for(var i=0; i<result.faces.length; ++i) {
                var f = result.faces[i];
                if(f.length === 3) {
                    me.cluster.faces.push(new THREE.Face3(f[0], f[1], f[2]));
                } else if(f.length === 4) {
                    me.cluster.faces.push(new THREE.Face4(f[0], f[1], f[2], f[3]));
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
    
            for (var i=0; i<me.cluster.faces.length; ++i) {
                var f = me.cluster.faces[i];
                var vA = me.cluster.vertices[f.a];
                var vB = me.cluster.vertices[f.b];
                var vC = me.cluster.vertices[f.c];
                cb.subVectors(vC, vB);
                ab.subVectors(vA, vB);
                cb.crossSelf(ab);
                cb.normalize();
                f.normal.copy(cb)
            }

            me.cluster.verticesNeedUpdate = true;
            me.cluster.elementsNeedUpdate = true;
            me.cluster.normalsNeedUpdate = true;

            me.cluster.computeBoundingBox();
            me.cluster.computeBoundingSphere();

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
            me.surfacemesh=new THREE.Mesh( me.cluster, material );
            me.tr.scene.add( me.surfacemesh );

            // hack
            me.surfacemesh.position.x = -field.dims[0]/4.0;
            me.surfacemesh.position.y = -field.dims[1]/4.0;
            me.surfacemesh.position.z = -field.dims[2]/4.0;
        },
        // init the scene
        init: async function init(pars) {
            var {elemId} = pars;
            me.tr = new Translucent();
            await me.tr.init(pars);
            me.configureCubeEdges();
//            await me.createTestData('http://localhost/translucent-viewer/demo-data/1.average-phir.nii.gz');
        }
    };
    return me;
}
module.exports = TranslucentCluster;
