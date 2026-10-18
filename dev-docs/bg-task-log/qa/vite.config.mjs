import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[tailwindcss()],esbuild:{jsx:'automatic'},resolve:{alias:[{find:'@',replacement:root+'src/renderer'},{find:/^chartjs-umd-source(?=$|\?)/,replacement:root+'node_modules/chart.js/dist/chart.umd.js'},{find:/^d3-umd-source(?=$|\?)/,replacement:root+'node_modules/d3/dist/d3.min.js'},{find:/^lucide-umd-source(?=$|\?)/,replacement:root+'node_modules/lucide/dist/umd/lucide.min.js'}]},define:{__MYAGENTS_BUILD_PROFILE__:JSON.stringify('moxbot'),__MYAGENTS_UPDATER_QA__:false,__MYAGENTS_MODEL_QA__:false},server:{host:'127.0.0.1',port:5273,strictPort:true,fs:{allow:[root]}}});
