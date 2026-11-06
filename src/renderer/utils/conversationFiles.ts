import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Nodes } from 'mdast';
import type { Message } from '@/types/chat';
import { deriveTurnFileEdits, type TurnFileEditStatus } from './turnFileEdits';
import { resolveAgainstWorkspace, resolveFileActionTarget, resolveFileLinkTarget, type FileActionTarget } from './workspaceFileLinks';
import { normalizeWorkspacePathIdentity } from '../../shared/workspacePath';

export interface ConversationFile {
  identity: string;
  target: FileActionTarget;
  displayPath: string;
  messageId: string;
  status: TurnFileEditStatus | 'linked';
}

const parser = unified().use(remarkParse).use(remarkGfm);
const parsedLinks = new WeakMap<object, { source: string; links: string[] }>();

function localLinks(owner: object, source: string): string[] {
  const cached = parsedLinks.get(owner);
  if (cached?.source === source) return cached.links;
  const root = parser.parse(source);
  const definitions = new Map<string, string>();
  const links: string[] = [];
  const references: string[] = [];
  const visit = (node: Nodes) => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    if (node.type === 'link' || node.type === 'image') links.push(node.url);
    if (node.type === 'linkReference' || node.type === 'imageReference') references.push(node.identifier);
    if ('children' in node) node.children.forEach(visit);
  };
  visit(root);
  for (const reference of references) {
    const url = definitions.get(reference);
    if (url) links.push(url);
  }
  parsedLinks.set(owner, { source, links });
  return links;
}

/** A view of loaded transcript records, never a filesystem index or acceptance. */
export function deriveConversationFiles(messages: readonly Message[], workspacePath: string | null): ConversationFile[] {
  const files = new Map<string, ConversationFile>();
  const retired = new Set<string>();
  const identityOf = (target: FileActionTarget) => normalizeWorkspacePathIdentity(
    target.scope === 'workspace' ? resolveAgainstWorkspace(target.path, workspacePath) ?? target.path : target.path,
  );
  const add = (target: FileActionTarget, messageId: string, status: ConversationFile['status']) => {
    const identity = identityOf(target);
    if (status === 'linked' && retired.has(identity)) return;
    if (status !== 'linked') retired.delete(identity);
    const previous = files.get(identity);
    files.delete(identity);
    files.set(identity, {
      identity, target, displayPath: target.path, messageId,
      // A later prose reference cannot turn a deletion into a successful file.
      status: status === 'linked' && previous ? previous.status : status,
    });
  };
  for (const message of messages) {
    if (message.role !== 'assistant' || message.messageKind === 'diagnostic' || message.presentationNotice) continue;
    const blocks = typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : message.content;
    for (const block of blocks) {
      const edits = deriveTurnFileEdits([block], workspacePath);
      for (const file of edits?.files ?? []) {
        if (file.originalPath) {
          const original = resolveFileActionTarget(resolveAgainstWorkspace(file.originalPath, workspacePath) ?? file.originalPath, workspacePath);
          if (original) {
            const identity = identityOf(original);
            files.delete(identity); retired.add(identity);
          }
        }
        add(file.actionTarget, message.id, file.status);
      }
      if (block.type === 'text' && block.text) {
        for (const href of localLinks(typeof message.content === 'string' ? message : block, block.text)) {
          const target = resolveFileLinkTarget(href, workspacePath);
          if (target) add(target, message.id, 'linked');
        }
      }
    }
  }
  return [...files.values()].reverse();
}
