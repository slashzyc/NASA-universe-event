import { searchWindows } from './analysis.js';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,result:searchWindows(data.sites,data.settings)});}catch(error){self.postMessage({id:data.id,error:error.message});}};
