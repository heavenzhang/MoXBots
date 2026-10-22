import Original from './OriginalExecutionStatusBar';
import Enhanced from '@/components/agent-status/ExecutionStatusBar';
import {useComparison} from './fixtureContext';
export default function StatusbarBridge(props:any){return useComparison()?.enhanced?<Enhanced {...props}/>:<Original {...props}/>}
