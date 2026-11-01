// Only the isolated browser fixture uses these synthetic transports.
export * from '../project-board-validation/mock';
import {tasks} from '../project-board-validation/mock';
export async function taskCreateDirect(input) { const task={...tasks[0],...input,id:'converted',status:'todo',sessionIds:[]};tasks.push(task);return task; }
export async function taskAppendSession(id,sessionId) { const task=tasks.find(t=>t.id===id);task.sessionIds.push(sessionId);return task; }
