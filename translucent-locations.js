'use strict';

export default class TranslucentLocations {

    tr = null;
    locations = [];

    renderLocations =  () => {
        // Add stereotaxic coordinates as spheres
        const geom = new THREE.SphereGeometry(1,16,16);
        const color = 0xff0000;
        let j;
        for(j = 0; j < this.locations.length; j++) {
            const x = this.locations[j][0];
            const y = this.locations[j][1];
            const z = this.locations[j][2];
            const sph = new THREE.Mesh( geom, new THREE.MeshLambertMaterial({color: color}));
            sph.position.x=parseFloat(x)*0.14;
            sph.position.y=parseFloat(y)*0.14+3;
            sph.position.z=parseFloat(z)*0.14-2;
            this.tr.scene.add(sph);
        }

    };
    // init the scene
    init = async (pars) => {
        const { elemId } = pars;
        this.tr = new Translucent();
        if(typeof pars.locations !== 'undefined') {
            this.locations = pars.locations;
        }
        await this.tr.init(pars);
        this.renderLocations();
    };
};