import {defineConfig,mergeConfig} from 'vite';
import base from '../../../vite.config.ts';
import {fileURLToPath} from 'node:url';
import {copyFileSync} from 'node:fs';
const here=fileURLToPath(new URL('.',import.meta.url));
const config=mergeConfig(base,defineConfig({
 root:here,cacheDir:here+'.vite-cache',
 optimizeDeps:{exclude:['chartjs-umd-source','d3-umd-source','lucide-umd-source']},
 resolve:{alias:[
  {find:'../agent-status/ExecutionStatusBar',replacement:here+'StatusbarBridge.tsx'},
  {find:'@/hooks/useWorkspaceFileService',replacement:here+'fileService.ts'},
  {find:'@/hooks/useBrowserResourceReady',replacement:here+'browserResource.ts'},
 ]},
 server:{host:'127.0.0.1',port:4352,strictPort:true,proxy:{},fs:{allow:[here,fileURLToPath(new URL('../../../',import.meta.url))]}},
 build:{outDir:here+'dist',emptyOutDir:true,rollupOptions:{input:here+'index.html'}},
}));

config.resolve.alias=[
{find:'../agent-status/ExecutionStatusBar',replacement:here+'StatusbarBridge.tsx'},
{find:'@/hooks/useWorkspaceFileService',replacement:here+'fileService.ts'},
{find:'@/hooks/useBrowserResourceReady',replacement:here+'browserResource.ts'},
...base.resolve.alias];
config.plugins.push({name:'prototype-static-assets',closeBundle(){for(const name of ['moxbots-icon.png','sample-attachment.png'])copyFileSync(here+name,here+'dist/'+name)}});
export default config;