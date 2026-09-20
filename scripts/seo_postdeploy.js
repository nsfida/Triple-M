#!/usr/bin/env node
'use strict';
const {spawnSync}=require('child_process');
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
run([require.resolve('./audit_live_seo.js')]);
run([require.resolve('./submit_indexnow.js'),'--all']);
console.log('Post-deploy SEO checks and IndexNow submission completed.');
