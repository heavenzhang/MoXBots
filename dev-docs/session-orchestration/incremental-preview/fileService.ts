const service={isAvailable:true,
 listSlashCommands:async()=>({success:true,commands:[]}),
 searchFilesPage:async()=>({items:[],hasMore:false}),
 searchFiles:async()=>({items:[{path:'specs/会话交互.md',name:'会话交互.md',type:'file'}],hasMore:false}),
 listFiles:async()=>({files:[],hasMore:false}),
 importBase64Files:async()=>({success:true,files:[]}),addGitignore:async()=>({success:true}),
 prepareUserImageAttachments:async()=>({attachments:[],errors:[]}),copyPaths:async()=>({success:true,copiedFiles:[]}),
};
export const useWorkspaceFileService=()=>service;
