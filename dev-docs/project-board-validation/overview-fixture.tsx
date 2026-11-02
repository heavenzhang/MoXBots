
import {createRoot} from 'react-dom/client';
import {i18n} from '@/i18n';
import {ThemeRuntimeProvider} from '@/theme/ThemeRuntime';
import '@/index.css';

import ProjectBoard from '@/pages/ProjectBoard';

await i18n.changeLanguage('zh-CN');
window.boardCalls=[];
window.boardFailAction=false;
window.boardFailRead=false;

function Fixture(){return <div style={{height:'100vh'}}><ProjectBoard workspacePath='/synthetic/alpha'/></div>}
createRoot(document.getElementById('root')).render(<ThemeRuntimeProvider selection={{themeId:'myagents-light',appearanceMode:window.location.search.includes('light')?'light':'dark'}}><Fixture/></ThemeRuntimeProvider>);
