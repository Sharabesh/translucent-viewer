'use strict';

function TranslucentLocations() {
    var me = {
        tr: null,
        locations: [],
        renderLocations: function renderLocations() {
            // Add stereotaxic coordinates as spheres
            const geom = new THREE.SphereGeometry(1,16,16);
            const color = 0xff0000;
            let j;
            for(j = 0; j < me.locations.length; j++) {
                const x = me.locations[j][0];
                const y = me.locations[j][1];
                const z = me.locations[j][2];
                const sph = new THREE.Mesh( geom, new THREE.MeshLambertMaterial({color: color}));
                sph.position.x=parseFloat(x)*0.14;
                sph.position.y=parseFloat(y)*0.14+3;
                sph.position.z=parseFloat(z)*0.14-2;
                me.tr.scene.add(sph);
            }

        },
        // init the scene
        init: async function init(pars) {
            var {elemId} = pars;
            me.tr = new Translucent();
            if(typeof pars.locations !== 'undefined') {
                me.locations = pars.locations;
            }
            await me.tr.init(pars);
            me.renderLocations();
        }
    };
    return me;
}

module.exports = TranslucentLocations;