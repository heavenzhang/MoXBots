import type {ComponentProps} from 'react';
import Original from './OriginalExecutionStatusBar';
import Enhanced from '@/components/agent-status/ExecutionStatusBar';
import {useComparison} from './fixtureContext';
export default function StatusbarBridge(props:ComponentProps<typeof Enhanced>){return useComparison()?.enhanced?<Enhanced {...props}/>:<Original {...props}/>}
