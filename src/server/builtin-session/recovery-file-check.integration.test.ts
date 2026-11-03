import {mkdtemp,writeFile,symlink,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect} from 'vitest';
import {checkRecoveryFile} from './recovery-file-check';
it('checks actual bytes without changing files and handles missing/different/outside/symlink/oversize targets',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mox-recovery-file-'));
 try{
  const workspace=join(root,'workspace');await mkdir(workspace);const file=join(workspace,'result.txt');
  const input={file_path:file,content:'原来的完整内容'};await writeFile(file,input.content);
  expect(await checkRecoveryFile(workspace,'Write',input)).toMatchObject({kind:'file_matches'});
  expect(await readFile(file,'utf8')).toBe(input.content);
  await writeFile(file,'later edit');expect(await checkRecoveryFile(workspace,'Write',input)).toEqual(expect.objectContaining({kind:'file_differs'}));
  expect((await checkRecoveryFile(workspace,'Write',{...input,file_path:join(workspace,'missing')})).kind).toBe('file_missing');
  const outside=join(root,'private');await writeFile(outside,'sensitive');
  expect((await checkRecoveryFile(workspace,'Write',{...input,file_path:outside})).kind).toBe('file_outside_workspace');
  const link=join(workspace,'link');await symlink(outside,link);
  expect((await checkRecoveryFile(workspace,'Write',{...input,file_path:link})).kind).toBe('file_unavailable');
  await writeFile(file,Buffer.alloc(2*1024*1024+1));expect((await checkRecoveryFile(workspace,'Write',input)).kind).toBe('file_unavailable');
  expect((await checkRecoveryFile(workspace,'Bash',{command:'cat secret'})).kind).toBe('external_check_required');
 }finally{await rm(root,{recursive:true,force:true});}
});
