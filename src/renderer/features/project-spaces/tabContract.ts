import type { TabBase } from '@/tab-workspace/contracts';
/** A project display surface; execution remains with each original Session. */
export interface ProjectSpaceTab extends TabBase<'projectspace'> { projectSpaceId: string }
