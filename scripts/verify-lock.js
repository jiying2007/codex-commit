'use strict';
const fs=require('fs');
if(!fs.existsSync('package-lock.json')){
 console.error('package-lock.json is required for a reproducible official release. Generate it with npm install --package-lock-only, review it, and commit it.');
 process.exit(2);
}
const pkg=require('../package.json');
const lock=require('../package-lock.json');
const root=lock.packages&&lock.packages[''];
if(!root||JSON.stringify(root.devDependencies)!==JSON.stringify(pkg.devDependencies)){
 console.error('package-lock.json root devDependencies do not match package.json.');
 process.exit(3);
}
console.log('package-lock.json verified.');
